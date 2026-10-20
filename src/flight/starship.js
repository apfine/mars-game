import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

function canvasTexture(canvas, { repeatX = 1, repeatY = 1, srgb = false, anisotropy = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

// Convert a grayscale height canvas into a tangent-space normal map once at load time.
// This is far cheaper than re-deriving surface normals from a bump map every frame.
function heightToNormalCanvas(heightCanvas, strength = 2.4) {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d');
  const out = outCtx.createImageData(w, h);
  const d = out.data;

  for (let y = 0; y < h; y++) {
    const yRow = y * w;
    const yUp = ((y - 1 + h) % h) * w;
    const yDn = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const hL = src[(yRow + ((x - 1 + w) % w)) * 4];
      const hR = src[(yRow + ((x + 1) % w)) * 4];
      const hU = src[(yUp + x) * 4];
      const hD = src[(yDn + x) * 4];

      let nx = (hL - hR) * (strength / 255);
      let ny = (hD - hU) * (strength / 255);
      let nz = 1.0;
      const inv = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv; ny *= inv; nz *= inv;

      const i = (yRow + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }

  outCtx.putImageData(out, 0, 0);
  return outCanvas;
}

function createSteelMaps() {
  if (_cachedSteelMaps) return _cachedSteelMaps;
  const S = 512;
  const colorCanvas = document.createElement('canvas');
  const heightCanvas = document.createElement('canvas');
  const ormCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = S;
  heightCanvas.width = heightCanvas.height = S;
  ormCanvas.width = ormCanvas.height = S;

  const g = colorCanvas.getContext('2d');
  const hg = heightCanvas.getContext('2d');
  const og = ormCanvas.getContext('2d');

  // 304L cold-rolled stainless steel base. ORM = R:AO, G:roughness, B:metalness.
  const base = 216;
  g.fillStyle = `rgb(${base}, ${base + 1}, ${base + 3})`;
  g.fillRect(0, 0, S, S);
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, S, S);
  og.fillStyle = 'rgb(255, 58, 246)';
  og.fillRect(0, 0, S, S);

  // Barrel ring-by-ring reflectance variation & staggered vertical panel seams
  const ringH = 64;
  for (let r = 0; r < S / ringH; r++) {
    const shade = base + ((r * 29) % 14) - 7;
    g.fillStyle = `rgb(${shade}, ${shade + 1}, ${shade + 3})`;
    g.fillRect(0, r * ringH, S, ringH);

    // Faint horizontal mill finish banding within each ring
    for (let band = 0; band < 3; band++) {
      const by = r * ringH + 8 + band * 18;
      g.fillStyle = band % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(60,64,72,0.025)';
      g.fillRect(0, by, S, 9);
    }

    const numPanels = 4;
    const offset = (r % 2) * 64;
    for (let p = 0; p < numPanels; p++) {
      const px = (p * (S / numPanels) + offset) % S;
      g.fillStyle = 'rgba(64, 68, 76, 0.55)';
      g.fillRect(px, r * ringH, 2, ringH);
      hg.fillStyle = '#4a4a4a';
      hg.fillRect(px, r * ringH, 2, ringH);
      og.fillStyle = 'rgb(255, 150, 208)';
      og.fillRect(px, r * ringH, 2, ringH);
    }
  }

  // Fine anisotropic brushed grain (vertical polish marks)
  for (let i = 0; i < 1700; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const w = 1 + Math.random() * 2.5;
    const h = 20 + Math.random() * 75;
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(85,90,100,0.07)';
    g.fillRect(x, y, w, h);
    hg.fillStyle = Math.random() > 0.5 ? 'rgba(215,215,215,0.10)' : 'rgba(55,55,55,0.10)';
    hg.fillRect(x, y, w, h);
  }

  // Large faint oxidation / handling smudges for varied roughness under the sun
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const rad = 35 + Math.random() * 110;
    const cg = g.createRadialGradient(x, y, 0, x, y, rad);
    cg.addColorStop(0, 'rgba(122, 118, 106, 0.055)');
    cg.addColorStop(1, 'rgba(122, 118, 106, 0)');
    g.fillStyle = cg;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);

    const org = og.createRadialGradient(x, y, 0, x, y, rad);
    org.addColorStop(0, 'rgba(255, 112, 228, 0.10)');
    org.addColorStop(1, 'rgba(255, 58, 246, 0)');
    og.fillStyle = org;
    og.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Circumferential weld seams with heat-affected zone (HAZ) gold/blue tint
  for (let y = 0; y <= S; y += ringH) {
    const hazGrad = g.createLinearGradient(0, y - 5, 0, y + 5);
    hazGrad.addColorStop(0, 'rgba(180, 165, 140, 0.0)');
    hazGrad.addColorStop(0.35, 'rgba(165, 145, 115, 0.30)');
    hazGrad.addColorStop(0.5, 'rgba(55, 60, 68, 0.80)');
    hazGrad.addColorStop(0.65, 'rgba(135, 150, 175, 0.26)');
    hazGrad.addColorStop(1, 'rgba(180, 165, 140, 0.0)');
    g.fillStyle = hazGrad;
    g.fillRect(0, y - 5, S, 10);

    hg.fillStyle = '#e2e2e2';
    hg.fillRect(0, y - 1, S, 2);
    hg.fillStyle = '#565656';
    hg.fillRect(0, y + 1, S, 1);
    og.fillStyle = 'rgba(255, 138, 214, 0.75)';
    og.fillRect(0, y - 1, S, 3);
  }

  // A few deep handling scratches (break up the perfect cylinder highlight)
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const len = 8 + Math.random() * 46;
    g.strokeStyle = `rgba(255,255,255,${0.035 + Math.random() * 0.05})`;
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 3, y + len);
    g.stroke();
  }

  const map = canvasTexture(colorCanvas, { repeatX: 3, repeatY: 7, srgb: true });
  const normalMap = canvasTexture(heightToNormalCanvas(heightCanvas, 2.6), { repeatX: 3, repeatY: 7 });
  const ormMap = canvasTexture(ormCanvas, { repeatX: 3, repeatY: 7 });

  _cachedSteelMaps = { map, normalMap, ormMap };
  return _cachedSteelMaps;
}

