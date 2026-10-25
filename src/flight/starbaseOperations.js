import * as THREE from 'three';
import { STARBASE_LAYOUT as L, LIFT_POINTS } from './starbaseLayout.js';
import { StarbaseObstacleSystem } from './solidCollisions.js';

export class StarbaseOperations {
  constructor(physics, vehicle, options = {}) {
    this.physics = physics;
    this.vehicle = vehicle;
    this.options = options;
    this.obstacles = options.obstacles || new StarbaseObstacleSystem(physics.padCoords);
    this._point = new THREE.Vector3();
    this._next = new THREE.Vector3();
    this._hook = new THREE.Vector3();
    this.ship = this.makeTrack('ship', [...L.routes.shipToReview, ...L.routes.shipToFactory.slice(1)]);
    this.booster = this.makeTrack('booster', [...L.routes.boosterToReview, ...L.routes.boosterToFactory.slice(1)]);
    this.reset();
  }

  makeTrack(kind, points) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, 0, p.z)), false, 'centripetal');
    curve.arcLengthDivisions = 600;
    return { kind, curve, length: curve.getLength(), start: new THREE.Vector3() };
  }

  reset() {
    this.state = 'IDLE'; this.message = '';
    this.physics.opsMessage = '';
    for (const t of [this.ship, this.booster]) {
      Object.assign(t, { stage: 'IDLE', timer: 0, distance: 0, speed: 0, gate: 1 });
      this.vehicle.setFactoryGate?.(t.kind, 1);
      this.obstacles.setGate(t.kind, 1);
      this.vehicle.setReviewScan(t.kind, false);
      if (this.vehicle.crawlers?.[t.kind]) this.vehicle.crawlers[t.kind].group.visible = false;
    }
  }

  beginTrack(t, position) {
    t.start.copy(position); t.stage = 'RIG'; t.timer = 0;
    t.targetY = this.physics.padGroundY + (this.vehicle.crawlers?.[t.kind]?.loadY ?? 4.7);
    const crawler = this.vehicle.crawlers?.[t.kind];
    if (crawler) {
      crawler.group.visible = true;
      crawler.group.position.set(position.x-this.physics.padCoords.x, 0, position.z-this.physics.padCoords.y);
    }
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    const p = this.physics;
    if (this.state === 'IDLE') {
      if (p.phase !== 'LANDED') return;
      this.booster.stage = 'DONE';
      // A booster left on another planet is not a recovered local vehicle.
      if (p.boosterState === 'CAUGHT' && this.vehicle.boosterGroup.visible) this.beginTrack(this.booster, p.boosterPosition);
      this.beginTrack(this.ship, p.position);
      p.yardControl = true; this.state = 'RECOVERY';
    }
    if (this.state === 'RECOVERY') {
      this.message = 'CRANE // ALIGNING LIFTING LUGS & SECURING MOVER';
      this.updateTrack(this.booster, dt); this.updateTrack(this.ship, dt);
      if ([this.ship.stage, this.booster.stage].every(s => s === 'DONE')) {
        this.state = 'SERVICED';
        this.message = 'MEGA BAY // PARKED & SECURED · RESET MISSION FOR A NEW STACK';
      }
    }
    p.opsMessage = this.message;
  }

  updateTrack(t, dt) {
    if (t.stage === 'DONE' || t.stage === 'IDLE') return;
    const p = this.physics, kind = t.kind, booster = kind === 'booster';
    const pos = booster ? p.boosterPosition : p.position;
    const quat = booster ? p.boosterQuaternion : p.quaternion;
    const crawler = this.vehicle.crawlers?.[kind], lug = LIFT_POINTS[kind];
    t.timer += dt;
    if (['RIG','LOWER','RELEASE'].includes(t.stage)) {
      if (t.stage === 'LOWER') {
        const remaining = Math.max(0, pos.y-t.targetY);
        t.speed = Math.min(t.speed+dt*0.65, 2.2, Math.sqrt(2*0.65*remaining));
        pos.y = Math.max(t.targetY, pos.y-t.speed*dt);
        if (remaining < 0.015) { pos.y = t.targetY; t.stage = 'RELEASE'; t.timer = 0; }
      }
      this._hook.copy(pos); this._hook.y += lug.height+lug.hookOffset;
      if (t.stage === 'RIG') this._hook.y += (1-Math.min(1,t.timer/3))*8;
      if (t.stage === 'RELEASE') this._hook.y += Math.min(1,t.timer/3)*10;
      this.vehicle.setCraneTarget?.(kind, this._hook, t.stage === 'LOWER');
      const grip = t.stage === 'RIG' ? 1 : 0;
      if (booster) this.vehicle.setBoosterChopsticks(grip, p.boosterArmY);
      else this.vehicle.setShipChopsticks(grip, p.shipArmY);
      if (t.stage === 'RIG' && t.timer >= 3.5) { t.stage = 'LOWER'; t.timer = 0; t.speed = 0; }
      if (t.stage === 'RELEASE' && t.timer >= 3) { t.stage = 'DRIVE'; t.timer = 0; t.speed = 0; }
      return;
    }
    if (t.stage === 'DRIVE') {
      this.message = 'MOVER // STEERING THROUGH MEGA BAY NORTH GATE';
      const u = Math.min(1, t.distance/t.length);
      const tangent = t.curve.getTangentAt(u, this._point);
      const yaw = Math.atan2(tangent.x, tangent.z);
      const next = t.curve.getTangentAt(Math.min(1,u+2/t.length), this._next);
      const turn = Math.atan2(Math.sin(Math.atan2(next.x,next.z)-yaw), Math.cos(Math.atan2(next.x,next.z)-yaw));
      const curvature = turn/2;
      const maxSpeed = Math.min(5, Math.sqrt(0.45/Math.max(0.001,Math.abs(curvature))), Math.sqrt(1.4*(t.length-t.distance)));
      t.speed = THREE.MathUtils.damp(t.speed, maxSpeed, 1.5, dt);
      const travel = Math.min(t.length-t.distance, t.speed*dt), distance = t.distance+travel;
      t.curve.getPointAt(Math.min(1,distance/t.length), this._point);
      const wx = p.padCoords.x+this._point.x, wz = p.padCoords.y+this._point.z;
      const support = this.obstacles.supportHeight(wx,wz,p.padGroundY);
      this._next.set(wx, support+(crawler?.loadY ?? 4.7), wz);
      if (this.options.isRouteBlocked?.(this._next,10)) {
        t.speed=0;this.message='MOVER // WAITING FOR CLEAR LANE';return;
      }
      if (this.obstacles.resolve(this._next, 10, support-p.padGroundY+0.02, booster ? 75 : 55)) {
        t.speed = 0; this.message = 'MOVER // ROUTE OBSTRUCTED · STOPPED'; return;
      }
      t.distance = distance; pos.copy(this._next);
      quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      this.vehicle.steerCrawler?.(kind,yaw,curvature,travel);
      if (crawler) crawler.group.position.set(this._point.x, support-p.padGroundY, this._point.z);
      if (t.length-t.distance < 0.03) { t.stage = 'PARK'; t.timer = 0; t.speed = 0; }
      return;
    }
    if (t.stage === 'PARK') {
      t.gate = Math.max(0,t.gate-dt*0.25);
      this.vehicle.setFactoryGate?.(kind,t.gate); this.obstacles.setGate(kind,t.gate);
      if (t.gate === 0) t.stage = 'DONE';
    }
  }
}
