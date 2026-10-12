import * as THREE from 'three';
import { getMarsHeight, getMarsNormal } from '../terrain/noise.js';

// Mars Vehicle Physics Engine
// Optimized for low-gravity (3.72 m/s²) high-velocity dune jumping and drifting
export class MarsRoverPhysics {
  constructor(roverModel) {
    this.model = roverModel;

    // Rigid body state
    this.position = new THREE.Vector3(0, 5, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.quaternion = new THREE.Quaternion();
    this.angularVelocity = new THREE.Vector3(0, 0, 0);

    // Initial position on Mars surface
    const initY = getMarsHeight(0, 0);
    this.position.set(0, initY + 2.5, 0);

    // Physical constants
    this.mass = 1200; // kg
    this.gravity = 3.72; // Mars gravity (m/s²)
    this.suspensionRestLength = 0.85;
    this.suspensionStiffness = 38000; // N/m
    this.suspensionDamping = 3400; // Ns/m
    this.wheelRadius = 0.55;

    // Driving parameters
    this.enginePower = 11000; // N
    this.brakePower = 16000;
    this.maxSteerAngle = 0.55; // ~31 degrees
    this.currentSteer = 0;
    this.lateralFriction = 0.92;
    this.forwardFriction = 0.98;

    // Nitro system
    this.nitroCapacity = 100.0;
    this.nitro = 100.0;
    this.nitroThrust = 26000; // N boost
    this.isNitroActive = false;

    // Telemetry
    this.speedKmh = 0;
    this.speedMs = 0;
    this.onGroundCount = 0;
    this.isAirborne = false;
    this.distanceTraveled = 0;

    // Suspension contact states for 4 wheels
    this.wheelContacts = [
      { onGround: false, compression: 0, groundPoint: new THREE.Vector3(), normal: new THREE.Vector3() },
      { onGround: false, compression: 0, groundPoint: new THREE.Vector3(), normal: new THREE.Vector3() },
      { onGround: false, compression: 0, groundPoint: new THREE.Vector3(), normal: new THREE.Vector3() },
      { onGround: false, compression: 0, groundPoint: new THREE.Vector3(), normal: new THREE.Vector3() }
    ];

    // Inertia tensor approximation (box)
    this.invInertia = new THREE.Vector3(
      1.0 / ((1 / 12) * this.mass * (0.8 * 0.8 + 4.4 * 4.4)), // Pitch
      1.0 / ((1 / 12) * this.mass * (2.2 * 2.2 + 4.4 * 4.4)), // Yaw
      1.0 / ((1 / 12) * this.mass * (2.2 * 2.2 + 0.8 * 0.8))  // Roll
    );

    // Local wheel relative anchor points
    this.wheelOffsets = [
      new THREE.Vector3(-1.45, 0.2, 1.45),  // FL
      new THREE.Vector3( 1.45, 0.2, 1.45),  // FR
      new THREE.Vector3(-1.45, 0.2, -1.45), // RL
      new THREE.Vector3( 1.45, 0.2, -1.45)  // RR
    ];

    // Temp scratch vectors
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._vForward = new THREE.Vector3();
    this._vUp = new THREE.Vector3();
    this._vRight = new THREE.Vector3();
  }

  update(dt, input) {
    if (dt > 0.1) dt = 0.1; // clamp frame hitches

    // 1. Direction vectors
    this._vForward.set(0, 0, 1).applyQuaternion(this.quaternion);
    this._vUp.set(0, 1, 0).applyQuaternion(this.quaternion);
    this._vRight.set(1, 0, 0).applyQuaternion(this.quaternion);

    // 2. Handle Steering
    const targetSteer = input.steer * this.maxSteerAngle;
    this.currentSteer = THREE.MathUtils.lerp(this.currentSteer, targetSteer, dt * 10);

    // 3. Handle Nitro
    if (input.nitro && this.nitro > 0) {
      this.isNitroActive = true;
      this.nitro = Math.max(0, this.nitro - 28.0 * dt);
    } else {
      this.isNitroActive = false;
      this.nitro = Math.min(this.nitroCapacity, this.nitro + 12.0 * dt); // recharge
    }

    // 4. Forces & Torques Accumulators
    const totalForce = new THREE.Vector3(0, -this.mass * this.gravity, 0); // Gravity
    const totalTorque = new THREE.Vector3(0, 0, 0);

    // 5. Suspension & Wheel Physics
    this.onGroundCount = 0;

    for (let i = 0; i < 4; i++) {
      const offset = this.wheelOffsets[i];
      // World position of suspension mount
      const mountWorld = offset.clone().applyQuaternion(this.quaternion).add(this.position);

      // Raycast down along local down vector
      const downRay = this._vUp.clone().negate();
      const terrainHeight = getMarsHeight(mountWorld.x, mountWorld.z);
      const contactDist = mountWorld.y - terrainHeight;

      const maxRay = this.suspensionRestLength + this.wheelRadius;
      const contact = this.wheelContacts[i];

      if (contactDist < maxRay && contactDist > -1.5) {
        contact.onGround = true;
        this.onGroundCount++;

        const normalObj = getMarsNormal(mountWorld.x, mountWorld.z);
        contact.normal.set(normalObj.x, normalObj.y, normalObj.z);
        contact.groundPoint.set(mountWorld.x, terrainHeight, mountWorld.z);

        const currentLength = Math.max(0.05, contactDist - this.wheelRadius);
        contact.compression = Math.max(0, this.suspensionRestLength - currentLength);

        // Velocity at wheel mount
        const r = mountWorld.clone().sub(this.position);
        const wheelVel = this.velocity.clone().add(this.angularVelocity.clone().cross(r));

        // Spring + Damper force along suspension axis
        const springForce = this.suspensionStiffness * contact.compression;
        const suspensionVel = wheelVel.dot(downRay);
        const damperForce = -this.suspensionDamping * suspensionVel;
        const totalSuspForceMag = Math.max(0, springForce + damperForce);

        const suspForceVec = this._vUp.clone().multiplyScalar(totalSuspForceMag);
        totalForce.add(suspForceVec);

        // Torque from suspension
        const suspTorque = r.clone().cross(suspForceVec);
        totalTorque.add(suspTorque);

        // --- Tire Traction Forces ---
        // Wheel heading direction (accounts for front wheel steering)
        let wheelHeading = this._vForward.clone();
        let wheelLateral = this._vRight.clone();

        const isFront = (i === 0 || i === 1);
        if (isFront) {
          const steerRot = new THREE.Quaternion().setFromAxisAngle(this._vUp, -this.currentSteer);
          wheelHeading.applyQuaternion(steerRot);
          wheelLateral.applyQuaternion(steerRot);
        }

        const vForwardVal = wheelVel.dot(wheelHeading);
        const vLateralVal = wheelVel.dot(wheelLateral);

        // Lateral friction / slip damping (drift)
        const latGrip = input.handbrake && !isFront ? 0.35 : this.lateralFriction;
        const latForce = wheelLateral.clone().multiplyScalar(-vLateralVal * this.mass * 1.8 * latGrip);
        totalForce.add(latForce);
        totalTorque.add(r.clone().cross(latForce));

        // Drive / Brake force
        let longForceMag = 0;
        if (input.throttle !== 0) {
          longForceMag = input.throttle * (this.enginePower * 0.25);
        }

        if (input.brake) {
          longForceMag -= Math.sign(vForwardVal || 1) * (this.brakePower * 0.25);
        }

        if (input.handbrake && !isFront) {
          longForceMag -= Math.sign(vForwardVal || 1) * (this.brakePower * 0.35);
        }

        // Rolling resistance
        longForceMag -= vForwardVal * 18.0;

        const forwardForce = wheelHeading.clone().multiplyScalar(longForceMag);
        totalForce.add(forwardForce);
        totalTorque.add(r.clone().cross(forwardForce));

      } else {
        contact.onGround = false;
        contact.compression = 0;
      }
    }

    this.isAirborne = this.onGroundCount === 0;

    // 6. Nitro Rocket Thrust
    if (this.isNitroActive) {
      const nitroF = this._vForward.clone().multiplyScalar(this.nitroThrust);
      totalForce.add(nitroF);
    }

    // 7. Chassis bottom ground collision prevention (anti-clipping)
    const centerGroundY = getMarsHeight(this.position.x, this.position.z);
    const clearance = this.position.y - centerGroundY;
    if (clearance < 0.6) {
      const penetration = 0.6 - clearance;
      this.position.y += penetration * 0.5;
      this.velocity.y = Math.max(0, this.velocity.y) + penetration * 12.0;
      this.velocity.multiplyScalar(0.96); // friction with dune crest
    }

    // 8. In-Flight & Air Stabilization Assist ('R' key / Assist button)
    if (input.assist) {
      // Auto-righting stabilization: align up-vector with world up (0, 1, 0)
      const worldUp = new THREE.Vector3(0, 1, 0);
      const tiltAxis = this._vUp.clone().cross(worldUp);
      const tiltAngle = this._vUp.angleTo(worldUp);

      if (tiltAngle > 0.05) {
        const assistTorque = tiltAxis.normalize().multiplyScalar(tiltAngle * this.mass * 24.0);
        totalTorque.add(assistTorque);
      }

      // If fully upside down on ground, pop up safely
      if (this._vUp.y < 0.2 && clearance < 2.0) {
        this.position.y = centerGroundY + 2.5;
        this.quaternion.set(0, 0, 0, 1);
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
      }
    } else if (this.isAirborne) {
      // Subtle natural aerodynamic pitch leveling when soaring over dunes
      const airStabilizeTorque = new THREE.Vector3(0, 1, 0).cross(this._vUp).multiplyScalar(-this.mass * 2.2);
      totalTorque.add(airStabilizeTorque);
    }

    // 9. Integrate Linear Motion
    // Mars low-density air resistance
    const airDrag = 0.5 * 0.02 * this.velocity.lengthSq();
    const dragForce = this.velocity.clone().normalize().multiplyScalar(-airDrag);
    totalForce.add(dragForce);

    const accel = totalForce.divideScalar(this.mass);
    this.velocity.add(accel.multiplyScalar(dt));
    this.position.add(this.velocity.clone().multiplyScalar(dt));

    // 10. Integrate Angular Motion
    const angAccelLocal = new THREE.Vector3(
      totalTorque.x * this.invInertia.x,
      totalTorque.y * this.invInertia.y,
      totalTorque.z * this.invInertia.z
    );

    // Apply angular drag
    this.angularVelocity.multiplyScalar(Math.pow(0.88, dt));
    this.angularVelocity.add(angAccelLocal.multiplyScalar(dt));

    // Update quaternion from angular velocity
    const rotSpeed = this.angularVelocity.length();
    if (rotSpeed > 0.0001) {
      const rotAxis = this.angularVelocity.clone().normalize();
      const deltaQ = new THREE.Quaternion().setFromAxisAngle(rotAxis, rotSpeed * dt);
      this.quaternion.multiplyQuaternions(deltaQ, this.quaternion);
      this.quaternion.normalize();
    }

    // 11. Update Telemetry
    this.speedMs = this.velocity.length();
    this.speedKmh = Math.round(this.speedMs * 3.6);
    this.distanceTraveled += this.speedMs * dt;

    // 12. Update Visual Rover Model
    this.model.group.position.copy(this.position);
    this.model.group.quaternion.copy(this.quaternion);

    // Update wheel pivots and rotations
    const wheelCircumference = 2 * Math.PI * this.wheelRadius;
    const forwardSpeed = this.velocity.dot(this._vForward);
    const wheelRotDelta = (forwardSpeed * dt) / wheelCircumference * (Math.PI * 2);

    for (let i = 0; i < 4; i++) {
      const assembly = this.model.wheelAssemblies[i];
      const contact = this.wheelContacts[i];

      // Steering angle
      if (assembly.isFront) {
        assembly.pivot.rotation.y = -this.currentSteer;
      }

      // Suspension deflection
      const suspensionTravel = contact.onGround ? (contact.compression - 0.25) : 0;
      assembly.pivot.position.y = assembly.restPos.y + suspensionTravel;

      // Wheel spinning
      assembly.rotation += wheelRotDelta;
      assembly.wheelContainer.rotation.x = assembly.rotation;
    }

    // Visual nitro glow
    this.model.setNitroVisuals(this.isNitroActive, this.nitro / this.nitroCapacity);
  }

  resetAt(x, z) {
    const y = getMarsHeight(x, z) + 2.5;
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.quaternion.set(0, 0, 0, 1);
  }
}