let _cachedHeatshieldMaps = null;
function createHeatshieldMaps() {
  if (_cachedHeatshieldMaps) return _cachedHeatshieldMaps;
  const S = 256;
  const colorCanvas = document.createElement('canvas');
  const heightCanvas = document.createElement('canvas');
  const ormCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = S;
  heightCanvas.width = heightCanvas.height = S;
  ormCanvas.width = ormCanvas.height = S;

  const g = colorCanvas.getContext('2d');
  const hg = heightCanvas.getContext('2d');
  const og = ormCanvas.getContext('2d');

  g.fillStyle = '#121318';
  g.fillRect(0, 0, S, S);
  hg.fillStyle = '#303030';
  hg.fillRect(0, 0, S, S);
  og.fillStyle = 'rgb(255, 205, 28)';
  og.fillRect(0, 0, S, S);

  // Interlocking hexagonal TUFROC ceramic tiles with individual tile variation
  const r = 10;
  const h = r * Math.sqrt(3);
  let idx = 0;
  for (let y = -h; y < S + h; y += h) {
    for (let x = -r * 3; x < S + r * 3; x += r * 3) {
      drawHexTile(g, hg, og, x, y, r, idx++);
      drawHexTile(g, hg, og, x + r * 1.5, y + h / 2, r, idx++);
    }
  }

  // Soot wash and re-entry streaks baked into the albedo
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const rad = 12 + Math.random() * 42;
    const soot = g.createRadialGradient(x, y, 0, x, y, rad);
    soot.addColorStop(0, `rgba(8, 8, 10, ${0.08 + Math.random() * 0.14})`);
    soot.addColorStop(1, 'rgba(8, 8, 10, 0)');
    g.fillStyle = soot;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * S;
    g.strokeStyle = `rgba(10, 9, 8, ${0.06 + Math.random() * 0.12})`;
    g.lineWidth = 1 + Math.random() * 5;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + (Math.random() - 0.5) * 18, S);
    g.stroke();
  }

  const map = canvasTexture(colorCanvas, { repeatX: 5, repeatY: 14, srgb: true });
  const normalMap = canvasTexture(heightToNormalCanvas(heightCanvas, 2.2), { repeatX: 5, repeatY: 14 });
  const ormMap = canvasTexture(ormCanvas, { repeatX: 5, repeatY: 14 });

  _cachedHeatshieldMaps = { map, normalMap, ormMap };
  return _cachedHeatshieldMaps;
}

