import * as THREE from 'three';
import { getMarsHeight } from '../terrain/noise.js';

export const FLIGHT_PHASES = {
  ON_PAD: 'ON_PAD',
  COUNTDOWN: 'COUNTDOWN',
  BOOSTER_ASCENT: 'BOOSTER_ASCENT',
  HOT_STAGING: 'HOT_STAGING',
  STARSHIP_ASCENT: 'STARSHIP_ASCENT',
  ORBIT: 'ORBIT',
  DEORBIT: 'DEORBIT',
  HYPERSONIC_ENTRY: 'HYPERSONIC_ENTRY',
  BELLYFLOP: 'BELLYFLOP',
  LANDING_FLIP: 'LANDING_FLIP',
  TOUCHDOWN: 'TOUCHDOWN',
  LANDED: 'LANDED'
};

export class StarshipMissionPhysics {
  constructor(vehicleModel, startCoords = new THREE.Vector2(1400, 1150)) {
    this.vehicle = vehicleModel;
    this.padCoords = startCoords.clone();

    // Pad launch altitude
    this.padElevation = getMarsHeight(this.padCoords.x, this.padCoords.y) + 22.0;

    // Position & Kinematics (in world coordinates)
    this.position = new THREE.Vector3(this.padCoords.x, this.padElevation, this.padCoords.y);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.acceleration = new THREE.Vector3(0, 0, 0);

    // Orientation: pitch, yaw, roll (Euler YXZ)
    this.pitch = 0; // 0 = vertical nose up (+Y), Math.PI/2 = horizontal
    this.yaw = 0.6; // Launch azimuth downrange towards northeast
    this.roll = 0;
    this.quaternion = new THREE.Quaternion();

    // Booster separate position / velocity after stage separation
    this.boosterPosition = new THREE.Vector3();
    this.boosterVelocity = new THREE.Vector3();
    this.boosterQuaternion = new THREE.Quaternion();

    // Flight variables
    this.phase = FLIGHT_PHASES.ON_PAD;
    this.throttle = 0.0;
    this.altitude = 0.0; // height above ground
    this.speed = 0.0;    // m/s
    this.mach = 0.0;
    this.dynamicPressure = 0.0; // Q
    this.heat = 0.0;            // Re-entry heating factor (0.0 to 1.0)
    this.gForce = 1.0;
    this.downrange = 0.0;
    this.countdownTimer = 5.0;
    this.missionTime = 0.0;

    // Fuel remaining (kg or %)
    this.boosterFuel = 100.0;
    this.starshipFuel = 100.0;

    // Constants for Mars
    this.marsGravity = 3.72; // m/s²
    this.surfaceDensity = 0.020; // kg/m³ (Mars thin atmosphere)
    this.scaleHeight = 11100; // 11.1 km atmosphere scale height

    // Initialize vehicle placement
    this.resetToPad();
  }

  resetToPad() {
    this.phase = FLIGHT_PHASES.ON_PAD;
    this.position.set(this.padCoords.x, this.padElevation, this.padCoords.y);
    this.velocity.set(0, 0, 0);
    this.pitch = 0;
    this.yaw = 0.6;
    this.roll = 0;
    this.altitude = 0;
    this.speed = 0;
    this.mach = 0;
    this.throttle = 0;
    this.heat = 0;
    this.gForce = 1.0;
    this.downrange = 0;
    this.missionTime = 0;
    this.countdownTimer = 5.0;
    this.boosterFuel = 100.0;
    this.starshipFuel = 100.0;

    this.vehicle.setMated(true);
    this.vehicle.setBoosterThrottle(0);
    this.vehicle.setStarshipThrottle(0);
    this.vehicle.setReentryHeat(0);

    // Place stack on pad
    this.vehicle.launchPadGroup.position.set(this.padCoords.x, this.padElevation - 22.0, this.padCoords.y);
    this.vehicle.boosterGroup.position.copy(this.position);
    this.vehicle.boosterGroup.quaternion.identity();
    this.vehicle.starshipGroup.position.set(this.position.x, this.position.y + 75.0, this.position.z);
    this.vehicle.starshipGroup.quaternion.identity();
  }

  startLaunch() {
    if (this.phase === FLIGHT_PHASES.ON_PAD) {
      this.phase = FLIGHT_PHASES.COUNTDOWN;
      this.countdownTimer = 4.0;
    }
  }

