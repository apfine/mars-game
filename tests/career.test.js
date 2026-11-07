import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { advanceProduction, baseCapacity, initialCareer, inventoryCapacity, placementReason, reduceCareer } from '../src/progression/model.js';
import { CareerRepository, FutureSaveError, migrateSave, validateSave } from '../src/progression/repository.js';
import { CloudSyncCoordinator, mergeMonotonic } from '../src/progression/cloud.js';
import { captureCheckpoint, restoreCheckpoint } from '../src/progression/controller.js';
import { BASE_PLOTS } from '../src/progression/content.js';
import { StarbaseObstacleSystem } from '../src/flight/solidCollisions.js';
import { getMarsHeight } from '../src/terrain/noise.js';
import * as THREE from 'three';

const now = 1_700_000_000_000;
const step = (state, action, time = now) => {
  const result = reduceCareer(state, action, time);
  assert.equal(result.error, undefined, result.error);
  return result.state;
};
const build = (state, moduleType, plotId, commandId) => step(state, { type: 'build', moduleType, plotId, commandId });

test('surveyed base plots remain level and clear of protected Starbase geometry', () => {
  const obstacles = new StarbaseObstacleSystem(new THREE.Vector2(1400, 1150));
  for (const plot of BASE_PLOTS) {
    const x = 1400 + plot.x, z = 1150 + plot.z, center = getMarsHeight(x, z);
    const slope = Math.max(...[[11, 0], [-11, 0], [0, 11], [0, -11]].map(([dx, dz]) => Math.abs(getMarsHeight(x + dx, z + dz) - center)));
    assert.ok(slope <= 3, plot.id);
    assert.equal(obstacles.resolve(new THREE.Vector3(x, center + 1, z), 12, 1, 18), null, plot.id);
  }
});

test('guest loop: discover, build utilities and greenhouse, harvest, establish habitat, reload', async () => {
  const repo = new CareerRepository(`loop-${Math.random()}`);
  let state = (await repo.load()).state;
  const actions = [
    { type: 'event', event: { kind: 'landmark', key: 'landmark:perseverance_jezero', landmarkId: 'perseverance_jezero', name: 'Perseverance' } },
    { type: 'build', moduleType: 'solar', plotId: 'a1' },
    { type: 'build', moduleType: 'water', plotId: 'a2' },
    { type: 'build', moduleType: 'greenhouse', plotId: 'a3' },
    { type: 'plant', cropId: 'sprout' }
  ];
  for (const action of actions) {
    if (action.type === 'plant') action.buildingId = state.buildings.find(item => item.type === 'greenhouse').id;
    const saved = await repo.transact(current => reduceCareer(current, action, now));
    assert.equal(saved.error, undefined, saved.error);
    state = saved.state;
  }
  const greenhouse = state.buildings.find(item => item.type === 'greenhouse');
  const cycle = greenhouse.crop.id;
  state = (await repo.transact(current => advanceProduction(current, now + 120_001))).state;
  assert.equal(state.buildings.find(item => item.id === greenhouse.id).crop.ready, true);
  state = (await repo.transact(current => reduceCareer(current, { type: 'harvest', buildingId: greenhouse.id, cycleId: cycle }, now + 120_002))).state;
  assert.equal(state.resources.food, 5);
  state = (await repo.transact(current => reduceCareer(current, { type: 'build', moduleType: 'habitat', plotId: 'b1' }, now + 120_003))).state;
  assert.equal(state.objectives.chapter.complete, true);
  assert.ok(state.badges.includes('chapter'));
  assert.ok(state.badges.includes('harvest'));
  assert.equal((await repo.load()).state.buildings.length, 4);
  assert.equal((await repo.load()).state.resources.food, 5);
  assert.match(placementReason(state, 'lab', 'b3'), /Power deficit/);
  state = (await repo.transact(current => reduceCareer(current, { type: 'build', moduleType: 'solar', plotId: 'b2' }, now + 120_004))).state;
  state = (await repo.transact(current => reduceCareer(current, { type: 'build', moduleType: 'lab', plotId: 'b3' }, now + 120_005))).state;
  state = (await repo.transact(current => reduceCareer(current, { type: 'science' }, now + 120_006))).state;
  assert.equal(state.objectives.science.complete, true);
  repo.close();
});

