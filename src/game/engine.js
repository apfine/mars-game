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

export class MarsGameEngine {
  constructor(container) {
    this.container = container;
    this.quality = 'High';
    this.gridEnabled = false;
    this.disposed = false;

    this.initRenderer();
    this.initScene();
    this.initSystems();
    this.initEvents();

    this.clock = new THREE.Clock();
    this.lastOnGround = 4;

    this.animate = this.animate.bind(this);
    this.animId = requestAnimationFrame(this.animate);
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true
    });

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(dpr);
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
    this.atmosphere = new MarsAtmosphere(this.scene);
    this.atmosphere.buildEnvironment(this.renderer);

    // 2. Terrain & Dunes
    this.terrain = new MarsTerrainManager(this.scene, { gridEnabled: 0.0 });

    // 3. Martian Scatter (Rocks & POIs)
    this.scatter = new MarsScatterManager(this.scene);

    // 4. Mars Rover & Physics
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

    if (this.input.isMobile) {
      this.applyQuality('Medium');
    }
  }

  applyQuality(preset) {
    this.quality = preset;
    this.atmosphere.setQuality(preset);
    const isLow = preset === 'Low';
    const isMed = preset === 'Medium';
    const isHigh = preset === 'High';
    const isUltra = preset === 'Ultra';

    if (isLow) {
      this.renderer.setPixelRatio(1.0);
      this.renderer.shadowMap.enabled = false;
      this.atmosphere.sunLight.castShadow = false;
    } else if (isMed) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      this.renderer.shadowMap.enabled = true;
      this.atmosphere.sunLight.shadow.mapSize.set(1024, 1024);
    } else if (isHigh) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.atmosphere.sunLight.shadow.mapSize.set(2048, 2048);
    } else if (isUltra) {
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      this.renderer.shadowMap.enabled = true;
      this.atmosphere.sunLight.shadow.mapSize.set(4096, 4096);
    }
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

    const dt = Math.min(this.clock.getDelta(), 0.05);

    // 1. Update Input State
    this.input.update();

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
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.startAudio);
    window.removeEventListener('touchstart', this.startAudio);
    window.removeEventListener('mousedown', this.startAudio);
    if (this.scene.environment && typeof this.scene.environment.dispose === 'function') {
      this.scene.environment.dispose();
    }
    this.terrain.dispose();
    this.renderer.dispose();
  }
}
