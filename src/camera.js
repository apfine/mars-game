import * as THREE from 'three';
import { getMarsHeight } from './terrain/noise.js';

// Dynamic Multi-Mode Camera Controller with Smooth Damped Follow and Impact Shake
export class MarsCameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.modes = ['CHASE', 'CLOSE', 'COCKPIT', 'DRONE'];
    this.modeIndex = 0;

    this.flightModes = ['CHASE', 'BOOSTER_CAM', 'GROUND_CAM', 'TOWER_CAM', 'COCKPIT', 'FREE_ORBIT'];
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

    // 360-degree Gimbal angles for stationary Ground Cam & Tower Cam
    // Ground cam sits at (padX - 110, padZ - 95) looking northeast (+X, +Z) at pad
    this.groundGimbalYaw = Math.atan2(110, 95); // ~0.858 rad pointing directly at launch pad
    this.groundGimbalPitch = 0.24;              // looking slightly up at the full rocket stack & tower
    // Tower cam sits at (padX + 20, padElevation + 112, padZ + 6) looking at chopsticks & pad center
    this.towerGimbalYaw = Math.atan2(-20, -6);  // ~-1.86 rad pointing at chopsticks & OLM
    this.towerGimbalPitch = -0.45;              // looking down across chopsticks

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

      const mode = this.flightModes[this.flightModeIndex];
      if (mode === 'GROUND_CAM') {
        this.groundGimbalYaw -= dx * 0.005;
        this.groundGimbalPitch = THREE.MathUtils.clamp(this.groundGimbalPitch - dy * 0.005, -1.48, 1.48);
      } else if (mode === 'TOWER_CAM') {
        this.towerGimbalYaw -= dx * 0.005;
        this.towerGimbalPitch = THREE.MathUtils.clamp(this.towerGimbalPitch - dy * 0.005, -1.48, 1.48);
      } else {
        this.orbitTheta -= dx * 0.006;
        this.orbitPhi = THREE.MathUtils.clamp(this.orbitPhi + dy * 0.005, -1.35, 1.35);
      }
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    this.domElement.addEventListener('wheel', (e) => {
      this.orbitRadius = THREE.MathUtils.clamp(this.orbitRadius + e.deltaY * 0.08, 25.0, 300.0);
    }, { passive: true });
  }

  adjustGimbal(dYaw, dPitch) {
    const mode = this.flightModes[this.flightModeIndex];
    if (mode === 'GROUND_CAM') {
      this.groundGimbalYaw += dYaw;
      this.groundGimbalPitch = THREE.MathUtils.clamp(this.groundGimbalPitch + dPitch, -1.48, 1.48);
    } else if (mode === 'TOWER_CAM') {
      this.towerGimbalYaw += dYaw;
      this.towerGimbalPitch = THREE.MathUtils.clamp(this.towerGimbalPitch + dPitch, -1.48, 1.48);
    } else {
      this.orbitTheta += dYaw;
      this.orbitPhi = THREE.MathUtils.clamp(this.orbitPhi - dPitch, -1.35, 1.35);
    }
  }

  resetGimbal() {
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

  updateFlight(dt, physics, inputState = null) {
    if (dt <= 0) return;

    const shipPos = physics.position;
    const phase = physics.phase;
    const alt = physics.altitude;
    const mode = this.flightModes[this.flightModeIndex] || 'CHASE';

    const forward = new THREE.Vector3(
      Math.sin(physics.pitch) * Math.sin(physics.yaw),
      Math.cos(physics.pitch),
      Math.sin(physics.pitch) * Math.cos(physics.yaw)
    ).normalize();

    const stackCenterY = physics.vehicle?.isMated ? 45.0 : 25.0;

    if (mode === 'GROUND_CAM') {
      // Fixed stationary camera at Starbase observation mound (does NOT auto-track Starship into space or skew FOV!)
      // Supports 360-degree manual gimbal rotation via pointer drag or on-screen gimbal buttons
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
      // Fixed stationary camera mounted high on Mechazilla Tower (112m up)
      // Constant FOV, no skewing, full 360-degree gimbal look in all directions
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
      // Dedicated Super Heavy Booster tracking camera:
      // Follows the Booster during ascent, boostback burn, supersonic grid-fin descent, and Mechazilla chopsticks catch!
      const isSeparated = physics.boosterState && physics.boosterState !== 'ATTACHED';
      const bPos = isSeparated ? physics.boosterPosition : shipPos;

      if (physics.boosterState === 'APPROACH' || physics.boosterState === 'CAUGHT') {
        // Dramatic catch framing: shows Booster descending between the Mechazilla Chopsticks and clamping onto the tower!
        const ox = Math.cos(this.orbitPhi) * Math.sin(this.orbitTheta) * 62.0;
        const oy = Math.sin(this.orbitPhi) * 35.0;
        const oz = Math.cos(this.orbitPhi) * Math.cos(this.orbitTheta) * 62.0;
        this.currentPos.set(bPos.x - 42.0 + ox * 0.4, bPos.y + 32.0 + oy * 0.4, bPos.z + 48.0 + oz * 0.4);
        this.currentLook.set(bPos.x + 4.0, bPos.y + 38.0, bPos.z);
      } else {
        // Orbitable chase view locked onto the Super Heavy Booster body & 33 Raptors / Grid Fins
        const rad = 78.0;
        const ox = Math.cos(this.orbitPhi) * Math.sin(this.orbitTheta) * rad;
        const oy = Math.sin(this.orbitPhi) * rad;
        const oz = Math.cos(this.orbitPhi) * Math.cos(this.orbitTheta) * rad;
        this.currentPos.set(bPos.x + ox, bPos.y + 34.0 + oy, bPos.z + oz);
        this.currentLook.set(bPos.x, bPos.y + 35.0, bPos.z);
      }

      this.camera.fov = 62.0;
      this.camera.updateProjectionMatrix();
      const gH = getMarsHeight(this.currentPos.x, this.currentPos.z);
      if (this.currentPos.y < gH + 3.0) this.currentPos.y = gH + 3.0;
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLook);
      return;
    }

    // FOV for Starship vehicle-mounted/chase modes
    const targetFov = this.baseFov + Math.min(18, (parseFloat(physics.mach) || 0) * 1.4);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1.0, dt * 4.0));
    this.camera.updateProjectionMatrix();

    if (mode === 'CHASE') {
      if (phase === 'ON_PAD' || phase === 'COUNTDOWN') {
        this.currentPos.set(shipPos.x + 75, shipPos.y + 14, shipPos.z + 75);
        this.currentLook.set(shipPos.x, shipPos.y + 50, shipPos.z);
      } else if (phase === 'DEORBIT' || phase === 'HYPERSONIC_ENTRY' || phase === 'BELLYFLOP') {
        this.currentPos.set(shipPos.x + 45, shipPos.y + 12, shipPos.z + 55);
        this.currentLook.set(shipPos.x, shipPos.y + stackCenterY, shipPos.z);
      } else if (phase === 'ORBIT') {
        const orbitAngle = physics.yaw + 0.85;
        const orbitDist = 130.0;
        this.currentPos.set(
          shipPos.x + Math.sin(orbitAngle) * orbitDist,
          shipPos.y + 20.0,
          shipPos.z + Math.cos(orbitAngle) * orbitDist
        );
        this.currentLook.set(shipPos.x, shipPos.y + stackCenterY, shipPos.z);
      } else {
        const camDist = 85.0 + Math.min(50.0, alt * 0.0008);
        const behindAngle = physics.yaw + Math.PI;
        const sideAngle = physics.yaw + Math.PI * 0.5;
        const offsetX = Math.sin(behindAngle) * camDist * 0.85 + Math.sin(sideAngle) * 22.0;
        const offsetY = THREE.MathUtils.lerp(18.0, -Math.cos(physics.pitch) * camDist * 0.45, Math.min(1.0, alt / 20000.0));
        const offsetZ = Math.cos(behindAngle) * camDist * 0.85 + Math.cos(sideAngle) * 22.0;

        this.currentPos.set(shipPos.x + offsetX, shipPos.y + offsetY, shipPos.z + offsetZ);
        this.currentLook.set(shipPos.x, shipPos.y + stackCenterY + 12.0, shipPos.z);
      }
    } else if (mode === 'COCKPIT') {
      const noseHeight = physics.vehicle?.isMated ? 115.0 : 42.0;
      const nosePos = new THREE.Vector3(shipPos.x, shipPos.y + noseHeight, shipPos.z);
      this.currentPos.copy(nosePos);
      this.currentLook.copy(nosePos).addScaledVector(forward, 150.0);
    } else if (mode === 'FREE_ORBIT') {
      const ox = Math.cos(this.orbitPhi) * Math.sin(this.orbitTheta) * this.orbitRadius;
      const oy = Math.sin(this.orbitPhi) * this.orbitRadius;
      const oz = Math.cos(this.orbitPhi) * Math.cos(this.orbitTheta) * this.orbitRadius;

      this.currentPos.set(shipPos.x + ox, shipPos.y + stackCenterY + oy, shipPos.z + oz);
      this.currentLook.set(shipPos.x, shipPos.y + stackCenterY, shipPos.z);
    }

    // Subtle camera shake during engine burns and hypersonic re-entry
    let flightShake = 0;
    if (physics.throttle > 0.05) flightShake += physics.throttle * 0.14;
    if (physics.heat > 0.1) flightShake += physics.heat * 0.28;
    if (phase === 'HOT_STAGING') flightShake += 0.35;
    if (phase === 'LANDING_FLIP') flightShake += 0.25;

    this.shakeIntensity = Math.max(this.shakeIntensity, flightShake);

    if (this.shakeIntensity > 0.001) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity * 0.3;
      const sy = (Math.random() - 0.5) * this.shakeIntensity * 0.3;
      const sz = (Math.random() - 0.5) * this.shakeIntensity * 0.3;
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
    if (this.camera.position.y < groundH + 3.0) {
      this.camera.position.y = groundH + 3.0;
    }

    this.camera.lookAt(this.currentLook);
  }
}
