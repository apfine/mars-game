import * as THREE from 'three';
import { MarsTerrainManager } from '../terrain/marsTerrain.js';
import { MarsScatterManager } from '../terrain/scatter.js';
import { getMarsHeight } from '../terrain/noise.js';
import { MarsRoverModel } from '../vehicle/rover.js';
import { MarsRoverPhysics } from '../vehicle/physics.js';
import { MarsAtmosphere } from '../effects/atmosphere.js';
import { MarsAudioEngine } from '../effects/audio.js';
import { InputManager } from '../ui/controls.js';
import { MarsHUD } from '../ui/hud.js';
import { MarsCameraController } from '../camera.js';
import { StarshipMissionVehicle } from '../flight/starship.js';
import { StarshipMissionPhysics, FLIGHT_PHASES } from '../flight/missionPhysics.js';
import { MissionFlightHUD } from '../flight/missionUI.js';

export class MarsGameEngine {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.quality = 'High';
    this.gridEnabled = false;
    this.disposed = false;
    this.mode = 'rover'; // 'rover' | 'walking' | 'starship'
    this.loadedNotified = false;
    this.timeScales = [1, 2, 4, 8];
    this.timeScaleIdx = 0;
    this.timeScale = 1;

    // First-Person Astronaut Walker State (No 3rd-person view, no human character mesh)
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
      antialias: !isLowTier,
      stencil: false
    });

    const dpr = Math.min(window.devicePixelRatio || 1, isLowTier ? 1.0 : 1.5);
    this.renderer.setPixelRatio(dpr);
    this.pixelBase = dpr;
    this.dynPR = dpr;
    this.avgDt = 0.016;
    this.perfTick = 0;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
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
    this.physics.collider = this.scatter;

    // 5. Audio Synthesizer
    this.audio = new MarsAudioEngine();

    // 6. Camera Controller (Universal 360° Gimbal across all cameras)
    this.cameraController = new MarsCameraController(this.camera, this.renderer.domElement);

    // 7. SpaceX Starship & Mission Flight System (Placed at Starbase 1400, 1150)
    this.reportProgress(92, 'ERECTING 145M MECHAZILLA TOWER & LAUNCH PEDESTAL...');
    this.starship = new StarshipMissionVehicle();
    this.scene.add(this.starship.group);
    this.missionPhysics = new StarshipMissionPhysics(this.starship, new THREE.Vector2(1400, 1150));

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
        this.missionPhysics.resetToPad();
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
        this.input.state.pitch = val;
      },
      onTouchYaw: (val) => {
        this.input.state.steer = val;
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

    const optimalPreset = this.detectOptimalQuality();
    this.applyQuality(optimalPreset);
    const qualitySelect = document.getElementById('quality-select');
    if (qualitySelect) qualitySelect.value = optimalPreset;
  }

  cycleTimeScale() {
    this.timeScaleIdx = (this.timeScaleIdx + 1) % this.timeScales.length;
    this.timeScale = this.timeScales[this.timeScaleIdx];
    const isWarped = this.timeScale > 1;

    const flightBtn = document.getElementById('flight-speed-btn');
    if (flightBtn) {
      flightBtn.textContent = `${this.timeScale}X`;
      flightBtn.classList.toggle('active', isWarped);
    }

    const roverBtn = document.getElementById('rover-speed-btn');
    if (roverBtn) {
      roverBtn.textContent = `${this.timeScale}X`;
      roverBtn.classList.toggle('active', isWarped);
    }
  }

  // Toggle between Rover Driving and First-Person Astronaut Walking
  toggleWalkMode() {
    if (this.mode === 'rover') {
      // Disembark Rover onto Martian surface next to driver door
      const rightX = Math.cos(this.physics.yaw) * 2.6;
      const rightZ = -Math.sin(this.physics.yaw) * 2.6;
      const wx = this.physics.position.x + rightX;
      const wz = this.physics.position.z + rightZ;
      const wy = getMarsHeight(wx, wz);

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
    this.missionPhysics.startLaunch();
  }

  handleFlightStageAction() {
    if (!this.audio.initialized) this.audio.init();
    this.audio.ensureRunning();

    if (this.missionPhysics.phase === FLIGHT_PHASES.ON_PAD) {
      this.audio.playLaunchButtonSound();
      this.missionPhysics.startLaunch();
    } else if (this.missionPhysics.phase === FLIGHT_PHASES.LANDED) {
      this.walker.position.set(
        this.missionPhysics.terminalPosition.x - 3.5,
        this.missionPhysics.terminalPosition.y,
        this.missionPhysics.terminalPosition.z - 3.5
      );
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

      this.audio.update({ speedKmh: 0, isNitroActive: false, onGroundCount: 0 });
    } else {
      // 'rover' or 'walking'
      this.camera.near = 0.22;
      this.camera.far = 3200;
      this.camera.updateProjectionMatrix();
      this.cameraController.initialized = false;

      this.roverModel.group.visible = true;
      this.starship.group.visible = true;
      if (this.scatter?.group) this.scatter.group.visible = true;

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
    this.quality = preset;
    this.perfTick = 0;
    this.atmosphere.setQuality(preset);
    if (this.terrain) this.terrain.setQuality(preset);
    if (this.scatter) this.scatter.setQuality(preset);

    const isLow = preset === 'Low';
    const isMed = preset === 'Medium';
    const isHigh = preset === 'High';
    const isUltra = preset === 'Ultra';

    if (isLow) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 0.85));
      this.renderer.shadowMap.enabled = false;
      this.atmosphere.sunLight.castShadow = false;
    } else if (isMed) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.input.isMobile ? 1.0 : 1.15));
      this.renderer.shadowMap.enabled = true;
      this.atmosphere.sunLight.castShadow = true;
      this.atmosphere.sunLight.shadow.mapSize.set(1024, 1024);
    } else if (isHigh) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
      this.renderer.shadowMap.enabled = true;
      this.atmosphere.sunLight.castShadow = true;
      this.atmosphere.sunLight.shadow.mapSize.set(1024, 1024);
    } else if (isUltra) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
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

  updateWalkingPhysics(dt) {
    const input = this.input.state;
    const isRunning = Boolean(input.nitro);
    const maxWalkSpeed = isRunning ? 8.2 : 4.8; // m/s on Martian 0.38G surface

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
    this.walker.position.y = getMarsHeight(this.walker.position.x, this.walker.position.z);

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
      // Subtle proper G oscillation from astronaut stride impact around 0.38G
      const strideG = 0.38 + Math.abs(Math.sin(this.walker.bobPhase)) * (isRunning ? 0.14 : 0.06);
      this.walker.gForce = strideG.toFixed(2);
    } else {
      this.walker.gForce = '0.38';
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
      if (this.avgDt > 0.021 && next > 0.5) next = Math.max(0.5, next - 0.12);
      else if (this.avgDt < 0.0165 && next < this.pixelBase) next = Math.min(this.pixelBase, next + 0.05);
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

    // =========================================================
    // MODE A: STARSHIP FLIGHT SIMULATION
    // =========================================================
    if (this.mode === 'starship') {
      if (this.input.consumeSinglePress('handbrake')) {
        this.handleFlightStageAction();
      }

      if (this.input.consumeSinglePress('cameraToggle')) {
        const nextMode = this.cameraController.nextFlightMode();
        this.missionPhysics.boosterTracking = (nextMode === 'BOOSTER_CAM');
        this.flightHud.notifyCameraMode(nextMode);
      }

      const steps = this.timeScale || 1;
      const scaledDt = Math.min(dt * steps, 0.25);
      for (let s = 0; s < steps; s++) {
        this.missionPhysics.update(dt, this.input.state);
      }

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
      this.terrain.setCameraAltitude(camAltitude);
      if (this.scatter?.group) {
        this.scatter.group.visible = camAltitude < 900;
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

      if (camAltitude < 5000) {
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
      this.cameraController.updateWalking(scaledDt, this.walker);

      const activePos = this.walker.position;
      this.terrain.update(activePos);
      this.scatter.update(activePos);
      this.atmosphere.setViewScale(window.innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
      this.atmosphere.update(scaledDt, activePos, {
        speed: this.walker.speed,
        speedKmh: this.walker.speedKmh,
        velocity: this.walker.velocity,
        isNitroActive: false,
        onGroundCount: 0
      });

      const nearbyPOIs = this.scatter.getNearbyPOIs(activePos);
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

      this.terrain.update(this.physics.position);
      this.scatter.update(this.physics.position);
      this.atmosphere.setViewScale(window.innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
      this.atmosphere.update(scaledDt, this.physics.position, this.physics);
      this.audio.update(this.physics);
      this.cameraController.update(scaledDt, this.physics);

      const nearbyPOIs = this.scatter.getNearbyPOIs(this.physics.position);
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
