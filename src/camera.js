import * as THREE from 'three';
import { getMarsHeight } from './terrain/noise.js';

// Dynamic Multi-Mode Camera Controller with Smooth Damped Follow and Impact Shake
export class MarsCameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.modes = ['CHASE', 'CLOSE', 'COCKPIT', 'DRONE'];
    this.modeIndex = 0;

    this.targetPos = new THREE.Vector3();
    this.targetLook = new THREE.Vector3();
    this.currentPos = new THREE.Vector3();
    this.currentLook = new THREE.Vector3();

    this.cameraYaw = 0;
    this.initialized = false;

    this.baseFov = 65;
    this.camera.fov = this.baseFov;

    this.shakeIntensity = 0;
  }

  nextMode() {
    this.modeIndex = (this.modeIndex + 1) % this.modes.length;
    return this.modes[this.modeIndex];
  }

  addShake(amount) {
    this.shakeIntensity = Math.min(2.0, this.shakeIntensity + amount);
  }

  update(dt, physics) {
    if (dt <= 0) return;
    const roverPos = physics.position;
    const mode = this.modes[this.modeIndex];

    const speedRatio = Math.min(1.0, physics.speedKmh / 140.0);
    const nitroFactor = physics.isNitroActive ? 1.0 : 0.0;

    // Dynamic FOV widening during high speed & nitro
    const targetFov = this.baseFov + speedRatio * 14 + nitroFactor * 10;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1.0, dt * 6.0));
    this.camera.updateProjectionMatrix();

    // Initialize immediately on first frame
    if (!this.initialized) {
      this.cameraYaw = physics.yaw;
    }

    // Smoothly follow rover yaw via shortest angle
    let angleDiff = physics.yaw - this.cameraYaw;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    this.cameraYaw += angleDiff * Math.min(1.0, dt * 6.0);

    const cosY = Math.cos(this.cameraYaw);
    const sinY = Math.sin(this.cameraYaw);

    if (mode === 'CHASE') {
      const distBehind = 8.5 + speedRatio * 2.0;
      const heightAbove = 3.6;

      this.targetPos.set(
        roverPos.x - sinY * distBehind,
        roverPos.y + heightAbove,
        roverPos.z - cosY * distBehind
      );

      this.targetLook.set(
        roverPos.x + sinY * 3.5,
        roverPos.y + 0.9,
        roverPos.z + cosY * 3.5
      );

      if (!this.initialized) {
        this.currentPos.copy(this.targetPos);
        this.currentLook.copy(this.targetLook);
        this.initialized = true;
      } else {
        this.currentPos.lerp(this.targetPos, Math.min(1.0, dt * 8.0));
        this.currentLook.lerp(this.targetLook, Math.min(1.0, dt * 10.0));
      }

    } else if (mode === 'CLOSE') {
      const distBehind = 5.5;
      const heightAbove = 2.2;

      this.targetPos.set(
        roverPos.x - sinY * distBehind,
        roverPos.y + heightAbove,
        roverPos.z - cosY * distBehind
      );

      this.targetLook.set(
        roverPos.x + sinY * 4.0,
        roverPos.y + 0.8,
        roverPos.z + cosY * 4.0
      );

      if (!this.initialized) {
        this.currentPos.copy(this.targetPos);
        this.currentLook.copy(this.targetLook);
        this.initialized = true;
      } else {
        this.currentPos.lerp(this.targetPos, Math.min(1.0, dt * 12.0));
        this.currentLook.lerp(this.targetLook, Math.min(1.0, dt * 14.0));
      }

    } else if (mode === 'COCKPIT') {
      // Windshield visor view
      this.targetPos.set(
        roverPos.x + sinY * 0.8,
        roverPos.y + 1.2,
        roverPos.z + cosY * 0.8
      );
      this.targetLook.set(
        roverPos.x + sinY * 20.0,
        roverPos.y + 1.0,
        roverPos.z + cosY * 20.0
      );

      this.currentPos.copy(this.targetPos);
      this.currentLook.lerp(this.targetLook, Math.min(1.0, dt * 20.0));

    } else if (mode === 'DRONE') {
      // High bird's-eye view
      this.targetPos.set(
        roverPos.x - sinY * 16.0,
        roverPos.y + 24.0,
        roverPos.z - cosY * 16.0
      );
      this.targetLook.copy(roverPos);

      this.currentPos.lerp(this.targetPos, Math.min(1.0, dt * 4.0));
      this.currentLook.lerp(this.targetLook, Math.min(1.0, dt * 6.0));
    }

    // Terrain collision clamp so camera never dips underground
    const camGround = getMarsHeight(this.currentPos.x, this.currentPos.z);
    if (this.currentPos.y < camGround + 1.2) {
      this.currentPos.y = camGround + 1.2;
    }

    // Camera impact & nitro vibration shake
    if (physics.isNitroActive) {
      this.shakeIntensity = Math.max(this.shakeIntensity, 0.1);
    }

    if (this.shakeIntensity > 0.001) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity * 0.2;
      const sy = (Math.random() - 0.5) * this.shakeIntensity * 0.2;
      const sz = (Math.random() - 0.5) * this.shakeIntensity * 0.2;
      this.camera.position.set(
        this.currentPos.x + sx,
        this.currentPos.y + sy,
        this.currentPos.z + sz
      );
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.5);
    } else {
      this.camera.position.copy(this.currentPos);
    }

    this.camera.lookAt(this.currentLook);
  }

  updateFlight(dt, physics) {
    if (dt <= 0) return;

    const shipPos = physics.position;
    const phase = physics.phase;
    const alt = physics.altitude;

    // FOV expands dynamically with hypersonic velocity
    const targetFov = this.baseFov + Math.min(26, (parseFloat(physics.mach) || 0) * 2.2);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1.0, dt * 4.0));
    this.camera.updateProjectionMatrix();

    if (phase === 'ON_PAD' || phase === 'COUNTDOWN') {
      // Dramatic pad view: ground-level looking up along the 120m stack
      this.targetPos.set(shipPos.x + 85, shipPos.y + 12, shipPos.z + 85);
      this.targetLook.set(shipPos.x, shipPos.y + 55, shipPos.z);
    } else if (phase === 'BOOSTER_ASCENT' || phase === 'HOT_STAGING') {
      // Cinematic chase view tracking upward
      const camDist = 95 + Math.min(60, alt * 0.002);
      this.targetPos.set(
        shipPos.x - Math.sin(physics.yaw) * camDist,
        shipPos.y - 15,
        shipPos.z - Math.cos(physics.yaw) * camDist
      );
      this.targetLook.set(shipPos.x, shipPos.y + 25, shipPos.z);
    } else if (phase === 'STARSHIP_ASCENT' || phase === 'ORBIT') {
      // Orbital wide camera: Starship against the black of space and the curve of Mars
      const camDist = 80;
      this.targetPos.set(
        shipPos.x + 50,
        shipPos.y + 20,
        shipPos.z + camDist
      );
      this.targetLook.copy(shipPos);
    } else if (phase === 'DEORBIT' || phase === 'HYPERSONIC_ENTRY') {
      // Re-entry dramatic side angle showing plasma flow over the heatshield tiles
      this.targetPos.set(
        shipPos.x + 45,
        shipPos.y + 10,
        shipPos.z + 55
      );
      this.targetLook.copy(shipPos);
    } else if (phase === 'BELLYFLOP') {
      // Bellyflop skydive view: looking at the belly flaps trimming the dive
      this.targetPos.set(
        shipPos.x + 40,
        shipPos.y - 12,
        shipPos.z + 40
      );
      this.targetLook.copy(shipPos);
    } else if (phase === 'LANDING_FLIP' || phase === 'TOUCHDOWN' || phase === 'LANDED') {
      // Landing view: low angle tracking the touchdown on Mars
      const groundY = getMarsHeight(shipPos.x, shipPos.z);
      this.targetPos.set(
        shipPos.x + 60,
        Math.max(groundY + 8, shipPos.y - 12),
        shipPos.z + 60
      );
      this.targetLook.set(shipPos.x, shipPos.y + 20, shipPos.z);
    }

    if (!this.initialized) {
      this.currentPos.copy(this.targetPos);
      this.currentLook.copy(this.targetLook);
      this.initialized = true;
    } else {
      this.currentPos.lerp(this.targetPos, Math.min(1.0, dt * 5.0));
      this.currentLook.lerp(this.targetLook, Math.min(1.0, dt * 7.0));
    }

    // Camera shake during engine burns and hypersonic re-entry
    let flightShake = 0;
    if (physics.throttle > 0.05) flightShake += physics.throttle * 0.18;
    if (physics.heat > 0.1) flightShake += physics.heat * 0.35;
    if (phase === 'HOT_STAGING') flightShake += 0.45;
    if (phase === 'LANDING_FLIP') flightShake += 0.3;

    this.shakeIntensity = Math.max(this.shakeIntensity, flightShake);

    if (this.shakeIntensity > 0.001) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity * 0.4;
      const sy = (Math.random() - 0.5) * this.shakeIntensity * 0.4;
      const sz = (Math.random() - 0.5) * this.shakeIntensity * 0.4;
      this.camera.position.set(
        this.currentPos.x + sx,
        this.currentPos.y + sy,
        this.currentPos.z + sz
      );
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.0);
    } else {
      this.camera.position.copy(this.currentPos);
    }

    // Keep camera above ground when low
    const groundH = getMarsHeight(this.camera.position.x, this.camera.position.z);
    if (this.camera.position.y < groundH + 3.0) {
      this.camera.position.y = groundH + 3.0;
    }

    this.camera.lookAt(this.currentLook);
  }
}
