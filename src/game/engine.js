import * as THREE from 'three';
import { MarsTerrainManager } from '../terrain/marsTerrain.js';
import { MarsScatterManager } from '../terrain/scatter.js';
import { getMarsHeight } from '../terrain/noise.js';
import { MarsRoverModel } from '../vehicle/rover.js';
import { MarsRoverPhysics } from '../vehicle/physics.js';
import { AstronautAvatar } from '../vehicle/astronaut.js';
import { MarsAtmosphere } from '../effects/atmosphere.js';
import { MarsAudioEngine } from '../effects/audio.js';
import { InputManager } from '../ui/controls.js';
import { MarsHUD } from '../ui/hud.js';
import { MarsCameraController } from '../camera.js';
import { StarshipMissionVehicle } from '../flight/starship.js';
import { StarshipMissionPhysics, FLIGHT_PHASES } from '../flight/missionPhysics.js';
import { MissionFlightHUD } from '../flight/missionUI.js';
import { InterplanetaryJourney } from '../flight/interplanetary.js';
import { StarbaseOperations } from '../flight/starbaseOperations.js';
import { missionRoute, transferKind, distantElapsedSeconds } from '../flight/relativity.js';
import { createTransfer } from '../flight/orbitalMechanics.js';
import { localCentralAcceleration } from '../flight/localOrbitalDynamics.js';
import { createMillerOcean, getMillerHeight } from '../terrain/millerSurface.js';

const SHIP_PROPELLANT_CAPACITY_KG = 1_200_000;
const TANKER_DELIVERABLE_KG = 1_200_000;
const DOCKED_TRANSFER_RATE_KG_S = 5_000;
const DOCKED_TRANSFER_TIME_COMPRESSION = 30;
import { StarbaseObstacleSystem } from '../flight/solidCollisions.js';
import { FlyingRoadster } from '../flight/roadster.js';
import { StarbaseSupercar } from '../vehicle/supercar.js';
import { PLANET_PROFILES } from '../flight/planetProfiles.js';
import { earthSurfaceHeight } from '../terrain/earthSurface.js';
import { getMoonHeight, getMoonNormal } from '../terrain/moonSurface.js';

export class MarsGameEngine {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.quality = 'High';
    this.gridEnabled = false;
    this.disposed = false;
    this.mode = 'rover'; // 'rover' | 'walking' | 'starship'
    this.loadedNotified = false;
    this.flightTimeScales = [1, 2, 4, 8, 100, 1000];
    this.groundTimeScales = [1, 2, 4, 8];
    this.timeScales = this.flightTimeScales;
    this.timeScaleIdx = 0;
    this.timeScale = 1;
    this.millerLocalSeconds = 0;
    this.millerDistantSeconds = 0;

    // EVA walker state. The visible articulated suit lives in AstronautAvatar;
    // this object remains the authoritative ground position/heading.
    this.walker = {
      position: new THREE.Vector3(1260, 0, 1020),
      velocity: new THREE.Vector3(0, 0, 0),
      yaw: 0.82,
      pitch: 0,
      roll: 0,
      speed: 0,
      speedKmh: 0,
      distanceTraveled: 0,
      bobPhase: 0,
      lastStepIndex: 0,
      eyeHeight: 1.75,
      gForce: '0.38'
    };

    this.raycaster = new THREE.Raycaster();
    this.pointerNDC = new THREE.Vector2();

    this.reportProgress(10, 'INITIALIZING SIMULATION ENGINE...');
    this.initRenderer();

    this.reportProgress(20, 'CONFIGURING MARS ENVIRONMENT PIPELINE...');
    this.initScene();

    this.initSystems();
    this.initEvents();

    // Debug/automation handle used by the browser smoke tests. It also makes
    // it possible to inspect mission state from the developer console.
    if (typeof window !== 'undefined') window.__marsGame = this;

    // Orbital tanker state machine. A transfer that needs more propellant than
    // the ship carried to orbit triggers a rendezvous, hard dock, and cryogenic
    // transfer before the injection burn is allowed.
    this.tankerOps = {
      active: false,
      phase: 'idle',
      timer: 0,
      progress: 0,
      target: null,
      fromFuel: 0,
      targetFuel: 0
    };

    this.clock = new THREE.Clock();
    this.lastOnGround = 4;

