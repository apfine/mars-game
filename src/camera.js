import * as THREE from 'three';

// Dynamic Multi-Mode Camera Controller with Nitro Speed Warp & Impact Shake
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
    const roverPos = physics.position;
    const forward = physics._vForward;
    const up = physics._vUp;
    const mode = this.modes[this.modeIndex];

    const speedRatio = Math.min(1.0, physics.speedKmh / 140.0);
    const nitroFactor = physics.isNitroActive ? 1.0 : 0.0;

    // Dynamic FOV widening during high speed & nitro
    const targetFov = this.baseFov + speedRatio * 15 + nitroFactor * 12;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 5);
    this.camera.updateProjectionMatrix();

    if (mode === 'CHASE') {
      // Smooth behind and above rover
      const distBehind = 9.5 + speedRatio * 2.5;
      const heightAbove = 4.2;

      this.targetPos.copy(roverPos)
        .sub(forward.clone().multiplyScalar(distBehind))
        .add(new THREE.Vector3(0, heightAbove, 0));

      this.targetLook.copy(roverPos).add(new THREE.Vector3(0, 1.2, 0)).add(forward.clone().multiplyScalar(6.0));

      const lerpFactor = dt * 6.5;
      this.currentPos.lerp(this.targetPos, lerpFactor);
      this.currentLook.lerp(this.targetLook, lerpFactor * 1.2);

    } else if (mode === 'CLOSE') {
      const distBehind = 6.0;
      const heightAbove = 2.4;

      this.targetPos.copy(roverPos)
        .sub(forward.clone().multiplyScalar(distBehind))
        .add(new THREE.Vector3(0, heightAbove, 0));

      this.targetLook.copy(roverPos).add(new THREE.Vector3(0, 1.0, 0)).add(forward.clone().multiplyScalar(8.0));

      const lerpFactor = dt * 10.0;
      this.currentPos.lerp(this.targetPos, lerpFactor);
      this.currentLook.lerp(this.targetLook, lerpFactor);

    } else if (mode === 'COCKPIT') {
      // Mount near windshield visor
      this.targetPos.copy(roverPos).add(new THREE.Vector3(0, 1.4, 0)).add(forward.clone().multiplyScalar(0.9));
      this.targetLook.copy(this.targetPos).add(forward.clone().multiplyScalar(20.0));

      this.currentPos.copy(this.targetPos);
      this.currentLook.lerp(this.targetLook, dt * 18.0);

    } else if (mode === 'DRONE') {
      // High-altitude bird's eye view
      this.targetPos.copy(roverPos).add(new THREE.Vector3(0, 32.0, -18.0));
      this.targetLook.copy(roverPos);

      this.currentPos.lerp(this.targetPos, dt * 4.0);
      this.currentLook.lerp(this.targetLook, dt * 6.0);
    }

    // Camera impact & nitro vibration shake
    if (physics.isNitroActive) {
      this.shakeIntensity = Math.max(this.shakeIntensity, 0.18);
    }

    if (this.shakeIntensity > 0.001) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity * 0.35;
      const sy = (Math.random() - 0.5) * this.shakeIntensity * 0.35;
      const sz = (Math.random() - 0.5) * this.shakeIntensity * 0.35;
      this.camera.position.copy(this.currentPos).add(new THREE.Vector3(sx, sy, sz));
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.5);
    } else {
      this.camera.position.copy(this.currentPos);
    }

    this.camera.lookAt(this.currentLook);
  }
}
