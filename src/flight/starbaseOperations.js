import * as THREE from 'three';
import { STARBASE_LAYOUT as L } from './starbaseLayout.js';

const STAGE = {
  IDLE: 'IDLE',
  WAIT: 'WAIT',
  LOWER: 'LOWER',
  TRANSPORT: 'TRANSPORT',
  FACTORY: 'FACTORY',
  DONE: 'DONE'
};

function easeInOut(t) {
  return t * t * (3 - 2 * t);
}

function routeLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  return total;
}

function sampleRoute(points, t, out) {
  const total = routeLength(points);
  let travel = THREE.MathUtils.clamp(t, 0, 1) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segment = Math.hypot(b.x - a.x, b.z - a.z);
    if (travel <= segment || i === points.length - 1) {
      const f = segment > 0.001 ? Math.min(1, travel / segment) : 0;
      out.set(
        THREE.MathUtils.lerp(a.x, b.x, f),
        0,
        THREE.MathUtils.lerp(a.z, b.z, f)
      );
      return out;
    }
    travel -= segment;
  }
  out.set(points[points.length - 1].x, 0, points[points.length - 1].z);
  return out;
}

// ---------------------------------------------------------------------------
// Automated Starbase recovery, inspection, refurbishment and restack.
//
// The old booster and ship are lowered out of the catch arms, carried along
// the yard route by their crawlers, hidden inside the factory, and then a fresh
// mated stack is rolled out to the launch mount. This is the reloading loop
// that prevents the caught vehicles from remaining stuck on the towers.
// ---------------------------------------------------------------------------
export class StarbaseOperations {
  constructor(physics, vehicle, options = {}) {
    this.physics = physics;
    this.vehicle = vehicle;
    this.options = options;

    this.state = 'IDLE';
    this.buildTimer = 0;
    this.readyTimer = 0;
    this.relaunchRequested = false;
    this.message = '';
    this._tmp = new THREE.Vector3();

    this.ship = this.makeTrack({
      kind: 'ship',
      route: [...L.routes.shipToReview, ...L.routes.shipToFactory.slice(1)],
      lowerDuration: 4.6,
      transportDuration: 10.0
    });
    this.booster = this.makeTrack({
      kind: 'booster',
      route: [...L.routes.boosterToReview, ...L.routes.boosterToFactory.slice(1)],
      lowerDuration: 3.8,
      transportDuration: 10.0
    });
  }

  makeTrack({ kind, route, lowerDuration, transportDuration }) {
    return {
      kind,
      stage: STAGE.IDLE,
      timer: 0,
      route,
      lowerDuration,
      transportDuration,
      start: new THREE.Vector3(),
      targetY: 0
    };
  }

  reset() {
    this.state = 'IDLE';
    this.buildTimer = 0;
    this.readyTimer = 0;
    this.relaunchRequested = false;
    this.message = '';
    for (const track of [this.ship, this.booster]) {
      track.stage = STAGE.IDLE;
      track.timer = 0;
    }
    this.physics.opsMessage = '';
    this.vehicle.setReviewScan('ship', false);
    this.vehicle.setReviewScan('booster', false);
    for (const kind of ['ship', 'booster']) {
      const crawler = this.vehicle.crawlers?.[kind];
      if (crawler) crawler.group.visible = false;
    }
  }

