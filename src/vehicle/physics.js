import * as THREE from 'three';
import { getMarsHeight, getMarsNormal } from '../terrain/noise.js';

// Mars Dune Rover Vehicle Simulator
// Stable, responsive arcade/rally driving physics tuned for low Martian gravity (3.72 m/s²)
export class MarsRoverPhysics {
  constructor(roverModel) {
    this.model = roverModel;

    // Position & Orientation
    this.position = new THREE.Vector3(0, 0, 0);
    this.yaw = 0; // Heading in radians (0 = along +Z)
    this.pitch = 0;
    this.roll = 0;
    this.quaternion = new THREE.Quaternion();

    // Velocities
    this.speed = 0; // Forward velocity (m/s)
    this.verticalVelocity = 0; // Vertical Y velocity (m/s)
    this.lateralVelocity = 0; // Sideways slip velocity (m/s)
    this.velocity = new THREE.Vector3(0, 0, 0);

    // Initial position on Mars surface
    const initY = getMarsHeight(0, 0);
    this.position.set(0, initY + 1.2, 0);

    // Vehicle Specifications
    this.rideHeight = 1.05; // Target height above terrain
    this.gravity = 3.72; // Mars gravity (m/s²)
    this.wheelRadius = 0.55;

    // Driving Parameters
    this.acceleration = 24.0; // m/s²
    this.maxSpeedForward = 32.0; // ~115 km/h
    this.maxSpeedNitro = 50.0; // ~180 km/h
    this.maxSpeedReverse = 12.0; // ~43 km/h
    this.brakeForce = 35.0; // m/s²
    this.turnSpeed = 1.85; // rad/s
    this.steerAngleVisual = 0.52; // max visual wheel steer angle

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

    // Vectors
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

    this.wheelRotation = 0;
  }

  update(dt, input) {
    if (dt > 0.1) dt = 0.1; // clamp frame hitches
    if (dt <= 0) return;

    // 1. Steering & Nitro Input
    const targetSteer = input.steer;
    this.currentSteer = THREE.MathUtils.lerp(this.currentSteer, targetSteer, dt * 12.0);

    // Nitro handling
    if (input.nitro && this.nitro > 0) {
      this.isNitroActive = true;
      this.nitro = Math.max(0, this.nitro - 26.0 * dt);
    } else {
      this.isNitroActive = false;
      this.nitro = Math.min(this.nitroCapacity, this.nitro + 12.0 * dt);
    }

    // Top speed limit based on nitro
    const maxForward = this.isNitroActive ? this.maxSpeedNitro : this.maxSpeedForward;
    const accelRate = this.isNitroActive ? (this.acceleration * 2.2) : this.acceleration;

    // 2. Sample 4-wheel ground elevations
    let groundHeightSum = 0;
    let groundContactCount = 0;

    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);

    // Calculate wheel world positions
    for (let i = 0; i < 4; i++) {
      const off = this.wheelOffsets[i];
      // Rotate offset by current yaw
      const wx = this.position.x + (off.x * cosY + off.z * sinY);
      const wz = this.position.z + (-off.x * sinY + off.z * cosY);
      const gy = getMarsHeight(wx, wz);

      const contact = this.wheelContacts[i];
      contact.groundPoint.set(wx, gy, wz);

      const wheelY = this.position.y + off.y;
      const distToGround = wheelY - gy;

      if (distToGround <= this.wheelRadius + 0.3) {
        contact.onGround = true;
        contact.compression = Math.max(0, (this.wheelRadius + 0.3) - distToGround);
        groundContactCount++;
      } else {
        contact.onGround = false;
        contact.compression = 0;
      }

      groundHeightSum += gy;
    }

    const avgGroundHeight = groundHeightSum / 4.0;
    const centerGroundHeight = getMarsHeight(this.position.x, this.position.z);
    const targetGroundY = Math.max(avgGroundHeight, centerGroundHeight);

    this.onGroundCount = groundContactCount;
    this.isAirborne = (this.position.y > targetGroundY + this.rideHeight + 0.5);

    // 3. Ground / Airborne Suspension & Vertical Dynamics
    if (!this.isAirborne) {
      // Soft spring-damper to target ride height
      const currentHeight = this.position.y - targetGroundY;
      const heightError = this.rideHeight - currentHeight;

      if (heightError > 0) {
        // Pushing up against ground
        this.verticalVelocity += heightError * 48.0 * dt;
        this.verticalVelocity -= this.verticalVelocity * 10.0 * dt; // damping
      } else {
        // Natural settling with Mars gravity
        this.verticalVelocity -= this.gravity * dt;
      }

      // Hard floor clamp to prevent clipping into dunes
      if (this.position.y < targetGroundY + this.rideHeight * 0.8) {
        this.position.y = targetGroundY + this.rideHeight * 0.8;
        if (this.verticalVelocity < 0) this.verticalVelocity = 0;
      }
    } else {
      // Airborne in low Mars gravity
      this.verticalVelocity -= this.gravity * dt;
    }

    // Apply vertical displacement
    this.position.y += this.verticalVelocity * dt;

