import { BASE_PLOTS, HISTORIC_LANDMARKS, MODULES, WORLD_VERSION } from './content.js';
import { advanceProduction, initialCareer, placementReason, reduceCareer } from './model.js';
import { CareerRepository, validateCheckpoint } from './repository.js';
import { BaseWorld } from './baseWorld.js';
import { PLANET_PROFILES } from '../flight/planetProfiles.js';
import { getMarsHeight } from '../terrain/noise.js';
import { CLOUD_CONFIGURED, CloudSyncCoordinator, mergeMonotonic, SupabaseCareerAdapter } from './cloud.js';

const FLIGHT_PHASES = { ON_PAD: 'ON_PAD', LANDED: 'LANDED', ORBIT: 'ORBIT' };

const commandId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

export function captureCheckpoint(engine, now = Date.now()) {
  const physics = engine.missionPhysics;
  if (!['mars', 'earth', 'moon'].includes(physics.planetId)) return null;
  if (![FLIGHT_PHASES.ON_PAD, FLIGHT_PHASES.LANDED, FLIGHT_PHASES.ORBIT].includes(physics.phase)) return null;
  if (engine.journey?.active || engine.tankerOps?.active || physics.yardControl) return null;
  const vector = value => ({ x: value.x, y: value.y, z: value.z });
  return validateCheckpoint({
    worldVersion: WORLD_VERSION, frame: physics.phase === FLIGHT_PHASES.ORBIT ? 'orbit' : 'surface',
    planet: physics.planetId, destination: physics.destination || 'earth', phase: physics.phase,
    mode: engine.mode, at: now,
    ship: { position: vector(physics.position), velocity: vector(physics.velocity), fuel: physics.starshipFuel,
      boosterFuel: physics.boosterFuel, boosterState: physics.boosterState, autoMission: physics.autoMission },
    rover: { position: vector(engine.physics.position), yaw: engine.physics.yaw },
    walker: { position: vector(engine.walker.position), yaw: engine.walker.yaw }
  });
}

export function restoreCheckpoint(engine, checkpoint) {
  validateCheckpoint(checkpoint);
  const physics = engine.missionPhysics;
  physics.setPlanet(checkpoint.planet);
  physics.resetToPad();
  physics.phase = checkpoint.phase;
  physics.position.set(checkpoint.ship.position.x, checkpoint.ship.position.y, checkpoint.ship.position.z);
  physics.velocity.set(checkpoint.ship.velocity.x, checkpoint.ship.velocity.y, checkpoint.ship.velocity.z);
  physics.starshipFuel = checkpoint.ship.fuel;
  physics.boosterFuel = checkpoint.ship.boosterFuel ?? 100;
  physics.autoMission = Boolean(checkpoint.ship.autoMission);
  physics.setDestination(checkpoint.destination);
  if (checkpoint.phase !== FLIGHT_PHASES.ON_PAD) {
    engine.starship.setMated(false);
    physics.boosterState = checkpoint.ship.boosterState || 'LEFT_BEHIND';
    engine.starship.boosterGroup.visible = physics.boosterState !== 'LEFT_BEHIND';
  }
  physics.altitude = Math.max(0, physics.position.y - physics.padElevation);
  physics.speed = physics.velocity.length();
  physics.horizontalSpeed = Math.hypot(physics.velocity.x, physics.velocity.z);
  physics.verticalSpeed = physics.velocity.y;
  physics.arrivalOrbit = checkpoint.phase === FLIGHT_PHASES.ORBIT;
  engine.physics.position.set(checkpoint.rover.position.x, checkpoint.rover.position.y, checkpoint.rover.position.z);
  engine.physics.velocity.set(0, 0, 0);
  engine.physics.yaw = checkpoint.rover.yaw || 0;
  if (checkpoint.walker) {
    engine.walker.position.set(checkpoint.walker.position.x, checkpoint.walker.position.y, checkpoint.walker.position.z);
    engine.walker.yaw = checkpoint.walker.yaw || 0;
  }
  engine.journey.reset();
  engine.journey.setPlanet(checkpoint.planet);
  engine.applyPlanetEnvironment(checkpoint.planet);
  engine.operations.reset();
  engine.setTimeScale(1);
  engine.setMode(checkpoint.phase === FLIGHT_PHASES.ORBIT ? 'starship' :
    ['walking', 'rover'].includes(checkpoint.mode) ? checkpoint.mode : 'starship');
  engine.cameraController.resetGimbal();
  return checkpoint;
}

