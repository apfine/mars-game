import * as THREE from 'three';
import { STARBASE_LAYOUT as L } from './starbaseLayout.js';

// ---------------------------------------------------------------------------
// Solid Collision System for Mars & Earth Starbases
// Prevents vehicles (Rover, Astronaut on foot, Rocket) from passing through:
// - Mechazilla Launch Tower
// - Orbital Launch Mount (OLM)
// - Booster Catch Tower
// - Ship Catch Tower
// - Starbase Factory / Mega Bay (solid walls)
// - Cryogenic Methane & LOX Storage Spheres & Tanks
// - Launch Control Pedestal
// - Conveyor Piers & Erector Trestle
// - Landed Vehicles & Tree Trunks
// ---------------------------------------------------------------------------

export class StarbaseObstacleSystem {
  constructor(padCoords = new THREE.Vector2(1400, 1150)) {
    this.padCoords = padCoords.clone();
    this.obstacles = [];
    this._initObstacles();
  }

  setPadCoords(coords) {
    this.padCoords.copy(coords);
    this._initObstacles();
  }

  _initObstacles() {
    const ox = this.padCoords.x;
    const oz = this.padCoords.y;
    this.obstacles = [
      // 1. Orbital Launch Mount (OLM) Table
      {
        type: 'cylinder',
        name: 'OLM_TABLE',
        x: ox,
        z: oz,
        radius: 12.0,
        minY: -5,
        maxY: L.olmTop + 4.0
      },

      // 2. Mechazilla Launch Tower (Main 145m tower)
      {
        type: 'box',
        name: 'LAUNCH_TOWER',
        minX: ox + L.launchTower.x - 7.5,
        maxX: ox + L.launchTower.x + 7.5,
        minZ: oz + L.launchTower.z - 7.5,
        maxZ: oz + L.launchTower.z + 7.5,
        minY: -5,
        maxY: L.launchTower.height + 10.0
      },

      // 3. Super Heavy Booster Catch Tower
      {
        type: 'box',
        name: 'BOOSTER_TOWER',
        minX: ox + L.boosterTower.x - 7.0,
        maxX: ox + L.boosterTower.x + 7.0,
        minZ: oz + L.boosterTower.z - 7.0,
        maxZ: oz + L.boosterTower.z + 7.0,
        minY: -5,
        maxY: L.boosterTower.height + 10.0
      },

      // 4. Starship Catch Tower
      {
        type: 'box',
        name: 'SHIP_TOWER',
        minX: ox + L.shipTower.x - 7.0,
        maxX: ox + L.shipTower.x + 7.0,
        minZ: oz + L.shipTower.z - 7.0,
        maxZ: oz + L.shipTower.z + 7.0,
        minY: -5,
        maxY: L.shipTower.height + 10.0
      },

      // 5. Starbase Factory / Mega Bay (solid hangar walls)
      {
        type: 'box',
        name: 'MEGA_BAY_FACTORY',
        minX: ox + L.factory.x - L.factory.width * 0.5,
        maxX: ox + L.factory.x + L.factory.width * 0.5,
        minZ: oz + L.factory.z - L.factory.depth * 0.5,
        maxZ: oz + L.factory.z + L.factory.depth * 0.5,
        minY: -5,
        maxY: 85.0
      },

      // 6. Cryogenic Tank Farm (Methane & LOX vertical cylinders & vacuum spheres)
      {
        type: 'cylinder',
        name: 'CRYO_TANK_LOX_1',
        x: ox - 58.0,
        z: oz - 110.0,
        radius: 9.0,
        minY: -5,
        maxY: 32.0
      },
      {
        type: 'cylinder',
        name: 'CRYO_TANK_LOX_2',
        x: ox - 82.0,
        z: oz - 110.0,
        radius: 9.0,
        minY: -5,
        maxY: 32.0
      },
      {
        type: 'cylinder',
        name: 'CRYO_TANK_CH4_1',
        x: ox - 58.0,
        z: oz - 138.0,
        radius: 9.0,
        minY: -5,
        maxY: 32.0
      },
      {
        type: 'cylinder',
        name: 'CRYO_TANK_CH4_2',
        x: ox - 82.0,
        z: oz - 138.0,
        radius: 9.0,
        minY: -5,
        maxY: 32.0
      },
      {
        type: 'cylinder',
        name: 'CRYO_SPHERE_1',
        x: ox - 112.0,
        z: oz - 124.0,
        radius: 11.5,
        minY: -5,
        maxY: 28.0
      },

      // 7. Physical Launch Control Pedestal
      {
        type: 'cylinder',
        name: 'LAUNCH_PEDESTAL',
        x: ox - 38.0,
        z: oz - 38.0,
        radius: 2.2,
        minY: -5,
        maxY: 6.0
      },

      // 8. Erector Base
      {
        type: 'cylinder',
        name: 'ERECTOR_BASE',
        x: ox + L.erector.x,
        z: oz + L.erector.z,
        radius: 7.0,
        minY: -5,
        maxY: 22.0
      }
    ];

    // Conveyor support piers
    for (let i = 0; i < L.conveyor.path.length; i++) {
      const p = L.conveyor.path[i];
      this.obstacles.push({
        type: 'cylinder',
        name: `CONVEYOR_PIER_${i}`,
        x: ox + p.x,
        z: oz + p.z,
        radius: 2.8,
        minY: -5,
        maxY: L.conveyor.beltY + 2.0
      });
    }
  }

