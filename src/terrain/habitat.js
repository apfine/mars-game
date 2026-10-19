import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Procedural Mars outpost modelled on the reference render: white panelled drum modules with ribbed
// roofs, hex tunnels, a geodesic dome, a vaulted greenhouse, three tapered habitat pods, solar fields,
// green tanks and parked rovers. Everything is built from shared geometries/materials to stay light.
// Group origin is the site centre at ground level; colliders are [x, z, radius] in group space.

let _cachedPanel = null;
function panelTexture(base = '#e8e5de') {
  if (_cachedPanel) return _cachedPanel;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 250; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '150,120,100'},${0.03 + Math.random() * 0.05})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  g.strokeStyle = 'rgba(80,72,66,0.55)'; g.lineWidth = 1.5;
  for (let x = 0; x <= 128; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  for (let y = 0; y <= 128; y += 42) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
  // Windblown rust dust along the base
  const d = g.createLinearGradient(0, 80, 0, 128);
  d.addColorStop(0, 'rgba(176,108,72,0)'); d.addColorStop(1, 'rgba(176,108,72,0.45)');
  g.fillStyle = d; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  _cachedPanel = t;
  return t;
}

let _cachedSolar = null;
function solarTexture() {
  if (_cachedSolar) return _cachedSolar;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#12233f'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(150,180,220,0.55)'; g.lineWidth = 1;
  for (let i = 0; i <= 64; i += 8) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _cachedSolar = t;
  return t;
}

let _cachedMaterials = null;
function makeMaterials() {
  if (_cachedMaterials) return _cachedMaterials;
  const tex = panelTexture();
  _cachedMaterials = {
    hull: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.12 }),
    hullDark: new THREE.MeshStandardMaterial({ color: 0x8c8780, roughness: 0.6, metalness: 0.3 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.45, metalness: 0.85 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xb9b5ae, roughness: 0.4, metalness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xdfe9ee, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
    solar: new THREE.MeshStandardMaterial({ map: solarTexture(), roughness: 0.25, metalness: 0.8 }),
    tank: new THREE.MeshStandardMaterial({ color: 0x5f7d5a, roughness: 0.5, metalness: 0.3 }),
    window: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
    rib: new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.5, metalness: 0.3 }),
    crop: new THREE.MeshStandardMaterial({ color: 0x4f8a45, roughness: 0.9 }),
    dishMat: new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide }),
    beaconRed: new THREE.MeshBasicMaterial({ color: 0xff2a2a })
  };
  return _cachedMaterials;
}

function mesh(geo, mat, parent, x = 0, y = 0, z = 0, shadow = false) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = false;
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  parent.add(m);
  return m;
}

// Drum module: cylinder wall, ribbed low-cone roof, central hatch, windows and ground skirt
function drumModule(M, parent, x, z, r, h) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  mesh(new THREE.CylinderGeometry(r, r * 1.03, h, 20), M.hull, g, 0, h / 2, 0, true);
  mesh(new THREE.CylinderGeometry(r * 0.5, r * 1.02, 0.9, 20), M.hull, g, 0, h + 0.45, 0);
  mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.34, 0.25, 12), M.hullDark, g, 0, h + 1.0, 0);
  mesh(new THREE.TorusGeometry(r * 1.01, 0.12, 5, 24).rotateX(Math.PI / 2), M.rib, g, 0, h, 0);
  const ribGeo = new THREE.BoxGeometry(0.1, 0.08, r * 0.56);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rb = mesh(ribGeo, M.rib, g, Math.cos(a) * r * 0.76, h + 0.5, Math.sin(a) * r * 0.76, false);
    rb.rotation.set(0.0, -a + Math.PI / 2, 0);
    rb.updateMatrix();
  }
  const winGeo = new THREE.BoxGeometry(0.9, 0.5, 0.08);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const w = mesh(winGeo, M.window, g, Math.cos(a) * (r + 0.02), h * 0.6, Math.sin(a) * (r + 0.02), false);
    w.rotation.y = -a + Math.PI / 2;
    w.updateMatrix();
  }
  parent.add(g);
  return g;
}

