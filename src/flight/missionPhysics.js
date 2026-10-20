import * as THREE from 'three';
import { getMarsHeight } from '../terrain/noise.js';
import { STARBASE_LAYOUT as L } from './starbaseLayout.js';
import { PLANET_PROFILES, getPlanetProfile } from './planetProfiles.js';

export const FLIGHT_PHASES = {
  ON_PAD: 'ON_PAD',
  COUNTDOWN: 'COUNTDOWN',
  BOOSTER_ASCENT: 'BOOSTER_ASCENT',
  HOT_STAGING: 'HOT_STAGING',
  BOOSTER_CATCH: 'BOOSTER_CATCH',
  STARSHIP_ASCENT: 'STARSHIP_ASCENT',
  ORBIT: 'ORBIT',
  INTERPLANETARY: 'INTERPLANETARY',
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

// -------------------------------------------------------------
// LAYERED MARTIAN ATMOSPHERE (0 - 120 km)
// Each layer has its own scale height and temperature lapse, matching the
// strong near-surface density gradient, the cold middle atmosphere and the
// extremely thin upper atmosphere where the plasma sheath forms.
// -------------------------------------------------------------
const MARS_R_GAS = 188.92; // Specific gas constant J/(kg K)
const MARS_GAMMA = 1.33;
const MARS_SURFACE_DENSITY = 0.020; // kg/m³
const MARS_ATM_LAYERS = [
  { bottom: 0, top: 7000, scaleHeight: 11100, tempBottom: 214, tempTop: 206 },
  { bottom: 7000, top: 18000, scaleHeight: 9600, tempBottom: 206, tempTop: 188 },
  { bottom: 18000, top: 40000, scaleHeight: 6900, tempBottom: 188, tempTop: 168 },
  { bottom: 40000, top: 75000, scaleHeight: 4600, tempBottom: 168, tempTop: 150 },
  { bottom: 75000, top: 120000, scaleHeight: 3100, tempBottom: 150, tempTop: 138 }
];
(function buildAtmosphereProfile() {
  let density = MARS_SURFACE_DENSITY;
  for (const layer of MARS_ATM_LAYERS) {
    layer.densityBottom = density;
    density *= Math.exp(-(layer.top - layer.bottom) / layer.scaleHeight);
    layer.densityTop = density;
  }
})();

// -------------------------------------------------------------
// VEHICLE MASS & PROPULSION CONSTANTS
// Acceleration is derived from F = thrust / instantaneous mass, so the
// stack feels progressively lighter as propellant is consumed (Tsiolkovsky).
// -------------------------------------------------------------
const BOOSTER_DRY_MASS = 275000;            // kg
const BOOSTER_PROP_MASS = 3400000;          // kg
const BOOSTER_ENGINE_THRUST = 2.30e6;       // N per Raptor at Mars ambient
const BOOSTER_ISP = 327;                    // s
const BOOSTER_BROAD_REF_AREA = 9.0 * 72.0;  // m² (side-on)
const BOOSTER_AXIAL_REF_AREA = Math.PI * 4.5 * 4.5;
const BOOSTER_DRAG_AREA = 78.0;             // m² grid-fin / engine-section drag reference

const SHIP_DRY_MASS = 120000;               // kg
const SHIP_PROP_MASS = 1200000;             // kg
const SHIP_ENGINE_THRUST = 2.45e6;          // N per Raptor in vacuum
const SHIP_ISP = 378;                       // s
const SHIP_BROAD_REF_AREA = 9.0 * 50.0 + 85.0;
const SHIP_AXIAL_REF_AREA = Math.PI * 4.5 * 4.5;
const SHIP_PLANFORM_AREA = 240.0;           // m² lifting-body reference
const SHIP_NOSE_RADIUS = 1.2;               // m (Sutton-Graves stagnation radius)

export class StarshipMissionPhysics {
  constructor(vehicleModel, startCoords = new THREE.Vector2(1400, 1150)) {
    this.vehicle = vehicleModel;
    this.padCoords = startCoords.clone();

    // Pad ground & OLM table elevation (22m above ground)
    this.padGroundY = getMarsHeight(this.padCoords.x, this.padCoords.y);
    this.padElevation = this.padGroundY + 22.0;

    // Dedicated catch points. Both are world-space and sit exactly on the
    // centreline of their tower's chopsticks.
    this.boosterCatchCoords = new THREE.Vector2(
      this.padCoords.x + L.boosterCatch.x,
      this.padCoords.y + L.boosterCatch.z
    );
    this.shipCatchCoords = new THREE.Vector2(
      this.padCoords.x + L.shipCatch.x,
      this.padCoords.y + L.shipCatch.z
    );
    this.boosterCatchBaseY = this.padGroundY + L.boosterCatch.baseY;
    this.shipCatchBaseY = this.padGroundY + L.shipCatch.baseY;
    // The carriage sits exactly at the forward-pin plane, which is the catch
    // base plus the vehicle's pin height. This is the invariant that keeps the
    // arms visually locked to the pins on every catch.
    this.boosterArmY = L.boosterTower.armY;
    this.shipArmY = L.shipTower.armY;
    this.yardControl = false;

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

    // Mars atmospheric & gravitational constants. These are swapped for the
    // active planet profile when the vehicle arrives at another world.
    this.planetId = 'mars';
    this.planetProfile = PLANET_PROFILES.mars;
    this.planetRadius = this.planetProfile.radius;
    this.atmLayers = this.planetProfile.layers;
    this.marsGravity = this.planetProfile.gravity;    // Surface gravity (m/s²)
    this.surfaceDensity = this.planetProfile.surfaceDensity;
    this.scaleHeight = this.atmLayers[0].scaleHeight;
    this.atmoDensity = this.planetProfile.surfaceDensity;
    this.atmoPressurePa = this.planetProfile.surfacePressurePa;
    this.atmoTempK = this.planetProfile.seaLevelTemperatureK;
    this.soundSpeed = Math.sqrt(MARS_GAMMA * MARS_R_GAS * this.atmoTempK);
    this.windSpeed = 0;
    this.destination = 'earth';
    this.transferTarget = null;
    this.scriptedControl = false;
    this.opsMessage = '';
    this._atmoSample = {
      density: this.planetProfile.surfaceDensity,
      pressure: this.planetProfile.surfacePressurePa,
      temperature: this.planetProfile.seaLevelTemperatureK,
      soundSpeed: 240,
      layer: 0,
      wind: new THREE.Vector3()
    };
    this._boosterAtmo = {
      density: this.planetProfile.surfaceDensity,
      pressure: this.planetProfile.surfacePressurePa,
      temperature: this.planetProfile.seaLevelTemperatureK,
      soundSpeed: 240,
      layer: 0,
      wind: new THREE.Vector3()
    };
    this._relBoosterVel = new THREE.Vector3();

    // Physical mass properties (kg) and derived engine state
    this.boosterMass = BOOSTER_DRY_MASS + BOOSTER_PROP_MASS;
    this.shipMass = SHIP_DRY_MASS + SHIP_PROP_MASS;
    this.boosterEngineCount = 0;
    this.shipEngineCount = 0;
    this.heatFlux = 0;          // W/m² (Sutton-Graves convective flux)
    this.tpsTempC = 220;        // Equilibrium TPS surface temperature

    // Scratch objects: the physics runs up to 8 substeps per frame, so the
    // hot path is allocation-free to avoid GC hitches at high time warp.
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._bodyNose = new THREE.Vector3();
    this._bodyBelly = new THREE.Vector3();
    this._thrustAccel = new THREE.Vector3();
    this._aeroAccel = new THREE.Vector3();
    this._velHat = new THREE.Vector3();
    this._liftDir = new THREE.Vector3();
    this._gravityVec = new THREE.Vector3();
    this._shipOffset = new THREE.Vector3();
    this._toPadDir = new THREE.Vector3();
    this._thrustCmd = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._upAxis = new THREE.Vector3(0, 1, 0);
    this._relVel = new THREE.Vector3();
    this._wind = new THREE.Vector3();
    this._capturePoint = new THREE.Vector3();

    this.resetToPad();
  }

  // Piecewise-exponential Martian atmosphere. Returns the exact density,
  // pressure, temperature, local speed of sound and wind at the current
  // altitude. This feeds drag, Mach, dynamic pressure and Sutton-Graves heat.
  sampleAtmosphere(altitude, out = this._atmoSample) {
    const h = Math.max(0.0, altitude);
    const layers = this.atmLayers;
    let temperature;
    let density;
    let layerIndex = layers.length - 1;
    let layer = layers[layerIndex];

    for (let i = 0; i < layers.length; i++) {
      if (h <= layers[i].top) {
        layer = layers[i];
        layerIndex = i;
        break;
      }
    }

    if (h > layers[layers.length - 1].top) {
      const top = layers[layers.length - 1];
      density = top.densityTop * Math.exp(-(h - top.top) / 2600.0);
      temperature = top.tempTop;
    } else {
      const span = Math.max(1.0, layer.top - layer.bottom);
      const f = THREE.MathUtils.clamp((h - layer.bottom) / span, 0.0, 1.0);
      temperature = THREE.MathUtils.lerp(layer.tempBottom, layer.tempTop, f);
      density = layer.densityBottom * Math.exp(-(h - layer.bottom) / layer.scaleHeight);
    }

    const windMagnitude = (this.planetId === 'earth' ? 18.0 : 6.2) * Math.exp(-h / 9000.0);
    const windDirection = 0.62 + h * 0.000012;
    out.wind.set(
      Math.cos(windDirection) * windMagnitude,
      0,
      Math.sin(windDirection) * windMagnitude
    );

    out.density = density;
    out.temperature = temperature;
    out.pressure = density * MARS_R_GAS * temperature;
    out.soundSpeed = Math.sqrt(MARS_GAMMA * MARS_R_GAS * temperature);
    out.layer = layerIndex;
    return out;
  }

  resetToPad() {
    this.phase = FLIGHT_PHASES.ON_PAD;
    this.boosterState = BOOSTER_STATES.ATTACHED;
    this.scriptedControl = false;
    this.yardControl = false;
    this.transferTarget = null;
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
    // The booster has its own yard transform. Reset it alongside the ship or a
    // freshly produced stack keeps the old booster's factory position.
    this.boosterPosition.set(this.padCoords.x, this.padElevation, this.padCoords.y);
    this.boosterQuaternion.identity();
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
    this.boosterMass = BOOSTER_DRY_MASS + BOOSTER_PROP_MASS;
    this.shipMass = SHIP_DRY_MASS + SHIP_PROP_MASS;
    this.boosterEngineCount = 0;
    this.shipEngineCount = 0;
    this.heatFlux = 0;
    this.tpsTempC = 220;
    this.boosterFlameout = false;
    this.starshipFlameout = false;
    this.boosterAltitude = 0.0;
    this.boosterSpeed = 0.0;
    this.boosterRaptorMode = 'OFF';
    this.shipRaptorMode = 'OFF';

    this.vehicle.setMated(true);
    this.vehicle.boosterGroup.visible = true;
    this.vehicle.starshipGroup.visible = true;
    this.vehicle.setLaunchChopsticks(0.0, L.launchTower.armY);
    this.vehicle.setBoosterChopsticks(0.0, this.boosterArmY);
    this.vehicle.setShipChopsticks(0.0, this.shipArmY);
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

  // Applies yard-owned transforms without running orbital dynamics. Starbase
  // Operations writes position/quaternion and boosterPosition/quaternion while
  // this flag is set, so the same hero meshes are reused for recovery,
  // inspection, refurbishment and the next stack.
  updateYardVisuals(dt) {
    this.vehicle.starshipGroup.position.copy(this.position);
    this.vehicle.starshipGroup.quaternion.copy(this.quaternion);
    this.vehicle.boosterGroup.position.copy(this.boosterPosition);
    this.vehicle.boosterGroup.quaternion.copy(this.boosterQuaternion);
    this.vehicle.setBoosterThrottle(0);
    this.vehicle.setStarshipThrottle(0, false);
    this.vehicle.update(dt);
  }

  // Called once both vehicles are secured in their arms. Hands control of the
  // vehicles to the yard state machine.
  beginYardControl() {
    this.yardControl = true;
    this.throttle = 0;
    this.velocity.set(0, 0, 0);
    this.boosterVelocity.set(0, 0, 0);
  }

  // Ends yard custody and produces a fresh, fully fuelled, mated stack on the
  // launch mount with the launch tower arms closed around the ship.
  prepareNextMission() {
    this.yardControl = false;
    this.resetToPad();
    this.vehicle.setLaunchChopsticks(1.0, L.launchTower.armY);
    this.boosterState = BOOSTER_STATES.ATTACHED;
    this.phase = FLIGHT_PHASES.ON_PAD;
  }

  // Swaps gravity, atmosphere layers and sky metadata. The Starbase layout is
  // identical on every world (one master plan), so the catch points remain at
  // the same local coordinates and all guidance laws keep working unchanged.
  setPlanet(planetId) {
    const profile = getPlanetProfile(planetId);
    this.planetId = profile.id;
    this.planetProfile = profile;
    this.planetRadius = profile.radius;
    this.atmLayers = profile.layers;
    this.marsGravity = profile.gravity;
    this.surfaceDensity = profile.surfaceDensity;
    this.scaleHeight = profile.layers[0].scaleHeight;
    this.atmoDensity = profile.surfaceDensity;
    this.atmoPressurePa = profile.surfacePressurePa;
    this.atmoTempK = profile.seaLevelTemperatureK;
    this.soundSpeed = Math.sqrt(MARS_GAMMA * MARS_R_GAS * this.atmoTempK);
    this.boosterArmY = L.boosterTower.armY;
    this.shipArmY = L.shipTower.armY;
    return profile;
  }

  setDestination(planetId) {
    if (PLANET_PROFILES[planetId]) this.destination = planetId;
    return this.destination;
  }

  // Requests a heliocentric transfer. The scene-scale trajectory is flown by
  // InterplanetaryJourney; physics pops back in for the destination entry.
  triggerInterplanetary(target = null) {
    const destination = target || (this.planetId === 'mars' ? 'earth' : 'mars');
    if (!PLANET_PROFILES[destination] || destination === this.planetId) return false;
    if (this.vehicle.isMated) return false;
    this.transferTarget = destination;
    this.phase = FLIGHT_PHASES.INTERPLANETARY;
    this.scriptedControl = true;
    this.yardControl = false;
    this.throttle = 0;
    this.velocity.set(0, 0, 0);
    this.boosterVelocity.set(0, 0, 0);
    this.vehicle.setStarshipThrottle(0, true);
    this.vehicle.setBoosterThrottle(0);
    this.vehicle.boosterGroup.visible = false;
    return true;
  }

  // Drops the ship into a physically guided entry over the destination
  // Starbase. The entry-shield attitude and aero guidance then fly the same
  // HYPERSONIC_ENTRY -> BELLYFLOP -> LANDING_FLIP -> TOUCHDOWN chain used at
  // Mars, with the destination profile's gravity and atmosphere.
  enterPlanetEntry(planetId, options = {}) {
    const profile = this.setPlanet(planetId);
    this.scriptedControl = false;
    this.yardControl = false;
    this.phase = FLIGHT_PHASES.HYPERSONIC_ENTRY;
    this.vehicle.setMated(false);
    this.vehicle.starshipGroup.visible = true;
    this.vehicle.boosterGroup.visible = false;
    // Arrival propellant state: the ship has spent most of its propellant on
    // the transfer and only retains the landing reserve.
    this.starshipFuel = 18.0;
    this.starshipFlameout = false;
    this.cargoDoorsDeployed = false;
    this.landingLegsDeployed = false;
    this.shipCaughtByTower = false;

    const target = this.shipCatchCoords;
    // Compressed arrival interface directly over the destination Starbase.
    // The belly-flop and landing-burn guidance handle the final descent; this
    // avoids flying a 1,000 km hypersonic ground track that the local scene
    // cannot represent.
    const entryAlt = options.altitude || 28000;
    this.position.set(target.x, this.padElevation + entryAlt, target.y);
    this.velocity.set(0, -120.0, 0);
    this.yaw = 0;
    this.pitch = 0.55;
    this.roll = 0.0;
    this.pitchVel = 0;
    this.yawVel = 0;
    this.rollVel = 0;
    this.throttle = 0;
    this.heat = 0.78;
    this.entryStartAlt = entryAlt;
    this.missionTime = 0;
    this.orbitTimer = 0;
    this.vehicle.setReentryHeat(this.heat);
    this.vehicle.setCargoDoors(0);
    this.vehicle.setLandingLegs(0);
    return profile;
  }

  getBoosterMass() {
    return BOOSTER_DRY_MASS + BOOSTER_PROP_MASS * (Math.max(0, this.boosterFuel) / 100);
  }

  getShipMass() {
    return SHIP_DRY_MASS + SHIP_PROP_MASS * (Math.max(0, this.starshipFuel) / 100);
  }

  getBoosterAvailAccel(engineCount = 13) {
    return (engineCount * BOOSTER_ENGINE_THRUST) / Math.max(1, this.getBoosterMass());
  }

  getShipAvailAccel(engineCount = 6) {
    return (engineCount * SHIP_ENGINE_THRUST) / Math.max(1, this.getShipMass());
  }

  // Burn propellant from the physical mass flow rate: mdot = F / (Isp * g0).
  // Returns the thrust actually produced this step (N).
  burnPropellant(isBooster, engineCount, throttle, dt) {
    if (engineCount <= 0 || throttle <= 0.0001) return 0;
    const thrust = engineCount * (isBooster ? BOOSTER_ENGINE_THRUST : SHIP_ENGINE_THRUST) * throttle;
    const isp = isBooster ? BOOSTER_ISP : SHIP_ISP;
    const mdot = thrust / (isp * EARTH_G0);
    const propMass = isBooster ? BOOSTER_PROP_MASS : SHIP_PROP_MASS;
    const burnPct = (mdot / propMass) * 100.0 * dt;
    if (isBooster) {
      this.boosterFuel = Math.max(0, this.boosterFuel - burnPct);
    } else {
      this.starshipFuel = Math.max(0, this.starshipFuel - burnPct);
    }
    return thrust;
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
    // Orbit coasting is stable at high compression, so 100×/1000× warp can be
    // integrated in larger steps. Atmospheric phases remain at 20 Hz.
    if (dt > 0.05) {
      dt = this.phase === FLIGHT_PHASES.ORBIT ? Math.min(dt, 1.5) : 0.05;
    }

    // Automated Starbase recovery/production owns both vehicle transforms while
    // a catch is being unloaded, inspected, rebuilt and re-stacked. Flight
    // dynamics resume only after a fresh stack has been armed on the pad.
    if (this.yardControl || this.scriptedControl) {
      this.updateYardVisuals(dt);
      return;
    }

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
      : (this.shipCaughtByTower ? this.shipCatchBaseY : localTerrainY);

    this.altitude = Math.max(0.0, this.position.y - this.padElevation);
    const agl = Math.max(0.0, this.position.y - supportFloorY);

    // Altitude-dependent Mars gravity g(h) = g0 * (R / (R + h))^2
    const rFromCenter = this.planetRadius + Math.max(0.0, this.altitude);
    const localGravity = this.marsGravity * Math.pow(this.planetRadius / rFromCenter, 2);

    // Layered Martian atmosphere: density, pressure, temperature, speed of
    // sound and the local wind vector (all altitude dependent).
    const atmo = this.sampleAtmosphere(this.altitude, this._atmoSample);
    const marsDensity = atmo.density;
    const speedOfSound = atmo.soundSpeed;
    const wind = atmo.wind;
    this.atmoDensity = marsDensity;
    this.atmoPressurePa = atmo.pressure;
    this.atmoTempK = atmo.temperature;
    this.soundSpeed = speedOfSound;
    this.windSpeed = wind.length();
    this.atmoLayer = atmo.layer + 1;

    // Air-relative velocity: drag and dynamic pressure use the wind vector, not
    // the ground speed. At the surface this is a 6 m/s easterly shear layer.
    const relativeVelocity = this._relVel.copy(this.velocity).sub(wind);
    const relativeSpeed = relativeVelocity.length();

    this.speed = this.velocity.length();
    this.verticalSpeed = this.velocity.y;
    this.horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.mach = (this.speed / speedOfSound).toFixed(2);
    this.dynamicPressure = 0.5 * marsDensity * relativeSpeed * relativeSpeed;

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

      // Compute current vehicle orientation quaternion & body axes (zero allocations)
      this._euler.set(this.pitch, this.yaw, this.roll, 'YXZ');
      this.quaternion.setFromEuler(this._euler);
      // Vehicle nose axis (+Y in local coordinates) and windward heatshield belly normal (+Z in local coordinates)
      this._bodyNose.set(0, 1, 0).applyQuaternion(this.quaternion).normalize();
      this._bodyBelly.set(0, 0, 1).applyQuaternion(this.quaternion).normalize();
      const bodyNose = this._bodyNose;
      const bodyBelly = this._bodyBelly;

      // A. PROPULSION: F = N_engines * F_raptor * throttle, a = F / m(t).
      //    mdot = F / (Isp * g0) drives the mass ratio, so acceleration climbs
      //    as propellant is consumed exactly as Tsiolkovsky predicts.
      let thrustAccelMag = 0.0;
      if (this.vehicle.isMated) {
        const engineCount = this.throttle > 0.55 ? 33 : 13;
        this.shipEngineCount = 0;
        this.boosterEngineCount = 0;
        if (this.throttle > 0.005 && this.boosterFuel > 0.001) {
          const thrust = this.burnPropellant(true, engineCount, this.throttle, dt);
          const stackMass = this.getBoosterMass() + this.getShipMass();
          thrustAccelMag = thrust / Math.max(1.0, stackMass);
          this.boosterEngineCount = engineCount;
          this.boosterRaptorMode = engineCount > 13 ? 'ALL_33' : 'BOOSTBACK_13';
        } else {
          if (this.boosterFuel <= 0.001) this.boosterFlameout = true;
          this.throttle = 0.0;
          this.boosterRaptorMode = 'OFF';
        }
        this.shipRaptorMode = this.phase === FLIGHT_PHASES.HOT_STAGING ? 'ALL_6' : 'OFF';
        this.vehicle.setBoosterThrottle(this.throttle);
        this.vehicle.setStarshipThrottle(this.phase === FLIGHT_PHASES.HOT_STAGING ? 1.0 : 0.0, this.altitude > 25000);
      } else {
        // 6 Raptors for ascent and the landing burn; the centre three are used
        // only when the vehicle is light enough for a low-thrust final approach.
        const landingBurn = this.phase === FLIGHT_PHASES.LANDING_FLIP || this.phase === FLIGHT_PHASES.TOUCHDOWN;
        const engineCount = landingBurn ? 6 : (this.throttle < 0.55 ? 3 : 6);
        this.boosterEngineCount = 0;
        this.shipEngineCount = 0;
        if (this.throttle > 0.005 && this.starshipFuel > 0.001) {
          const thrust = this.burnPropellant(false, engineCount, this.throttle, dt);
          thrustAccelMag = thrust / Math.max(1.0, this.getShipMass());
          this.shipEngineCount = engineCount;
          this.shipRaptorMode = engineCount > 3 ? 'ALL_6' : 'LANDING_3';
        } else {
          if (this.starshipFuel <= 0.001) this.starshipFlameout = true;
          this.throttle = 0.0;
          this.shipRaptorMode = 'OFF';
        }
        this.vehicle.setStarshipThrottle(this.throttle, this.altitude > 26000);
      }

      const thrustAccel = this._thrustAccel.copy(bodyNose).multiplyScalar(thrustAccelMag);

      // Add TVC lateral steering vector when descending in assisted landing/catch modes.
      // Uses impact-point guidance: dtGo is the time to the catch plane, so the
      // ship brakes before the tower instead of overshooting at high speed.
      if (this.autoMission && (this.phase === FLIGHT_PHASES.LANDING_FLIP || this.phase === FLIGHT_PHASES.TOUCHDOWN) && this.throttle > 0.05) {
        const dxPad = this.shipCatchCoords.x - this.position.x;
        const dzPad = this.shipCatchCoords.y - this.position.z;
        const catchY = this.shipCatchBaseY;
        const dtGo = Math.max(1.6, (this.position.y - catchY) / Math.max(6.0, -this.velocity.y));
        const latDen = Math.max(3.0, dtGo * dtGo);
        // Impact-point guidance: aim the predicted arrival point at the centre
        // of the ship tower's arms, not merely at the geometric pad centre.
        const latAx = THREE.MathUtils.clamp((2.0 * (dxPad - this.velocity.x * dtGo)) / latDen, -12.0, 12.0);
        const latAz = THREE.MathUtils.clamp((2.0 * (dzPad - this.velocity.z * dtGo)) / latDen, -12.0, 12.0);
        thrustAccel.x = latAx;
        thrustAccel.z = latAz;
      }

      // B. AERODYNAMICS: quadratic drag on the instantaneous reference area,
      //    plus the lifting-body crossforce that makes the belly-flop work.
      const aeroAccel = this._aeroAccel.set(0, 0, 0);
      let angleOfAttack = 0.0;
      const activeMass = this.vehicle.isMated
        ? this.getBoosterMass() + this.getShipMass()
        : this.getShipMass();
      if (relativeSpeed > 0.5 && marsDensity > 1e-8) {
        const velHat = this._velHat.copy(relativeVelocity).divideScalar(relativeSpeed);
        const cosAlpha = THREE.MathUtils.clamp(bodyNose.dot(velHat), -1.0, 1.0);
        angleOfAttack = Math.acos(cosAlpha); // 0 = nose into wind, PI/2 = broadside belly-flop
        const sinAlpha = Math.sin(angleOfAttack);
        const sin2 = sinAlpha * sinAlpha;
        const cos2 = cosAlpha * cosAlpha;

        // Reference area grows from the nose-on disc to the full broadside silhouette.
        const refArea = this.vehicle.isMated
          ? BOOSTER_AXIAL_REF_AREA + (BOOSTER_BROAD_REF_AREA - BOOSTER_AXIAL_REF_AREA) * sin2
          : SHIP_AXIAL_REF_AREA + (SHIP_BROAD_REF_AREA - SHIP_AXIAL_REF_AREA) * sin2;
        const cd = 0.22 * cos2 + 1.75 * sin2;
        const dragAccel = (this.dynamicPressure * cd * refArea) / activeMass;
        aeroAccel.addScaledVector(velHat, -dragAccel);

        // Lifting-body crossforce during hypersonic entry & skydiving belly-flop.
        // Cl = 0.55*sin(2a) peaks at 45° AoA, exactly where Starship flies its entry.
        const liftCoeff = 0.55 * Math.sin(2.0 * angleOfAttack);
        const liftDir = this._liftDir.copy(bodyBelly).addScaledVector(velHat, -bodyBelly.dot(velHat));
        if (liftDir.lengthSq() > 1e-4) {
          liftDir.normalize();
          const liftAccel = (this.dynamicPressure * Math.abs(liftCoeff) * SHIP_PLANFORM_AREA) / activeMass;
          aeroAccel.addScaledVector(liftDir, liftCoeff >= 0 ? liftAccel : -liftAccel);
        }

        // Auto-guidance aerodynamic bank/trim steering: null the predicted
        // impact point (not just the instantaneous velocity), so the ship
        // arrives over Starbase with its horizontal velocity shrinking to zero.
        if (this.autoMission && (this.phase === FLIGHT_PHASES.HYPERSONIC_ENTRY || this.phase === FLIGHT_PHASES.BELLYFLOP)) {
          const dxPad = this.shipCatchCoords.x - this.position.x;
          const dzPad = this.shipCatchCoords.y - this.position.z;
          const tGo = Math.max(5.0, (this.altitude - 1200.0) / Math.max(40.0, -this.velocity.y));
          const missX = dxPad - this.velocity.x * tGo;
          const missZ = dzPad - this.velocity.z * tGo;
          const aeroSteerMax = THREE.MathUtils.clamp(
            (this.dynamicPressure * 1.8 * SHIP_PLANFORM_AREA) / activeMass,
            1.8, 26.0
          );
          const gain = 2.0 / (tGo * tGo);
          aeroAccel.x += THREE.MathUtils.clamp(missX * gain, -aeroSteerMax, aeroSteerMax);
          aeroAccel.z += THREE.MathUtils.clamp(missZ * gain, -aeroSteerMax, aeroSteerMax);
        }
      }
      this.angleOfAttack = angleOfAttack;

      // C. GRAVITATIONAL & SPHERICAL ORBITAL CENTRIFUGAL ACCELERATION (v_horiz^2 / r)
      // At Mars orbital velocity (~3,400 m/s horizontal), centrifugal lift v_horiz^2 / r balances localGravity!
      const centrifugalUp = (this.horizontalSpeed * this.horizontalSpeed) / rFromCenter;
      const effectiveGravityVec = this._gravityVec.set(0, centrifugalUp - localGravity, 0);

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

      // E. CONVECTIVE PLASMA HEATING: Sutton-Graves stagnation-point flux
      //    q_conv = k * sqrt(rho / R_nose) * v^3  [W/m²]
      //    The TPS surface temperature is the radiative-equilibrium solution
      //    T = (q / (eps * sigma))^(1/4), so the glow is driven by real flux.
      const inEntryCorridor = !this.vehicle.isMated && this.altitude < 62000 &&
        this.altitude > 9000 && this.speed > 320.0 && this.velocity.y < 25.0;
      if (inEntryCorridor && marsDensity > 1e-9) {
        const v3 = this.speed * this.speed * this.speed;
        this.heatFlux = 1.83e-4 * Math.sqrt(marsDensity / SHIP_NOSE_RADIUS) * v3;
        const targetHeat = THREE.MathUtils.clamp(Math.pow(this.heatFlux / 145000.0, 0.62), 0.0, 1.0);
        // Thermal inertia: the TPS heats and cools over seconds, not instantly.
        const heatTau = targetHeat > this.heat ? 2.6 : 5.5;
        this.heat += (targetHeat - this.heat) * (1.0 - Math.exp(-dt / heatTau));
      } else {
        this.heatFlux = Math.max(0.0, this.heatFlux - dt * 45000.0);
        this.heat += (0.0 - this.heat) * (1.0 - Math.exp(-dt / 4.5));
      }
      this.heat = THREE.MathUtils.clamp(this.heat, 0.0, 1.0);
      if (this.heatFlux > 1500.0) {
        const tEquilibrium = Math.pow(this.heatFlux / (0.85 * 5.670374419e-8), 0.25) - 273.15;
        this.tpsTempC = THREE.MathUtils.clamp(tEquilibrium, 220.0, 1750.0);
      } else {
        this.tpsTempC = THREE.MathUtils.lerp(220.0, this.tpsTempC, Math.exp(-dt * 0.35));
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
    this._relVel.copy(this.velocity).sub(atmo.wind);
    this.dynamicPressure = 0.5 * marsDensity * this._relVel.lengthSq();

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
    // Tsiolkovsky remaining delta-v from the instantaneous mass ratio.
    const isp = this.vehicle.isMated ? BOOSTER_ISP : SHIP_ISP;
    const dryMass = this.vehicle.isMated ? BOOSTER_DRY_MASS : SHIP_DRY_MASS;
    const propMass = this.vehicle.isMated ? BOOSTER_PROP_MASS : SHIP_PROP_MASS;
    const currentMass = dryMass + propMass * (Math.max(0.0, activeFuel) / 100.0);
    this.deltaV = Math.round(isp * EARTH_G0 * Math.log(Math.max(1.0, currentMass) / dryMass));
    this.chamberPressure = Math.round(this.throttle * 350);
    this.pitchDeg = Math.round(this.pitch * (180 / Math.PI));
    this.yawDeg = Math.round(((this.yaw * (180 / Math.PI)) % 360 + 360) % 360);
    this.rollDeg = Math.round(this.roll * (180 / Math.PI));

    // Apply 3D transforms to vehicle meshes (scratch objects, no per-frame allocation)
    this._euler.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.quaternion.setFromEuler(this._euler);

    if (this.vehicle.isMated) {
      this.vehicle.boosterGroup.position.copy(this.position);
      this.vehicle.boosterGroup.quaternion.copy(this.quaternion);

      this._shipOffset.set(0, 75.0, 0).applyQuaternion(this.quaternion);
      this.vehicle.starshipGroup.position.copy(this.position).add(this._shipOffset);
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
          : THREE.MathUtils.clamp(0.50 + ((this.altitude - 22000.0) / 62000.0) * 0.14, 0.50, 0.64);
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
          // AUTO flies the interplanetary itinerary first. If the requested
          // destination is the planet we are already orbiting, deorbit and fly
          // the local tower-catch profile instead.
          const target = this.destination || 'earth';
          if (target !== this.planetId && this.triggerInterplanetary(target)) {
            this.orbitTimer = 0;
          } else {
            this.triggerDeorbit();
          }
        }
        break;
      }

      case FLIGHT_PHASES.DEORBIT: {
        // Guided return-to-launch-site burn. The upper stage is on a suborbital
        // hop, so "deorbit" means removing the downrange velocity and dropping
        // the impact point back onto Starbase before entry interface.
        const deorbitAlt = Math.max(0.0, this.position.y - this.padElevation);
        const vyNow = this.velocity.y;
        const gNow = localGravity;
        const apexRise = vyNow > 0 ? (vyNow * vyNow) / (2 * gNow) : 0;
        // Aim the ballistic arc at the *entry-interface* point, not the ground:
        // the entry aero and landing burn handle the last 30 km.
        const tFall = (vyNow > 0 ? vyNow / gNow : 0) +
          Math.sqrt((2 * Math.max(1000.0, deorbitAlt - 30000.0 + apexRise)) / gNow);

        const dxPad = this.shipCatchCoords.x - this.position.x;
        const dzPad = this.shipCatchCoords.y - this.position.z;
        const horizDist = Math.hypot(dxPad, dzPad);
        const desiredHorizontal = THREE.MathUtils.clamp(horizDist / Math.max(20.0, tFall), 0.0, 420.0);
        const toPadX = horizDist > 0.001 ? dxPad / horizDist : 0;
        const toPadZ = horizDist > 0.001 ? dzPad / horizDist : 0;
        const desiredVx = toPadX * desiredHorizontal;
        const desiredVz = toPadZ * desiredHorizontal;
        const desiredVy = -35.0;

        const deorbitAvail = Math.max(0.5, this.getShipAvailAccel(6));
        const tau = 2.4;
        let ax = (desiredVx - this.velocity.x) / tau;
        let az = (desiredVz - this.velocity.z) / tau;
        let ay = (desiredVy - this.velocity.y) / tau + gNow;
        const aMag = Math.hypot(ax, ay, az);
        const aMax = deorbitAvail * 0.92;
        if (aMag > aMax) {
          const s = aMax / aMag;
          ax *= s;
          ay *= s;
          az *= s;
        }

        // Aim the vehicle along the commanded thrust vector.
        if (aMag > 0.5) {
          const invA = 1.0 / Math.hypot(ax, ay, az);
          const dirX = ax * invA;
          const dirY = ay * invA;
          const dirZ = az * invA;
          const targetYaw = Math.atan2(dirX, dirZ);
          const yawError = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
          this.yaw += yawError * Math.min(1.0, dt * 3.0);
          const targetPitch = Math.PI * 0.5 - Math.asin(THREE.MathUtils.clamp(dirY, -1.0, 1.0));
          this.pitch += (targetPitch - this.pitch) * Math.min(1.0, dt * 3.0);
          this.throttle = THREE.MathUtils.clamp(Math.hypot(ax, ay, az) / deorbitAvail, 0.20, 1.0);
        } else {
          this.throttle = 0.0;
        }

        const horizError = Math.hypot(desiredVx - this.velocity.x, desiredVz - this.velocity.z);
        const converged = horizError < 5.0 && this.velocity.y <= 0.0;
        if (converged || this.altitude <= 60000.0) {
          this.phase = FLIGHT_PHASES.HYPERSONIC_ENTRY;
          this.entryStartAlt = Math.max(60000, this.altitude);
          this.throttle = 0.0;
        }
        break;
      }

      case FLIGHT_PHASES.HYPERSONIC_ENTRY: {
        this.throttle = 0.0;
        // Fly a physical 65° angle of attack: pitch the nose above the current
        // flight-path angle so the +Z heatshield takes the shockwave.
        const flightPath = Math.atan2(this.velocity.y, Math.max(20.0, this.horizontalSpeed));
        const entryPitch = THREE.MathUtils.clamp(Math.PI * 0.5 - (flightPath + 1.13), 0.15, 1.50);
        this.pitch = THREE.MathUtils.lerp(this.pitch, entryPitch, Math.min(1.0, dt * 2.4));
        this.roll = THREE.MathUtils.lerp(this.roll, 0.0, dt * 2.5);
        this.vehicle.setFlapDeflection(Math.sin(this.missionTime * 1.6) * 0.22, Math.cos(this.missionTime * 1.3) * 0.14);

        if (this.altitude <= 30000.0) {
          this.phase = FLIGHT_PHASES.BELLYFLOP;
        }
        break;
      }

      case FLIGHT_PHASES.BELLYFLOP: {
        this.throttle = 0.0;
        // Skydiving attitude: broadside to the relative wind, still lifting.
        const flightPath = Math.atan2(this.velocity.y, Math.max(20.0, this.horizontalSpeed));
        const bellyPitch = THREE.MathUtils.clamp(Math.PI * 0.5 - (flightPath + 1.13), 0.30, 1.48);
        this.pitch = THREE.MathUtils.lerp(this.pitch, bellyPitch, Math.min(1.0, dt * 2.5));
        this.roll = THREE.MathUtils.lerp(this.roll, 0.0, dt * 2.5);
        this.vehicle.setShipChopsticks(0.0, this.shipArmY);

        const dxPad = this.shipCatchCoords.x - this.position.x;
        const dzPad = this.shipCatchCoords.y - this.position.z;
        this.vehicle.setFlapDeflection(
          Math.sin(this.missionTime * 2.2) * 0.18 + THREE.MathUtils.clamp(dxPad * 0.002, -0.25, 0.25),
          Math.cos(this.missionTime * 2.4) * 0.14 + THREE.MathUtils.clamp(dzPad * 0.002, -0.25, 0.25)
        );

        // Flip when the 6-Raptor landing burn can still arrest the descent.
        // Stop distance uses thrust minus gravity plus current drag decel.
        const avail = this.getShipAvailAccel(6);
        const dragDecel = (this.dynamicPressure * 1.47 * 440.0) / Math.max(1.0, this.getShipMass());
        const decel = Math.max(2.0, avail * 0.70 - localGravity + dragDecel);
        const stopAltitude = (this.speed * this.speed) / (2.0 * decel) + this.speed * 1.2;
        if (this.altitude <= Math.max(1800.0, stopAltitude)) {
          this.phase = FLIGHT_PHASES.LANDING_FLIP;
          this.pitchVel = -2.2;
          this.throttle = 1.0;
        }
        break;
      }

      case FLIGHT_PHASES.LANDING_FLIP: {
        const targetShipCatchY = this.shipCatchBaseY;
        const heightAboveCatch = Math.max(0.1, this.position.y - targetShipCatchY);

        // Rotational PD torque controller swinging Starship from +90° belly-flop to 0° vertical
        const pitchError = 0.0 - this.pitch;
        const pitchTorque = pitchError * 7.8 - this.pitchVel * 3.8;
        this.pitchVel += pitchTorque * dt;
        this.pitch += this.pitchVel * dt;
        this.roll = THREE.MathUtils.lerp(this.roll, 0.0, dt * 4.0);

        const flipProgress = THREE.MathUtils.clamp(1.0 - this.pitch / (Math.PI * 0.5), 0.0, 1.0);
        this.vehicle.setFlapDeflection(-0.55 * (1.0 - flipProgress), 0.0);

        // Physics kinematic suicide-burn guidance law: v_target = -sqrt(2 * a_eff * h).
        // a_eff is the thrust actually available minus gravity, so the profile
        // stays flyable as the tanks drain and acceleration climbs.
        const engineCount = 6;
        const shipAvailAccel = this.getShipAvailAccel(engineCount);
        const usableDecel = Math.max(2.2, shipAvailAccel * 0.70 - localGravity);
        const desiredVy = -Math.sqrt(2.0 * usableDecel * heightAboveCatch) - 1.2;
        const vyError = desiredVy - this.velocity.y;
        // Feedforward the profile decel, then close the velocity loop.
        const profileDecel = (desiredVy * desiredVy) / (2.0 * Math.max(1.0, heightAboveCatch));
        const neededAccelY = localGravity + profileDecel + THREE.MathUtils.clamp(vyError * 2.4, -shipAvailAccel * 0.5, 30.0);
        this.throttle = THREE.MathUtils.clamp(neededAccelY / Math.max(0.35, Math.cos(this.pitch) * shipAvailAccel), 0.20, 1.0);

        if (heightAboveCatch <= 90.0) {
          const preClose = THREE.MathUtils.clamp((90.0 - heightAboveCatch) / 180.0, 0.0, 0.45);
          this.vehicle.setShipChopsticks(preClose, this.shipArmY);
        }

        // Terminal alignment funnel: null the horizontal offset onto the catch
        // centreline over the last 60 m so the pins arrive perfectly centred.
        this.alignShipToCatch(dt, heightAboveCatch);

        if (heightAboveCatch <= 12.0 && this.velocity.y > -12.0) {
          this.phase = FLIGHT_PHASES.TOUCHDOWN;
        }
        break;
      }

      case FLIGHT_PHASES.TOUCHDOWN: {
        const targetShipCatchY = this.shipCatchBaseY;
        const hAbovePins = Math.max(0.0, this.position.y - targetShipCatchY);

        const pitchTorque = (0.0 - this.pitch) * 10.0 - this.pitchVel * 4.5;
        this.pitchVel += pitchTorque * dt;
        this.pitch += this.pitchVel * dt;
        this.yaw = THREE.MathUtils.lerp(this.yaw, 0.0, 1.0 - Math.exp(-dt * 5.0));

        const targetVy = -THREE.MathUtils.clamp(0.35 + hAbovePins * 0.16, 0.35, 5.5);
        const vyErr = targetVy - this.velocity.y;
        const neededAy = localGravity + THREE.MathUtils.clamp(vyErr * 3.8, -2.5, 22.0);
        const shipAvailAccel = this.getShipAvailAccel(6);
        this.throttle = THREE.MathUtils.clamp(neededAy / shipAvailAccel, 0.15, 0.90);

        this.alignShipToCatch(dt, hAbovePins);

        const clampProgress = THREE.MathUtils.clamp(1.0 - (hAbovePins / 28.0), 0.45, 1.0);
        this.vehicle.setShipChopsticks(clampProgress, this.shipArmY);

        if (hAbovePins <= 0.45 || this.position.y <= targetShipCatchY + 0.45) {
          this.position.set(this.shipCatchCoords.x, targetShipCatchY, this.shipCatchCoords.y);
          this.velocity.set(0, 0, 0);
          this.pitch = 0;
          this.yaw = 0;
          this.pitchVel = 0;
          this.throttle = 0;
          this.shipCaughtByTower = true;
          this.vehicle.setShipChopsticks(1.0, this.shipArmY);
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

  // Captures the last few metres of the approach on the arm centreline. The
  // physical catch point and the arm tips are the same coordinate, so any
  // residual lateral error is nulled here instead of arriving beside the pins.
  alignShipToCatch(dt, heightAboveCatch) {
    if (heightAboveCatch > 80.0) return;
    const gain = heightAboveCatch < 12.0 ? 5.5 : 2.2;
    const k = 1.0 - Math.exp(-dt * gain);
    this.position.x += (this.shipCatchCoords.x - this.position.x) * k;
    this.position.z += (this.shipCatchCoords.y - this.position.z) * k;
    const damp = Math.exp(-dt * (heightAboveCatch < 12.0 ? 6.0 : 2.6));
    this.velocity.x *= damp;
    this.velocity.z *= damp;
    this.yaw = THREE.MathUtils.lerp(this.yaw, 0.0, k);
    this.roll = THREE.MathUtils.lerp(this.roll, 0.0, k);
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
    // Catch pins sit 65.5 m above the booster base, so the base must stop at
    // the dedicated booster-catch elevation for the arm carriage to take the
    // load. Both values come from the shared master plan.
    const targetCatchElevation = this.boosterCatchBaseY;
    const carriageHeight = this.boosterArmY;

    const toPadX = this.boosterCatchCoords.x - this.boosterPosition.x;
    const toPadZ = this.boosterCatchCoords.y - this.boosterPosition.z;
    const horizDist = Math.hypot(toPadX, toPadZ);
    const toPadDir = this._toPadDir.set(
      horizDist > 0.001 ? toPadX / horizDist : 0,
      0,
      horizDist > 0.001 ? toPadZ / horizDist : 0
    );
    const towardPadVel = this.boosterVelocity.x * toPadDir.x + this.boosterVelocity.z * toPadDir.z;
    const altitudeAboveCatch = Math.max(0.0, this.boosterPosition.y - targetCatchElevation);
    const boosterAlt = Math.max(0.0, this.boosterPosition.y - this.padElevation);
    const localG = this.marsGravity * Math.pow(this.planetRadius / (this.planetRadius + boosterAlt), 2);

    // Time remaining before free-fall brings the booster back to catch height.
    // Includes the coast up to apogee so the lateral prediction is honest.
    const vy0 = this.boosterVelocity.y;
    const apexRise = vy0 > 0 ? (vy0 * vy0) / (2 * localG) : 0;
    const tFall = (vy0 > 0 ? vy0 / localG : 0) + Math.sqrt((2 * (altitudeAboveCatch + apexRise)) / localG);

    switch (this.boosterState) {
      case BOOSTER_STATES.BOOSTBACK: {
        this.boosterRaptorMode = 'BOOSTBACK_13';
        // Keep 13 Raptors burning until the free-fall impact prediction lands
        // on the pad; thrust is horizontal-only, exactly like a real boostback.
        const desiredTowards = THREE.MathUtils.clamp(horizDist / Math.max(20.0, tFall * 0.92), 0.0, 300.0);
        const boostAvail = Math.max(0.5, this.getBoosterAvailAccel(13));
        const tau = 2.6;
        let ax = ((toPadDir.x * desiredTowards) - this.boosterVelocity.x) / tau;
        let az = ((toPadDir.z * desiredTowards) - this.boosterVelocity.z) / tau;
        const aCmd = Math.hypot(ax, az);
        const aMax = boostAvail * 0.94;
        if (aCmd > aMax) {
          ax *= aMax / aCmd;
          az *= aMax / aCmd;
        }

        let throttle = 0.0;
        if (this.boosterFuel > 0.35) {
          const aMag = Math.hypot(ax, az);
          throttle = THREE.MathUtils.clamp(aMag / Math.max(0.05, boostAvail), 0.0, 1.0);
          if (throttle > 0.02) {
            const thrust = this.burnPropellant(true, 13, throttle, dt);
            const applied = thrust / Math.max(1.0, this.getBoosterMass());
            if (aMag > 1e-4) {
              ax = (ax / aMag) * applied;
              az = (az / aMag) * applied;
            }
            this.boosterEngineCount = 13;
          } else {
            throttle = 0.0;
            this.boosterEngineCount = 0;
            ax = 0;
            az = 0;
          }
        } else {
          this.boosterEngineCount = 0;
          ax = 0;
          az = 0;
        }

        this.boosterVelocity.x += ax * dt;
        this.boosterVelocity.z += az * dt;
        this.boosterVelocity.y -= localG * dt;

        // Point the vehicle along the thrust vector while the Raptors are lit.
        if (throttle > 0.02) {
          this._thrustCmd.set(ax, 0, az).normalize();
          this._tmpQ.setFromUnitVectors(this._upAxis, this._thrustCmd);
          this.boosterQuaternion.slerp(this._tmpQ, 1.0 - Math.exp(-dt * 2.8));
        }
        this.vehicle.setBoosterThrottle(throttle);
        this.vehicle.setGridFinSteering(
          THREE.MathUtils.clamp(toPadDir.x * 0.4, -0.35, 0.35),
          THREE.MathUtils.clamp(toPadDir.z * 0.4, -0.35, 0.35)
        );

        // Predicted downrange miss if we stopped burning now.
        const predictedMiss = horizDist - towardPadVel * tFall * 0.92;
        const finished = Math.abs(predictedMiss) < 700.0 || this.boosterTimer > 90.0 || this.boosterFuel < 12.0;
        if (finished) {
          this.boosterState = BOOSTER_STATES.DESCENT;
          this.boosterTimer = 0.0;
          this.boosterRaptorMode = 'OFF';
          this.boosterEngineCount = 0;
          this.vehicle.setBoosterThrottle(0.0);
          this.vehicle.setBoosterChopsticks(0.0, carriageHeight);
        }
        break;
      }

      case BOOSTER_STATES.DESCENT: {
        this.boosterRaptorMode = 'OFF';
        this.boosterEngineCount = 0;
        this.vehicle.setBoosterThrottle(0.0);

        // Layered atmospheric drag on the engine section and deployed grid
        // fins. Uses the air-relative velocity, so the near-surface wind shear
        // is included instead of assuming a still atmosphere.
        const bAtmo = this.sampleAtmosphere(boosterAlt, this._boosterAtmo);
        const rho = bAtmo.density;
        const boosterMass = Math.max(1.0, this.getBoosterMass());
        this._relBoosterVel.copy(this.boosterVelocity).sub(bAtmo.wind);
        const v = this._relBoosterVel.length();
        if (v > 0.5 && rho > 1e-9) {
          const dragAccel = (0.5 * rho * v * v * 1.15 * BOOSTER_DRAG_AREA) / boosterMass;
          this.boosterVelocity.addScaledVector(this._relBoosterVel, -dragAccel * (dt / v));
        }
        this.boosterVelocity.y -= localG * dt;

        // Cold-gas RCS / grid-fin trim keeps the free-fall impact point on the pad.
        const miss = horizDist - towardPadVel * Math.max(5.0, tFall);
        const lateralCmd = THREE.MathUtils.clamp(miss * 0.012, -2.6, 2.6);
        this.boosterVelocity.x += toPadDir.x * lateralCmd * dt;
        this.boosterVelocity.z += toPadDir.z * lateralCmd * dt;

        // Belly-to-wind attitude: booster descends engines-first, nose up.
        this._tmpQ.identity();
        this.boosterQuaternion.slerp(this._tmpQ, 1.0 - Math.exp(-dt * 1.8));
        this.vehicle.setGridFinSteering(
          THREE.MathUtils.clamp(toPadDir.x * 0.6, -0.7, 0.7),
          THREE.MathUtils.clamp(toPadDir.z * 0.6, -0.7, 0.7)
        );

        if (altitudeAboveCatch <= 20000.0) {
          this.boosterState = BOOSTER_STATES.APPROACH;
          this.boosterTimer = 0.0;
        }
        break;
      }

      case BOOSTER_STATES.APPROACH: {
        // Mars has almost no terminal-velocity relief, so the landing burn has
        // to start high and use the full 33-engine thrust section. Throttle is
        // solved from the required acceleration, not scripted.
        this.boosterRaptorMode = 'ALL_33';
        const approachAvail = Math.max(0.5, this.getBoosterAvailAccel(33));
        const decelCap = Math.max(1.5, approachAvail * 0.72 - localG);

        // Suicide-burn profile v = -sqrt(2*a*h), capped near the pad so the
        // final metres are a gentle 2.5 m/s instead of the profile's 8 m/s.
        const profileSpeed = Math.sqrt(2.0 * decelCap * Math.max(0.0, altitudeAboveCatch));
        const terminalSpeed = 2.5 + 0.12 * altitudeAboveCatch;
        const targetVy = -THREE.MathUtils.clamp(
          Math.min(profileSpeed, terminalSpeed),
          2.5, 420.0
        );
        const vyError = targetVy - this.boosterVelocity.y;
        // Feedforward the profile's instantaneous decel + gravity, then close
        // the velocity loop. Without this the last metres arrive too hot.
        const profileDecel = (targetVy * targetVy) / (2.0 * Math.max(0.5, altitudeAboveCatch));
        let ay = localG + profileDecel + THREE.MathUtils.clamp(vyError * 3.2, -approachAvail * 0.92, approachAvail * 0.92);

        // Lateral TVC: null the miss and arrive over the pad.
        const latitude = Math.max(2.0, tFall);
        const desiredVx = toPadDir.x * THREE.MathUtils.clamp(horizDist / latitude, 0.0, 110.0);
        const desiredVz = toPadDir.z * THREE.MathUtils.clamp(horizDist / latitude, 0.0, 110.0);
        let ax = THREE.MathUtils.clamp((desiredVx - this.boosterVelocity.x) * 0.9, -approachAvail * 0.42, approachAvail * 0.42);
        let az = THREE.MathUtils.clamp((desiredVz - this.boosterVelocity.z) * 0.9, -approachAvail * 0.42, approachAvail * 0.42);

        const aMag = Math.hypot(ax, ay, az);
        const aLimit = approachAvail * 0.94;
        if (aMag > aLimit) {
          const s = aLimit / aMag;
          ax *= s;
          ay *= s;
          az *= s;
        }

        let throttle = THREE.MathUtils.clamp(Math.hypot(ax, ay, az) / Math.max(0.05, approachAvail), 0.0, 1.0);
        if (this.boosterFuel <= 0.25 || throttle <= 0.01) {
          throttle = 0.0;
          this.boosterEngineCount = 0;
          this.boosterRaptorMode = 'OFF';
        } else {
          const thrust = this.burnPropellant(true, 33, throttle, dt);
          const applied = thrust / Math.max(1.0, this.getBoosterMass());
          const cmdMag = Math.hypot(ax, ay, az);
          if (cmdMag > 1e-4) {
            ax = (ax / cmdMag) * applied;
            ay = (ay / cmdMag) * applied;
            az = (az / cmdMag) * applied;
          }
          this.boosterEngineCount = 33;
        }

        this.boosterVelocity.x += ax * dt;
        this.boosterVelocity.y += (ay - localG) * dt;
        this.boosterVelocity.z += az * dt;

        this._thrustCmd.set(ax, ay, az);
        if (this._thrustCmd.lengthSq() > 1e-6) {
          this._thrustCmd.normalize();
          this._tmpQ.setFromUnitVectors(this._upAxis, this._thrustCmd);
          this.boosterQuaternion.slerp(this._tmpQ, 1.0 - Math.exp(-dt * 4.5));
        }
        this.vehicle.setBoosterThrottle(throttle);
        this.vehicle.setGridFinSteering(
          THREE.MathUtils.clamp(toPadDir.x * 0.25, -0.25, 0.25),
          THREE.MathUtils.clamp(toPadDir.z * 0.25, -0.25, 0.25)
        );

        // Terminal alignment funnel: within 60 m, pull the booster onto the
        // arm centreline and bleed lateral velocity. This is the final capture
        // guidance that makes the pins meet the pads dead-centre.
        if (altitudeAboveCatch <= 60.0) {
          const k = 1.0 - Math.exp(-dt * (altitudeAboveCatch < 10.0 ? 6.0 : 2.4));
          this.boosterPosition.x += (this.boosterCatchCoords.x - this.boosterPosition.x) * k;
          this.boosterPosition.z += (this.boosterCatchCoords.y - this.boosterPosition.z) * k;
          const damp = Math.exp(-dt * (altitudeAboveCatch < 10.0 ? 6.5 : 3.0));
          this.boosterVelocity.x *= damp;
          this.boosterVelocity.z *= damp;
        }

        if (altitudeAboveCatch <= 42.0) {
          const clampProgress = THREE.MathUtils.clamp(1.0 - altitudeAboveCatch / 42.0, 0.0, 1.0);
          this.vehicle.setBoosterChopsticks(clampProgress, carriageHeight);
        }

        if (altitudeAboveCatch <= 1.2 || this.boosterPosition.y <= targetCatchElevation + 1.2) {
          this.boosterPosition.set(this.boosterCatchCoords.x, targetCatchElevation, this.boosterCatchCoords.y);
          this.boosterVelocity.set(0, 0, 0);
          this.boosterQuaternion.identity();
          this.boosterState = BOOSTER_STATES.CAUGHT;
          this.boosterTimer = 0.0;
          this.boosterRaptorMode = 'OFF';
          this.boosterEngineCount = 0;
          this.vehicle.setBoosterThrottle(0.0);
          this.vehicle.setBoosterChopsticks(1.0, carriageHeight);
          this.vehicle.setGridFinSteering(0, 0);
        }
        break;
      }

      case BOOSTER_STATES.CAUGHT: {
        this.boosterRaptorMode = 'OFF';
        this.boosterEngineCount = 0;
        this.boosterVelocity.set(0, 0, 0);
        this.vehicle.setBoosterThrottle(0.0);
        this.boosterQuaternion.identity();
        // The booster remains visible on its dedicated tower while the ship
        // finishes entry. Starbase Operations takes over from here.
        this.vehicle.boosterGroup.visible = true;
        this.boosterPosition.set(this.boosterCatchCoords.x, targetCatchElevation, this.boosterCatchCoords.y);
        this.vehicle.setBoosterChopsticks(1.0, carriageHeight);
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