  // Resolves a circle/sphere against all obstacles in XZ.
  // Returns { nx, nz, pen, hit: true } if collision was detected, or null.
  resolve(position, radius = 1.0, currentY = 0) {
    let hitAny = false;
    let totalNx = 0;
    let totalNz = 0;
    let maxPen = 0;

    for (const obs of this.obstacles) {
      // Height check
      if (currentY !== undefined && (currentY < obs.minY || currentY > obs.maxY)) {
        continue;
      }

      if (obs.type === 'cylinder') {
        const dx = position.x - obs.x;
        const dz = position.z - obs.z;
        const distSq = dx * dx + dz * dz;
        const minSafeDist = obs.radius + radius;
        if (distSq < minSafeDist * minSafeDist) {
          const dist = Math.sqrt(distSq) || 0.001;
          const pen = minSafeDist - dist;
          const nx = dx / dist;
          const nz = dz / dist;
          position.x += nx * pen;
          position.z += nz * pen;
          totalNx += nx;
          totalNz += nz;
          maxPen = Math.max(maxPen, pen);
          hitAny = true;
        }
      } else if (obs.type === 'box') {
        // Nearest point on AABB
        const clampedX = THREE.MathUtils.clamp(position.x, obs.minX, obs.maxX);
        const clampedZ = THREE.MathUtils.clamp(position.z, obs.minZ, obs.maxZ);
        const dx = position.x - clampedX;
        const dz = position.z - clampedZ;
        const distSq = dx * dx + dz * dz;

        // Inside the box
        if (position.x >= obs.minX && position.x <= obs.maxX &&
            position.z >= obs.minZ && position.z <= obs.maxZ) {
          const toMinX = position.x - obs.minX;
          const toMaxX = obs.maxX - position.x;
          const toMinZ = position.z - obs.minZ;
          const toMaxZ = obs.maxZ - position.z;
          const minEdge = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);

          let nx = 0;
          let nz = 0;
          let pen = minEdge + radius;
          if (minEdge === toMinX) { nx = -1; position.x = obs.minX - radius; }
          else if (minEdge === toMaxX) { nx = 1; position.x = obs.maxX + radius; }
          else if (minEdge === toMinZ) { nz = -1; position.z = obs.minZ - radius; }
          else { nz = 1; position.z = obs.maxZ + radius; }

          totalNx += nx;
          totalNz += nz;
          maxPen = Math.max(maxPen, pen);
          hitAny = true;
        } else if (distSq < radius * radius) {
          // Outside but touching corner/edge
          const dist = Math.sqrt(distSq) || 0.001;
          const pen = radius - dist;
          const nx = dx / dist;
          const nz = dz / dist;
          position.x += nx * pen;
          position.z += nz * pen;
          totalNx += nx;
          totalNz += nz;
          maxPen = Math.max(maxPen, pen);
          hitAny = true;
        }
      }
    }

    if (hitAny) {
      const len = Math.hypot(totalNx, totalNz) || 1.0;
      return {
        hit: true,
        nx: totalNx / len,
        nz: totalNz / len,
        pen: maxPen
      };
    }
    return null;
  }
}