  update(dt) {
    const p = this.physics;
    // Yard messages own the status line only while a recovery/restack
    // operation is actually running. Otherwise the orbit tanker and transfer
    // guidance need to keep their own message visible.
    if (this.state !== 'IDLE' || this.message) {
      p.opsMessage = this.message;
    }

    if (this.state === 'IDLE') {
      // Trigger recovery whenever a vehicle touches down or is caught on the pad/tower
      if (p.phase === 'LANDED') {
        this.state = 'RECOVERY';
        const hasBooster = p.boosterState === 'CAUGHT' || (this.vehicle.boosterGroup && this.vehicle.boosterGroup.visible);
        if (hasBooster) {
          this.beginTrack(this.booster, p.boosterPosition, p.padGroundY + 2.0);
        } else {
          this.booster.stage = STAGE.DONE;
        }
        this.beginTrack(this.ship, p.position, p.padElevation);
        this.message = 'STARBASE OPS // RECOVERY CREWS DEPLOYING CRAWLER & CONVEYOR';
      }
      return;
    }

    if (this.state === 'RECOVERY') {
      p.yardControl = true;
      this.updateTrack(this.booster, dt);
      this.updateTrack(this.ship, dt);

      if (this.booster.stage === STAGE.DONE && this.ship.stage === STAGE.DONE) {
        this.state = 'BUILD';
        this.buildTimer = 0;
        this.message = 'FACTORY // INSPECTION COMPLETE · FABRICATING NEXT STACK';
        this.vehicle.setReviewScan('ship', false);
        this.vehicle.setReviewScan('booster', false);
      } else {
        this.message = this.buildMessage();
      }
      return;
    }

    if (this.state === 'BUILD') {
      p.yardControl = true;
      this.buildTimer += dt;
      const t = Math.min(1, this.buildTimer / 7.5);
      // Visible factory choreography: erection arm lifts, stacker trolley
      // indexes and the review beacons sweep the refurbished sections.
      this.vehicle.setErectorAngle(THREE.MathUtils.lerp(-0.32, 0.05, easeInOut(t)));
      this.vehicle.setReviewScan('ship', t > 0.65, t);
      this.vehicle.setReviewScan('booster', t > 0.45, t);

      if (t < 0.45) {
        this.message = 'FACTORY // RAPTOR REFURBISHMENT · HEAT SHIELD TILES REPAIR';
      } else if (t < 0.85) {
        this.message = 'ROBOTIC ARMS // ROLLING REFURBISHED VEHICLES ONTO CONVEYOR';
      } else {
        this.message = 'ROBOTIC CHOPSTICKS // HOISTING & LOADING BOOSTER ONTO LAUNCH MOUNT';
      }

      if (this.buildTimer >= 7.5) {
        this.message = 'ROBOTIC ARMS // HOISTING & MATING STARSHIP ONTO BOOSTER';
        p.prepareNextMission();
        this.state = 'READY';
        this.readyTimer = 0;
        this.vehicle.setReviewScan('ship', false);
        this.vehicle.setReviewScan('booster', false);
        this.vehicle.setLaunchChopsticks(0.0, L.launchTower.armY);
        this.vehicle.setErectorAngle(0);
      }
      return;
    }

    if (this.state === 'READY') {
      this.readyTimer += dt;
      const close = Math.min(1, this.readyTimer / 2.8);
      this.vehicle.setLaunchChopsticks(close, L.launchTower.armY);
      this.message = close >= 1
        ? 'STARBASE OPS // NEW STACK SECURED BY ROBOTIC ARMS · READY FOR LAUNCH'
        : 'ROBOTIC CHOPSTICKS // MATING STARSHIP STACK · LATCHING UMBILICALS';

      // Continuous AUTO campaign: launch the fresh stack after a short hold so
      // the reload is visible rather than an instant teleport.
      if (this.readyTimer > 8.0 && p.autoMission && !this.relaunchRequested) {
        this.relaunchRequested = true;
        if (this.options.onRelaunch) this.options.onRelaunch();
      }
      if (this.readyTimer > 1.5 && !p.autoMission) {
        // Manual pilots keep the new stack on the pad and take over.
      }
    }
  }

  beginTrack(track, startPos, targetY) {
    track.stage = STAGE.WAIT;
    track.timer = 0;
    track.start.copy(startPos);
    track.targetY = targetY;
    const crawler = this.vehicle.crawlers?.[track.kind];
    if (crawler) {
      crawler.group.visible = true;
      crawler.group.position.set(
        startPos.x - this.physics.padCoords.x,
        crawler.baseY,
        startPos.z - this.physics.padCoords.y
      );
    }
  }

  buildMessage() {
    const s = this.ship.stage;
    const b = this.booster.stage;
    if (s === STAGE.LOWER || b === STAGE.LOWER) return 'STARBASE OPS // LOWERING VEHICLE ONTO CONVEYOR CRAWLER';
    if (s === STAGE.TRANSPORT || b === STAGE.TRANSPORT) return 'CONVEYOR TRANSIT // MOVING STARSHIP & BOOSTER TO REPAIR HANGAR';
    if (s === STAGE.FACTORY || b === STAGE.FACTORY) return 'FACTORY // THERMAL SURVEY · ROBOTIC REFURBISHMENT';
    if (s === STAGE.WAIT || b === STAGE.WAIT) return 'STARBASE OPS // SAFING VEHICLES · VENTING RESIDUAL PROPELLANT';
    return 'STARBASE OPS // CONVEYOR & REPAIR IN PROGRESS';
  }