test('build, harvest, and rewards remain idempotent with capacity checks', () => {
  let state = initialCareer(now);
  state = build(state, 'solar', 'a1', 'build-1');
  const afterFirst = state.resources.materials;
  const duplicate = reduceCareer(state, { type: 'build', moduleType: 'solar', plotId: 'a1', commandId: 'build-1' }, now);
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.state.resources.materials, afterFirst);
  state = build(state, 'water', 'a2');
  state = build(state, 'greenhouse', 'a3');
  assert.equal(baseCapacity(state).power, 2);
  const solar = state.buildings.find(item => item.type === 'solar');
  const disabled = reduceCareer(state, { type: 'toggle', buildingId: solar.id }, now);
  assert.match(disabled.error, /deficit/);
  const greenhouse = state.buildings.find(item => item.type === 'greenhouse');
  state = step(state, { type: 'plant', buildingId: greenhouse.id, cropId: 'sprout' });
  state = advanceProduction(state, now + 120_000).state;
  const cycleId = state.buildings.find(item => item.id === greenhouse.id).crop.id;
  state = step(state, { type: 'harvest', buildingId: greenhouse.id, cycleId }, now + 120_001);
  const food = state.resources.food;
  assert.equal(reduceCareer(state, { type: 'harvest', buildingId: greenhouse.id, cycleId }).changed, false);
  assert.equal(state.resources.food, food);
  const full = structuredClone(state);
  full.resources.materials = inventoryCapacity(full) - full.resources.food;
  full.buildings.find(item => item.id === greenhouse.id).crop = { id: 'next', cropId: 'sprout', elapsedMs: 120_000, durationMs: 120_000, lastUpdateMs: now, ready: true };
  assert.match(reduceCareer(full, { type: 'harvest', buildingId: greenhouse.id, cycleId: 'next' }).error, /Inventory full/);
  assert.equal(full.buildings.find(item => item.id === greenhouse.id).crop.ready, true);
});

test('production survives reload, pauses, clock rollback, and ignores flight acceleration', () => {
  let state = initialCareer(now);
  state = build(build(build(state, 'solar', 'a1'), 'water', 'a2'), 'greenhouse', 'a3');
  const greenhouse = state.buildings.find(item => item.type === 'greenhouse');
  state = step(state, { type: 'plant', buildingId: greenhouse.id, cropId: 'tuber' }, now);
  state = advanceProduction(state, now + 60_000).state;
  const oneMinute = state.buildings.find(item => item.id === greenhouse.id).crop.elapsedMs;
  state = advanceProduction(state, now - 60_000).state;
  assert.equal(state.buildings.find(item => item.id === greenhouse.id).crop.elapsedMs, oneMinute);
  state = step(state, { type: 'toggle', buildingId: greenhouse.id }, now + 60_000);
  state = advanceProduction(state, now + 300_000).state;
  assert.equal(state.buildings.find(item => item.id === greenhouse.id).crop.elapsedMs, oneMinute);
  state = step(state, { type: 'toggle', buildingId: greenhouse.id }, now + 300_001);
  state = advanceProduction(state, now + 540_001).state;
  assert.equal(state.buildings.find(item => item.id === greenhouse.id).crop.elapsedMs, 300_000);
  assert.equal(state.buildings.find(item => item.id === greenhouse.id).crop.ready, true);
  assert.equal(state.resources.food, 0, 'ready crops are never auto-harvested');
  let paused = step(state, { type: 'harvest', buildingId: greenhouse.id, cycleId: state.buildings.find(item => item.id === greenhouse.id).crop.id }, now + 540_001);
  paused = step(paused, { type: 'plant', buildingId: greenhouse.id, cropId: 'grain' }, now + 540_002);
  paused = step(paused, { type: 'toggle', buildingId: greenhouse.id }, now + 600_002);
  const beforeReload = structuredClone(paused);
  paused = step(beforeReload, { type: 'toggle', buildingId: greenhouse.id }, now + 5_000_000);
  assert.equal(paused.buildings.find(item => item.id === greenhouse.id).crop.elapsedMs, 60_000,
    'offline disabled time must not count when reenabled without an intermediate tick');
});

