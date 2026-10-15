import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getMarsHeight, getMarsNormal, simplex2D } from './noise.js';
import { createHabitat, createRelayStation } from './habitat.js';

// Deterministic Pseudo-Random Hash for Sector Seeding
function hash21(x, z) {
  const p = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return p - Math.floor(p);
}

// Per-sector seeded PRNG (mulberry32). Same sector + same world seed always gives the same rocks,
// but each run uses a new world seed so the layout is never predictable.
function makeRng(sx, sz, worldSeed) {
  let a = (Math.imul(sx | 0, 374761393) + Math.imul(sz | 0, 668265263) + Math.imul(worldSeed | 0, 2246822519)) | 0;
  a ^= a >>> 13;
  a = Math.imul(a, 1274126177);
  a ^= a >>> 16;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Jitter a geometry's vertices with seeded noise for irregular, faceted rock shapes
function roughen(geo, seed, amount, freq = 1.7) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = simplex2D(v.x * freq + seed, v.y * freq + v.z * freq * 0.8 - seed);
    const n2 = simplex2D(v.z * freq * 2.3 - seed, v.x * freq * 2.3 + v.y * 1.7 + seed);
    const k = 1.0 + (n * 0.65 + n2 * 0.35) * amount;
    v.multiplyScalar(k);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function merged(parts) {
  const list = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of list) {
    // keep only attributes shared by all parts
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
  }
  const out = mergeGeometries(list, false);
  out.computeVertexNormals();
  return out;
}

// Fixed-Position Mars Geological Rock Scatter & Authentic Exploration Monuments
export class MarsScatterManager {
  constructor(scene) {
    this.scene = scene;
    this.worldSeed = (Math.random() * 1e9) | 0;
    
    // Chunk-based Rock Scatter parameters (optimized for instant loading & 60fps)
    this.sectorSize = 60.0; // 60m x 60m per scatter sector
    this.sectorRadius = 3;  // 7x7 = 49 active sectors (~420m diameter)
    this.maxRocksPerSector = 16;

    this.activeSectors = new Map();
    this.pendingSectors = [];
    this.lastPlayerSx = NaN;
    this.lastPlayerSz = NaN;
    this.initializedSectors = false;

    this.initRockMeshes();
    this.initHistoricalMonuments();
  }

  buildRockGeometries() {
    const geos = [];

    // 0. Angular faceted boulder
    geos.push(roughen(new THREE.IcosahedronGeometry(0.9, 1), 3.1, 0.55, 1.4));

    // 1. Flat sedimentary slab with chipped corners
    {
      const g = new THREE.BoxGeometry(2.0, 0.42, 1.5, 4, 1, 3);
      roughen(g, 7.7, 0.28, 1.2);
      geos.push(g);
    }

    // 2. Smooth wind-rounded stone
    geos.push(roughen(new THREE.IcosahedronGeometry(0.85, 1), 11.3, 0.22, 0.9));

    // 3. Tall wind-carved shard (ventifact)
    {
      const g = new THREE.CylinderGeometry(0.18, 0.75, 1.9, 6, 3);
      g.translate(0, 0.35, 0);
      roughen(g, 19.9, 0.35, 1.3);
      geos.push(g);
    }

    // 4. Pebble cluster: a handful of small stones close together
    {
      const parts = [];
      const rng = makeRng(5, 9, 1234);
      for (let i = 0; i < 7; i++) {
        const s = 0.14 + rng() * 0.30;
        const p = new THREE.IcosahedronGeometry(s, 0);
        roughen(p, i * 3.7, 0.4, 3.0);
        p.translate((rng() - 0.5) * 1.6, s * 0.35, (rng() - 0.5) * 1.6);
        parts.push(p);
      }
      geos.push(merged(parts));
    }

    // 5. Stacked layered outcrop (2-3 offset slabs, like eroded bedrock)
    {
      const parts = [];
      const rng = makeRng(2, 4, 4321);
      let y = 0;
      const layers = 3;
      for (let i = 0; i < layers; i++) {
        const w = 1.9 - i * 0.45 + rng() * 0.25;
        const d = 1.4 - i * 0.3 + rng() * 0.2;
        const h = 0.24 + rng() * 0.16;
        const b = new THREE.BoxGeometry(w, h, d, 2, 1, 2);
        roughen(b, 40 + i * 6.1, 0.2, 1.6);
        b.translate((rng() - 0.5) * 0.4, y + h * 0.5, (rng() - 0.5) * 0.3);
        parts.push(b);
        y += h * 0.92;
      }
      geos.push(merged(parts));
    }

    return geos;
  }