function drawHexTile(g, hg, og, x, y, r, seed) {
  const shade = 18 + ((seed * 29) % 14);
  g.fillStyle = `rgb(${shade}, ${shade + 1}, ${shade + 3})`;
  g.strokeStyle = '#05060a';
  g.lineWidth = 1.5;

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

  // Occasional chipped / oxidized tile face catches the light differently
  if (seed % 17 === 0) {
    g.fillStyle = 'rgba(78, 65, 54, 0.18)';
    g.beginPath();
    g.arc(x + 1.5, y - 1, r * 0.45, 0, Math.PI * 2);
    g.fill();
  }

  // Raised ceramic pillow in height map with recessed expansion gap
  const bShade = 182 + ((seed * 13) % 32);
  hg.fillStyle = `rgb(${bShade}, ${bShade}, ${bShade})`;
  hg.strokeStyle = '#161616';
  hg.lineWidth = 1.9;
  hg.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const px = x + (r - 0.9) * Math.cos(a);
    const py = y + (r - 0.9) * Math.sin(a);
    if (i === 0) hg.moveTo(px, py);
    else hg.lineTo(px, py);
  }
  hg.closePath();
  hg.fill();
  hg.stroke();

  // Ceramic roughness / metalness per tile
  const rough = 192 + ((seed * 23) % 34);
  og.fillStyle = `rgb(255, ${rough}, ${22 + ((seed * 7) % 12)})`;
  og.strokeStyle = 'rgb(255, 244, 44)';
  og.lineWidth = 1.8;
  og.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const px = x + (r - 1.0) * Math.cos(a);
    const py = y + (r - 1.0) * Math.sin(a);
    if (i === 0) og.moveTo(px, py);
    else og.lineTo(px, py);
  }
  og.closePath();
  og.fill();
  og.stroke();
}

