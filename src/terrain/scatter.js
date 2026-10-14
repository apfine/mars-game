import * as THREE from 'three';
import { getMarsHeight, simplex2D } from './noise.js';

// Deterministic Pseudo-Random Hash for Sector Seeding
function hash21(x, z) {
  const p = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return p - Math.floor(p);
}

// Fixed-Position Mars Geological Rock Scatter & Authentic Exploration Monuments
export class MarsScatterManager {
  constructor(scene) {
    this.scene = scene;
    
    // Chunk-based Rock Scatter parameters
    this.sectorSize = 60.0; // 60m x 60m per scatter sector
    this.sectorRadius = 4;  // 9x9 = 81 active sectors around player (~540m diameter)
    this.rocksPerSector = 14; // Deterministic rock instances per sector
    this.maxInstances = 81 * this.rocksPerSector; // ~1134 rocks permanently anchored

    this.activeSectors = new Map();
    this.freeSlotIndices = [];
    for (let i = 0; i < this.maxInstances; i++) {
      this.freeSlotIndices.push(i);
    }

    this.initRockMeshes();
    this.initHistoricalMonuments();
  }

  initRockMeshes() {
    // 1. Natural faceted basalt boulders & sedimentary rock slabs (as seen in NASA reference)
    const rockGeo = new THREE.DodecahedronGeometry(0.9, 1);

    // Weathered Mars iron-oxide & basalt rock material
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x5a3428,
      roughness: 0.92,
      metalness: 0.08,
      flatShading: true
    });

    this.instancedRocks = new THREE.InstancedMesh(rockGeo, rockMat, this.maxInstances);
    this.instancedRocks.castShadow = true;
    this.instancedRocks.receiveShadow = true;

    // Initialize all matrices to hidden
    this.dummy = new THREE.Object3D();
    this.dummy.position.set(0, -9999, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();

    for (let i = 0; i < this.maxInstances; i++) {
      this.instancedRocks.setMatrixAt(i, this.dummy.matrix);
    }
    this.instancedRocks.instanceMatrix.needsUpdate = true;

    this.scene.add(this.instancedRocks);
  }

  initHistoricalMonuments() {
    this.poiGroup = new THREE.Group();
    this.scene.add(this.poiGroup);
    this.activePoiMeshes = new Map();

    // Authentic Real Martian Surface Monuments & Historic Exploration Landing Sites
    this.monumentCatalog = [
      {
        id: 'perseverance_jezero',
        name: 'Perseverance & Ingenuity (Jezero Crater)',
        type: 'PERSEVERANCE',
        coords: new THREE.Vector2(380, 520)
      },
      {
        id: 'curiosity_gale',
        name: 'Curiosity Rover (Gale Crater / Mt Sharp)',
        type: 'CURIOSITY',
        coords: new THREE.Vector2(-650, 420)
      },
      {
        id: 'opportunity_meridiani',
        name: 'Opportunity Memorial & Heat Shield (Meridiani Planum)',
        type: 'OPPORTUNITY',
        coords: new THREE.Vector2(-420, -780)
      },
      {
        id: 'viking1_chryse',
        name: 'Viking 1 Lander (Chryse Planitia - 1976)',
        type: 'VIKING_1',
        coords: new THREE.Vector2(850, -420)
      },
      {
        id: 'pathfinder_ares',
        name: 'Pathfinder & Sojourner (Ares Vallis)',
        type: 'PATHFINDER',
        coords: new THREE.Vector2(-950, -320)
      },
      {
        id: 'olympus_mons_base',
        name: 'Olympus Mons Caldera Observation Outpost',
        type: 'OLYMPUS_BASE',
        coords: new THREE.Vector2(1200, 1100)
      },
      {
        id: 'valles_marineris_relay',
        name: 'Valles Marineris Canyon Comms Relay',
        type: 'VALLES_RELAY',
        coords: new THREE.Vector2(-1350, 950)
      }
    ];

    // Compute actual 3D ground elevations for all monuments
    for (const m of this.monumentCatalog) {
      m.position = new THREE.Vector3(
        m.coords.x,
        getMarsHeight(m.coords.x, m.coords.y),
        m.coords.y
      );
    }
  }

  createMonumentMesh(monument) {
    const group = new THREE.Group();
    group.position.copy(monument.position);

    const metalDark = new THREE.MeshStandardMaterial({ color: 0x24262b, metalness: 0.85, roughness: 0.3 });
    const goldFoil = new THREE.MeshStandardMaterial({ color: 0xf5b800, metalness: 0.9, roughness: 0.2 });
    const whiteChassis = new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 0.4, roughness: 0.4 });
    const solarBlue = new THREE.MeshStandardMaterial({ color: 0x0e2038, metalness: 0.9, roughness: 0.2 });

    if (monument.type === 'PERSEVERANCE') {
      // Perseverance Rover Model
      const bodyGeo = new THREE.BoxGeometry(2.4, 0.8, 3.0);
      const body = new THREE.Mesh(bodyGeo, whiteChassis);
      body.position.y = 1.1;
      group.add(body);

      // SuperCam Remote Sensing Mast
      const mastGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8);
      const mast = new THREE.Mesh(mastGeo, metalDark);
      mast.position.set(0.6, 2.0, 1.0);
      group.add(mast);

      // RTG Nuclear Power Generator on rear
      const rtgGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 12);
      rtgGeo.rotateZ(Math.PI / 2);
      const rtg = new THREE.Mesh(rtgGeo, metalDark);
      rtg.position.set(0, 1.3, -1.6);
      group.add(rtg);

      // Ingenuity Mars Helicopter parked 4 meters beside Perseverance!
      const heliGroup = new THREE.Group();
      heliGroup.position.set(4.2, 0.1, 1.5);

      const heliBodyGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
      const heliBody = new THREE.Mesh(heliBodyGeo, goldFoil);
      heliBody.position.y = 0.55;
      heliGroup.add(heliBody);

      // Dual counter-rotating carbon rotor blades
      const rotorGeo = new THREE.BoxGeometry(1.4, 0.02, 0.12);
      const rotor1 = new THREE.Mesh(rotorGeo, metalDark);
      rotor1.position.y = 0.85;
      heliGroup.add(rotor1);

      const rotor2 = new THREE.Mesh(rotorGeo, metalDark);
      rotor2.position.y = 0.95;
      rotor2.rotation.y = Math.PI / 2;
      heliGroup.add(rotor2);

      // Helicopter landing carbon legs
      for (let leg = 0; leg < 4; leg++) {
        const legAngle = (leg / 4) * Math.PI * 2 + Math.PI / 4;
        const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6);
        const lMesh = new THREE.Mesh(legGeo, metalDark);
        lMesh.position.set(Math.cos(legAngle) * 0.35, 0.3, Math.sin(legAngle) * 0.35);
        lMesh.rotation.z = Math.cos(legAngle) * 0.4;
        lMesh.rotation.x = Math.sin(legAngle) * 0.4;
        heliGroup.add(lMesh);
      }
      group.add(heliGroup);

      // Navigation Beacon Light
      const beaconLight = new THREE.PointLight(0x00f0ff, 3, 30);
      beaconLight.position.set(0.6, 3.0, 1.0);
      group.add(beaconLight);

    } else if (monument.type === 'OPPORTUNITY') {
      // Opportunity Rover with wide outstretched solar wing petals
      const bodyGeo = new THREE.BoxGeometry(1.6, 0.6, 2.0);
      const body = new THREE.Mesh(bodyGeo, whiteChassis);
      body.position.y = 0.8;
      group.add(body);

      // Solar Wings (Gull-wing layout)
      const wingGeo = new THREE.BoxGeometry(3.2, 0.05, 2.2);
      const wing = new THREE.Mesh(wingGeo, solarBlue);
      wing.position.set(0, 1.15, 0);
      group.add(wing);

      // Pancam Mast
      const mastGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8);
      const mast = new THREE.Mesh(mastGeo, metalDark);
      mast.position.set(0.4, 1.8, 0.7);
      group.add(mast);

      // "Heat Shield Rock" meteorite beside Opportunity
      const metGeo = new THREE.DodecahedronGeometry(1.4, 1);
      const metMat = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.95, metalness: 0.3 });
      const metMesh = new THREE.Mesh(metGeo, metMat);
      metMesh.position.set(-3.5, 0.8, -1.0);
      group.add(metMesh);

      const beaconLight = new THREE.PointLight(0xffb800, 2.5, 25);
      beaconLight.position.set(0, 2.4, 0);
      group.add(beaconLight);

    } else if (monument.type === 'VIKING_1') {
      // Historic Viking 1 Hexagonal Lander Body
      const hexGeo = new THREE.CylinderGeometry(1.6, 1.8, 0.8, 6);
      const hexBody = new THREE.Mesh(hexGeo, whiteChassis);
      hexBody.position.y = 1.0;
      group.add(hexBody);

      // 3 Inverted-V Landing Legs with shock footpads
      for (let l = 0; l < 3; l++) {
        const theta = (l / 3) * Math.PI * 2;
        const legPillarGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.4, 8);
        const leg = new THREE.Mesh(legPillarGeo, metalDark);
        leg.position.set(Math.cos(theta) * 1.5, 0.6, Math.sin(theta) * 1.5);
        leg.rotation.z = Math.cos(theta) * 0.5;
        leg.rotation.x = Math.sin(theta) * 0.5;
        group.add(leg);

        const padGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 12);
        const pad = new THREE.Mesh(padGeo, whiteChassis);
        pad.position.set(Math.cos(theta) * 2.0, 0.08, Math.sin(theta) * 2.0);
        group.add(pad);
      }

      // Parabolic Dish Antenna
      const dishGeo = new THREE.SphereGeometry(0.65, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.4);
      const dish = new THREE.Mesh(dishGeo, goldFoil);
      dish.position.set(0, 1.8, 0);
      dish.rotation.x = Math.PI * 0.3;
      group.add(dish);

      const beaconLight = new THREE.PointLight(0xff3344, 3, 30);
      beaconLight.position.set(0, 2.6, 0);
      group.add(beaconLight);

    } else if (monument.type === 'OLYMPUS_BASE' || monument.type === 'VALLES_RELAY') {
      // High-Tech Expedition Research Dome & Comms Tower
      const domeGeo = new THREE.SphereGeometry(6.5, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const domeMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3, metalness: 0.7 });
      const dome = new THREE.Mesh(domeGeo, domeMat);
      group.add(dome);

      // Lattice Communication Tower
      const towerGeo = new THREE.CylinderGeometry(0.3, 0.8, 16, 6);
      const tower = new THREE.Mesh(towerGeo, metalDark);
      tower.position.set(10.0, 8.0, 0);
      group.add(tower);

      const beaconLight = new THREE.PointLight(0x00f0ff, 5, 50);
      beaconLight.position.set(10.0, 16.5, 0);
      group.add(beaconLight);

    } else {
      // Generic Curiosity / Pathfinder Chassis
      const boxGeo = new THREE.BoxGeometry(2.2, 0.8, 2.6);
      const box = new THREE.Mesh(boxGeo, whiteChassis);
      box.position.y = 0.9;
      group.add(box);

      const beaconLight = new THREE.PointLight(0x00ff88, 3, 25);
      beaconLight.position.set(0, 2.0, 0);
      group.add(beaconLight);
    }

    return group;
  }

  // Populate deterministic rocks in a sector (never move, never disappear)
  populateSectorRocks(sx, sz) {
    const key = `${sx},${sz}`;
    if (this.activeSectors.has(key)) return;
    if (this.freeSlotIndices.length < this.rocksPerSector) return;

    const sectorStartX = sx * this.sectorSize;
    const sectorStartZ = sz * this.sectorSize;
    const allocatedSlots = [];

    for (let r = 0; r < this.rocksPerSector; r++) {
      const slot = this.freeSlotIndices.pop();
      allocatedSlots.push(slot);

      // Deterministic pseudo-random placement inside sector
      const h1 = hash21(sx * 13.7 + r * 3.3, sz * 19.1 + r * 7.7);
      const h2 = hash21(sx * 41.3 + r * 9.1, sz * 23.5 + r * 5.3);
      const h3 = hash21(sx * 7.9 + r * 11.2, sz * 67.1 + r * 1.4);

      const worldX = sectorStartX + h1 * this.sectorSize;
      const worldZ = sectorStartZ + h2 * this.sectorSize;
      const worldY = getMarsHeight(worldX, worldZ);

      // Diverse geological rock shapes (flat sedimentary slabs like NASA photo, craggy boulders)
      const isSlab = (h3 < 0.45); // 45% flat bedrock slabs
      const baseScale = 0.4 + h3 * 1.1;

      const scaleX = baseScale * (isSlab ? 1.8 : 1.0) * (0.8 + h1 * 0.4);
      const scaleY = baseScale * (isSlab ? 0.35 : 0.75); // Flattened slab thickness
      const scaleZ = baseScale * (isSlab ? 1.8 : 1.0) * (0.8 + h2 * 0.4);

      this.dummy.position.set(worldX, worldY + scaleY * 0.4, worldZ);
      this.dummy.rotation.set(h1 * Math.PI, h2 * Math.PI * 2, h3 * Math.PI * 0.3);
      this.dummy.scale.set(scaleX, scaleY, scaleZ);
      this.dummy.updateMatrix();

      this.instancedRocks.setMatrixAt(slot, this.dummy.matrix);
    }

    this.activeSectors.set(key, { sx, sz, slots: allocatedSlots });
    this.instancedRocks.instanceMatrix.needsUpdate = true;
  }

  releaseSectorRocks(key) {
    const sector = this.activeSectors.get(key);
    if (!sector) return;

    // Reset instance matrices to hidden
    this.dummy.position.set(0, -9999, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();

    for (const slot of sector.slots) {
      this.instancedRocks.setMatrixAt(slot, this.dummy.matrix);
      this.freeSlotIndices.push(slot);
    }

    this.activeSectors.delete(key);
    this.instancedRocks.instanceMatrix.needsUpdate = true;
  }

  update(playerPos) {
    const centerSx = Math.floor(playerPos.x / this.sectorSize);
    const centerSz = Math.floor(playerPos.z / this.sectorSize);
    const neededKeys = new Set();

    // 1. Maintain active deterministic rock sectors around player
    for (let dx = -this.sectorRadius; dx <= this.sectorRadius; dx++) {
      for (let dz = -this.sectorRadius; dz <= this.sectorRadius; dz++) {
        const sx = centerSx + dx;
        const sz = centerSz + dz;
        const key = `${sx},${sz}`;
        neededKeys.add(key);

        if (!this.activeSectors.has(key)) {
          this.populateSectorRocks(sx, sz);
        }
      }
    }

    // Release distant sectors smoothly
    for (const [key, sector] of this.activeSectors.entries()) {
      if (!neededKeys.has(key)) {
        this.releaseSectorRocks(key);
      }
    }

    // 2. Stream Real Historical Mars Monuments
    const activeMonumentDist = 1800.0;
    for (const mon of this.monumentCatalog) {
      const dist = playerPos.distanceTo(mon.position);
      if (dist < activeMonumentDist) {
        if (!this.activePoiMeshes.has(mon.id)) {
          const meshGroup = this.createMonumentMesh(mon);
          this.poiGroup.add(meshGroup);
          this.activePoiMeshes.set(mon.id, { monument: mon, mesh: meshGroup });
        }
      } else {
        if (this.activePoiMeshes.has(mon.id)) {
          const item = this.activePoiMeshes.get(mon.id);
          this.poiGroup.remove(item.mesh);
          this.activePoiMeshes.delete(mon.id);
        }
      }
    }
  }

  getNearbyPOIs(playerPos, maxDist = 8000) {
    const list = [];
    for (const mon of this.monumentCatalog) {
      const dist = playerPos.distanceTo(mon.position);
      if (dist < maxDist) {
        list.push({
          id: mon.id,
          name: mon.name,
          position: mon.position,
          distance: dist
        });
      }
    }
    return list;
  }
}