export class CareerController {
  constructor(engine, namespace = 'guest') {
    this.engine = engine;
    this.repository = new CareerRepository(namespace);
    this.guestRepository = this.repository;
    this.cloudStatus = CLOUD_CONFIGURED ? 'Local Only' : 'Local Only';
    this.cloudCandidate = null;
    this.cloud = null;
    this.state = initialCareer();
    this.listeners = new Set();
    this.queue = Promise.resolve();
    this.notice = '';
    this.saveStatus = 'Loading';
    this.placement = null;
    this.elapsed = 0;
    this.checkpointElapsed = 0;
    this.lastPhase = engine.missionPhysics.phase;
    this.lastBooster = engine.missionPhysics.boosterState;
    this.lastTanker = engine.tankerOps?.phase;
    this.lastRoverMeters = 0;
  }

  async init() {
    const loaded = await this.repository.load();
    if (loaded.state) this.state = loaded.state;
    this.notice = loaded.warning || '';
    this.saveStatus = loaded.state ? (this.repository.storageError ? 'Storage unavailable' : 'Saved locally') : 'Read-only save';
    this.world = new BaseWorld(this.engine.scene, this.engine.missionPhysics.padCoords);
    this.world.sync(this.state);
    this.engine.career = this;
    this.bindRepository(this.repository);
    this.productionTimer = setInterval(() => this.tickProduction(), 10_000);
    this.syncTimer = setInterval(() => { if (this.cloud?.accountId && ['Sync Pending', 'Offline', 'Sync Failed'].includes(this.cloudStatus) && !this.cloudCandidate) this.syncNow(); }, 30_000);
    await this.tickProduction();
    this.notify();
    if (CLOUD_CONFIGURED) this.resumeAccountSession().catch(error => {
      this.cloudStatus = globalThis.navigator?.onLine === false ? 'Offline' : 'Sync Failed';
      this.notice = `Account session could not be checked: ${error.message}`;
      this.notify();
    });
    return this;
  }