// Hex tunnel along X between two points, with collars
function tunnel(M, parent, x0, x1, z, y = 1.7, r = 1.45) {
  const len = Math.abs(x1 - x0);
  const geo = new THREE.CylinderGeometry(r, r, len, 8).rotateZ(Math.PI / 2);
  mesh(geo, M.hull, parent, (x0 + x1) / 2, y, z);
  const collar = new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.3, 8).rotateZ(Math.PI / 2);
  for (let x = Math.min(x0, x1) + 1.2; x < Math.max(x0, x1) - 0.6; x += 3.2) mesh(collar, M.hullDark, parent, x, y, z, false);
}

function panelBlock(M, parent, x, z, w, h, d) {
  return mesh(new RoundedBoxGeometry(w, h, d, 2, 0.35), M.hull, parent, x, h / 2, z, true);
}

function solarPanel(M, parent, x, z, rotY = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rotY;
  const plate = mesh(new THREE.BoxGeometry(3.4, 0.08, 2.0), M.solar, g, 0, 0.9, 0);
  plate.rotation.x = -0.45;
  plate.updateMatrix();
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), M.metal, g, 0, 0.45, 0.35, false);
  parent.add(g);
}

function smallRover(M, parent, x, z, rotY) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rotY;
  mesh(new RoundedBoxGeometry(2.2, 0.9, 3.2, 2, 0.2), M.hull, g, 0, 1.15, 0);
  mesh(new THREE.BoxGeometry(1.6, 0.35, 1.8), M.solar, g, 0, 1.75, -0.2);
  const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.45, 10).rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) for (const wz of [-1.2, 0, 1.2]) mesh(wheel, M.metal, g, sx * 1.25, 0.5, wz);
  mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), M.alu, g, 0.7, 2.2, 1.0, false);
  parent.add(g);
}