let _cachedFrostMap = null;
function createFrostMap() {
  if (_cachedFrostMap) return _cachedFrostMap;
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, S, S);

  // Cryogenic condensation patches
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const rad = 9 + Math.random() * 46;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(228, 242, 255, ${0.10 + Math.random() * 0.22})`);
    grad.addColorStop(0.55, 'rgba(210, 232, 252, 0.07)');
    grad.addColorStop(1, 'rgba(210, 232, 252, 0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Vertical run-off streaks of condensed moisture
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const w = 0.8 + Math.random() * 3.2;
    const h = 8 + Math.random() * 70;
    g.fillStyle = `rgba(236, 246, 255, ${0.035 + Math.random() * 0.11})`;
    g.fillRect(x, y, w, h);
  }

  _cachedFrostMap = canvasTexture(canvas, { repeatX: 2, repeatY: 3, srgb: true });
  return _cachedFrostMap;
}

// -------------------------------------------------------------
// Draw-call optimiser: bakes every eligible static mesh in a group into a
// single mesh per material. This funds the extra surface detail with fewer
// draw calls than before, so the added realism does not cost frame time.
// -------------------------------------------------------------
function mergeStaticGroup(root, skipRoots = []) {
  if (!root) return [];
  root.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const isSkipped = (obj) => {
    let p = obj;
    while (p) {
      if (p.userData && p.userData.noMerge) return true;
      if (skipRoots.indexOf(p) !== -1) return true;
      if (p === root) break;
      p = p.parent;
    }
    return false;
  };

  const collect = [];
  root.traverse((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh || obj.isSkinnedMesh) return;
    if (!obj.geometry || !obj.material || Array.isArray(obj.material)) return;
    if (isSkipped(obj)) return;
    collect.push(obj);
  });

  const buckets = new Map();
  const toLocal = new THREE.Matrix4();
  for (const mesh of collect) {
    let bucket = buckets.get(mesh.material.uuid);
    if (!bucket) {
      bucket = { material: mesh.material, meshes: [], geometries: [], castShadow: false, receiveShadow: false };
      buckets.set(mesh.material.uuid, bucket);
    }
    toLocal.multiplyMatrices(invRoot, mesh.matrixWorld);
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(toLocal);
    bucket.meshes.push(mesh);
    bucket.geometries.push(geo);
    bucket.castShadow = bucket.castShadow || mesh.castShadow;
    bucket.receiveShadow = bucket.receiveShadow || mesh.receiveShadow;
  }

  const mergedOriginals = new Set();
  for (const bucket of buckets.values()) {
    if (bucket.geometries.length < 2) {
      bucket.geometries.forEach((geo) => geo.dispose());
      continue;
    }

    // mergeGeometries requires a consistent index/attribute layout.
    const indexedCount = bucket.geometries.filter((geo) => geo.index).length;
    if (indexedCount > 0 && indexedCount < bucket.geometries.length) {
      for (let i = 0; i < bucket.geometries.length; i++) {
        if (bucket.geometries[i].index) {
          const nonIndexed = bucket.geometries[i].toNonIndexed();
          bucket.geometries[i].dispose();
          bucket.geometries[i] = nonIndexed;
        }
      }
    }

    const mergedGeo = mergeGeometries(bucket.geometries, false);
    bucket.geometries.forEach((geo) => geo.dispose());
    if (!mergedGeo) continue;

    const mergedMesh = new THREE.Mesh(mergedGeo, bucket.material);
    mergedMesh.castShadow = bucket.castShadow;
    mergedMesh.receiveShadow = bucket.receiveShadow;
    mergedMesh.name = `merged_${bucket.material.name || bucket.material.uuid.slice(0, 6)}`;
    root.add(mergedMesh);
    bucket.meshes.forEach((mesh) => mergedOriginals.add(mesh));
  }

  for (const mesh of mergedOriginals) {
    if (mesh.parent) mesh.parent.remove(mesh);
  }
  return mergedOriginals;
}

// Tangent-ogive nose profile (true Starship silhouette, not a cosine cone)
function makeOgiveProfile(radius, length, steps = 22) {
  const rho = (radius * radius + length * length) / (2 * radius);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const axial = t * length;
    const r = Math.sqrt(Math.max(0, rho * rho - axial * axial)) + radius - rho;
    pts.push(new THREE.Vector2(Math.max(0, r), axial));
  }
  return pts;
}

// Slightly chamfered flap so its edge catches a real specular highlight
function makeBeveledFlapGeometry(width, height, depth) {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  const rad = Math.min(width * 0.28, 0.12);
  shape.moveTo(-w + rad, -h);
  shape.lineTo(w - rad, -h);
  shape.quadraticCurveTo(w, -h, w, -h + rad);
  shape.lineTo(w, h - rad);
  shape.quadraticCurveTo(w, h, w - rad, h);
  shape.lineTo(-w + rad, h);
  shape.quadraticCurveTo(-w, h, -w, h - rad);
  shape.lineTo(-w, -h + rad);
  shape.quadraticCurveTo(-w, -h, -w + rad, -h);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: Math.min(0.05, width * 0.2),
    bevelThickness: Math.min(0.05, width * 0.2),
    bevelSegments: 1,
    curveSegments: 3,
    steps: 1
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

// Volumetric-looking engine plume shader (replaces flat additive cylinders).
function createPlumeMaterial({ core = 0xffffff, mid = 0xffaa33, outer = 0xff4411, vacuum = false } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uThrottle: { value: 0 },
      uCore: { value: new THREE.Color(core) },
      uMid: { value: new THREE.Color(mid) },
      uOuter: { value: new THREE.Color(outer) },
      uVacuum: { value: vacuum ? 1 : 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vUv = uv;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uThrottle;
      uniform vec3 uCore;
      uniform vec3 uMid;
      uniform vec3 uOuter;
      uniform float uVacuum;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;

      void main() {
        if (uThrottle <= 0.004) discard;
        float t = 1.0 - vUv.y;
        float ang = vUv.x * 6.2831853;
        float turb = sin(ang * 3.0 + uTime * 47.0) * sin(ang * 5.0 - uTime * 31.0 + 1.7);
        float flicker = 0.82 + 0.18 * turb;
        float diamonds = pow(max(0.0, sin(t * 34.0 - uTime * 20.0)), 8.0) * smoothstep(0.0, 0.10, t) * (1.0 - t);
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.4);
        float body = smoothstep(0.0, 0.055, t) * pow(1.0 - t, 1.22);
        vec3 col = mix(uCore, uMid, smoothstep(0.0, 0.45, t));
        col = mix(col, uOuter, smoothstep(0.45, 1.0, t));
        col += uCore * diamonds * 1.5;
        col *= (1.0 + uVacuum * 0.35) * (1.25 + fres * 0.9);
        float alpha = (body * (0.42 + fres * 0.95) * flicker + diamonds * 0.85) * uThrottle;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }
    `
  });
}