  subscribe(listener) { this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener); }
  bindRepository(repository) {
    if (!repository.channel) return;
    repository.channel.onmessage = async () => {
      if (this.repository !== repository) return;
      try {
        const latest = await repository.load();
        if (latest.state && (latest.state.generation !== this.state.generation || latest.state.revision > this.state.revision)) {
          this.state = latest.state; this.world?.sync(this.state); this.notify();
        }
      } catch (error) { this.notice = error.message; this.notify(); }
    };
  }
  snapshot() { return { state: this.state, notice: this.notice, saveStatus: this.saveStatus, placement: this.placement,
    cloudStatus: this.cloudStatus, cloudCandidate: this.cloudCandidate, cloudConfigured: CLOUD_CONFIGURED,
    accountEmail: this.cloudCandidate?.user.email || this.accountEmail || null }; }
  notify() { for (const listener of this.listeners) listener(this.snapshot()); }

  async perform(mutator) {
    const work = async () => {
      if (this.repository.readOnly) { this.notice = 'This save uses an unsupported or corrupt format. It has not been overwritten; use a compatible game build.'; this.notify(); return { error: this.notice }; }
      this.saveStatus = 'Saving…'; this.notify();
      try {
        const result = await this.repository.transact(mutator);
        if (result.changed) {
          this.state = result.state;
          this.world?.sync(this.state);
          this.notice = result.notices?.join(' · ') || '';
          clearTimeout(this.noticeTimer);
          if (this.notice) {
            const message = this.notice;
            this.noticeTimer = setTimeout(() => { if (this.notice === message) { this.notice = ''; this.notify(); } }, 6000);
          }
          if (this.cloud?.accountId) this.scheduleSync();
        } else if (result.error) this.notice = result.error;
        this.saveStatus = this.repository.storageError ? 'Storage unavailable' : 'Saved locally';
        this.notify();
        return result;
      } catch (error) {
        this.saveStatus = 'Save failed'; this.notice = error.message || 'Could not save progress.'; this.notify();
        return { error: this.notice };
      }
    };
    this.queue = this.queue.then(work, work);
    return this.queue;
  }

  dispatch(action) { return this.perform(current => reduceCareer(current, { ...action, commandId: action.commandId || commandId() })); }
  event(kind, properties = {}) {
    const runId = this.state.mission.runId;
    const key = properties.key || `${runId}:${kind}:${properties.planet || ''}`;
    if (this.state.eventKeys.includes(key)) return Promise.resolve({ duplicate: true });
    return this.dispatch({ type: 'event', event: { kind, key, runId, ...properties } });
  }
  tickProduction() { return this.perform(current => advanceProduction(current, Date.now())); }

  validatePlot(type, plotId) {
    const plot = BASE_PLOTS.find(item => item.id === plotId);
    if (!plot) return 'Choose a marked Ares expansion plot.';
    const x = this.engine.missionPhysics.padCoords.x + plot.x;
    const z = this.engine.missionPhysics.padCoords.y + plot.z;
    const center = getMarsHeight(x, z);
    const slope = Math.max(...[[11, 0], [-11, 0], [0, 11], [0, -11]].map(([dx, dz]) => Math.abs(getMarsHeight(x + dx, z + dz) - center)));
    if (slope > 3) return 'Terrain slope exceeds the 3 m plot limit.';
    // Plots are surveyed clear of the launch and recovery complex. Check the
    // current obstacle map too, so future layout edits cannot create overlap.
    const point = { x, y: center + 1, z };
    const hit = this.engine.obstacles?.resolve?.(point, 12, 1, 18);
    if (hit) return 'Protected Starbase structure or route overlaps this plot.';
    return placementReason(this.state, type, plotId);
  }

  startPlacement(type) {
    if (!MODULES[type]) return;
    this.placement = { type, plotId: null, rotation: 0, reason: 'Tap a plot marker or choose a plot below.' };
    this.world.setPlacement(this.placement, this.state); this.notify();
  }
  selectPlot(plotId) {
    if (!this.placement) return;
    this.placement = { ...this.placement, plotId, reason: this.validatePlot(this.placement.type, plotId) };
    this.world.setPlacement(this.placement, this.state); this.notify();
  }
  rotatePlacement() {
    if (!this.placement) return;
    this.placement = { ...this.placement, rotation: (this.placement.rotation + 1) % 4 };
    this.world.setPlacement(this.placement, this.state); this.notify();
  }
  cancelPlacement() { this.placement = null; this.world.setPlacement(null, this.state); this.notify(); }
  async confirmPlacement() {
    if (!this.placement?.plotId) return { error: 'Select a plot first.' };
    const reason = this.validatePlot(this.placement.type, this.placement.plotId);
    if (reason) { this.placement = { ...this.placement, reason }; this.notify(); return { error: reason }; }
    const result = await this.dispatch({ type: 'build', moduleType: this.placement.type, plotId: this.placement.plotId, rotation: this.placement.rotation });
    if (!result.error) this.cancelPlacement();
    return result;
  }
  pickWorldPlot(raycaster) { const plot = this.world?.pick(raycaster); if (plot) this.selectPlot(plot); return Boolean(plot); }

  pollEngine(dt) {
    this.elapsed += dt;
    this.checkpointElapsed += dt;
    if (this.elapsed < .75) return;
    this.elapsed = 0;
    const engine = this.engine, physics = engine.missionPhysics;
    if (this.world) this.world.root.visible = physics.planetId === 'mars';
    if (engine.mode === 'walking' && !this.state.evidence.eva) this.event('eva', { key: 'eva:first' });
    const roverMeters = Math.floor(engine.physics.distanceTraveled || 0);
    if (roverMeters >= 500 && this.state.evidence.roverMeters < 500 && roverMeters !== this.lastRoverMeters)
      this.event('rover_scout', { key: 'rover:500m', meters: roverMeters });
    this.lastRoverMeters = roverMeters;
    if (physics.planetId === 'mars' && ['rover', 'walking', 'roadster'].includes(engine.mode)) {
      const position = engine.mode === 'walking' ? engine.walker.position : engine.mode === 'roadster' ? engine.activeCar?.group.position : engine.physics.position;
      if (position) for (const landmark of engine.scatter.monumentCatalog) {
        if (!HISTORIC_LANDMARKS.includes(landmark.id) || this.state.discoveries.includes(landmark.id)) continue;
        if (Math.hypot(position.x - landmark.position.x, position.z - landmark.position.z) < 28)
          this.event('landmark', { key: `landmark:${landmark.id}`, landmarkId: landmark.id, name: landmark.name });
      }
    }
    if (physics.phase !== this.lastPhase) {
      if (physics.phase === FLIGHT_PHASES.ORBIT && physics.planetId !== 'gargantua') {
        const profile = PLANET_PROFILES[physics.planetId];
        const circular = Math.sqrt(profile.gravity * profile.radius ** 2 / (profile.radius + Math.max(0, physics.altitude)));
        if (physics.altitude > 1000 && Math.abs(physics.horizontalSpeed - circular) < circular * .15 && Math.abs(physics.verticalSpeed) < 300)
          this.event('orbit', { planet: physics.planetId, assisted: physics.autoMission });
      }
      this.lastPhase = physics.phase;
      this.checkpointElapsed = 60;
    }
    if (physics.phase === FLIGHT_PHASES.LANDED && physics.speed < 5 && (physics.shipCaughtByTower || physics.landingLegsDeployed))
      this.event('landing', { planet: physics.planetId, assisted: physics.autoMission });
    if (physics.boosterState !== this.lastBooster) {
      if (physics.boosterState === 'CAUGHT') this.event('booster', { planet: physics.planetId, assisted: physics.autoMission });
      this.lastBooster = physics.boosterState;
    }
    if (engine.tankerOps?.phase !== this.lastTanker) {
      if (engine.tankerOps?.phase === 'complete' && engine.tankerOps.transferredKg > 0)
        this.event('refuel', { planet: physics.planetId, assisted: physics.autoMission });
      this.lastTanker = engine.tankerOps?.phase;
    }
    if (this.checkpointElapsed >= 30) {
      this.checkpointElapsed = 0;
      const checkpoint = captureCheckpoint(engine);
      if (checkpoint) this.dispatch({ type: 'checkpoint', checkpoint });
    }
  }

  async continueMission() {
    const checkpoint = this.state.mission.checkpoint;
    if (!checkpoint) return { error: 'No supported checkpoint has been saved yet.' };
    try { restoreCheckpoint(this.engine, checkpoint); this.notice = `Resumed ${checkpoint.phase.toLowerCase()} checkpoint on ${checkpoint.planet}.`; this.notify(); return { changed: true }; }
    catch (error) { this.notice = error.message; this.notify(); return { error: error.message }; }
  }
  async startNewMission() {
    this.engine.resetMission();
    return this.dispatch({ type: 'new_mission' });
  }
  async resetAll() {
    await this.queue;
    const fresh = await this.repository.replace(initialCareer());
    this.state = fresh; this.engine.resetMission(); this.world.sync(fresh); this.notice = 'All local career progress reset.'; this.notify();
    if (this.cloud?.accountId) { this.cloud.attach(this.cloud.accountId, fresh.generation, this.cloud.remoteRevision); this.scheduleSync(); }
  }
  async importJson(text) {
    await this.queue;
    const next = await this.repository.importJson(text);
    this.state = next; this.engine.resetMission(); this.world.sync(next); this.notice = 'Import restored. Previous save backed up.'; this.notify();
    if (this.cloud?.accountId) { this.cloud.attach(this.cloud.accountId, next.generation, this.cloud.remoteRevision); this.scheduleSync(); }
  }

  async signIn(email, password, create = false) {
    await this.queue;
    if (!CLOUD_CONFIGURED) throw new Error('Account sync is not configured.');
    this.adapter ||= await SupabaseCareerAdapter.create();
    const user = create ? await this.adapter.signUp(email, password) : await this.adapter.signIn(email, password);
    await this.prepareAccountChoice(user);
  }

  async resumeAccountSession() {
    this.adapter ||= await SupabaseCareerAdapter.create();
    const user = await this.adapter.currentUser();
    if (user && !this.cloudCandidate && !this.cloud?.accountId) await this.prepareAccountChoice(user);
  }

  async prepareAccountChoice(user) {
    const remote = await this.adapter.read(user.id);
    const accountRepo = new CareerRepository(`account:${user.id}`);
    const device = (await accountRepo.load()).state;
    if (!device) throw new Error('This account has an unsupported local save version.');
    this.cloudCandidate = { user: { id: user.id, email: user.email }, remote, device, repository: accountRepo };
    this.cloudStatus = 'Choose Save';
    this.notice = 'Choose which career branch to use. Guest and account saves remain separate.';
    this.notify();
  }

  async chooseAccountBranch(choice, checkpointChoice = 'branch', merge = false) {
    await this.queue;
    const candidate = this.cloudCandidate;
    if (!candidate) throw new Error('Sign in first.');
    if (!['guest', 'device', 'cloud'].includes(choice) || (choice === 'cloud' && !candidate.remote)) throw new Error('Unavailable save branch.');
    const { user, remote, device, repository } = candidate;
    if (remote) await repository.saveExternalBackup('cloud', remote.payload);
    await repository.saveExternalBackup('device', device);
    const guest = (await this.guestRepository.load()).state;
    let chosen = choice === 'guest' ? guest : choice === 'cloud' ? remote.payload : device;
    if (!chosen) throw new Error('Selected save is unavailable.');
    if (merge) {
      for (const other of [guest, device, remote?.payload]) if (other && other !== chosen) chosen = mergeMonotonic(chosen, other);
    }
    const selectedCheckpoint = checkpointChoice === 'device' ? device.mission.checkpoint
      : checkpointChoice === 'cloud' ? remote?.payload.mission.checkpoint : chosen.mission.checkpoint;
    chosen = structuredClone(chosen);
    chosen.mission.checkpoint = selectedCheckpoint || null;
    chosen = await repository.replace(chosen);
    if (this.repository !== this.guestRepository && this.repository !== repository) this.repository.close();
    this.repository = repository;
    this.bindRepository(repository);
    this.state = chosen;
    this.world.sync(chosen);
    this.cloud ||= new CloudSyncCoordinator(this.adapter);
    this.cloud.attach(user.id, chosen.generation, remote?.revision || 0);
    this.accountEmail = user.email;
    this.cloudCandidate = null;
    this.cloudStatus = 'Sync Pending';
    this.notice = `Account career selected: ${choice}.`;
    this.notify();
    this.scheduleSync();
  }

  scheduleSync() {
    if (!this.cloud?.accountId) return;
    this.cloudStatus = 'Sync Pending';
    clearTimeout(this.cloudDebounce);
    this.cloudDebounce = setTimeout(() => this.syncNow(), 2500);
  }
  async syncNow() {
    if (!this.cloud?.accountId || this.cloudCandidate) return;
    const result = await this.cloud.flush(this.repository, this.state);
    this.cloudStatus = result.status;
    if (result.error?.conflict) {
      try {
        const remote = await this.adapter.read(this.cloud.accountId);
        const device = (await this.repository.load()).state;
        this.cloudCandidate = { user: { id: this.cloud.accountId, email: this.accountEmail }, remote, device, repository: this.repository };
        this.notice = 'Cloud save changed. Choose a base branch; both copies were preserved.';
      } catch (error) { this.notice = `Conflict lookup failed: ${error.message}`; }
    } else if (result.error) this.notice = `Sync pending: ${result.error.message}`;
    this.notify();
  }

  async signOut() {
    await this.queue;
    clearTimeout(this.cloudDebounce);
    this.cloud?.detach();
    await this.adapter?.signOut();
    if (this.repository !== this.guestRepository) this.repository.close();
    this.cloudCandidate?.repository?.close();
    this.repository = this.guestRepository;
    this.bindRepository(this.guestRepository);
    this.state = (await this.repository.load()).state;
    this.world.sync(this.state);
    this.cloudCandidate = null;
    this.cloudStatus = 'Local Only'; this.accountEmail = null;
    this.notice = 'Signed out. Guest career is active.';
    this.notify();
  }
  dispose() { clearInterval(this.productionTimer); clearInterval(this.syncTimer); clearTimeout(this.cloudDebounce); clearTimeout(this.noticeTimer); this.world?.dispose(); this.repository.close(); if (this.repository !== this.guestRepository) this.guestRepository.close(); this.cloudCandidate?.repository?.close(); this.listeners.clear(); if (this.engine.career === this) this.engine.career = null; }
}