export function createHabitat() {
  const M = makeMaterials();
  const group = new THREE.Group();
  const colliders = [];
  const col = (x, z, r) => colliders.push([x, z, r]);

  // --- Spine of drum modules, blocks and tunnels along X (z = 0) ---
  drumModule(M, group, -26, 0, 4.4, 3.4); col(-26, 0, 4.7);
  panelBlock(M, group, -17, 0, 4.6, 3.4, 4.6); col(-17, 0, 2.9);
  drumModule(M, group, -8, 0, 4.7, 3.4); col(-8, 0, 5.0);
  panelBlock(M, group, 4, 0, 5.2, 3.4, 4.6); col(4, 0, 3.1);
  tunnel(M, group, -21.6, -19.3, 0); tunnel(M, group, -14.7, -12.7, 0);
  tunnel(M, group, -3.3, 1.4, 0); tunnel(M, group, 6.6, 30, 0);
  for (let x = -12; x <= 30; x += 4) if (x > -3 && x < 2 === false) col(x, 0, 1.9);

  // --- Geodesic dome (translucent shell + white struts), north side of the spine ---
  const domeR = 9;
  const icoGeo = new THREE.IcosahedronGeometry(domeR, 2);
  const dome = new THREE.Group();
  dome.position.set(15, 0, 11);
  const shell = new THREE.Mesh(icoGeo, M.glass);
  shell.scale.y = 0.85;
  dome.add(shell);
  const struts = new THREE.LineSegments(
    new THREE.WireframeGeometry(icoGeo),
    new THREE.LineBasicMaterial({ color: 0xf4f2ec })
  );
  struts.scale.y = 0.85;
  dome.add(struts);
  // lower half is hidden by a floor skirt ring
  mesh(new THREE.CylinderGeometry(domeR * 1.02, domeR * 1.04, 0.8, 24), M.hullDark, dome, 0, 0.2, 0);
  group.add(dome);
  col(15, 11, domeR + 0.2);
  mesh(new THREE.CylinderGeometry(1.4, 1.4, 8.5, 8).rotateX(Math.PI / 2), M.hull, group, 15, 1.7, 6);

  // --- Vaulted greenhouse (ribbed half-cylinder) on the north side of the modules ---
  const ghLen = 22, ghR = 3.6;
  const gh = new THREE.Group();
  gh.position.set(-14, 0, 11);
  const vault = new THREE.CylinderGeometry(ghR, ghR, ghLen, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2);
  const vaultMesh = new THREE.Mesh(vault, M.glass);
  vaultMesh.rotation.set(0, 0, 0);
  gh.add(vaultMesh);
  const archGeo = new THREE.TorusGeometry(ghR, 0.08, 5, 14, Math.PI);
  for (let i = 0; i <= 6; i++) {
    const a = mesh(archGeo, M.rib, gh, -ghLen / 2 + (i * ghLen) / 6, 0, 0, false);
    a.rotation.y = Math.PI / 2;
    a.updateMatrix();
  }
  mesh(new THREE.BoxGeometry(ghLen, 0.25, ghR * 2), M.hullDark, gh, 0, 0.1, 0);
  // green crop rows hint
  const cropGeo = new THREE.BoxGeometry(ghLen - 3, 0.4, 0.9);
  for (let i = -1; i <= 1; i++) mesh(cropGeo, M.crop, gh, 0, 0.45, i * 1.6, false);
  group.add(gh);
  for (let x = -24; x <= -4; x += 4.5) col(-14 + (x + 14), 11, 3.9);
  mesh(new THREE.CylinderGeometry(1.4, 1.4, 8.0, 8).rotateX(Math.PI / 2), M.hull, group, -17, 1.7, 3.6);

  // --- East end: connector block and three tapered habitat pods ---
  panelBlock(M, group, 32, -6, 5.2, 3.6, 16); col(32, -6, 4.2); col(32, 0, 3.2); col(32, -11, 3.2);
  const podLen = 18;
  const bodyGeo = new THREE.CylinderGeometry(1.9, 1.9, podLen * 0.7, 8).rotateZ(Math.PI / 2);
  const noseGeo = new THREE.CylinderGeometry(0.5, 1.9, podLen * 0.3, 8).rotateZ(-Math.PI / 2);
  const bandGeo = new THREE.CylinderGeometry(1.98, 1.98, 0.22, 8).rotateZ(Math.PI / 2);
  const podWinGeo = new THREE.BoxGeometry(2.0, 0.6, 0.1);
  [[-0.5, 0], [-6, 0.0], [-11.5, 0]].forEach(([pz], i) => {
    const px = 36;
    const g = new THREE.Group();
    g.position.set(px, 0, pz);
    g.rotation.y = -0.06 * (i - 1);
    mesh(bodyGeo, M.hull, g, podLen * 0.35, 1.95, 0, true);
    mesh(noseGeo, M.hull, g, podLen * 0.7 + podLen * 0.15, 1.95, 0);
    for (let k = 1; k < 6; k++) mesh(bandGeo, M.hullDark, g, k * podLen * 0.115, 1.95, 0, false);
    mesh(podWinGeo, M.window, g, 4, 2.3, 1.78, false);
    group.add(g);
    for (let k = 0; k < 6; k++) col(px + 1 + k * 3.2, pz, 2.3);
  });

  // --- Equipment: solar field, green tanks, rovers, mast ---
  solarPanel(M, group, -30, -9, 0.3); solarPanel(M, group, -25, -11, 0.2); solarPanel(M, group, -4, -9, -0.2);
  solarPanel(M, group, 2, -10, -0.3); solarPanel(M, group, 14, -9, 0.1);
  const tankGeo = new THREE.CapsuleGeometry(0.8, 2.0, 4, 10).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-34, 5], [-33, 8]]) {
    mesh(tankGeo, M.tank, group, x, 0.9, z);
    col(x, z, 1.7);
  }
  smallRover(M, group, -33, -4, 0.5); col(-33, -4, 2.2);
  smallRover(M, group, 12, -6, 2.6); col(12, -6, 2.2);
  mesh(new THREE.CylinderGeometry(0.1, 0.18, 9, 6), M.alu, group, -8, 8, 0);
  mesh(new THREE.SphereGeometry(0.35, 8, 8), M.window, group, -8, 12.6, 0, false);

  return { group, colliders };
}

