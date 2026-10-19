import * as THREE from 'three';
import { getMarsHeight } from './terrain/noise.js';

// Dynamic Multi-Mode Camera Controller with Full 360° Gimbal on All Cameras & First-Person Walking Simulation
export class MarsCameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.modes = ['CHASE', 'COCKPIT', 'ORBIT'];
    this.modeIndex = 0;

    this.flightModes = ['CHASE', 'BOOSTER_CAM', 'GROUND_CAM', 'TOWER_CAM', 'COCKPIT', 'FREE_ORBIT'];
    this.flightModeIndex = 0;

    this.targetPos = new THREE.Vector3();
    this.targetLook = new THREE.Vector3();
    this.currentPos = new THREE.Vector3();
    this.currentLook = new THREE.Vector3();

    this.cameraYaw = 0;
    this.initialized = false;

    // Universal 360-degree gimbal angles applied across ALL cameras (Rover, Walking, Flight)
    this.gimbalYaw = 0.0;
    this.gimbalPitch = 0.0;

    // Free Orbit zoom radius
    this.orbitTheta = 0.55;
    this.orbitPhi = 0.28;
    this.orbitRadius = 90.0;
    this.roverOrbitRadius = 11.0;

    // 360-degree Gimbal angles for stationary Ground Cam & Tower Cam
    this.groundGimbalYaw = Math.atan2(110, 95); // ~0.858 rad pointing directly at launch pad
    this.groundGimbalPitch = 0.24;              // looking slightly up at the full rocket stack & tower
    this.towerGimbalYaw = Math.atan2(-20, -6);  // ~-1.86 rad pointing at chopsticks & OLM
    this.towerGimbalPitch = -0.45;              // looking down across chopsticks

    this.activeSimMode = 'rover'; // 'rover' | 'walking' | 'starship'
    this.isDragging = false;
    this.dragMoved = false;
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
      if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest('button'))) return;
      this.isDragging = true;
      this.dragMoved = false;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.dragMoved = true;
      }
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      this.adjustGimbal(-dx * 0.0055, -dy * 0.0055);
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    this.domElement.addEventListener('wheel', (e) => {
      if (this.activeSimMode === 'starship') {
        this.orbitRadius = THREE.MathUtils.clamp(this.orbitRadius + e.deltaY * 0.08, 25.0, 320.0);
      } else if (this.activeSimMode === 'rover') {
        this.roverOrbitRadius = THREE.MathUtils.clamp(this.roverOrbitRadius + e.deltaY * 0.015, 5.0, 42.0);
      }
    }, { passive: true });
  }

  adjustGimbal(dYaw, dPitch) {
    if (this.activeSimMode === 'starship') {
      const mode = this.flightModes[this.flightModeIndex];
      if (mode === 'GROUND_CAM') {
        this.groundGimbalYaw += dYaw;
        this.groundGimbalPitch = THREE.MathUtils.clamp(this.groundGimbalPitch + dPitch, -1.48, 1.48);
        return;
      }
      if (mode === 'TOWER_CAM') {
        this.towerGimbalYaw += dYaw;
        this.towerGimbalPitch = THREE.MathUtils.clamp(this.towerGimbalPitch + dPitch, -1.48, 1.48);
        return;
      }
    }

    // Universal 360° gimbal for all Rover, Walking, and Flight cameras
    this.gimbalYaw += dYaw;
    this.gimbalPitch = THREE.MathUtils.clamp(this.gimbalPitch + dPitch, -1.42, 1.42);
    this.orbitTheta += dYaw;
    this.orbitPhi = THREE.MathUtils.clamp(this.orbitPhi - dPitch, -1.35, 1.35);
  }

  resetGimbal() {
    this.gimbalYaw = 0.0;
    this.gimbalPitch = 0.0;
    this.groundGimbalYaw = Math.atan2(110, 95);
    this.groundGimbalPitch = 0.24;
    this.towerGimbalYaw = Math.atan2(-20, -6);
    this.towerGimbalPitch = -0.45;
    this.orbitTheta = 0.55;
    this.orbitPhi = 0.28;
  }

  nextFlightMode() {
    this.flightModeIndex = (this.flightModeIndex + 1) % this.flightModes.length;
    return this.flightModes[this.flightModeIndex];
  }

  setFlightMode(modeName) {
    const idx = this.flightModes.indexOf(modeName);
    if (idx !== -1) {
      this.flightModeIndex = idx;
    }
    return this.flightModes[this.flightModeIndex];
  }

  getFlightMode() {
    return this.flightModes[this.flightModeIndex];
  }

  setRoverMode(modeName) {
    const idx = this.modes.indexOf(modeName);
    if (idx !== -1) {
      this.modeIndex = idx;
    }
    return this.modes[this.modeIndex];
  }

  getRoverMode() {
    return this.modes[this.modeIndex];
  }

  nextMode() {
    this.modeIndex = (this.modeIndex + 1) % this.modes.length;
    return this.modes[this.modeIndex];
  }

  addShake(amount) {
    this.shakeIntensity = Math.min(2.0, this.shakeIntensity + amount);
  }

  // First-Person Astronaut Walking Camera (Strictly 1st-Person, 360° Gimbal + Realistic Stride Head-Bob & Sway)
  updateWalking(dt, walker) {
    if (dt <= 0) return;
    this.activeSimMode = 'walking';

    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 68.0, Math.min(1.0, dt * 8.0));
    this.camera.updateProjectionMatrix();

    const totalYaw = walker.yaw + this.gimbalYaw;
    const totalPitch = THREE.MathUtils.clamp(this.gimbalPitch, -1.38, 1.38);

    // Kinematic stride head-bobbing (vertical 2x frequency, lateral 1x frequency, subtle roll tilt)
    const speedNorm = THREE.MathUtils.clamp(walker.speed / 5.5, 0.0, 1.35);
    const bobVertical = Math.sin(walker.stridePhase * 2.0) * 0.065 * speedNorm;
    const bobLateral = Math.cos(walker.stridePhase) * 0.038 * speedNorm;
    const bobRoll = Math.sin(walker.stridePhase) * 0.012 * speedNorm;

    // Breathing idle micro-motion when standing still
    const idleBreath = Math.sin(performance.now() * 0.0022) * 0.008;

    const rightX = Math.cos(totalYaw);
    const rightZ = -Math.sin(totalYaw);

    const eyeY = walker.position.y + 1.75 + bobVertical + idleBreath;
    this.currentPos.set(
      walker.position.x + rightX * bobLateral,
      eyeY,
      walker.position.z + rightZ * bobLateral
    );

    const cosP = Math.cos(totalPitch);
    const lookDirX = cosP * Math.sin(totalYaw);
    const lookDirY = Math.sin(totalPitch);
    const lookDirZ = cosP * Math.cos(totalYaw);

    this.currentLook.set(
      this.currentPos.x + lookDirX * 50.0,
      this.currentPos.y + lookDirY * 50.0,
      this.currentPos.z + lookDirZ * 50.0
    );

    this.camera.up.set(Math.sin(bobRoll) * rightX, Math.cos(bobRoll), Math.sin(bobRoll) * rightZ);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  update(dt, physics) {
    if (dt <= 0) return;
    this.activeSimMode = 'rover';
    this.camera.up.set(0, 1, 0);

    const roverPos = physics.position;
    const mode = this.modes[this.modeIndex];

    const speedRatio = Math.min(1.0, physics.speedKmh / 140.0);
    const nitroFactor = physics.isNitroActive ? 1.0 : 0.0;

    // Dynamic FOV widening during high speed & nitro
    const targetFov = this.baseFov + speedRatio * 14 + nitroFactor * 10;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1.0, dt * 6.0));
    this.camera.updateProjectionMatrix();

    if (!this.initialized) {
      this.cameraYaw = physics.yaw;
    }

    // Smoothly follow rover yaw via shortest angle
    let angleDiff = physics.yaw - this.cameraYaw;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    this.cameraYaw += angleDiff * Math.min(1.0, dt * 6.0);

    // Full 360-degree gimbal yaw & pitch applied to all Rover camera modes
    const viewYaw = this.cameraYaw + this.gimbalYaw;
    const viewPitch = this.gimbalPitch;
    const cosY = Math.cos(viewYaw);
    const sinY = Math.sin(viewYaw);

    if (mode === 'CHASE') {
      const dist = (8.8 + speedRatio * 2.0) * Math.cos(viewPitch * 0.65);
      const heightAbove = 3.6 - Math.sin(viewPitch) * 6.5;

      this.targetPos.set(
        roverPos.x - sinY * dist,
        roverPos.y + Math.max(1.2, heightAbove),
        roverPos.z - cosY * dist
      );

      this.targetLook.set(
        roverPos.x + sinY * 2.5,
        roverPos.y + 1.0 + Math.sin(viewPitch) * 1.5,
        roverPos.z + cosY * 2.5
      );

      if (!this.initialized) {
        this.currentPos.copy(this.targetPos);
        this.currentLook.copy(this.targetLook);
        this.initialized = true;
      } else {
        this.currentPos.lerp(this.targetPos, Math.min(1.0, dt * 10.0));
        this.currentLook.lerp(this.targetLook, Math.min(1.0, dt * 12.0));
      }

    } else if (mode === 'COCKPIT') {
      // Rover cabin visor with 360° gimbal look-around
      const fSin = Math.sin(physics.yaw);
      const fCos = Math.cos(physics.yaw);
      this.targetPos.set(
        roverPos.x + fSin * 0.75,
        roverPos.y + 1.32,
        roverPos.z + fCos * 0.75
      );
      const cosP = Math.cos(viewPitch);
      this.targetLook.set(
        this.targetPos.x + cosP * sinY * 30.0,
        this.targetPos.y + Math.sin(viewPitch) * 30.0,
        this.targetPos.z + cosP * cosY * 30.0
      );

      this.currentPos.copy(this.targetPos);
      this.currentLook.copy(this.targetLook);

    } else if (mode === 'ORBIT') {
      // Full 360-degree spherical gimbal orbit around the Rover
      const rad = this.roverOrbitRadius;
      const pitchAngle = THREE.MathUtils.clamp(0.32 - viewPitch, 0.05, 1.45);
      const horizRad = rad * Math.cos(pitchAngle);
      this.targetPos.set(
        roverPos.x - sinY * horizRad,
        roverPos.y + rad * Math.sin(pitchAngle),
        roverPos.z - cosY * horizRad
      );
      this.targetLook.set(roverPos.x, roverPos.y + 1.0, roverPos.z);

      this.currentPos.lerp(this.targetPos, Math.min(1.0, dt * 12.0));
      this.currentLook.lerp(this.targetLook, Math.min(1.0, dt * 14.0));
    }

    // Terrain collision clamp so camera never dips underground
    const camGround = getMarsHeight(this.currentPos.x, this.currentPos.z);
    if (this.currentPos.y < camGround + 1.05) {
      this.currentPos.y = camGround + 1.05;
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
    this.activeSimMode = 'starship';
    this.camera.up.set(0, 1, 0);

    const shipPos = physics.position;
    const phase = physics.phase;
    const alt = physics.altitude;
    const mode = this.flightModes[this.flightModeIndex] || 'CHASE';

    const stackCenterY = physics.vehicle?.isMated ? 45.0 : 25.0;

    if (mode === 'GROUND_CAM') {
      // Fixed stationary camera at Starbase observation mound with full 360° gimbal
      const padX = physics.padCoords.x;
      const padZ = physics.padCoords.y;
      const stationX = padX - 110.0;
      const stationZ = padZ - 95.0;
      const groundY = getMarsHeight(stationX, stationZ) + 4.5;
      this.currentPos.set(stationX, groundY, stationZ);

      const cosP = Math.cos(this.groundGimbalPitch);
      const lookDirX = cosP * Math.sin(this.groundGimbalYaw);
      const lookDirY = Math.sin(this.groundGimbalPitch);
      const lookDirZ = cosP * Math.cos(this.groundGimbalYaw);

      this.currentLook.set(
        this.currentPos.x + lookDirX * 150.0,
        this.currentPos.y + lookDirY * 150.0,
        this.currentPos.z + lookDirZ * 150.0
      );

      this.camera.fov = 58.0;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLook);
      return;
    }

    if (mode === 'TOWER_CAM') {
      // Fixed stationary camera mounted high on Mechazilla Tower (112m up) with full 360° gimbal
      const towerX = physics.padCoords.x + 20.0;
      const towerZ = physics.padCoords.y + 6.0;
      const towerY = physics.padElevation + 112.0;
      this.currentPos.set(towerX, towerY, towerZ);

      const cosP = Math.cos(this.towerGimbalPitch);
      const lookDirX = cosP * Math.sin(this.towerGimbalYaw);
      const lookDirY = Math.sin(this.towerGimbalPitch);
      const lookDirZ = cosP * Math.cos(this.towerGimbalYaw);

      this.currentLook.set(
        this.currentPos.x + lookDirX * 150.0,
        this.currentPos.y + lookDirY * 150.0,
        this.currentPos.z + lookDirZ * 150.0
      );

      this.camera.fov = 66.0;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLook);
      return;
    }

    if (mode === 'BOOSTER_CAM') {
      // Dedicated Super Heavy Booster tracking camera with full 360° gimbal orbit around Booster
      const isSeparated = physics.boosterState && physics.boosterState !== 'ATTACHED';
      const bPos = isSeparated ? physics.boosterPosition : shipPos;
      const rad = (physics.boosterState === 'APPROACH' || physics.boosterState === 'CAUGHT') ? 68.0 : 82.0;
      const ox = Math.cos(this.orbitPhi) * Math.sin(this.orbitTheta) * rad;
      const oy = Math.sin(this.orbitPhi) * rad;
      const oz = Math.cos(this.orbitPhi) * Math.cos(this.orbitTheta) * rad;
      this.currentPos.set(bPos.x + ox, bPos.y + 35.0 + oy, bPos.z + oz);
      this.currentLook.set(bPos.x, bPos.y + 35.0, bPos.z);

      this.camera.fov = 62.0;
      this.camera.updateProjectionMatrix();
      const gH = getMarsHeight(this.currentPos.x, this.currentPos.z);
      if (this.currentPos.y < gH + 3.0) this.currentPos.y = gH + 3.0;
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLook);
      return;
    }

    // FOV for Starship vehicle-mounted/chase modes
    const targetFov = this.baseFov + Math.min(14, (parseFloat(physics.mach) || 0) * 1.1);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1.0, dt * 4.0));
    this.camera.updateProjectionMatrix();

    if (mode === 'CHASE') {
      // Full 360° gimbal orbit around Starship (default angle frames ship + planet, drag or gimbal buttons rotate 360°)
      const baseYaw = (phase === 'ON_PAD' || phase === 'COUNTDOWN')
        ? Math.PI * 0.25
        : physics.yaw + Math.PI * 0.82;
      const totalYaw = baseYaw + this.gimbalYaw;
      const basePitch = (phase === 'HYPERSONIC_ENTRY' || phase === 'BELLYFLOP') ? 0.22 : 0.16;
      const totalPitch = THREE.MathUtils.clamp(basePitch - this.gimbalPitch, -1.35, 1.35);

      const camDist = (phase === 'ON_PAD' || phase === 'COUNTDOWN')
        ? 96.0
        : (phase === 'HYPERSONIC_ENTRY' || phase === 'BELLYFLOP')
          ? 68.0
          : 86.0 + Math.min(35.0, alt * 0.0005);

      const horizDist = camDist * Math.cos(totalPitch);
      const offsetX = Math.sin(totalYaw) * horizDist;
      const offsetY = camDist * Math.sin(totalPitch);
      const offsetZ = Math.cos(totalYaw) * horizDist;

      this.currentPos.set(shipPos.x + offsetX, shipPos.y + stackCenterY + offsetY, shipPos.z + offsetZ);
      this.currentLook.set(shipPos.x, shipPos.y + stackCenterY, shipPos.z);
    } else if (mode === 'COCKPIT') {
      // Starship flight deck camera with full 360° gimbal look-around
      const localNose = new THREE.Vector3(0, physics.vehicle?.isMated ? 115.0 : 42.0, 4.7);
      localNose.applyQuaternion(physics.quaternion);
      const nosePos = new THREE.Vector3().copy(shipPos).add(localNose);
      this.currentPos.copy(nosePos);

      const lookEuler = new THREE.Euler(
        physics.pitch + this.gimbalPitch,
        physics.yaw + this.gimbalYaw,
        physics.roll,
        'YXZ'
      );
      const lookDir = new THREE.Vector3(0, 1, 0).applyEuler(lookEuler).normalize();
      this.currentLook.copy(nosePos).addScaledVector(lookDir, 150.0);
    } else if (mode === 'FREE_ORBIT') {
      const ox = Math.cos(this.orbitPhi) * Math.sin(this.orbitTheta) * this.orbitRadius;
      const oy = Math.sin(this.orbitPhi) * this.orbitRadius;
      const oz = Math.cos(this.orbitPhi) * Math.cos(this.orbitTheta) * this.orbitRadius;

      this.currentPos.set(shipPos.x + ox, shipPos.y + stackCenterY + oy, shipPos.z + oz);
      this.currentLook.set(shipPos.x, shipPos.y + stackCenterY, shipPos.z);
    }

    // Subtle camera shake during engine burns and hypersonic re-entry
    let flightShake = 0;
    if (physics.throttle > 0.05) flightShake += physics.throttle * 0.12;
    if (physics.heat > 0.1) flightShake += physics.heat * 0.24;
    if (phase === 'HOT_STAGING') flightShake += 0.3;

    this.shakeIntensity = Math.max(this.shakeIntensity, flightShake);

    if (this.shakeIntensity > 0.001) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity * 0.28;
      const sy = (Math.random() - 0.5) * this.shakeIntensity * 0.28;
      const sz = (Math.random() - 0.5) * this.shakeIntensity * 0.28;
      this.camera.position.set(
        this.currentPos.x + sx,
        this.currentPos.y + sy,
        this.currentPos.z + sz
      );
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.2);
    } else {
      this.camera.position.copy(this.currentPos);
    }

    const groundH = getMarsHeight(this.camera.position.x, this.camera.position.z);
    if (this.camera.position.y < groundH + 2.5) {
      this.camera.position.y = groundH + 2.5;
    }

    this.camera.lookAt(this.currentLook);
  }
}