    this.animate = this.animate.bind(this);
    this.animId = requestAnimationFrame(this.animate);
  }

  reportProgress(pct, status) {
    if (this.options?.onProgress) {
      try {
        this.options.onProgress(pct, status);
      } catch (_) {}
    }
  }

  detectOptimalQuality() {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    if (isMobile) {
      return (cores <= 4 || mem <= 4) ? 'Low' : 'Medium';
    }
    if (cores <= 4 || mem <= 4) return 'Medium';
    return 'High';
  }

  initRenderer() {
    const isLowTier = this.detectOptimalQuality() !== 'High';
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      // Keep MSAA on even on mid-range GPUs: the hard-edged stainless vehicle
      // and truss towers alias badly without it. Resolution adaptation below
      // handles the performance budget without turning the image into pixels.
      antialias: true,
      stencil: false,
      alpha: false
    });

    const dpr = Math.min(window.devicePixelRatio || 1, isLowTier ? 1.15 : 1.5);
    this.renderer.setPixelRatio(dpr);
    this.pixelBase = dpr;
    this.dynPR = dpr;
    this.minDynPR = isLowTier ? 0.8 : 1.0;
    this.avgDt = 0.016;
    this.perfTick = 0;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);
    // Non-enumerable handle for integration checks and developer tools.
    Object.defineProperty(this.renderer.domElement, 'game', { value: this });
  }

  initScene() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.25,
      2500
    );
  }

  initSystems() {
    // 1. Atmosphere & Sky
    this.reportProgress(30, 'SYNTHESIZING CO₂ SKYDOME & DUST PARTICLES...');
    this.atmosphere = new MarsAtmosphere(this.scene);
    setTimeout(() => {
      if (!this.disposed && this.atmosphere && this.renderer) {
        try {
          this.atmosphere.buildEnvironment(this.renderer);
        } catch (_) {}
      }
    }, 60);

    // 2. Terrain & Dunes
    this.reportProgress(48, 'GENERATING PROCEDURAL DUNES & CRATER SECTORS...');
    this.terrain = new MarsTerrainManager(this.scene, { gridEnabled: 0.0 });
    this.millerOcean = createMillerOcean(this.scene);
    this.millerOcean.group.visible = false;

    // 3. Martian Scatter (Rocks & POIs)
    this.reportProgress(65, 'CONSTRUCTING OLYMPUS BASE & MONUMENTS...');
    this.scatter = new MarsScatterManager(this.scene);

    // 4. Mars Rover & Physics
    this.reportProgress(80, 'RIGGING ROVER ROCKER-BOGIE CHASSIS...');
    this.roverModel = new MarsRoverModel();
    this.scene.add(this.roverModel.group);
    this.physics = new MarsRoverPhysics(this.roverModel);
    this.obstacles = new StarbaseObstacleSystem(new THREE.Vector2(1400, 1150));
    this.physics.collider = {
      resolve: (pos, radius, feetY) => this.resolveWorldCollisions(pos, radius, feetY)
    };

    this.astronaut = new AstronautAvatar();
    this.scene.add(this.astronaut.group);

    // 5. Audio Synthesizer
    this.audio = new MarsAudioEngine();

    // 6. Camera Controller (Universal 360° Gimbal across all cameras)
    this.cameraController = new MarsCameraController(this.camera, this.renderer.domElement);
    document.getElementById('camera-zoom-in')?.addEventListener('click', () => this.cameraController.zoomBy(-180));
    document.getElementById('camera-zoom-out')?.addEventListener('click', () => this.cameraController.zoomBy(180));
    document.getElementById('camera-zoom-reset')?.addEventListener('click', () => this.cameraController.resetView());

    // 7. SpaceX Starship & Mission Flight System (Placed at Starbase 1400, 1150)
    this.reportProgress(92, 'ERECTING 145M MECHAZILLA TOWER & LAUNCH PEDESTAL...');
    this.starship = new StarshipMissionVehicle();
    this.scene.add(this.starship.group);
    this.missionPhysics = new StarshipMissionPhysics(this.starship, new THREE.Vector2(1400, 1150));
    this.missionPhysics.obstacles = this.obstacles;

    // Earth, the Moon, both satellite networks and the compressed interplanetary
    // cruise. Entry hands control back to the real flight integrator.
    this.journey = new InterplanetaryJourney(this.scene, this.missionPhysics, this.starship, {
      onArrive: (planetId) => this.handlePlanetArrival(planetId)
    });
    this.trajectoryVisible = false;
    this.localTrajectory = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
      color: 0xffcc55, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, toneMapped: false
    }));
    this.localTrajectory.visible = false;
    this.localTrajectory.frustumCulled = false;
    this.scene.add(this.localTrajectory);
    this.trajectoryRefresh = 0;
    this.arrivalFlashTime = 0;
    this.journey.setPlanet('mars');
    this.atmosphere.setPlanet('mars');

    this.operations = new StarbaseOperations(this.missionPhysics, this.starship, {
      obstacles: this.obstacles,
      isRouteBlocked: (pos,radius) => {
        const actors=[this.physics.position];
        if (this.mode === 'walking') actors.push(this.walker.position);
        if (this.mode === 'roadster') actors.push(this.roadster.group.position);
        return actors.some(a=>Math.abs(a.y-pos.y)<8 && Math.hypot(a.x-pos.x,a.z-pos.z)<radius+1.6);
      },
      onRelaunch: () => {
        if (this.missionPhysics.phase === FLIGHT_PHASES.ON_PAD && this.missionPhysics.autoMission) {
          this.operations.reset();
          this.missionPhysics.startLaunch();
          this.setMode('starship');
          this.cameraController.resetGimbal();
        }
      }
    });

    this.roadster = new FlyingRoadster(this.scene, this.missionPhysics);
    this.roadster.setPlanet('mars');
    this.supercars = [0, 1, 2].map((index) => new StarbaseSupercar(
      this.scene, index, 1344 + index * 8, 1089, 0.35,
      (x, z) => this.getSurfaceHeight(x, z)
    ));
    this.activeCar = null;

    // 8. Input & Unified Glassmorphic HUD for Rover & Walking
    this.input = new InputManager();
    this.hud = new MarsHUD(this.input, {
      onToggleGrid: (enabled) => {
        this.gridEnabled = enabled;
        this.terrain.setGridEnabled(enabled);
      },
      onToggleAudio: (enabled) => {
        if (!this.audio.initialized) this.audio.init();
        if (enabled && this.audio.muted) {
          this.audio.toggleMute();
        } else if (!enabled && !this.audio.muted) {
          this.audio.toggleMute();
        }
      },
      onChangeQuality: (quality) => {
        this.applyQuality(quality);
      },
      onResetRover: () => {
        this.physics.resetAt(1260, 1020);
        this.physics.yaw = Math.atan2(1400 - 1260, 1150 - 1020);
        if (this.mode === 'walking') {
          this.setMode('rover');
        }
      },
      onSelectRoverCamera: (modeIdx) => {
        if (this.mode === 'rover') {
          this.cameraController.setRoverMode(modeIdx);
        }
      },
      onToggleWalk: () => {
        this.toggleWalkMode();
      },
      onPressPhysicalLaunch: () => {
        this.triggerPhysicalPadLaunch();
      },
      onGimbalPan: (dYaw, dPitch) => {
        this.cameraController.adjustGimbal(dYaw, dPitch);
      },
      onGimbalReset: () => {
        this.cameraController.resetView();
      }
    });
    this.hud.map.journey = this.journey;

    // 9. SpaceX Flight HUD
    this.flightHud = new MissionFlightHUD({
      onStage: () => {
        this.handleFlightStageAction();
      },
      onToggleAutoMission: () => {
        this.missionPhysics.toggleAutoMission();
      },
      onSelectTrajectory: (mode) => {
        this.missionPhysics.setTrajectoryMode(mode);
      },
      onSelectDestination: (planetId) => {
        this.selectDestination(planetId);
      },
      onTransfer: () => {
        this.beginTransfer();
      },
      onDeorbit: () => {
        this.beginDeorbit();
      },
      onToggleRoadster: () => {
        this.toggleRoadster();
      },
      onSelectCamera: (camMode) => {
        const selected = camMode === 'BOOSTER_CAM' && this.missionPhysics.boosterState === 'LEFT_BEHIND'
          ? 'CHASE' : camMode;
        this.cameraController.setFlightMode(selected);
        this.missionPhysics.boosterTracking = (selected === 'BOOSTER_CAM');
        this.flightHud.notifyCameraMode(selected);
      },
      onToggleTrajectory: () => this.toggleTrajectory(),
      onSelectTimeScale: (rate) => this.setTimeScale(rate),
      onGimbalMove: (dYaw, dPitch) => {
        this.cameraController.adjustGimbal(dYaw, dPitch);
      },
      onResetGimbal: () => {
        this.cameraController.resetView();
      },
      onResetMission: () => {
        const planet = this.missionPhysics.planetId;
        this.missionPhysics.setPlanet(planet);
        this.missionPhysics.resetToPad();
        this.missionPhysics.destination = planet === 'earth' ? 'mars' : 'earth';
        this.journey.reset();
        this.pendingRoute = [];
        this.millerLocalSeconds = 0;
        this.millerDistantSeconds = 0;
        this.tankerOps = { active: false, phase: 'idle', timer: 0, progress: 0, target: null, fromFuel: 0, targetFuel: 0 };
        this.missionPhysics.tankerActive = false;
        this.missionPhysics.tankerStatus = '';
        this.missionPhysics.opsMessage = '';
        this.operations?.reset();
        this.applyPlanetEnvironment(planet);
        this.setTimeScale(1);
        this.cameraController.resetGimbal();
      },
      onThrottleUp: () => {
        this.missionPhysics.throttle = Math.min(1.0, this.missionPhysics.throttle + 0.15);
      },
      onThrottleDown: () => {
        this.missionPhysics.throttle = Math.max(0.0, this.missionPhysics.throttle - 0.15);
      },
      onManualStage: () => {
        if (!this.audio.initialized) this.audio.init();
        this.audio.ensureRunning();
        this.missionPhysics.triggerStageSeparation();
        this.audio.playStageSeparationSound();
        this.cameraController.addShake(0.5);
      },
      onToggleLegs: () => {
        this.missionPhysics.toggleLandingLegs();
      },
      onToggleCargo: () => {
        this.missionPhysics.toggleCargoDoors();
      },
      onTouchPitch: (val) => {
        if (val) this.missionPhysics.autoMission = false;
        this.input.setTouchFlightInput({ pitch: val });
      },
      onTouchYaw: (val) => {
        if (val) this.missionPhysics.autoMission = false;
        this.input.setTouchFlightInput({ steer: val });
      },
      onTouchThrottle: (dir, held) => {
        if (held) this.missionPhysics.autoMission = false;
        this.input.setTouchFlightInput({
          throttleUp: held && dir > 0,
          throttleDown: held && dir < 0
        });
      },
      onExit: () => {
        if ([FLIGHT_PHASES.ON_PAD, FLIGHT_PHASES.LANDED].includes(this.missionPhysics.phase) && PLANET_PROFILES[this.missionPhysics.planetId]?.landable) {
          const term = this.missionPhysics.terminalPosition;
          this.walker.position.set(term.x - 3.5, this.getSurfaceHeight(term.x - 3.5, term.z - 3.5), term.z - 3.5);
          this.setMode('walking');
        }
      }
    });

    const bindSpeedBtn = (id) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.cycleTimeScale();
        });
      }
    };
    bindSpeedBtn('rover-speed-btn');

    const roverRoadsterBtn = document.getElementById('rover-roadster-btn');
    if (roverRoadsterBtn) {
      roverRoadsterBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleRoadster();
      });
    }

    const optimalPreset = this.detectOptimalQuality();
    this.applyQuality(optimalPreset);
    const qualitySelect = document.getElementById('quality-select');
    if (qualitySelect) qualitySelect.value = optimalPreset;
  }

  cycleTimeScale() {
    const scales = this.mode === 'starship' ? this.flightTimeScales : this.groundTimeScales;
    this.timeScales = scales;
    const current = scales.indexOf(this.timeScale);
    this.setTimeScale(scales[(current + 1) % scales.length]);
  }

  setTimeScale(value) {
    const scales = this.mode === 'starship' ? this.flightTimeScales : this.groundTimeScales;
    this.timeScales = scales;
    const idx = scales.indexOf(value);
    this.timeScale = idx >= 0 ? scales[idx] : value;
    this.timeScaleIdx = Math.max(0, idx);
    const isWarped = this.timeScale > 1;

    const flightBtn = document.getElementById('flight-speed-btn');
    if (flightBtn) {
      flightBtn.firstChild.textContent = `${this.timeScale}X `;
      flightBtn.classList.toggle('active', isWarped);
    }
    document.querySelectorAll('[data-time-scale]').forEach(button =>
      button.classList.toggle('active', Number(button.dataset.timeScale) === this.timeScale));

    const roverBtn = document.getElementById('rover-speed-btn');
    if (roverBtn) {
      roverBtn.textContent = `${this.timeScale}X`;
      roverBtn.classList.toggle('active', isWarped);
    }
  }

  toggleTrajectory() {
    this.trajectoryVisible = !this.trajectoryVisible;
    const button = document.getElementById('flight-trajectory-btn');
    button?.classList.toggle('active', this.trajectoryVisible);
    button?.setAttribute('aria-pressed', String(this.trajectoryVisible));
    this.trajectoryRefresh = 0;
    this.journey.setTrajectoryVisible(this.trajectoryVisible);
    if (!this.trajectoryVisible) {
      this.localTrajectory.visible = false;
    }
  }

  updateTrajectory(dt) {
    const p = this.missionPhysics;
    const booster = this.cameraController.getFlightMode() === 'BOOSTER_CAM' && p.boosterState !== 'ATTACHED';
    this.journey.setTrajectoryVisible(this.trajectoryVisible && this.journey.active && !booster);
    if (!this.trajectoryVisible || this.journey.active || p.phase === FLIGHT_PHASES.ON_PAD) {
      this.localTrajectory.visible = false;
      return;
    }
    this.localTrajectory.visible = true;
    this.trajectoryRefresh -= dt;
    if (this.trajectoryRefresh > 0) return;
    this.trajectoryRefresh = 0.35;

    const position = (booster ? p.boosterPosition : p.position).clone();
    const velocity = (booster ? p.boosterVelocity : p.velocity).clone();
    const profile = PLANET_PROFILES[p.planetId];
    if (!profile || profile.surfaceType === 'black-hole') { this.localTrajectory.visible = false; return; }
    const radius = profile.radius;
    const mass = booster ? p.getBoosterMass() : p.vehicle.isMated
      ? p.getBoosterMass() + p.getShipMass() : p.getShipMass();
    const orientation = booster ? p.boosterQuaternion : p.quaternion;
    const nose = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation).normalize();
    const atmosphere = { wind: new THREE.Vector3() };
    const relative = new THREE.Vector3();
    const accel = new THREE.Vector3();
    const points = [position.clone()];
    const step = position.y - p.padGroundY > 20000 ? 5 : 0.5;
    for (let i = 0; i < 620; i++) {
      const altitude = Math.max(0, position.y - p.padElevation);
      localCentralAcceleration(radius, profile.gravity, altitude, velocity, accel);
      const air = p.sampleAtmosphere(altitude, atmosphere);
      relative.copy(velocity).sub(air.wind);
      const airspeed = relative.length();
      if (airspeed > .5 && air.density > 1e-8) {
        const cosAlpha = THREE.MathUtils.clamp(nose.dot(relative) / airspeed, -1, 1);
        const cos2 = cosAlpha * cosAlpha;
        const area = booster ? 78 : p.vehicle.isMated ? 640 : 64 + (585 - 64) * (1 - cos2);
        const cd = .22 * cos2 + 1.75 * (1 - cos2);
        accel.addScaledVector(relative, -.5 * air.density * airspeed * cd * area / mass);
      }
      if (p.throttle > .01) {
        const available = booster ? p.getBoosterAvailAccel(p.boosterEngineCount || 13)
          : p.vehicle.isMated ? p.getBoosterAvailAccel(p.boosterEngineCount || 33) * p.getBoosterMass() / mass
            : p.getShipAvailAccel(p.shipEngineCount || 6);
        accel.addScaledVector(nose, available * p.throttle);
      }
      velocity.addScaledVector(accel, step);
      position.addScaledVector(velocity, step);
      if (position.y <= this.getSurfaceHeight(position.x, position.z)) break;
      if (i % 3 === 0) points.push(position.clone());
    }
    if (points.length < 2) points.push(position.clone());
    this.localTrajectory.geometry.dispose();
    this.localTrajectory.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  selectDestination(planetId) {
    const target = String(planetId || '').toLowerCase();
    if (!PLANET_PROFILES[target]) return;
    this.missionPhysics.setDestination(target);
    this.missionPhysics.transferRequiredPct = this.getTransferFuelRequirement(target);
  }

  getTransferFuelRequirement(target) {
    const from = this.missionPhysics.planetId;
    if (target === 'gargantua' || target === 'miller' || from === 'gargantua' || from === 'miller') return 0;
    if (from === target || transferKind(from, target) !== 'kepler') return 0;
    const deltaV = createTransfer(from, target).injectionDeltaV;
    // Required initial propellant for the calculated heliocentric injection,
    // including a 36-tonne correction reserve. Capture is handled separately.
    const dryKg = 120_000;
    const reserveKg = 36_000;
    const neededKg = (dryKg + reserveKg) * Math.exp(deltaV / (378 * 9.80665));
    return Math.ceil(Math.max(0, (neededKg - dryKg) / SHIP_PROPELLANT_CAPACITY_KG * 100));
  }

  // Transfer, deorbit and refuelling operations. If requested while on the ground,
  // the stack launches to orbit first with proper staging (booster stays on home world).
  beginTransfer() {
    const physics = this.missionPhysics;
    if (physics.yardControl || this.journey.active || physics.phase === FLIGHT_PHASES.CRASHED) return;
    physics.autoMission = true;
    const requestedTarget = physics.destination || (physics.planetId === 'mars' || physics.planetId === 'moon' ? 'earth' : 'mars');
    const route = missionRoute(physics.planetId, requestedTarget);
    if (!route.length) return;
    const target = route.shift();
    this.pendingRoute = route;
    physics.setDestination(target);
    physics.transferRequiredPct = this.getTransferFuelRequirement(target);

    // If on pad or landed on either world, launch into orbit first and queue transfer
    if (physics.phase === FLIGHT_PHASES.ON_PAD || physics.phase === FLIGHT_PHASES.LANDED) {
      physics.opsMessage = `LAUNCHING TO ORBIT // DESTINATION: ${target.toUpperCase()}`;
      physics.setDestination(target);
      physics.pendingTransfer = target;
      this.operations.reset();
      physics.startLaunch();
      this.setMode('starship');
      this.cameraController.resetGimbal();
      return;
    }

    if (physics.phase !== FLIGHT_PHASES.ORBIT) {
      physics.opsMessage = `TRANSFER QUEUED // ASCENDING TO ORBIT -> ${target.toUpperCase()}`;
      physics.pendingTransfer = target;
      return;
    }

    if (!target || target === physics.planetId) {
      this.beginDeorbit();
      return;
    }

    // Schedule the existing orbital tanker when launch propellant is short.
    // Transfer selection must not create propellant in the ship's tanks.
    if (physics.starshipFuel < this.getTransferFuelRequirement(target)) {
      this.beginOrbitalRefuel(target);
      return;
    }
    physics.pendingTransfer = null;
    this.startInterplanetaryTransfer(target);
  }

  startInterplanetaryTransfer(target) {
    const neededPercent = this.getTransferFuelRequirement(target);
    if (neededPercent > 94) {
      this.missionPhysics.opsMessage = `DIRECT INJECTION NEEDS ${neededPercent}% PROPELLANT · TANK LIMIT 94% · CHOOSE A STAGED ROUTE`;
      return false;
    }
    this.journey.arrived = false;
    this.journey.departureState = {
      position: this.missionPhysics.position.clone(),
      velocity: this.missionPhysics.velocity.clone()
    };
    if (!this.missionPhysics.triggerInterplanetary(target)) return false;
    if (this.cameraController.getFlightMode() === 'BOOSTER_CAM') {
      this.cameraController.setFlightMode('CHASE');
      this.missionPhysics.boosterTracking = false;
      this.flightHud?.notifyCameraMode('CHASE');
    }
    this.setTimeScale(1);
    this.ensureTransferStarted();
    return true;
  }

  beginOrbitalRefuel(target) {
    if (this.tankerOps.active) return;
    if (this.getTransferFuelRequirement(target) > 94) {
      this.missionPhysics.opsMessage = 'DIRECT TRANSFER EXCEEDS STARSHIP DELTA-V · CHOOSE AN INTERMEDIATE DESTINATION';
      return;
    }
    const physics = this.missionPhysics;
    this.tankerOps = {
      active: true,
      phase: 'rendezvous',
      timer: 0,
      progress: 0,
      target,
      fromFuel: physics.starshipFuel,
      targetFuel: 94,
      tankerRemainingKg: TANKER_DELIVERABLE_KG,
      transferredKg: 0,
      targetTransferKg: Math.max(0, (94 - physics.starshipFuel) / 100 * SHIP_PROPELLANT_CAPACITY_KG)
    };
    physics.tankerActive = true;
    physics.tankerStatus = 'ORBITAL TANKER // RENDEZVOUS';
    physics.opsMessage = `PROPELLANT ${Math.round(physics.starshipFuel)}% // CALLING TANKER`;
    this.journey.startTankerRendezvous();
    this.journey.tankerProgress = 0;
    this.setTimeScale(1);
    this.flightHud?.notifyTanker?.('RENDEZVOUS', 0);
  }

  updateTankerOperations(dt) {
    const ops = this.tankerOps;
    if (!ops.active) return;
    const physics = this.missionPhysics;
    if (physics.phase !== FLIGHT_PHASES.ORBIT) {
      // If the pilot deorbits or resets during docking, stand the tanker down.
      this.tankerOps.active = false;
      this.tankerOps.phase = 'idle';
      physics.tankerActive = false;
      physics.tankerStatus = '';
      this.journey.endTanker();
      return;
    }

    ops.timer += dt;
    if (ops.phase === 'rendezvous') {
      ops.progress = THREE.MathUtils.clamp(ops.timer / 5.0, 0, 1);
      this.journey.tankerProgress = ops.progress;
      physics.tankerStatus = 'ORBITAL TANKER // RENDEZVOUS';
      physics.opsMessage = `TANKER APPROACH // ${Math.round(ops.progress * 100)}%`;
      this.flightHud?.notifyTanker?.('RENDEZVOUS', ops.progress);
      if (ops.progress >= 1) {
        ops.phase = 'soft-dock';
        ops.timer = 0;
        ops.progress = 0;
        this.journey.setTankerPhase('soft-dock');
        physics.tankerStatus = 'ORBITAL TANKER // SOFT DOCK';
        physics.opsMessage = 'DOCKING ALIGNMENT // CLOSING TO COLLAR';
        this.flightHud?.notifyTanker?.('SOFT DOCK', 0);
      }
    } else if (ops.phase === 'soft-dock') {
      ops.progress = THREE.MathUtils.clamp(ops.timer / 2.2, 0, 1);
      this.journey.tankerProgress = ops.progress;
      if (ops.progress >= 1) {
        ops.phase = 'docking';
        ops.timer = 0;
        ops.progress = 0;
        this.journey.setTankerPhase('docked');
        physics.tankerStatus = 'ORBITAL TANKER // HARD DOCK';
        physics.opsMessage = `HARD DOCK // TANKER ${Math.round(ops.tankerRemainingKg / 1000)} T AVAILABLE`;
        this.flightHud?.notifyTanker?.('HARD DOCK', 0);
      }
    } else if (ops.phase === 'docking') {
      if (ops.timer >= 1.2) {
        ops.phase = 'transfer'; ops.timer = 0; ops.progress = 0;
        this.journey.setTankerPhase('transfer');
        physics.tankerStatus = 'ORBITAL TANKER // PROPELLANT TRANSFER';
      }
    } else if (ops.phase === 'transfer') {
      const remaining = ops.targetTransferKg - ops.transferredKg;
      const moved = Math.min(remaining, ops.tankerRemainingKg,
        DOCKED_TRANSFER_RATE_KG_S * DOCKED_TRANSFER_TIME_COMPRESSION * dt);
      ops.transferredKg += moved;
      ops.tankerRemainingKg -= moved;
      ops.progress = ops.targetTransferKg > 0 ? ops.transferredKg / ops.targetTransferKg : 1;
      physics.starshipFuel = Math.min(100, ops.fromFuel + ops.transferredKg / SHIP_PROPELLANT_CAPACITY_KG * 100);
      this.journey.tankerProgress = ops.progress;
      physics.opsMessage = `CRYOGENIC TRANSFER // SHIP ${Math.round(physics.starshipFuel / 100 * 1200)} T · TANKER ${Math.round(ops.tankerRemainingKg / 1000)} T · MOVED ${Math.round(ops.transferredKg / 1000)} T`;
      this.flightHud?.notifyTanker?.('TRANSFER', ops.progress);
      if (ops.progress >= 1) {
        ops.phase = 'complete';
        ops.timer = 0;
        ops.progress = 1;
        physics.starshipFuel = ops.targetFuel;
        physics.tankerStatus = 'ORBITAL TANKER // REFUEL COMPLETE';
        physics.opsMessage = 'REFUEL COMPLETE // TRANSFER WINDOW OPEN';
        this.flightHud?.notifyTanker?.('COMPLETE', 1);
      }
    } else if (ops.phase === 'complete') {
      if (ops.timer > 1.4) {
        const target = ops.target;
        this.tankerOps.active = false;
        this.tankerOps.phase = 'idle';
        physics.tankerActive = false;
        physics.tankerStatus = '';
        physics.opsMessage = '';
        this.journey.endTanker();
        this.startInterplanetaryTransfer(target);
      }
    }
  }

  beginDeorbit() {
    if (!PLANET_PROFILES[this.missionPhysics.planetId]?.landable) return;
    if (this.missionPhysics.phase === FLIGHT_PHASES.ORBIT) {
      this.missionPhysics.triggerDeorbit();
      if (this.missionPhysics.phase !== FLIGHT_PHASES.ORBIT) {
        // Orbital camera angles can point straight down at the Starbase during
        // the close approach. Start entry with a ship-following horizon view.
        this.cameraController.setFlightMode('CHASE');
        this.cameraController.resetGimbal();
        this.missionPhysics.boosterTracking = false;
        this.flightHud?.notifyCameraMode('CHASE');
      }
    }
  }

  ensureTransferStarted() {
    if (this.missionPhysics.pendingTransfer && this.missionPhysics.phase === FLIGHT_PHASES.ORBIT) {
      const target = this.missionPhysics.pendingTransfer;
      this.missionPhysics.pendingTransfer = null;
      if (this.missionPhysics.starshipFuel < this.getTransferFuelRequirement(target)) this.beginOrbitalRefuel(target);
      else this.startInterplanetaryTransfer(target);
      return;
    }
    if (this.missionPhysics.phase !== FLIGHT_PHASES.INTERPLANETARY) return;
    if (this.journey.active) return;
    const target = this.missionPhysics.transferTarget || this.missionPhysics.destination;
    if (target && target !== this.missionPhysics.planetId) {
      this.journey.start(target);
      this.setTimeScale(1);
      this.flightHud?.notifyTransfer(target);
    }
  }

  // Earth arrival pauses in orbit for a pilot deorbit decision. Other worlds
  // retain their direct guided entry sequence.
  handlePlanetArrival(planetId) {
    // The real arrival callback fires after the journey marks itself complete;
    // this guard also makes manual/debug arrival deterministic.
    this.journey.active = false;
    this.journey.arrived = true;
    this.journey.hideTransferTrail();
    this.arrivalFlashTime = 1.35;
    if (planetId === 'miller') {
      this.millerLocalSeconds = 0;
      this.millerDistantSeconds = 0;
    }
    const profile = PLANET_PROFILES[planetId];
    const staging = this.pendingRoute?.length > 0;
    if (planetId === 'gargantua') {
      this.missionPhysics.enterFlybyWaypoint(planetId);
    } else if (!profile?.landable) this.missionPhysics.enterPlanetOrbit(planetId, { preserveFuel: true });
    else if (planetId === 'earth' || planetId === 'miller' || staging) this.missionPhysics.enterPlanetOrbit(planetId, { preserveFuel: true });
    else this.missionPhysics.enterPlanetEntry(planetId, { preserveFuel: true });
    this.missionPhysics.transferStatus = '';
    this.missionPhysics.transferProgress = 0;
    this.missionPhysics.opsMessage = planetId === 'gargantua' ? 'GARGANTUA WAYPOINT // KERR ORBIT NOT NEWTONIAN · SELECT MILLER OR SATURN'
      : !profile?.landable ? `${planetId.toUpperCase()} ORBIT // GRAVITY AND DRAG LIVE · NO SURFACE LANDING`
        : planetId === 'earth' || planetId === 'miller' ? `${planetId.toUpperCase()} ORBIT // SELECT DEORBIT WHEN READY` : '';
    this.applyPlanetEnvironment(planetId);
    this.missionPhysics.setDestination(planetId === 'mars' || planetId === 'moon' ? 'earth' : 'mars');
    this.setTimeScale(1);
    if (this.cameraController.getFlightMode?.() === 'BOOSTER_CAM') {
      this.cameraController.setFlightMode('CHASE');
      this.missionPhysics.boosterTracking = false;
      this.flightHud?.notifyCameraMode('CHASE');
    }
    this.cameraController.initialized = false;
    this.flightHud?.notifyTransfer(null);
    this.flightHud?.notifyPlanet(planetId);
    if (this.pendingRoute?.length) {
      const nextTarget = this.pendingRoute.shift();
      this.missionPhysics.setDestination(nextTarget);
      this.missionPhysics.transferRequiredPct = this.getTransferFuelRequirement(nextTarget);
      if (this.missionPhysics.starshipFuel < this.getTransferFuelRequirement(nextTarget)) {
        this.beginOrbitalRefuel(nextTarget);
      } else {
        this.startInterplanetaryTransfer(nextTarget);
      }
    }
  }

  updateArrivalTransition(dt) {
    const overlay = document.getElementById('arrival-transition');
    if (!overlay) return;
    const approaching = this.journey.active && this.journey.routeKind === 'kepler'
      && this.journey.transferStage === 'COAST';
    const target = approaching ? this.journey.target : this.missionPhysics.planetId;
    const tint = PLANET_PROFILES[target]?.sky?.limb || 0x8fb6d5;
    if (this._arrivalTint !== tint) {
      this._arrivalTint = tint;
      overlay.style.background = `radial-gradient(circle at 50% 50%, #${tint.toString(16).padStart(6, '0')} 0%, #0a1525 78%)`;
    }
    if (this.arrivalFlashTime > 0) {
      this.arrivalFlashTime = Math.max(0, this.arrivalFlashTime - dt);
      overlay.style.opacity = String(THREE.MathUtils.smoothstep(this.arrivalFlashTime, 0, 1.1));
    } else {
      overlay.style.opacity = approaching
        ? String(THREE.MathUtils.smoothstep(this.journey.progress, 0.9995, 1))
        : '0';
    }
  }

  applyPlanetEnvironment(planetId) {
    const isEarth = planetId === 'earth';
    this.atmosphere.setPlanet(planetId);
    if (planetId === 'mars' || planetId === 'moon') this.terrain.setPlanet(planetId);
    this.physics.gravity = PLANET_PROFILES[planetId].gravity;
    const surfaceHeight = isEarth || planetId === 'moon' || planetId === 'miller'
      ? (x, z) => this.getSurfaceHeight(x, z) : getMarsHeight;
    this.physics.setSurface(surfaceHeight, planetId === 'moon' ? getMoonNormal : null);
    this.cameraController.surfaceHeight = surfaceHeight;
    this.journey.setPlanet(planetId);
    this.hud?.map?.setPlanet(planetId, this.missionPhysics.padCoords);
    this.roadster?.setPlanet(planetId);
    for (const car of this.supercars || []) {
      car.group.visible = planetId === 'mars' || planetId === 'earth' || planetId === 'moon';
      if (!car.piloted) car.group.position.y = this.getSurfaceHeight(car.group.position.x, car.group.position.z);
    }
    if (this.terrain?.group) this.terrain.group.visible = planetId === 'mars' || planetId === 'moon';
    if (this.millerOcean) this.millerOcean.group.visible = planetId === 'miller';
    if (this.starship?.launchPadGroup) this.starship.launchPadGroup.visible = Boolean(PLANET_PROFILES[planetId]?.landable) && planetId !== 'miller';
    if (this.roverModel?.group) this.roverModel.group.visible = planetId !== 'miller' && this.mode === 'rover';
    if (this.roadster?.group) this.roadster.group.visible = planetId !== 'miller' && this.roadster.enabled;
    if (this.mode === 'starship') this.applyFlightCameraClip();
    if (this.scatter?.setVisible) this.scatter.setVisible(planetId === 'mars');
  }

  applyFlightCameraClip() {
    const profile = PLANET_PROFILES[this.missionPhysics.planetId] || PLANET_PROFILES.mars;
    const horizon = Math.sqrt(2 * profile.radius * Math.max(profile.entryAltitude, 100000));
    let far = 8000000;
    if (!profile.landable && profile.surfaceType !== 'black-hole') {
      far = Math.max(8000000, horizon * 2.4);
      if (profile.id === 'saturn' || profile.id === 'uranus') far = Math.max(far, 50000000);
    }
    this.camera.near = 0.4;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  toggleRoadster() {
    if (!this.roadster) return;
    if (this.mode === 'roadster') {
      this.leaveVehicle();
      return;
    }
    if (this.mode === 'walking') {
      const start = this.walker.position;
      this.roadster.parked = !this.roadster.parked;
      this.roadster.setEnabled(this.roadster.parked);
      if (this.roadster.parked) {
        const x = start.x + Math.cos(this.walker.yaw) * 9;
        const z = start.z - Math.sin(this.walker.yaw) * 9;
        this.roadster.group.position.set(x, this.getSurfaceHeight(x, z) + 1.2, z);
        this.roadster.yaw = this.walker.yaw;
        this.roadster.group.rotation.y = this.walker.yaw;
      }
      return;
    }
    const on = this.roadster.toggle();
    this.flightHud?.notifyRoadster(on);
    const btn = document.getElementById('rover-roadster-btn');
    if (btn) {
      btn.classList.toggle('active', on);
      btn.textContent = on ? 'ROADSTER ON' : 'ROADSTER';
    }
  }

  nearestBoardableVehicle() {
    if (this.mode !== 'walking') return null;
    const pos = this.walker.position;
    const candidates = [
      { type: 'rover', name: 'ROVER', position: this.physics.position, radius: 7 },
      ...this.supercars.map((car) => ({ type: 'car', name: car.name.toUpperCase(), vehicle: car, position: car.group.position, radius: 5.5 }))
    ];
    if ([FLIGHT_PHASES.ON_PAD, FLIGHT_PHASES.LANDED].includes(this.missionPhysics.phase)) {
      candidates.push({ type: 'ship', name: 'STARSHIP', position: this.missionPhysics.terminalPosition, radius: 8 });
    }
    if (this.roadster.enabled && !this.roadster.isPiloted) {
      candidates.push({ type: 'roadster', name: 'ROADSTER', position: this.roadster.group.position, radius: 5.5 });
    }
    return candidates
      .map((item) => ({ ...item, distance: Math.hypot(pos.x - item.position.x, pos.z - item.position.z), height: Math.abs(pos.y - item.position.y) }))
      .filter((item) => item.distance <= item.radius && item.height <= 3)
      .sort((a, b) => a.distance - b.distance)[0] || null;
  }

  boardNearestVehicle(type = null) {
    const target = this.nearestBoardableVehicle();
    if (!target || (type && target.type !== type)) return false;
    this.cameraController.resetGimbal();
    if (target.type === 'rover') {
      this.setMode('rover');
    } else if (target.type === 'ship') {
      this.setMode('starship');
    } else {
      this.activeCar = target.type === 'car' ? target.vehicle : this.roadster;
      if (target.type === 'roadster') this.roadster.board(target.position, this.roadster.yaw);
      else this.activeCar.board();
      this.setMode('roadster');
    }
    return true;
  }

  leaveVehicle() {
    const vehicle = this.mode === 'rover' ? this.physics : this.activeCar;
    if (!vehicle) return;
    const position = this.mode === 'rover' ? this.physics.position : vehicle.disembark();
    const yaw = this.mode === 'rover' ? this.physics.yaw : vehicle.yaw;
    const side = this.mode === 'rover' ? 5.2 : 3.3;
    const wx = position.x + Math.cos(yaw) * side + Math.sin(yaw) * 1.6;
    const wz = position.z - Math.sin(yaw) * side + Math.cos(yaw) * 1.6;
    this.walker.position.set(wx, this.getSurfaceHeight(wx, wz), wz);
    this.walker.yaw = yaw;
    this.walker.speed = 0;
    this.activeCar = null;
    this.cameraController.resetGimbal();
    this.setMode('walking');
  }

  // Toggle between rover driving and third-person EVA walking.
  toggleWalkMode() {
    if (this.mode === 'rover' || this.mode === 'roadster') {
      this.leaveVehicle();
    } else if (this.mode === 'walking') {
      this.boardNearestVehicle();
    }
  }

  // Triggered when clicking the physical red launch button on the Starbase Launch Control Pedestal (or pressing [F] next to it)
  triggerPhysicalPadLaunch() {
    if (this.missionPhysics.yardControl) return;
    if (!this.audio.initialized) this.audio.init();
    this.audio.ensureRunning();
    this.audio.playLaunchButtonSound();
    if (this.starship.setLaunchButtonPressed) {
      this.starship.setLaunchButtonPressed(true);
    }
    this.setMode('starship');
    this.operations?.reset();
    this.missionPhysics.startLaunch();
  }

  handleFlightStageAction() {
    if (!this.audio.initialized) this.audio.init();
    this.audio.ensureRunning();

    if (this.missionPhysics.phase === FLIGHT_PHASES.ON_PAD) {
      this.audio.playLaunchButtonSound();
      this.operations?.reset();
      this.missionPhysics.startLaunch();
    } else if (this.missionPhysics.phase === FLIGHT_PHASES.LANDED) {
      const miller = this.missionPhysics.planetId === 'miller';
      const wx = miller ? this.missionPhysics.padCoords.x + 48 : this.missionPhysics.terminalPosition.x - 3.5;
      const wz = miller ? this.missionPhysics.padCoords.y + 8 : this.missionPhysics.terminalPosition.z - 3.5;
      this.walker.position.set(wx, this.getSurfaceHeight(wx, wz), wz);
      this.setMode('walking');
    } else if (!this.missionPhysics.autoMission && this.starship.isMated) {
      this.missionPhysics.triggerStageSeparation();
      this.audio.playStageSeparationSound();
      this.cameraController.addShake(0.5);
    }
  }

  setMode(targetMode) {
    if (this.mode === targetMode) return;
    this.mode = targetMode;
    document.body.dataset.controlMode = targetMode;
    this.input.clearTouchFlightInput?.();
    this.timeScales = targetMode === 'starship' ? this.flightTimeScales : this.groundTimeScales;
    if (targetMode !== 'starship' && this.timeScale > 8) this.setTimeScale(8);
    if (this.astronaut) this.astronaut.group.visible = targetMode === 'walking';

    const roverHud = document.getElementById('hud-layer');
    const mobileControls = document.getElementById('mobile-controls');
    const mobileVehicleBtn = document.getElementById('btn-vehicle-mobile');
    if (mobileVehicleBtn && targetMode !== 'walking') {
      mobileVehicleBtn.textContent = 'EXIT VEHICLE';
      mobileVehicleBtn.disabled = false;
    }
    if (mobileControls) mobileControls.style.display = targetMode !== 'starship' && this.input.detectMobile() ? 'block' : 'none';

    if (this.mode === 'starship') {
      this.applyFlightCameraClip();
      this.cameraController.initialized = false;

      this.starship.group.visible = true;
      this.roverModel.group.visible = true;

      if (roverHud) roverHud.style.display = 'none';
      if (mobileControls) mobileControls.style.display = 'none';
      this.flightHud.show(true, this.input.isMobile);
      this.flightHud.notifyCameraMode(this.cameraController.getFlightMode());
      this.atmosphere.setFlightMode(true);
      if (this.terrain) this.terrain.setFlightMode(true);
      const onEarth = this.missionPhysics.planetId === 'earth';
      if (this.terrain?.group) this.terrain.group.visible = this.missionPhysics.planetId === 'mars' || this.missionPhysics.planetId === 'moon';
      if (this.scatter?.group) this.scatter.group.visible = this.missionPhysics.planetId === 'mars';

      this.audio.update({ speedKmh: 0, isNitroActive: false, onGroundCount: 0 });
    } else if (this.mode === 'roadster') {
      this.camera.near = 0.22;
      this.camera.far = 8000;
      this.camera.updateProjectionMatrix();
      this.cameraController.initialized = false;

      if (this.astronaut) this.astronaut.group.visible = false;
      if (this.roadster) {
        this.roadster.enabled = true;
        this.roadster.group.visible = true;
      }
      this.roverModel.group.visible = true;
      this.starship.group.visible = true;

      this.flightHud.show(false);
      if (roverHud) roverHud.style.display = 'block';
      const roverBadge = document.getElementById('rover-mode-badge');
      if (roverBadge) roverBadge.textContent = `${this.activeCar?.name?.toUpperCase() || 'ROADSTER'} // PILOTING`;
      const roverTitle = document.getElementById('rover-left-title');
      if (roverTitle) roverTitle.textContent = this.activeCar?.name?.toUpperCase() || 'FLYING ROADSTER';
    } else {
      // 'rover' or 'walking'
      this.camera.near = 0.22;
      this.camera.far = 3200;
      this.camera.updateProjectionMatrix();
      this.cameraController.initialized = false;

      this.roverModel.group.visible = true;
      this.starship.group.visible = true;
      const onEarth = this.missionPhysics.planetId === 'earth';
      if (this.scatter?.group) this.scatter.group.visible = this.missionPhysics.planetId === 'mars';
      if (this.terrain?.group) this.terrain.group.visible = this.missionPhysics.planetId === 'mars' || this.missionPhysics.planetId === 'moon';

      this.flightHud.show(false);
      if (roverHud) roverHud.style.display = 'block';
      const roverBadge = document.getElementById('rover-mode-badge');
      if (roverBadge) roverBadge.textContent = this.mode === 'walking'
        ? 'EVA // STARBASE APPROACH' : 'ROVER // STARBASE APPROACH';
      const roverTitle = document.getElementById('rover-left-title');
      if (roverTitle) roverTitle.textContent = `${this.missionPhysics.planetId.toUpperCase()} ROVER`;
      if (mobileControls && this.input.isMobile) {
        mobileControls.style.display = 'block';
      }

      this.atmosphere.setFlightMode(false);
      if (this.terrain) this.terrain.setFlightMode(false);
      this.atmosphere.setAltitude(0, 0);
      this.terrain.setCameraAltitude(0);
      this.audio.updateRocket(0, 0, 0);
      if (this.mode === 'walking') {
        this.audio.update({ speedKmh: 0, isNitroActive: false, onGroundCount: 0 });
      }
    }
    // Terrain mode setters may re-enable the Mars grid. Earth uses its own
    // coastal height field and meshes in every ground and flight mode.
    if (this.missionPhysics.planetId === 'earth') {
      if (this.terrain?.group) this.terrain.group.visible = false;
      if (this.scatter?.group) this.scatter.group.visible = false;
    }
    const world = this.missionPhysics.planetId;
    if (world === 'miller') {
      this.roverModel.group.visible = false;
      if (this.roadster?.group) this.roadster.group.visible = false;
    }
    const groundMode = targetMode !== 'starship';
    if (groundMode) {
      const badge = document.getElementById('rover-mode-badge');
      const title = document.getElementById('rover-left-title');
      const walk = document.getElementById('rover-walk-btn');
      const roadster = document.getElementById('rover-roadster-btn');
      const cam = document.getElementById('rover-cam-current');
      const modeName = targetMode === 'walking' ? 'EVA' : targetMode === 'roadster' ? 'ROADSTER' : 'ROVER';
      if (badge) badge.textContent = `${modeName} // ${world.toUpperCase()}`;
      if (title) title.textContent = targetMode === 'walking' ? 'EVA SUIT' : targetMode === 'roadster' ? (this.activeCar?.name?.toUpperCase() || 'TESLA ROADSTER') : `${world.toUpperCase()} ROVER`;
      if (walk) walk.textContent = targetMode === 'walking' ? 'BOARD [E]' : 'EVA [E]';
      if (roadster) roadster.style.display = world === 'miller' ? 'none' : '';
      if (cam) cam.textContent = targetMode === 'walking' ? 'HELMET' : targetMode === 'roadster' ? 'DRIVER' : 'CHASE';
    }
  }

  applyQuality(preset) {
    // Safe Render is the compatibility path: the same lightweight scene as Low,
    // but with shadows and dynamic resolution scaling disabled so a weak or
    // software WebGL implementation can always present the sky, terrain and
    // vehicle instead of a black canvas.
    const isSafe = preset === 'Safe';
    const renderPreset = isSafe ? 'Low' : preset;
    this.quality = preset;
    this.perfTick = 0;
    this.atmosphere.setQuality(renderPreset);
    if (this.terrain) this.terrain.setQuality(renderPreset);
    if (this.scatter) this.scatter.setQuality(renderPreset);

    const isLow = renderPreset === 'Low';
    const isMed = renderPreset === 'Medium';
    const isHigh = renderPreset === 'High';
    const isUltra = renderPreset === 'Ultra';

    if (isSafe) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.0));
      this.minDynPR = 1.0;
      this.renderer.shadowMap.enabled = false;
      this.atmosphere.sunLight.castShadow = false;
    } else if (isLow) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.0));
      this.minDynPR = 0.8;
      this.renderer.shadowMap.enabled = false;
      this.atmosphere.sunLight.castShadow = false;
    } else if (isMed) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.input.isMobile ? 1.15 : 1.3));
      this.minDynPR = 0.9;
      this.renderer.shadowMap.enabled = true;
      this.atmosphere.sunLight.castShadow = true;
      this.atmosphere.sunLight.shadow.mapSize.set(1024, 1024);
    } else if (isHigh) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.minDynPR = 1.0;
      this.renderer.shadowMap.enabled = true;
      this.atmosphere.sunLight.castShadow = true;
      this.atmosphere.sunLight.shadow.mapSize.set(2048, 2048);
    } else if (isUltra) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));
      this.minDynPR = 1.0;
      this.renderer.shadowMap.enabled = true;
      this.atmosphere.sunLight.castShadow = true;
      this.atmosphere.sunLight.shadow.mapSize.set(2048, 2048);
    }
    this.pixelBase = this.renderer.getPixelRatio();
    this.dynPR = this.pixelBase;
  }

  initEvents() {
    this.onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this.onResize);

    this.startAudio = () => {
      if (!this.audio.initialized) {
        this.audio.init();
      }
      this.audio.ensureRunning();
      window.removeEventListener('keydown', this.startAudio);
      window.removeEventListener('touchstart', this.startAudio);
      window.removeEventListener('mousedown', this.startAudio);
    };
    window.addEventListener('keydown', this.startAudio);
    window.addEventListener('touchstart', this.startAudio);
    window.addEventListener('mousedown', this.startAudio);

    // 3D Raycast Click on the Physical Launch Button on the Starbase Pedestal
    let pointerDownPos = null;
    this.onCanvasPointerDown = (e) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    this.onCanvasPointerUp = (e) => {
      if (!pointerDownPos) return;
      const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      pointerDownPos = null;
      if (moveDist > 10) return; // Ignore camera gimbal drags

      if (this.mode !== 'walking' && this.mode !== 'rover') return;
      if (!this.starship?.launchTerminalGroup) return;

      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointerNDC, this.camera);
      const hits = this.raycaster.intersectObject(this.starship.launchTerminalGroup, true);
      if (hits.length > 0) {
        const activePos = this.mode === 'walking' ? this.walker.position : this.physics.position;
        const distToPedestal = activePos.distanceTo(this.missionPhysics.terminalPosition);
        if (this.mode === 'walking' && distToPedestal <= 15.0) {
          this.triggerPhysicalPadLaunch();
        } else if (this.mode === 'rover' && distToPedestal <= 35.0) {
          // If clicked from inside the rover near the pad, disembark to walking mode facing the button
          this.toggleWalkMode();
        }
      }
    };
    this.renderer.domElement.addEventListener('pointerdown', this.onCanvasPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onCanvasPointerUp);
  }

  getSurfaceHeight(x, z) {
    if (this.missionPhysics.planetId === 'earth') {
      const ground = this.missionPhysics.padGroundY + earthSurfaceHeight(
        x-this.missionPhysics.padCoords.x, z-this.missionPhysics.padCoords.y);
      return this.obstacles.supportHeight(x,z,ground);
    }
    if (this.missionPhysics.planetId === 'miller') return getMillerHeight(x,z,this.missionPhysics.localSurfaceTime);
    return this.obstacles.supportHeight(x,z,this.missionPhysics.planetId === 'moon'
      ? getMoonHeight(x,z) : getMarsHeight(x,z));
  }

  resolveWorldCollisions(position, radius = 1.0, feetY = 0) {
    let result = null;
    // 1. Starbase structural obstacles (launch tower, OLM, catch towers, factory, tanks, pedestal, erector)
    if (this.obstacles && this.missionPhysics.planetId !== 'miller') {
      const hit = this.obstacles.resolve(position, radius, feetY-this.missionPhysics.padGroundY, 1.8);
      if (hit) result = hit;
    }
    if (this.missionPhysics?.yardControl) {
      for (const kind of ['ship','booster']) {
        const crawler=this.starship.crawlers[kind];
        if (!crawler?.group.visible) continue;
        const load=kind === 'ship' ? this.missionPhysics.position : this.missionPhysics.boosterPosition;
        const top=load.y+(kind === 'ship' ? 50 : 70);
        if (feetY>top || feetY+1.8<load.y-4.7) continue;
        const solidRadius=feetY<load.y ? 10 : 4.8;
        const dx=position.x-load.x,dz=position.z-load.z,distance=Math.hypot(dx,dz);
        if(distance<solidRadius+radius) {
          const nx=distance>1e-5?dx/distance:1,nz=distance>1e-5?dz/distance:0;
          const pen=solidRadius+radius-distance;
          position.x+=nx*pen;position.z+=nz*pen;
          result={hit:true,nx,nz,pen,material:'metal'};
        }
      }
    }
    // 2. Martian boulders, rock outcrops, and monuments
    if (this.missionPhysics?.planetId === 'mars' && this.scatter?.resolve) {
      const hit = this.scatter.resolve(position, radius, feetY);
      if (hit) {
        if (!result || hit.pen > result.pen) result = hit;
      }
    }
    // 3. Earth forest tree trunks
    if (this.missionPhysics?.planetId === 'earth' && this.journey?.earthTreeObstacles) {
      for (const t of this.journey.earthTreeObstacles) {
        const dx = position.x - t.x;
        const dz = position.z - t.z;
        const distSq = dx * dx + dz * dz;
        const minSafe = radius + t.radius;
        if (distSq < minSafe * minSafe) {
          const dist = Math.sqrt(distSq) || 0.001;
          const pen = minSafe - dist;
          const nx = dx / dist;
          const nz = dz / dist;
          position.x += nx * pen;
          position.z += nz * pen;
          result = { hit: true, nx, nz, pen };
        }
      }
    }
    return result;
  }

  updateWalkingPhysics(dt) {
    const input = this.input.state;
    const isRunning = Boolean(input.nitro);
    const maxWalkSpeed = isRunning ? 8.2 : 4.8; // m/s on the local surface

    // Turn azimuth with A/D or Left/Right arrow keys
    if (Math.abs(input.steer) > 0.02) {
      this.walker.yaw += input.steer * 2.1 * dt;
    }

    // Forward/backward walking velocity
    const targetSpeed = (input.throttle || 0) * maxWalkSpeed;
    this.walker.speed = THREE.MathUtils.lerp(this.walker.speed, targetSpeed, Math.min(1.0, dt * 10.0));
    if (Math.abs(this.walker.speed) < 0.04) this.walker.speed = 0;

    const sinY = Math.sin(this.walker.yaw);
    const cosY = Math.cos(this.walker.yaw);
    const moveX = sinY * this.walker.speed * dt;
    const moveZ = cosY * this.walker.speed * dt;

    this.walker.position.x += moveX;
    this.walker.position.z += moveZ;

    // Solid obstacle collision resolution for astronaut on foot (cannot walk through towers, walls, or tanks)
    const walkHit = this.resolveWorldCollisions(this.walker.position, 0.45, this.walker.position.y);
    if (walkHit && Math.abs(this.walker.speed) > 1.5) {
      if (!this.audio.initialized) this.audio.init();
      this.audio.ensureRunning();
      this.audio.playCollisionSound(walkHit.material || 'metal', 0.35);
    }

    const groundY = this.getSurfaceHeight(this.walker.position.x, this.walker.position.z);
    this.walker.position.y = groundY;

    this.walker.velocity.set(sinY * this.walker.speed, 0, cosY * this.walker.speed);
    this.walker.speedKmh = Math.abs(Math.round(this.walker.speed * 3.6));
    this.walker.distanceTraveled += Math.abs(this.walker.speed) * dt;

    // First-person walking stride phase & synthesized Martian boot footsteps
    const absSpeed = Math.abs(this.walker.speed);
    if (absSpeed > 0.25) {
      const strideFreq = isRunning ? 3.4 : 2.35;
      this.walker.bobPhase += dt * strideFreq * Math.PI;
      const stepIdx = Math.floor(this.walker.bobPhase / Math.PI);
      if (stepIdx !== this.walker.lastStepIndex) {
        this.walker.lastStepIndex = stepIdx;
        if (!this.audio.initialized) this.audio.init();
        this.audio.ensureRunning();
        this.audio.playFootstepSound(isRunning);
      }
      // Subtle proper-G oscillation from astronaut stride impact.
      const baseG = this.missionPhysics.planetId === 'earth' ? 1.0 : 0.38;
      const strideG = baseG + Math.abs(Math.sin(this.walker.bobPhase)) * (isRunning ? 0.14 : 0.06);
      this.walker.gForce = strideG.toFixed(2);
    } else {
      this.walker.gForce = this.missionPhysics.planetId === 'earth' ? '1.00' : '0.38';
    }
  }

  animate() {
    if (this.disposed) return;
    this.animId = requestAnimationFrame(this.animate);

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);

    // Adaptive resolution for smooth 60 FPS on all devices
    this.avgDt += (Math.min(rawDt, 0.1) - this.avgDt) * 0.08;
    if (++this.perfTick >= 35) {
      this.perfTick = 0;
      let next = this.dynPR;
      const floor = this.minDynPR ?? 0.9;
      if (this.avgDt > 0.021 && next > floor) next = Math.max(floor, next - 0.08);
      else if (this.avgDt < 0.0175 && next < this.pixelBase) next = Math.min(this.pixelBase, next + 0.04);
      if (Math.abs(next - this.dynPR) > 0.001) {
        this.dynPR = next;
        this.renderer.setPixelRatio(next);
        if (this.quality !== 'Low') {
          const wantShadow = next > 0.68;
          if (this.renderer.shadowMap.enabled !== wantShadow) {
            this.renderer.shadowMap.enabled = wantShadow;
            this.atmosphere.sunLight.castShadow = wantShadow;
          }
        }
      }
    }

    // 1. Update Input State
    this.input.update();

    // Interplanetary cruise, celestial rotation and satellite relay networks
    // animate in every camera mode. Pass active camera altitude for seamless LOD fading.
    const camAltNow = Math.max(0, (this.camera ? this.camera.position.y : 0) - this.missionPhysics.padElevation);
    this.operations.update(dt);
    if (this.missionPhysics.yardControl && this.mode !== 'starship') this.missionPhysics.updateYardVisuals(dt);
    this.journey.update(dt, this.timeScale, camAltNow);
    this.updateArrivalTransition(dt);
    this.millerOcean?.update(this.missionPhysics.localSurfaceTime);
    this.roadster.update(dt, this.mode === 'starship' ? this.missionPhysics : null);
    if (this.missionPhysics.phase !== FLIGHT_PHASES.INTERPLANETARY && this.journey.active) {
      this.journey.active = false;
      this.journey.transferTrail.material.opacity = 0;
    }

    // =========================================================
    // MODE A: STARSHIP FLIGHT SIMULATION
    // =========================================================
    if (this.mode === 'starship') {
      this.updateTankerOperations(dt);

      this.ensureTransferStarted();

      if (this.input.consumeSinglePress('handbrake')) {
        this.handleFlightStageAction();
      }

      if (this.input.consumeSinglePress('cameraToggle')) {
        let nextMode = this.cameraController.nextFlightMode();
        if (nextMode === 'BOOSTER_CAM' && this.missionPhysics.boosterState === 'LEFT_BEHIND') {
          nextMode = this.cameraController.nextFlightMode();
        }
        this.missionPhysics.boosterTracking = (nextMode === 'BOOSTER_CAM');
        this.flightHud.notifyCameraMode(nextMode);
      }

      // Fixed upper bound per substep; distribute elapsed time instead of dropping it.
      const warp = this.timeScale || 1;
      const inOrbit = this.missionPhysics.phase === FLIGHT_PHASES.ORBIT;
      const simulationDt = Math.min(inOrbit ? 12 : 16 / 60,
        Math.min(dt, 0.1) * Math.min(warp, inOrbit ? 1000 : 8));
      const steps = Math.max(1, Math.ceil(simulationDt / (inOrbit ? 1.5 : 1 / 60)));
      for (let step = 0; step < steps; step++) {
        this.missionPhysics.update(simulationDt / steps, this.input.state);
      }
      if (this.missionPhysics.planetId === 'miller') this.millerOcean?.update(this.missionPhysics.localSurfaceTime);
      if (this.missionPhysics.planetId === 'miller' && this.missionPhysics.phase !== FLIGHT_PHASES.INTERPLANETARY) {
        this.millerLocalSeconds += simulationDt;
        this.millerDistantSeconds += distantElapsedSeconds(simulationDt, 'miller');
      }
      const relativityClock = document.getElementById('relativity-clock');
      if (relativityClock) {
        relativityClock.style.display = this.missionPhysics.planetId === 'miller' ? 'block' : 'none';
        if (this.missionPhysics.planetId === 'miller') {
          const years = this.millerDistantSeconds / (365.25 * 86400);
          relativityClock.textContent = `MILLER LOCAL ${Math.floor(this.millerLocalSeconds / 3600)}H ${Math.floor(this.millerLocalSeconds % 3600 / 60)}M · DISTANT ${years.toFixed(2)} YEARS (MODEL)`;
        }
      }
      if (this.missionPhysics.phase === FLIGHT_PHASES.INTERPLANETARY) {
        this.ensureTransferStarted();
      }
      const scaledDt = Math.min(dt * Math.min(warp, 8), 0.25);

      this.cameraController.updateFlight(scaledDt, this.missionPhysics);
      this.hud.map.update(this.missionPhysics, [], { flight: true });
      this.updateTrajectory(dt);
      this.flightHud.update(this.missionPhysics);
      this.audio.updateRocket(this.missionPhysics.throttle, this.missionPhysics.altitude, this.missionPhysics.heat);
      const dustyLanding = this.missionPhysics.planetId === 'mars' || this.missionPhysics.planetId === 'moon';
      if (this.missionPhysics.throttle > 0.25 && this.missionPhysics.altitude < 140 && dustyLanding) {
        this.atmosphere.burstLaunchDust(this.missionPhysics.position, this.missionPhysics.throttle);
      }

      const camAltitude = Math.max(0, this.camera.position.y - this.missionPhysics.padElevation);
      const targetNear = camAltitude > 2500 ? 4.5 : camAltitude > 400 ? 1.5 : 0.4;
      if (Math.abs(this.camera.near - targetNear) > 0.05) {
        this.camera.near = targetNear;
        this.camera.updateProjectionMatrix();
      }

      this.atmosphere.setAltitude(camAltitude, this.missionPhysics.speed);
      const onLocalTerrain = this.missionPhysics.planetId === 'mars' || this.missionPhysics.planetId === 'moon';
      if (onLocalTerrain) {
        this.terrain.setCameraAltitude(camAltitude);
      } else if (this.terrain?.group) {
        this.terrain.group.visible = false;
      }
      if (this.scatter?.group) {
        this.scatter.group.visible = this.missionPhysics.planetId === 'mars' && camAltitude < 900;
      }

      this.atmosphere.setViewScale(window.innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
      this.atmosphere.update(scaledDt, this.camera.position, {
        altitude: camAltitude,
        speed: this.missionPhysics.speed,
        quaternion: this.missionPhysics.quaternion,
        velocity: this.missionPhysics.velocity,
        isNitroActive: false,
        onGroundCount: camAltitude < 200 ? 4 : 0,
        speedKmh: this.missionPhysics.speed * 3.6,
        isInterplanetary: this.missionPhysics.phase === FLIGHT_PHASES.INTERPLANETARY || Boolean(this.journey?.active),
        sunPosition: this.journey.solarOrigin,
        timeScale: this.timeScale,
        simulationDt
      });

      if (onLocalTerrain && camAltitude < 5000) {
        this.terrain.update(this.camera.position);
        if (camAltitude < 950) {
          this.scatter.update(this.camera.position);
        }
      }

      this.starship.updateLOD(this.camera.position);
      this.journey.updateLocalSky(this.camera);
      this.renderer.render(this.scene, this.camera);
      this.notifyFirstFrame();
      return;
    }

    // =========================================================
    // MODE B & C: MARS ROVER & FIRST-PERSON WALKING
    // =========================================================
    // Key E toggles between Rover Driving and First-Person Walking
    if (this.input.consumeSinglePress('walkToggle')) {
      this.toggleWalkMode();
    }

    // Key F presses the Physical Launch Button when walking near the Launch Pedestal
    if (this.input.consumeSinglePress('interactAction')) {
      const activePos = this.mode === 'walking' ? this.walker.position : this.physics.position;
      const distToTerminal = activePos.distanceTo(this.missionPhysics.terminalPosition);
      if (this.mode === 'walking' && distToTerminal <= 9.5) {
        this.triggerPhysicalPadLaunch();
      }
    }

    if (this.input.consumeSinglePress('cameraToggle') && this.mode === 'rover') {
      this.cameraController.nextMode();
      this.hud.syncCameraTab(this.cameraController.mode);
    }

    if (this.input.consumeSinglePress('toggleLights')) {
      for (const light of this.roverModel.headlights) {
        light.visible = !light.visible;
      }
    }

    const steps = this.timeScale || 1;
    const scaledDt = Math.min(dt * steps, 0.20);

    if (this.mode === 'walking') {
      for (let s = 0; s < steps; s++) {
        this.updateWalkingPhysics(dt);
      }
      // Keep rover parked where the player left it
      this.physics.update(dt, { throttle: 0, steer: 0, handbrake: true, nitro: false, assist: false });
      if (this.astronaut) this.astronaut.update(dt, this.walker);
      this.cameraController.updateWalking(scaledDt, this.walker);

      const activePos = this.walker.position;
      const onLocalTerrain = this.missionPhysics.planetId !== 'earth';
      const onMars = this.missionPhysics.planetId === 'mars';
      if (onLocalTerrain) {
        this.terrain.update(activePos);
        this.scatter.setVisible(onMars);
        if (onMars) this.scatter.update(activePos);
      } else {
        // The Earth Starbase uses its own ocean/grass ground disc. Never let
        // Mars terrain chunks or scattered rocks poke through it.
        if (this.terrain?.group) this.terrain.group.visible = false;
        this.scatter?.setVisible(false);
      }
      this.atmosphere.setViewScale(window.innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
      this.atmosphere.update(scaledDt, activePos, {
        speed: this.walker.speed,
        speedKmh: this.walker.speedKmh,
        velocity: this.walker.velocity,
        isNitroActive: false,
        onGroundCount: 0,
        timeScale: this.timeScale
      });

      const nearbyPOIs = onMars ? this.scatter.getNearbyPOIs(activePos) : [];
      this.hud.update(this.walker, this.camera, nearbyPOIs, {
        isWalking: true,
        terminalPos: this.missionPhysics.terminalPosition,
        roverPos: this.physics.position,
        nearbyVehicle: this.nearestBoardableVehicle()
      });
    } else if (this.mode === 'roadster') {
      const car = this.activeCar;
      car.updatePiloted(
        dt,
        this.input.state,
        (x, z) => this.getSurfaceHeight(x, z),
        (pos, r, y) => this.resolveWorldCollisions(pos, r, y)
      );
      this.cameraController.updateRoadster(scaledDt, car);
      const activePos = car.group.position;
      const onLocalTerrain = this.missionPhysics.planetId !== 'earth';
      const onMars = this.missionPhysics.planetId === 'mars';
      if (onLocalTerrain) {
        this.terrain.update(activePos);
        this.scatter.setVisible(onMars);
        if (onMars) this.scatter.update(activePos);
      }
      this.atmosphere.setViewScale(window.innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
      this.atmosphere.update(scaledDt, activePos, {
        speed: Math.abs(car.speed),
        speedKmh: Math.abs(car.speed * 3.6),
        velocity: new THREE.Vector3(Math.sin(car.yaw) * car.speed, car.verticalSpeed, Math.cos(car.yaw) * car.speed),
        isNitroActive: Boolean(this.input.state.nitro),
        onGroundCount: 0,
        timeScale: this.timeScale
      });
      const speedNum = document.getElementById('speed-val');
      if (speedNum) speedNum.textContent = Math.round(Math.abs(car.speed * 3.6));
      const altNum = document.getElementById('alt-val');
      if (altNum) altNum.textContent = Math.round(activePos.y - this.missionPhysics.padGroundY);
      this.hud.map.update({ position: activePos, yaw: car.yaw, altitude: activePos.y - this.missionPhysics.padGroundY }, [], { flight: false });
    } else {
      // Rover Driving Mode
      for (let s = 0; s < steps; s++) {
        this.physics.update(dt, this.input.state);
      }

      if (this.physics.impact > 1.8) {
        const k = Math.min(2.0, this.physics.impact / 10.0);
        const mat = this.physics.lastCollisionMaterial || 'rock';
        this.audio.playCollisionSound(mat, k);
        this.cameraController.addShake(this.physics.impact * 0.1);
        this.atmosphere.burstDust(this.physics.position, k * 0.7);
      }
      this.physics.impact = 0;

      if (this.lastOnGround === 0 && this.physics.onGroundCount > 0) {
        const impactSpeed = this.physics.landSpeed || 0;
        if (impactSpeed > 4.0) {
          this.audio.playImpact(Math.min(2.0, impactSpeed / 8.0));
          this.cameraController.addShake(impactSpeed * 0.08);
          this.atmosphere.burstDust(this.physics.position, Math.min(2.0, impactSpeed / 8.0));
        }
      }
      this.lastOnGround = this.physics.onGroundCount;

      const onLocalTerrain = this.missionPhysics.planetId !== 'earth';
      const onMars = this.missionPhysics.planetId === 'mars';
      if (onLocalTerrain) {
        this.terrain.update(this.physics.position);
        this.scatter.setVisible(onMars);
        if (onMars) this.scatter.update(this.physics.position);
      } else {
        if (this.terrain?.group) this.terrain.group.visible = false;
        this.scatter?.setVisible(false);
      }
      this.atmosphere.setViewScale(window.innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
      this.physics.timeScale = this.timeScale;
      this.atmosphere.update(scaledDt, this.physics.position, this.physics);
      this.audio.update(this.physics);
      this.cameraController.update(scaledDt, this.physics);

      const nearbyPOIs = onMars ? this.scatter.getNearbyPOIs(this.physics.position) : [];
      this.hud.update(this.physics, this.camera, nearbyPOIs, {
        isWalking: false,
        terminalPos: this.missionPhysics.terminalPosition,
        roverPos: this.physics.position
      });
    }

    // Keep Starbase visible from anywhere within 1,200m so the 145m Mechazilla tower is a landmark on approach
    const activeActorPos = this.mode === 'walking' ? this.walker.position : this.mode === 'roadster' ? this.activeCar.group.position : this.physics.position;
    const sbDx = activeActorPos.x - 1400;
    const sbDz = activeActorPos.z - 1150;
    this.starship.group.visible = (sbDx * sbDx + sbDz * sbDz) <= 1200 * 1200;
    this.starship.updateLOD(this.camera.position);

    this.journey.updateLocalSky(this.camera);
    this.renderer.render(this.scene, this.camera);
    this.notifyFirstFrame();
  }

  notifyFirstFrame() {
    if (!this.loadedNotified) {
      this.loadedNotified = true;
      this.reportProgress(100, 'EXPEDITION SYSTEMS OPERATIONAL');
      if (this.options?.onLoaded) {
        try {
          this.options.onLoaded();
        } catch (_) {}
      }
    }
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.startAudio);
    window.removeEventListener('touchstart', this.startAudio);
    window.removeEventListener('mousedown', this.startAudio);
    if (window.__marsGame === this) window.__marsGame = null;
    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('pointerdown', this.onCanvasPointerDown);
      this.renderer.domElement.removeEventListener('pointerup', this.onCanvasPointerUp);
    }
    if (this.flightHud) {
      this.flightHud.show(false);
    }
    if (this.audio) {
      this.audio.updateRocket(0, 0, 0);
    }
    if (this.scene.environment && typeof this.scene.environment.dispose === 'function') {
      this.scene.environment.dispose();
    }
    this.localTrajectory.geometry.dispose();
    this.localTrajectory.material.dispose();
    this.terrain.dispose();
    this.millerOcean?.dispose();
    this.renderer.dispose();
  }
}
