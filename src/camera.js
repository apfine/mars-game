import * as THREE from 'three';
import { getMarsHeight } from './terrain/noise.js';

// Dynamic Multi-Mode Camera Controller with Smooth Damped Follow and Impact Shake
export class MarsCameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.modes = ['CHASE', 'CLOSE', 'COCKPIT', 'DRONE'];
    this.modeIndex = 0;

    this.flightModes = ['CHASE', 'COCKPIT', 'PANORAMA', 'FREE_ORBIT', 'ENGINE_CAM'];
    this.flightModeIndex = 0;

    this.targetPos = new THREE.Vector3();
    this.targetLook = new THREE.Vector3();
    this.currentPos = new THREE.Vector3();
    this.currentLook = new THREE.Vector3();

    this.cameraYaw = 0;
    this.initialized = false;

    // Free Orbit drag controls for flight & inspection
    this.orbitTheta = 0.55;
    this.orbitPhi = 0.28;
    this.orbitRadius = 90.0;
    this.isDragging = false;
    this.lastPointerX = 0;
    this.lastPointerY = 0;

    if (this.domElement) {
      this.initPointerDrag();
    }

    this.baseFov = 65;
    this.camera.fov = this.baseFov;

    this.shakeIntensity = 0;
  }

  initPointerDrag() {
    this.domElement.addEventListener('pointerdown', (e) => {
      // Only drag if not clicking buttons
      if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest('button'))) return;
      this.isDragging = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      this.orbitTheta -= dx * 0.006;
      this.orbitPhi = THREE.MathUtils.clamp(this.orbitPhi + dy * 0.005, -1.35, 1.35);
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    this.domElement.addEventListener('wheel', (e) => {
      this.orbitRadius = THREE.MathUtils.clamp(this.orbitRadius + e.deltaY * 0.08, 25.0, 300.0);
    }, { passive: true });
  }

  nextFlightMode() {
    this.flightModeIndex = (this.flightModeIndex + 1) % this.flightModes.length;
    return this.flightModes[this.flightModeIndex];
  }

  getFlightMode() {
    return this.flightModes[this.flightModeIndex];
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
    const mode = this.flightModes[this.flightModeIndex] || 'CHASE';

    // FOV expands dynamically with hypersonic velocity
    const targetFov = this.baseFov + Math.min(24, (parseFloat(physics.mach) || 0) * 1.8);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1.0, dt * 4.0));
    this.camera.updateProjectionMatrix();

    const forward = new THREE.Vector3(
      Math.sin(physics.pitch) * Math.sin(physics.yaw),
      Math.cos(physics.pitch),
      Math.sin(physics.pitch) * Math.cos(physics.yaw)
    ).normalize();

    const stackCenterY = physics.vehicle?.isMated ? 45.0 : 25.0;

    if (mode === 'CHASE') {
      if (phase === 'ON_PAD' || phase === 'COUNTDOWN') {
        // Dramatic pad view: ground-level looking up along the 120m stack
        this.currentPos.set(shipPos.x + 75, shipPos.y + 14, shipPos.z + 75);
        this.currentLook.set(shipPos.x, shipPos.y + 50, shipPos.z);
      } else if (phase === 'DEORBIT' || phase === 'HYPERSONIC_ENTRY' || phase === 'BELLYFLOP') {
        // Re-entry & belly-flop: 45 degree angle showing heat shield & plasma ionization
        this.currentPos.set(shipPos.x + 45, shipPos.y + 12, shipPos.z + 55);
        this.currentLook.set(shipPos.x, shipPos.y + stackCenterY, shipPos.z);
      } else {
        // Velocity/Attitude-aligned chase camera: ZERO lerping on ship coordinates to prevent high-speed lag!
        const camDist = 80.0 + Math.min(50.0, alt * 0.001);
        const offsetX = -Math.sin(physics.yaw) * camDist;
        const offsetY = -Math.cos(physics.pitch) * camDist * 0.45;
        const offsetZ = -Math.cos(physics.yaw) * camDist;

        this.currentPos.set(shipPos.x + offsetX, shipPos.y + offsetY, shipPos.z + offsetZ);
        this.currentLook.set(shipPos.x, shipPos.y + stackCenterY, shipPos.z);
      }
    } else if (mode === 'COCKPIT') {
      // First-person cockpit view: mounted at the Starship forward nosecone visor looking out
      const noseHeight = physics.vehicle?.isMated ? 115.0 : 42.0;
      const nosePos = new THREE.Vector3(shipPos.x, shipPos.y + noseHeight, shipPos.z);
      this.currentPos.copy(nosePos);
      this.currentLook.copy(nosePos).addScaledVector(forward, 150.0);
    } else if (mode === 'PANORAMA') {
      // Wide panoramic side view: vehicle profile against space and Mars
      const sideAngle = physics.yaw + Math.PI * 0.5;
      const camDist = 110.0;
      this.currentPos.set(
        shipPos.x + Math.sin(sideAngle) * camDist,
        shipPos.y + stackCenterY + 10,
        shipPos.z + Math.cos(sideAngle) * camDist
      );
      this.currentLook.set(shipPos.x, shipPos.y + stackCenterY, shipPos.z);
    } else if (mode === 'FREE_ORBIT') {
      // Full 360-degree interactive orbital camera: mouse/touch drag orbits around vehicle!
      const ox = Math.cos(this.orbitPhi) * Math.sin(this.orbitTheta) * this.orbitRadius;
      const oy = Math.sin(this.orbitPhi) * this.orbitRadius;
      const oz = Math.cos(this.orbitPhi) * Math.cos(this.orbitTheta) * this.orbitRadius;

      this.currentPos.set(shipPos.x + ox, shipPos.y + stackCenterY + oy, shipPos.z + oz);
      this.currentLook.set(shipPos.x, shipPos.y + stackCenterY, shipPos.z);
    } else if (mode === 'ENGINE_CAM') {
      // Downward look from interstage ring towards the 33 Raptor engines and flame plume
      const engOffset = new THREE.Vector3(14, 18, 14);
      this.currentPos.set(shipPos.x + engOffset.x, shipPos.y + engOffset.y, shipPos.z + engOffset.z);
      this.currentLook.set(shipPos.x, shipPos.y - 30, shipPos.z);
    }

    // Camera shake during engine burns and hypersonic re-entry
    let flightShake = 0;
    if (physics.throttle > 0.05) flightShake += physics.throttle * 0.16;
    if (physics.heat > 0.1) flightShake += physics.heat * 0.35;
    if (phase === 'HOT_STAGING') flightShake += 0.45;
    if (phase === 'LANDING_FLIP') flightShake += 0.3;

    this.shakeIntensity = Math.max(this.shakeIntensity, flightShake);

    if (this.shakeIntensity > 0.001) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity * 0.35;
      const sy = (Math.random() - 0.5) * this.shakeIntensity * 0.35;
      const sz = (Math.random() - 0.5) * this.shakeIntensity * 0.35;
      this.camera.position.set(
        this.currentPos.x + sx,
        this.currentPos.y + sy,
        this.currentPos.z + sz
      );
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.2);
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
