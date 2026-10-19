import * as THREE from 'three';
import { getMarsHeight } from '../terrain/noise.js';

export const FLIGHT_PHASES = {
  ON_PAD: 'ON_PAD',
  COUNTDOWN: 'COUNTDOWN',
  BOOSTER_ASCENT: 'BOOSTER_ASCENT',
  HOT_STAGING: 'HOT_STAGING',
  BOOSTER_CATCH: 'BOOSTER_CATCH',
  STARSHIP_ASCENT: 'STARSHIP_ASCENT',
  ORBIT: 'ORBIT',
  DEORBIT: 'DEORBIT',
  HYPERSONIC_ENTRY: 'HYPERSONIC_ENTRY',
  BELLYFLOP: 'BELLYFLOP',
  LANDING_FLIP: 'LANDING_FLIP',
  TOUCHDOWN: 'TOUCHDOWN',
  LANDED: 'LANDED'
};

export const BOOSTER_STATES = {
  ATTACHED: 'ATTACHED',
  BOOSTBACK: 'BOOSTBACK',
  DESCENT: 'DESCENT',
  APPROACH: 'APPROACH',
  CAUGHT: 'CAUGHT'
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
    this.boosterState = BOOSTER_STATES.ATTACHED;
    this.boosterTimer = 0.0;
    this.boosterTracking = false;

    // Flight variables
    this.phase = FLIGHT_PHASES.ON_PAD;
    this.autoMission = true; // Auto mission autopilot enabled by default
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
    this.orbitTimer = 0.0;
    this.cargoDoorsDeployed = false;
    this.landingLegsDeployed = false;

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
    this.boosterState = BOOSTER_STATES.ATTACHED;
    this.boosterTimer = 0.0;
    this.boosterTracking = false;
    this.orbitTimer = 0.0;
    this.cargoDoorsDeployed = false;
    this.landingLegsDeployed = false;

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
    this.boosterFlameout = false;
    this.starshipFlameout = false;
    this.boosterAltitude = 0.0;
    this.boosterSpeed = 0.0;
    this.boosterRaptorMode = 'OFF'; // 'OFF' | 'ALL_33' | 'BOOSTBACK_13' | 'LANDING_3'
    this.shipRaptorMode = 'OFF';    // 'OFF' | 'ALL_6' | 'LANDING_3'

    this.vehicle.setMated(true);
    this.vehicle.setChopsticks(0.0, 75.0);
    this.vehicle.setCargoDoors(0.0);
    this.vehicle.setLandingLegs(0.0);
    this.vehicle.setBoosterThrottle(0);
    this.vehicle.setStarshipThrottle(0);
    this.vehicle.setReentryHeat(0);
    this.vehicle.setFlapDeflection(0, 0);
    this.vehicle.setGridFinSteering(0, 0);

    // Place stack on pad
    this.vehicle.launchPadGroup.position.set(this.padCoords.x, this.padElevation - 22.0, this.padCoords.y);
    this.vehicle.boosterGroup.position.copy(this.position);
    this.vehicle.boosterGroup.quaternion.identity();
    this.vehicle.starshipGroup.position.set(this.position.x, this.position.y + 75.0, this.position.z);
    this.vehicle.starshipGroup.quaternion.identity();
  }

  toggleAutoMission() {
    this.autoMission = !this.autoMission;
    if (this.autoMission && (this.phase === FLIGHT_PHASES.BOOSTER_ASCENT || this.phase === FLIGHT_PHASES.STARSHIP_ASCENT)) {
      this.throttle = 1.0;
    }
    return this.autoMission;
  }

  toggleBoosterTracking() {
    this.boosterTracking = !this.boosterTracking;
    return this.boosterTracking;
  }

  startLaunch() {
    if (this.phase === FLIGHT_PHASES.ON_PAD) {
      this.phase = FLIGHT_PHASES.COUNTDOWN;
      this.countdownTimer = 3.0;
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

    // Separate booster: initiates autonomous boostback, atmospheric guidance & Mechazilla catch!
    this.boosterState = BOOSTER_STATES.BOOSTBACK;
    this.boosterTimer = 0.0;
    this.boosterPosition.copy(this.position);
    this.boosterVelocity.copy(this.velocity);
    this.boosterQuaternion.copy(this.quaternion);

    // Push booster slightly down
    this.boosterVelocity.y -= 10.0;

    // Starship ignites full 6 Raptors
    this.throttle = 1.0;
    this.vehicle.setStarshipThrottle(1.0, this.altitude > 30000);
  }

  triggerDeorbit() {
    if (this.phase === FLIGHT_PHASES.ORBIT || this.phase === FLIGHT_PHASES.STARSHIP_ASCENT) {
      this.phase = FLIGHT_PHASES.DEORBIT;
      this.throttle = 0.85;
      this.vehicle.setStarshipThrottle(0.85, true);
    }
  }

  triggerLandingFlip() {
    if (this.phase === FLIGHT_PHASES.HYPERSONIC_ENTRY || this.phase === FLIGHT_PHASES.BELLYFLOP) {
      this.phase = FLIGHT_PHASES.LANDING_FLIP;
      this.throttle = 1.0;
      this.vehicle.setReentryHeat(0);
      this.vehicle.setStarshipThrottle(1.0, false);
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

    // 1. Manual Mode Throttle & Attitude Pilot Control (when autoMission is OFF)
    if (!this.autoMission && this.phase !== FLIGHT_PHASES.ON_PAD && this.phase !== FLIGHT_PHASES.COUNTDOWN && this.phase !== FLIGHT_PHASES.LANDED) {
      if (input.fullThrottle) this.throttle = 1.0;
      else if (input.throttleCut) this.throttle = 0.0;
      else if (input.throttleUp) this.throttle = Math.min(1.0, this.throttle + dt * 0.9);
      else if (input.throttleDown) this.throttle = Math.max(0.0, this.throttle - dt * 0.9);

      if (input.pitch && Math.abs(input.pitch) > 0.03) {
        this.pitch = THREE.MathUtils.clamp(this.pitch + input.pitch * 0.95 * dt, -Math.PI, Math.PI);
      }
      if (input.steer && Math.abs(input.steer) > 0.03) {
        this.yaw += input.steer * 0.95 * dt;
      }
      if (input.roll) {
        this.roll += input.roll * 1.4 * dt;
      }
    }

    // 2. Flight Phase Finite State Machine
    switch (this.phase) {
      case FLIGHT_PHASES.ON_PAD:
        // Wait on the launch pad until the user clicks LAUNCH (even in Auto Mode)
        this.throttle = 0;
        this.altitude = 0;
        this.boosterAltitude = 0;
        this.boosterSpeed = 0;
        this.boosterRaptorMode = 'OFF';
        this.shipRaptorMode = 'OFF';
        break;

      case FLIGHT_PHASES.COUNTDOWN:
        this.countdownTimer -= dt;
        if (this.countdownTimer <= 2.2) {
          // 33 Raptors spool up at T-2.2s
          this.throttle = THREE.MathUtils.lerp(this.throttle, 1.0, dt * 2.4);
          this.vehicle.setBoosterThrottle(this.throttle);
          this.boosterRaptorMode = 'ALL_33';
        }
        if (this.countdownTimer <= 0) {
          // Liftoff!
          this.phase = FLIGHT_PHASES.BOOSTER_ASCENT;
          this.velocity.set(0, 12.0, 0);
          this.throttle = 1.0;
          this.boosterRaptorMode = 'ALL_33';
        }
        break;

      case FLIGHT_PHASES.BOOSTER_ASCENT:
        this.missionTime += dt;
        if (this.autoMission) {
          this.throttle = 1.0;
        }

        // Stage 1 Propellant Depletion (LOX + CH4)
        if (this.throttle > 0.01 && this.boosterFuel > 0) {
          this.boosterFuel = Math.max(0, this.boosterFuel - this.throttle * 0.78 * dt);
        }
        if (this.boosterFuel <= 0) {
          this.throttle = 0;
          this.boosterFlameout = true;
        }

        if (this.autoMission) {
          // Pre-decided gravity turn pitch program
          const targetPitch = THREE.MathUtils.clamp((this.altitude / 65000) * 1.35, 0.0, 1.35);
          this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, dt * 0.22);
        }

        // Rocket thrust acceleration (33 Raptors ~ 72 MN thrust)
        const boosterMaxThrust = 28.0 * (1.0 + (100 - this.boosterFuel) * 0.012);
        const activeBoosterThrust = boosterMaxThrust * this.throttle;
        const thrustVec = new THREE.Vector3(
          Math.sin(this.pitch) * Math.sin(this.yaw),
          Math.cos(this.pitch),
          Math.sin(this.pitch) * Math.cos(this.yaw)
        ).normalize().multiplyScalar(activeBoosterThrust);

        // Gravity & Atmospheric Drag
        const boosterDrag = new THREE.Vector3().copy(this.velocity).multiplyScalar(-this.dynamicPressure * 0.0004);
        this.acceleration.copy(thrustVec).add(boosterDrag).add(new THREE.Vector3(0, -this.marsGravity, 0));

        this.velocity.addScaledVector(this.acceleration, dt);
        this.position.addScaledVector(this.velocity, dt);
        this.altitude = Math.max(0, this.position.y - this.padElevation);
        if (this.position.y < this.padElevation) {
          this.position.y = this.padElevation;
          this.velocity.y = Math.max(0, this.velocity.y);
        }

        this.boosterAltitude = this.altitude;
        this.boosterSpeed = this.speed;
        this.boosterRaptorMode = this.throttle > 0.05 ? (this.altitude > 20500 && this.autoMission ? 'LANDING_3' : 'ALL_33') : 'OFF';
        this.shipRaptorMode = 'OFF';

        this.vehicle.setBoosterThrottle(this.throttle);
        this.vehicle.setGridFinSteering(input.steer || 0, input.pitch || 0);

        // In Auto Mode: pre-decided hot-staging at 22 km
        if (this.autoMission && (this.altitude >= 22000 || this.boosterFlameout)) {
          this.phase = FLIGHT_PHASES.HOT_STAGING;
          this.hotStageTimer = 0;
        }
        break;

      case FLIGHT_PHASES.HOT_STAGING:
        this.missionTime += dt;
        // Brief interstage hot firing window before separation (3 booster center + 6 ship Raptors)
        this.boosterRaptorMode = 'LANDING_3';
        this.shipRaptorMode = 'ALL_6';
        this.vehicle.setStarshipThrottle(1.0, true);
        this.hotStageTimer = (this.hotStageTimer || 0) + dt;
        if (this.hotStageTimer > 1.2 || this.altitude > 23000) {
          this.executeHotStaging();
        }
        break;

      case FLIGHT_PHASES.STARSHIP_ASCENT:
        this.missionTime += dt;
        if (this.autoMission) {
          this.throttle = 1.0;
        }

        // Stage 2 Propellant Depletion (6 Vacuum & Sea-level Raptors)
        if (this.throttle > 0.01 && this.starshipFuel > 0) {
          this.starshipFuel = Math.max(0, this.starshipFuel - this.throttle * 0.42 * dt);
        }
        if (this.starshipFuel <= 0) {
          this.throttle = 0;
          this.starshipFlameout = true;
        }

        if (this.autoMission) {
          // Pre-decided orbital trajectory pitch program (~1.4 rad = 80 deg)
          const orbitTargetPitch = THREE.MathUtils.clamp(0.4 + (this.altitude / 85000) * 1.0, 0.4, 1.42);
          this.pitch = THREE.MathUtils.lerp(this.pitch, orbitTargetPitch, dt * 0.35);
        }

        const shipMaxThrust = 34.0 * (1.0 + (100 - this.starshipFuel) * 0.015);
        const activeShipThrust = shipMaxThrust * this.throttle;
        const shipThrustVec = new THREE.Vector3(
          Math.sin(this.pitch) * Math.sin(this.yaw),
          Math.cos(this.pitch),
          Math.sin(this.pitch) * Math.cos(this.yaw)
        ).normalize().multiplyScalar(activeShipThrust);

        const shipDrag = new THREE.Vector3().copy(this.velocity).multiplyScalar(-this.dynamicPressure * 0.0002);
        this.acceleration.copy(shipThrustVec).add(shipDrag).add(new THREE.Vector3(0, -this.marsGravity, 0));

        this.velocity.addScaledVector(this.acceleration, dt);
        this.position.addScaledVector(this.velocity, dt);
        this.altitude = Math.max(0, this.position.y - this.padElevation);

        this.shipRaptorMode = this.throttle > 0.05 ? 'ALL_6' : 'OFF';
        this.vehicle.setStarshipThrottle(this.throttle, this.altitude > 28000);

        // Reach Orbit insertion at ~98 km or ~3,300 m/s orbital velocity
        if (this.altitude >= 98000 || this.speed >= 3300) {
          this.phase = FLIGHT_PHASES.ORBIT;
          this.throttle = 0;
          this.orbitTimer = 0.0;
          this.shipRaptorMode = 'OFF';
          this.vehicle.setStarshipThrottle(0, false);
        }
        break;

      case FLIGHT_PHASES.ORBIT:
        this.missionTime += dt;

        // Compute Starship Orbital Space Score
        if (!this.starshipScore) {
          const boosterBonus = this.boosterState === BOOSTER_STATES.CAUGHT ? 5000 : 2500;
          this.starshipScore = Math.round(10000 + (this.altitude / 1000) * 45 + (this.speed * 1.6) + boosterBonus);
        }

        // Microgravity orbital mechanics around Mars
        const orbitalGravity = (this.marsGravity * 0.82);
        const centAccel = (this.speed * this.speed) / 3400000;
        this.velocity.y += (centAccel - orbitalGravity) * dt * 0.1;

        // Auto mission waits 7.5s in orbit for space panoramic view, then triggers deorbit burn
        if (this.autoMission) {
          this.throttle = 0;
          this.orbitTimer += dt;
          if (this.orbitTimer >= 7.5) {
            this.triggerDeorbit();
          }
        }

        // Manual orbital burn if throttle > 0
        if (this.throttle > 0.01 && this.starshipFuel > 0) {
          this.starshipFuel = Math.max(0, this.starshipFuel - this.throttle * 0.42 * dt);
          const orbitThrustVec = new THREE.Vector3(
            Math.sin(this.pitch) * Math.sin(this.yaw),
            Math.cos(this.pitch),
            Math.sin(this.pitch) * Math.cos(this.yaw)
          ).normalize().multiplyScalar(28.0 * this.throttle);
          this.velocity.addScaledVector(orbitThrustVec, dt);
          this.shipRaptorMode = 'ALL_6';
          this.vehicle.setStarshipThrottle(this.throttle, true);
        } else {
          this.shipRaptorMode = 'OFF';
          this.vehicle.setStarshipThrottle(0, false);
        }

        this.position.addScaledVector(this.velocity, dt * 0.25);
        this.altitude = Math.max(0, this.position.y - this.padElevation);
        this.vehicle.setFlapDeflection(Math.sin(this.missionTime * 0.8) * 0.1, 0);
        break;

      case FLIGHT_PHASES.DEORBIT:
        this.missionTime += dt;
        if (this.autoMission) {
          this.throttle = 0.85;
        }
        this.shipRaptorMode = this.throttle > 0.05 ? 'LANDING_3' : 'OFF';
        this.vehicle.setStarshipThrottle(this.throttle, true);

        // Retrograde deorbit burn drops Starship perigee back into atmosphere
        this.velocity.y -= 48.0 * dt;
        this.velocity.x *= 0.998;
        this.velocity.z *= 0.998;
        this.position.addScaledVector(this.velocity, dt);
        this.altitude = Math.max(0, this.position.y - this.padElevation);

        if (this.altitude <= 85000) {
          // Enter Hypersonic Re-entry Interface
          this.phase = FLIGHT_PHASES.HYPERSONIC_ENTRY;
          this.throttle = 0;
          this.shipRaptorMode = 'OFF';
          this.vehicle.setStarshipThrottle(0, false);
        }
        break;

      case FLIGHT_PHASES.HYPERSONIC_ENTRY:
        this.missionTime += dt;
        this.shipRaptorMode = this.throttle > 0.05 ? 'LANDING_3' : 'OFF';
        if (this.autoMission) {
          this.throttle = 0;
          // Belly-flop orientation: ~66 degrees high angle-of-attack
          const bellyFlopAngle = 1.15;
          this.pitch = THREE.MathUtils.lerp(this.pitch, bellyFlopAngle, dt * 1.6);
        }

        // Flap actuation based on player inputs or autonomous hypersonic trim
        let flapPitch = input.pitch || 0;
        let flapRoll = input.steer || 0;
        if (this.autoMission) {
          flapPitch = Math.sin(this.missionTime * 1.5) * 0.22;
          flapRoll = Math.cos(this.missionTime * 1.2) * 0.15;
        }
        this.vehicle.setFlapDeflection(flapPitch, flapRoll);

        // Hypersonic aerodynamic drag and compression heating
        const heating = (this.dynamicPressure * Math.pow(this.speed / 2800, 2.5));
        this.heat = THREE.MathUtils.clamp(heating * 0.85, 0.0, 1.0);
        this.vehicle.setReentryHeat(this.heat);

        // Heavy atmospheric braking: deceleration forces up to 4.2G
        const entryDragForce = this.dynamicPressure * 0.0038;
        const dragDir = new THREE.Vector3().copy(this.velocity).normalize().negate();
        this.acceleration.copy(dragDir).multiplyScalar(entryDragForce).add(new THREE.Vector3(0, -this.marsGravity, 0));

        this.velocity.addScaledVector(this.acceleration, dt);
        this.position.addScaledVector(this.velocity, dt);
        this.altitude = Math.max(0, this.position.y - this.padElevation);

        // Transition to terminal belly-flop when decelerated below Mach 1.5
        if (this.altitude < 13500 || this.speed < 420) {
          this.phase = FLIGHT_PHASES.BELLYFLOP;
          this.vehicle.setReentryHeat(0);
        }
        break;

      case FLIGHT_PHASES.BELLYFLOP:
        this.missionTime += dt;
        this.shipRaptorMode = this.throttle > 0.05 ? 'LANDING_3' : 'OFF';
        if (this.autoMission) {
          this.throttle = 0;
          // Subsonic skydiving at terminal velocity (~80 m/s) with 4 flaps balancing
          this.pitch = THREE.MathUtils.lerp(this.pitch, Math.PI / 2, dt * 2.2);
        }
        this.velocity.x *= 0.97;
        this.velocity.z *= 0.97;
        this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, -78.0, dt * 2.6);

        let bfPitch = input.pitch || 0;
        let bfRoll = input.steer || 0;
        if (this.autoMission) {
          bfPitch = Math.sin(this.missionTime * 2.0) * 0.18;
          bfRoll = Math.cos(this.missionTime * 2.2) * 0.12;
        }
        this.vehicle.setFlapDeflection(bfPitch, bfRoll);

        this.position.addScaledVector(this.velocity, dt);
        const groundUnderBelly = getMarsHeight(this.position.x, this.position.z);
        this.altitude = Math.max(0, this.position.y - groundUnderBelly);

        // At 1,150m altitude in Auto Mode, trigger iconic Landing Flip Maneuver!
        if (this.autoMission && this.altitude <= 1150) {
          this.phase = FLIGHT_PHASES.LANDING_FLIP;
          this.throttle = 1.0;
          this.shipRaptorMode = 'LANDING_3';
          this.vehicle.setStarshipThrottle(1.0, false);
        } else if (!this.autoMission && this.altitude <= 35) {
          this.phase = FLIGHT_PHASES.TOUCHDOWN;
          this.landingLegsDeployed = true;
          this.vehicle.setLandingLegs(1.0);
        }
        break;

      case FLIGHT_PHASES.LANDING_FLIP:
        this.missionTime += dt;
        if (this.autoMission) {
          this.throttle = 1.0;
          // 3 Center Raptors ignite and flip the vehicle vertical!
          this.pitch = THREE.MathUtils.lerp(this.pitch, 0.0, dt * 4.8);
        }
        this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, -11.0, dt * 3.8);

        // Controlled throttle cushion
        if (this.starshipFuel > 0) {
          this.starshipFuel = Math.max(0, this.starshipFuel - this.throttle * 0.5 * dt);
          this.velocity.y += (this.throttle * 24.5 - this.marsGravity) * dt;
        }
        this.shipRaptorMode = this.throttle > 0.05 ? 'LANDING_3' : 'OFF';
        this.vehicle.setStarshipThrottle(this.throttle, false);

        this.position.addScaledVector(this.velocity, dt);
        const groundUnderFlip = getMarsHeight(this.position.x, this.position.z);
        this.altitude = Math.max(0, this.position.y - groundUnderFlip);

        if (this.altitude <= 35) {
          this.phase = FLIGHT_PHASES.TOUCHDOWN;
          this.landingLegsDeployed = true;
          this.vehicle.setLandingLegs(1.0); // Deploy 6 landing legs
        }
        break;

      case FLIGHT_PHASES.TOUCHDOWN:
        this.missionTime += dt;
        // Final touchdown cushion with landing legs deployed
        const currentGround = getMarsHeight(this.position.x, this.position.z);
        if (this.autoMission) {
          this.throttle = 0.55;
          this.pitch = THREE.MathUtils.lerp(this.pitch, 0.0, dt * 6.0);
        }
        if (this.starshipFuel > 0 && this.throttle > 0.05) {
          this.starshipFuel = Math.max(0, this.starshipFuel - this.throttle * 0.45 * dt);
          this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, -1.2 * (1.1 - this.throttle), dt * 4.2);
        } else {
          this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, -7.0, dt * 2.0);
        }
        this.shipRaptorMode = this.throttle > 0.05 ? 'LANDING_3' : 'OFF';
        this.vehicle.setStarshipThrottle(this.throttle, false);

        this.position.y += this.velocity.y * dt;
        this.altitude = Math.max(0, this.position.y - currentGround);

        if (this.altitude <= 0.6) {
          this.altitude = 0;
          this.position.y = currentGround;
          this.velocity.set(0, 0, 0);
          this.throttle = 0;
          this.shipRaptorMode = 'OFF';
          this.vehicle.setStarshipThrottle(0, false);
          this.phase = FLIGHT_PHASES.LANDED;
          this.cargoDoorsDeployed = true;
          this.vehicle.setCargoDoors(1.0); // Open gullwing cargo doors & lower crane platform
        }
        break;

      case FLIGHT_PHASES.LANDED:
        this.throttle = 0;
        this.shipRaptorMode = 'OFF';
        this.vehicle.setStarshipThrottle(0, false);
        this.vehicle.setLandingLegs(1.0);
        this.vehicle.setCargoDoors(1.0);
        break;
    }

    // -------------------------------------------------------------
    // REAL-TIME SUPER HEAVY BOOSTER RETURN & MECHAZILLA CATCH (Ref Image 1)
    // -------------------------------------------------------------
    if (this.boosterState !== BOOSTER_STATES.ATTACHED) {
      this.boosterTimer += dt;
      const targetCatchElevation = this.padElevation + 75.0;

      switch (this.boosterState) {
        case BOOSTER_STATES.BOOSTBACK: {
          // Boostback burn: 13 Raptors fire back towards Starbase pad
          this.boosterRaptorMode = 'BOOSTBACK_13';
          this.boosterFuel = Math.max(8.0, this.boosterFuel - 1.2 * dt);
          const toPadHoriz = new THREE.Vector2(
            this.padCoords.x - this.boosterPosition.x,
            this.padCoords.y - this.boosterPosition.z
          ).normalize();

          this.boosterVelocity.x = THREE.MathUtils.lerp(this.boosterVelocity.x, toPadHoriz.x * 65.0, dt * 1.4);
          this.boosterVelocity.z = THREE.MathUtils.lerp(this.boosterVelocity.z, toPadHoriz.y * 65.0, dt * 1.4);
          this.boosterVelocity.y -= this.marsGravity * dt * 0.7;

          // Tilts booster retrograde towards Starbase
          const boostbackQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * 0.82);
          this.boosterQuaternion.slerp(boostbackQuat, dt * 2.5);

          this.vehicle.setBoosterThrottle(0.85);
          this.vehicle.setGridFinSteering(Math.sin(this.boosterTimer * 2) * 0.3, 0.2);

          // After ~5.5s of boostback burn, transition to unpowered atmospheric descent
          if (this.boosterTimer > 5.5) {
            this.boosterState = BOOSTER_STATES.DESCENT;
            this.boosterRaptorMode = 'OFF';
            this.vehicle.setBoosterThrottle(0.0);
            this.vehicle.setChopsticks(0.0, 75.0); // Open chopsticks wide awaiting booster
          }
          break;
        }

        case BOOSTER_STATES.DESCENT: {
          // Supersonic atmospheric descent: grid fins steer actively towards tower
          this.boosterRaptorMode = 'OFF';
          const toPadDir = new THREE.Vector2(
            this.padCoords.x - this.boosterPosition.x,
            this.padCoords.y - this.boosterPosition.z
          );
          const currentHorizDist = toPadDir.length();
          toPadDir.normalize();

          // Tail-first vertical descent orientation
          const uprightQuat = new THREE.Quaternion().identity();
          this.boosterQuaternion.slerp(uprightQuat, dt * 2.8);

          // Grid fins steer actively toward pad
          const finSteerYaw = THREE.MathUtils.clamp(toPadDir.x * 0.6, -0.6, 0.6);
          const finSteerPitch = THREE.MathUtils.clamp(toPadDir.y * 0.6, -0.6, 0.6);
          this.vehicle.setGridFinSteering(finSteerYaw, finSteerPitch);

          this.boosterVelocity.x = THREE.MathUtils.lerp(this.boosterVelocity.x, toPadDir.x * Math.min(80.0, currentHorizDist * 0.15), dt * 0.9);
          this.boosterVelocity.z = THREE.MathUtils.lerp(this.boosterVelocity.z, toPadDir.y * Math.min(80.0, currentHorizDist * 0.15), dt * 0.9);
          this.boosterVelocity.y = THREE.MathUtils.lerp(this.boosterVelocity.y, -85.0, dt * 1.4);

          // Approach & landing burn initiates at 1,400m above pad
          const boosterAltAbovePad = this.boosterPosition.y - this.padElevation;
          if (boosterAltAbovePad <= 1400.0) {
            this.boosterState = BOOSTER_STATES.APPROACH;
            this.boosterTimer = 0.0;
          }
          break;
        }

        case BOOSTER_STATES.APPROACH: {
          // Landing burn: 13 Raptors initially, then 3 center Raptors ignite for chopstick hover!
          const boosterAlt = this.boosterPosition.y - targetCatchElevation;
          this.boosterRaptorMode = boosterAlt > 350 ? 'BOOSTBACK_13' : 'LANDING_3';
          this.boosterFuel = Math.max(1.5, this.boosterFuel - 0.8 * dt);

          // Precisely guide horizontal coordinates directly onto launch mount
          this.boosterPosition.x = THREE.MathUtils.lerp(this.boosterPosition.x, this.padCoords.x, dt * 4.5);
          this.boosterPosition.z = THREE.MathUtils.lerp(this.boosterPosition.z, this.padCoords.y, dt * 4.5);

          // Decelerates from -85 m/s down to -1.2 m/s
          const targetVy = THREE.MathUtils.clamp(-Math.sqrt(Math.max(0.1, boosterAlt * 5.2)), -55.0, -1.2);
          this.boosterVelocity.y = THREE.MathUtils.lerp(this.boosterVelocity.y, targetVy, dt * 5.0);

          this.vehicle.setBoosterThrottle(0.92);
          this.boosterQuaternion.identity();

          // As booster descends between chopsticks (alt <= 25m above catch point), chopsticks clamp shut!
          if (boosterAlt <= 25.0) {
            const clampProgress = THREE.MathUtils.clamp((25.0 - boosterAlt) / 25.0, 0.0, 0.98);
            this.vehicle.setChopsticks(clampProgress, 75.0);
          }

          // Catch touchdown moment!
          if (boosterAlt <= 0.8 || this.boosterPosition.y <= targetCatchElevation + 0.8) {
            this.boosterPosition.set(this.padCoords.x, targetCatchElevation, this.padCoords.y);
            this.boosterVelocity.set(0, 0, 0);
            this.boosterState = BOOSTER_STATES.CAUGHT;
            this.boosterRaptorMode = 'OFF';
            this.vehicle.setBoosterThrottle(0.0);
            this.vehicle.setChopsticks(1.0, 75.0); // Fully locked chopsticks!
            this.vehicle.setGridFinSteering(0, 0);
          }
          break;
        }

        case BOOSTER_STATES.CAUGHT: {
          // Booster held safely in Mechazilla chopsticks!
          this.boosterRaptorMode = 'OFF';
          this.boosterPosition.set(this.padCoords.x, targetCatchElevation, this.padCoords.y);
          this.boosterVelocity.set(0, 0, 0);
          this.vehicle.setBoosterThrottle(0.0);
          this.vehicle.setChopsticks(1.0, 75.0);
          this.boosterQuaternion.identity();
          break;
        }
      }

      // Apply kinematics to booster position
      if (this.boosterState !== BOOSTER_STATES.CAUGHT) {
        this.boosterPosition.addScaledVector(this.boosterVelocity, dt);
      }
      this.boosterAltitude = Math.max(0, this.boosterPosition.y - targetCatchElevation);
      this.boosterSpeed = this.boosterVelocity.length();
      this.vehicle.boosterGroup.position.copy(this.boosterPosition);
      this.vehicle.boosterGroup.quaternion.copy(this.boosterQuaternion);
    }

    // Telemetry calculations
    const horizDist = new THREE.Vector2(this.position.x - this.padCoords.x, this.position.z - this.padCoords.y).length();
    this.downrange = (horizDist / 1000).toFixed(1);
    this.gForce = Math.max(0.0, (this.acceleration.length() / this.marsGravity)).toFixed(1);

    // Scientific Aerospace Flight & Orbital Telemetry
    const altKm = this.altitude / 1000;
    const vY = this.velocity.y;
    const ballisticApex = this.altitude + (Math.max(0, vY) * Math.max(0, vY)) / (2 * Math.max(1.0, this.marsGravity));
    this.apogeeKm = (Math.max(this.altitude, ballisticApex) / 1000).toFixed(1);
    this.periapsisKm = this.phase === FLIGHT_PHASES.ORBIT ? '102.4' : (altKm > 65 ? '42.8' : 'SUBORBITAL');
    this.qKPa = (this.dynamicPressure / 1000).toFixed(1);
    this.isMaxQ = this.dynamicPressure > 14000 && this.altitude > 6000 && this.altitude < 16000;
    this.deltaV = Math.round((this.starshipFuel / 100) * 3820);
    this.chamberPressure = Math.round(this.throttle * 350);
    this.pitchDeg = Math.round(this.pitch * (180 / Math.PI));
    this.yawDeg = Math.round(((this.yaw * (180 / Math.PI)) % 360 + 360) % 360);
    this.rollDeg = Math.round(this.roll * (180 / Math.PI));

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

