import * as THREE from 'three';
import { FLIGHT_PHASES } from './missionPhysics.js';

// ---------------------------------------------------------------------------
// Flying Tesla Roadster + Starman.
//
// This is a deliberate, physics-adjacent easter egg rather than a car driving
// on the surface: it hovers/orbits the Starbase and can accompany the ship in
// orbit and on interplanetary cruise. It works on both Mars and Earth.
// ---------------------------------------------------------------------------
export class FlyingRoadster {
  constructor(scene, physics, options = {}) {
    this.scene = scene;
    this.physics = physics;
    this.options = options;
    this.enabled = false;
    this.time = 0;
    this.planetId = 'mars';

    this.group = new THREE.Group();
    this.group.name = 'FLYING_ROADSTER';
    this.group.visible = false;
    this.scene.add(this.group);

    this.buildModel();
    this._anchor = new THREE.Vector3();
    this._tangent = new THREE.Vector3();
  }

  buildModel() {
    const paint = new THREE.MeshStandardMaterial({
      color: 0xb5121b,
      metalness: 0.85,
      roughness: 0.24
    });
    const black = new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.4, roughness: 0.6 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0e2133,
      metalness: 0.1,
      roughness: 0.06,
      transparent: true,
      opacity: 0.72,
      transmission: 0.15
    });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd6dde2, metalness: 0.95, roughness: 0.18 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf3f5f6, roughness: 0.5, metalness: 0.05 });
    const visor = new THREE.MeshStandardMaterial({
      color: 0x0a0c10,
      metalness: 0.85,
      roughness: 0.15
    });

    // Wide, low supercar silhouette.
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.5, 4.35), paint);
    body.position.y = 0.48;
    body.geometry.translate(0, 0, 0);
    this.group.add(body);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 1.1), paint);
    nose.position.set(0, 0.56, 2.35);
    nose.rotation.x = -0.06;
    this.group.add(nose);

    const rear = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.42, 1.0), paint);
    rear.position.set(0, 0.58, -2.0);
    this.group.add(rear);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.55, 1.85), glass);
    cabin.position.set(0, 0.92, -0.15);
    this.group.add(cabin);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.2), paint);
    roof.position.set(0, 1.21, -0.22);
    this.group.add(roof);

    // Windshield frames
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 6), chrome);
      pillar.position.set(side * 0.76, 0.97, 0.64);
      pillar.rotation.x = 0.3;
      this.group.add(pillar);
    }

    // Wheels with chrome hub caps.
    const wheelPositions = [
      [-1.03, 0.36, 1.38], [1.03, 0.36, 1.38],
      [-1.03, 0.36, -1.46], [1.03, 0.36, -1.46]
    ];
    for (const [x, y, z] of wheelPositions) {
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.24, 20), black);
      tyre.rotation.z = Math.PI / 2;
      tyre.position.set(x, y, z);
      this.group.add(tyre);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 12), chrome);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, y, z);
      this.group.add(hub);
    }

    // Headlights / tail lights.
    const headMat = new THREE.MeshBasicMaterial({ color: 0xd9f2ff });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff1c1c });
    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), headMat);
      head.position.set(side * 0.63, 0.63, 2.88);
      this.group.add(head);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.07), tailMat);
      tail.position.set(side * 0.64, 0.65, -2.5);
      this.group.add(tail);
    }

    // Starman in the driver seat.
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.24, 5, 10), white);
    torso.position.set(-0.38, 1.18, -0.16);
    torso.rotation.x = -0.18;
    this.group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), white);
    head.position.set(-0.38, 1.54, -0.15);
    this.group.add(head);

    const face = new THREE.Mesh(
      new THREE.SphereGeometry(0.135, 12, 8, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.3, Math.PI * 0.38),
      visor
    );
    face.position.set(-0.38, 1.55, -0.04);
    face.rotation.x = -0.1;
    this.group.add(face);

    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.28, 4, 8), white);
    arm.position.set(-0.53, 1.16, 0.1);
    arm.rotation.z = 0.7;
    arm.rotation.x = -0.6;
    this.group.add(arm);
    const arm2 = arm.clone();
    arm2.position.x = -0.23;
    arm2.rotation.z = -0.7;
    this.group.add(arm2);

    // Underbody hover thrusters and their glow cones.
    this.thrusterMats = [];
    this.flames = [];
    for (const [x, z] of [[-0.7, 0.9], [0.7, 0.9], [-0.7, -1.0], [0.7, -1.0]]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.24, 10), chrome);
      pod.position.set(x, 0.22, z);
      this.group.add(pod);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x72d8ff,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      this.thrusterMats.push(mat);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.15, 10), mat);
      flame.rotation.x = Math.PI;
      flame.position.set(x, -0.33, z);
      this.group.add(flame);
      this.flames.push(flame);
    }

    const glow = new THREE.PointLight(0x59c8ff, 1.4, 14, 2);
    glow.position.set(0, -0.2, 0);
    this.group.add(glow);

    this.group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  toggle() {
    this.enabled = !this.enabled;
    this.group.visible = this.enabled;
    return this.enabled;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.group.visible = this.enabled;
  }

  setPlanet(planetId) {
    this.planetId = planetId;
  }

  board(startPos, startYaw = 0) {
    this.enabled = true;
    this.isPiloted = true;
    this.group.visible = true;
    this.speed = 0;
    this.verticalSpeed = 0;
    this.yaw = startYaw;
    this.pitch = 0;
    this.roll = 0;
    this.group.position.set(startPos.x, startPos.y + 1.5, startPos.z);
    return true;
  }

  disembark() {
    this.isPiloted = false;
    return this.group.position.clone();
  }

  updatePiloted(dt, input, getSurfaceHeight = null, resolveCollisions = null) {
    this.time += dt;
    const isBoost = Boolean(input.nitro);
    const maxSpeed = isBoost ? 82.0 : 48.0;

    // Steering & Yaw rotation
    if (Math.abs(input.steer) > 0.02) {
      this.yaw += -input.steer * 2.2 * dt;
    }

    // Forward/Backward acceleration
    const throttle = input.throttle || (input.forward ? 1 : input.backward ? -0.6 : 0);
    const targetSpeed = throttle * maxSpeed;
    this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, Math.min(1.0, dt * (throttle !== 0 ? 4.5 : 2.5)));

    // Vertical flight controls: Space/handbrake to climb, Shift/C to descend
    let targetVy = 0;
    if (input.handbrake) targetVy = 16.0;
    else if (input.brake) targetVy = -12.0;
    this.verticalSpeed = THREE.MathUtils.lerp(this.verticalSpeed, targetVy, Math.min(1.0, dt * 6.0));

    // Aerodynamic banking into turns
    const targetRoll = THREE.MathUtils.clamp(-input.steer * 0.42, -0.6, 0.6);
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, dt * 7.0);
    const targetPitch = THREE.MathUtils.clamp((this.speed / maxSpeed) * -0.15 + (targetVy * 0.02), -0.3, 0.3);
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, dt * 5.0);

    // Apply movement
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    this.group.position.x += sinY * this.speed * dt;
    this.group.position.z += cosY * this.speed * dt;
    this.group.position.y += this.verticalSpeed * dt;

    // Solid obstacle collisions
    if (resolveCollisions) {
      resolveCollisions(this.group.position, 1.8, this.group.position.y);
    }

    // Floor terrain constraint
    if (getSurfaceHeight) {
      const groundY = getSurfaceHeight(this.group.position.x, this.group.position.z);
      if (this.group.position.y < groundY + 1.2) {
        this.group.position.y = groundY + 1.2;
        if (this.verticalSpeed < 0) this.verticalSpeed = 0;
      }
    }

    // Orient mesh
    this.group.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');

    // Thruster flames flare dynamically
    const thrustLevel = Math.max(0.2, Math.abs(throttle) + (this.verticalSpeed > 0 ? 0.6 : 0));
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      f.scale.y = (0.7 + thrustLevel * 0.9) + Math.sin(this.time * 24 + i * 2.0) * 0.18;
      const mat = this.thrusterMats[i];
      mat.opacity = THREE.MathUtils.clamp(0.4 + thrustLevel * 0.55, 0.0, 1.0);
    }
  }

  update(dt, active) {
    this.time += dt;
    if (!this.enabled || this.isPiloted) return;

    const p = this.physics;
    const inSpace = p.phase === FLIGHT_PHASES.INTERPLANETARY || p.phase === FLIGHT_PHASES.ORBIT;
    const pad = p.padCoords;

    if (inSpace) {
      this._anchor.copy(p.position);
      const radius = 26;
      const angle = this.time * 0.42;
      const offsetX = Math.cos(angle) * radius;
      const offsetZ = Math.sin(angle) * radius;
      this.group.position.set(
        this._anchor.x + offsetX,
        this._anchor.y + 10 + Math.sin(this.time * 0.7) * 2.5,
        this._anchor.z + offsetZ
      );
      this._tangent.set(-Math.sin(angle), 0, Math.cos(angle));

      // Match the ship's travel direction while in cruise/coast.
      const shipDir = p.velocity.lengthSq() > 0.1
        ? this._tangent.copy(p.velocity).normalize()
        : this._tangent;
      this.group.rotation.y = Math.atan2(shipDir.x, shipDir.z) + Math.PI * 0.5;
    } else {
      const radius = 118;
      const angle = this.time * 0.24 + 1.2;
      const y = p.padGroundY + 42 + Math.sin(this.time * 0.8) * 5.5;
      const x = pad.x + Math.cos(angle) * radius;
      const z = pad.y + Math.sin(angle) * radius;
      // Avoid driving through the towers on the low passes.
      this.group.position.set(x, y, z);
      this.group.rotation.y = -angle + Math.PI * 0.5;
    }

    // Bank into the turn and bob like a hovering car.
    this.group.rotation.z = Math.sin(this.time * 0.8) * 0.1;
    this.group.rotation.x = Math.sin(this.time * 0.55) * 0.04;
    this.group.position.y += Math.sin(this.time * 1.4) * 0.35;

    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      f.scale.y = 0.85 + Math.sin(this.time * 18 + i * 1.7) * 0.2;
      const mat = this.thrusterMats[i];
      mat.opacity = 0.55 + Math.sin(this.time * 12 + i) * 0.15;
    }
  }
}
