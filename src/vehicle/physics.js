import * as THREE from 'three';
import { getMarsHeight, getMarsNormal } from '../terrain/noise.js';

// Mars Dune Rover Vehicle Simulator
// Stays firmly on the land with responsive arcade driving, terrain slope conformance,
// controlled dune crest jumps, and nitro boost.
export class MarsRoverPhysics {
  constructor(roverModel) {
    this.model = roverModel;

    // Position & Heading (Spawn on Starbase Approach ~190m SW of Launch Pad 1 so complex is directly ahead)
    const startX = 1260;
    const startZ = 1020;
    this.position = new THREE.Vector3(startX, 0, startZ);
    this.yaw = Math.atan2(1400 - startX, 1150 - startZ); // Facing Starbase OLM & Tower
    this.pitch = 0; // Slope pitch (up/down)
    this.roll = 0; // Slope roll (left/right bank)
    this.quaternion = new THREE.Quaternion();

    // Velocities & Accelerometer G-Force
    this.speed = 0; // Forward linear speed (m/s)
    this.verticalVelocity = 0; // Up/down jump velocity (m/s)
    this.lateralVelocity = 0; // Sideways slip / drift (m/s)
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.prevVelocity = new THREE.Vector3(0, 0, 0);
    this.gForce = '0.38'; // Proper accelerometer G-load on Mars surface (3.721 / 9.80665)

    // Initial position on Mars surface
    this.rideHeight = 0.95; // Fixed chassis height above dune surface
    const initY = getMarsHeight(startX, startZ) + this.rideHeight;
    this.position.set(startX, initY, startZ);

    // Vehicle Performance Specs
    this.acceleration = 24.0; // m/s²
    this.maxSpeedForward = 32.0; // ~115 km/h
    this.maxSpeedNitro = 48.0; // ~173 km/h
    this.maxSpeedReverse = 12.0; // ~43 km/h
    this.brakeForce = 38.0; // m/s²
    this.turnSpeed = 2.2; // rad/s
    this.steerAngleVisual = 0.52; // max visual wheel steer angle
    this.gravity = 16.0; // Snappy downward gravity for arcade vehicle control

    // Nitro System
    this.nitroCapacity = 100.0;
    this.nitro = 100.0;
    this.isNitroActive = false;

    // State Flags & Telemetry
    this.onGroundCount = 4;
    this.isAirborne = false;
    this.speedKmh = 0;
    this.distanceTraveled = 0;
    this.currentSteer = 0;

    // Direction Vectors
    this._vForward = new THREE.Vector3(0, 0, 1);
    this._vUp = new THREE.Vector3(0, 1, 0);
    this._vRight = new THREE.Vector3(1, 0, 0);

    // Wheel positions relative to chassis (X, Y, Z)
    this.wheelOffsets = [
      new THREE.Vector3(-1.45, -0.4,  1.45), // FL
      new THREE.Vector3( 1.45, -0.4,  1.45), // FR
      new THREE.Vector3(-1.45, -0.4, -1.45), // RL
      new THREE.Vector3( 1.45, -0.4, -1.45)  // RR
    ];

    this.wheelContacts = [
      { onGround: true, compression: 0, groundPoint: new THREE.Vector3() },
      { onGround: true, compression: 0, groundPoint: new THREE.Vector3() },
      { onGround: true, compression: 0, groundPoint: new THREE.Vector3() },
      { onGround: true, compression: 0, groundPoint: new THREE.Vector3() }
    ];

    this.wheelRadius = 0.55;
    this.wheelRotation = 0;

    // Collision (set by engine) and launch state
    this.collider = null;   // object exposing resolve(position, radius) -> hit | null
    this.impact = 0;        // last collision strength (consumed by engine for shake/dust/audio)
    this.groundVy = 0;      // vertical speed of the ground under the rover (used for ramp launches)
    this.lastGroundY = null;
    this.collisionRadius = 1.7;
  }

