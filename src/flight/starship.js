import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STARBASE_LAYOUT as L } from './starbaseLayout.js';

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

// Crisp industrial signage texture shared by towers, the factory and the
// inspection yard. Canvas text is rasterised once at load time.
function createLabelTexture(title, subtitle = '', accent = '#38e8ff') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#090d12';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = 'rgba(255,255,255,0.06)';
  for (let x = 0; x < canvas.width; x += 32) g.fillRect(x, 0, 1, canvas.height);
  g.strokeStyle = accent;
  g.lineWidth = 8;
  g.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  g.fillStyle = accent;
  g.fillRect(28, 34, 10, canvas.height - 68);
  g.font = 'bold 76px "Arial Narrow", Arial, sans-serif';
  g.fillStyle = '#f5f9ff';
  g.textBaseline = 'middle';
  g.fillText(title, 62, subtitle ? 104 : 128);
  if (subtitle) {
    g.font = '600 34px "Arial Narrow", Arial, sans-serif';
    g.fillStyle = 'rgba(190,225,255,0.82)';
    g.fillText(subtitle, 64, 180);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
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
        float alpha = (body * (0.42 + fres * 0.95) * flicker + diamonds * 0.85) * uThrottle * 0.62;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }
    `
  });
}

let _engineGlowTexture = null;
function getEngineGlowTexture() {
  if (_engineGlowTexture || typeof document === 'undefined') return _engineGlowTexture;
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(210,240,255,0.92)');
  grad.addColorStop(0.48, 'rgba(90,170,255,0.34)');
  grad.addColorStop(1, 'rgba(20,60,160,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _engineGlowTexture = new THREE.CanvasTexture(cv);
  _engineGlowTexture.colorSpace = THREE.SRGBColorSpace;
  return _engineGlowTexture;
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

    // ---------------------------------------------------------
    // THREE-TOWER MECHAZILLA ARCHITECTURE
    //   1. LAUNCH TOWER  - holds the stack, carries the stacking crane
    //   2. BOOSTER TOWER - dedicated Super Heavy catch tower
    //   3. SHIP TOWER    - dedicated Starship catch tower
    //
    // Catch arms are always exactly at the vehicle's forward-pin height, and
    // each catch point sits on the arm centreline 18 m from the tower, so a
    // captured vehicle is physically centred between the arms.
    // ---------------------------------------------------------
    this.towers = {};
    this.towerPosition = new THREE.Vector3(L.launchTower.x, 0, L.launchTower.z);

    this.buildMechazillaTower('launch', {
      x: L.launchTower.x,
      z: L.launchTower.z,
      height: L.launchTower.height,
      armY: L.launchTower.armY,
      title: 'LAUNCH',
      withCrane: true,
      withQD: true
    });
    this.buildMechazillaTower('booster', {
      x: L.boosterTower.x,
      z: L.boosterTower.z,
      height: L.boosterTower.height,
      armY: L.boosterTower.armY,
      title: 'BOOSTER CATCH',
      withCrane: true,
      withQD: false
    });
    this.buildMechazillaTower('ship', {
      x: L.shipTower.x,
      z: L.shipTower.z,
      height: L.shipTower.height,
      armY: L.shipTower.armY,
      title: 'SHIP CATCH',
      withCrane: true,
      withQD: false
    });

    // Compatibility aliases for older UI/camera code.
    this.chopsticksCarriage = this.towers.launch.carriage;
    this.leftChopstickHinge = this.towers.launch.leftHinge;
    this.rightChopstickHinge = this.towers.launch.rightHinge;

    // Automated stacking crane mounted on the launch tower.
    this.buildStackerCrane(pad);

    // Build the broader Mars Starbase complex (Ref Images 2 & 3)
    this.buildExpandedMarsStarbase(pad);

    // Build the fully automated factory, conveyor, erector and inspection yard.
    this.buildProductionComplex(pad);

    // Bake the static pad, towers and outbuildings into a handful of meshes.
    // Every animated carriage, crane, crawler and scanner is excluded.
    const dynamicRoots = [];
    for (const t of Object.values(this.towers)) dynamicRoots.push(t.carriage);
    mergeStaticGroup(pad, dynamicRoots);
  }

  // -------------------------------------------------------------
  // MECHAZILLA TOWER BUILDER (used by all three towers)
  // -------------------------------------------------------------
  buildMechazillaTower(key, { x, z, height, armY, title, withCrane = false, withQD = false }) {
    const pad = this.launchPadGroup;
    const towerWidth = 9.0;

    // Heavy foundation / flame-hardened base plinth
    const baseGeo = new THREE.CylinderGeometry(15.5, 17.0, 3.0, 20);
    const base = new THREE.Mesh(baseGeo, this.matConcrete);
    base.position.set(x, 1.5, z);
    base.receiveShadow = true;
    pad.add(base);

    const columnGeo = new THREE.BoxGeometry(1.2, height, 1.2);
    for (const dx of [-towerWidth / 2, towerWidth / 2]) {
      for (const dz of [-towerWidth / 2, towerWidth / 2]) {
        const col = new THREE.Mesh(columnGeo, this.matTower);
        col.position.set(x + dx, height / 2, z + dz);
        col.castShadow = true;
        pad.add(col);
      }
    }

    // Horizontal lattice bracing and X-bracing on every second bay
    const beamXGeo = new THREE.BoxGeometry(towerWidth, 0.7, 0.7);
    const beamZGeo = new THREE.BoxGeometry(0.7, 0.7, towerWidth);
    const diagonalGeo = new THREE.BoxGeometry(0.32, 0.32, Math.hypot(towerWidth, 16.0));
    for (let y = 12; y < height; y += 16) {
      const beamX = new THREE.Mesh(beamXGeo, this.matTower);
      beamX.position.set(x, y, z - towerWidth / 2);
      pad.add(beamX);
      const beamX2 = new THREE.Mesh(beamXGeo, this.matTower);
      beamX2.position.set(x, y, z + towerWidth / 2);
      pad.add(beamX2);
      const beamZ = new THREE.Mesh(beamZGeo, this.matTower);
      beamZ.position.set(x - towerWidth / 2, y, z);
      pad.add(beamZ);
      const beamZ2 = new THREE.Mesh(beamZGeo, this.matTower);
      beamZ2.position.set(x + towerWidth / 2, y, z);
      pad.add(beamZ2);

      if ((y / 16) % 2 === 0 && y + 16 < height) {
        for (const side of [-1, 1]) {
          const diag = new THREE.Mesh(diagonalGeo, this.matTower);
          diag.position.set(x + side * towerWidth / 2, y + 8, z);
          diag.rotation.x = side * Math.atan2(towerWidth, 16.0);
          pad.add(diag);
        }
      }
    }

    // Top machinery deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(towerWidth + 4, 1.2, towerWidth + 4), this.matTower);
    deck.position.set(x, height + 0.6, z);
    pad.add(deck);

    if (withCrane) {
      const craneBoom = new THREE.Mesh(new THREE.BoxGeometry(24, 1.8, 1.8), this.matTower);
      craneBoom.position.set(x - 6, height + 3.2, z);
      pad.add(craneBoom);
      const craneCounter = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 3.2), this.matDarkMetal);
      craneCounter.position.set(x + 9, height + 3.2, z);
      pad.add(craneCounter);
    }

    if (withQD) {
      const qdArm = new THREE.Mesh(new THREE.BoxGeometry(11, 1.4, 1.8), this.matTower);
      qdArm.position.set(x - 8.5, 58, z);
      pad.add(qdArm);
      const qdPlate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 2.6), this.matDarkMetal);
      qdPlate.position.set(x - 13.6, 58, z);
      pad.add(qdPlate);
    }

    // Signage so the three towers are instantly readable from the ground
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9.5, 2.35),
      new THREE.MeshBasicMaterial({
        map: createLabelTexture(title, `${height.toFixed(0)} m MECHAZILLA`, title.includes('CATCH') ? '#ffb547' : '#38e8ff'),
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    sign.position.set(x, height - 10.0, z + towerWidth / 2 + 0.12);
    pad.add(sign);

    // Articulated chopstick carriage. Arms are deliberately longer than the
    // 18 m catch radius so the tips surround the vehicle's forward pins.
    const carriage = new THREE.Group();
    carriage.position.set(x - towerWidth / 2, armY, z);
    carriage.userData.noMerge = true;
    pad.add(carriage);

    const carriageFrame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 8.0, 11.0), this.matDarkMetal);
    carriageFrame.position.set(1.5, 0, 0);
    carriageFrame.castShadow = true;
    carriage.add(carriageFrame);

    const armGeo = new THREE.BoxGeometry(22, 1.6, 1.4);
    armGeo.translate(-11, 0, 0); // pivot at root

    const leftHinge = new THREE.Group();
    leftHinge.position.set(0, 0, -5.9);
    const leftArm = new THREE.Mesh(armGeo, this.matDarkMetal);
    leftArm.castShadow = true;
    leftHinge.add(leftArm);
    leftHinge.rotation.y = -0.42;
    carriage.add(leftHinge);

    const rightHinge = new THREE.Group();
    rightHinge.position.set(0, 0, 5.9);
    const rightArm = new THREE.Mesh(armGeo, this.matDarkMetal);
    rightArm.castShadow = true;
    rightHinge.add(rightArm);
    rightHinge.rotation.y = 0.42;
    carriage.add(rightHinge);

    // High-visibility catch pads at the arm tips. They line up with the pins
    // when the carriage is at the vehicle's forward-pin height.
    const catchPadMat = new THREE.MeshBasicMaterial({
      color: key === 'launch' ? 0x38e8ff : 0xffb547
    });
    const padGeo = new THREE.BoxGeometry(2.4, 0.35, 0.35);
    for (const hinge of [leftHinge, rightHinge]) {
      const catchPad = new THREE.Mesh(padGeo, catchPadMat);
      catchPad.position.set(-20.4, 0.0, hinge === leftHinge ? 0.72 : -0.72);
      hinge.add(catchPad);
    }

    // Hydraulic actuators that visibly drive the arm closure
    const ramGeo = new THREE.CylinderGeometry(0.22, 0.22, 6.0, 8);
    for (const [hinge, side] of [[leftHinge, -1], [rightHinge, 1]]) {
      const ram = new THREE.Mesh(ramGeo, this.matSteel);
      ram.position.set(-4.0, 0, side * 1.1);
      ram.rotation.z = Math.PI / 2;
      hinge.add(ram);
    }

    this.towers[key] = {
      key,
      x,
      z,
      height,
      armY,
      carriage,
      leftHinge,
      rightHinge,
      catchPadMat,
      sign
    };
    return this.towers[key];
  }

  // -------------------------------------------------------------
  // AUTONOMOUS STACKING CRANE ON THE LAUNCH TOWER
  // -------------------------------------------------------------
  buildStackerCrane(pad) {
    const pivotY = L.launchTower.height + 4.2;
    const yaw = new THREE.Group();
    yaw.position.set(L.launchTower.x, pivotY, L.launchTower.z);
    yaw.userData.noMerge = true;
    pad.add(yaw);

    const kingpost = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 7, 12), this.matTower);
    kingpost.position.y = 2.5;
    yaw.add(kingpost);

    const boomLength = 82.0;
    const boom = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, boomLength), this.matTower);
    boom.position.set(0, 3.4, boomLength / 2);
    boom.castShadow = true;
    yaw.add(boom);

    // Counter-jib and counterweight
    const counterJib = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 18), this.matTower);
    counterJib.position.set(0, 3.4, -9);
    yaw.add(counterJib);
    const counterweight = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 4), this.matDarkMetal);
    counterweight.position.set(0, 2.2, -17);
    yaw.add(counterweight);

    // Trolley, variable-length cable and capture clamp
    const trolley = new THREE.Group();
    trolley.position.set(0, 3.2, 40);
    yaw.add(trolley);
    const trolleyBody = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 3.2), this.matDarkMetal);
    trolley.add(trolleyBody);

    const cableGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 6);
    cableGeo.translate(0, -0.5, 0);
    const cable = new THREE.Mesh(cableGeo, this.matSteel);
    cable.position.y = -0.4;
    cable.scale.y = 40;
    trolley.add(cable);

    const clamp = new THREE.Group();
    clamp.position.y = -40;
    trolley.add(clamp);

    const clampHead = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.4, 6.2), this.matDarkMetal);
    clamp.add(clampHead);
    const fingerGeo = new THREE.BoxGeometry(1.0, 7.0, 1.2);
    for (const sx of [-1, 1]) {
      const finger = new THREE.Mesh(fingerGeo, this.matDarkMetal);
      finger.position.set(sx * 4.4, -3.0, 0);
      clamp.add(finger);
    }
    const clampLampMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    for (const sx of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 3.6), clampLampMat);
      lamp.position.set(sx * 3.4, -6.0, 0);
      clamp.add(lamp);
    }

    this.stacker = {
      yaw,
      trolley,
      cable,
      clamp,
      pivotY,
      boomLength,
      clampLampMat,
      // Start stowed pointing at the pad centre.
      targetYaw: -Math.PI / 2,
      currentYaw: -Math.PI / 2
    };
    yaw.rotation.y = this.stacker.currentYaw;
  }

  // -------------------------------------------------------------
  // STARSHIP FACTORY, CONVEYOR, ERECTOR & INSPECTION YARD
  // -------------------------------------------------------------
  buildProductionComplex(pad) {
    this.buildFactory(pad);
    this.buildConveyor(pad);
    this.buildErector(pad);
    this.buildInspectionYard(pad);
    this.buildRecoveryCrawlers(pad);
    this.buildYardRoads(pad);
  }

  buildFactory(pad) {
    const f = L.factory;
    const group = new THREE.Group();
    group.position.set(f.x, 0, f.z);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(f.width + 16, 1.2, f.depth + 16), this.matConcrete);
    slab.position.y = 0.6;
    slab.receiveShadow = true;
    group.add(slab);

    const hallMat = new THREE.MeshStandardMaterial({
      color: 0xa9b2bd,
      metalness: 0.62,
      roughness: 0.46,
      envMapIntensity: 0.8
    });
    const hall = new THREE.Mesh(new THREE.BoxGeometry(f.width, 34, f.depth), hallMat);
    hall.position.y = 17.6;
    hall.castShadow = hall.receiveShadow = true;
    group.add(hall);

    // Corrugated wall ribs
    const ribGeo = new THREE.BoxGeometry(0.5, 32, 0.5);
    for (let x = -f.width / 2 + 4; x <= f.width / 2 - 4; x += 8) {
      for (const side of [-1, 1]) {
        const rib = new THREE.Mesh(ribGeo, this.matTower);
        rib.position.set(x, 17.6, side * (f.depth / 2 + 0.2));
        group.add(rib);
      }
    }

    // Sawtooth roof with north-light glazing
    const sawMat = new THREE.MeshStandardMaterial({
      color: 0x2c3540,
      metalness: 0.7,
      roughness: 0.5
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x1b2b33,
      emissive: new THREE.Color(0x7fd6ff),
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.2
    });
    for (let i = 0; i < 8; i++) {
      const z = -f.depth / 2 + 6 + i * 10;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(f.width - 2, 1.0, 11.5), sawMat);
      roof.position.set(0, 36.4, z);
      roof.rotation.x = -0.28;
      group.add(roof);
      const glazing = new THREE.Mesh(new THREE.BoxGeometry(f.width - 3, 0.7, 3.2), glowMat);
      glazing.position.set(0, 34.6, z + 5.0);
      group.add(glazing);
    }

    // Main conveyor door on the west face
    const doorGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 15, 18),
      new THREE.MeshStandardMaterial({
        color: 0x0b1016,
        emissive: new THREE.Color(0x6ad8ff),
        emissiveIntensity: 0.7,
        metalness: 0.4,
        roughness: 0.4
      })
    );
    doorGlow.position.set(-f.width / 2 + 0.1, 10.5, f.conveyorDoorZ - f.z);
    group.add(doorGlow);
    this.factoryDoorGlowMat = doorGlow.material;

    const doorFrameGeo = new THREE.BoxGeometry(1.2, 17, 1.6);
    for (const dz of [-9.6, 9.6]) {
      const frame = new THREE.Mesh(doorFrameGeo, this.matTower);
      frame.position.set(-f.width / 2 - 0.2, 10.5, f.conveyorDoorZ - f.z + dz);
      group.add(frame);
    }
    const doorLintel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 21), this.matTower);
    doorLintel.position.set(-f.width / 2 - 0.2, 19.5, f.conveyorDoorZ - f.z);
    group.add(doorLintel);

    // Recovery door on the south face
    const recoveryGlow = new THREE.Mesh(
      new THREE.BoxGeometry(20, 18, 0.4),
      new THREE.MeshStandardMaterial({
        color: 0x0b1016,
        emissive: new THREE.Color(0xff9d3c),
        emissiveIntensity: 0.55,
        roughness: 0.5,
        metalness: 0.3
      })
    );
    recoveryGlow.position.set(f.recoveryDoorX - f.x, 10.2, f.depth / 2 + 0.05);
    group.add(recoveryGlow);

    // Factory signage
    const signMat = new THREE.MeshBasicMaterial({
      map: createLabelTexture('STARSHIP FABRICATION', 'AUTONOMOUS PRODUCTION LINE // BAYS 01-04', '#38e8ff'),
      transparent: true,
      side: THREE.DoubleSide
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(46, 11.5), signMat);
    sign.position.set(-f.width / 2 - 0.3, 28, f.conveyorDoorZ - f.z);
    sign.rotation.y = -Math.PI / 2;
    group.add(sign);

    // Roof vents and aviation beacons
    const ventGeo = new THREE.CylinderGeometry(2.4, 3.0, 7, 12);
    for (const [vx, vz] of [[-32, -20], [0, 12], [34, -6], [18, 28]]) {
      const vent = new THREE.Mesh(ventGeo, this.matDarkMetal);
      vent.position.set(vx, 40, vz);
      group.add(vent);
    }
    this.factoryBeaconMat = new THREE.MeshBasicMaterial({ color: 0xff4b2e });
    const beaconGeo = new THREE.SphereGeometry(0.8, 8, 6);
    for (const [bx, bz] of [[-f.width / 2, -f.depth / 2], [f.width / 2, -f.depth / 2], [f.width / 2, f.depth / 2], [-f.width / 2, f.depth / 2]]) {
      const beacon = new THREE.Mesh(beaconGeo, this.factoryBeaconMat);
      beacon.position.set(bx, 35.8, bz);
      group.add(beacon);
    }

    // Internal gantry visible through the open door
    const gantryMat = this.matDarkMetal;
    for (let gx = -40; gx <= 40; gx += 20) {
      const mast = new THREE.Mesh(new THREE.BoxGeometry(1.6, 30, 1.6), gantryMat);
      mast.position.set(gx, 15.6, 34);
      group.add(mast);
    }
    const gantryRail = new THREE.Mesh(new THREE.BoxGeometry(84, 2.2, 2.2), gantryMat);
    gantryRail.position.set(0, 31, 34);
    group.add(gantryRail);

    pad.add(group);
    this.factoryGroup = group;
  }

  buildConveyor(pad) {
    const beltY = L.conveyor.beltY;
    const path = L.conveyor.path;
    const beltMat = new THREE.MeshStandardMaterial({
      color: 0x232a32,
      metalness: 0.45,
      roughness: 0.72
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xffb547,
      metalness: 0.5,
      roughness: 0.4,
      emissive: new THREE.Color(0x5a3400),
      emissiveIntensity: 0.35
    });

    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const midX = (a.x + b.x) / 2;
      const midZ = (a.z + b.z) / 2;
      const yaw = Math.atan2(dx, dz);

      const belt = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.5, len), beltMat);
      belt.position.set(midX, beltY, midZ);
      belt.rotation.y = yaw;
      belt.receiveShadow = true;
      pad.add(belt);

      const truss = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.8, len), this.matTower);
      truss.position.set(midX, beltY - 1.25, midZ);
      truss.rotation.y = yaw;
      pad.add(truss);

      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, len), railMat);
        rail.position.set(midX + Math.cos(yaw) * side * 2.8, beltY + 0.55, midZ - Math.sin(yaw) * side * 2.8);
        rail.rotation.y = yaw;
        pad.add(rail);
      }

      // Support towers every ~20 m
      const supports = Math.max(2, Math.floor(len / 22));
      for (let s = 0; s <= supports; s++) {
        const t = s / supports;
        const px = a.x + dx * t;
        const pz = a.z + dz * t;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, beltY - 0.8, 1.1), this.matTower);
        leg.position.set(px, (beltY - 0.8) / 2, pz);
        pad.add(leg);
      }
    }

    // Transfer turntables at the two corners
    const turntableGeo = new THREE.CylinderGeometry(6.2, 6.6, 1.2, 20);
    const turntableMat = new THREE.MeshStandardMaterial({
      color: 0x3a414a,
      metalness: 0.8,
      roughness: 0.4
    });
    for (let i = 1; i < path.length - 1; i++) {
      const turn = new THREE.Mesh(turntableGeo, turntableMat);
      turn.position.set(path[i].x, beltY + 0.15, path[i].z);
      pad.add(turn);
    }
    this.conveyor = { beltY, path };
  }

  buildErector(pad) {
    const e = L.erector;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(10, 11, 1.6, 18), this.matConcrete);
    base.position.set(e.x, 0.8, e.z);
    pad.add(base);

    const pivot = new THREE.Group();
    pivot.position.set(e.x, e.baseY, e.z);
    pivot.userData.noMerge = true;
    pad.add(pivot);

    const cradleMat = new THREE.MeshStandardMaterial({
      color: 0x46505c,
      metalness: 0.85,
      roughness: 0.34
    });
    const spine = new THREE.Mesh(new THREE.BoxGeometry(4.2, 46, 1.6), cradleMat);
    spine.position.set(21, 23, 0);
    pivot.add(spine);
    for (const dz of [-6.0, 6.0]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(3.4, 44, 1.0), cradleMat);
      rail.position.set(22, 22, dz);
      pivot.add(rail);
    }

    // Hydraulic erector rams anchored to the ground
    const ramMat = new THREE.MeshStandardMaterial({ color: 0xd7a94b, metalness: 0.7, roughness: 0.4 });
    const ramGeo = new THREE.CylinderGeometry(0.9, 1.2, 34, 10);
    for (const dz of [-7.5, 7.5]) {
      const ram = new THREE.Mesh(ramGeo, ramMat);
      ram.position.set(31, 9, dz);
      ram.rotation.z = 0.8;
      pad.add(ram);
    }

    this.erector = { pivot, baseY: e.baseY, x: e.x, z: e.z, cradleLength: 46 };
  }

  buildInspectionYard(pad) {
    this.reviewScanners = {};
    for (const kind of ['booster', 'ship']) {
      const point = L.review[kind];
      const group = new THREE.Group();
      group.position.set(point.x, 0, point.z);

      const slab = new THREE.Mesh(new THREE.CylinderGeometry(15, 16, 1.2, 20), this.matConcrete);
      slab.position.y = 0.6;
      group.add(slab);

      // Tall scanning gantry with a vertically travelling beam
      const gantryMat = this.matTower;
      for (const sx of [-1, 1]) {
        const upright = new THREE.Mesh(new THREE.BoxGeometry(1.8, 62, 1.8), gantryMat);
        upright.position.set(sx * 8.0, 31, 0);
        group.add(upright);
      }
      const topBeam = new THREE.Mesh(new THREE.BoxGeometry(18, 2.0, 2.4), gantryMat);
      topBeam.position.set(0, 62, 0);
      group.add(topBeam);

      const scannerMat = new THREE.MeshBasicMaterial({ color: 0x38e8ff, transparent: true, opacity: 0.9 });
      const scannerBar = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 1.4), scannerMat);
      scannerBar.position.set(0, 2, 0);
      group.add(scannerBar);

      const scannerBeam = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 6),
        new THREE.MeshBasicMaterial({
          color: 0x38e8ff,
          transparent: true,
          opacity: 0.16,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      scannerBeam.rotation.x = -Math.PI / 2;
      scannerBeam.position.set(0, -2.6, 0);
      scannerBar.add(scannerBeam);

      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 3.5),
        new THREE.MeshBasicMaterial({
          map: createLabelTexture(
            kind === 'booster' ? 'BOOSTER REVIEW' : 'STARSHIP REVIEW',
            'AUTOMATED INSPECTION / REFURBISHMENT',
            kind === 'booster' ? '#ffb547' : '#38e8ff'
          ),
          transparent: true,
          side: THREE.DoubleSide
        })
      );
      sign.position.set(0, 52, -9.0);
      sign.rotation.y = Math.PI;
      group.add(sign);

      const lampMat = new THREE.MeshBasicMaterial({ color: 0xffb547 });
      for (const sx of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), lampMat);
        lamp.position.set(sx * 10, 64, 0);
        group.add(lamp);
      }

      pad.add(group);
      this.reviewScanners[kind] = {
        bar: scannerBar,
        beam: scannerBeam,
        mat: scannerMat,
        baseY: 2
      };
    }

    // Yard control room between the two inspection bays
    const control = new THREE.Group();
    control.position.set(0, 0, 205);
    const body = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 14), this.matWhiteTank);
    body.position.y = 4.5;
    control.add(body);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(20, 3.2, 0.3),
      new THREE.MeshStandardMaterial({
        color: 0x0a1b24,
        emissive: new THREE.Color(0x58cfff),
        emissiveIntensity: 0.55,
        metalness: 0.5,
        roughness: 0.2
      })
    );
    glass.position.set(0, 6.0, 7.1);
    control.add(glass);
    this.reviewBeaconMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), this.reviewBeaconMat);
    beacon.position.set(0, 9.8, 0);
    control.add(beacon);
    pad.add(control);
  }

  buildRecoveryCrawlers(pad) {
    this.crawlers = {};
    for (const kind of ['booster', 'ship']) {
      const crawler = new THREE.Group();
      crawler.userData.noMerge = true;
      crawler.position.set(L.factory.recoveryDoorX, 0, L.factory.recoveryDoorZ + (kind === 'booster' ? 8 : -8));

      const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 1.8, 12), this.matDarkMetal);
      deck.position.y = 2.1;
      crawler.add(deck);

      const cradleMat = new THREE.MeshStandardMaterial({
        color: kind === 'booster' ? 0xd7a94b : 0x7fd6ff,
        metalness: 0.8,
        roughness: 0.35
      });
      const cradle = new THREE.Mesh(
        new THREE.TorusGeometry(kind === 'booster' ? 6.0 : 5.4, 0.45, 8, 24),
        cradleMat
      );
      cradle.rotation.x = Math.PI / 2;
      cradle.position.y = 4.2;
      crawler.add(cradle);

      const wheelGeo = new THREE.CylinderGeometry(1.7, 1.7, 1.4, 12);
      wheelGeo.rotateZ(Math.PI / 2);
      for (const wx of [-6.2, 0, 6.2]) {
        for (const wz of [-5.2, 5.2]) {
          const wheel = new THREE.Mesh(wheelGeo, this.matDarkMetal);
          wheel.position.set(wx, 1.7, wz);
          crawler.add(wheel);
        }
      }

      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffb547 });
      for (const sx of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), beaconMat);
        lamp.position.set(sx * 8.0, 4.6, 0);
        crawler.add(lamp);
      }

      pad.add(crawler);
      this.crawlers[kind] = { group: crawler, baseY: 3.0, loadY: 3.0 };
    }
  }

  buildYardRoads(pad) {
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x2b2b2e,
      metalness: 0.15,
      roughness: 0.92
    });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf0b429 });
    // Unique segment set (routes overlap around the factory)
    const seen = new Set();
    const addSegment = (a, b) => {
      const key = `${a.x},${a.z}-${b.x},${b.z}`;
      const rev = `${b.x},${b.z}-${a.x},${a.z}`;
      if (seen.has(key) || seen.has(rev)) return;
      seen.add(key);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1) return;
      const midX = (a.x + b.x) / 2;
      const midZ = (a.z + b.z) / 2;
      const yaw = Math.atan2(dx, dz);
      const road = new THREE.Mesh(new THREE.BoxGeometry(13, 0.12, len), roadMat);
      road.position.set(midX, 0.08, midZ);
      road.rotation.y = yaw;
      road.receiveShadow = true;
      pad.add(road);

      const dashes = Math.max(1, Math.floor(len / 18));
      for (let i = 0; i < dashes; i++) {
        const t = (i + 0.5) / dashes;
        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 5), lineMat);
        dash.position.set(a.x + dx * t, 0.16, a.z + dz * t);
        dash.rotation.y = yaw;
        pad.add(dash);
      }
    };
    const routeSets = [
      L.routes.boosterToReview,
      L.routes.boosterToFactory,
      L.routes.boosterRollout,
      L.routes.shipToReview,
      L.routes.shipToFactory
    ];
    for (const route of routeSets) {
      for (let i = 0; i < route.length - 1; i++) addSegment(route[i], route[i + 1]);
    }
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

    // Forward Catch Pins / Lifting Strakes.
    // They protrude on the ±Z axis so the two chopstick beams (which close on
    // ±Z) land squarely on the pin saddles at 65.5 m above the booster base.
    const pinGeo = new THREE.BoxGeometry(1.4, 0.9, 1.7);
    for (const sz of [-1, 1]) {
      const pin = new THREE.Mesh(pinGeo, this.matDarkMetal);
      pin.position.set(0, boosterHeight - 4.5, sz * (radius + 0.35));
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

    // Starship Forward Structural Load-Bearing Catch Pins (for Mechazilla Tower Catch).
    // The dedicated ship tower closes its arms from ±Z, so the pins are aligned
    // to that axis and centred exactly at 31.8 m above the ship's base.
    for (const sz of [-1, 1]) {
      const shipPin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 1.7), this.matDarkMetal);
      shipPin.position.set(0, barrelH - 2.2, sz * (r + 0.35));
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
    const shipFlameGeo = new THREE.CylinderGeometry(1.8, 3.4, 20, 18, 6, true);
    shipFlameGeo.translate(0, -10, 0);
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
    // "SPACE JELLYFISH" vacuum-expansion plume.
    // The old geometry was a 45 m bubble stretched to 110 m. The chase camera
    // sits only ~90 m away, so it flew *inside* the additive shell and a giant
    // purple triangular wall covered the sky. Keep the same visual language but
    // constrain the bell to a real engine-exit envelope that the camera can
    // always see around rather than through.
    const jellyProfile = [
      new THREE.Vector2(0.9, 0.0),
      new THREE.Vector2(2.8, -5.0),
      new THREE.Vector2(6.4, -16.0),
      new THREE.Vector2(10.5, -31.0),
      new THREE.Vector2(13.0, -46.0),
      new THREE.Vector2(9.2, -58.0),
      new THREE.Vector2(0.35, -66.0)
    ];
    const jellyGeo = new THREE.LatheGeometry(jellyProfile, 28);

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
          float y = clamp(-vPos.y / 66.0, 0.0, 1.0);
          float oneMinusZ = 1.0 - abs(vNormal.z);
          float fres = oneMinusZ * oneMinusZ;
          float ripple = sin(vPos.y * 0.34 - uTime * 6.0) * 0.15 + sin(vPos.x * 0.5) * 0.1;
          vec3 col = mix(uColorCore, uColorOuter, clamp(y * 1.2 + ripple, 0.0, 1.0));
          // Fade toward the bell rim and tip so the plume never reads as a
          // hard-edged polygon or an opaque plane.
          float tipFade = smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(0.68, 1.0, y));
          float alpha = clamp(fres * tipFade * uIntensity * 0.72, 0.0, 0.42);
          gl_FragColor = vec4(col, alpha);
        }
      `
    });
    this.jellyfishMesh = new THREE.Mesh(jellyGeo, this.jellyfishMat);
    this.jellyfishMesh.visible = false;
    this.jellyfishMesh.renderOrder = 5;
    this.starshipGroup.add(this.jellyfishMesh);

    // A compact exhaust glow + real light so the torch remains legible even
    // when the plume is seen against a bright planetary limb.
    this.engineGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getEngineGlowTexture(),
      color: 0x8fd8ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      opacity: 0
    }));
    this.engineGlow.position.set(0, -4.0, 0);
    this.engineGlow.scale.set(14, 24, 1);
    this.engineGlow.visible = false;
    this.starshipGroup.add(this.engineGlow);

    this.starshipEngineLight = new THREE.PointLight(0x6fc8ff, 0, 160, 2);
    this.starshipEngineLight.position.set(0, -8, 0);
    this.starshipGroup.add(this.starshipEngineLight);

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

  setTowerArms(key, catchFactor0to1, carriageHeight = null) {
    const tower = this.towers?.[key];
    if (!tower) return;
    if (Number.isFinite(carriageHeight)) tower.carriage.position.y = carriageHeight;
    const t = THREE.MathUtils.clamp(catchFactor0to1, 0.0, 1.0);
    // 0 = arms splayed wide (25 m tip-to-tip), 1 = they meet the pin saddles.
    const openAngle = 0.42 * (1.0 - t);
    tower.leftHinge.rotation.y = -openAngle;
    tower.rightHinge.rotation.y = openAngle;
    tower.catchPadMat.color.setHex(
      t > 0.92 ? 0x34d399 : (key === 'launch' ? 0x38e8ff : 0xffb547)
    );
  }

  // Legacy entry point used by the old launch-tower catch logic. It now targets
  // the dedicated tower for the active vehicle instead of the launch tower.
  setChopsticks(catchFactor0to1, carriageHeight = null) {
    this.setTowerArms('launch', catchFactor0to1, carriageHeight);
  }

  setBoosterChopsticks(catchFactor0to1, carriageHeight = null) {
    this.setTowerArms('booster', catchFactor0to1, carriageHeight);
  }

  setShipChopsticks(catchFactor0to1, carriageHeight = null) {
    this.setTowerArms('ship', catchFactor0to1, carriageHeight);
  }

  // Launch tower arms hold the ship at its 128.8 m pin plane during stacking.
  setLaunchChopsticks(catchFactor0to1, carriageHeight = null) {
    this.setTowerArms('launch', catchFactor0to1, carriageHeight);
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
      const u = this.starshipFlame.material.uniforms;
      u.uThrottle.value = active ? (0.55 + throttle * 0.75) : 0;
      u.uVacuum.value = isVacuum ? 1 : 0;
      // Sea-level Raptors burn orange; vacuum Raptors burn blue-violet.
      if (isVacuum) {
        u.uCore.value.setHex(0xe8f7ff);
        u.uMid.value.setHex(0x67c8ff);
        u.uOuter.value.setHex(0x2f6dff);
      } else {
        u.uCore.value.setHex(0xfff4d6);
        u.uMid.value.setHex(0xffa432);
        u.uOuter.value.setHex(0xff3d0a);
      }
    }
    if (active) {
      this.starshipFlame.scale.set(
        1.0 + throttle * 0.26,
        throttle * (1.0 + Math.random() * 0.16),
        1.0 + throttle * 0.26
      );
    }

    if (this.engineGlow) {
      this.engineGlow.visible = active;
      this.engineGlow.material.color.setHex(isVacuum ? 0x8fd8ff : 0xffb060);
      this.engineGlow.material.opacity = active ? 0.36 + throttle * 0.38 : 0;
      const s = 6 + throttle * 6;
      this.engineGlow.scale.set(s, s * 1.7, 1);
    }
    if (this.starshipEngineLight) {
      this.starshipEngineLight.color.setHex(isVacuum ? 0x6fc8ff : 0xff8a3a);
      this.starshipEngineLight.intensity = active ? 4 + throttle * 16 : 0;
      this.starshipEngineLight.distance = 180;
    }

    // A full vacuum-expansion shell reads as a wall from the chase camera.
    // Keep the torch compact and legible: the cylindrical Raptor plume plus
    // glow/light carry the effect without the old purple jellyfish sheet.
    const jellyVis = false;
    if (this.jellyfishMesh) this.jellyfishMesh.visible = jellyVis;
    if (this.jellyfishMat) {
      this.jellyfishMat.uniforms.uIntensity.value = 0.0;
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

  // -------------------------------------------------------------
  // AUTOMATED YARD RIGGING INTERFACE (used by StarbaseOperations)
  // -------------------------------------------------------------
  setStackerPose(yaw, trolleyDistance, cableLength, clampClosed = false) {
    const s = this.stacker;
    if (!s) return;
    s.yaw.rotation.y = yaw;
    s.currentYaw = yaw;
    s.trolley.position.z = THREE.MathUtils.clamp(trolleyDistance, 8.0, s.boomLength - 4.0);
    const length = Math.max(4.0, cableLength);
    s.cable.scale.y = length;
    s.clamp.position.y = -length;
    s.clampLampMat.color.setHex(clampClosed ? 0x34d399 : 0xffb547);
    for (const child of s.clamp.children) {
      if (child.geometry && child.geometry.type === 'BoxGeometry' && child.geometry.parameters.height === 7.0) {
        child.position.x = clampClosed ? (child.position.x > 0 ? 3.1 : -3.1) : (child.position.x > 0 ? 4.4 : -4.4);
      }
    }
  }

  setErectorAngle(angle) {
    if (this.erector?.pivot) {
      this.erector.pivot.rotation.z = THREE.MathUtils.clamp(angle, 0, Math.PI * 0.5);
    }
  }

  setReviewScan(kind, active, progress = 0) {
    const scanner = this.reviewScanners?.[kind];
    if (!scanner) return;
    scanner.bar.visible = active;
    if (!active) return;
    // Scan from the base to the nose and back, driven by the lane timer.
    const sweep = (Math.sin(progress * Math.PI * 2 - Math.PI / 2) + 1) * 0.5;
    const top = kind === 'booster' ? 56.0 : 44.0;
    scanner.bar.position.y = 3.0 + sweep * top;
    scanner.mat.opacity = 0.55 + 0.35 * Math.sin(progress * 40.0);
    scanner.beam.material.opacity = 0.10 + 0.12 * Math.sin(progress * 27.0 + 1.2);
  }

  updateFactoryAmbience(dt) {
    this._yardTime = (this._yardTime || 0) + dt;
    const t = this._yardTime;
    if (this.factoryBeaconMat) {
      const on = (Math.sin(t * 3.1) + 1) * 0.5;
      this.factoryBeaconMat.color.setRGB(0.35 + on * 0.8, 0.06 + on * 0.18, 0.02);
    }
    if (this.reviewBeaconMat) {
      const on = (Math.sin(t * 1.7 + 1.0) + 1) * 0.5;
      this.reviewBeaconMat.color.setRGB(0.05 + on * 0.2, 0.35 + on * 0.65, 0.25 + on * 0.4);
    }
  }

  update(dt) {
    this._fxTime += dt;
    this.updateFactoryAmbience(dt);
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
