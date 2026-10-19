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

const EARTH_G0 = 9.80665; // Standard Earth gravity for accelerometer G-Force readout (m/s²)
const MARS_RADIUS = 3389500.0; // Mean Mars radius (m)

export class StarshipMissionPhysics {
  constructor(vehicleModel, startCoords = new THREE.Vector2(1400, 1150)) {
    this.vehicle = vehicleModel;
    this.padCoords = startCoords.clone();

    // Pad ground & OLM table elevation (22m above ground)
    this.padGroundY = getMarsHeight(this.padCoords.x, this.padCoords.y);
    this.padElevation = this.padGroundY + 22.0;

    // Physical Launch Control Pedestal coordinates (SW perimeter of Launch Pad 1, facing approach)
    const termX = this.padCoords.x - 38.0;
    const termZ = this.padCoords.y - 38.0;
    const termY = getMarsHeight(termX, termZ);
    this.terminalPosition = new THREE.Vector3(termX, termY, termZ);

    // Position & Kinematics (world coordinates, meters & m/s)
    this.position = new THREE.Vector3(this.padCoords.x, this.padElevation, this.padCoords.y);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.prevVelocity = new THREE.Vector3(0, 0, 0);
    this.acceleration = new THREE.Vector3(0, 0, 0); // Kinematic dV/dt (m/s²)
    this.properAcceleration = new THREE.Vector3(0, 3.721, 0); // IMU accelerometer proper acceleration (m/s²)

    // Orientation: Euler angles (rad) & angular velocities (rad/s)
    this.pitch = 0; // 0 = vertical nose up (+Y), +PI/2 = horizontal (+Z belly down toward ground)
    this.yaw = 0.6; // Launch azimuth downrange towards northeast
    this.roll = 0;
    this.pitchVel = 0.0;
    this.yawVel = 0.0;
    this.rollVel = 0.0;
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
    this.shipCaughtByTower = false;
    this.throttle = 0.0;
    this.altitude = 0.0; // height above pad/surface (m)
    this.speed = 0.0;    // total speed ||v|| (m/s)
    this.verticalSpeed = 0.0; // v_y (m/s)
    this.horizontalSpeed = 0.0; // sqrt(v_x^2 + v_z^2) (m/s)
    this.mach = '0.0';
    this.dynamicPressure = 0.0; // Pa
    this.heat = 0.0;            // Re-entry heating factor (0.0 to 1.0)
    this.gForce = '0.38';       // Proper IMU G-force in Earth G's (0.38G resting on Mars)
    this.downrange = '0.0';
    this.countdownTimer = 3.0;
    this.missionTime = 0.0;
    this.orbitTimer = 0.0;
    this.cargoDoorsDeployed = false;
    this.landingLegsDeployed = false;
    this.cargoOpenFactor = 0.0;
    this.legsDeployFactor = 0.0;

    // Propellant remaining (%)
    this.boosterFuel = 100.0;
    this.starshipFuel = 100.0;

    // Mars atmospheric & gravitational constants
    this.marsGravity = 3.721;    // Surface gravity (m/s²)
    this.surfaceDensity = 0.020; // Surface atmospheric density (kg/m³)
    this.scaleHeight = 11100.0;  // Atmospheric scale height (m)

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
    this.cargoOpenFactor = 0.0;
    this.legsDeployFactor = 0.0;
    this.showTrajectoryPrompt = false;
    this.entryStartAlt = 48000;
    this.shipCaughtByTower = false;

    this.position.set(this.padCoords.x, this.padElevation, this.padCoords.y);
    this.velocity.set(0, 0, 0);
    this.prevVelocity.set(0, 0, 0);
    this.acceleration.set(0, 0, 0);
    this.properAcceleration.set(0, this.marsGravity, 0);

    this.pitch = 0;
    this.yaw = 0.6;
    this.roll = 0;
    this.pitchVel = 0.0;
    this.yawVel = 0.0;
    this.rollVel = 0.0;

    this.altitude = 0;
    this.speed = 0;
    this.verticalSpeed = 0;
    this.horizontalSpeed = 0;
    this.mach = '0.0';
    this.dynamicPressure = 0;
    this.throttle = 0;
    this.heat = 0;
    this.gForce = (this.marsGravity / EARTH_G0).toFixed(2); // 0.38G on Mars pad
    this.downrange = '0.0';
    this.missionTime = 0;
    this.countdownTimer = 3.0;
    this.boosterFuel = 100.0;
    this.starshipFuel = 100.0;
    this.boosterFlameout = false;
    this.starshipFlameout = false;
    this.boosterAltitude = 0.0;
    this.boosterSpeed = 0.0;
    this.boosterRaptorMode = 'OFF';
    this.shipRaptorMode = 'OFF';

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
    if (this.vehicle.setLaunchButtonPressed) {
      this.vehicle.setLaunchButtonPressed(false);
    }

    // Place Launch Complex & Physical Launch Terminal on terrain
    this.vehicle.launchPadGroup.position.set(this.padCoords.x, this.padGroundY, this.padCoords.y);
    if (this.vehicle.placeLaunchTerminal) {
      this.vehicle.placeLaunchTerminal(this.terminalPosition.x, this.terminalPosition.y, this.terminalPosition.z);
    }
    this.vehicle.boosterGroup.position.copy(this.position);
    this.vehicle.boosterGroup.quaternion.identity();
    this.vehicle.starshipGroup.position.set(this.position.x, this.position.y + 75.0, this.position.z);
    this.vehicle.starshipGroup.quaternion.identity();
  }