export class StarshipMissionVehicle {
  constructor() {
    this.group = new THREE.Group();

    // High-Resolution Procedural PBR textures: albedo + normal + packed ORM.
    // The normal/ORM pair gives the steel believable weld relief and roughness
    // breakup, while the environment map supplies real sky reflections.
    const steelMaps = createSteelMaps();
    const heatshieldMaps = createHeatshieldMaps();
    const frostMap = createFrostMap();

    this.matSteel = new THREE.MeshStandardMaterial({
      map: steelMaps.map,
      normalMap: steelMaps.normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: steelMaps.ormMap,
      metalnessMap: steelMaps.ormMap,
      roughness: 1.0,
      metalness: 1.0,
      envMapIntensity: 1.35,
      dithering: true
    });

    this.matHeatshield = new THREE.MeshStandardMaterial({
      map: heatshieldMaps.map,
      normalMap: heatshieldMaps.normalMap,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: heatshieldMaps.ormMap,
      metalnessMap: heatshieldMaps.ormMap,
      roughness: 1.0,
      metalness: 1.0,
      envMapIntensity: 0.55,
      dithering: true
    });

    this.matCryoFrost = new THREE.MeshStandardMaterial({
      map: frostMap,
      color: 0xf2f8ff,
      metalness: 0.08,
      roughness: 0.55,
      envMapIntensity: 0.45,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
      dithering: true
    });

    this.matDarkMetal = new THREE.MeshStandardMaterial({
      color: 0x24262c,
      metalness: 0.82,
      roughness: 0.42,
      envMapIntensity: 0.9,
      dithering: true
    });

    this.matRaptorBell = new THREE.MeshStandardMaterial({
      color: 0x3d424b,
      metalness: 0.9,
      roughness: 0.38,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide,
      dithering: true
    });

    this.matTower = new THREE.MeshStandardMaterial({
      color: 0x32353b,
      metalness: 0.72,
      roughness: 0.56,
      envMapIntensity: 0.8
    });

    this.matGridFin = new THREE.MeshStandardMaterial({
      color: 0x1b1c20,
      metalness: 0.92,
      roughness: 0.45,
      wireframe: true
    });

    this.matConcrete = new THREE.MeshStandardMaterial({
      color: 0x48423c,
      roughness: 0.95,
      metalness: 0.02,
      envMapIntensity: 0.4
    });

    this.matWhiteTank = new THREE.MeshStandardMaterial({
      color: 0xe6e4e0,
      roughness: 0.38,
      metalness: 0.55,
      envMapIntensity: 1.0
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

    this._fxTime = 0;
    this._padWorldPos = new THREE.Vector3();
    this._cryoMeshes = [];
    this.group.traverse((obj) => {
      if (obj.isMesh && obj.material === this.matCryoFrost) this._cryoMeshes.push(obj);
    });
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

    // Bake the static pad, tower and outbuildings into a handful of meshes.
    // The animated chopsticks carriage is deliberately excluded.
    mergeStaticGroup(pad, [this.chopsticksCarriage]);
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

    // Tangent-ogive nosecone (true Starship silhouette)
    const ogivePoints = makeOgiveProfile(r, noseH, 18);
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

    // Flaps (chamfered edges catch the sun like real TUFROC panels)
    const ffGeo = makeBeveledFlapGeometry(0.3, 3.8, 3.2);
    const afGeo = makeBeveledFlapGeometry(0.4, 11.0, 5.2);
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

    // Merge everything except the physically animated push-button.
    mergeStaticGroup(T, [this.launchButtonMesh]);
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

    // RCS thruster pods and avionics raceways (merged into existing draw calls)
    const rcsGeo = new THREE.BoxGeometry(0.9, 1.1, 0.75);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pod = new THREE.Mesh(rcsGeo, this.matDarkMetal);
      pod.position.set(Math.cos(a) * (radius + 0.32), boosterHeight - 13.0, Math.sin(a) * (radius + 0.32));
      pod.rotation.y = -a;
      B.add(pod);
    }
    const racewayGeo = new THREE.CylinderGeometry(0.11, 0.11, boosterHeight * 0.82, 6);
    for (const a of [0.42, Math.PI - 0.42, Math.PI + 0.42, -0.42]) {
      const raceway = new THREE.Mesh(racewayGeo, this.matDarkMetal);
      raceway.position.set(Math.cos(a) * (radius + 0.1), boosterHeight * 0.46, Math.sin(a) * (radius + 0.1));
      B.add(raceway);
    }

    // Engine bay heat shield / skirt
    const skirtGeo = new THREE.CylinderGeometry(radius + 0.18, radius + 0.05, 1.4, 32, 1, true);
    const skirt = new THREE.Mesh(skirtGeo, this.matDarkMetal);
    skirt.position.y = 1.1;
    B.add(skirt);

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
    // Bell profile is a real throat-to-exit curve rather than a straight cone.
    const bellProfile = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      bellProfile.push(new THREE.Vector2(0.36 + 1.06 * Math.pow(t, 1.7), -2.5 * t));
    }
    const raptorGeo = new THREE.LatheGeometry(bellProfile, 12);
    const raptorsInst = new THREE.InstancedMesh(raptorGeo, this.matRaptorBell, 33);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = radius * 0.82;
      dummy.position.set(Math.cos(a) * r, -0.9, Math.sin(a) * r);
      dummy.updateMatrix();
      raptorsInst.setMatrixAt(idx++, dummy.matrix);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = radius * 0.52;
      dummy.position.set(Math.cos(a) * r, -0.9, Math.sin(a) * r);
      dummy.updateMatrix();
      raptorsInst.setMatrixAt(idx++, dummy.matrix);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const r = radius * 0.22;
      dummy.position.set(Math.cos(a) * r, -0.9, Math.sin(a) * r);
      dummy.updateMatrix();
      raptorsInst.setMatrixAt(idx++, dummy.matrix);
    }
    raptorsInst.instanceMatrix.needsUpdate = true;
    B.add(raptorsInst);