  triggerStageSeparation() {
    if (this.phase === FLIGHT_PHASES.BOOSTER_ASCENT || this.phase === FLIGHT_PHASES.HOT_STAGING) {
      this.executeHotStaging();
    }
  }

  executeHotStaging() {
    this.phase = FLIGHT_PHASES.STARSHIP_ASCENT;
    this.vehicle.setMated(false);

    // Separate booster: clone kinematics with separation push
    this.boosterPosition.copy(this.position);
    this.boosterVelocity.copy(this.velocity);
    // Push booster slightly backward
    const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
    this.boosterVelocity.addScaledVector(forward, -15.0);

    // Starship ignites full 6 Raptors
    this.throttle = 1.0;
    this.vehicle.setBoosterThrottle(0.2); // booster low throttle boostback
    this.vehicle.setStarshipThrottle(1.0, this.altitude > 30000);
  }

  triggerDeorbit() {
    if (this.phase === FLIGHT_PHASES.ORBIT) {
      this.phase = FLIGHT_PHASES.DEORBIT;
      this.throttle = 0.8;
    }
  }

  update(dt, input) {
    if (dt <= 0) return;
    if (dt > 0.05) dt = 0.05;

    // Atmospheric density at current altitude
    const marsDensity = this.surfaceDensity * Math.exp(-Math.max(0, this.altitude) / this.scaleHeight);
    const speedOfSound = 240.0; // m/s in cold CO2 atmosphere
    this.speed = this.velocity.length();
    this.mach = (this.speed / speedOfSound).toFixed(1);
    this.dynamicPressure = 0.5 * marsDensity * this.speed * this.speed;

    // Flight Phase Finite State Machine
    switch (this.phase) {
      case FLIGHT_PHASES.ON_PAD:
        this.throttle = 0;
        this.altitude = 0;
        break;

      case FLIGHT_PHASES.COUNTDOWN:
        this.countdownTimer -= dt;
        if (this.countdownTimer <= 2.0) {
          // Raptors spool up at T-2s
          this.throttle = THREE.MathUtils.lerp(this.throttle, 1.0, dt * 2.0);
          this.vehicle.setBoosterThrottle(this.throttle);
        }
        if (this.countdownTimer <= 0) {
          // Liftoff!
          this.phase = FLIGHT_PHASES.BOOSTER_ASCENT;
          this.velocity.set(0, 8.0, 0);
          this.throttle = 1.0;
        }
        break;

      case FLIGHT_PHASES.BOOSTER_ASCENT:
        this.missionTime += dt;
        this.boosterFuel = Math.max(0, this.boosterFuel - 1.2 * dt);

        // Pilot attitude control (Pitch & Yaw)
        if (input.throttle !== undefined) {
          this.pitch += input.steer * 0.4 * dt;
        }
        // Gravity turn pitch program (natural gravity tilt into orbital plane)
        const targetPitch = THREE.MathUtils.clamp((this.altitude / 65000) * 1.35, 0.0, 1.35);
        this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, dt * 0.25);

        // Rocket thrust acceleration (33 Raptors ~ 72 MN thrust / ~4500 tonnes)
        const boosterThrust = 26.0 * (1.0 + (100 - this.boosterFuel) * 0.012); // TWR increases as fuel burns
        const thrustVec = new THREE.Vector3(
          Math.sin(this.pitch) * Math.sin(this.yaw),
          Math.cos(this.pitch),
          Math.sin(this.pitch) * Math.cos(this.yaw)
        ).normalize().multiplyScalar(boosterThrust);

        // Gravity & Atmospheric Drag
        const boosterDrag = new THREE.Vector3().copy(this.velocity).multiplyScalar(-this.dynamicPressure * 0.0004);
        this.acceleration.copy(thrustVec).add(boosterDrag).add(new THREE.Vector3(0, -this.marsGravity, 0));

        this.velocity.addScaledVector(this.acceleration, dt);
        this.position.addScaledVector(this.velocity, dt);
        this.altitude = this.position.y - this.padElevation;

        this.vehicle.setBoosterThrottle(this.throttle);

        // Auto prompt or staging at altitude ~22 km
        if (this.altitude >= 22000 && this.phase === FLIGHT_PHASES.BOOSTER_ASCENT) {
          this.phase = FLIGHT_PHASES.HOT_STAGING;
        }
        break;

      case FLIGHT_PHASES.HOT_STAGING:
        this.missionTime += dt;
        // Brief interstage hot firing window before separation
        this.vehicle.setStarshipThrottle(1.0, true);
        if (this.altitude > 24000) {
          this.executeHotStaging();
        }
        break;

      case FLIGHT_PHASES.STARSHIP_ASCENT:
        this.missionTime += dt;
        this.starshipFuel = Math.max(0, this.starshipFuel - 0.7 * dt);

        // Steer Starship towards orbital insertion
        const steerPitch = (input.steer || 0) * 0.5 * dt;
        this.pitch = THREE.MathUtils.clamp(this.pitch + steerPitch, 0.2, 1.55);

        const shipThrust = 32.0 * (1.0 + (100 - this.starshipFuel) * 0.015);
        const shipThrustVec = new THREE.Vector3(
          Math.sin(this.pitch) * Math.sin(this.yaw),
          Math.cos(this.pitch),
          Math.sin(this.pitch) * Math.cos(this.yaw)
        ).normalize().multiplyScalar(shipThrust);

        const shipDrag = new THREE.Vector3().copy(this.velocity).multiplyScalar(-this.dynamicPressure * 0.0002);
        this.acceleration.copy(shipThrustVec).add(shipDrag).add(new THREE.Vector3(0, -this.marsGravity, 0));

        this.velocity.addScaledVector(this.acceleration, dt);
        this.position.addScaledVector(this.velocity, dt);
        this.altitude = this.position.y - this.padElevation;

        // Twilight Space Jellyfish Plume active in thin upper atmosphere (Ref Image 1)
        this.vehicle.setStarshipThrottle(this.throttle, this.altitude > 28000);

        // Reach Orbit insertion at ~120 km and ~3,400 m/s orbital velocity
        if (this.altitude >= 110000 || this.speed >= 3400) {
          this.phase = FLIGHT_PHASES.ORBIT;
          this.throttle = 0;
          this.vehicle.setStarshipThrottle(0, false);
        }

        // Update booster return animation (drifting back towards pad)
        this.boosterPosition.addScaledVector(this.boosterVelocity, dt);
        this.boosterVelocity.y -= this.marsGravity * dt * 0.5;
        this.vehicle.boosterGroup.position.copy(this.boosterPosition);
        break;

      case FLIGHT_PHASES.ORBIT:
        this.missionTime += dt;
        // Microgravity orbital coast
        const orbitalGravity = (this.marsGravity * 0.85);
        // Centrifugal balance in circular orbit
        const centAccel = (this.speed * this.speed) / 3400000;
        this.velocity.y += (centAccel - orbitalGravity) * dt * 0.1;
        this.position.addScaledVector(this.velocity, dt * 0.2);
        this.altitude = this.position.y - this.padElevation;

        // RCS orientation in space
        if (input.steer) this.yaw += input.steer * 0.6 * dt;
        this.vehicle.setFlapDeflection(Math.sin(this.missionTime * 0.8) * 0.1, 0);
        break;

      case FLIGHT_PHASES.DEORBIT:
        this.missionTime += dt;
        // Retrograde deorbit burn drops Starship back into atmosphere
        this.velocity.y -= 45.0 * dt;
        this.position.addScaledVector(this.velocity, dt);
        this.altitude = this.position.y - this.padElevation;

        if (this.altitude <= 85000) {
          // Enter Hypersonic Re-entry Interface
          this.phase = FLIGHT_PHASES.HYPERSONIC_ENTRY;
          this.throttle = 0;
          this.vehicle.setStarshipThrottle(0, false);
        }
        break;

      case FLIGHT_PHASES.HYPERSONIC_ENTRY:
        this.missionTime += dt;
        // Belly-flop orientation: 70° high angle-of-attack into oncoming wind (Ref Image 2)
        const bellyFlopAngle = 1.15; // ~66 degrees
        this.pitch = THREE.MathUtils.lerp(this.pitch, bellyFlopAngle, dt * 1.5);

        // Flap actuation based on player steering inputs for aerodynamic trim!
        const flapPitch = (input.throttle || 0);
        const flapRoll = (input.steer || 0);
        this.vehicle.setFlapDeflection(flapPitch, flapRoll);

        // Hypersonic aerodynamic drag and compression heating!
        // Heat ~ dynamic pressure * velocity^3
        const heating = (this.dynamicPressure * Math.pow(this.speed / 2800, 2.5));
        this.heat = THREE.MathUtils.clamp(heating * 0.8, 0.0, 1.0);
        this.vehicle.setReentryHeat(this.heat);

        // Heavy atmospheric braking: deceleration forces up to 4G
        const entryDragForce = this.dynamicPressure * 0.0035;
        const dragDir = new THREE.Vector3().copy(this.velocity).normalize().negate();
        this.acceleration.copy(dragDir).multiplyScalar(entryDragForce).add(new THREE.Vector3(0, -this.marsGravity, 0));

        this.velocity.addScaledVector(this.acceleration, dt);
        this.position.addScaledVector(this.velocity, dt);
        this.altitude = this.position.y - this.padElevation;

        // When decelerated below Mach 1.5 and altitude < 15km, transition to terminal belly-flop
        if (this.altitude < 12000 || this.speed < 400) {
          this.phase = FLIGHT_PHASES.BELLYFLOP;
          this.vehicle.setReentryHeat(0);
        }
        break;

      case FLIGHT_PHASES.BELLYFLOP:
        this.missionTime += dt;
        // Subsonic skydiving at terminal velocity (~85 m/s)
        this.pitch = THREE.MathUtils.lerp(this.pitch, Math.PI / 2, dt * 2.0); // fully horizontal
        this.velocity.x *= 0.98;
        this.velocity.z *= 0.98;
        this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, -80.0, dt * 2.5);

