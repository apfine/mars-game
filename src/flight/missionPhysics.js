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
    this.trajectoryMode = 'ORBITAL'; // 'ORBITAL' | 'SUBORBITAL'
    this.showTrajectoryPrompt = false;
    this.entryStartAlt = 48000;
    this.pitchVel = 0.0;
    this.shipCaughtByTower = false;
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
    this.showTrajectoryPrompt = false;
    this.entryStartAlt = 48000;
    this.pitchVel = 0.0;
    this.shipCaughtByTower = false;

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
    this.vehicle.boosterGroup.visible = true;
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

  setTrajectoryMode(mode) {
    if (mode === 'ORBITAL' || mode === 'SUBORBITAL') {
      this.trajectoryMode = mode;
    }
    return this.trajectoryMode;
  }

  toggleTrajectoryMode() {
    this.trajectoryMode = this.trajectoryMode === 'ORBITAL' ? 'SUBORBITAL' : 'ORBITAL';
    return this.trajectoryMode;
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
      this.pitchVel = -2.2;
      this.throttle = 1.0;
      this.heat = 0.0;
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

    // Show Orbital / Suborbital trajectory decision prompt during upper stage ascent before space insertion
    this.showTrajectoryPrompt = (
      this.phase === FLIGHT_PHASES.STARSHIP_ASCENT &&
      this.altitude >= 23000 &&
      this.altitude < 82000
    );

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
        this.heat = 0;
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

      case FLIGHT_PHASES.STARSHIP_ASCENT: {
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

        const isSuborbital = this.trajectoryMode === 'SUBORBITAL';
        if (this.autoMission) {
          // Suborbital pitches more lofted/retrograde for direct Starbase return; Orbital pitches toward horizon
          const targetAscentPitch = isSuborbital
            ? THREE.MathUtils.clamp(0.45 + (this.altitude / 55000) * 0.65, 0.45, 1.08)
            : THREE.MathUtils.clamp(0.4 + (this.altitude / 80000) * 1.0, 0.4, 1.40);
          this.pitch = THREE.MathUtils.lerp(this.pitch, targetAscentPitch, dt * 0.45);
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

        // SUBORBITAL MODE: Early SECO at 50 km apogee -> direct atmospheric entry back to Starbase!
        if (isSuborbital && (this.altitude >= 50000 || this.speed >= 1950)) {
          this.phase = FLIGHT_PHASES.HYPERSONIC_ENTRY;
          this.entryStartAlt = Math.max(38000, this.altitude);
          this.throttle = 0;
          this.heat = 0.0;
          this.shipRaptorMode = 'OFF';
          this.vehicle.setStarshipThrottle(0, false);
          this.vehicle.setReentryHeat(0);
          // Initiate suborbital descent arc toward entry interface
          this.velocity.y = -110.0;
        }
        // ORBITAL MODE: Reach orbital insertion at ~86 km
        else if (!isSuborbital && (this.altitude >= 86000 || this.speed >= 3100)) {
          this.phase = FLIGHT_PHASES.ORBIT;
          this.throttle = 0;
          this.orbitTimer = 0.0;
          this.shipRaptorMode = 'OFF';
          this.vehicle.setStarshipThrottle(0, false);
        }
        break;
      }

      case FLIGHT_PHASES.ORBIT: {
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

        // Auto mission coasts 6.5s in orbit for space panoramic view, then triggers deorbit burn
        if (this.autoMission) {
          this.throttle = 0;
          this.orbitTimer += dt;
          if (this.orbitTimer >= 6.5) {
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
      }

      case FLIGHT_PHASES.DEORBIT: {
        this.missionTime += dt;
        if (this.autoMission) {
          this.throttle = 0.85;
          // Orient to entry attitude (+66 deg so +Z black ceramic heatshield faces down toward planet)
          this.pitch = THREE.MathUtils.lerp(this.pitch, 1.15, dt * 1.5);
        }
        this.shipRaptorMode = this.throttle > 0.05 ? 'LANDING_3' : 'OFF';
        this.vehicle.setStarshipThrottle(this.throttle, true);

        // Retrograde deorbit burn rapidly lowers Starship perigee down to 48 km entry interface near the planet
        this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, -1450.0, dt * 1.8);
        const toPadDeorbit = new THREE.Vector2(
          this.padCoords.x - this.position.x,
          this.padCoords.y - this.position.z
        );
        const distToPadDeorbit = toPadDeorbit.length();
        if (distToPadDeorbit > 10.0) {
          toPadDeorbit.normalize();
          this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, toPadDeorbit.x * Math.min(900.0, distToPadDeorbit * 0.18), dt * 1.5);
          this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, toPadDeorbit.y * Math.min(900.0, distToPadDeorbit * 0.18), dt * 1.5);
        }

        this.position.addScaledVector(this.velocity, dt);
        this.altitude = Math.max(0, this.position.y - this.padElevation);

        // Enter Hypersonic Atmospheric Entry at 48 km (right above the Martian surface!)
        if (this.altitude <= 48000) {
          this.phase = FLIGHT_PHASES.HYPERSONIC_ENTRY;
          this.entryStartAlt = Math.max(36000, this.altitude);
          this.throttle = 0;
          this.heat = 0.0;
          this.shipRaptorMode = 'OFF';
          this.vehicle.setStarshipThrottle(0, false);
          this.vehicle.setReentryHeat(0.0);
        }
        break;
      }

      case FLIGHT_PHASES.HYPERSONIC_ENTRY: {
        this.missionTime += dt;
        this.shipRaptorMode = this.throttle > 0.05 ? 'LANDING_3' : 'OFF';
        if (this.autoMission) {
          this.throttle = 0;
          // High angle-of-attack (+68 deg): places +Z black ceramic heatshield directly downward into the plasma flow!
          const bellyFlopAngle = 1.18;
          this.pitch = THREE.MathUtils.lerp(this.pitch, bellyFlopAngle, dt * 2.4);
          this.roll = THREE.MathUtils.lerp(this.roll, 0.0, dt * 2.5);
        }

        // Flap actuation based on player inputs or autonomous hypersonic trim
        let flapPitch = input.pitch || 0;
        let flapRoll = input.steer || 0;
        if (this.autoMission) {
          flapPitch = Math.sin(this.missionTime * 1.5) * 0.22;
          flapRoll = Math.cos(this.missionTime * 1.2) * 0.15;
        }
        this.vehicle.setFlapDeflection(flapPitch, flapRoll);

        // Sequential Physics-Based Convective Plasma Heating (Sutton-Graves q ~ sqrt(rho) * v^3):
        // Starts at 0.0 at entry interface (~48 km), rises smoothly to peak heating (~28 km),
        // and sequentially decreases back to 0.0 by 12.5 km as atmospheric drag slows the vehicle!
        const entryTop = Math.max(36000, this.entryStartAlt || 48000);
        const entryBottom = 12500;
        const entryProgress = THREE.MathUtils.clamp((entryTop - this.altitude) / (entryTop - entryBottom), 0.0, 1.0);
        // Asymmetric physical bell curve peaking around 52% of entry depth (~28 km altitude)
        const bellEnvelope = Math.sin(entryProgress * Math.PI);
        const densityFactor = Math.sqrt(THREE.MathUtils.clamp(marsDensity / 0.0035, 0.05, 2.2));
        const velFactor = THREE.MathUtils.clamp(this.speed / 1350.0, 0.25, 1.35);
        const targetHeat = THREE.MathUtils.clamp(
          Math.pow(bellEnvelope, 1.15) * (0.65 + 0.35 * densityFactor * velFactor),
          0.0,
          1.0
        );
        this.heat = THREE.MathUtils.lerp(this.heat, targetHeat, dt * 3.5);
        this.vehicle.setReentryHeat(this.heat);

        // Guide Starship along hypersonic lifting-body corridor back toward Starbase launch site
        const toPadEntry = new THREE.Vector2(
          this.padCoords.x - this.position.x,
          this.padCoords.y - this.position.z
        );
        const horizDistEntry = toPadEntry.length();
        const timeToBellyflop = Math.max(4.0, (this.altitude - entryBottom) / 1400.0);
        if (this.autoMission && horizDistEntry > 5.0) {
          toPadEntry.normalize();
          const desiredHorizSpeed = THREE.MathUtils.clamp(horizDistEntry / timeToBellyflop, 20.0, 1400.0);
          this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, toPadEntry.x * desiredHorizSpeed, dt * 1.8);
          this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, toPadEntry.y * desiredHorizSpeed, dt * 1.8);
        }

        // Realistic hypersonic atmospheric braking deceleration profile (48 km -> 12.5 km)
        const targetEntryVy = THREE.MathUtils.lerp(-1550.0, -145.0, Math.pow(entryProgress, 0.75));
        this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, targetEntryVy, dt * 2.2);
        this.acceleration.set(0, (targetEntryVy - this.velocity.y) * 2.2 + this.marsGravity * 2.2 * bellEnvelope, 0);

        this.position.addScaledVector(this.velocity, dt);
        this.altitude = Math.max(0, this.position.y - this.padElevation);

        // Transition to subsonic Belly-Flop at 12.5 km when plasma has sequentially faded out
        if (this.altitude <= entryBottom) {
          this.phase = FLIGHT_PHASES.BELLYFLOP;
          this.heat = 0.0;
          this.vehicle.setReentryHeat(0.0);
        }
        break;
      }

      case FLIGHT_PHASES.BELLYFLOP: {
        this.missionTime += dt;
        // Ensure any residual plasma heat decays to 0
        this.heat = Math.max(0.0, this.heat - dt * 3.0);
        this.vehicle.setReentryHeat(this.heat);

        this.shipRaptorMode = this.throttle > 0.05 ? 'LANDING_3' : 'OFF';
        if (this.autoMission) {
          this.throttle = 0;
          // Horizontal skydiving attitude (+90 deg): black heatshield belly faces down into the airflow
          this.pitch = THREE.MathUtils.lerp(this.pitch, Math.PI / 2, dt * 2.5);
          this.roll = THREE.MathUtils.lerp(this.roll, 0.0, dt * 2.5);
        }

        // Aerodynamic skydiving guidance: 4 flaps steer Starship directly over Mechazilla catch tower (padCoords + offset)
        const catchTargetX = this.padCoords.x;
        const catchTargetZ = this.padCoords.y;
        const dxPad = catchTargetX - this.position.x;
        const dzPad = catchTargetZ - this.position.z;
        const distPad = Math.hypot(dxPad, dzPad);

        // Terminal velocity physics: gravity (-3.72 m/s²) balanced by cross-body aerodynamic drag
        const descentRate = this.altitude > 3500 ? -240.0 : -82.0;
        const dragDecel = (descentRate - this.velocity.y) * 2.2;
        this.velocity.y += dragDecel * dt;

        const timeRemaining = Math.max(2.0, (this.altitude - 1100.0) / Math.max(50.0, -this.velocity.y));
        if (this.autoMission) {
          const targetVx = dxPad / timeRemaining;
          const targetVz = dzPad / timeRemaining;
          this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVx, dt * 2.8);
          this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVz, dt * 2.8);
        } else {
          this.velocity.x *= (1.0 - 0.35 * dt);
          this.velocity.z *= (1.0 - 0.35 * dt);
        }
        this.acceleration.set(0, dragDecel + this.marsGravity, 0);

        let bfPitch = input.pitch || 0;
        let bfRoll = input.steer || 0;
        if (this.autoMission) {
          bfPitch = Math.sin(this.missionTime * 2.2) * 0.20 + THREE.MathUtils.clamp(dxPad * 0.002, -0.25, 0.25);
          bfRoll = Math.cos(this.missionTime * 2.4) * 0.14 + THREE.MathUtils.clamp(dzPad * 0.002, -0.25, 0.25);
        }
        this.vehicle.setFlapDeflection(bfPitch, bfRoll);

        this.position.addScaledVector(this.velocity, dt);
        this.altitude = Math.max(0, this.position.y - this.padElevation);

        // Ensure Mechazilla chopsticks are open at catch height (83.8m) awaiting Starship
        this.vehicle.setChopsticks(0.0, 83.8);

        // At 1,200m altitude in Auto Mode, trigger header-tank Landing Flip Maneuver!
        if (this.autoMission && this.altitude <= 1200) {
          this.phase = FLIGHT_PHASES.LANDING_FLIP;
          this.pitchVel = -2.4; // Initial angular momentum from gimbaled Raptors + aft flap tuck
          this.throttle = 1.0;
          this.shipRaptorMode = 'LANDING_3';
          this.vehicle.setStarshipThrottle(1.0, false);
        } else if (!this.autoMission && this.altitude <= 55) {
          this.phase = FLIGHT_PHASES.TOUCHDOWN;
          this.landingLegsDeployed = true;
          this.vehicle.setLandingLegs(1.0);
        }
        break;
      }

      case FLIGHT_PHASES.LANDING_FLIP: {
        this.missionTime += dt;
        this.heat = 0.0;
        this.vehicle.setReentryHeat(0.0);

        // Target Mechazilla catch coordinates (Starship base at padElevation + 52m puts forward catch pins at 83.8m chopsticks)
        const targetShipCatchY = this.padElevation + 52.0;
        const heightAboveCatch = Math.max(0.1, this.position.y - targetShipCatchY);

        if (this.autoMission) {
          // Real rotational dynamics (spring-damper TVC torque swinging Starship from +90° belly-flop to 0° vertical)
          const pitchError = 0.0 - this.pitch;
          const pitchTorque = pitchError * 7.5 - this.pitchVel * 3.6;
          this.pitchVel += pitchTorque * dt;
          this.pitch += this.pitchVel * dt;

          // Fold aft flaps during the flip to maximize rotational authority, then level out
          const flipProgress = THREE.MathUtils.clamp(1.0 - this.pitch / (Math.PI * 0.5), 0.0, 1.0);
          this.vehicle.setFlapDeflection(-0.55 * (1.0 - flipProgress), 0.0);

          // Physics-based suicide-burn throttle law: v_y^2 = 2 * a_net * h
          const desiredVy = -Math.sqrt(2.0 * 6.8 * heightAboveCatch) - 1.5;
          const vyError = desiredVy - this.velocity.y;
          const neededAccelY = this.marsGravity + THREE.MathUtils.clamp(vyError * 1.8, 0.0, 22.0);
          this.throttle = THREE.MathUtils.clamp(neededAccelY / Math.max(0.35, Math.cos(this.pitch) * 24.0), 0.35, 1.0);
        }

        // Real 3D Thrust Vectoring + Mars Gravity + Aerodynamic Drag
        const maxLandingAccel = 24.0;
        const thrustMag = this.throttle * maxLandingAccel;
        const dxCatch = this.padCoords.x - this.position.x;
        const dzCatch = this.padCoords.y - this.position.z;

        // TVC horizontal correction toward the Mechazilla catch arms
        const tvcAx = this.autoMission
          ? THREE.MathUtils.clamp(dxCatch * 1.4 - this.velocity.x * 2.2, -12.0, 12.0)
          : Math.sin(this.pitch) * Math.sin(this.yaw) * thrustMag;
        const tvcAz = this.autoMission
          ? THREE.MathUtils.clamp(dzCatch * 1.4 - this.velocity.z * 2.2, -12.0, 12.0)
          : Math.sin(this.pitch) * Math.cos(this.yaw) * thrustMag;
        const tvcAy = Math.max(0.2, Math.cos(this.pitch)) * thrustMag - this.marsGravity;

        this.acceleration.set(tvcAx, tvcAy, tvcAz);
        this.velocity.addScaledVector(this.acceleration, dt);
        this.position.addScaledVector(this.velocity, dt);
        this.altitude = Math.max(0, this.position.y - this.padElevation);

        if (this.starshipFuel > 0) {
          this.starshipFuel = Math.max(2.0, this.starshipFuel - this.throttle * 0.45 * dt);
        }
        this.shipRaptorMode = this.throttle > 0.05 ? 'LANDING_3' : 'OFF';
        this.vehicle.setStarshipThrottle(this.throttle, false);

        // Begin closing chopsticks slightly as Starship enters the tower catch envelope
        if (heightAboveCatch <= 90.0) {
          const preClose = THREE.MathUtils.clamp((90.0 - heightAboveCatch) / 180.0, 0.0, 0.45);
          this.vehicle.setChopsticks(preClose, 83.8);
        }

        if (heightAboveCatch <= 28.0 || this.altitude <= 80.0) {
          this.phase = FLIGHT_PHASES.TOUCHDOWN;
        }
        break;
      }

      case FLIGHT_PHASES.TOUCHDOWN: {
        this.missionTime += dt;
        this.heat = 0.0;
        this.vehicle.setReentryHeat(0.0);

        const targetShipCatchY = this.padElevation + 52.0;
        const distFromPadHoriz = Math.hypot(this.position.x - this.padCoords.x, this.position.z - this.padCoords.y);
        const catchingOnTower = this.autoMission || distFromPadHoriz < 45.0;

        if (catchingOnTower) {
          // MECHAZILLA CHOPSTICK CATCH FOR STARSHIP (Real Force + Torque Damping into Catch Pins)
          const hAbovePins = Math.max(0.0, this.position.y - targetShipCatchY);

          // Damped rotational stabilization to 0.0 deg vertical
          const pitchTorque = (0.0 - this.pitch) * 10.0 - this.pitchVel * 4.5;
          this.pitchVel += pitchTorque * dt;
          this.pitch += this.pitchVel * dt;

          // Target slow hover descent (-1.4 m/s -> -0.3 m/s) as pins settle onto chopstick arms
          const targetVy = - THREE.MathUtils.clamp(0.35 + hAbovePins * 0.16, 0.35, 5.5);
          const vyErr = targetVy - this.velocity.y;
          const ay = THREE.MathUtils.clamp(vyErr * 3.8, -6.0, 18.0);
          const ax = (this.padCoords.x - this.position.x) * 3.2 - this.velocity.x * 3.5;
          const az = (this.padCoords.y - this.position.z) * 3.2 - this.velocity.z * 3.5;

          this.throttle = THREE.MathUtils.clamp((ay + this.marsGravity) / 22.0, 0.22, 0.78);
          this.acceleration.set(ax, ay, az);
          this.velocity.addScaledVector(this.acceleration, dt);
          this.position.addScaledVector(this.velocity, dt);
          this.altitude = Math.max(0, this.position.y - this.padElevation);

          // Chopsticks progressively clamp onto Starship's forward catch pins as hAbovePins -> 0
          const clampProgress = THREE.MathUtils.clamp(1.0 - (hAbovePins / 28.0), 0.45, 1.0);
          this.vehicle.setChopsticks(clampProgress, 83.8);

          this.shipRaptorMode = 'LANDING_3';
          this.vehicle.setStarshipThrottle(this.throttle, false);

          if (hAbovePins <= 0.4 || this.position.y <= targetShipCatchY + 0.4) {
            this.position.set(this.padCoords.x, targetShipCatchY, this.padCoords.y);
            this.velocity.set(0, 0, 0);
            this.pitch = 0;
            this.pitchVel = 0;
            this.throttle = 0;
            this.shipCaughtByTower = true;
            this.shipRaptorMode = 'OFF';
            this.vehicle.setStarshipThrottle(0, false);
            this.vehicle.setChopsticks(1.0, 83.8); // Chopsticks locked onto Starship catch pins!
            this.phase = FLIGHT_PHASES.LANDED;
            this.cargoDoorsDeployed = true;
            this.vehicle.setCargoDoors(1.0);
          }
        } else {
          // Manual off-pad surface landing with 6 deployable legs
          this.landingLegsDeployed = true;
          this.vehicle.setLandingLegs(1.0);
          const currentGround = getMarsHeight(this.position.x, this.position.z);
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
            this.vehicle.setCargoDoors(1.0);
          }
        }
        break;
      }

      case FLIGHT_PHASES.LANDED:
        this.throttle = 0;
        this.heat = 0;
        this.vehicle.setReentryHeat(0);
        this.shipRaptorMode = 'OFF';
        this.vehicle.setStarshipThrottle(0, false);
        if (this.shipCaughtByTower) {
          this.vehicle.setChopsticks(1.0, 83.8);
        } else {
          this.vehicle.setLandingLegs(1.0);
        }
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

          // Continuous force-based horizontal TVC and vertical suicide-burn deceleration
          const dxB = this.padCoords.x - this.boosterPosition.x;
          const dzB = this.padCoords.y - this.boosterPosition.z;
          this.boosterVelocity.x += (dxB * 2.2 - this.boosterVelocity.x * 2.8) * dt;
          this.boosterVelocity.z += (dzB * 2.2 - this.boosterVelocity.z * 2.8) * dt;

          // Decelerates smoothly from -85 m/s down to -1.0 m/s at catch arms
          const targetVy = -THREE.MathUtils.clamp(Math.sqrt(Math.max(0.1, boosterAlt * 4.8)), 1.0, 60.0);
          this.boosterVelocity.y = THREE.MathUtils.lerp(this.boosterVelocity.y, targetVy, dt * 4.5);

          // Slight pendulum tilt matching horizontal TVC deceleration
          const tiltX = THREE.MathUtils.clamp(-this.boosterVelocity.z * 0.004, -0.12, 0.12);
          const tiltZ = THREE.MathUtils.clamp(this.boosterVelocity.x * 0.004, -0.12, 0.12);
          this.boosterQuaternion.setFromEuler(new THREE.Euler(tiltX, 0, tiltZ));

          this.vehicle.setBoosterThrottle(0.92);

          // As booster descends between chopsticks (alt <= 30m above catch point), chopsticks clamp shut!
          if (boosterAlt <= 30.0) {
            const clampProgress = THREE.MathUtils.clamp((30.0 - boosterAlt) / 30.0, 0.0, 0.98);
            this.vehicle.setChopsticks(clampProgress, 75.0);
          }

          // Catch touchdown moment!
          if (boosterAlt <= 0.8 || this.boosterPosition.y <= targetCatchElevation + 0.8) {
            this.boosterPosition.set(this.padCoords.x, targetCatchElevation, this.padCoords.y);
            this.boosterVelocity.set(0, 0, 0);
            this.boosterState = BOOSTER_STATES.CAUGHT;
            this.boosterTimer = 0.0;
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
          this.boosterVelocity.set(0, 0, 0);
          this.vehicle.setBoosterThrottle(0.0);
          this.boosterQuaternion.identity();

          // Once Starship begins its atmospheric return (BELLYFLOP / LANDING_FLIP / TOUCHDOWN / LANDED),
          // clear the caught booster from the chopstick arms so the tower can catch Starship!
          const shipReturningToTower = (
            this.phase === FLIGHT_PHASES.BELLYFLOP ||
            this.phase === FLIGHT_PHASES.LANDING_FLIP ||
            this.phase === FLIGHT_PHASES.TOUCHDOWN ||
            this.phase === FLIGHT_PHASES.LANDED
          );
          if (shipReturningToTower) {
            this.vehicle.boosterGroup.visible = false;
          } else {
            this.vehicle.boosterGroup.visible = true;
            this.boosterPosition.set(this.padCoords.x, targetCatchElevation, this.padCoords.y);
            this.vehicle.setChopsticks(1.0, 75.0);
          }
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
    this.periapsisKm = this.phase === FLIGHT_PHASES.ORBIT ? '88.4' : (this.trajectoryMode === 'SUBORBITAL' ? 'SUBORBITAL' : (altKm > 60 ? '48.0' : 'SUBORBITAL'));
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