  update(dt, input) {
    if (dt > 0.05) dt = 0.05; // clamp frame hitches
    if (dt <= 0) return;

    // 1. Steering Input (smooth interpolation)
    const targetSteer = THREE.MathUtils.clamp(input.steer, -1.0, 1.0);
    this.currentSteer = THREE.MathUtils.lerp(this.currentSteer, targetSteer, Math.min(1.0, dt * 14.0));

    // 2. Nitro Handling
    if (input.nitro && this.nitro > 0) {
      this.isNitroActive = true;
      this.nitro = Math.max(0, this.nitro - 28.0 * dt);
    } else {
      this.isNitroActive = false;
      this.nitro = Math.min(this.nitroCapacity, this.nitro + 14.0 * dt);
    }

    const topSpeed = this.isNitroActive ? this.maxSpeedNitro : this.maxSpeedForward;
    const accelRate = this.isNitroActive ? (this.acceleration * 1.8) : this.acceleration;

    // 3. Longitudinal Acceleration & Braking
    if (!this.isAirborne) {
      if (input.throttle > 0) {
        if (this.speed < topSpeed) {
          this.speed += accelRate * input.throttle * dt;
        }
      } else if (input.throttle < 0) {
        if (this.speed > 0.5) {
          // Firm brake
          this.speed = Math.max(0, this.speed - this.brakeForce * dt);
        } else {
          // Reverse
          if (this.speed > -this.maxSpeedReverse) {
            this.speed -= this.acceleration * 0.75 * dt;
          }
        }
      } else {
        // Natural rolling resistance
        const coast = 6.0 * dt;
        if (Math.abs(this.speed) <= coast) {
          this.speed = 0;
        } else {
          this.speed -= Math.sign(this.speed) * coast;
        }
      }

      // Handbrake
      if (input.handbrake) {
        const hb = this.brakeForce * 1.5 * dt;
        if (Math.abs(this.speed) <= hb) {
          this.speed = 0;
        } else {
          this.speed -= Math.sign(this.speed) * hb;
        }
        // Lateral rally drift slip
        if (Math.abs(this.speed) > 6.0 && Math.abs(this.currentSteer) > 0.1) {
          this.lateralVelocity += -this.currentSteer * 12.0 * dt;
        }
      }
    } else {
      // In air, subtle drag
      this.speed -= this.speed * 0.05 * dt;
    }

    // Lateral slip decay (firm grip on sand)
    this.lateralVelocity *= Math.pow(0.82, dt * 60.0);
    this.lateralVelocity = THREE.MathUtils.clamp(this.lateralVelocity, -6.0, 6.0);

    // 4. Steering & Heading (Yaw)
    // Steering direction: steer > 0 (right) turns towards +X (yaw increases)
    if (Math.abs(this.speed) > 0.05) {
      const steerDir = this.speed >= 0 ? 1.0 : -1.0;
      const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 5.0, 0.25, 1.0);
      const highSpeedStability = Math.max(0.65, 1.0 - (Math.abs(this.speed) / this.maxSpeedNitro) * 0.35);
      const turnRate = this.turnSpeed * speedFactor * highSpeedStability * steerDir;
      this.yaw += this.currentSteer * turnRate * dt;
    } else if (input.throttle !== 0 && Math.abs(this.currentSteer) > 0.1) {
      // Pivot turn from standstill
      this.yaw += this.currentSteer * 1.5 * Math.sign(input.throttle) * dt;
    }

    // 5. Update Direction Vectors
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    this._vForward.set(sinY, 0, cosY);
    this._vRight.set(cosY, 0, -sinY);
    this._vUp.set(0, 1, 0);

    // 6. Horizontal Displacement (X and Z)
    const fwdMoveX = sinY * this.speed * dt;
    const fwdMoveZ = cosY * this.speed * dt;
    const latMoveX = cosY * this.lateralVelocity * dt;
    const latMoveZ = -sinY * this.lateralVelocity * dt;

    this.position.x += fwdMoveX + latMoveX;
    this.position.z += fwdMoveZ + latMoveZ;

    // 6b. Obstacle collision (boulders, outcrops, monuments): push out and bounce
    this.landSpeed = 0;
    if (this.collider) {
      const hit = this.collider.resolve(this.position, this.collisionRadius, this.position.y - this.rideHeight);
      if (hit) {
        this.lastCollisionMaterial = hit.material || 'metal';
        this.position.x += hit.nx * hit.pen;
        this.position.z += hit.nz * hit.pen;
        const vx = sinY * this.speed + cosY * this.lateralVelocity;
        const vz = cosY * this.speed - sinY * this.lateralVelocity;
        const vn = vx * hit.nx + vz * hit.nz;
        if (vn < 0) {
          const k = -1.3 * vn; // 0.3 restitution
          const nvx = vx + hit.nx * k;
          const nvz = vz + hit.nz * k;
          this.speed = (nvx * sinY + nvz * cosY) * 0.9;
          this.lateralVelocity = nvx * cosY - nvz * sinY;
          // Glancing blows twist the nose away from the obstacle
          this.yaw += (hit.nx * cosY - hit.nz * sinY) * Math.min(1, -vn / 12) * 0.25;
          this.impact = Math.max(this.impact, -vn);
        }
      }
    }

    // 7. Ground Adherence & Vertical Suspension (Y)
    const centerGroundY = getMarsHeight(this.position.x, this.position.z);
    const targetY = centerGroundY + this.rideHeight;
    const gvyNow = this.lastGroundY === null ? 0 : (centerGroundY - this.lastGroundY) / dt;
    this.lastGroundY = centerGroundY;