  updateTrack(track, dt) {
    const p = this.physics;
    track.timer += dt;
    const isBooster = track.kind === 'booster';

    if (track.stage === STAGE.WAIT) {
      if (track.timer >= (isBooster ? 1.5 : 2.5)) {
        track.stage = STAGE.LOWER;
        track.timer = 0;
      }
      return;
    }

    if (track.stage === STAGE.LOWER) {
      const t = Math.min(1, track.timer / track.lowerDuration);
      const e = easeInOut(t);
      const y = THREE.MathUtils.lerp(track.start.y, track.targetY, e);
      const catchArmY = isBooster ? this.physics.boosterArmY : this.physics.shipArmY;
      const carriage = catchArmY - Math.max(0, track.start.y - y);
      const grip = t < 0.58 ? 1.0 : 1.0 - (t - 0.58) / 0.42;
      const crawler = this.vehicle.crawlers?.[track.kind];
      if (isBooster) {
        p.boosterPosition.y = y;
        this.vehicle.setBoosterChopsticks(grip, carriage);
      } else {
        p.position.y = y;
        this.vehicle.setShipChopsticks(grip, carriage);
      }
      if (crawler) {
        crawler.group.position.set(
          (isBooster ? p.boosterPosition.x : p.position.x) - p.padCoords.x,
          crawler.baseY,
          (isBooster ? p.boosterPosition.z : p.position.z) - p.padCoords.y
        );
      }
      if (t >= 1) {
        track.stage = STAGE.TRANSPORT;
        track.timer = 0;
        if (isBooster) {
          p.boosterPosition.y = track.targetY;
          this.vehicle.setBoosterChopsticks(0.0, carriage);
        } else {
          p.position.y = track.targetY;
          this.vehicle.setShipChopsticks(0.0, carriage);
        }
      }
      return;
    }

    if (track.stage === STAGE.TRANSPORT) {
      const t = Math.min(1, track.timer / track.transportDuration);
      const e = easeInOut(t);
      sampleRoute(track.route, e, this._tmp);

      // World coordinates for the physics entities
      const worldX = p.padCoords.x + this._tmp.x;
      const worldZ = p.padCoords.y + this._tmp.z;

      if (isBooster) {
        p.boosterPosition.set(worldX, track.targetY, worldZ);
        p.boosterQuaternion.identity();
      } else {
        p.position.set(worldX, track.targetY, worldZ);
        p.quaternion.identity();
      }

      // Local coordinates for the crawler inside starship.group
      const crawler = this.vehicle.crawlers?.[track.kind];
      if (crawler) {
        crawler.group.position.set(this._tmp.x, crawler.baseY, this._tmp.z);
      }
      if (t >= 1) {
        track.stage = STAGE.FACTORY;
        track.timer = 0;
        this.vehicle.setReviewScan(track.kind, true, 0);
      }
      return;
    }

    if (track.stage === STAGE.FACTORY) {
      this.vehicle.setReviewScan(track.kind, true, Math.min(1, track.timer / 3.2));
      const crawler = this.vehicle.crawlers?.[track.kind];
      const doorX = isBooster ? L.factory.conveyorDoorX : L.factory.recoveryDoorX;
      const doorZ = isBooster ? L.factory.conveyorDoorZ : L.factory.recoveryDoorZ;
      if (crawler) {
        crawler.group.position.set(doorX, crawler.baseY, doorZ);
      }
      if (isBooster) {
        p.boosterPosition.set(p.padCoords.x + doorX, track.targetY, p.padCoords.y + doorZ);
      } else {
        p.position.set(p.padCoords.x + doorX, track.targetY, p.padCoords.y + doorZ);
      }
      if (track.timer >= 3.2) {
        track.stage = STAGE.DONE;
        track.timer = 0;
        this.vehicle.setReviewScan(track.kind, false);
        if (isBooster) {
          this.vehicle.boosterGroup.visible = false;
        } else {
          this.vehicle.starshipGroup.visible = false;
        }
        if (crawler) crawler.group.visible = false;
      }
    }
    }
  }
}