  initRockMeshes() {
    // Weathered Mars iron-oxide & basalt rock material; colour comes per-instance.
    // Dust-coated top faces are injected into the shader so upward-facing surfaces look sand-dusted.
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.93,
      metalness: 0.05,
      flatShading: true
    });
    rockMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         vec3 rockWorldN = inverseTransformDirection(normal, viewMatrix);
         float rockTop = smoothstep(0.45, 0.95, rockWorldN.y);
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.64, 0.40, 0.29), rockTop * 0.55);`
      );
    };

    const geos = this.buildRockGeometries();
    const perVariantCapacity = 560;

    this.rockMeshes = [];
    this.freeSlots = [];

    // Hidden-instance matrix
    this.dummy = new THREE.Object3D();
    this.dummy.position.set(0, -9999, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();

    for (let v = 0; v < geos.length; v++) {
      const mesh = new THREE.InstancedMesh(geos[v], rockMat, perVariantCapacity);
      mesh.castShadow = false; // thousands of instances: skipping the shadow pass is a big FPS win
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const white = new THREE.Color(1, 1, 1);
      const free = [];
      for (let i = 0; i < perVariantCapacity; i++) {
        mesh.setMatrixAt(i, this.dummy.matrix);
        mesh.setColorAt(i, white);
        free.push(perVariantCapacity - 1 - i);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      this.scene.add(mesh);
      this.rockMeshes.push(mesh);
      this.freeSlots.push(free);
    }
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
        id: 'starbase_launch_complex',
        name: 'Starbase Mars Launch Complex (Mechazilla)',
        type: 'STARBASE_COMPLEX',
        coords: new THREE.Vector2(1400, 1150)
      },
      {
        id: 'valles_marineris_relay',
        name: 'Valles Marineris Canyon Comms Relay',
        type: 'VALLES_RELAY',
        coords: new THREE.Vector2(-1350, 950)
      },
      {
        id: 'spirit_troy',
        name: 'Spirit Rover (Troy Sand Trap)',
        type: 'SPIRIT',
        coords: new THREE.Vector2(-250, -1150)
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

    const big = monument.type === 'OLYMPUS_BASE' || monument.type === 'VALLES_RELAY' || monument.type === 'STARBASE_COMPLEX';
    const accent = {
      PERSEVERANCE: 0x00f0ff,
      CURIOSITY: 0x00ff9c,
      OPPORTUNITY: 0xffb800,
      VIKING_1: 0xff4466,
      PATHFINDER: 0x7cffcb,
      OLYMPUS_BASE: 0x4cc9ff,
      VALLES_RELAY: 0xb78cff,
      SPIRIT: 0xffd34d,
      STARBASE_COMPLEX: 0xff0055
    }[monument.type] || 0x00f0ff;

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
        if (!big) group.add(pad);
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

    } else if (monument.type === 'OLYMPUS_BASE') {
      // Full research habitat modelled on the reference render
      const hab = createHabitat();
      monument.colliders = hab.colliders;
      group.add(hab.group);

    } else if (monument.type === 'VALLES_RELAY') {
      const relay = createRelayStation();
      monument.colliders = relay.colliders;
      group.add(relay.group);

    } else if (monument.type === 'STARBASE_COMPLEX') {
      // 3D Launch complex is rendered by StarshipMissionVehicle
      monument.colliders = [
        [0, 0, 16],
        [-22, 0, 10]
      ];
      const beaconLight = new THREE.PointLight(0xff0055, 3.5, 45);
      beaconLight.position.set(0, 12, 0);
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

    // Rover-class landmarks get six rocker-bogie style wheels and suspension arms
    if (['PERSEVERANCE', 'OPPORTUNITY', 'CURIOSITY', 'PATHFINDER', 'SPIRIT'].includes(monument.type)) {
      const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.42, 20);
      wheelGeo.rotateZ(Math.PI / 2);
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0xa79b90, metalness: 0.85, roughness: 0.45 });
      const wheelX = monument.type === 'PERSEVERANCE' ? 1.45 : 1.2;
      for (const sx of [-1, 1]) {
        for (const wz of [-1.35, 0, 1.35]) {
          const wheel = new THREE.Mesh(wheelGeo, wheelMat);
          wheel.position.set(sx * wheelX, 0.5, wz);
          wheel.castShadow = true;
          group.add(wheel);
        }
        const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.9), metalDark);
        rocker.position.set(sx * (wheelX - 0.25), 0.85, 0);
        rocker.rotation.x = 0.1 * sx;
        group.add(rocker);
      }
    }

    if (monument.type === 'SPIRIT') { group.rotation.z = 0.14; group.rotation.x = -0.09; group.position.y -= 0.35; }

    // Checkpoint dressing: landing pad, glowing ring, tall beam (visible through haze) and spinning halos
    const padR = big ? 13 : 6.5;
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(padR, padR + 0.5, 1.4, 48),
      new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.7, metalness: 0.5 })
    );
    pad.position.y = -0.35;
    pad.receiveShadow = true;
    if (!big) group.add(pad);
    const glowMat = new THREE.MeshBasicMaterial({ color: accent, fog: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(padR - 0.45, padR - 0.15, 64).rotateX(-Math.PI / 2), glowMat);
    ring.position.y = 0.37;
    if (!big) group.add(ring);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.2), glowMat);
      lamp.position.set(Math.cos(a) * (padR - 1.0), 0.38, Math.sin(a) * (padR - 1.0));
      lamp.rotation.y = -a;
      if (!big) group.add(lamp);
    }
    const anchor = monument.type === 'OLYMPUS_BASE' ? [-8, 0] : monument.type === 'VALLES_RELAY' ? [14, 2] : [0, 0];
    const fx = new THREE.Group();
    fx.position.set(anchor[0], 0, anchor[1]);
    group.add(fx);
    const beamMat = new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.2, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, big ? 2.4 : 1.6, 160, 24, 1, true), beamMat);
    beam.position.y = 80;
    fx.add(beam);
    const halos = [];
    for (let i = 0; i < 3; i++) {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(big ? 5.5 - i * 0.6 : 3.4 - i * 0.5, 0.07, 8, 48).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.85, fog: false })
      );
      fx.add(halo);
      halos.push(halo);
    }
    group.userData.checkpoint = { halos, beamMat, glowMat, base: big ? 7 : 3.4 };

    return group;
  }

  animateCheckpoint(group, t) {
    const cp = group.userData.checkpoint;
    if (!cp) return;
    cp.halos.forEach((h, i) => {
      h.position.y = 2.0 + i * 1.3 + Math.sin(t * 1.6 + i * 2.1) * 0.35;
      h.rotation.y = t * (0.8 + i * 0.4);
      h.scale.setScalar(1 + 0.06 * Math.sin(t * 2.4 + i));
    });
    cp.beamMat.opacity = 0.16 + 0.07 * Math.sin(t * 2.0);
  }

  // Populate deterministic rocks in a sector (never move, never disappear).
  // Placement is driven by a per-run world seed, regional noise fields (rock fields,
  // flagstone pavements, gravel, bare sand) and random clusters so no two areas look alike.
  populateSectorRocks(sx, sz) {
    const key = `${sx},${sz}`;
    if (this.activeSectors.has(key)) return;

    const rnd = makeRng(sx, sz, this.worldSeed);
    const sectorStartX = sx * this.sectorSize;
    const sectorStartZ = sz * this.sectorSize;
    const centerX = sectorStartX + this.sectorSize * 0.5;
    const centerZ = sectorStartZ + this.sectorSize * 0.5;

    // Regional fields (low frequency): overall density, and rock "personality"
    const so = this.worldSeed * 0.0001;
    const densityNoise = simplex2D(centerX * 0.0032 + so, centerZ * 0.0032 - so);
    const regionNoise = simplex2D(centerX * 0.0055 - so * 2.0, centerZ * 0.0055 + so * 1.3);
    const fineNoise = simplex2D(centerX * 0.02 + so, centerZ * 0.02 + so * 3.0);

    let density = THREE.MathUtils.smoothstep(densityNoise + fineNoise * 0.25, -0.65, 0.85);
    density = Math.pow(density, 1.25);
    // Some sectors are completely bare sand, a few are dense rock fields
    const wildcard = rnd();
    if (wildcard < 0.10) density *= 0.1;
    else if (wildcard > 0.93) density = Math.min(1.0, density + 0.55);

    let count = Math.round(1 + density * 20 + rnd() * 3);
    if (count > this.maxRocksPerSector) count = this.maxRocksPerSector;

    // Random cluster centres inside the sector
    const nClusters = 1 + Math.floor(rnd() * 3);
    const clusters = [];
    for (let c = 0; c < nClusters; c++) {
      clusters.push({
        x: sectorStartX + rnd() * this.sectorSize,
        z: sectorStartZ + rnd() * this.sectorSize,
        spread: 4 + rnd() * 14
      });
    }

    // Region -> variant weights: flagstone pavement vs boulder field vs gravel
    const region = regionNoise;
    const w = [
      /* 0 angular boulder */ 1.0 + (region > 0.25 ? 1.6 : 0),
      /* 1 flat slab       */ 0.9 + (region < -0.1 ? 2.0 : 0),
      /* 2 rounded stone   */ 0.8 + (region > -0.2 && region < 0.25 ? 0.6 : 0),
      /* 3 tall shard      */ 0.35 + (region > 0.45 ? 0.9 : 0),
      /* 4 pebble cluster  */ 0.9 + (fineNoise > 0.2 ? 1.6 : 0),
      /* 5 stacked layers  */ 0.45 + (region < -0.3 ? 1.1 : 0)
    ];
    let wTotal = 0;
    for (const x of w) wTotal += x;

    const slots = [];
    const cols = [];
    const dummy = this.dummy;
    const quat = new THREE.Quaternion();
    const quatYaw = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();

    for (let r = 0; r < count; r++) {
      // Position: 65% clustered around random centres, remainder scattered
      let wx, wz;
      if (rnd() < 0.65) {
        const cl = clusters[Math.floor(rnd() * clusters.length)];
        const g = (rnd() + rnd() + rnd() - 1.5) * 2.0;
        const g2 = (rnd() + rnd() + rnd() - 1.5) * 2.0;
        wx = cl.x + g * cl.spread;
        wz = cl.z + g2 * cl.spread;
      } else {
        wx = sectorStartX + rnd() * this.sectorSize;
        wz = sectorStartZ + rnd() * this.sectorSize;
      }

      // Keep spawn pad and landmarks clear
      if (wx * wx + wz * wz < 100) continue;
      let nearPoi = false;
      for (const m of this.monumentCatalog) {
        const dx = wx - m.coords.x;
        const dz = wz - m.coords.y;
        const clr = m.type === 'OLYMPUS_BASE' ? 3600 : m.type === 'VALLES_RELAY' ? 900 : 144;
        if (dx * dx + dz * dz < clr) { nearPoi = true; break; }
      }
      if (nearPoi) continue;

      // Pick shape variant
      let pick = rnd() * wTotal;
      let variant = 0;
      for (let v = 0; v < w.length; v++) {
        pick -= w[v];
        if (pick <= 0) { variant = v; break; }
      }

      const mesh = this.rockMeshes[variant];
      const free = this.freeSlots[variant];
      if (free.length === 0) continue;
      const slot = free.pop();

      // Heavy-tailed size distribution: mostly small, rare big boulders, very rare monoliths
      const sr = rnd();
      let size = 0.22 + Math.pow(sr, 3.4) * 2.8 * (0.6 + rnd() * 0.8);
      if (variant === 4) size = 0.5 + rnd() * 0.9;     // pebble clusters are authored small
      if (rnd() > 0.995) size *= 2.6;                  // rare monolith
      // Non-uniform stretch so no two rocks look alike
      const sxs = size * (0.7 + rnd() * 0.75);
      const sys = size * (0.6 + rnd() * 0.8);
      const szs = size * (0.7 + rnd() * 0.75);

      const wy = getMarsHeight(wx, wz);

      // Orientation
      quatYaw.setFromAxisAngle(up, rnd() * Math.PI * 2);
      if (variant === 1 || variant === 5 || variant === 4) {
        // Slabs & stacks lie roughly flat on the surface (follow terrain), small random tilt
        const n = getMarsNormal(wx, wz);
        n.x += (rnd() - 0.5) * 0.18;
        n.z += (rnd() - 0.5) * 0.18;
        n.normalize();
        quat.setFromUnitVectors(up, n);
        quat.multiply(quatYaw);
      } else {
        dummy.rotation.set((rnd() - 0.5) * 1.1, 0, (rnd() - 0.5) * 1.1);
        quat.setFromEuler(dummy.rotation);
        quat.premultiply(quatYaw);
      }

      // Partial burial in sand
      const burial = (variant === 1 ? 0.25 : 0.08 + rnd() * 0.32) * sys;
      dummy.position.set(wx, wy - burial + sys * 0.35, wz);
      dummy.quaternion.copy(quat);
      dummy.scale.set(sxs, sys, szs);
      dummy.updateMatrix();
      mesh.setMatrixAt(slot, dummy.matrix);

      // Per-instance colour: rust-iron, dark basalt, tan sandstone, pale dusty
      const ct = rnd();
      if (ct < 0.34) col.setRGB(0.50, 0.28, 0.20);        // iron-rich rust
      else if (ct < 0.58) col.setRGB(0.24, 0.16, 0.14);   // dark basalt
      else if (ct < 0.82) col.setRGB(0.58, 0.40, 0.30);   // tan sandstone
      else if (ct < 0.94) col.setRGB(0.68, 0.50, 0.40);   // pale dust-coated
      else col.setRGB(0.36, 0.22, 0.24);                  // purple-ish hematite
      const lum = 0.8 + rnd() * 0.45;
      col.multiplyScalar(lum);
      mesh.setColorAt(slot, col);

      slots.push({ variant, slot });
      // Collision proxy (pebbles and low slabs are driven over, taller rocks are solid)
      const topH = sys * (variant === 1 ? 0.6 : variant === 5 ? 1.0 : 1.25) - burial;
      if (variant !== 4 && topH > 0.5) {
        cols.push({ x: wx, z: wz, r: Math.max(sxs, szs) * (variant === 3 ? 0.55 : 0.8), top: wy + topH });
      }
    }

    // Flag update once per affected variant outside the loop
    const touchedVariants = new Set(slots.map((s) => s.variant));
    for (const v of touchedVariants) {
      this.rockMeshes[v].instanceMatrix.needsUpdate = true;
      this.rockMeshes[v].instanceColor.needsUpdate = true;
    }

    this.activeSectors.set(key, { sx, sz, slots, cols });
  }

  releaseSectorRocks(key) {
    const sector = this.activeSectors.get(key);
    if (!sector) return;

    // Reset instance matrices to hidden
    this.dummy.position.set(0, -9999, 0);
    this.dummy.quaternion.identity();
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();

    const touched = new Set();
    for (const { variant, slot } of sector.slots) {
      const mesh = this.rockMeshes[variant];
      mesh.setMatrixAt(slot, this.dummy.matrix);
      this.freeSlots[variant].push(slot);
      touched.add(variant);
    }
    for (const v of touched) {
      this.rockMeshes[v].instanceMatrix.needsUpdate = true;
    }

    this.activeSectors.delete(key);
  }

  update(playerPos) {
    const centerSx = Math.floor(playerPos.x / this.sectorSize);
    const centerSz = Math.floor(playerPos.z / this.sectorSize);

    if (centerSx !== this.lastPlayerSx || centerSz !== this.lastPlayerSz) {
      this.lastPlayerSx = centerSx;
      this.lastPlayerSz = centerSz;

      const neededKeys = new Set();
      const candidates = [];

      // 1. Maintain active deterministic rock sectors around player
      for (let dx = -this.sectorRadius; dx <= this.sectorRadius; dx++) {
        for (let dz = -this.sectorRadius; dz <= this.sectorRadius; dz++) {
          const sx = centerSx + dx;
          const sz = centerSz + dz;
          const key = `${sx},${sz}`;
          neededKeys.add(key);

          if (!this.activeSectors.has(key)) {
            const distSq = dx * dx + dz * dz;
            candidates.push({ sx, sz, key, distSq });
          }
        }
      }

      // Sort candidate sectors closest first
      candidates.sort((a, b) => a.distSq - b.distSq);

      if (!this.initializedSectors) {
        this.initializedSectors = true;
        // On initial startup, immediately populate closest 9 sectors (radius 1)
        const immediate = candidates.filter((c) => c.distSq <= 2);
        const outer = candidates.filter((c) => c.distSq > 2);
        for (const item of immediate) {
          this.populateSectorRocks(item.sx, item.sz);
        }
        this.pendingSectors = outer;
      } else {
        this.pendingSectors = candidates;
      }

      // Release distant sectors smoothly
      for (const [key, sector] of this.activeSectors.entries()) {
        if (!neededKeys.has(key)) {
          this.releaseSectorRocks(key);
        }
      }
    }

    // Stream queued outer sectors smoothly (max 2 sectors per frame)
    if (this.pendingSectors.length > 0) {
      const budget = 2;
      for (let b = 0; b < budget && this.pendingSectors.length > 0; b++) {
        const item = this.pendingSectors.shift();
        if (!this.activeSectors.has(item.key)) {
          this.populateSectorRocks(item.sx, item.sz);
        }
      }
    }

    // 2. Stream Real Historical Mars Monuments
    const activeMonumentDist = 1800.0;
    for (const mon of this.monumentCatalog) {
      const dist = playerPos.distanceTo(mon.position);
      if (dist < activeMonumentDist) {
        if (this.activePoiMeshes.has(mon.id)) this.animateCheckpoint(this.activePoiMeshes.get(mon.id).mesh, performance.now() * 0.001);
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

  // Collision query used by vehicle physics: returns the deepest overlap as { nx, nz, pen } or null
  resolve(pos, radius, feetY) {
    const csx = Math.floor(pos.x / this.sectorSize);
    const csz = Math.floor(pos.z / this.sectorSize);
    let best = null;
    const test = (cx, cz, r, top) => {
      const dx = pos.x - cx, dz = pos.z - cz;
      const min = radius + r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || top <= feetY + 0.45) return;
      const d = Math.sqrt(d2) || 0.001;
      const pen = min - d;
      if (!best || pen > best.pen) best = { nx: dx / d, nz: dz / d, pen };
    };
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const sector = this.activeSectors.get(`${csx + i},${csz + j}`);
        if (!sector) continue;
        for (const c of sector.cols) test(c.x, c.z, c.r, c.top);
      }
    }
    for (const m of this.monumentCatalog) {
      if (m.colliders) {
        const ddx = pos.x - m.coords.x, ddz = pos.z - m.coords.y;
        if (ddx * ddx + ddz * ddz < 6400) for (const [rx, rz, rr] of m.colliders) test(m.coords.x + rx, m.coords.y + rz, rr, Infinity);
      } else {
        test(m.coords.x, m.coords.y, 2.6, Infinity);
      }
    }
    return best;
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
