import * as THREE from 'three';

// -------------------------------------------------------------
// SpaceX Starship + Super Heavy Stack & Expanded Mars Starbase
// Accurately reflects:
// 1. Orbital Launch Mount (OLM) & 145m Mechazilla Tower with functional Chopsticks (Ref Image 0, 1)
// 2. Super Heavy Booster with 33 Raptors, grid fins, and forward catch pins (Ref Image 1)
// 3. Starship upper stage with ogive nosecone, black ceramic heat shield, flaps, cargo bay doors & elevator crane (Ref Image 2, 3)
// 4. Expanded Mars Starbase with multiple landed Starships, open cargo bays, rover trailers, and cryo tanks (Ref Image 2, 3)
// 5. Vacuum "Space Jellyfish" twilight plume & hypersonic plasma sheath
// -------------------------------------------------------------

let _cachedSteelMaps = null;
function createSteelMaps() {
  if (_cachedSteelMaps) return _cachedSteelMaps;
  const c = document.createElement('canvas');
  const b = document.createElement('canvas');
  c.width = c.height = 512;
  b.width = b.height = 512;
  const g = c.getContext('2d');
  const bg = b.getContext('2d');

  // Base 304L cold-rolled stainless steel reflectance
  g.fillStyle = '#d8d7d3';
  g.fillRect(0, 0, 512, 512);
  bg.fillStyle = '#808080';
  bg.fillRect(0, 0, 512, 512);

  // Subtle barrel ring-by-ring reflectance variation (8 rings across 512px)
  const ringH = 64;
  for (let r = 0; r < 8; r++) {
    const shade = 210 + ((r * 17) % 18) - 8;
    g.fillStyle = `rgb(${shade}, ${shade + 1}, ${shade + 3})`;
    g.fillRect(0, r * ringH, 512, ringH);

    // Staggered vertical barrel panel weld seams
    const numPanels = 4;
    const offset = (r % 2) * 64;
    for (let p = 0; p < numPanels; p++) {
      const px = (p * (512 / numPanels) + offset) % 512;
      g.fillStyle = 'rgba(70, 74, 82, 0.55)';
      g.fillRect(px, r * ringH, 2, ringH);
      bg.fillStyle = '#404040';
      bg.fillRect(px, r * ringH, 2, ringH);
    }
  }

  // Fine anisotropic circumferential & vertical brushed grain
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const w = 1 + Math.random() * 2.5;
    const h = 18 + Math.random() * 60;
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.065)' : 'rgba(85,90,100,0.065)';
    g.fillRect(x, y, w, h);
    bg.fillStyle = Math.random() > 0.5 ? 'rgba(205,205,205,0.12)' : 'rgba(60,60,60,0.12)';
    bg.fillRect(x, y, w, h);
  }

  // Circumferential ring weld seams with heat-affected zone (HAZ) gold/blue tint
  for (let y = 0; y <= 512; y += ringH) {
    const hazGrad = g.createLinearGradient(0, y - 5, 0, y + 5);
    hazGrad.addColorStop(0, 'rgba(180, 165, 140, 0.0)');
    hazGrad.addColorStop(0.35, 'rgba(165, 145, 115, 0.28)');
    hazGrad.addColorStop(0.5, 'rgba(55, 60, 68, 0.78)');
    hazGrad.addColorStop(0.65, 'rgba(135, 150, 175, 0.25)');
    hazGrad.addColorStop(1, 'rgba(180, 165, 140, 0.0)');
    g.fillStyle = hazGrad;
    g.fillRect(0, y - 5, 512, 10);

    // Raised weld bead on bump map
    bg.fillStyle = '#d8d8d8';
    bg.fillRect(0, y - 1, 512, 2);
    bg.fillStyle = '#383838';
    bg.fillRect(0, y + 1, 512, 1);
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 7);

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 7);

  _cachedSteelMaps = { map, bumpMap };
  return _cachedSteelMaps;
}

let _cachedHeatshieldMaps = null;
function createHeatshieldMaps() {
  if (_cachedHeatshieldMaps) return _cachedHeatshieldMaps;
  const c = document.createElement('canvas');
  const b = document.createElement('canvas');
  c.width = c.height = 256;
  b.width = b.height = 256;
  const g = c.getContext('2d');
  const bg = b.getContext('2d');

  g.fillStyle = '#121317';
  g.fillRect(0, 0, 256, 256);
  bg.fillStyle = '#202020';
  bg.fillRect(0, 0, 256, 256);

  // Interlocking hexagonal TUFROC ceramic tiles with individual tile variation
  const r = 10;
  const h = r * Math.sqrt(3);
  let idx = 0;
  for (let y = -h; y < 256 + h; y += h) {
    for (let x = -r * 3; x < 256 + r * 3; x += r * 3) {
      drawHexTile(g, bg, x, y, r, idx++);
      drawHexTile(g, bg, x + r * 1.5, y + h / 2, r, idx++);
    }
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(5, 14);

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(5, 14);

  _cachedHeatshieldMaps = { map, bumpMap };
  return _cachedHeatshieldMaps;
}

function drawHexTile(g, bg, x, y, r, seed) {
  const shade = 18 + ((seed * 29) % 14);
  g.fillStyle = `rgb(${shade}, ${shade + 1}, ${shade + 3})`;
  g.strokeStyle = '#07080a';
  g.lineWidth = 1.4;

  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const px = x + (r - 0.5) * Math.cos(a);
    const py = y + (r - 0.5) * Math.sin(a);
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  g.stroke();

  // Raised ceramic pillow center in bump map with recessed expansion gap
  const bShade = 175 + ((seed * 13) % 35);
  bg.fillStyle = `rgb(${bShade}, ${bShade}, ${bShade})`;
  bg.strokeStyle = '#151515';
  bg.lineWidth = 1.8;
  bg.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const px = x + (r - 0.8) * Math.cos(a);
    const py = y + (r - 0.8) * Math.sin(a);
    if (i === 0) bg.moveTo(px, py);
    else bg.lineTo(px, py);
  }
  bg.closePath();
  bg.fill();
  bg.stroke();
}