    if (!this.isAirborne) {
      const heightDiff = targetY - this.position.y;

      if (heightDiff > 0) {
        // Ground is rising up: push up instantly with smooth compliance
        this.position.y = THREE.MathUtils.lerp(this.position.y, targetY, Math.min(1.0, dt * 35.0));
        // Strict floor clamp to completely prevent sinking
        if (this.position.y < targetY) {
          this.position.y = targetY;
        }
        this.verticalVelocity = 0;
      } else {
        // Ground is falling away underneath: leave the surface (ramp lips, dune crests, ledges)
        if (heightDiff < -0.4 && Math.abs(this.speed) > 14.0) {
          this.isAirborne = true;
          // Keep the vertical speed the ground had just before the lip
          this.verticalVelocity = THREE.MathUtils.clamp(this.groundVy, 0.5, 18.0);
        } else {
          // Follow terrain down closely
          this.position.y = THREE.MathUtils.lerp(this.position.y, targetY, Math.min(1.0, dt * 25.0));
          this.verticalVelocity = 0;
        }
      }
      this.groundVy = THREE.MathUtils.lerp(this.groundVy, gvyNow, 0.6);
      // Absolute guarantee: never sink below terrain
      if (this.position.y < targetY) {
        this.position.y = targetY;
      }
    } else {
      // Airborne in flight
      this.verticalVelocity -= this.gravity * dt;
      this.position.y += this.verticalVelocity * dt;

      // Landing touchdown detection
      if (this.position.y <= targetY) {
        this.landSpeed = Math.max(0, -this.verticalVelocity);
        this.position.y = targetY;
        this.verticalVelocity = 0;
        this.isAirborne = false;
        this.groundVy = 0;
      }
    }

    this.onGroundCount = this.isAirborne ? 0 : 4;

    // 8. Terrain Normal Alignment (Pitch & Roll)
    if (!this.isAirborne) {
      const normal = getMarsNormal(this.position.x, this.position.z);
      // Pitch aligns with forward slope: nose up when rising, nose down when descending
      const targetPitch = (normal.x * sinY + normal.z * cosY);
      // Gravity along the slope: climbing steep dunes bleeds speed, descending adds it
      this.speed += targetPitch * 14.0 * dt;
      // Roll aligns with side slope: right side up when terrain rises to the right
      const targetRoll = -(normal.x * cosY - normal.z * sinY);

      // Subtle dynamic chassis tilt on acceleration/braking
      const accelPitch = (input.throttle * -0.035);

      this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch + accelPitch, Math.min(1.0, dt * 14.0));
      this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, Math.min(1.0, dt * 14.0));
    } else {
      // Auto-leveling while airborne
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0, Math.min(1.0, dt * 4.0));
      this.roll = THREE.MathUtils.lerp(this.roll, 0, Math.min(1.0, dt * 4.0));
    }

    // Emergency Assist ('R' key or on-screen Assist button)
    if (input.assist) {
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0, Math.min(1.0, dt * 20.0));
      this.roll = THREE.MathUtils.lerp(this.roll, 0, Math.min(1.0, dt * 20.0));
      if (this.isAirborne) {
        this.verticalVelocity = Math.min(0, this.verticalVelocity); // fast descent
      }
    }

    // 9. Construct Rover Quaternion
    const euler = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
    this.quaternion.setFromEuler(euler);

    // 10. Update Telemetry & Proper IMU G-Force
    this.speedKmh = Math.abs(Math.round(this.speed * 3.6));
    this.distanceTraveled += Math.abs(this.speed) * dt;

    this.prevVelocity.copy(this.velocity);
    this.velocity.set(
      (sinY * this.speed + cosY * this.lateralVelocity),
      this.verticalVelocity,
      (cosY * this.speed - sinY * this.lateralVelocity)
    );

    const ax = (this.velocity.x - this.prevVelocity.x) / dt;
    const ay = ((this.velocity.y - this.prevVelocity.y) / dt) + (this.isAirborne ? 0.0 : 3.721);
    const az = (this.velocity.z - this.prevVelocity.z) / dt;
    const properG = Math.hypot(ax, ay, az) / 9.80665;
    this.gForce = properG.toFixed(2);

    // 11. Update 3D Model Group
    this.model.group.position.copy(this.position);
    this.model.group.quaternion.copy(this.quaternion);

    // 12. Wheel Visual Rotations and Steering
    const circumference = 2 * Math.PI * this.wheelRadius;
    const rotDelta = (this.speed * dt) / circumference * (Math.PI * 2);
    this.wheelRotation += rotDelta;

    for (let i = 0; i < 4; i++) {
      const assembly = this.model.wheelAssemblies[i];
      if (assembly.isFront) {
        // Front wheels pivot with steering
        assembly.pivot.rotation.y = -this.currentSteer * this.steerAngleVisual;
      }
      assembly.wheelContainer.rotation.x = this.wheelRotation;

      // Update contact points for tire particle emitters
      const off = this.wheelOffsets[i];
      const wx = this.position.x + (off.x * cosY + off.z * sinY);
      const wz = this.position.z + (-off.x * sinY + off.z * cosY);
      const gy = getMarsHeight(wx, wz);
      this.wheelContacts[i].groundPoint.set(wx, gy, wz);
      this.wheelContacts[i].onGround = !this.isAirborne;
    }

    // 13. Visual Nitro Thruster
    this.model.setNitroVisuals(this.isNitroActive, this.nitro / this.nitroCapacity);
  }

  resetAt(x, z) {
    const y = getMarsHeight(x, z) + this.rideHeight;
    this.position.set(x, y, z);
    this.speed = 0;
    this.verticalVelocity = 0;
    this.lateralVelocity = 0;
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.quaternion.set(0, 0, 0, 1);
    this.isAirborne = false;
    this.onGroundCount = 4;
  }
}