        this.position.addScaledVector(this.velocity, dt);
        const groundUnderBelly = getMarsHeight(this.position.x, this.position.z);
        this.altitude = this.position.y - groundUnderBelly;

        // At 1,200m altitude, trigger Landing Flip Maneuver!
        if (this.altitude <= 1200) {
          this.phase = FLIGHT_PHASES.LANDING_FLIP;
          this.throttle = 1.0;
          this.vehicle.setStarshipThrottle(1.0, false);
        }
        break;

      case FLIGHT_PHASES.LANDING_FLIP:
        this.missionTime += dt;
        // 3 Center Raptors ignite and gimbal to violently flip the vehicle vertical!
        this.pitch = THREE.MathUtils.lerp(this.pitch, 0.0, dt * 4.5); // fast flip to vertical
        this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, -12.0, dt * 3.5); // rapid deceleration

        // Pilot throttle cushion control
        if (input.throttle > 0) this.velocity.y += 20.0 * dt;

        this.position.addScaledVector(this.velocity, dt);
        const groundUnderFlip = getMarsHeight(this.position.x, this.position.z);
        this.altitude = this.position.y - groundUnderFlip;

        if (this.altitude <= 25) {
          this.phase = FLIGHT_PHASES.TOUCHDOWN;
        }
        break;

      case FLIGHT_PHASES.TOUCHDOWN:
        // Final touchdown cushion
        const currentGround = getMarsHeight(this.position.x, this.position.z);
        this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, -1.5, dt * 4.0);
        this.position.y += this.velocity.y * dt;
        this.altitude = this.position.y - currentGround;

        if (this.altitude <= 1.0) {
          this.altitude = 0;
          this.position.y = currentGround;
          this.velocity.set(0, 0, 0);
          this.throttle = 0;
          this.vehicle.setStarshipThrottle(0, false);
          this.phase = FLIGHT_PHASES.LANDED;
        }
        break;

      case FLIGHT_PHASES.LANDED:
        this.throttle = 0;
        break;
    }

    // Compute vehicle Euler & Quaternion
    const euler = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
    this.quaternion.setFromEuler(euler);

    // Apply 3D transforms to vehicle meshes
    if (this.vehicle.isMated) {
      // Booster + Ship mated together
      this.vehicle.boosterGroup.position.copy(this.position);
      this.vehicle.boosterGroup.quaternion.copy(this.quaternion);

      // Starship on top of booster
      const shipOffset = new THREE.Vector3(0, 75.0, 0).applyQuaternion(this.quaternion);
      this.vehicle.starshipGroup.position.copy(this.position).add(shipOffset);
      this.vehicle.starshipGroup.quaternion.copy(this.quaternion);
    } else {
      // Independent Starship flight
      this.vehicle.starshipGroup.position.copy(this.position);
      this.vehicle.starshipGroup.quaternion.copy(this.quaternion);
    }

    this.vehicle.update(dt);
  }
}