test('new mission keeps the career and provides a fresh mission run', () => {
  let state = build(initialCareer(now), 'solar', 'a1');
  state = step(state, { type: 'event', event: { kind: 'landmark', key: 'landmark:curiosity_gale', landmarkId: 'curiosity_gale' } });
  const oldRun = state.mission.runId;
  state = step(state, { type: 'new_mission' });
  assert.notEqual(state.mission.runId, oldRun);
  assert.equal(state.buildings.length, 1);
  assert.ok(state.discoveries.includes('curiosity_gale'));
  assert.ok(state.badges.includes('landmark'));
});

test('migration, unknown versions, invalid imports, and corrupt primary backup', async () => {
  const migrated = migrateSave({ version: 0, resources: { materials: 30, research: 2, food: 1 }, discoveries: ['viking1_chryse'] });
  assert.equal(migrated.resources.materials, 30);
  assert.throws(() => migrateSave({ version: 99 }), FutureSaveError);
  const repo = new CareerRepository(`migration-${Math.random()}`);
  const original = (await repo.load()).state;
  await repo.transact(current => reduceCareer(current, { type: 'name', name: 'Backup test' }));
  const imported = await repo.importJson(repo.exportJson(original));
  assert.notEqual(imported.generation, original.generation);
  await assert.rejects(repo.importJson('{"version":99}'));
  await assert.rejects(repo.importJson(' '.repeat(1_000_001)));
  const db = await repo.dbPromise;
  await new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    tx.objectStore('records').put({ broken: true }, repo.namespace);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  const recovered = await repo.load();
  assert.match(recovered.warning, /backup/);
  validateSave(recovered.state);
  repo.close();
});

test('two tabs serialize spending and cannot build onto one occupied plot', async () => {
  const namespace = `tabs-${Math.random()}`;
  const first = new CareerRepository(namespace), second = new CareerRepository(namespace);
  await first.load();
  const [a, b] = await Promise.all([
    first.transact(state => reduceCareer(state, { type: 'build', moduleType: 'solar', plotId: 'a1', commandId: 'a' })),
    second.transact(state => reduceCareer(state, { type: 'build', moduleType: 'solar', plotId: 'a1', commandId: 'b' }))
  ]);
  assert.equal([a, b].filter(item => item.changed).length, 1);
  const state = (await first.load()).state;
  assert.equal(state.buildings.length, 1);
  assert.equal(state.resources.materials, 135);
  first.close(); second.close();
});

test('cloud CAS conflict, retries, generation and account isolation', async () => {
  const repo = new CareerRepository(`account:user-${Math.random()}`);
  let state = (await repo.load()).state;
  state = (await repo.transact(current => reduceCareer(current, { type: 'name', name: 'Local branch' }))).state;
  let serverRevision = 0, fail = true;
  const adapter = { async compareAndSwap(expected) {
    if (fail) { fail = false; throw new Error('network unavailable'); }
    if (expected !== serverRevision) { const error = new Error('conflict'); error.conflict = true; throw error; }
    return ++serverRevision;
  } };
  const coordinator = new CloudSyncCoordinator(adapter);
  coordinator.attach(repo.namespace.slice(8), state.generation, 0);
  assert.equal((await coordinator.flush(repo, state)).status, 'Sync Failed');
  assert.equal((await coordinator.flush(repo, state)).status, 'Synced');
  assert.equal(serverRevision, 1);
  state = (await repo.transact(current => reduceCareer(current, { type: 'name', name: 'Offline edit' }))).state;
  serverRevision = 2;
  assert.equal((await coordinator.flush(repo, state)).error.conflict, true);
  coordinator.remoteRevision = 2;
  assert.equal((await coordinator.flush(repo, state)).status, 'Synced');
  coordinator.attach('another-user', state.generation, 0);
  assert.equal((await coordinator.flush(repo, state)).ignored, true);
  coordinator.attach(repo.namespace.slice(8), 'old-generation', 0);
  assert.equal((await coordinator.flush(repo, state)).ignored, true);
  const cloud = structuredClone(state); cloud.badges.push('orbit');
  const merged = mergeMonotonic(state, cloud);
  assert.ok(merged.badges.includes('orbit'));
  assert.deepEqual(merged.resources, state.resources);
  repo.close();
});