export class StarshipMissionVehicle {
  constructor() {
    this.group = new THREE.Group();

    // High-Resolution Procedural PBR Textures & Bump Maps
    const steelMaps = createSteelMaps();
    const heatshieldMaps = createHeatshieldMaps();

    this.matSteel = new THREE.MeshStandardMaterial({
      map: steelMaps.map,
      bumpMap: steelMaps.bumpMap,
      bumpScale: 0.045,
      metalness: 0.94,
      roughness: 0.24,
      color: 0xf2f0ec
    });

    this.matHeatshield = new THREE.MeshStandardMaterial({
      map: heatshieldMaps.map,
      bumpMap: heatshieldMaps.bumpMap,
      bumpScale: 0.055,
      metalness: 0.16,
      roughness: 0.84,
      color: 0x16181c
    });

    this.matCryoFrost = new THREE.MeshStandardMaterial({
      map: steelMaps.map,
      bumpMap: steelMaps.bumpMap,
      bumpScale: 0.03,
      color: 0xeef5fc,
      metalness: 0.25,
      roughness: 0.72,
      transparent: true,
      opacity: 0.78
    });

    this.matDarkMetal = new THREE.MeshStandardMaterial({
      color: 0x24262c,
      metalness: 0.85,
      roughness: 0.4
    });

    this.matRaptorBell = new THREE.MeshStandardMaterial({
      color: 0x3d424b,
      metalness: 0.9,
      roughness: 0.35
    });

    this.matTower = new THREE.MeshStandardMaterial({
      color: 0x32353b,
      metalness: 0.75,
      roughness: 0.55
    });

    this.matGridFin = new THREE.MeshStandardMaterial({
      color: 0x1b1c20,
      metalness: 0.92,
      roughness: 0.45,
      wireframe: true
    });

    this.matConcrete = new THREE.MeshStandardMaterial({
      color: 0x48423c,
      roughness: 0.92,
      metalness: 0.1
    });

    this.matWhiteTank = new THREE.MeshStandardMaterial({
      color: 0xe6e4e0,
      roughness: 0.35,
      metalness: 0.65
    });

    this.matEmissiveLamp = new THREE.MeshBasicMaterial({ color: 0xfff0dd });

    // Build vehicle sub-assemblies
    this.boosterGroup = new THREE.Group();
    this.starshipGroup = new THREE.Group();
    this.launchPadGroup = new THREE.Group();
    this.launchTerminalGroup = new THREE.Group();

    this.group.add(this.launchPadGroup);
    this.group.add(this.launchTerminalGroup);
    this.group.add(this.boosterGroup);
    this.group.add(this.starshipGroup);

    this.buildLaunchComplex();
    this.buildLaunchTerminal();
    this.buildSuperHeavyBooster();
    this.buildStarship();
    this.buildFX();

    this.isMated = true;
    this.boosterActive = false;
    this.starshipEnginesActive = false;
    this.plasmaActive = false;
    this.jellyfishActive = false;
  }

  // -------------------------------------------------------------
  // 1. ORBITAL LAUNCH MOUNT (OLM), MECHAZILLA TOWER & EXPANDED STARBASE (Ref Images 0, 1, 2, 3)
  // -------------------------------------------------------------
  buildLaunchComplex() {
    const pad = this.launchPadGroup;

    // Primary Launch Pad 1 Concrete Foundation
    const padBaseGeo = new THREE.CylinderGeometry(32, 34, 3.5, 24);
    const padBase = new THREE.Mesh(padBaseGeo, this.matConcrete);
    padBase.position.y = 1.75;
    padBase.receiveShadow = true;
    pad.add(padBase);

    // OLM Base Ring Mount (elevates rocket 22m above ground)
    const tableRadius = 8.5;
    const tableHeight = 22.0;

    const ringGeo = new THREE.CylinderGeometry(tableRadius, tableRadius + 1.2, 4.0, 24);
    const ringMesh = new THREE.Mesh(ringGeo, this.matTower);
    ringMesh.position.y = tableHeight - 2.0;
    ringMesh.castShadow = ringMesh.receiveShadow = true;
    pad.add(ringMesh);

    // Flame deflection aperture opening in center
    const holeGeo = new THREE.CylinderGeometry(5.0, 5.0, 4.2, 16);
    const holeMesh = new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({ color: 0x050505 }));
    holeMesh.position.y = tableHeight - 2.0;
    pad.add(holeMesh);