  toggleAutoMission() {
    this.autoMission = !this.autoMission;
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

  toggleLandingLegs() {
    this.landingLegsDeployed = !this.landingLegsDeployed;
    return this.landingLegsDeployed;
  }

  toggleCargoDoors() {
    this.cargoDoorsDeployed = !this.cargoDoorsDeployed;
    return this.cargoDoorsDeployed;
  }

  startLaunch() {
    if (this.vehicle.setLaunchButtonPressed) {
      this.vehicle.setLaunchButtonPressed(true);
    }
    if (this.phase === FLIGHT_PHASES.ON_PAD || this.phase === FLIGHT_PHASES.LANDED) {
      if (this.phase === FLIGHT_PHASES.LANDED) {
        this.shipCaughtByTower = false;
        this.cargoDoorsDeployed = false;
      }
      this.phase = FLIGHT_PHASES.COUNTDOWN;
      this.countdownTimer = 2.6;
    }
  }

  triggerStageSeparation() {
    if (this.vehicle.isMated) {
      this.executeHotStaging();
    }
  }

  executeHotStaging() {
    if (!this.vehicle.isMated) return;
    this.phase = FLIGHT_PHASES.STARSHIP_ASCENT;
    this.vehicle.setMated(false);

    // Separate booster at current stack position; Starship is 75m above booster base along vehicle body axis
    const shipUpOffset = new THREE.Vector3(0, 75.0, 0).applyQuaternion(this.quaternion);
    this.boosterPosition.copy(this.position);
    this.boosterVelocity.copy(this.velocity);
    this.boosterQuaternion.copy(this.quaternion);

    // Move Starship state vector to its true physical upper-stage position and impart hot-stage separation impulse
    this.position.add(shipUpOffset);
    const bodyUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
    this.velocity.addScaledVector(bodyUp, 6.5);
    this.boosterVelocity.addScaledVector(bodyUp, -8.5);

    this.boosterState = BOOSTER_STATES.BOOSTBACK;
    this.boosterTimer = 0.0;

    if (this.autoMission || this.throttle < 0.5) {
      this.throttle = 1.0;
    }
    this.vehicle.setStarshipThrottle(this.throttle, this.altitude > 25000);
  }

  triggerDeorbit() {
    if (!this.vehicle.isMated && this.phase !== FLIGHT_PHASES.ON_PAD && this.phase !== FLIGHT_PHASES.LANDED) {
      this.phase = FLIGHT_PHASES.DEORBIT;
      if (this.autoMission) {
        this.throttle = 0.9;
      }
    }
  }

  triggerLandingFlip() {
    if (!this.vehicle.isMated && this.phase !== FLIGHT_PHASES.ON_PAD && this.phase !== FLIGHT_PHASES.LANDED) {
      this.phase = FLIGHT_PHASES.LANDING_FLIP;
      this.pitchVel -= 1.8;
      if (this.autoMission || this.throttle < 0.4) {
        this.throttle = 1.0;
      }
    }
  }

  // -------------------------------------------------------------
  // STRICT NEWTONIAN FLIGHT DYNAMICS & ORBITAL INTEGRATOR
  // -------------------------------------------------------------
  update(dt, input = {}) {
    if (dt <= 0) return;
    if (dt > 0.05) dt = 0.05;

    this.prevVelocity.copy(this.velocity);

    // Smoothly animate deployable Landing Legs & Cargo Bay Doors
    const targetLegs = this.landingLegsDeployed ? 1.0 : 0.0;
    this.legsDeployFactor = THREE.MathUtils.lerp(this.legsDeployFactor, targetLegs, dt * 3.5);
    this.vehicle.setLandingLegs(this.legsDeployFactor);

    const targetCargo = this.cargoDoorsDeployed ? 1.0 : 0.0;
    this.cargoOpenFactor = THREE.MathUtils.lerp(this.cargoOpenFactor, targetCargo, dt * 2.2);
    this.vehicle.setCargoDoors(this.cargoOpenFactor);

    // Local terrain height beneath vehicle & altitude above pad/surface
    const localTerrainY = getMarsHeight(this.position.x, this.position.z);
    const supportFloorY = (this.vehicle.isMated && Math.hypot(this.position.x - this.padCoords.x, this.position.z - this.padCoords.y) < 30.0)
      ? this.padElevation
      : (this.shipCaughtByTower ? this.padElevation + 52.0 : localTerrainY);

    this.altitude = Math.max(0.0, this.position.y - this.padElevation);
    const agl = Math.max(0.0, this.position.y - supportFloorY);

    // Altitude-dependent Mars gravity g(h) = g0 * (R / (R + h))^2
    const rFromCenter = MARS_RADIUS + Math.max(0.0, this.altitude);
    const localGravity = this.marsGravity * Math.pow(MARS_RADIUS / rFromCenter, 2);

    // Mars atmospheric density rho(h) & speed of sound a(h)
    const marsDensity = this.surfaceDensity * Math.exp(-Math.max(0.0, this.altitude) / this.scaleHeight);
    const speedOfSound = Math.max(195.0, 240.0 - Math.min(45.0, (this.altitude / 60000.0) * 45.0));

    this.speed = this.velocity.length();
    this.verticalSpeed = this.velocity.y;
    this.horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.mach = (this.speed / speedOfSound).toFixed(2);
    this.dynamicPressure = 0.5 * marsDensity * this.speed * this.speed;

    // Show Orbital / Suborbital trajectory decision prompt during upper stage ascent before space insertion
    this.showTrajectoryPrompt = (
      !this.vehicle.isMated &&
      (this.phase === FLIGHT_PHASES.STARSHIP_ASCENT || !this.autoMission) &&
      this.altitude >= 20000 &&
      this.altitude < 78000 &&
      this.verticalSpeed > 0
    );

    // -------------------------------------------------------------
    // 1. MANUAL MODE: FULL UNRESTRICTED CONTROL AT ANY POINT IN TIME
    // -------------------------------------------------------------
    if (!this.autoMission) {
      // Continuous throttle control at ANY time (even on pad or landed!)
      if (input.fullThrottle) this.throttle = 1.0;
      else if (input.throttleCut) this.throttle = 0.0;
      else if (input.throttleUp || input.forward) this.throttle = Math.min(1.0, this.throttle + dt * 0.85);
      else if (input.throttleDown || input.backward) this.throttle = Math.max(0.0, this.throttle - dt * 0.85);

      // Manual stage separation, landing legs, cargo bay doors at any time
      if (input.stageSeparate && this.vehicle.isMated) {
        this.executeHotStaging();
      }
      if (input.legsToggle && !this._prevLegsKey) {
        this.toggleLandingLegs();
      }
      if (input.cargoToggle && !this._prevCargoKey) {
        this.toggleCargoDoors();
      }

      // If on pad or landed and user throttles up so Thrust > Weight, liftoff immediately!
      if ((this.phase === FLIGHT_PHASES.ON_PAD || this.phase === FLIGHT_PHASES.LANDED || this.phase === FLIGHT_PHASES.COUNTDOWN) && this.throttle > 0.25) {
        this.shipCaughtByTower = false;
        this.phase = this.vehicle.isMated ? FLIGHT_PHASES.BOOSTER_ASCENT : FLIGHT_PHASES.STARSHIP_ASCENT;
      }

      // Direct physical rotational torque from TVC (when thrusting), Aero Flaps, and RCS
      const tvcAuthority = 0.45 + 1.35 * this.throttle;
      const aeroAuthority = THREE.MathUtils.clamp(this.dynamicPressure / 1200.0, 0.0, 1.2);
      const rcsAuthority = 0.55; // Cold-gas RCS thrusters work in vacuum and atmosphere
      const totalRotAuthority = tvcAuthority + aeroAuthority + rcsAuthority;

      const pitchCmd = input.pitch || 0;
      const yawCmd = input.steer || 0;
      const rollCmd = input.roll || 0;

      this.pitchVel += pitchCmd * totalRotAuthority * 1.65 * dt;
      this.yawVel += yawCmd * totalRotAuthority * 1.45 * dt;
      this.rollVel += rollCmd * totalRotAuthority * 2.10 * dt;

      // Rotational rate damping (SAS rate gyro stabilization)
      const sasDamp = Math.exp(-3.2 * dt);
      if (Math.abs(pitchCmd) < 0.02) this.pitchVel *= sasDamp;
      if (Math.abs(yawCmd) < 0.02) this.yawVel *= sasDamp;
      if (Math.abs(rollCmd) < 0.02) this.rollVel *= sasDamp;

      this.pitch += this.pitchVel * dt;
      this.yaw += this.yawVel * dt;
      this.roll += this.rollVel * dt;

      // Wrap pitch cleanly to [-PI, PI]
      if (this.pitch > Math.PI) this.pitch -= Math.PI * 2;
      if (this.pitch < -Math.PI) this.pitch += Math.PI * 2;

      this.vehicle.setFlapDeflection(pitchCmd, yawCmd + rollCmd * 0.5);
      this.vehicle.setGridFinSteering(yawCmd, pitchCmd);
    }
    this._prevLegsKey = Boolean(input.legsToggle);
    this._prevCargoKey = Boolean(input.cargoToggle);

    // -------------------------------------------------------------
    // 2. AUTO-MISSION GUIDANCE COMPUTATION (Outputs Physical Throttle & Attitude Torque)
    // -------------------------------------------------------------
    if (this.autoMission) {
      this.updateAutoGuidance(dt, marsDensity, localGravity);
    } else {
      // Update descriptive phase label in Manual Mode based on physical state so telemetry stays informative
      this.updateManualPhaseLabel(agl);
    }

    // -------------------------------------------------------------
    // 3. STRICT NEWTONIAN FORCE SUMMATION: F_total = F_thrust + F_drag + F_lift + F_gravity + F_centrifugal
    // -------------------------------------------------------------
    const isRestingOnSupport = (
      (this.phase === FLIGHT_PHASES.ON_PAD || this.phase === FLIGHT_PHASES.LANDED ||
        (this.phase === FLIGHT_PHASES.COUNTDOWN && this.countdownTimer > 0.4)) &&
      agl <= 0.05 &&
      this.throttle < 0.22
    );

    if (isRestingOnSupport) {
      this.position.y = supportFloorY;
      this.velocity.set(0, 0, 0);
      this.acceleration.set(0, 0, 0);
      // On Mars pad/surface, ground normal force supports vehicle against Mars gravity (0.38G)
      this.properAcceleration.set(0, localGravity, 0);
      this.heat = Math.max(0.0, this.heat - dt * 3.0);
      this.vehicle.setReentryHeat(this.heat);
      this.boosterRaptorMode = 'OFF';
      this.shipRaptorMode = 'OFF';
      this.vehicle.setBoosterThrottle(0);
      this.vehicle.setStarshipThrottle(0, false);
    } else {
      this.missionTime += dt;

      // Compute current vehicle orientation quaternion & body axes
      const euler = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
      this.quaternion.setFromEuler(euler);
      // Vehicle nose axis (+Y in local coordinates) and windward heatshield belly normal (+Z in local coordinates)
      const bodyNose = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion).normalize();
      const bodyBelly = new THREE.Vector3(0, 0, 1).applyQuaternion(this.quaternion).normalize();

      // A. PROPULSION THRUST & PROPELLANT MASS DEPLETION (Tsiolkovsky mass ratio effect)
      let thrustAccelMag = 0.0;
      if (this.vehicle.isMated) {
        if (this.throttle > 0.005 && this.boosterFuel > 0) {
          this.boosterFuel = Math.max(0.0, this.boosterFuel - this.throttle * 0.78 * dt);
          // Full stack liftoff TWR ~ 1.5 Earth G (14.8 m/s²), rising to ~38 m/s² as Stage 1 propellant burns off
          const massRatioBoost = 1.0 + ((100.0 - this.boosterFuel) / 100.0) * 1.55;
          thrustAccelMag = 14.8 * massRatioBoost * this.throttle;
          this.boosterRaptorMode = this.throttle > 0.5 ? 'ALL_33' : 'BOOSTBACK_13';
        } else {
          if (this.boosterFuel <= 0) this.boosterFlameout = true;
          this.throttle = 0.0;
          this.boosterRaptorMode = 'OFF';
        }
        this.shipRaptorMode = this.phase === FLIGHT_PHASES.HOT_STAGING ? 'ALL_6' : 'OFF';
        this.vehicle.setBoosterThrottle(this.throttle);
        this.vehicle.setStarshipThrottle(this.phase === FLIGHT_PHASES.HOT_STAGING ? 1.0 : 0.0, this.altitude > 25000);
      } else {
        if (this.throttle > 0.005 && this.starshipFuel > 0) {
          this.starshipFuel = Math.max(0.0, this.starshipFuel - this.throttle * 0.40 * dt);
          // Starship 6 Raptors: 16.5 m/s² full -> 36.0 m/s² near empty
          const massRatioShip = 1.0 + ((100.0 - this.starshipFuel) / 100.0) * 1.20;
          thrustAccelMag = 16.5 * massRatioShip * this.throttle;
          this.shipRaptorMode = (this.phase === FLIGHT_PHASES.LANDING_FLIP || this.phase === FLIGHT_PHASES.TOUCHDOWN || this.throttle < 0.55)
            ? 'LANDING_3'
            : 'ALL_6';
        } else {
          if (this.starshipFuel <= 0) this.starshipFlameout = true;
          this.throttle = 0.0;
          this.shipRaptorMode = 'OFF';
        }
        this.vehicle.setStarshipThrottle(this.throttle, this.altitude > 26000);
      }

      const thrustAccel = bodyNose.clone().multiplyScalar(thrustAccelMag);

      // Add TVC lateral steering vector when descending in assisted landing/catch modes
      if (this.autoMission && (this.phase === FLIGHT_PHASES.LANDING_FLIP || this.phase === FLIGHT_PHASES.TOUCHDOWN) && this.throttle > 0.05) {
        const dxPad = this.padCoords.x - this.position.x;
        const dzPad = this.padCoords.y - this.position.z;
        const latAx = THREE.MathUtils.clamp(dxPad * 1.6 - this.velocity.x * 2.4, -9.5, 9.5);
        const latAz = THREE.MathUtils.clamp(dzPad * 1.6 - this.velocity.z * 2.4, -9.5, 9.5);
        thrustAccel.x = latAx;
        thrustAccel.z = latAz;
      }

      // B. AERODYNAMIC DRAG & LIFTING-BODY FORCES (Angle-of-Attack alpha dependent)
      const aeroAccel = new THREE.Vector3(0, 0, 0);
      let angleOfAttack = 0.0;
      if (this.speed > 0.5 && marsDensity > 1e-8) {
        const velHat = this.velocity.clone().divideScalar(this.speed);
        const cosAlpha = THREE.MathUtils.clamp(bodyNose.dot(velHat), -1.0, 1.0);
        angleOfAttack = Math.acos(cosAlpha); // 0 = nose into wind, PI/2 = broadside belly-flop
        const sinAlpha = Math.sin(angleOfAttack);

        // Axial Cd (streamlined nosecone = 0.22) vs Cross-flow belly-flop Cd (cylinder + flaps = 1.65)
        const cdAxial = 0.22;
        const cdCross = 1.65;
        const effectiveCd = cdAxial * Math.cos(angleOfAttack) * Math.cos(angleOfAttack) + cdCross * sinAlpha * sinAlpha;

        // Effective reference area A(alpha) / mass m:
        // Nose-first area = pi * 4.5^2 = 63.6 m²; Belly-flop broadside area = 9m * 50m + flaps = 520 m²
        const ballisticCoeffInv = (0.00018 + 0.0038 * sinAlpha * sinAlpha);
        const dragMag = this.dynamicPressure * effectiveCd * ballisticCoeffInv;
        aeroAccel.addScaledVector(velHat, -dragMag);

        // Lifting-body crossforce during hypersonic entry & skydiving belly-flop
        const liftCoeff = 0.55 * Math.sin(2.0 * angleOfAttack);
        const liftDir = bodyBelly.clone().addScaledVector(velHat, -bodyBelly.dot(velHat));
        if (liftDir.lengthSq() > 1e-4) {
          liftDir.normalize();
          const liftMag = this.dynamicPressure * liftCoeff * (0.0008 * sinAlpha);
          aeroAccel.addScaledVector(liftDir, liftMag);
        }

        // Auto-guidance aerodynamic bank/trim steering back toward Starbase landing corridor
        if (this.autoMission && (this.phase === FLIGHT_PHASES.HYPERSONIC_ENTRY || this.phase === FLIGHT_PHASES.BELLYFLOP)) {
          const dxPad = this.padCoords.x - this.position.x;
          const dzPad = this.padCoords.y - this.position.z;
          const timeToTarget = Math.max(3.5, Math.abs(this.altitude - 1100.0) / Math.max(40.0, Math.abs(this.velocity.y)));
          const desiredVx = THREE.MathUtils.clamp(dxPad / timeToTarget, -1200.0, 1200.0);
          const desiredVz = THREE.MathUtils.clamp(dzPad / timeToTarget, -1200.0, 1200.0);
          const aeroSteerGain = THREE.MathUtils.clamp(marsDensity / 0.0025, 0.25, 2.4);
          aeroAccel.x += THREE.MathUtils.clamp((desiredVx - this.velocity.x) * 1.1 * aeroSteerGain, -28.0, 28.0);
          aeroAccel.z += THREE.MathUtils.clamp((desiredVz - this.velocity.z) * 1.1 * aeroSteerGain, -28.0, 28.0);
        }
      }

      // C. GRAVITATIONAL & SPHERICAL ORBITAL CENTRIFUGAL ACCELERATION (v_horiz^2 / r)
      // At Mars orbital velocity (~3,400 m/s horizontal), centrifugal lift v_horiz^2 / r balances localGravity!
      const centrifugalUp = (this.horizontalSpeed * this.horizontalSpeed) / rFromCenter;
      const effectiveGravityVec = new THREE.Vector3(0, centrifugalUp - localGravity, 0);

      // D. SUM NON-GRAVITATIONAL (PROPER) & TOTAL KINEMATIC ACCELERATIONS
      this.properAcceleration.copy(thrustAccel).add(aeroAccel);
      this.acceleration.copy(this.properAcceleration).add(effectiveGravityVec);

      // Strict Symplectic Euler Integration: v(t+dt) = v(t) + a*dt, x(t+dt) = x(t) + v(t+dt)*dt
      this.velocity.addScaledVector(this.acceleration, dt);
      this.position.addScaledVector(this.velocity, dt);

      // Ground / Pad / Tower Catch Physical Contact Constraints
      const updatedGroundY = getMarsHeight(this.position.x, this.position.z);
      const minFloorY = (this.vehicle.isMated && Math.hypot(this.position.x - this.padCoords.x, this.position.z - this.padCoords.y) < 30.0)
        ? this.padElevation
        : updatedGroundY;

      if (this.position.y <= minFloorY) {
        this.position.y = minFloorY;
        if (this.velocity.y < 0) {
          this.velocity.set(0, 0, 0);
          this.acceleration.set(0, 0, 0);
          this.properAcceleration.set(0, localGravity, 0);
          if (this.phase !== FLIGHT_PHASES.ON_PAD && this.phase !== FLIGHT_PHASES.COUNTDOWN) {
            this.phase = FLIGHT_PHASES.LANDED;
            this.throttle = 0.0;
            this.landingLegsDeployed = true;
            this.cargoDoorsDeployed = true;
          }
        }
      }

      // E. STRICT PHYSICS-BASED CONVECTIVE PLASMA HEATING (Sutton-Graves q_conv ~ sqrt(rho) * v^3)
      // Only heats when in atmosphere (altitude < 55 km) at high Mach speeds (> 650 m/s)
      if (!this.vehicle.isMated && this.altitude < 55000 && this.altitude > 10500 && this.speed > 520.0 && this.velocity.y < 50.0) {
        // Sutton-Graves convective heating flux normalized to peak entry conditions
        const rhoRatio = Math.sqrt(THREE.MathUtils.clamp(marsDensity / 0.0032, 0.0, 2.5));
        const velCubed = Math.pow(THREE.MathUtils.clamp((this.speed - 520.0) / 1450.0, 0.0, 1.35), 2.2);
        // Bell envelope across entry corridor (48 km -> 12.5 km) so plasma builds and fades sequentially
        const altNorm = THREE.MathUtils.clamp((48000.0 - this.altitude) / (48000.0 - 12500.0), 0.0, 1.0);
        const corridorBell = Math.sin(altNorm * Math.PI);
        const targetHeat = THREE.MathUtils.clamp(rhoRatio * velCubed * (0.35 + 0.75 * corridorBell), 0.0, 1.0);
        this.heat = THREE.MathUtils.lerp(this.heat, targetHeat, dt * 4.0);
      } else {
        this.heat = Math.max(0.0, this.heat - dt * 3.2);
      }
      this.vehicle.setReentryHeat(this.heat);
    }

    // -------------------------------------------------------------
    // 4. REAL-TIME SUPER HEAVY BOOSTER RETURN & MECHAZILLA CATCH
    // -------------------------------------------------------------
    this.updateBoosterReturn(dt);

    // -------------------------------------------------------------
    // 5. STRICT TELEMETRY & IMU G-FORCE COMPUTATION
    // -------------------------------------------------------------
    this.speed = this.velocity.length();
    this.verticalSpeed = this.velocity.y;
    this.horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.altitude = Math.max(0.0, this.position.y - this.padElevation);
    this.mach = (this.speed / speedOfSound).toFixed(2);
    this.dynamicPressure = 0.5 * marsDensity * this.speed * this.speed;

    const horizDist = Math.hypot(this.position.x - this.padCoords.x, this.position.z - this.padCoords.y);
    this.downrange = (horizDist / 1000.0).toFixed(1);

    // Proper IMU Accelerometer G-Force in standard Earth G's (g0 = 9.80665 m/s²)
    // Resting on Mars = 0.38G, Orbital Freefall = 0.00G, Boost/Entry = true physical G load
    const properG = this.properAcceleration.length() / EARTH_G0;
    this.gForce = properG.toFixed(2);

    // Orbital & Aerodynamic Telemetry
    const vY = this.velocity.y;
    const effGrav = Math.max(0.2, localGravity - (this.horizontalSpeed * this.horizontalSpeed) / rFromCenter);
    const ballisticApex = vY > 0
      ? this.altitude + (vY * vY) / (2.0 * effGrav)
      : this.altitude;
    this.apogeeKm = (Math.max(this.altitude, ballisticApex) / 1000.0).toFixed(1);
    this.periapsisKm = (this.horizontalSpeed >= 3250.0)
      ? Math.max(48.0, (this.altitude / 1000.0) - 4.0).toFixed(1)
      : 'SUBORBITAL';
    this.qKPa = (this.dynamicPressure / 1000.0).toFixed(1);
    this.isMaxQ = this.dynamicPressure > 9500 && this.altitude > 5000 && this.altitude < 18000;
    const activeFuel = this.vehicle.isMated ? this.boosterFuel : this.starshipFuel;
    this.deltaV = Math.round((activeFuel / 100.0) * (this.vehicle.isMated ? 2450 : 3820));
    this.chamberPressure = Math.round(this.throttle * 350);
    this.pitchDeg = Math.round(this.pitch * (180 / Math.PI));
    this.yawDeg = Math.round(((this.yaw * (180 / Math.PI)) % 360 + 360) % 360);
    this.rollDeg = Math.round(this.roll * (180 / Math.PI));

    // Apply 3D transforms to vehicle meshes
    const finalEuler = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
    this.quaternion.setFromEuler(finalEuler);

    if (this.vehicle.isMated) {
      this.vehicle.boosterGroup.position.copy(this.position);
      this.vehicle.boosterGroup.quaternion.copy(this.quaternion);

      const shipOffset = new THREE.Vector3(0, 75.0, 0).applyQuaternion(this.quaternion);
      this.vehicle.starshipGroup.position.copy(this.position).add(shipOffset);
      this.vehicle.starshipGroup.quaternion.copy(this.quaternion);
    } else {
      this.vehicle.starshipGroup.position.copy(this.position);
      this.vehicle.starshipGroup.quaternion.copy(this.quaternion);
    }

    this.vehicle.update(dt);
  }