    // 4. Longitudinal Drive (Acceleration & Braking)
    if (!this.isAirborne) {
      if (input.throttle > 0) {
        // Driving Forward
        if (this.speed < maxForward) {
          this.speed += accelRate * input.throttle * dt;
        }
      } else if (input.throttle < 0) {
        // Reverse or Braking
        if (this.speed > 0.5) {
          this.speed -= this.brakeForce * dt; // Brake first if moving forward
        } else {
          // Drive reverse
          if (this.speed > -this.maxSpeedReverse) {
            this.speed -= this.acceleration * 0.7 * dt;
          }
        }
      } else {
        // Coasting & Rolling resistance
        const coastDrag = 5.0 * dt;
        if (Math.abs(this.speed) < coastDrag) {
          this.speed = 0;
        } else {
          this.speed -= Math.sign(this.speed) * coastDrag;
        }
      }

      // Handbrake
      if (input.handbrake) {
        const hbDrag = this.brakeForce * 1.5 * dt;
        if (Math.abs(this.speed) < hbDrag) {
          this.speed = 0;
        } else {
          this.speed -= Math.sign(this.speed) * hbDrag;
        }
      }
    } else {
      // In air, slight forward air drag
      this.speed -= this.speed * 0.05 * dt;
    }

    // 5. Steering & Yaw Rotation
    if (!this.isAirborne) {
      // Steering response depends on speed (cannot turn when completely still)
      const speedFactor = Math.min(1.0, Math.abs(this.speed) / 4.0);
      const reverseMultiplier = this.speed < 0 ? -1.0 : 1.0;
      const turnDelta = -this.currentSteer * this.turnSpeed * speedFactor * reverseMultiplier * dt;
      this.yaw += turnDelta;

      // Lateral slip & Drift physics
      const grip = input.handbrake ? 0.82 : 0.95;
      this.lateralVelocity *= Math.pow(grip, dt * 60.0);

      // Centrifugal slip when turning sharply at speed
      const slipForce = this.speed * turnDelta * 8.0;
      this.lateralVelocity += slipForce;
    } else {
      // Airborne pitch/roll air assist
      if (input.steer !== 0) {
        this.yaw += -input.steer * 0.8 * dt;
      }
    }

    // 6. Pitch and Roll Alignment
    if (!this.isAirborne) {
      // Align with terrain slope normal
      const normal = getMarsNormal(this.position.x, this.position.z);
      // Slope pitch (forward/back) and roll (left/right)
      const targetPitch = -(normal.z * cosY - normal.x * sinY) * 0.9;
      const targetRoll = (-normal.x * cosY - normal.z * sinY) * 0.9;

      // Dynamic chassis pitch on acceleration & braking
      const accelPitch = (input.throttle * -0.06);

      this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch + accelPitch, dt * 8.0);
      this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, dt * 8.0);
    } else {
      // Airborne leveling
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0, dt * 2.0);
      this.roll = THREE.MathUtils.lerp(this.roll, 0, dt * 2.0);
    }

    // In-Flight / Emergency Assist ('R' key or on-screen button)
    if (input.assist) {
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0, dt * 14.0);
      this.roll = THREE.MathUtils.lerp(this.roll, 0, dt * 14.0);
      this.verticalVelocity = Math.max(0, this.verticalVelocity);
      if (this.position.y < targetGroundY + 1.2) {
        this.position.y = targetGroundY + 1.2;
      }
    }

    // 7. Update Position from Forward & Lateral Velocity
    this._vForward.set(sinY, 0, cosY);
    this._vRight.set(cosY, 0, -sinY);
    this._vUp.set(0, 1, 0);

    const fwdMove = this._vForward.clone().multiplyScalar(this.speed * dt);
    const latMove = this._vRight.clone().multiplyScalar(this.lateralVelocity * dt);

    this.position.add(fwdMove).add(latMove);

    // Compute total linear velocity
    this.velocity.set(
      (this._vForward.x * this.speed + this._vRight.x * this.lateralVelocity),
      this.verticalVelocity,
      (this._vForward.z * this.speed + this._vRight.z * this.lateralVelocity)
    );

    // 8. Construct Rover Quaternion (Yaw * Pitch * Roll)
    const euler = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
    this.quaternion.setFromEuler(euler);

    // 9. Update Telemetry
    this.speedKmh = Math.abs(Math.round(this.speed * 3.6));
    this.distanceTraveled += Math.abs(this.speed) * dt;

    // 10. Update 3D Rover Model
    this.model.group.position.copy(this.position);
    this.model.group.quaternion.copy(this.quaternion);

    // Wheel visual rotations and steering
    const circumference = 2 * Math.PI * this.wheelRadius;
    const rotDelta = (this.speed * dt) / circumference * (Math.PI * 2);
    this.wheelRotation += rotDelta;

    for (let i = 0; i < 4; i++) {
      const assembly = this.model.wheelAssemblies[i];
      if (assembly.isFront) {
        assembly.pivot.rotation.y = this.currentSteer * this.steerAngleVisual;
      }
      assembly.wheelContainer.rotation.x = this.wheelRotation;
    }

    // Thruster glow
    this.model.setNitroVisuals(this.isNitroActive, this.nitro / this.nitroCapacity);
  }

  resetAt(x, z) {
    const y = getMarsHeight(x, z) + 1.5;
    this.position.set(x, y, z);
    this.speed = 0;
    this.verticalVelocity = 0;
    this.lateralVelocity = 0;
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.quaternion.set(0, 0, 0, 1);
  }
}