    // 6 Massive Support Pillars
    const legGeo = new THREE.CylinderGeometry(1.2, 1.6, tableHeight - 4.0, 10);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leg = new THREE.Mesh(legGeo, this.matDarkMetal);
      leg.position.set(Math.cos(a) * (tableRadius - 1.2), (tableHeight - 4.0) / 2, Math.sin(a) * (tableRadius - 1.2));
      pad.add(leg);
    }

    // 145m Mechazilla Tower (offset 18m from rocket center along +X)
    const towerX = 18.0;
    const towerZ = 0.0;
    const towerHeight = 145.0;
    const towerWidth = 9.0;
    this.towerPosition = new THREE.Vector3(towerX, 0, towerZ);

    // 4 Main Tower Column Legs
    const columnGeo = new THREE.BoxGeometry(1.2, towerHeight, 1.2);
    for (let dx of [-towerWidth / 2, towerWidth / 2]) {
      for (let dz of [-towerWidth / 2, towerWidth / 2]) {
        const col = new THREE.Mesh(columnGeo, this.matTower);
        col.position.set(towerX + dx, towerHeight / 2, towerZ + dz);
        col.castShadow = true;
        pad.add(col);
      }
    }

    // Horizontal Lattice Bracing (shared geometries)
    const beamXGeo = new THREE.BoxGeometry(towerWidth, 0.7, 0.7);
    const beamZGeo = new THREE.BoxGeometry(0.7, 0.7, towerWidth);
    for (let y = 12; y < towerHeight; y += 16) {
      const beamX = new THREE.Mesh(beamXGeo, this.matTower);
      beamX.position.set(towerX, y, towerZ - towerWidth / 2);
      pad.add(beamX);

      const beamX2 = new THREE.Mesh(beamXGeo, this.matTower);
      beamX2.position.set(towerX, y, towerZ + towerWidth / 2);
      pad.add(beamX2);

      const beamZ = new THREE.Mesh(beamZGeo, this.matTower);
      beamZ.position.set(towerX - towerWidth / 2, y, towerZ);
      pad.add(beamZ);

      const beamZ2 = new THREE.Mesh(beamZGeo, this.matTower);
      beamZ2.position.set(towerX + towerWidth / 2, y, towerZ);
      pad.add(beamZ2);
    }

    // Top Tower Crane Boom
    const craneBoom = new THREE.Mesh(new THREE.BoxGeometry(24, 1.8, 1.8), this.matTower);
    craneBoom.position.set(towerX - 6, towerHeight + 2, towerZ);
    pad.add(craneBoom);

    // Functional Articulated Chopsticks Carriage (Ref Image 1: The Mechazilla Catch Arms!)
    this.chopsticksCarriage = new THREE.Group();
    this.chopsticksCarriage.position.set(towerX - towerWidth / 2, 85, towerZ);

    const carriageFrame = new THREE.Mesh(new THREE.BoxGeometry(4.0, 8.0, 11.0), this.matDarkMetal);
    carriageFrame.position.set(1.5, 0, 0);
    this.chopsticksCarriage.add(carriageFrame);

    const armGeo = new THREE.BoxGeometry(20, 1.6, 1.4);
    armGeo.translate(-10, 0, 0); // pivot at root

    // Left Chopstick Arm with Hinge
    this.leftChopstickHinge = new THREE.Group();
    this.leftChopstickHinge.position.set(0, 0, -4.6);
    const leftArm = new THREE.Mesh(armGeo, this.matDarkMetal);
    this.leftChopstickHinge.add(leftArm);
    this.leftChopstickHinge.rotation.y = 0.22;
    this.chopsticksCarriage.add(this.leftChopstickHinge);

    // Right Chopstick Arm with Hinge
    this.rightChopstickHinge = new THREE.Group();
    this.rightChopstickHinge.position.set(0, 0, 4.6);
    const rightArm = new THREE.Mesh(armGeo, this.matDarkMetal);
    this.rightChopstickHinge.add(rightArm);
    this.rightChopstickHinge.rotation.y = -0.22;
    this.chopsticksCarriage.add(this.rightChopstickHinge);

    pad.add(this.chopsticksCarriage);

    // Quick Disconnect (QD) Umbilical Arm connecting tower to rocket
    const qdArm = new THREE.Mesh(new THREE.BoxGeometry(11, 1.4, 1.8), this.matTower);
    qdArm.position.set(towerX - 8.5, 36, towerZ);
    pad.add(qdArm);

    // Build the broader Mars Starbase complex (Ref Images 2 & 3)
    this.buildExpandedMarsStarbase(pad);
  }

  // -------------------------------------------------------------
  // EXPANDED MARS STARBASE: Landed Starships, Cargo Docks & Tanks (Ref Images 2 & 3)
  // -------------------------------------------------------------
  buildExpandedMarsStarbase(pad) {
    // 1. Concrete Landing Pad 2 (135m East: X = 135, Z = 55)
    const pad2Geo = new THREE.CylinderGeometry(28, 30, 2.5, 20);
    const pad2 = new THREE.Mesh(pad2Geo, this.matConcrete);
    pad2.position.set(135, 1.25, 55);
    pad2.receiveShadow = true;
    pad.add(pad2);

    // Landed Cargo Starship #1 standing tall with OPEN cargo doors & elevator crane! (Ref Images 2 & 3)
    const landedCargoShip = this.createStaticStarshipMesh({ withCargoOpen: true, withLegs: true });
    landedCargoShip.position.set(135, 2.5, 55);
    pad.add(landedCargoShip);

    // Rover Trailers & Cargo Logistics Containers around Landed Ship 1 (Ref Image 2 & 3)
    const crateGeo = new THREE.BoxGeometry(4.2, 2.4, 2.6);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.8, roughness: 0.4 });
    const crate1 = new THREE.Mesh(crateGeo, crateMat);
    crate1.position.set(135 + 14, 1.4, 55 + 8);
    pad.add(crate1);

    const crate2 = new THREE.Mesh(new THREE.BoxGeometry(5.0, 2.2, 2.8), crateMat);
    crate2.position.set(135 + 16, 1.3, 55 - 10);
    pad.add(crate2);

    // Pressurized Rover Logistics Pod on wheels (Ref Image 2 & 3)
    const roverPod = new THREE.Group();
    const podBody = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.8, 3.4), this.matWhiteTank);
    podBody.position.y = 2.2;
    roverPod.add(podBody);
    // Wheels
    const podWheelGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.6, 12);
    for (let wx of [-2.4, 0, 2.4]) {
      for (let wz of [-1.9, 1.9]) {
        const wheel = new THREE.Mesh(podWheelGeo, this.matDarkMetal);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.75, wz);
        roverPod.add(wheel);
      }
    }
    roverPod.position.set(135 - 18, 0, 55 + 12);
    pad.add(roverPod);

    // 2. Concrete Landing Pad 3 (210m Northeast: X = 190, Z = -140)
    const pad3 = new THREE.Mesh(pad2Geo, this.matConcrete);
    pad3.position.set(190, 1.25, -140);
    pad3.receiveShadow = true;
    pad.add(pad3);

    // Landed Crew Starship #2 standing on landing legs
    const landedCrewShip = this.createStaticStarshipMesh({ withCargoOpen: false, withLegs: true });
    landedCrewShip.position.set(190, 2.5, -140);
    pad.add(landedCrewShip);

    // 3. Cryogenic Propellant Tank Farm (LOX + LCH4)
    const tankGeo = new THREE.CylinderGeometry(4.8, 4.8, 24, 16);
    const tankCapGeo = new THREE.SphereGeometry(4.8, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);

    const tankPositions = [
      [-65, 55], [-65, 75], [-65, 95],
      [-80, 55], [-80, 75], [-80, 95]
    ];

    for (const [tx, tz] of tankPositions) {
      const tank = new THREE.Mesh(tankGeo, this.matWhiteTank);
      tank.position.set(tx, 12, tz);
      pad.add(tank);

      const cap = new THREE.Mesh(tankCapGeo, this.matWhiteTank);
      cap.position.set(tx, 24, tz);
      pad.add(cap);
    }

    // Pipeline Manifold connecting tanks to launch table
    const pipeGeo = new THREE.CylinderGeometry(0.7, 0.7, 85, 8);
    pipeGeo.rotateZ(Math.PI / 2);
    const pipe = new THREE.Mesh(pipeGeo, this.matDarkMetal);
    pipe.position.set(-25, 4.0, 75);
    pad.add(pipe);

    // 4. Starbase Pressurized Control Center & Geodesic Dome
    const domeGeo = new THREE.SphereGeometry(16, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const dome = new THREE.Mesh(domeGeo, new THREE.MeshStandardMaterial({
      color: 0xe0ddd8,
      metalness: 0.85,
      roughness: 0.28
    }));
    dome.position.set(-85, 0, -45);
    pad.add(dome);

    // Satellite Comm Dish on Control Dome
    const dishGeo = new THREE.SphereGeometry(3.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.4);
    const dish = new THREE.Mesh(dishGeo, this.matSteel);
    dish.rotation.x = -Math.PI / 3;
    dish.position.set(-85, 18, -45);
    pad.add(dish);

    // 5. High-Power Perimeter Floodlight Masts (emissive lamp heads instead of expensive PointLights)
    const lightMastGeo = new THREE.CylinderGeometry(0.5, 0.8, 36, 8);
    const lampBulbGeo = new THREE.SphereGeometry(1.1, 8, 6);
    const mastPositions = [
      [45, 60], [-45, 60], [45, -60], [-45, -60]
    ];
    for (const [mx, mz] of mastPositions) {
      const mast = new THREE.Mesh(lightMastGeo, this.matDarkMetal);
      mast.position.set(mx, 18, mz);
      pad.add(mast);

      const lamp = new THREE.Mesh(lampBulbGeo, this.matEmissiveLamp);
      lamp.position.set(mx, 36, mz);
      pad.add(lamp);
    }
  }

  // Helper to build realistic static Starships for Mars Starbase (Ref Images 2 & 3)
  createStaticStarshipMesh({ withCargoOpen = false, withLegs = true }) {
    const ship = new THREE.Group();
    const r = 4.5;
    const barrelH = 34.0;
    const noseH = 16.0;

    // Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, barrelH, 24), this.matSteel);
    barrel.position.y = barrelH / 2;
    barrel.castShadow = true;
    ship.add(barrel);

    // Windward Heat Shield
    const shieldBelly = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 1.01, r * 1.01, barrelH, 24, 1, false, Math.PI * 0.5, Math.PI),
      this.matHeatshield
    );
    shieldBelly.position.y = barrelH / 2;
    ship.add(shieldBelly);

    // Ogive Nosecone
    const ogivePoints = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = t * noseH;
      const rad = r * Math.cos(t * Math.PI * 0.5);
      ogivePoints.push(new THREE.Vector2(rad, y));
    }
    const nose = new THREE.Mesh(new THREE.LatheGeometry(ogivePoints, 24), this.matSteel);
    nose.position.y = barrelH;
    nose.castShadow = true;
    ship.add(nose);

    const noseShield = new THREE.Mesh(
      new THREE.LatheGeometry(ogivePoints, 24, Math.PI * 0.5, Math.PI),
      this.matHeatshield
    );
    noseShield.scale.set(1.01, 1.0, 1.01);
    noseShield.position.y = barrelH;
    ship.add(noseShield);

    // Flaps
    const ffGeo = new THREE.BoxGeometry(0.3, 3.8, 3.2);
    const afGeo = new THREE.BoxGeometry(0.4, 11.0, 5.2);
    for (const sx of [-1, 1]) {
      const ff = new THREE.Mesh(ffGeo, this.matHeatshield);
      ff.position.set(sx * (r + 1.2), barrelH + noseH * 0.45, 0);
      ship.add(ff);

      const af = new THREE.Mesh(afGeo, this.matHeatshield);
      af.position.set(sx * (r + 2.0), 6.5, 0);
      ship.add(af);
    }

    // Deployable / Deployed Landing Legs (Ref Image 2 & 3)
    if (withLegs) {
      const strutGeo = new THREE.CylinderGeometry(0.25, 0.35, 5.5, 6);
      const footGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.3, 8);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const legGroup = new THREE.Group();
        legGroup.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r);
        legGroup.rotation.y = -a;

        const strut = new THREE.Mesh(strutGeo, this.matDarkMetal);
        strut.position.set(0, -1.8, 1.2);
        strut.rotation.x = 0.45;
        legGroup.add(strut);

        const footPad = new THREE.Mesh(footGeo, this.matDarkMetal);
        footPad.position.set(0, -3.8, 2.4);
        legGroup.add(footPad);

        ship.add(legGroup);
      }
    }

    // Gullwing Open Cargo Bay Door & Deployed Crane Elevator! (Ref Images 2 & 3)
    if (withCargoOpen) {
      const doorGeo = new THREE.BoxGeometry(0.2, 9.5, 4.0);
      const leftDoor = new THREE.Mesh(doorGeo, this.matSteel);
      leftDoor.position.set(-r - 0.4, 30, 2.8);
      leftDoor.rotation.y = -0.7;
      ship.add(leftDoor);

      const rightDoor = new THREE.Mesh(doorGeo, this.matSteel);
      rightDoor.position.set(r + 0.4, 30, 2.8);
      rightDoor.rotation.y = 0.7;
      ship.add(rightDoor);

      // Emissive Cargo Bay Interior Panel
      const cargoGlow = new THREE.Mesh(new THREE.BoxGeometry(3.2, 6.0, 0.4), this.matEmissiveLamp);
      cargoGlow.position.set(0, 30, 2.2);
      ship.add(cargoGlow);

      // Crane Suspension Cables extending down to the ground
      const cableGeo = new THREE.CylinderGeometry(0.04, 0.04, 30, 4);
      cableGeo.translate(0, -15, 0);
      for (const cx of [-2.0, 2.0]) {
        for (const cz of [2.8, 5.2]) {
          const cable = new THREE.Mesh(cableGeo, this.matSteel);
          cable.position.set(cx, 30, cz);
          ship.add(cable);
        }
      }

      const platform = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.4, 3.8), this.matDarkMetal);
      platform.position.set(0, 0.2, 4.0);
      ship.add(platform);

      const pallet = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.6, 2.8), this.matWhiteTank);
      pallet.position.set(0, 1.2, 4.0);
      ship.add(pallet);
    }

    return ship;
  }

  // -------------------------------------------------------------
  // 1B. PHYSICAL LAUNCH CONTROL PEDESTAL NEAR PAD (Walk & Click to Launch!)
  // -------------------------------------------------------------
  buildLaunchTerminal() {
    const T = this.launchTerminalGroup;

    // Concrete platform pad at astronaut approach perimeter
    const basePad = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 3.0, 0.28, 18),
      this.matConcrete
    );
    basePad.position.y = 0.14;
    basePad.receiveShadow = true;
    T.add(basePad);

    // Illuminated perimeter safety ring on ground
    const ringGlow = new THREE.Mesh(
      new THREE.RingGeometry(2.35, 2.52, 24),
      new THREE.MeshBasicMaterial({ color: 0xff4422, side: THREE.DoubleSide })
    );
    ringGlow.rotation.x = -Math.PI / 2;
    ringGlow.position.y = 0.29;
    T.add(ringGlow);

    // Angled Stainless Steel & Dark Carbon Control Pedestal Pillar
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 1.18, 0.52),
      this.matDarkMetal
    );
    pillar.position.set(0, 0.72, 0);
    pillar.castShadow = true;
    T.add(pillar);

    // Sloped Console Top Deck (at astronaut hand/chest height ~1.32m)
    const consoleHead = new THREE.Group();
    consoleHead.position.set(0, 1.32, 0.05);
    consoleHead.rotation.x = 0.42; // Tilted toward astronaut approaching from -Z / -X

    const deckPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.14, 0.64),
      this.matSteel
    );
    consoleHead.add(deckPlate);

    // Protective Industrial Yellow/Dark Safety Collar around the Physical Launch Button
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.23, 0.09, 20, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xeeb422, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide })
    );
    collar.position.set(0, 0.10, 0.04);
    consoleHead.add(collar);

    // THE PHYSICAL LAUNCH PUSH-BUTTON (Raycast clickable & [F] interactive!)
    this.launchButtonMat = new THREE.MeshStandardMaterial({
      color: 0xff2211,
      emissive: new THREE.Color(0xff2a00),
      emissiveIntensity: 1.35,
      metalness: 0.3,
      roughness: 0.25
    });
    this.launchButtonMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.17, 0.11, 24),
      this.launchButtonMat
    );
    this.launchButtonMesh.position.set(0, 0.12, 0.04);
    this.launchButtonMesh.name = 'PHYSICAL_LAUNCH_BUTTON';
    consoleHead.add(this.launchButtonMesh);

    // Status LED indicators above the button
    const ledArmed = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.03, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x34d399 })
    );
    ledArmed.position.set(-0.22, 0.08, -0.18);
    consoleHead.add(ledArmed);

    const ledPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.03, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    ledPad.position.set(0.22, 0.08, -0.18);
    consoleHead.add(ledPad);

    T.add(consoleHead);

    // Overhead Beacon Pole so astronaut/rover can easily spot the Launch Control Pedestal
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 3.6, 8),
      this.matDarkMetal
    );
    pole.position.set(0, 1.8, -0.22);
    T.add(pole);

    this.terminalBeaconMat = new THREE.MeshBasicMaterial({ color: 0xff3b1f });
    const beaconLamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 10),
      this.terminalBeaconMat
    );
    beaconLamp.position.set(0, 3.65, -0.22);
    T.add(beaconLamp);
  }

  placeLaunchTerminal(x, y, z, rotationY = -Math.PI * 0.75) {
    this.launchTerminalGroup.position.set(x, y, z);
    this.launchTerminalGroup.rotation.y = rotationY;
  }

  setLaunchButtonPressed(pressed) {
    if (!this.launchButtonMesh || !this.launchButtonMat) return;
    this.launchButtonMesh.position.y = pressed ? 0.075 : 0.12;
    if (pressed) {
      this.launchButtonMat.color.setHex(0x10b981);
      this.launchButtonMat.emissive.setHex(0x10b981);
      this.launchButtonMat.emissiveIntensity = 1.8;
      if (this.terminalBeaconMat) this.terminalBeaconMat.color.setHex(0x10b981);
    } else {
      this.launchButtonMat.color.setHex(0xff2211);
      this.launchButtonMat.emissive.setHex(0xff2a00);
      this.launchButtonMat.emissiveIntensity = 1.35;
      if (this.terminalBeaconMat) this.terminalBeaconMat.color.setHex(0xff3b1f);
    }
  }

  // -------------------------------------------------------------
  // 2. SUPER HEAVY BOOSTER (STAGE 1) (Ref Images 0, 1)
  // -------------------------------------------------------------
  buildSuperHeavyBooster() {
    const B = this.boosterGroup;
    const radius = 4.5; // 9m diameter
    const boosterHeight = 70.0;
    this.boosterHeight = boosterHeight;

    // Main Stainless Steel Cylinder Body
    const cylGeo = new THREE.CylinderGeometry(radius, radius, boosterHeight, 32, 4);
    const body = new THREE.Mesh(cylGeo, this.matSteel);
    body.position.y = boosterHeight / 2;
    body.castShadow = body.receiveShadow = true;
    B.add(body);

    // Cryogenic LOX & LCH4 Tank Condensation Frost Bands
    const loxFrost = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.004, radius * 1.004, 24.0, 32),
      this.matCryoFrost
    );
    loxFrost.position.y = 19.0;
    B.add(loxFrost);

    const ch4Frost = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.004, radius * 1.004, 19.0, 32),
      this.matCryoFrost
    );
    ch4Frost.position.y = 48.0;
    B.add(ch4Frost);

    // Aerodynamic Chines / COPV & Autogenous Pressurization Trunks along the side
    const chineGeo = new THREE.BoxGeometry(0.55, boosterHeight * 0.78, 1.15);
    for (const sx of [-1, 1]) {
      const chine = new THREE.Mesh(chineGeo, this.matSteel);
      chine.position.set(sx * (radius + 0.18), boosterHeight * 0.44, 0);
      B.add(chine);
    }

    // Forward Catch Pins / Lifting Strakes
    const pinGeo = new THREE.BoxGeometry(2.4, 0.9, 1.4);
    for (const sx of [-1, 1]) {
      const pin = new THREE.Mesh(pinGeo, this.matDarkMetal);
      pin.position.set(sx * (radius + 0.8), boosterHeight - 4.5, 0);
      B.add(pin);
    }

    // 4 Hexagonal Grid Fins at the top
    this.gridFins = [];
    const finHeight = boosterHeight - 2.0;
    const finBoxGeo = new THREE.BoxGeometry(0.3, 3.2, 4.5);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const finGroup = new THREE.Group();
      finGroup.position.set(Math.cos(a) * (radius + 0.3), finHeight, Math.sin(a) * (radius + 0.3));
      finGroup.rotation.y = -a;

      const finMesh = new THREE.Mesh(finBoxGeo, this.matGridFin);
      finGroup.add(finMesh);

      B.add(finGroup);
      this.gridFins.push(finGroup);
    }

    // Vented Hot-Staging Interstage Ring (sits between Booster and Ship)
    const hotRingY = boosterHeight + 2.5;
    const hotRingGeo = new THREE.CylinderGeometry(radius, radius, 5.0, 28);
    const hotRing = new THREE.Mesh(hotRingGeo, this.matDarkMetal);
    hotRing.position.y = hotRingY;
    B.add(hotRing);

    // Hot-stage exhaust blast slots around the interstage perimeter
    const slotGeo = new THREE.BoxGeometry(0.95, 2.8, 0.25);
    const slotMat = new THREE.MeshBasicMaterial({ color: 0x060709 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const slot = new THREE.Mesh(slotGeo, slotMat);
      slot.position.set(Math.cos(a) * (radius + 0.02), hotRingY, Math.sin(a) * (radius + 0.02));
      slot.rotation.y = -a + Math.PI / 2;
      B.add(slot);
    }

    // 33 Raptor Engine Cluster at Booster Base using a single InstancedMesh (1 draw call instead of 33)
    const raptorGeo = new THREE.CylinderGeometry(0.4, 0.75, 1.8, 10);
    const raptorsInst = new THREE.InstancedMesh(raptorGeo, this.matRaptorBell, 33);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = radius * 0.82;
      dummy.position.set(Math.cos(a) * r, -0.6, Math.sin(a) * r);
      dummy.updateMatrix();
      raptorsInst.setMatrixAt(idx++, dummy.matrix);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = radius * 0.52;
      dummy.position.set(Math.cos(a) * r, -0.6, Math.sin(a) * r);
      dummy.updateMatrix();
      raptorsInst.setMatrixAt(idx++, dummy.matrix);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const r = radius * 0.22;
      dummy.position.set(Math.cos(a) * r, -0.6, Math.sin(a) * r);
      dummy.updateMatrix();
      raptorsInst.setMatrixAt(idx++, dummy.matrix);
    }
    raptorsInst.instanceMatrix.needsUpdate = true;
    B.add(raptorsInst);

    // Unified Booster Engine Fire Plume
    const boosterFlameGeo = new THREE.CylinderGeometry(3.8, 8.5, 38, 16, 1, true);
    boosterFlameGeo.translate(0, -19, 0);
    this.boosterFlame = new THREE.Mesh(
      boosterFlameGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffaa33,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    this.boosterFlame.visible = false;
    B.add(this.boosterFlame);

    // Inner bright white shock core
    const shockCoreGeo = new THREE.CylinderGeometry(1.8, 3.2, 22, 12, 1, true);
    shockCoreGeo.translate(0, -11, 0);
    this.boosterShockCore = new THREE.Mesh(
      shockCoreGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    this.boosterShockCore.visible = false;
    B.add(this.boosterShockCore);
  }

  // -------------------------------------------------------------
  // 3. STARSHIP UPPER STAGE (STAGE 2) (Ref Images 0, 1, 2, 3)
  // -------------------------------------------------------------
  buildStarship() {
    const S = this.starshipGroup;
    const r = 4.5;
    const barrelH = 34.0;
    const noseH = 16.0;
    this.shipHeight = barrelH + noseH;

    // Main barrel cylinder
    const barrelGeo = new THREE.CylinderGeometry(r, r, barrelH, 32, 4);
    const barrel = new THREE.Mesh(barrelGeo, this.matSteel);
    barrel.position.y = barrelH / 2;
    barrel.castShadow = barrel.receiveShadow = true;
    S.add(barrel);

    // Leeward Cryogenic Propellant Condensation Frost Band on Ship Tank Section
    const shipCryoFrost = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 1.004, r * 1.004, 16.0, 32, 1, false, Math.PI * 0.5, Math.PI),
      this.matCryoFrost
    );
    shipCryoFrost.position.y = 14.5;
    S.add(shipCryoFrost);

    // Black Ceramic Heat Shield Layer on +Z Windward Belly (faces planet & plasma during +pitch reentry/bellyflop)
    const shieldBellyGeo = new THREE.CylinderGeometry(r * 1.012, r * 1.012, barrelH, 32, 1, false, -Math.PI * 0.5, Math.PI);
    const shieldBelly = new THREE.Mesh(shieldBellyGeo, this.matHeatshield);
    shieldBelly.position.y = barrelH / 2;
    S.add(shieldBelly);

    // Authentic Gothic Ogive Nosecone
    const ogivePoints = [];
    const ogiveSteps = 16;
    for (let i = 0; i <= ogiveSteps; i++) {
      const t = i / ogiveSteps;
      const y = t * noseH;
      const rad = r * Math.cos(t * Math.PI * 0.5);
      ogivePoints.push(new THREE.Vector2(rad, y));
    }
    const noseSteelGeo = new THREE.LatheGeometry(ogivePoints, 32);
    const nose = new THREE.Mesh(noseSteelGeo, this.matSteel);
    nose.position.y = barrelH;
    nose.castShadow = true;
    S.add(nose);

    // Nosecone Heatshield half on +Z Windward Belly
    const noseShieldGeo = new THREE.LatheGeometry(ogivePoints, 32, -Math.PI * 0.5, Math.PI);
    noseShieldGeo.scale(1.01, 1.0, 1.01);
    const noseShield = new THREE.Mesh(noseShieldGeo, this.matHeatshield);
    noseShield.position.y = barrelH;
    S.add(noseShield);

    // Starlink "Pez Dispenser" Payload Slot on forward barrel
    const pezSlot = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.42, 0.25),
      this.matDarkMetal
    );
    pezSlot.position.set(0, barrelH - 3.6, -(r + 0.02));
    S.add(pezSlot);

    // Raceway conduit down the -Z leeward stainless steel spine
    const raceway = new THREE.Mesh(new THREE.BoxGeometry(0.38, barrelH + noseH * 0.6, 0.42), this.matDarkMetal);
    raceway.position.set(0, (barrelH + noseH * 0.6) / 2, -(r + 0.1));
    S.add(raceway);

    // Starship Forward Structural Load-Bearing Catch Pins (for Mechazilla Tower Catch)
    for (const sx of [-1, 1]) {
      const shipPin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.85), this.matDarkMetal);
      shipPin.position.set(sx * (r + 0.65), barrelH - 2.2, 0);
      S.add(shipPin);
    }

    // 4 Articulating Aerodynamic Flaps with Aerodynamic Hinge Root Fairings
    this.forwardFlaps = [];
    this.aftFlaps = [];

    const ffGeo = new THREE.BoxGeometry(0.32, 3.8, 3.2);
    const ffFairingGeo = new THREE.CylinderGeometry(0.45, 0.55, 4.1, 12);
    for (const sx of [-1, 1]) {
      const fairing = new THREE.Mesh(ffFairingGeo, this.matHeatshield);
      fairing.position.set(sx * (r - 0.15), barrelH + noseH * 0.45, 0);
      S.add(fairing);

      const hinge = new THREE.Group();
      hinge.position.set(sx * (r - 0.2), barrelH + noseH * 0.45, 0);

      const flapMesh = new THREE.Mesh(ffGeo, this.matHeatshield);
      flapMesh.position.set(sx * 1.6, 0, 0);
      hinge.add(flapMesh);

      S.add(hinge);
      this.forwardFlaps.push({ hinge, side: sx });
    }

    const afGeo = new THREE.BoxGeometry(0.42, 11.0, 5.2);
    const afFairingGeo = new THREE.CylinderGeometry(0.62, 0.72, 11.4, 12);
    for (const sx of [-1, 1]) {
      const fairing = new THREE.Mesh(afFairingGeo, this.matHeatshield);
      fairing.position.set(sx * (r - 0.1), 6.5, 0);
      S.add(fairing);

      const hinge = new THREE.Group();
      hinge.position.set(sx * (r - 0.2), 6.5, 0);

      const flapMesh = new THREE.Mesh(afGeo, this.matHeatshield);
      flapMesh.position.set(sx * 2.6, 0, 0);
      hinge.add(flapMesh);

      S.add(hinge);
      this.aftFlaps.push({ hinge, side: sx });
    }

    // Deployable Landing Legs for Mars Touchdown
    this.landingLegs = [];
    const legStrutGeo = new THREE.CylinderGeometry(0.2, 0.3, 4.8, 6);
    const padMeshGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.25, 8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const legPivot = new THREE.Group();
      legPivot.position.set(Math.cos(a) * (r - 0.2), 1.8, Math.sin(a) * (r - 0.2));
      legPivot.rotation.y = -a;

      const legStrut = new THREE.Mesh(legStrutGeo, this.matDarkMetal);
      legStrut.position.set(0, -1.6, 0.9);
      legStrut.rotation.x = 0.35;
      legPivot.add(legStrut);

      const padMesh = new THREE.Mesh(padMeshGeo, this.matDarkMetal);
      padMesh.position.set(0, -3.2, 1.8);
      legPivot.add(padMesh);

      legPivot.scale.set(0.001, 0.001, 0.001);
      S.add(legPivot);
      this.landingLegs.push(legPivot);
    }

    // Gullwing Cargo Bay Doors & Interior Crane on -Z Leeward Spine
    this.cargoBayGroup = new THREE.Group();
    this.cargoBayGroup.position.set(0, 26.0, -r);

    const doorGeo = new THREE.BoxGeometry(0.25, 9.0, 3.8);
    this.cargoDoorLeft = new THREE.Mesh(doorGeo, this.matSteel);
    this.cargoDoorLeft.position.set(-2.0, 0, 0);
    this.cargoBayGroup.add(this.cargoDoorLeft);

    this.cargoDoorRight = new THREE.Mesh(doorGeo, this.matSteel);
    this.cargoDoorRight.position.set(2.0, 0, 0);
    this.cargoBayGroup.add(this.cargoDoorRight);

    this.cargoPlatform = new THREE.Group();
    this.cargoPlatform.position.set(0, 0, 0);

    const platformFloor = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 3.2), this.matDarkMetal);
    this.cargoPlatform.add(platformFloor);

    const cargoPod = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.6, 2.2), this.matWhiteTank);
    cargoPod.position.y = 0.95;
    this.cargoPlatform.add(cargoPod);

    this.cargoPlatform.visible = false;
    this.cargoBayGroup.add(this.cargoPlatform);

    S.add(this.cargoBayGroup);

    // 6 Starship Raptor Engines: 3 Vacuum (large bell) + 3 Sea-level
    const vacBellGeo = new THREE.CylinderGeometry(0.5, 1.4, 2.6, 12);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const vacBell = new THREE.Mesh(vacBellGeo, this.matRaptorBell);
      vacBell.position.set(Math.cos(a) * 2.5, -1.0, Math.sin(a) * 2.5);
      S.add(vacBell);
    }
    const slBellGeo = new THREE.CylinderGeometry(0.3, 0.7, 1.6, 10);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
      const slBell = new THREE.Mesh(slBellGeo, this.matRaptorBell);
      slBell.position.set(Math.cos(a) * 1.1, -0.6, Math.sin(a) * 1.1);
      S.add(slBell);
    }

    // Starship Atmospheric Plume
    const shipFlameGeo = new THREE.CylinderGeometry(2.4, 4.6, 24, 16, 1, true);
    shipFlameGeo.translate(0, -12, 0);
    this.starshipFlame = new THREE.Mesh(
      shipFlameGeo,
      new THREE.MeshBasicMaterial({
        color: 0x44aaff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    this.starshipFlame.visible = false;
    S.add(this.starshipFlame);
  }

  // -------------------------------------------------------------
  // 4. SPECIAL FX: SPACE JELLYFISH PLUME & HYPERSONIC PLASMA SHEATH
  // -------------------------------------------------------------
  buildFX() {
    // "SPACE JELLYFISH" Twilight Expansion Plume
    const jellyGeo = new THREE.SphereGeometry(45, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.75);
    jellyGeo.rotateX(Math.PI);
    jellyGeo.scale(1.0, 2.4, 1.0);
    jellyGeo.translate(0, -55, 0);

    this.jellyfishMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.0 },
        uColorCore: { value: new THREE.Color(0xaae5ff) },
        uColorOuter: { value: new THREE.Color(0x7050d0) }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uColorCore;
        uniform vec3 uColorOuter;
        varying vec3 vNormal;
        varying vec3 vPos;

        void main() {
          if (uIntensity <= 0.005) discard;
          float y = -vPos.y / 110.0;
          float oneMinusZ = 1.0 - abs(vNormal.z);
          float fres = oneMinusZ * oneMinusZ;
          float ripple = sin(vPos.y * 0.2 - uTime * 6.0) * 0.15 + sin(vPos.x * 0.3) * 0.1;
          vec3 col = mix(uColorCore, uColorOuter, clamp(y * 1.2 + ripple, 0.0, 1.0));
          float alpha = clamp(fres * (1.0 - y * 0.7) * uIntensity * 1.5, 0.0, 0.85);
          gl_FragColor = vec4(col, alpha);
        }
      `
    });
    this.jellyfishMesh = new THREE.Mesh(jellyGeo, this.jellyfishMat);
    this.jellyfishMesh.visible = false;
    this.starshipGroup.add(this.jellyfishMesh);

    // HYPERSONIC IONIZED PLASMA SHEATH ON +Z WINDWARD BLACK HEATSHIELD BELLY
    const plasmaGeo = new THREE.CylinderGeometry(5.15, 5.65, 38, 24, 1, true, -Math.PI * 0.54, Math.PI * 1.08);
    plasmaGeo.translate(0, 19, 0.25);

    this.plasmaMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uHeat: { value: 0.0 }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPos;
        uniform float uTime;
        uniform float uHeat;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPos = position;
          vec3 pos = position;
          float wave = sin(pos.y * 0.45 - uTime * 22.0) * 0.12 * uHeat;
          pos += normal * wave;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uHeat;
        varying vec3 vNormal;
        varying vec3 vPos;

        void main() {
          if (uHeat <= 0.005) discard;
          // Sequential color temperature progression from incipient orange/violet to white-hot stagnation
          vec3 incipientOrange = vec3(1.0, 0.42, 0.12);
          vec3 ionizedMagenta = vec3(0.96, 0.22, 0.72);
          vec3 ionizedViolet = vec3(0.55, 0.25, 1.0);
          vec3 stagnationWhite = vec3(1.0, 0.96, 0.82);

          // Windward wrap factor: strongest directly on +Z belly center (vPos.z > 0), fading at side edges
          float bellyCenter = clamp(vPos.z / 5.0, 0.0, 1.0);
          float axialDist = abs(vPos.y - 24.0) / 26.0;
          float envelope = clamp(bellyCenter * (1.15 - axialDist * 0.45), 0.0, 1.0);

          // Sequential coverage: at low uHeat, only the stagnation belly center glows; at peak uHeat, full sheath ignites
          float activeMask = smoothstep(1.0 - uHeat * 0.95, 1.05, envelope + uHeat * 0.35);
          float stream = 0.88 + 0.12 * sin(vPos.y * 0.7 - uTime * 28.0 + vPos.x * 1.5);

          vec3 lowHeatCol = mix(ionizedViolet, incipientOrange, bellyCenter);
          vec3 highHeatCol = mix(ionizedMagenta, stagnationWhite, pow(bellyCenter, 1.4));
          vec3 plasmaCol = mix(lowHeatCol, highHeatCol, smoothstep(0.2, 0.85, uHeat));

          float rim = 0.35 + 0.65 * (1.0 - abs(vNormal.z));
          float alpha = clamp(activeMask * rim * stream * pow(uHeat, 1.15) * 1.25, 0.0, 0.92);
          gl_FragColor = vec4(plasmaCol, alpha);
        }
      `
    });
    this.plasmaMesh = new THREE.Mesh(plasmaGeo, this.plasmaMat);
    this.plasmaMesh.visible = false;
    this.starshipGroup.add(this.plasmaMesh);

    // Nosecone bow-shock plasma cap on +Z windward nose
    const nosePlasmaGeo = new THREE.SphereGeometry(5.15, 20, 12, 0, Math.PI, 0, Math.PI * 0.5);
    nosePlasmaGeo.translate(0, 34 + 10, 0.32);
    this.nosePlasma = new THREE.Mesh(nosePlasmaGeo, this.plasmaMat);
    this.nosePlasma.visible = false;
    this.starshipGroup.add(this.nosePlasma);
  }

  // -------------------------------------------------------------
  // ANIMATION & KINEMATICS CONTROL INTERFACE
  // -------------------------------------------------------------
  setMated(mated) {
    this.isMated = mated;
    if (mated) {
      this.starshipGroup.position.set(0, this.boosterHeight + 5.0, 0);
      this.starshipGroup.rotation.set(0, 0, 0);
    }
  }

  setChopsticks(catchFactor0to1, carriageHeight = 85.0) {
    if (!this.chopsticksCarriage || !this.leftChopstickHinge || !this.rightChopstickHinge) return;
    this.chopsticksCarriage.position.y = carriageHeight;

    const angle = THREE.MathUtils.lerp(0.42, 0.06, catchFactor0to1);
    this.leftChopstickHinge.rotation.y = angle;
    this.rightChopstickHinge.rotation.y = -angle;
  }

  setCargoDoors(openFactor0to1) {
    if (!this.cargoDoorLeft || !this.cargoDoorRight || !this.cargoPlatform) return;
    const doorAngle = openFactor0to1 * 1.25;
    this.cargoDoorLeft.rotation.y = -doorAngle;
    this.cargoDoorRight.rotation.y = doorAngle;

    if (openFactor0to1 > 0.1) {
      this.cargoPlatform.visible = true;
      this.cargoPlatform.position.y = -openFactor0to1 * 26.0;
    } else {
      this.cargoPlatform.visible = false;
    }
  }

  setLandingLegs(deployFactor0to1) {
    if (!this.landingLegs) return;
    const s = Math.max(0.001, deployFactor0to1);
    for (const leg of this.landingLegs) {
      leg.scale.set(s, s, s);
    }
  }

  setBoosterThrottle(throttle) {
    const active = throttle > 0.01;
    this.boosterFlame.visible = active;
    this.boosterShockCore.visible = active;
    if (active) {
      this.boosterFlame.material.opacity = 0.85 + Math.random() * 0.15;
      this.boosterFlame.scale.set(1.0 + throttle * 0.2, throttle * (1.0 + Math.random() * 0.2), 1.0 + throttle * 0.2);
      this.boosterShockCore.material.opacity = 0.95;
    }
  }

  setStarshipThrottle(throttle, isVacuum = false) {
    const active = throttle > 0.01;
    this.starshipFlame.visible = active;
    if (active) {
      this.starshipFlame.material.opacity = 0.88 + Math.random() * 0.12;
      this.starshipFlame.scale.set(1.0 + throttle * 0.3, throttle * (1.0 + Math.random() * 0.2), 1.0 + throttle * 0.3);
    }

    const jellyVis = active && isVacuum;
    if (this.jellyfishMesh) this.jellyfishMesh.visible = jellyVis;
    if (this.jellyfishMat) {
      this.jellyfishMat.uniforms.uIntensity.value = jellyVis ? throttle * 0.95 : 0.0;
    }
  }

  setReentryHeat(heatNormalized) {
    const h = THREE.MathUtils.clamp(heatNormalized, 0.0, 1.0);
    const active = h > 0.005;
    if (this.plasmaMesh) this.plasmaMesh.visible = active;
    if (this.nosePlasma) this.nosePlasma.visible = active;
    if (this.plasmaMat) {
      this.plasmaMat.uniforms.uHeat.value = h;
    }
    if (this.matHeatshield) {
      if (active) {
        this.matHeatshield.emissive = this.matHeatshield.emissive || new THREE.Color(0x000000);
        this.matHeatshield.emissive.setRGB(h * 0.55, h * 0.14, h * 0.03);
      } else if (this.matHeatshield.emissive) {
        this.matHeatshield.emissive.setRGB(0, 0, 0);
      }
    }
  }

  setFlapDeflection(pitch, roll) {
    const fAngle = THREE.MathUtils.clamp(-pitch * 0.8 + roll * 0.4, -0.85, 0.85);
    const aAngle = THREE.MathUtils.clamp(pitch * 0.8 + roll * 0.4, -0.85, 0.85);

    for (const f of this.forwardFlaps) {
      f.hinge.rotation.z = f.side * fAngle;
    }
    for (const a of this.aftFlaps) {
      a.hinge.rotation.z = a.side * aAngle;
    }
  }

  setGridFinSteering(yaw, pitch) {
    for (let i = 0; i < this.gridFins.length; i++) {
      this.gridFins[i].rotation.z = Math.sin(i * Math.PI * 0.5) * yaw + pitch * 0.5;
    }
  }

  update(dt) {
    if (this.jellyfishMesh?.visible && this.jellyfishMat) {
      this.jellyfishMat.uniforms.uTime.value += dt;
    }
    if (this.plasmaMesh?.visible && this.plasmaMat) {
      this.plasmaMat.uniforms.uTime.value += dt;
    }
  }
}