  // -------------------------------------------------------------
  // AUTONOMOUS FLIGHT COMPUTER (Used when autoMission === true)
  // Drives physical throttle & attitude without bypassing Newtonian integration
  // -------------------------------------------------------------
  updateAutoGuidance(dt, marsDensity, localGravity) {
    switch (this.phase) {
      case FLIGHT_PHASES.ON_PAD:
        this.throttle = 0.0;
        break;

      case FLIGHT_PHASES.COUNTDOWN:
        this.countdownTimer -= dt;
        if (this.countdownTimer <= 1.8) {
          this.throttle = THREE.MathUtils.lerp(this.throttle, 1.0, dt * 2.5);
          this.boosterRaptorMode = 'ALL_33';
          this.vehicle.setBoosterThrottle(this.throttle);
        }
        if (this.countdownTimer <= 0) {
          this.phase = FLIGHT_PHASES.BOOSTER_ASCENT;
          this.throttle = 1.0;
        }
        break;

      case FLIGHT_PHASES.BOOSTER_ASCENT: {
        this.throttle = 1.0;
        // Gravity turn pitch program: 0° vertical off the pad, pitching downrange to ~42° by 22 km
        const targetPitch = THREE.MathUtils.clamp((this.altitude / 38000.0) * 0.85, 0.0, 0.82);
        this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, dt * 0.65);
        this.vehicle.setGridFinSteering(0, 0);

        if (this.altitude >= 22000 || this.boosterFuel <= 18.0 || this.boosterFlameout) {
          this.phase = FLIGHT_PHASES.HOT_STAGING;
          this.hotStageTimer = 0.0;
        }
        break;
      }

      case FLIGHT_PHASES.HOT_STAGING:
        this.throttle = 0.35;
        this.hotStageTimer = (this.hotStageTimer || 0.0) + dt;
        if (this.hotStageTimer >= 1.1) {
          this.executeHotStaging();
        }
        break;

      case FLIGHT_PHASES.STARSHIP_ASCENT: {
        this.throttle = 1.0;
        const isSuborbital = this.trajectoryMode === 'SUBORBITAL';
        const targetAscentPitch = isSuborbital
          ? THREE.MathUtils.clamp(0.55 + (this.altitude / 60000.0) * 0.55, 0.55, 1.05)
          : THREE.MathUtils.clamp(0.65 + ((this.altitude - 20000.0) / 55000.0) * 0.88, 0.65, 1.48);
        this.pitch = THREE.MathUtils.lerp(this.pitch, targetAscentPitch, dt * 0.75);

        if (isSuborbital && (this.altitude >= 48000 || this.speed >= 1650)) {
          this.phase = FLIGHT_PHASES.DEORBIT;
          this.entryStartAlt = Math.max(38000, this.altitude);
        } else if (!isSuborbital && (this.altitude >= 84000 || this.horizontalSpeed >= 3300)) {
          this.phase = FLIGHT_PHASES.ORBIT;
          this.throttle = 0.0;
          this.orbitTimer = 0.0;
        }
        break;
      }

      case FLIGHT_PHASES.ORBIT: {
        this.throttle = 0.0;
        this.pitch = THREE.MathUtils.lerp(this.pitch, Math.PI * 0.5, dt * 1.2);
        if (!this.starshipScore) {
          const boosterBonus = this.boosterState === BOOSTER_STATES.CAUGHT ? 5000 : 2500;
          this.starshipScore = Math.round(10000 + (this.altitude / 1000) * 45 + (this.speed * 1.6) + boosterBonus);
        }
        this.orbitTimer += dt;
        if (this.orbitTimer >= 7.0) {
          this.triggerDeorbit();
        }
        break;
      }

      case FLIGHT_PHASES.DEORBIT: {
        // Point engines retrograde/upward to brake orbital speed and drop perigee into entry interface (<48 km)
        const toPad = new THREE.Vector2(this.padCoords.x - this.position.x, this.padCoords.y - this.position.z);
        const padAzimuth = Math.atan2(toPad.x, toPad.y);
        this.yaw = THREE.MathUtils.lerp(this.yaw, padAzimuth, dt * 1.8);

        // Pitch > PI/2 (+135 deg) points nose downward/retrograde so thrust accelerates downward & brakes horizontal speed
        this.pitch = THREE.MathUtils.lerp(this.pitch, 2.25, dt * 2.2);
        this.throttle = 0.92;

        if (this.altitude <= 47500 && this.velocity.y < -180.0) {
          this.phase = FLIGHT_PHASES.HYPERSONIC_ENTRY;
          this.entryStartAlt = Math.max(36000, this.altitude);
          this.throttle = 0.0;
        }
        break;
      }

      case FLIGHT_PHASES.HYPERSONIC_ENTRY: {
        this.throttle = 0.0;
        // High angle-of-attack (+68 deg = 1.18 rad): places +Z black ceramic heatshield belly directly into the hypersonic shockwave
        this.pitch = THREE.MathUtils.lerp(this.pitch, 1.18, dt * 2.4);
        this.roll = THREE.MathUtils.lerp(this.roll, 0.0, dt * 2.5);
        this.vehicle.setFlapDeflection(Math.sin(this.missionTime * 1.6) * 0.22, Math.cos(this.missionTime * 1.3) * 0.14);

        if (this.altitude <= 12500) {
          this.phase = FLIGHT_PHASES.BELLYFLOP;
        }
        break;
      }

      case FLIGHT_PHASES.BELLYFLOP: {
        this.throttle = 0.0;
        // Horizontal skydiving attitude (+90 deg): black heatshield belly faces down into airflow
        this.pitch = THREE.MathUtils.lerp(this.pitch, Math.PI * 0.5, dt * 2.5);
        this.roll = THREE.MathUtils.lerp(this.roll, 0.0, dt * 2.5);
        this.vehicle.setChopsticks(0.0, 83.8);

        const dxPad = this.padCoords.x - this.position.x;
        const dzPad = this.padCoords.y - this.position.z;
        this.vehicle.setFlapDeflection(
          Math.sin(this.missionTime * 2.2) * 0.18 + THREE.MathUtils.clamp(dxPad * 0.002, -0.25, 0.25),
          Math.cos(this.missionTime * 2.4) * 0.14 + THREE.MathUtils.clamp(dzPad * 0.002, -0.25, 0.25)
        );

        if (this.altitude <= 1350) {
          this.phase = FLIGHT_PHASES.LANDING_FLIP;
          this.pitchVel = -2.2;
          this.throttle = 1.0;
        }
        break;
      }

      case FLIGHT_PHASES.LANDING_FLIP: {
        const targetShipCatchY = this.padElevation + 52.0;
        const heightAboveCatch = Math.max(0.1, this.position.y - targetShipCatchY);

        // Rotational PD torque controller swinging Starship from +90° belly-flop to 0° vertical
        const pitchError = 0.0 - this.pitch;
        const pitchTorque = pitchError * 7.8 - this.pitchVel * 3.8;
        this.pitchVel += pitchTorque * dt;
        this.pitch += this.pitchVel * dt;
        this.roll = THREE.MathUtils.lerp(this.roll, 0.0, dt * 4.0);

        const flipProgress = THREE.MathUtils.clamp(1.0 - this.pitch / (Math.PI * 0.5), 0.0, 1.0);
        this.vehicle.setFlapDeflection(-0.55 * (1.0 - flipProgress), 0.0);

        // Physics kinematic suicide-burn guidance law: v_target = -sqrt(2 * a_design * h)
        const desiredVy = -Math.sqrt(2.0 * 7.2 * heightAboveCatch) - 1.2;
        const vyError = desiredVy - this.velocity.y;
        const neededAccelY = localGravity + THREE.MathUtils.clamp(vyError * 2.2, 0.0, 26.0);
        const shipAvailAccel = 16.5 * (1.0 + ((100.0 - this.starshipFuel) / 100.0) * 1.20);
        this.throttle = THREE.MathUtils.clamp(neededAccelY / Math.max(0.35, Math.cos(this.pitch) * shipAvailAccel), 0.20, 1.0);

        if (heightAboveCatch <= 90.0) {
          const preClose = THREE.MathUtils.clamp((90.0 - heightAboveCatch) / 180.0, 0.0, 0.45);
          this.vehicle.setChopsticks(preClose, 83.8);
        }

        if (heightAboveCatch <= 28.0) {
          this.phase = FLIGHT_PHASES.TOUCHDOWN;
        }
        break;
      }

      case FLIGHT_PHASES.TOUCHDOWN: {
        const targetShipCatchY = this.padElevation + 52.0;
        const hAbovePins = Math.max(0.0, this.position.y - targetShipCatchY);

        const pitchTorque = (0.0 - this.pitch) * 10.0 - this.pitchVel * 4.5;
        this.pitchVel += pitchTorque * dt;
        this.pitch += this.pitchVel * dt;

        const targetVy = -THREE.MathUtils.clamp(0.35 + hAbovePins * 0.16, 0.35, 5.5);
        const vyErr = targetVy - this.velocity.y;
        const neededAy = localGravity + THREE.MathUtils.clamp(vyErr * 3.8, -2.5, 22.0);
        const shipAvailAccel = 16.5 * (1.0 + ((100.0 - this.starshipFuel) / 100.0) * 1.20);
        this.throttle = THREE.MathUtils.clamp(neededAy / shipAvailAccel, 0.15, 0.90);

        const clampProgress = THREE.MathUtils.clamp(1.0 - (hAbovePins / 28.0), 0.45, 1.0);
        this.vehicle.setChopsticks(clampProgress, 83.8);

        if (hAbovePins <= 0.45 || this.position.y <= targetShipCatchY + 0.45) {
          this.position.set(this.padCoords.x, targetShipCatchY, this.padCoords.y);
          this.velocity.set(0, 0, 0);
          this.pitch = 0;
          this.pitchVel = 0;
          this.throttle = 0;
          this.shipCaughtByTower = true;
          this.vehicle.setChopsticks(1.0, 83.8);
          this.phase = FLIGHT_PHASES.LANDED;
          this.cargoDoorsDeployed = true;
        }
        break;
      }

      case FLIGHT_PHASES.LANDED:
        this.throttle = 0.0;
        break;
    }
  }

  updateManualPhaseLabel(agl) {
    if (agl <= 0.1 && this.speed < 1.0) {
      this.phase = this.missionTime < 1.0 ? FLIGHT_PHASES.ON_PAD : FLIGHT_PHASES.LANDED;
    } else if (this.vehicle.isMated) {
      this.phase = FLIGHT_PHASES.BOOSTER_ASCENT;
    } else if (this.altitude > 65000 && this.horizontalSpeed > 2800) {
      this.phase = FLIGHT_PHASES.ORBIT;
    } else if (this.velocity.y < -30.0 && this.heat > 0.05) {
      this.phase = FLIGHT_PHASES.HYPERSONIC_ENTRY;
    } else if (this.velocity.y < -15.0 && this.altitude < 14000 && Math.abs(this.pitch) > 0.65) {
      this.phase = FLIGHT_PHASES.BELLYFLOP;
    } else if (this.velocity.y < 0 && this.altitude < 2000 && this.throttle > 0.2) {
      this.phase = FLIGHT_PHASES.LANDING_FLIP;
    } else {
      this.phase = FLIGHT_PHASES.STARSHIP_ASCENT;
    }
  }

  // -------------------------------------------------------------
  // SUPER HEAVY BOOSTER PHYSICS RETURN & MECHAZILLA CHOPSTICK CATCH
  // -------------------------------------------------------------
  updateBoosterReturn(dt) {
    if (this.boosterState === BOOSTER_STATES.ATTACHED) return;

    this.boosterTimer += dt;
    const targetCatchElevation = this.padElevation + 75.0;

    switch (this.boosterState) {
      case BOOSTER_STATES.BOOSTBACK: {
        this.boosterRaptorMode = 'BOOSTBACK_13';
        this.boosterFuel = Math.max(8.0, this.boosterFuel - 1.2 * dt);
        const toPadHoriz = new THREE.Vector2(
          this.padCoords.x - this.boosterPosition.x,
          this.padCoords.y - this.boosterPosition.z
        );
        if (toPadHoriz.lengthSq() > 1.0) toPadHoriz.normalize();

        const boostbackAccel = 26.0;
        this.boosterVelocity.x += (toPadHoriz.x * 75.0 - this.boosterVelocity.x) * 1.4 * dt;
        this.boosterVelocity.z += (toPadHoriz.y * 75.0 - this.boosterVelocity.z) * 1.4 * dt;
        this.boosterVelocity.y -= this.marsGravity * dt;

        const boostbackQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * 0.82);
        this.boosterQuaternion.slerp(boostbackQuat, dt * 2.5);

        this.vehicle.setBoosterThrottle(0.85);
        this.vehicle.setGridFinSteering(Math.sin(this.boosterTimer * 2) * 0.3, 0.2);

        if (this.boosterTimer > 5.5) {
          this.boosterState = BOOSTER_STATES.DESCENT;
          this.boosterRaptorMode = 'OFF';
          this.vehicle.setBoosterThrottle(0.0);
          this.vehicle.setChopsticks(0.0, 75.0);
        }
        break;
      }

      case BOOSTER_STATES.DESCENT: {
        this.boosterRaptorMode = 'OFF';
        const toPadDir = new THREE.Vector2(
          this.padCoords.x - this.boosterPosition.x,
          this.padCoords.y - this.boosterPosition.z
        );
        const currentHorizDist = toPadDir.length();
        if (currentHorizDist > 0.1) toPadDir.normalize();

        const uprightQuat = new THREE.Quaternion().identity();
        this.boosterQuaternion.slerp(uprightQuat, dt * 2.8);

        const finSteerYaw = THREE.MathUtils.clamp(toPadDir.x * 0.6, -0.6, 0.6);
        const finSteerPitch = THREE.MathUtils.clamp(toPadDir.y * 0.6, -0.6, 0.6);
        this.vehicle.setGridFinSteering(finSteerYaw, finSteerPitch);

        const timeToApproach = Math.max(2.5, (this.boosterPosition.y - (this.padElevation + 1400.0)) / Math.max(40.0, -this.boosterVelocity.y));
        const desiredBx = toPadDir.x * Math.min(120.0, currentHorizDist / timeToApproach);
        const desiredBz = toPadDir.y * Math.min(120.0, currentHorizDist / timeToApproach);

        this.boosterVelocity.x += (desiredBx - this.boosterVelocity.x) * 1.5 * dt;
        this.boosterVelocity.z += (desiredBz - this.boosterVelocity.z) * 1.5 * dt;
        // Gravity + grid fin aerodynamic drag terminal velocity (-92 m/s)
        const boosterDragAy = (-92.0 - this.boosterVelocity.y) * 0.85;
        this.boosterVelocity.y += (boosterDragAy - this.marsGravity * 0.4) * dt;

        const boosterAltAbovePad = this.boosterPosition.y - this.padElevation;
        if (boosterAltAbovePad <= 1400.0) {
          this.boosterState = BOOSTER_STATES.APPROACH;
          this.boosterTimer = 0.0;
        }
        break;
      }

      case BOOSTER_STATES.APPROACH: {
        const boosterAlt = Math.max(0.0, this.boosterPosition.y - targetCatchElevation);
        this.boosterRaptorMode = boosterAlt > 350 ? 'BOOSTBACK_13' : 'LANDING_3';
        this.boosterFuel = Math.max(1.5, this.boosterFuel - 0.8 * dt);

        const dxB = this.padCoords.x - this.boosterPosition.x;
        const dzB = this.padCoords.y - this.boosterPosition.z;
        this.boosterVelocity.x += (dxB * 2.4 - this.boosterVelocity.x * 3.0) * dt;
        this.boosterVelocity.z += (dzB * 2.4 - this.boosterVelocity.z * 3.0) * dt;

        const targetVy = -THREE.MathUtils.clamp(Math.sqrt(2.0 * 3.2 * Math.max(0.05, boosterAlt)), 0.8, 85.0);
        this.boosterVelocity.y += (targetVy - this.boosterVelocity.y) * 4.2 * dt;

        const tiltX = THREE.MathUtils.clamp(-this.boosterVelocity.z * 0.004, -0.12, 0.12);
        const tiltZ = THREE.MathUtils.clamp(this.boosterVelocity.x * 0.004, -0.12, 0.12);
        this.boosterQuaternion.setFromEuler(new THREE.Euler(tiltX, 0, tiltZ));

        this.vehicle.setBoosterThrottle(0.92);

        if (boosterAlt <= 30.0) {
          const clampProgress = THREE.MathUtils.clamp((30.0 - boosterAlt) / 30.0, 0.0, 0.98);
          this.vehicle.setChopsticks(clampProgress, 75.0);
        }

        if (boosterAlt <= 0.8 || this.boosterPosition.y <= targetCatchElevation + 0.8) {
          this.boosterPosition.set(this.padCoords.x, targetCatchElevation, this.padCoords.y);
          this.boosterVelocity.set(0, 0, 0);
          this.boosterState = BOOSTER_STATES.CAUGHT;
          this.boosterTimer = 0.0;
          this.boosterRaptorMode = 'OFF';
          this.vehicle.setBoosterThrottle(0.0);
          this.vehicle.setChopsticks(1.0, 75.0);
          this.vehicle.setGridFinSteering(0, 0);
        }
        break;
      }

      case BOOSTER_STATES.CAUGHT: {
        this.boosterRaptorMode = 'OFF';
        this.boosterVelocity.set(0, 0, 0);
        this.vehicle.setBoosterThrottle(0.0);
        this.boosterQuaternion.identity();

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

    if (this.boosterState !== BOOSTER_STATES.CAUGHT) {
      this.boosterPosition.addScaledVector(this.boosterVelocity, dt);
    }
    this.boosterAltitude = Math.max(0, this.boosterPosition.y - targetCatchElevation);
    this.boosterSpeed = this.boosterVelocity.length();
    this.vehicle.boosterGroup.position.copy(this.boosterPosition);
    this.vehicle.boosterGroup.quaternion.copy(this.boosterQuaternion);
  }
}