    // Unified Booster Engine Fire Plume (animated shader: turbulent edges + Mach diamonds)
    const boosterFlameGeo = new THREE.CylinderGeometry(3.8, 8.5, 38, 20, 8, true);
    boosterFlameGeo.translate(0, -19, 0);
    this.boosterFlame = new THREE.Mesh(
      boosterFlameGeo,
      createPlumeMaterial({ core: 0xfff4d6, mid: 0xffa432, outer: 0xff3d0a })
    );
    this.boosterFlame.visible = false;
    B.add(this.boosterFlame);

    // Inner bright white shock core
    const shockCoreGeo = new THREE.CylinderGeometry(1.8, 3.2, 22, 14, 4, true);
    shockCoreGeo.translate(0, -11, 0);
    this.boosterShockCore = new THREE.Mesh(
      shockCoreGeo,
      createPlumeMaterial({ core: 0xffffff, mid: 0xffe6b0, outer: 0xff9a30 })
    );
    this.boosterShockCore.visible = false;
    B.add(this.boosterShockCore);

    // Merge all static booster geometry into one mesh per material.
    mergeStaticGroup(B, [this.boosterFlame, this.boosterShockCore, ...this.gridFins]);
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

    // Tangent-ogive nosecone with the correct tangent-to-barrel transition
    const ogivePoints = makeOgiveProfile(r, noseH, 22);
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