// Deep-space comms relay: big parabolic dish, lattice tower, shelters and a solar row
export function createRelayStation() {
  const M = makeMaterials();
  const group = new THREE.Group();
  const colliders = [];

  // Dish on a pylon
  const pivot = new THREE.Group();
  pivot.position.set(0, 7.5, 0);
  pivot.rotation.set(-0.9, 0.5, 0);
  const dish = mesh(new THREE.SphereGeometry(9, 24, 6, 0, Math.PI * 2, 0, 0.52).rotateX(Math.PI).translate(0, 9, 0), M.dishMat, pivot, 0, 0, 0);
  dish.scale.set(1, 0.55, 1);
  dish.updateMatrix();
  mesh(new THREE.TorusGeometry(4.5, 0.12, 5, 24).rotateX(Math.PI / 2), M.alu, pivot, 0, 0.66, 0, false);
  mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), M.metal, pivot, 0, 3.0, 0, false);
  mesh(new THREE.CylinderGeometry(0.4, 0.2, 0.5, 8), M.metal, pivot, 0, 6.1, 0, false);
  group.add(pivot);
  mesh(new THREE.CylinderGeometry(0.7, 1.1, 7.5, 8), M.hull, group, 0, 3.75, 0, true);
  mesh(new THREE.CylinderGeometry(2.0, 2.4, 0.8, 12), M.hullDark, group, 0, 0.4, 0);
  colliders.push([0, 0, 2.6]);

  // Lattice tower: 4 legs + cross bracing
  const tx = 14, tz = 2, H = 22;
  const leg = new THREE.CylinderGeometry(0.1, 0.1, H, 6);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const l = mesh(leg, M.alu, group, tx + sx * 1.0, H / 2, tz + sz * 1.0, false);
    l.rotation.z = -sx * 0.045; l.rotation.x = sz * 0.045;
    l.updateMatrix();
  }
  for (let y = 2; y < H; y += 3.5) {
    const s = 1.0 - (y / H) * 0.45;
    const bx = new THREE.BoxGeometry(s * 2, 0.07, 0.07);
    const bz = new THREE.BoxGeometry(0.07, 0.07, s * 2);
    mesh(bx, M.alu, group, tx, y, tz + s, false);
    mesh(bx, M.alu, group, tx, y, tz - s, false);
    mesh(bz, M.alu, group, tx + s, y, tz, false);
    mesh(bz, M.alu, group, tx - s, y, tz, false);
  }
  mesh(new THREE.SphereGeometry(0.35, 8, 6), M.beaconRed, group, tx, H + 0.4, tz, false);
  colliders.push([tx, tz, 1.9]);

  // Shipping-container shelters
  const shelterGeo = new RoundedBoxGeometry(6.4, 2.8, 2.5, 2, 0.1);
  const winGeo = new THREE.BoxGeometry(0.9, 0.5, 0.06);
  for (const [x, z, ry] of [[-12, 6, 0.1], [-12, 12, 0.1], [-6, 14, 1.4]]) {
    const c = mesh(shelterGeo, M.hull, group, x, 1.6, z, true);
    c.rotation.y = ry;
    c.updateMatrix();
    mesh(winGeo, M.window, c, 1.5, 0.2, 1.27, false);
    colliders.push([x, z, 3.3]);
  }
  // Fuel tanks + solar row
  const relayTankGeo = new THREE.CapsuleGeometry(1.1, 3.2, 4, 10).rotateZ(Math.PI / 2);
  for (const z of [-9, -12.5]) {
    mesh(relayTankGeo, M.tank, group, 10, 1.15, z);
    colliders.push([10, z, 2.5]);
  }
  for (let i = 0; i < 5; i++) solarPanel(M, group, -16 + i * 4.6, -9, 0);

  return { group, colliders };
}
