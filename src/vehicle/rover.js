import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Ground level in model space (physics keeps the model origin this far above the dune surface)
const GROUND = -0.95;
const H = (h) => GROUND + h; // convert "height above ground" to model-space Y
const UP = new THREE.Vector3(0, 1, 0);

// ---------- Procedural textures (no external assets) ----------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Painted, panelled, dust-weathered body texture
function createBodyTexture() {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const r = rand(77);

  // Warm off-white paint
  g.fillStyle = '#e6e3dc';
  g.fillRect(0, 0, S, S);

  // Subtle paint mottling
  for (let i = 0; i < 700; i++) {
    const a = 0.02 + r() * 0.04;
    g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(120,110,100,${a})`;
    const sz = 2 + r() * 8;
    g.fillRect(r() * S, r() * S, sz, sz);
  }

  // Panel seams and rivets
  g.strokeStyle = 'rgba(70,64,58,0.55)';
  g.lineWidth = 1.5;
  for (let x = 0; x <= S; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
  for (let y = 0; y <= S; y += 85) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }

  // Mars dust settled low and in a fine film everywhere
  const dust = g.createLinearGradient(0, 0, 0, S);
  dust.addColorStop(0.0, 'rgba(176,108,72,0.62)');
  dust.addColorStop(0.35, 'rgba(176,108,72,0.22)');
  dust.addColorStop(1.0, 'rgba(176,108,72,0.10)');
  g.fillStyle = dust;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 250; i++) {
    g.fillStyle = `rgba(150,92,60,${0.04 + r() * 0.08})`;
    g.fillRect(r() * S, S * 0.45 + r() * S * 0.55, 2 + r() * 6, 1 + r() * 4);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function createDecalTexture() {
  const c = makeCanvas(512, 128);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = '#d4521c';
  g.fillRect(0, 54, 512, 6);
  g.fillStyle = '#3a3a3e';
  g.font = '800 64px Arial, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('DUNES', 8, 28);
  g.font = '600 20px Arial, sans-serif';
  g.fillStyle = '#5a5a60';
  g.fillText('MARS EXPEDITION ROVER   //   DX-01', 10, 94);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createShadowTexture() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0.0, 'rgba(0,0,0,0.9)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function nonIndexed(g) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  }
  return out;
}

// Realistic Mars expedition rover: warm-white painted panelled body, gold thermal blankets,
// mast camera head, high-gain antenna, folded instrument arm, RTG, coil-over wishbone suspension and
// machined aluminium cleated wheels (Perseverance-style) with flex spokes.
export class MarsRoverModel {
  constructor() {
    this.group = new THREE.Group();
    this.wheelAssemblies = [];
    this.thrusterGlows = [];
    this.thrusterLights = [];
    this.headlights = [];
    this.chassisGroup = new THREE.Group();
    this.group.add(this.chassisGroup);

    this.buildRover();
  }

  strut(a, b, r, mat, parent = this.chassisGroup, seg = 8) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    parent.add(m);
    return m;
  }

  box(w, h, d, rad, mat, x, y, z, parent = this.chassisGroup, castShadow = false) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, rad), mat);
    m.position.set(x, y, z);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  buildRover() {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const bodyTex = createBodyTexture();

    // --- PBR materials ---
    const paint = new THREE.MeshStandardMaterial({ map: bodyTex, roughness: 0.55, metalness: 0.12 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.45, metalness: 0.85 });
    const aluminum = new THREE.MeshStandardMaterial({ color: 0xb9b5ae, roughness: 0.38, metalness: 0.92 });
    const dustyAlu = new THREE.MeshStandardMaterial({ color: 0xa79b90, roughness: 0.5, metalness: 0.85, side: THREE.DoubleSide });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd9a52e, roughness: 0.3, metalness: 1.0 });
    const lensGlass = new THREE.MeshStandardMaterial({ color: 0x07101a, roughness: 0.05, metalness: 0.95 });
    const springRed = new THREE.MeshStandardMaterial({ color: 0xcf3a1c, roughness: 0.4, metalness: 0.5 });
    const caliperMat = new THREE.MeshStandardMaterial({ color: 0xd4521c, roughness: 0.45, metalness: 0.5 });
    const lampLens = new THREE.MeshBasicMaterial({ color: 0xfff2d8 });
    const tailLens = new THREE.MeshStandardMaterial({ color: 0xff1a1a, emissive: 0xff1a1a, emissiveIntensity: 1.6, roughness: 0.3 });
    const nozzleBronze = new THREE.MeshStandardMaterial({ color: 0x6d4a39, roughness: 0.5, metalness: 0.9, emissive: 0x1a0a04 });

    const C = this.chassisGroup;

    // ==========================================
    // 1. BODY (painted aluminium monocoque)
    // ==========================================
    this.box(1.7, 0.56, 3.1, 0.12, paint, 0, H(1.08), 0, C, true);        // main body casts shadow
    this.box(1.5, 0.36, 0.62, 0.12, paint, 0, H(0.96), 1.62, C, true);    // nose cowl
    this.box(1.56, 0.16, 3.0, 0.05, darkMetal, 0, H(0.76), 0);            // belly armour plate
    this.box(1.62, 0.05, 2.5, 0.02, darkMetal, 0, H(1.395), -0.1);        // top deck plate

    // Warm electronics box with raised vents
    this.box(1.0, 0.26, 0.9, 0.06, paint, 0, H(1.55), 0.62, C, true);
    for (let i = 0; i < 6; i++) {
      this.box(0.8, 0.012, 0.025, 0.004, darkMetal, 0, H(1.685), 0.34 + i * 0.1);
    }

    // Gold thermal blanket over the avionics bay
    const blanket = this.box(1.3, 0.12, 0.85, 0.05, gold, 0, H(1.48), -0.78);
    blanket.rotation.x = -0.04;

    // Rock sliders along the sides
    for (const sx of [-1, 1]) {
      this.strut(V(sx * 0.93, H(0.64), 1.2), V(sx * 0.93, H(0.64), -1.2), 0.045, darkMetal);
      this.strut(V(sx * 0.93, H(0.64), 0.7), V(sx * 0.82, H(0.86), 0.7), 0.03, darkMetal);
      this.strut(V(sx * 0.93, H(0.64), -0.7), V(sx * 0.82, H(0.86), -0.7), 0.03, darkMetal);
    }

    // Side decals
    const decalMat = new THREE.MeshBasicMaterial({ map: createDecalTexture(), transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.325), decalMat);
      d.position.set(sx * 0.855, H(1.1), 0.1);
      d.rotation.y = sx * Math.PI / 2;
      C.add(d);
    }

    // ==========================================
    // 2. MAST + CAMERA HEAD
    // ==========================================
    const mastX = 0.55, mastZ = 0.1;
    this.strut(V(mastX, H(1.42), mastZ), V(mastX, H(2.45), mastZ), 0.035, aluminum);
    this.strut(V(mastX, H(1.42), mastZ), V(mastX, H(1.6), mastZ), 0.07, darkMetal);   // base collar
    this.box(0.36, 0.2, 0.22, 0.05, paint, mastX, H(2.55), mastZ, C, true);
    const bezelGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12);
    const glassGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.04, 12);
    for (const ex of [-0.1, 0.1]) {
      const bezel = new THREE.Mesh(bezelGeo, darkMetal);
      bezel.rotation.x = Math.PI / 2;
      bezel.position.set(mastX + ex, H(2.55), mastZ + 0.13);
      C.add(bezel);
      const glass = new THREE.Mesh(glassGeo, lensGlass);
      glass.rotation.x = Math.PI / 2;
      glass.position.set(mastX + ex, H(2.55), mastZ + 0.16);
      C.add(glass);
    }
    // SuperCam style cylinder on top
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.24, 12), aluminum);
    sc.rotation.x = Math.PI / 2;
    sc.position.set(mastX, H(2.7), mastZ + 0.02);
    C.add(sc);
    const scLens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), lensGlass);
    scLens.rotation.x = Math.PI / 2;
    scLens.position.set(mastX, H(2.7), mastZ + 0.15);
    C.add(scLens);

    // ==========================================
    // 3. ANTENNAS
    // ==========================================
    this.strut(V(-0.55, H(1.42), -0.5), V(-0.55, H(1.95), -0.5), 0.028, aluminum);
    const hga = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 6), dustyAlu);
    hga.position.set(-0.55, H(2.02), -0.5);
    hga.rotation.x = -0.9;
    C.add(hga);
    const hgaBack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.012, 6), darkMetal);
    hgaBack.position.copy(hga.position);
    hgaBack.rotation.x = -0.9;
    hgaBack.translateY(0.02);
    C.add(hgaBack);
    this.strut(V(-0.2, H(1.42), -0.95), V(-0.2, H(2.15), -0.95), 0.012, darkMetal, C, 6);

    // ==========================================
    // 4. FRONT: HAZCAMS, FOLDED INSTRUMENT ARM, LAMPS
    // ==========================================
    const hazLensGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10);
    for (const sx of [-1, 1]) {
      this.box(0.16, 0.1, 0.08, 0.025, darkMetal, sx * 0.5, H(1.12), 1.93);
      const lens = new THREE.Mesh(hazLensGeo, lensGlass);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(sx * 0.5, H(1.12), 1.98);
      C.add(lens);
    }

    // Folded instrument arm with turret
    const armJ = new THREE.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.4, metalness: 0.9 });
    const sh = V(0.38, H(1.0), 1.86);
    const el = V(0.38, H(0.92), 2.2);
    const wr = V(0.08, H(0.78), 2.1);
    this.strut(sh, el, 0.045, aluminum);
    this.strut(el, wr, 0.04, aluminum);
    const armJointGeo = new THREE.SphereGeometry(0.07, 10, 8);
    for (const p of [sh, el, wr]) {
      const j = new THREE.Mesh(armJointGeo, armJ);
      j.position.copy(p);
      C.add(j);
    }
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.14, 12), darkMetal);
    turret.rotation.x = Math.PI / 2;
    turret.position.set(0.08, H(0.78), 2.2);
    C.add(turret);
    const drill = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 8), aluminum);
    drill.rotation.x = Math.PI / 2;
    drill.position.set(0.08, H(0.78), 2.38);
    C.add(drill);

    // Headlamps: round LED housings with lenses (SpotLights off by default in daytime to save GPU lighting loops; toggle with L)
    const spotMatCfg = { color: 0xfff6ea, intensity: 3.2, dist: 80 };
    const housingGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.1, 14);
    const lampCircleGeo = new THREE.CircleGeometry(0.085, 14);
    for (const sx of [-1, 1]) {
      const housing = new THREE.Mesh(housingGeo, darkMetal);
      housing.rotation.x = Math.PI / 2;
      housing.position.set(sx * 0.66, H(0.96), 1.96);
      C.add(housing);
      const lens = new THREE.Mesh(lampCircleGeo, lampLens);
      lens.position.set(sx * 0.66, H(0.96), 2.011);
      C.add(lens);

      const spot = new THREE.SpotLight(spotMatCfg.color, spotMatCfg.intensity, spotMatCfg.dist, Math.PI * 0.26, 0.45, 1.2);
      spot.position.set(sx * 0.66, H(0.96), 2.05);
      spot.target.position.set(sx * 0.66, H(0.2), 30);
      spot.visible = false; // Default off in Martian daylight; player can press L to toggle
      C.add(spot);
      C.add(spot.target);
      this.headlights.push(spot);
    }

    // ==========================================
    // 5. REAR: RTG, TAIL LIGHTS, NITRO THRUSTER POD FRAME
    // ==========================================
    const rtg = new THREE.Group();
    rtg.position.set(0, H(1.3), -1.82);
    rtg.rotation.x = 0.22;
    const rtgBody = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.85, 12), paint);
    rtgBody.rotation.x = Math.PI / 2;
    rtg.add(rtgBody);
    const finGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.018, 12);
    for (let i = 0; i < 8; i++) {
      const fin = new THREE.Mesh(finGeo, aluminum);
      fin.rotation.x = Math.PI / 2;
      fin.position.z = -0.34 + i * 0.1;
      rtg.add(fin);
    }
    C.add(rtg);

    for (const sx of [-1, 1]) {
      this.box(0.22, 0.07, 0.04, 0.015, tailLens, sx * 0.62, H(1.0), -1.575);
    }

    // Thruster pods bolted to a rear sub-frame
    const nozzleOuterGeo = new THREE.CylinderGeometry(0.26, 0.34, 0.8, 16);
    nozzleOuterGeo.rotateX(Math.PI / 2);
    const nozzleInnerGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.82, 16);
    nozzleInnerGeo.rotateX(Math.PI / 2);
    const nozzleY = H(0.7);
    for (const sx of [-1, 1]) {
      const outer = new THREE.Mesh(nozzleOuterGeo, darkMetal);
      outer.position.set(sx * 0.62, nozzleY, -2.4);
      C.add(outer);
      const inner = new THREE.Mesh(nozzleInnerGeo, nozzleBronze);
      inner.position.set(sx * 0.62, nozzleY, -2.4);
      C.add(inner);
      // Frame struts back to the body
      this.strut(V(sx * 0.7, H(0.95), -1.55), V(sx * 0.62, nozzleY + 0.22, -2.15), 0.03, aluminum);
      this.strut(V(sx * 0.7, H(0.62), -1.5), V(sx * 0.62, nozzleY - 0.22, -2.15), 0.03, aluminum);
    }
    this.strut(V(-0.62, nozzleY + 0.1, -2.05), V(0.62, nozzleY + 0.1, -2.05), 0.035, darkMetal);

    // Thruster exit glow discs (only visible while boosting)
    const glowGeo = new THREE.CircleGeometry(0.2, 14);
    glowGeo.rotateY(Math.PI);
    const mkGlow = (sx) => {
      const m = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
        color: 0xffa050, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      m.position.set(sx * 0.62, nozzleY, -2.82);
      m.visible = false;
      C.add(m);
      return m;
    };
    this.thrusterGlows = [mkGlow(-1), mkGlow(1)];

    // ==========================================
    // 6. WHEELS + COIL-OVER WISHBONE SUSPENSION
    // ==========================================
    const R = 0.56;       // wheel radius
    const W = 0.5;        // wheel width

    // --- shared wheel geometry (axis = X) ---
    const drumGeo = new THREE.CylinderGeometry(R, R, W, 28, 1, true);
    drumGeo.rotateZ(Math.PI / 2);

    // Chevron grousers + rim flanges (merged)
    const cleatParts = [];
    const cleatBase = new THREE.BoxGeometry(W * 0.56, 0.055, 0.04);
    const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mC = new THREE.Matrix4();
    const cleatCount = 24;
    for (let i = 0; i < cleatCount; i++) {
      const a = (i / cleatCount) * Math.PI * 2;
      for (const s of [-1, 1]) {
        mA.makeRotationX(a);
        mB.makeTranslation(s * W * 0.25, R + 0.012, 0);
        mC.makeRotationY(s * 0.55);
        const g = cleatBase.clone();
        g.applyMatrix4(mA.clone().multiply(mB).multiply(mC));
        cleatParts.push(nonIndexed(g));
      }
    }
    for (const s of [-1, 1]) {
      const t = new THREE.TorusGeometry(R - 0.002, 0.024, 6, 28);
      t.rotateY(Math.PI / 2);
      t.translate(s * W * 0.5, 0, 0);
      cleatParts.push(nonIndexed(t));
    }
    const cleatsGeo = mergeGeometries(cleatParts, false);

    // Flex spokes + hub (merged)
    const spokeParts = [];
    const spokeBase = new THREE.BoxGeometry(0.035, R * 0.8, 0.055);
    const spokeCount = 8;
    for (const s of [-1, 1]) {
      for (let i = 0; i < spokeCount; i++) {
        const a = (i / spokeCount) * Math.PI * 2 + (s > 0 ? 0 : Math.PI / spokeCount);
        const g = spokeBase.clone();
        g.translate(0, 0.14 + R * 0.4, 0);
        g.rotateX(a);
        g.translate(s * 0.13, 0, 0);
        spokeParts.push(nonIndexed(g));
      }
    }
    const spokesGeo = mergeGeometries(spokeParts, false);

    const hubGeo = new THREE.CylinderGeometry(0.17, 0.17, W * 0.62, 16);
    hubGeo.rotateZ(Math.PI / 2);
    const hubCapGeo = new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    hubCapGeo.rotateZ(-Math.PI / 2);

    const discGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.02, 20);
    discGeo.rotateZ(Math.PI / 2);

    // Spring helix (unit height along Y, scaled per use)
    const helixPts = [];
    const turns = 6;
    for (let i = 0; i <= turns * 10; i++) {
      const t = i / (turns * 10);
      const a = t * turns * Math.PI * 2;
      helixPts.push(new THREE.Vector3(Math.cos(a) * 0.075, t - 0.5, Math.sin(a) * 0.075));
    }
    const springGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helixPts), turns * 10, 0.012, 4, false);

    const wheelPositions = [
      { x: -1.48, z:  1.42, isFront: true  },  // FL
      { x:  1.48, z:  1.42, isFront: true  },  // FR
      { x: -1.48, z: -1.42, isFront: false },  // RL
      { x:  1.48, z: -1.42, isFront: false }   // RR
    ];

    this.wheelAssemblies = [];
    const wy = H(0.55);

    const caliperGeo = new RoundedBoxGeometry(0.07, 0.16, 0.12, 1, 0.02);

    for (const wp of wheelPositions) {
      const sx = Math.sign(wp.x);
      const sz = Math.sign(wp.z);
      const z0 = wp.z;

      // Suspension: double wishbone from body to hub
      const hubTop = V(sx * 1.2, wy + 0.2, z0);
      const hubBot = V(sx * 1.2, wy - 0.22, z0);
      this.strut(V(sx * 0.86, H(1.0), z0 - sz * 0.32), hubTop, 0.032, aluminum);
      this.strut(V(sx * 0.86, H(1.0), z0 + sz * 0.1), hubTop, 0.032, aluminum);
      this.strut(V(sx * 0.82, H(0.72), z0 - sz * 0.36), hubBot, 0.036, aluminum);
      this.strut(V(sx * 0.82, H(0.72), z0 + sz * 0.12), hubBot, 0.036, aluminum);
      // Knuckle / upright
      this.strut(hubTop, hubBot, 0.045, darkMetal);

      // Coil-over damper: body top -> lower arm
      const top = V(sx * 0.78, H(1.3), z0 - sz * 0.06);
      const bot = V(sx * 1.08, wy - 0.18, z0 - sz * 0.02);
      this.strut(top, bot, 0.026, darkMetal, C, 6);
      const spring = new THREE.Mesh(springGeo, springRed);
      const d = new THREE.Vector3().subVectors(bot, top);
      spring.position.copy(top).addScaledVector(d, 0.58);
      spring.scale.set(1, d.length() * 0.62, 1);
      spring.quaternion.setFromUnitVectors(UP, d.clone().normalize());
      C.add(spring);

      // Steering / wheel pivot at the wheel centre
      const pivot = new THREE.Group();
      pivot.position.set(wp.x, wy, z0);
      this.group.add(pivot);

      const wheelContainer = new THREE.Group();
      pivot.add(wheelContainer);

      const drum = new THREE.Mesh(drumGeo, dustyAlu);
      drum.castShadow = true;
      wheelContainer.add(drum);
      const cleats = new THREE.Mesh(cleatsGeo, dustyAlu);
      wheelContainer.add(cleats);
      const spokes = new THREE.Mesh(spokesGeo, aluminum);
      wheelContainer.add(spokes);
      const hub = new THREE.Mesh(hubGeo, darkMetal);
      wheelContainer.add(hub);
      const cap = new THREE.Mesh(hubCapGeo, aluminum);
      cap.position.x = sx * W * 0.31;
      if (sx < 0) cap.rotation.y = Math.PI;
      wheelContainer.add(cap);

      // Brake disc inside the wheel and a coloured caliper
      const disc = new THREE.Mesh(discGeo, darkMetal);
      disc.position.x = -sx * 0.14;
      wheelContainer.add(disc);
      const caliper = new THREE.Mesh(caliperGeo, caliperMat);
      caliper.position.set(-sx * 0.16, 0.25, 0.0);
      pivot.add(caliper);

      this.wheelAssemblies.push({
        pivot,
        wheelContainer,
        restPos: new THREE.Vector3(wp.x, wy, z0),
        isFront: wp.isFront,
        rotation: 0
      });
    }

    // ==========================================
    // 7. CONTACT SHADOW (terrain does not receive real-time shadows)
    // ==========================================
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.0, 5.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: createShadowTexture(),
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -6
      })
    );
    shadow.position.set(0, GROUND + 0.04, -0.1);
    shadow.renderOrder = 3;
    this.group.add(shadow);
    this.contactShadow = shadow;
  }

  setNitroVisuals(active, intensity = 1.0) {
    const opacity = active ? THREE.MathUtils.clamp(intensity * 0.95, 0.35, 1.0) : 0.0;
    for (const glow of this.thrusterGlows) {
      glow.visible = active;
      if (active) glow.material.opacity = opacity;
    }
  }
}
