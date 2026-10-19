import * as THREE from 'three';
import { MarsTerrainManager } from '../terrain/marsTerrain.js';
import { MarsScatterManager } from '../terrain/scatter.js';
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
    this.mode = 'rover';
    this.loadedNotified = false;

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
      0.2,
      1400
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

    // 6. Camera Controller
    this.cameraController = new MarsCameraController(this.camera, this.renderer.domElement);

    // 7. Input & HUD
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
        this.physics.resetAt(0, 0);
      }
    });

    // 8. SpaceX Starship & Mission Flight System
    this.reportProgress(92, 'ERECTING 140M MECHAZILLA TOWER & STARSHIP...');
    this.starship = new StarshipMissionVehicle();
    this.scene.add(this.starship.group);
    this.missionPhysics = new StarshipMissionPhysics(this.starship, new THREE.Vector2(1400, 1150));

    this.flightHud = new MissionFlightHUD({
      onStage: () => {
        this.handleFlightStageAction();
      },
      onToggleAutoMission: () => {
        this.missionPhysics.toggleAutoMission();
      },
      onToggleBoosterTracking: () => {
        const currentCam = this.cameraController.getFlightMode();
        const targetCam = currentCam === 'BOOSTER_CAM' ? 'CHASE' : 'BOOSTER_CAM';
        this.cameraController.setFlightMode(targetCam);
        this.missionPhysics.boosterTracking = (targetCam === 'BOOSTER_CAM');
        this.flightHud.notifyCameraMode(targetCam);
      },
      onSelectCamera: (camMode) => {
        this.cameraController.setFlightMode(camMode);
        this.missionPhysics.boosterTracking = (camMode === 'BOOSTER_CAM');
        this.flightHud.notifyCameraMode(camMode);
      },
      onToggleCamera: () => {
        const nextMode = this.cameraController.nextFlightMode();
        this.missionPhysics.boosterTracking = (nextMode === 'BOOSTER_CAM');
        this.flightHud.notifyCameraMode(nextMode);
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
      onTouchPitch: (val) => {
        this.input.state.pitch = val;
      },
      onTouchYaw: (val) => {
        this.input.state.steer = val;
      },
      onExit: () => {
        this.setMode('rover');
      }
    });

    const launchBtn = document.getElementById('launch-mission-btn');
    if (launchBtn) {
      launchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleMode();
      });
    }

    const optimalPreset = this.detectOptimalQuality();
    this.applyQuality(optimalPreset);
    const qualitySelect = document.getElementById('quality-select');
    if (qualitySelect) qualitySelect.value = optimalPreset;
  }

  handleFlightStageAction() {
    if (!this.audio.initialized) this.audio.init();
    this.audio.ensureRunning();

    if (this.missionPhysics.phase === FLIGHT_PHASES.ON_PAD) {
      this.missionPhysics.startLaunch();
    } else if (
      this.missionPhysics.phase === FLIGHT_PHASES.BOOSTER_ASCENT ||
      this.missionPhysics.phase === FLIGHT_PHASES.HOT_STAGING
    ) {
      this.missionPhysics.triggerStageSeparation();
      this.audio.playStageSeparationSound();
      this.cameraController.addShake(0.5);
    } else if (
      this.missionPhysics.phase === FLIGHT_PHASES.ORBIT ||
      this.missionPhysics.phase === FLIGHT_PHASES.STARSHIP_ASCENT
    ) {
      this.missionPhysics.triggerDeorbit();
    } else if (
      this.missionPhysics.phase === FLIGHT_PHASES.HYPERSONIC_ENTRY ||
      this.missionPhysics.phase === FLIGHT_PHASES.BELLYFLOP
    ) {
      this.missionPhysics.triggerLandingFlip();
    } else if (this.missionPhysics.phase === FLIGHT_PHASES.LANDED) {
      this.physics.resetAt(this.missionPhysics.position.x + 35, this.missionPhysics.position.z + 35);
      this.setMode('rover');
    }
  }

  setMode(targetMode) {
    if (this.mode === targetMode) return;
    this.mode = targetMode;

    const roverHud = document.getElementById('hud-layer');
    const mobileControls = document.getElementById('mobile-controls');

    if (this.mode === 'starship') {
      this.camera.far = 500000;
      this.camera.updateProjectionMatrix();
      this.cameraController.initialized = false;

      this.starship.group.visible = true;
      this.roverModel.group.visible = false;

      if (roverHud) roverHud.style.display = 'none';
      if (mobileControls) mobileControls.style.display = 'none';
      this.flightHud.show(true, this.input.isMobile);
      this.flightHud.notifyCameraMode(this.cameraController.getFlightMode());
      this.atmosphere.setFlightMode(true);

      // Silence rover motor while in flight
      this.audio.update({ speedKmh: 0, isNitroActive: false, onGroundCount: 0 });
    } else {
      this.camera.far = 1400;
      this.camera.updateProjectionMatrix();
      this.cameraController.initialized = false;

      this.roverModel.group.visible = true;

      this.flightHud.show(false);
      if (roverHud) roverHud.style.display = 'block';
      if (mobileControls && this.input.isMobile) {
        mobileControls.style.display = 'block';
      }

      this.atmosphere.setFlightMode(false);
      this.atmosphere.setAltitude(0, 0);
      this.terrain.setCameraAltitude(0);
      this.audio.updateRocket(0, 0, 0);
    }
  }

  toggleMode() {
    this.setMode(this.mode === 'rover' ? 'starship' : 'rover');
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
  }

  animate() {
    if (this.disposed) return;
    this.animId = requestAnimationFrame(this.animate);

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);

    // Adaptive resolution: trade pixel density for frame time so low-end devices stay locked at 60 FPS
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

    // Mode toggle shortcut (T key)
    if (this.input.consumeSinglePress('launchToggle')) {
      this.toggleMode();
    }

    if (this.mode === 'starship') {
      // Space key triggers stage action during flight
      if (this.input.consumeSinglePress('handbrake')) {
        this.handleFlightStageAction();
      }

      // Camera toggle shortcut (C key) during flight
      if (this.input.consumeSinglePress('cameraToggle')) {
        const nextMode = this.cameraController.nextFlightMode();
        this.missionPhysics.boosterTracking = (nextMode === 'BOOSTER_CAM');
        this.flightHud.notifyCameraMode(nextMode);
      }

      // Update Starship Flight Physics
      this.missionPhysics.update(dt, this.input.state);

      // Allow keyboard/D-pad gimbal rotation when viewing stationary Ground Cam or Tower Cam (when Auto Mode is active or on pad)
      const activeFlightCam = this.cameraController.getFlightMode();
      if (
        (activeFlightCam === 'GROUND_CAM' || activeFlightCam === 'TOWER_CAM') &&
        (this.missionPhysics.autoMission || this.missionPhysics.phase === FLIGHT_PHASES.ON_PAD)
      ) {
        if (this.input.state.steer || this.input.state.pitch) {
          this.cameraController.adjustGimbal(
            -(this.input.state.steer || 0) * dt * 1.4,
            -(this.input.state.pitch || 0) * dt * 1.1
          );
        }
      }

      // Update Flight Camera first so atmosphere/skydome anchors to the active camera (fixes black sky in Ground/Tower cam!)
      this.cameraController.updateFlight(dt, this.missionPhysics);

      // Update Flight HUD
      this.flightHud.update(this.missionPhysics);

      // Update Flight Audio (Raptor roar, staging pop, plasma roar)
      this.audio.updateRocket(this.missionPhysics.throttle, this.missionPhysics.altitude, this.missionPhysics.heat);

      // Anchor atmosphere skydome & altitude to the active camera so Ground/Tower/Booster cams keep Starbase's sky!
      const camAltitude = Math.max(0, this.camera.position.y - this.missionPhysics.padElevation);
      this.atmosphere.setAltitude(camAltitude, this.missionPhysics.speed);
      this.terrain.setCameraAltitude(camAltitude);

      this.atmosphere.setViewScale(window.innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
      this.atmosphere.update(dt, this.camera.position, {
        altitude: camAltitude,
        speed: this.missionPhysics.speed,
        quaternion: this.missionPhysics.quaternion,
        velocity: this.missionPhysics.velocity,
        isNitroActive: false,
        onGroundCount: camAltitude < 200 ? 4 : 0,
        speedKmh: this.missionPhysics.speed * 3.6
      });

      // Keep terrain & surface rocks updated around the active camera during launch and landing descent (< 8,000m)
      if (camAltitude < 8000) {
        this.terrain.update(this.camera.position);
        if (camAltitude < 1800) {
          this.scatter.update(this.camera.position);
        }
      }

      // Render Scene
      this.renderer.render(this.scene, this.camera);
      this.notifyFirstFrame();
      return;
    }

    // 2. Single-press triggers
    if (this.input.consumeSinglePress('cameraToggle')) {
      this.cameraController.nextMode();
    }

    if (this.input.consumeSinglePress('markBeacon')) {
      this.hud.addBeacon(this.physics.position);
    }

    if (this.input.consumeSinglePress('toggleLights')) {
      for (const light of this.roverModel.headlights) {
        light.visible = !light.visible;
      }
    }

    // 3. Update Vehicle Physics
    this.physics.update(dt, this.input.state);

    // Distance-cull Starbase launch complex in rover mode when beyond fog range (680m)
    const sbDx = this.physics.position.x - 1400;
    const sbDz = this.physics.position.z - 1150;
    this.starship.group.visible = (sbDx * sbDx + sbDz * sbDz) <= 680 * 680;

    // Collision impact feedback (boulders, monuments)
    if (this.physics.impact > 2.0) {
      const k = Math.min(2.0, this.physics.impact / 10.0);
      this.audio.playImpact(k);
      this.cameraController.addShake(this.physics.impact * 0.1);
      this.atmosphere.burstDust(this.physics.position, k * 0.7);
    }
    this.physics.impact = 0;

    // Landing impact detection
    if (this.lastOnGround === 0 && this.physics.onGroundCount > 0) {
      const impactSpeed = this.physics.landSpeed || 0;
      if (impactSpeed > 4.0) {
        this.audio.playImpact(Math.min(2.0, impactSpeed / 8.0));
        this.cameraController.addShake(impactSpeed * 0.08);
        this.atmosphere.burstDust(this.physics.position, Math.min(2.0, impactSpeed / 8.0));
      }
    }
    this.lastOnGround = this.physics.onGroundCount;

    // 4. Update Infinite Terrain & Scatter
    this.terrain.update(this.physics.position);
    this.scatter.update(this.physics.position);

    // 5. Update Atmosphere & Particles
    this.atmosphere.setViewScale(window.innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
    this.atmosphere.update(dt, this.physics.position, this.physics);

    // 6. Update Audio
    this.audio.update(this.physics);

    // 7. Update Dynamic Camera
    this.cameraController.update(dt, this.physics);

    // 8. Update HUD & Waypoints
    const nearbyPOIs = this.scatter.getNearbyPOIs(this.physics.position);
    this.hud.update(this.physics, this.camera, nearbyPOIs);

    // 9. Render Scene
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
