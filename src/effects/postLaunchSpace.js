import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Realistic Procedural Mars Planetary Texture Generator
// Creates a 2048 x 1024 equirectangular texture of Mars with iconic landmarks:
// - Valles Marineris (4,000 km grand canyon rift)
// - Olympus Mons (22 km shield volcano caldera & scarp)
// - Tharsis Montes (Ascraeus, Pavonis, Arsia Mons)
// - Dark basaltic mare (Syrtis Major, Acidalia Planitia, Sinus Meridiani)
// - Northern Polar Ice Cap (Planum Boreum with Chasma Boreale)
// - Southern Polar Frost (Planum Australe)
// - Impact Basins & Crater Rings (Hellas, Argyre, and crater fields)
// - Orographic water-ice clouds over volcanic summits
// ---------------------------------------------------------------------------
let _cachedMarsTexture = null;

function createProceduralMarsTexture() {
  if (typeof document === 'undefined') return null;
  if (_cachedMarsTexture) return _cachedMarsTexture;

  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // Ultra-fast integer bitwise hash (replaces slow Math.sin per pixel)
  const hash2d = (x, y) => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  const smoothNoise = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3.0 - 2.0 * fx);
    const uy = fy * fy * (3.0 - 2.0 * fy);

    const a = hash2d(ix, iy);
    const b = hash2d(ix + 1, iy);
    const c = hash2d(ix, iy + 1);
    const d = hash2d(ix + 1, iy + 1);

    return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
  };

  const fbm = (x, y, octaves = 3) => {
    let val = 0;
    let amp = 0.5;
    let freq = 1.0;
    for (let o = 0; o < octaves; o++) {
      val += smoothNoise(x * freq, y * freq) * amp;
      freq *= 2.02;
      amp *= 0.5;
    }
    return val;
  };

  // Color Palette Constants
  // Ferric red-ochre highlands
  const COL_HIGHLAND_R = 198, COL_HIGHLAND_G = 102, COL_HIGHLAND_B = 64;
  // Dark volcanic basalt (Syrtis Major, Acidalia)
  const COL_BASALT_R = 54, COL_BASALT_G = 38, COL_BASALT_B = 32;
  // Canyon floor shadow
  const COL_CANYON_R = 36, COL_CANYON_G = 22, COL_CANYON_B = 16;
  // Polar ice cap (white/ice-blue)
  const COL_ICE_R = 244, COL_ICE_G = 249, COL_ICE_B = 255;
  // Hellas basin dust
  const COL_HELLAS_R = 216, COL_HELLAS_G = 136, COL_HELLAS_B = 92;

  // Precompute longitude trig table
  const cosU = new Float32Array(width);
  const sinU = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const a = (x / width) * Math.PI * 2;
    cosU[x] = Math.cos(a);
    sinU[x] = Math.sin(a);
  }

  for (let y = 0; y < height; y++) {
    const v = y / height; // 0 (North Pole) to 1 (South Pole)
    const lat = (0.5 - v) * Math.PI; // +PI/2 to -PI/2
    const cosLat = Math.cos(lat);
    const ny = Math.sin(lat);

    for (let x = 0; x < width; x++) {
      const u = x / width; // 0 to 1 (Longitude 0° to 360°)
      const idx = (y * width + x) * 4;

      // Spherical coordinates for seamless wrapping
      const nx = cosLat * cosU[x];
      const nz = cosLat * sinU[x];

      // Base planetary fractal terrain
      const n1 = fbm(nx * 3.5 + 10.0, ny * 3.5 + 10.0, 3);
      const n2 = fbm(nz * 7.0 + 20.0, ny * 7.0 + 20.0, 2) * 0.4;
      let elevation = n1 + n2; // ~0.0 to 1.3

      // 1. Dark Volcanic Basaltic Mare (Albedo Features)
      const dSyrtis = Math.hypot(u - 0.79, (v - 0.50) * 1.8);
      const isSyrtis = Math.max(0, 1.0 - dSyrtis / 0.08);

      const dAcidalia = Math.hypot(u - 0.48, (v - 0.32) * 1.5);
      const isAcidalia = Math.max(0, 1.0 - dAcidalia / 0.12);

      const dMeridiani = Math.hypot(u - 0.56, (v - 0.52) * 3.2);
      const isMeridiani = Math.max(0, 1.0 - dMeridiani / 0.14);

      const darkMare = Math.min(1.0, isSyrtis * 1.6 + isAcidalia * 1.2 + isMeridiani * 1.1 + (elevation < 0.42 ? (0.42 - elevation) * 2.5 : 0.0));

      // 2. Valles Marineris (Grand Canyon of Mars)
      let isCanyon = 0.0;
      if (u > 0.20 && u < 0.44 && Math.abs(v - 0.52) < 0.045) {
        const canyonProgress = (u - 0.20) / 0.24;
        const canyonMeander = Math.sin(canyonProgress * Math.PI * 3.5) * 0.008;
        const distToCenter = Math.abs((v - 0.52) - canyonMeander);
        if (distToCenter < 0.016) {
          isCanyon = Math.pow(1.0 - distToCenter / 0.016, 1.8);
          isCanyon *= 0.75 + 0.25 * Math.sin(canyonProgress * Math.PI * 8.0);
        }
      }

      // 3. Tharsis Shield Volcanoes
      const dOlympus = Math.hypot(u - 0.17, (v - 0.38) * 1.3);
      let isOlympus = 0.0;
      let isCaldera = 0.0;
      if (dOlympus < 0.038) {
        isOlympus = Math.pow(1.0 - dOlympus / 0.038, 2.2);
        if (dOlympus < 0.008) {
          isCaldera = Math.cos((dOlympus / 0.008) * Math.PI * 0.5);
        }
      }

      const dAscraeus = Math.hypot(u - 0.24, (v - 0.39) * 1.4);
      const dPavonis = Math.hypot(u - 0.22, (v - 0.47) * 1.4);
      const dArsia = Math.hypot(u - 0.20, (v - 0.55) * 1.4);
      const isTharsisMons = Math.max(0, 1.0 - Math.min(dAscraeus, dPavonis, dArsia) / 0.024);

      // 4. Hellas Planitia Impact Basin
      const dHellas = Math.hypot(u - 0.72, (v - 0.72) * 1.2);
      const isHellas = Math.max(0, 1.0 - dHellas / 0.11);

      // 5. Northern Polar Ice Cap
      let isNorthIce = 0.0;
      if (v < 0.14) {
        const iceEdge = 0.14 - smoothNoise(nx * 12.0, nz * 12.0) * 0.03;
        if (v < iceEdge) {
          isNorthIce = Math.min(1.0, (iceEdge - v) / 0.05);
          const spiral = Math.sin(Math.atan2(nz, nx) * 3.0 + v * 30.0);
          if (spiral > 0.6) isNorthIce *= 0.78;
        }
      }

      // Southern Polar Frost
      let isSouthIce = 0.0;
      if (v > 0.88) {
        const iceEdge = 0.88 + smoothNoise(nx * 10.0, nz * 10.0) * 0.03;
        if (v > iceEdge) {
          isSouthIce = Math.min(1.0, (v - iceEdge) / 0.06);
        }
      }

      // Base color blending
      let r = COL_HIGHLAND_R;
      let g = COL_HIGHLAND_G;
      let b = COL_HIGHLAND_B;

      const terraVar = (elevation - 0.7) * 42.0;
      r = Math.min(255, Math.max(0, r + terraVar));
      g = Math.min(255, Math.max(0, g + terraVar * 0.75));
      b = Math.min(255, Math.max(0, b + terraVar * 0.5));

      if (darkMare > 0.05) {
        const m = Math.min(1.0, darkMare);
        r = r * (1 - m) + COL_BASALT_R * m;
        g = g * (1 - m) + COL_BASALT_G * m;
        b = b * (1 - m) + COL_BASALT_B * m;
      }

      if (isHellas > 0.05) {
        const h = Math.min(1.0, isHellas);
        r = r * (1 - h) + COL_HELLAS_R * h;
        g = g * (1 - h) + COL_HELLAS_G * h;
        b = b * (1 - h) + COL_HELLAS_B * h;
      }

      if (isCanyon > 0.05) {
        r = r * (1 - isCanyon) + COL_CANYON_R * isCanyon;
        g = g * (1 - isCanyon) + COL_CANYON_G * isCanyon;
        b = b * (1 - isCanyon) + COL_CANYON_B * isCanyon;
      }

      if (isOlympus > 0.05) {
        const oR = 212, oG = 114, oB = 74;
        r = r * (1 - isOlympus) + oR * isOlympus;
        g = g * (1 - isOlympus) + oG * isOlympus;
        b = b * (1 - isOlympus) + oB * isOlympus;
        if (isCaldera > 0.1) {
          r = r * (1 - isCaldera) + COL_CANYON_R * isCaldera;
          g = g * (1 - isCaldera) + COL_CANYON_G * isCaldera;
          b = b * (1 - isCaldera) + COL_CANYON_B * isCaldera;
        }
      }

      if (isTharsisMons > 0.05) {
        const tm = isTharsisMons * 0.75;
        r = r * (1 - tm) + 215 * tm;
        g = g * (1 - tm) + 115 * tm;
        b = b * (1 - tm) + 75 * tm;
      }

      const iceTotal = Math.min(1.0, isNorthIce + isSouthIce);
      if (iceTotal > 0.02) {
        r = r * (1 - iceTotal) + COL_ICE_R * iceTotal;
        g = g * (1 - iceTotal) + COL_ICE_G * iceTotal;
        b = b * (1 - iceTotal) + COL_ICE_B * iceTotal;
      }

      data[idx + 0] = Math.round(r);
      data[idx + 1] = Math.round(g);
      data[idx + 2] = Math.round(b);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  _cachedMarsTexture = texture;
  return texture;
}

// ---------------------------------------------------------------------------
// PostLaunchSpace: Hyper-Realistic 3D Mars Planet Globe & Orbital Space System
// ---------------------------------------------------------------------------
export class PostLaunchSpace {
  constructor(scene, padCoords = new THREE.Vector2(1400, 1150)) {
    this.scene = scene;
    this.padCoords = padCoords;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    // Massive 165 km planetary radius in camera space so the horizon curvature looks vast and authentic, never compressed!
    this.planetRadius = 165000.0;
    this.sunDirection = new THREE.Vector3(0.5, 0.65, 0.45).normalize();
    this.orbitRotation = 0.0;
    this.initialized = false;
  }

  ensureInitialized() {
    if (this.initialized) return;
    this.initialized = true;
    this.initPlanetGlobe();
    this.initAtmosphericAirglowLimb();
    this.initCosmicSpaceEnvironment();
    this.initOrbitalSatellite();
  }

  initPlanetGlobe() {
    const planetTexture = createProceduralMarsTexture();

    // Rotate SphereGeometry by 90° around X so the mesh poles (and polar ice caps) sit 165km away on the ±Z horizon,
    // placing the smooth Martian equator (Valles Marineris, Olympus Mons, Tharsis ochre plains) directly beneath the rocket (+Y)!
    const planetGeo = new THREE.SphereGeometry(this.planetRadius, 64, 48);
    planetGeo.rotateX(Math.PI / 2);

    const planetMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: planetTexture },
        uSunDir: { value: this.sunDirection.clone() },
        uFade: { value: 0.0 },
        uAtmosphereColor: { value: new THREE.Color(0xc8825c) },
        uAirglowBlue: { value: new THREE.Color(0x5ca8e6) },
        uTime: { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        varying vec3 vLocalNormal;
        varying vec3 vPositionWorld;
        varying vec3 vViewDir;

        void main() {
          vUv = uv;
          vLocalNormal = normalize(normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vPositionWorld = worldPos.xyz;
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec3 uSunDir;
        uniform float uFade;
        uniform vec3 uAtmosphereColor;
        uniform vec3 uAirglowBlue;
        uniform float uTime;

        varying vec2 vUv;
        varying vec3 vNormalWorld;
        varying vec3 vLocalNormal;
        varying vec3 vPositionWorld;
        varying vec3 vViewDir;

        float hash31(vec3 p3) {
          p3 = fract(p3 * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        float noise3D(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(
              mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x),
              mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x),
              f.y
            ),
            mix(
              mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
              mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x),
              f.y
            ),
            f.z
          );
        }

        float fbm3D(vec3 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise3D(p);
            p = p * 2.05 + vec3(13.7, 29.3, 7.1);
            a *= 0.5;
          }
          return v;
        }

        // Domain-warped 3D Martian canyon & highland relief (zero circular cheerio grid artifacts)
        float sampleRelief(vec3 sphereDir) {
          vec3 p = sphereDir * 24.0;
          vec3 warp = vec3(fbm3D(p), fbm3D(p + vec3(4.1, 7.3, 2.9)), fbm3D(p + vec3(9.2, 1.8, 5.4)));
          float macro = fbm3D(p + warp * 1.1);
          float detail = fbm3D(sphereDir * 95.0 + warp * 2.0);
          return macro * 0.68 + detail * 0.32;
        }

        void main() {
          if (uFade <= 0.001) discard;

          vec3 N = normalize(vNormalWorld);
          vec3 S = normalize(vLocalNormal);
          vec3 L = normalize(uSunDir);
          vec3 V = normalize(vViewDir);

          // Sample global Mars albedo map (already decoded to linear RGB by SRGBColorSpace)
          vec3 baseAlbedo = texture2D(uMap, vUv).rgb;

          // Tangent basis aligned with Z-poles so the top hemisphere (+Y) has zero singularity!
          float eps = 0.0022;
          vec3 tangent = normalize(cross(vec3(0.0, 0.0, 1.0), S + vec3(0.0001)));
          vec3 bitangent = normalize(cross(S, tangent));

          float h0 = sampleRelief(S);
          float hx = sampleRelief(normalize(S + tangent * eps));
          float hy = sampleRelief(normalize(S + bitangent * eps));

          vec3 bumpN = normalize(N + (tangent * (h0 - hx) + bitangent * (h0 - hy)) * 0.75);

          // Modulate with rich Martian geological detail matched to regionalSurfaceMesh & marsTerrain
          float microTex = noise3D(S * 210.0);
          baseAlbedo *= 0.78 + 0.32 * h0;
          baseAlbedo *= 0.90 + 0.18 * microTex;

          // Subtle equatorial water-ice cirrus wisps
          float latMask = 1.0 - smoothstep(0.15, 0.75, abs(S.z));
          float cloudNoise = fbm3D(S * 14.0 + vec3(uTime * 0.002, 0.0, uTime * 0.001));
          float cloudFactor = smoothstep(0.64, 0.85, cloudNoise) * latMask * 0.24;
          baseAlbedo = mix(baseAlbedo, vec3(0.82, 0.68, 0.58), cloudFactor);

          // Day/Night Solar Terminator with calibrated dusty regolith reflectance (never bleaches white!)
          float NdotL = dot(bumpN, L);
          float macroNdotL = dot(N, L);
          float dayFactor = smoothstep(-0.14, 0.28, macroNdotL);
          float diff = clamp((NdotL + 0.26) * 0.78, 0.04, 1.0) * dayFactor;

          float twilight = smoothstep(-0.22, 0.06, macroNdotL) * (1.0 - smoothstep(0.04, 0.40, macroNdotL));

          vec3 dayLight = vec3(0.96, 0.82, 0.70);
          vec3 nightLight = vec3(0.005, 0.006, 0.012);
          vec3 surfaceColor = baseAlbedo * (vec3(0.22, 0.13, 0.10) * dayFactor + mix(nightLight, dayLight, diff));

          // Warm dust scattering along the terminator
          surfaceColor += vec3(0.62, 0.25, 0.12) * twilight * 0.28;

          // Rayleigh + Mie Atmospheric Haze & Planetary Limb Fresnel
          float fresnel = 1.0 - max(0.0, dot(N, V));
          float innerDustHaze = pow(fresnel, 2.4);
          float midAtmoBand = pow(fresnel, 4.5);
          float outerAirglow = pow(fresnel, 8.0);

          float sunIllum = max(0.10, macroNdotL * 0.75 + 0.25);

          surfaceColor = mix(surfaceColor, uAtmosphereColor * sunIllum, innerDustHaze * 0.45);

          vec3 limbGlow = mix(uAtmosphereColor, uAirglowBlue, 0.52) * midAtmoBand * 0.55 * sunIllum;
          limbGlow += uAirglowBlue * outerAirglow * 1.15 * sunIllum;

          vec3 finalColor = surfaceColor + limbGlow;

          gl_FragColor = vec4(finalColor, uFade);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true
    });

    this.planetMesh = new THREE.Mesh(planetGeo, planetMat);
    this.planetMesh.renderOrder = -800;
    this.planetMat = planetMat;
    this.group.add(this.planetMesh);
  }

  initAtmosphericAirglowLimb() {
    // Concentric outer atmospheric airglow halo (radius +1.4%)
    const airglowGeo = new THREE.SphereGeometry(this.planetRadius * 1.014, 64, 48);
    const airglowMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: this.sunDirection.clone() },
        uFade: { value: 0.0 },
        uDustColor: { value: new THREE.Color(0xe28d62) },
        uAirglowCyan: { value: new THREE.Color(0x58b2ff) }
      },
      vertexShader: `
        varying vec3 vNormalWorld;
        varying vec3 vViewDir;
        varying vec3 vPosWorld;

        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vPosWorld = worldPos.xyz;
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform float uFade;
        uniform vec3 uDustColor;
        uniform vec3 uAirglowCyan;

        varying vec3 vNormalWorld;
        varying vec3 vViewDir;
        varying vec3 vPosWorld;

        void main() {
          if (uFade <= 0.001) discard;

          vec3 N = normalize(vNormalWorld);
          vec3 V = normalize(vViewDir);
          vec3 L = normalize(uSunDir);

          float NdotV = abs(dot(N, V));
          float edge = pow(1.0 - NdotV, 4.0);

          // Sunlight crescent modulation
          float NdotL = dot(N, L);
          float sunLit = max(0.08, NdotL * 0.78 + 0.22);

          // Dual-layer color: inner salmon dust troposphere, outer electric blue mesosphere
          vec3 haloCol = mix(uDustColor, uAirglowCyan, smoothstep(0.28, 0.88, 1.0 - NdotV));
          vec3 finalGlow = haloCol * edge * sunLit * 1.45;

          gl_FragColor = vec4(finalGlow, edge * uFade * 0.88);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true
    });

    this.airglowMesh = new THREE.Mesh(airglowGeo, airglowMat);
    this.airglowMesh.renderOrder = -790;
    this.airglowMat = airglowMat;
    this.group.add(this.airglowMesh);
  }

  initCosmicSpaceEnvironment() {
    this.spaceGroup = new THREE.Group();
    this.group.add(this.spaceGroup);

    // 1. Procedural 3D Moon Phobos (Irregular cratered potato moon)
    const phobosGeo = new THREE.DodecahedronGeometry(180.0, 2);
    const posAttr = phobosGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      let x = posAttr.getX(i);
      let y = posAttr.getY(i);
      let z = posAttr.getZ(i);

      x *= 1.25;
      y *= 0.88;
      z *= 0.76;

      const len = Math.hypot(x, y, z);
      const craterNoise = (Math.sin(x * 0.03) * Math.cos(z * 0.03)) * 16.0;
      const dStickney = Math.hypot(x - 130.0, y - 15.0, z - 15.0);
      const stickneyIndent = dStickney < 120.0 ? Math.cos((dStickney / 120.0) * Math.PI * 0.5) * 38.0 : 0.0;

      const scale = (len + craterNoise - stickneyIndent) / len;
      posAttr.setXYZ(i, x * scale, y * scale, z * scale);
    }
    phobosGeo.computeVertexNormals();

    const phobosMat = new THREE.MeshStandardMaterial({
      color: 0x8a847e,
      roughness: 0.92,
      metalness: 0.05
    });
    this.phobosMesh = new THREE.Mesh(phobosGeo, phobosMat);
    this.phobosOrbitRadius = 210000.0;
    this.phobosOrbitAngle = 0.65;
    this.spaceGroup.add(this.phobosMesh);

    // 2. Procedural 3D Moon Deimos
    const deimosGeo = new THREE.DodecahedronGeometry(75.0, 1);
    const dPosAttr = deimosGeo.attributes.position;
    for (let i = 0; i < dPosAttr.count; i++) {
      let x = dPosAttr.getX(i) * 1.15;
      let y = dPosAttr.getY(i) * 0.95;
      let z = dPosAttr.getZ(i) * 0.85;
      dPosAttr.setXYZ(i, x, y, z);
    }
    deimosGeo.computeVertexNormals();
    const deimosMat = new THREE.MeshStandardMaterial({
      color: 0x9b958e,
      roughness: 0.88,
      metalness: 0.05
    });
    this.deimosMesh = new THREE.Mesh(deimosGeo, deimosMat);
    this.deimosOrbitRadius = 285000.0;
    this.deimosOrbitAngle = 2.4;
    this.spaceGroup.add(this.deimosMesh);

    // 3. The "Pale Blue Dot" (Distant Earth & Moon in Mars orbital sky)
    this.earthGroup = new THREE.Group();
    const earthMat = new THREE.MeshBasicMaterial({ color: 0x4da6ff });
    const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(24.0, 12, 12), earthMat);
    this.earthGroup.add(earthMesh);

    const earthGlowMat = new THREE.MeshBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending
    });
    const earthGlow = new THREE.Mesh(new THREE.SphereGeometry(42.0, 12, 12), earthGlowMat);
    this.earthGroup.add(earthGlow);

    const moonMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
    const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(6.0, 8, 8), moonMat);
    moonMesh.position.set(60.0, 22.0, 0);
    this.earthGroup.add(moonMesh);

    this.earthGroup.position.set(-160000.0, 135000.0, -160000.0);
    this.spaceGroup.add(this.earthGroup);
  }

  initOrbitalSatellite() {
    this.satellite = new THREE.Group();

    const busGeo = new THREE.BoxGeometry(4.5, 3.2, 3.0);
    const busMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.32,
      metalness: 0.88
    });
    const bus = new THREE.Mesh(busGeo, busMat);
    this.satellite.add(bus);

    const dishGeo = new THREE.CylinderGeometry(2.4, 0.4, 0.9, 12, 1, true);
    dishGeo.rotateX(Math.PI / 2);
    const dishMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.25,
      metalness: 0.75,
      side: THREE.DoubleSide
    });
    const dish = new THREE.Mesh(dishGeo, dishMat);
    dish.position.set(0, 2.2, 0);
    dish.lookAt(new THREE.Vector3(-1, 0.8, -1));
    this.satellite.add(dish);

    const panelGeo = new THREE.BoxGeometry(11.0, 0.08, 2.6);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1a3366,
      roughness: 0.2,
      metalness: 0.92
    });
    const leftPanel = new THREE.Mesh(panelGeo, panelMat);
    leftPanel.position.set(-8.2, 0, 0);
    this.satellite.add(leftPanel);

    const rightPanel = new THREE.Mesh(panelGeo, panelMat);
    rightPanel.position.set(8.2, 0, 0);
    this.satellite.add(rightPanel);

    const beaconGeo = new THREE.SphereGeometry(0.35, 8, 8);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0x33ff88 });
    const beacon = new THREE.Mesh(beaconGeo, this.beaconMat);
    beacon.position.set(0, -1.8, 0);
    this.satellite.add(beacon);

    this.satelliteOrbitRadius = 172000.0;
    this.satelliteOrbitAngle = 1.25;
    this.spaceGroup.add(this.satellite);
  }

  update(dt, alt, speed, shipPos) {
    // Smooth cross-fade between the 36km regional Martian surface (0 - 14km) and the 165km 3D planetary globe (3km - 100km+)
    const fade = THREE.MathUtils.smoothstep(alt, 3000.0, 12500.0);
    this.group.visible = fade > 0.005;

    if (!this.group.visible) return;
    this.ensureInitialized();

    if (this.planetMat) {
      this.planetMat.uniforms.uFade.value = fade;
      this.planetMat.uniforms.uTime.value += dt;
    }
    if (this.airglowMat) {
      this.airglowMat.uniforms.uFade.value = fade;
    }

    // Keep the 165km Mars globe horizontally centered directly beneath the active camera (shipPos.x, shipPos.z)
    // and keep visual altitude close to the planetary surface during atmospheric entry (12km - 50km)
    const clampedAlt = Math.max(0.0, alt);
    const visualSpaceAlt = clampedAlt <= 3500.0
      ? clampedAlt
      : 3500.0 + (clampedAlt - 3500.0) * 0.30;
    const globeCenterY = shipPos.y - this.planetRadius - visualSpaceAlt;

    this.planetMesh.position.set(shipPos.x, globeCenterY, shipPos.z);
    this.airglowMesh.position.set(shipPos.x, globeCenterY, shipPos.z);

    // Roll the planet surface along its equator (Z-axis polar spin) as the spacecraft travels downrange (+X) and orbits
    this.orbitRotation += dt * (0.0025 + Math.max(0, speed - 400) * 0.000004);
    const downrangeLon = (shipPos.x - this.padCoords.x) * 0.000008;
    const downrangeLat = (shipPos.z - this.padCoords.y) * 0.000008;
    this.planetMesh.rotation.z = -0.35 + this.orbitRotation * 0.12 + downrangeLon;
    this.planetMesh.rotation.x = THREE.MathUtils.clamp(downrangeLat, -0.35, 0.35);

    // Orbit Phobos across the Martian space sky
    if (this.phobosMesh) {
      this.phobosOrbitAngle += dt * 0.008;
      const px = shipPos.x + Math.cos(this.phobosOrbitAngle) * this.phobosOrbitRadius;
      const pz = shipPos.z + Math.sin(this.phobosOrbitAngle) * this.phobosOrbitRadius;
      const py = globeCenterY + Math.sin(this.phobosOrbitAngle * 0.6) * 24000.0 + 115000.0;
      this.phobosMesh.position.set(px, py, pz);
      this.phobosMesh.rotation.y += dt * 0.02;
    }

    // Orbit Deimos in the far distance
    if (this.deimosMesh) {
      this.deimosOrbitAngle += dt * 0.003;
      const dx = shipPos.x + Math.cos(this.deimosOrbitAngle) * this.deimosOrbitRadius;
      const dz = shipPos.z + Math.sin(this.deimosOrbitAngle) * this.deimosOrbitRadius;
      const dy = globeCenterY + 165000.0;
      this.deimosMesh.position.set(dx, dy, dz);
    }

    // Orbit Communications Satellite
    if (this.satellite) {
      this.satelliteOrbitAngle += dt * 0.035;
      const sx = shipPos.x + Math.cos(this.satelliteOrbitAngle) * this.satelliteOrbitRadius;
      const sz = shipPos.z + Math.sin(this.satelliteOrbitAngle) * this.satelliteOrbitRadius;
      const sy = globeCenterY + 162000.0 + Math.sin(this.satelliteOrbitAngle * 2.0) * 2200.0;
      this.satellite.position.set(sx, sy, sz);
      this.satellite.rotation.y += dt * 0.15;
    }
  }

  dispose() {
    try {
      if (this.planetMesh) {
        this.planetMesh.geometry.dispose();
        if (this.planetMat) {
          if (this.planetMat.uniforms?.uMap?.value) {
            this.planetMat.uniforms.uMap.value.dispose();
          }
          this.planetMat.dispose();
        }
      }
      if (this.airglowMesh) {
        this.airglowMesh.geometry.dispose();
        if (this.airglowMat) this.airglowMat.dispose();
      }
      if (this.group && this.scene) {
        this.scene.remove(this.group);
      }
    } catch (_) {}
  }
}
