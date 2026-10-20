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
import { StarbaseObstacleSystem } from '../flight/solidCollisions.js';
import { FlyingRoadster } from '../flight/roadster.js';
import { PLANET_PROFILES } from '../flight/planetProfiles.js';

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

    // 7. SpaceX Starship & Mission Flight System (Placed at Starbase 1400, 1150)
    this.reportProgress(92, 'ERECTING 145M MECHAZILLA TOWER & LAUNCH PEDESTAL...');
    this.starship = new StarshipMissionVehicle();
    this.scene.add(this.starship.group);
    this.missionPhysics = new StarshipMissionPhysics(this.starship, new THREE.Vector2(1400, 1150));

    // Earth, the Moon, both satellite networks and the compressed interplanetary
    // cruise. Entry hands control back to the real flight integrator.
    this.journey = new InterplanetaryJourney(this.scene, this.missionPhysics, this.starship, {
      onArrive: (planetId) => this.handlePlanetArrival(planetId)
    });
    this.journey.setPlanet('mars');
    this.atmosphere.setPlanet('mars');

    this.operations = new StarbaseOperations(this.missionPhysics, this.starship, {
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
        this.cameraController.resetGimbal();
      }
    });

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
        this.cameraController.setFlightMode(camMode);
        this.missionPhysics.boosterTracking = (camMode === 'BOOSTER_CAM');
        this.flightHud.notifyCameraMode(camMode);
      },
      onGimbalMove: (dYaw, dPitch) => {
        this.cameraController.adjustGimbal(dYaw, dPitch);
      },
      onResetGimbal: () => {
        this.cameraController.resetGimbal();
      },
      onResetMission: () => {
        this.missionPhysics.setPlanet('mars');
        this.missionPhysics.resetToPad();
        this.missionPhysics.destination = 'earth';
        this.journey.reset();
        this.tankerOps = { active: false, phase: 'idle', timer: 0, progress: 0, target: null, fromFuel: 0, targetFuel: 0 };
        this.missionPhysics.tankerActive = false;
        this.missionPhysics.tankerStatus = '';
        this.missionPhysics.opsMessage = '';
        this.operations?.reset();
        this.applyPlanetEnvironment('mars');
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
        this.input.setTouchFlightInput({ pitch: val });
      },
      onTouchYaw: (val) => {
        this.input.setTouchFlightInput({ steer: val });
      },
      onTouchThrottle: (dir, held) => {
        this.input.setTouchFlightInput({
          throttleUp: held && dir > 0,
          throttleDown: held && dir < 0
        });
      },
      onExit: () => {
        this.setMode('walking');
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
    bindSpeedBtn('flight-speed-btn');
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
      flightBtn.textContent = `${this.timeScale}X`;
      flightBtn.classList.toggle('active', isWarped);
      flightBtn.title = this.timeScale >= 100
        ? 'High time compression for orbit and interplanetary cruise'
        : 'Cycle Simulation Speed (1x / 2x / 4x / 8x / 100x / 1000x)';
    }

    const roverBtn = document.getElementById('rover-speed-btn');
    if (roverBtn) {
      roverBtn.textContent = `${this.timeScale}X`;
      roverBtn.classList.toggle('active', isWarped);
    }
  }

  selectDestination(planetId) {
    const target = String(planetId || '').toLowerCase();
    if (!PLANET_PROFILES[target]) return;
    this.missionPhysics.setDestination(target);
  }

  getTransferFuelRequirement(target) {
    // Enough for the injection burn, mid-course correction, and a propulsive
    // entry reserve. The exact value is intentionally legible in the HUD.
    return target === 'earth' ? 62 : 68;
  }

  // Transfer, deorbit and refuelling operations. If requested while on the ground,
  // the stack launches to orbit first with proper staging (booster stays on home world).
  beginTransfer() {
    const physics = this.missionPhysics;
    const target = physics.destination || (physics.planetId === 'mars' ? 'earth' : 'mars');

    // If on pad or landed on either world, launch into orbit first
    if (physics.phase === FLIGHT_PHASES.ON_PAD || physics.phase === FLIGHT_PHASES.LANDED) {
      physics.opsMessage = `LAUNCHING TO ORBIT // DESTINATION: ${target.toUpperCase()}`;
      physics.setDestination(target);
      this.operations.reset();
      physics.startLaunch();
      this.setMode('starship');
      this.cameraController.resetGimbal();
      return;
    }

    if (physics.phase !== FLIGHT_PHASES.ORBIT) {
      physics.opsMessage = 'TRANSFER WINDOW // ASCENDING TO ORBIT';
      return;
    }
    if (this.tankerOps.active) {
      physics.opsMessage = 'TRANSFER HOLD // ORBITAL TANKER IN PROGRESS';
      return;
    }
    if (!target || target === physics.planetId) {
      this.beginDeorbit();
      return;
    }
    const required = this.getTransferFuelRequirement(target);
    if (physics.starshipFuel < required - 0.25) {
      this.beginOrbitalRefuel(target);
      return;
    }
    this.startInterplanetaryTransfer(target);
  }

  startInterplanetaryTransfer(target) {
    if (!this.missionPhysics.triggerInterplanetary(target)) return false;
    this.setTimeScale(this.missionPhysics.autoMission ? 4 : Math.max(1, Math.min(this.timeScale, 4)));
    this.ensureTransferStarted();
    return true;
  }

  beginOrbitalRefuel(target) {
    if (this.tankerOps.active) return;
    const physics = this.missionPhysics;
    this.tankerOps = {
      active: true,
      phase: 'rendezvous',
      timer: 0,
      progress: 0,
      target,
      fromFuel: physics.starshipFuel,
      targetFuel: 94
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
        ops.phase = 'docking';
        ops.timer = 0;
        ops.progress = 0;
        this.journey.setTankerPhase('docked');
        physics.tankerStatus = 'ORBITAL TANKER // HARD DOCK';
        physics.opsMessage = 'HARD DOCK // UMBILICAL LATCHED';
        this.flightHud?.notifyTanker?.('DOCKED', 0);
      }
    } else if (ops.phase === 'docking') {
      ops.progress = THREE.MathUtils.clamp(ops.timer / 2.2, 0, 1);
      this.journey.tankerProgress = ops.progress;
      if (ops.progress >= 1) {
        ops.phase = 'transfer';
        ops.timer = 0;
        ops.progress = 0;
        this.journey.setTankerPhase('transfer');
        physics.tankerStatus = 'ORBITAL TANKER // PROPELLANT TRANSFER';
        physics.opsMessage = 'CRYOGENIC TRANSFER // LINE PRESSURE NOMINAL';
        this.flightHud?.notifyTanker?.('TRANSFER', 0);
      }
    } else if (ops.phase === 'transfer') {
      ops.progress = THREE.MathUtils.clamp(ops.timer / 6.0, 0, 1);
      const eased = THREE.MathUtils.smoothstep(ops.progress, 0, 1);
      physics.starshipFuel = THREE.MathUtils.lerp(ops.fromFuel, ops.targetFuel, eased);
      this.journey.tankerProgress = ops.progress;
      physics.opsMessage = `PROPELLANT ${Math.round(physics.starshipFuel)}% // ${Math.round(ops.targetFuel)}% TARGET`;
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
    if (this.missionPhysics.phase === FLIGHT_PHASES.ORBIT) {
      this.missionPhysics.triggerDeorbit();
    }
  }

  ensureTransferStarted() {
    if (this.missionPhysics.phase !== FLIGHT_PHASES.INTERPLANETARY) return;
    if (this.journey.active || this.journey.arrived) return;
    const target = this.missionPhysics.transferTarget || this.missionPhysics.destination;
    if (target && target !== this.missionPhysics.planetId) {
      this.journey.start(target);
      this.setTimeScale(this.missionPhysics.autoMission ? 100 : Math.max(8, this.timeScale));
      this.flightHud?.notifyTransfer(target);
    }
  }

  // Hands the entry interface back to the flight integrator once the cruise is
  // complete, then swaps terrain/sky to the destination environment.
  handlePlanetArrival(planetId) {
    // The real arrival callback fires after the journey marks itself complete;
    // this guard also makes manual/debug arrival deterministic.
    this.journey.active = false;
    this.journey.arrived = true;
    this.journey.hideTransferTrail();
    this.missionPhysics.enterPlanetEntry(planetId);
    this.missionPhysics.transferStatus = '';
    this.missionPhysics.transferProgress = 0;
    this.missionPhysics.opsMessage = '';
    this.applyPlanetEnvironment(planetId);
    this.missionPhysics.setDestination(planetId === 'mars' ? 'earth' : 'mars');
    this.setTimeScale(1);
    this.cameraController.initialized = false;
    this.flightHud?.notifyTransfer(null);
    this.flightHud?.notifyPlanet(planetId);
  }

  applyPlanetEnvironment(planetId) {
    const isEarth = planetId === 'earth';
    this.atmosphere.setPlanet(planetId);
    this.journey.setPlanet(planetId);
    this.roadster?.setPlanet(planetId);
    if (this.terrain?.group) this.terrain.group.visible = !isEarth;
    if (this.scatter?.setVisible) this.scatter.setVisible(!isEarth);
  }

  toggleRoadster() {
    if (!this.roadster) return;
    const on = this.roadster.toggle();
    this.flightHud?.notifyRoadster(on);
    const btn = document.getElementById('rover-roadster-btn');
    if (btn) {
      btn.classList.toggle('active', on);
      btn.textContent = on ? 'ROADSTER ON' : 'ROADSTER';
    }
  }

  // Toggle between rover driving and third-person EVA walking.
  toggleWalkMode() {
    if (this.mode === 'rover') {
      // Disembark clear of the rover so the third-person camera does not start
      // inside a wheel/body with the astronaut hidden behind it.
      const side = 5.2;
      const forward = 1.6;
      const rightX = Math.cos(this.physics.yaw) * side + Math.sin(this.physics.yaw) * forward;
      const rightZ = -Math.sin(this.physics.yaw) * side + Math.cos(this.physics.yaw) * forward;
      const wx = this.physics.position.x + rightX;
      const wz = this.physics.position.z + rightZ;
      const wy = this.getSurfaceHeight(wx, wz);

      this.walker.position.set(wx, wy, wz);
      // Face toward the Launch Control Pedestal so the player can immediately walk to the button
      const dxTerm = this.missionPhysics.terminalPosition.x - wx;
      const dzTerm = this.missionPhysics.terminalPosition.z - wz;
      this.walker.yaw = Math.atan2(dxTerm, dzTerm);
      this.walker.speed = 0;
      this.walker.bobPhase = 0;
      this.cameraController.resetGimbal();
      this.setMode('walking');
    } else if (this.mode === 'walking') {
      this.cameraController.resetGimbal();
      this.setMode('rover');
    }
  }

  // Triggered when clicking the physical red launch button on the Starbase Launch Control Pedestal (or pressing [F] next to it)
  triggerPhysicalPadLaunch() {
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
      const wx = this.missionPhysics.terminalPosition.x - 3.5;
      const wz = this.missionPhysics.terminalPosition.z - 3.5;
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
    this.timeScales = targetMode === 'starship' ? this.flightTimeScales : this.groundTimeScales;
    if (targetMode !== 'starship' && this.timeScale > 8) this.setTimeScale(8);
    if (this.astronaut) this.astronaut.group.visible = targetMode === 'walking';

    const roverHud = document.getElementById('hud-layer');
    const mobileControls = document.getElementById('mobile-controls');

    if (this.mode === 'starship') {
      this.camera.near = 0.4;
      this.camera.far = 500000;
      this.camera.updateProjectionMatrix();
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
      if (this.terrain?.group) this.terrain.group.visible = !onEarth;
      if (this.scatter?.group) this.scatter.group.visible = !onEarth;

      this.audio.update({ speedKmh: 0, isNitroActive: false, onGroundCount: 0 });
    } else {
      // 'rover' or 'walking'
      this.camera.near = 0.22;
      this.camera.far = 3200;
      this.camera.updateProjectionMatrix();
      this.cameraController.initialized = false;

      this.roverModel.group.visible = true;
      this.starship.group.visible = true;
      const onEarth = this.missionPhysics.planetId === 'earth';
      if (this.scatter?.group) this.scatter.group.visible = !onEarth;
      if (this.terrain?.group) this.terrain.group.visible = !onEarth;

      this.flightHud.show(false);
      if (roverHud) roverHud.style.display = 'block';
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
      const dx = x - this.missionPhysics.padCoords.x;
      const dz = z - this.missionPhysics.padCoords.y;
      // Concrete apron around the launch complex, grass beyond it.
      return this.missionPhysics.padGroundY + (dx * dx + dz * dz < 470 * 470 ? 0.14 : 0.06);
    }
    return getMarsHeight(x, z);
  }

  resolveWorldCollisions(position, radius = 1.0, feetY = 0) {
    let result = null;
    // 1. Starbase structural obstacles (launch tower, OLM, catch towers, factory, tanks, pedestal, erector)
    if (this.obstacles) {
      const hit = this.obstacles.resolve(position, radius, feetY);
      if (hit) result = hit;
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
    this.resolveWorldCollisions(this.walker.position, 0.45, this.walker.position.y);

    const groundY = this.getSurfaceHeight(this.walker.position.x, this.walker.position.z);
    this.walker.position.y = Math.max(this.walker.position.y, groundY);

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
    this.journey.update(dt, this.timeScale, camAltNow);
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
      this.operations.update(dt);
      this.ensureTransferStarted();

      if (this.input.consumeSinglePress('handbrake')) {
        this.handleFlightStageAction();
      }

      if (this.input.consumeSinglePress('cameraToggle')) {
        const nextMode = this.cameraController.nextFlightMode();
        this.missionPhysics.boosterTracking = (nextMode === 'BOOSTER_CAM');
        this.flightHud.notifyCameraMode(nextMode);
      }

      // High warp is only physically integrated in orbit; atmospheric phases
      // stay capped at 8 substeps to preserve guidance and contact stability.
      const warp = this.timeScale || 1;
      const inOrbit = this.missionPhysics.phase === FLIGHT_PHASES.ORBIT;
      if (warp > 8 && inOrbit) {
        this.missionPhysics.update(Math.min(dt * warp, 1.5), this.input.state);
      } else {
        const steps = Math.max(1, Math.min(warp, 8));
        for (let s = 0; s < steps; s++) {
          this.missionPhysics.update(dt, this.input.state);
        }
      }
      if (this.missionPhysics.phase === FLIGHT_PHASES.INTERPLANETARY) {
        this.ensureTransferStarted();
      }
      const scaledDt = Math.min(dt * Math.min(warp, 8), 0.25);

      this.cameraController.updateFlight(scaledDt, this.missionPhysics);
      this.flightHud.update(this.missionPhysics);
      this.audio.updateRocket(this.missionPhysics.throttle, this.missionPhysics.altitude, this.missionPhysics.heat);

      const camAltitude = Math.max(0, this.camera.position.y - this.missionPhysics.padElevation);
      const targetNear = camAltitude > 2500 ? 4.5 : camAltitude > 400 ? 1.5 : 0.4;
      if (Math.abs(this.camera.near - targetNear) > 0.05) {
        this.camera.near = targetNear;
        this.camera.updateProjectionMatrix();
      }

      this.atmosphere.setAltitude(camAltitude, this.missionPhysics.speed);
      const onMars = this.missionPhysics.planetId === 'mars';
      if (onMars) {
        this.terrain.setCameraAltitude(camAltitude);
      } else if (this.terrain?.group) {
        this.terrain.group.visible = false;
      }
      if (this.scatter?.group) {
        this.scatter.group.visible = onMars && camAltitude < 900;
      }

      this.atmosphere.setViewScale(window.innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
      this.atmosphere.update(scaledDt, this.camera.position, {
        altitude: camAltitude,
        speed: this.missionPhysics.speed,
        quaternion: this.missionPhysics.quaternion,
        velocity: this.missionPhysics.velocity,
        isNitroActive: false,
        onGroundCount: camAltitude < 200 ? 4 : 0,
        speedKmh: this.missionPhysics.speed * 3.6
      });

      if (onMars && camAltitude < 5000) {
        this.terrain.update(this.camera.position);
        if (camAltitude < 950) {
          this.scatter.update(this.camera.position);
        }
      }

      this.starship.updateLOD(this.camera.position);
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
      } else if (this.mode === 'rover' && distToTerminal <= 65.0) {
        this.toggleWalkMode();
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
      const onMars = this.missionPhysics.planetId === 'mars';
      if (onMars) {
        this.scatter.setVisible(true);
        this.terrain.update(activePos);
        this.scatter.update(activePos);
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
        onGroundCount: 0
      });

      const nearbyPOIs = onMars ? this.scatter.getNearbyPOIs(activePos) : [];
      this.hud.update(this.walker, this.camera, nearbyPOIs, {
        isWalking: true,
        terminalPos: this.missionPhysics.terminalPosition,
        roverPos: this.physics.position
      });
    } else {
      // Rover Driving Mode
      for (let s = 0; s < steps; s++) {
        this.physics.update(dt, this.input.state);
      }

      if (this.physics.impact > 2.0) {
        const k = Math.min(2.0, this.physics.impact / 10.0);
        this.audio.playImpact(k);
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

      const onMars = this.missionPhysics.planetId === 'mars';
      if (onMars) {
        this.scatter.setVisible(true);
        this.terrain.update(this.physics.position);
        this.scatter.update(this.physics.position);
      } else {
        if (this.terrain?.group) this.terrain.group.visible = false;
        this.scatter?.setVisible(false);
      }
      this.atmosphere.setViewScale(window.innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
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
    const activeActorPos = this.mode === 'walking' ? this.walker.position : this.physics.position;
    const sbDx = activeActorPos.x - 1400;
    const sbDz = activeActorPos.z - 1150;
    this.starship.group.visible = (sbDx * sbDx + sbDz * sbDz) <= 1200 * 1200;
    this.starship.updateLOD(this.camera.position);

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
    this.terrain.dispose();
    this.renderer.dispose();
  }
}