    // Cold-gas RCS pods and umbilical plates (merged into the dark-metal draw call)
    const rcsPodGeo = new THREE.BoxGeometry(0.8, 0.95, 0.7);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pod = new THREE.Mesh(rcsPodGeo, this.matDarkMetal);
      pod.position.set(Math.cos(a) * (r + 0.3), barrelH + 2.2, Math.sin(a) * (r + 0.3));
      pod.rotation.y = -a;
      S.add(pod);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.55), this.matDarkMetal);
      plate.position.set(Math.cos(a) * (r + 0.18), 3.2, Math.sin(a) * (r + 0.18));
      plate.rotation.y = -a;
      S.add(plate);
    }

    // 4 Articulating Aerodynamic Flaps with Aerodynamic Hinge Root Fairings
    this.forwardFlaps = [];
    this.aftFlaps = [];

    const ffGeo = makeBeveledFlapGeometry(0.32, 3.8, 3.2);
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

    const afGeo = makeBeveledFlapGeometry(0.42, 11.0, 5.2);
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

    // 6 Starship Raptors: 3 vacuum + 3 sea-level, one instanced draw call.
    const shipBellProfile = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      shipBellProfile.push(new THREE.Vector2(0.30 + 1.08 * Math.pow(t, 1.75), -2.7 * t));
    }
    const shipBellGeo = new THREE.LatheGeometry(shipBellProfile, 12);
    const shipEnginesInst = new THREE.InstancedMesh(shipBellGeo, this.matRaptorBell, 6);
    const shipEngineDummy = new THREE.Object3D();
    let shipEngineIdx = 0;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      shipEngineDummy.position.set(Math.cos(a) * 2.5, -1.1, Math.sin(a) * 2.5);
      shipEngineDummy.scale.set(1.06, 1.06, 1.06);
      shipEngineDummy.updateMatrix();
      shipEnginesInst.setMatrixAt(shipEngineIdx++, shipEngineDummy.matrix);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
      shipEngineDummy.position.set(Math.cos(a) * 1.1, -0.65, Math.sin(a) * 1.1);
      shipEngineDummy.scale.set(0.62, 0.66, 0.62);
      shipEngineDummy.updateMatrix();
      shipEnginesInst.setMatrixAt(shipEngineIdx++, shipEngineDummy.matrix);
    }
    shipEnginesInst.instanceMatrix.needsUpdate = true;
    S.add(shipEnginesInst);

    // Starship Atmospheric Plume
    const shipFlameGeo = new THREE.CylinderGeometry(2.4, 4.6, 24, 18, 6, true);
    shipFlameGeo.translate(0, -12, 0);
    this.starshipFlame = new THREE.Mesh(
      shipFlameGeo,
      createPlumeMaterial({ core: 0xbde6ff, mid: 0x4db6ff, outer: 0x1f5cff })
    );
    this.starshipFlame.visible = false;
    S.add(this.starshipFlame);

    // Bake static ship structure into one mesh per material. Animated flaps,
    // legs, doors, plumes and the instanced engines stay independent.
    mergeStaticGroup(S, [
      this.starshipFlame,
      this.cargoBayGroup,
      ...this.forwardFlaps.map((f) => f.hinge),
      ...this.aftFlaps.map((f) => f.hinge),
      ...this.landingLegs
    ]);
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
    if (!active) {
      if (this.boosterFlame.material.uniforms) this.boosterFlame.material.uniforms.uThrottle.value = 0;
      if (this.boosterShockCore.material.uniforms) this.boosterShockCore.material.uniforms.uThrottle.value = 0;
      return;
    }
    if (this.boosterFlame.material.uniforms) {
      this.boosterFlame.material.uniforms.uThrottle.value = 0.35 + throttle * 0.65;
    }
    if (this.boosterShockCore.material.uniforms) {
      this.boosterShockCore.material.uniforms.uThrottle.value = 0.55 + throttle * 0.45;
    }
    this.boosterFlame.scale.set(
      1.0 + throttle * 0.18,
      throttle * (1.0 + Math.random() * 0.16),
      1.0 + throttle * 0.18
    );
  }

  setStarshipThrottle(throttle, isVacuum = false) {
    const active = throttle > 0.01;
    this.starshipFlame.visible = active;
    if (this.starshipFlame.material.uniforms) {
      this.starshipFlame.material.uniforms.uThrottle.value = active ? (0.4 + throttle * 0.6) : 0;
      this.starshipFlame.material.uniforms.uVacuum.value = isVacuum ? 1 : 0;
    }
    if (active) {
      this.starshipFlame.scale.set(
        1.0 + throttle * 0.26,
        throttle * (1.0 + Math.random() * 0.16),
        1.0 + throttle * 0.26
      );
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
        if (!this.matHeatshield.emissive) this.matHeatshield.emissive = new THREE.Color(0x000000);
        // Incandescent ramp: dull red -> orange -> white-hot stagnation
        const r = 0.30 + h * 0.70;
        const g = 0.025 + h * h * 0.62;
        const b = h * h * h * 0.38;
        this.matHeatshield.emissive.setRGB(r, g, b);
        this.matHeatshield.emissiveIntensity = 0.55 + h * 2.6;
      } else {
        this.matHeatshield.emissive.setRGB(0, 0, 0);
        this.matHeatshield.emissiveIntensity = 1.0;
      }
    }
  }

  // Distance-based visibility so the huge starbase and thin frost shells cost
  // nothing while the ship is in space or high above the pad.
  updateLOD(cameraPos) {
    if (!cameraPos) return;
    this.launchPadGroup.getWorldPosition(this._padWorldPos);
    const padDist = cameraPos.distanceTo(this._padWorldPos);
    const padVisible = padDist < 4800;
    if (this.launchPadGroup.visible !== padVisible) this.launchPadGroup.visible = padVisible;
    const terminalVisible = padDist < 800;
    if (this.launchTerminalGroup.visible !== terminalVisible) this.launchTerminalGroup.visible = terminalVisible;

    const shipDist = cameraPos.distanceTo(this.starshipGroup.position);
    const frostVisible = shipDist < 450;
    for (let i = 0; i < this._cryoMeshes.length; i++) {
      const m = this._cryoMeshes[i];
      if (m.visible !== frostVisible) m.visible = frostVisible;
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
    this._fxTime += dt;
    if (this.jellyfishMesh?.visible && this.jellyfishMat) {
      this.jellyfishMat.uniforms.uTime.value = this._fxTime;
    }
    if (this.plasmaMesh?.visible && this.plasmaMat) {
      this.plasmaMat.uniforms.uTime.value = this._fxTime;
    }
    if (this.boosterFlame?.visible && this.boosterFlame.material.uniforms) {
      this.boosterFlame.material.uniforms.uTime.value = this._fxTime;
    }
    if (this.boosterShockCore?.visible && this.boosterShockCore.material.uniforms) {
      this.boosterShockCore.material.uniforms.uTime.value = this._fxTime;
    }
    if (this.starshipFlame?.visible && this.starshipFlame.material.uniforms) {
      this.starshipFlame.material.uniforms.uTime.value = this._fxTime;
    }
  }
}