test('supported checkpoint captures only stable surface or orbit phases', () => {
  const vector = (x, y, z) => ({ x, y, z });
  const engine = { mode: 'rover', journey: { active: false }, tankerOps: { active: false },
    missionPhysics: { planetId: 'mars', phase: 'ON_PAD', destination: 'earth', padElevation: 20,
      position: vector(1400, 20, 1150), velocity: vector(0, 0, 0), starshipFuel: 100, boosterFuel: 100,
      boosterState: 'ATTACHED', autoMission: true },
    physics: { position: vector(1260, 0, 1020), yaw: 0 }, walker: { position: vector(1265, 0, 1020), yaw: 0 } };
  assert.equal(captureCheckpoint(engine, now).frame, 'surface');
  engine.missionPhysics.phase = 'INTERPLANETARY';
  assert.equal(captureCheckpoint(engine, now), null);
  engine.missionPhysics.phase = 'ORBIT';
  assert.equal(captureCheckpoint(engine, now).frame, 'orbit');
});

test('supported checkpoint restoration reconstructs the stable orbit and vehicle state', () => {
  const checkpoint = {
    worldVersion: 1, frame: 'orbit', planet: 'earth', destination: 'mars', phase: 'ORBIT', mode: 'starship', at: now,
    ship: { position: { x: 1200, y: 120_050, z: -1500 }, velocity: { x: 0, y: 0, z: 7700 }, fuel: 34,
      boosterFuel: 0, boosterState: 'LEFT_BEHIND', autoMission: true },
    rover: { position: { x: 1400, y: 0, z: 1150 }, yaw: .5 },
    walker: { position: { x: 1405, y: 0, z: 1150 }, yaw: .5 }
  };
  const vector = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); }, length() { return Math.hypot(this.x, this.y, this.z); } });
  const physics = { planetId: 'mars', phase: 'ON_PAD', padElevation: 50, position: vector(), velocity: vector(),
    setPlanet(planet) { this.planetId = planet; }, resetToPad() { this.phase = 'ON_PAD'; }, setDestination(target) { this.destination = target; } };
  const engine = { missionPhysics: physics, physics: { position: vector(), velocity: vector() }, walker: { position: vector() },
    starship: { boosterGroup: {}, setMated(value) { this.isMated = value; } },
    journey: { reset() {}, setPlanet(planet) { this.planet = planet; } },
    operations: { reset() {} }, applyPlanetEnvironment(planet) { this.environment = planet; },
    setTimeScale() {}, setMode(mode) { this.mode = mode; }, cameraController: { resetGimbal() {} } };
  restoreCheckpoint(engine, checkpoint);
  assert.equal(physics.planetId, 'earth');
  assert.equal(physics.phase, 'ORBIT');
  assert.equal(physics.position.y, 120_050);
  assert.equal(physics.velocity.z, 7700);
  assert.equal(physics.starshipFuel, 34);
  assert.equal(engine.starship.isMated, false);
  assert.equal(engine.journey.planet, 'earth');
  assert.equal(engine.mode, 'starship');
});
