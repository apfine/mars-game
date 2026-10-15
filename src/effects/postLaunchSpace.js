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
function createProceduralMarsTexture() {
  if (typeof document === 'undefined') return null;

  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // Simple deterministic pseudorandom hash
  const hash2d = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
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

  const fbm = (x, y, octaves = 5) => {
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
  const COL_HIGHLAND_R = 196, COL_HIGHLAND_G = 96, COL_HIGHLAND_B = 58;
  // Deep desert plateau
  const COL_PLATEAU_R = 175, COL_PLATEAU_G = 78, COL_PLATEAU_B = 44;
  // Dark volcanic basalt (Syrtis Major, Acidalia)
  const COL_BASALT_R = 48, COL_BASALT_G = 38, COL_BASALT_B = 34;
  // Canyon floor shadow
  const COL_CANYON_R = 32, COL_CANYON_G = 20, COL_CANYON_B = 16;
  // Polar ice cap (white/ice-blue)
  const COL_ICE_R = 242, COL_ICE_G = 248, COL_ICE_B = 255;
  // Hellas basin dust
  const COL_HELLAS_R = 208, COL_HELLAS_G = 124, COL_HELLAS_B = 84;

  for (let y = 0; y < height; y++) {
    const v = y / height; // 0 (North Pole) to 1 (South Pole)
    const lat = (0.5 - v) * Math.PI; // +PI/2 to -PI/2

    for (let x = 0; x < width; x++) {
      const u = x / width; // 0 to 1 (Longitude 0° to 360°)
      const idx = (y * width + x) * 4;

      // Spherical coordinates for seamless wrapping
      const nx = Math.cos(lat) * Math.cos(u * Math.PI * 2);
      const ny = Math.sin(lat);
      const nz = Math.cos(lat) * Math.sin(u * Math.PI * 2);

      // Base planetary fractal terrain
      const n1 = fbm(nx * 3.5 + 10.0, ny * 3.5 + 10.0, 5);
      const n2 = fbm(nz * 7.0 + 20.0, ny * 7.0 + 20.0, 4) * 0.4;
      let elevation = n1 + n2; // ~0.0 to 1.3

      // 1. Dark Volcanic Basaltic Mare (Albedo Features)
      // Syrtis Major (u ~ 0.78, v ~ 0.50)
      const dSyrtis = Math.hypot(u - 0.79, (v - 0.50) * 1.8);
      const isSyrtis = Math.max(0, 1.0 - dSyrtis / 0.08);

      // Mare Acidalium (u ~ 0.48, v ~ 0.32)
      const dAcidalia = Math.hypot(u - 0.48, (v - 0.32) * 1.5);
      const isAcidalia = Math.max(0, 1.0 - dAcidalia / 0.12);

      // Sinus Meridiani / Sabaeus band (u ~ 0.55, v ~ 0.52)
      const dMeridiani = Math.hypot(u - 0.56, (v - 0.52) * 3.2);
      const isMeridiani = Math.max(0, 1.0 - dMeridiani / 0.14);

      const darkMare = Math.min(1.0, isSyrtis * 1.6 + isAcidalia * 1.2 + isMeridiani * 1.1 + (elevation < 0.42 ? (0.42 - elevation) * 2.5 : 0.0));

      // 2. Valles Marineris (Grand Canyon of Mars)
      // Spans u from ~0.22 to ~0.42 near the equator v ~ 0.52
      let isCanyon = 0.0;
      if (u > 0.20 && u < 0.44 && Math.abs(v - 0.52) < 0.045) {
        const canyonProgress = (u - 0.20) / 0.24;
        const canyonMeander = Math.sin(canyonProgress * Math.PI * 3.5) * 0.008;
        const distToCenter = Math.abs((v - 0.52) - canyonMeander);
        if (distToCenter < 0.016) {
          isCanyon = Math.pow(1.0 - distToCenter / 0.016, 1.8);
          // Canyon depth variation
          isCanyon *= 0.75 + 0.25 * Math.sin(canyonProgress * Math.PI * 8.0);
        }
      }

      // 3. Tharsis Shield Volcanoes
      // Olympus Mons (u ~ 0.17, v ~ 0.38) - 22 km tall!
      const dOlympus = Math.hypot(u - 0.17, (v - 0.38) * 1.3);
      let isOlympus = 0.0;
      let isCaldera = 0.0;
      if (dOlympus < 0.038) {
        // Shield slope
        isOlympus = Math.pow(1.0 - dOlympus / 0.038, 2.2);
        // Caldera ring crater at the peak
        if (dOlympus < 0.008) {
          isCaldera = Math.cos((dOlympus / 0.008) * Math.PI * 0.5);
        }
      }

      // The 3 Tharsis Montes (Ascraeus, Pavonis, Arsia)
      const dAscraeus = Math.hypot(u - 0.24, (v - 0.39) * 1.4);
      const dPavonis = Math.hypot(u - 0.22, (v - 0.47) * 1.4);
      const dArsia = Math.hypot(u - 0.20, (v - 0.55) * 1.4);
      const isTharsisMons = Math.max(0, 1.0 - Math.min(dAscraeus, dPavonis, dArsia) / 0.024);

      // 4. Hellas Planitia Impact Basin (u ~ 0.72, v ~ 0.72)
      const dHellas = Math.hypot(u - 0.72, (v - 0.72) * 1.2);
      const isHellas = Math.max(0, 1.0 - dHellas / 0.11);

      // 5. Northern Polar Ice Cap (Planum Boreum)
      let isNorthIce = 0.0;
      if (v < 0.14) {
        const iceEdge = 0.14 - fbm(nx * 12.0, nz * 12.0, 3) * 0.03;
        if (v < iceEdge) {
          isNorthIce = Math.min(1.0, (iceEdge - v) / 0.05);
          // Chasma Boreale spiral fissures in the ice cap
          const spiral = Math.sin(Math.atan2(nz, nx) * 3.0 + v * 30.0);
          if (spiral > 0.6) isNorthIce *= 0.78;
        }
      }

      // Southern Polar Frost (Planum Australe)
      let isSouthIce = 0.0;
      if (v > 0.88) {
        const iceEdge = 0.88 + fbm(nx * 10.0, nz * 10.0, 3) * 0.03;
        if (v > iceEdge) {
          isSouthIce = Math.min(1.0, (v - iceEdge) / 0.06);
        }
      }

      // 6. Impact Craters (circular rim walls with shadow depressions)
      let craterEffect = 0.0;
      const craterGridU = (u * 38.0) % 1.0;
      const craterGridV = (v * 19.0) % 1.0;
      const cCellU = Math.floor(u * 38.0);
      const cCellV = Math.floor(v * 19.0);
      const cHash = hash2d(cCellU, cCellV);
      if (cHash > 0.68) {
        const cRadius = 0.18 + (cHash - 0.68) * 0.8;
        const dCrater = Math.hypot(craterGridU - 0.5, craterGridV - 0.5);
        if (dCrater < cRadius) {
          const rimDist = Math.abs(dCrater - cRadius * 0.82);
          if (rimDist < 0.08) {
            craterEffect = (1.0 - rimDist / 0.08) * 0.45; // bright raised rim
          } else if (dCrater < cRadius * 0.82) {
            craterEffect = -0.28; // shadowed interior bowl
          }
        }
      }

      // Base color blending
      let r = COL_HIGHLAND_R;
      let g = COL_HIGHLAND_G;
      let b = COL_HIGHLAND_B;

      // Subtle terrain variation
      const terraVar = (elevation - 0.7) * 40.0;
      r = Math.min(255, Math.max(0, r + terraVar));
      g = Math.min(255, Math.max(0, g + terraVar * 0.75));
      b = Math.min(255, Math.max(0, b + terraVar * 0.5));

      // Apply Dark Volcanic Basalt
      if (darkMare > 0.05) {
        const m = Math.min(1.0, darkMare);
        r = r * (1 - m) + COL_BASALT_R * m;
        g = g * (1 - m) + COL_BASALT_G * m;
        b = b * (1 - m) + COL_BASALT_B * m;
      }

      // Apply Hellas Basin
      if (isHellas > 0.05) {
        const h = Math.min(1.0, isHellas);
        r = r * (1 - h) + COL_HELLAS_R * h;
        g = g * (1 - h) + COL_HELLAS_G * h;
        b = b * (1 - h) + COL_HELLAS_B * h;
      }

      // Apply Valles Marineris canyon shadow
      if (isCanyon > 0.05) {
        r = r * (1 - isCanyon) + COL_CANYON_R * isCanyon;
        g = g * (1 - isCanyon) + COL_CANYON_G * isCanyon;
        b = b * (1 - isCanyon) + COL_CANYON_B * isCanyon;
      }

      // Apply Olympus Mons & Tharsis volcanoes
      if (isOlympus > 0.05) {
        const oR = 210, oG = 110, oB = 70;
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

      // Apply Crater rims and floor shadows
      if (Math.abs(craterEffect) > 0.01) {
        r = Math.min(255, Math.max(0, r + craterEffect * 80.0));
        g = Math.min(255, Math.max(0, g + craterEffect * 50.0));
        b = Math.min(255, Math.max(0, b + craterEffect * 35.0));
      }

      // Apply Polar Ice Caps
      const iceTotal = Math.min(1.0, isNorthIce + isSouthIce);
      if (iceTotal > 0.02) {
        r = r * (1 - iceTotal) + COL_ICE_R * iceTotal;
        g = g * (1 - iceTotal) + COL_ICE_G * iceTotal;
        b = b * (1 - iceTotal) + COL_ICE_B * iceTotal;
      }

      // 7. Orographic clouds leeward of Olympus Mons & volcanoes
      if (u > 0.18 && u < 0.28 && Math.abs(v - 0.42) < 0.08) {
        const cloudNoise = fbm(u * 28.0, v * 28.0, 3);
        if (cloudNoise > 0.58) {
          const cAlpha = (cloudNoise - 0.58) * 1.8;
          r = Math.min(255, r + cAlpha * 65.0);
          g = Math.min(255, g + cAlpha * 75.0);
          b = Math.min(255, b + cAlpha * 95.0);
        }
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
  return texture;
}

// ---------------------------------------------------------------------------
// PostLaunchSpace: High-Performance 3D Mars Planet Globe & Orbital Space System
// ---------------------------------------------------------------------------
export class PostLaunchSpace {
  constructor(scene, padCoords = new THREE.Vector2(1400, 1150)) {
    this.scene = scene;
    this.padCoords = padCoords;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this.planetRadius = 52000.0; // Scaled planetary radius in world units
    this.sunDirection = new THREE.Vector3(0.5, 0.65, 0.45).normalize();
    this.orbitRotation = 0.0;

    this.initPlanetGlobe();
    this.initAtmosphericAirglowLimb();
    this.initCosmicSpaceEnvironment();
    this.initOrbitalSatellite();
  }

  initPlanetGlobe() {
    const planetTexture = createProceduralMarsTexture();

    // Custom Planet Shader: directional day/night terminator + crater bump relief + atmospheric Fresnel limb
    const planetGeo = new THREE.SphereGeometry(this.planetRadius, 64, 48);
    const planetMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: planetTexture },
        uSunDir: { value: this.sunDirection.clone() },
        uFade: { value: 0.0 },
        uAtmosphereColor: { value: new THREE.Color(0xe0aa8c) },
        uAirglowBlue: { value: new THREE.Color(0x5ca0d3) },
        uTime: { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        varying vec3 vPositionWorld;
        varying vec3 vViewDir;

        void main() {
          vUv = uv;
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
        varying vec3 vPositionWorld;
        varying vec3 vViewDir;

        void main() {
          if (uFade <= 0.001) discard;

          vec3 N = normalize(vNormalWorld);
          vec3 L = normalize(uSunDir);
          vec3 V = normalize(vViewDir);

          // Sample high-res procedural Mars albedo map
          vec4 texColor = texture2D(uMap, vUv);

          // Day/Night Solar Terminator with smooth atmospheric scattering wrap
          float NdotL = dot(N, L);
          float dayFactor = smoothstep(-0.12, 0.32, NdotL);
          float twilight = smoothstep(-0.25, 0.05, NdotL) * (1.0 - smoothstep(0.05, 0.45, NdotL));

          // Base surface lighting
          vec3 dayLight = vec3(1.15, 1.08, 0.98);
          vec3 nightLight = vec3(0.003, 0.005, 0.012); // Deep space starlight
          vec3 surfaceColor = texColor.rgb * mix(nightLight, dayLight, dayFactor);

          // Warm dust scattering along the terminator line
          surfaceColor += uAtmosphereColor * twilight * 0.35;

          // Planetary Limb Fresnel: signature dual-layer Martian atmospheric fringe
          float fresnel = 1.0 - max(0.0, dot(N, V));
          float innerLimb = pow(fresnel, 2.8);
          float outerAirglow = pow(fresnel, 5.5);

          vec3 limbGlow = mix(uAtmosphereColor, uAirglowBlue, 0.45) * innerLimb * 0.65;
          limbGlow += uAirglowBlue * outerAirglow * 1.4;

          // Only illuminate atmospheric limb where facing the sun
          limbGlow *= max(0.12, NdotL * 0.7 + 0.3);

          vec3 finalColor = surfaceColor + limbGlow;

          gl_FragColor = vec4(finalColor, uFade);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: true
    });

    this.planetMesh = new THREE.Mesh(planetGeo, planetMat);
    this.planetMesh.renderOrder = 1;
    this.planetMesh.rotation.y = -Math.PI * 0.42; // Rotate so Valles Marineris and Olympus Mons face Starbase launch trajectory
    this.planetMat = planetMat;
    this.group.add(this.planetMesh);
  }

  initAtmosphericAirglowLimb() {
    // Concentric outer atmospheric airglow halo (radius +1.8%)
    const airglowGeo = new THREE.SphereGeometry(this.planetRadius * 1.018, 64, 48);
    const airglowMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: this.sunDirection.clone() },
        uFade: { value: 0.0 },
        uDustColor: { value: new THREE.Color(0xdf8458) },
        uAirglowCyan: { value: new THREE.Color(0x4ca8ff) }
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
          float edge = pow(1.0 - NdotV, 3.8);

          // Sunlight crescent modulation
          float NdotL = dot(N, L);
          float sunLit = max(0.08, NdotL * 0.75 + 0.25);

          // Dual-layer color: inner salmon, outer electric blue
          vec3 haloCol = mix(uDustColor, uAirglowCyan, smoothstep(0.3, 0.9, 1.0 - NdotV));
          vec3 finalGlow = haloCol * edge * sunLit * 1.8;

          gl_FragColor = vec4(finalGlow, edge * uFade * 0.95);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true
    });

    this.airglowMesh = new THREE.Mesh(airglowGeo, airglowMat);
    this.airglowMesh.renderOrder = 2;
    this.airglowMat = airglowMat;
    this.group.add(this.airglowMesh);
  }

  initCosmicSpaceEnvironment() {
    this.spaceGroup = new THREE.Group();
    this.group.add(this.spaceGroup);

    // 1. Procedural 3D Moon Phobos (Irregular cratered potato moon)
    // Phobos is physically ~22 km in diameter and orbits ~6,000 km above Mars
    const phobosGeo = new THREE.DodecahedronGeometry(120.0, 3);
    const posAttr = phobosGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      let x = posAttr.getX(i);
      let y = posAttr.getY(i);
      let z = posAttr.getZ(i);

      // Deform spherical shape into potato-like triaxial ellipsoid (27 x 22 x 18)
      x *= 1.25;
      y *= 0.88;
      z *= 0.76;

      // Surface craters & Stickney impact depression
      const len = Math.hypot(x, y, z);
      const craterNoise = (Math.sin(x * 0.04) * Math.cos(z * 0.04)) * 12.0;

      // Stickney crater indent on leading face
      const dStickney = Math.hypot(x - 90.0, y - 10.0, z - 10.0);
      const stickneyIndent = dStickney < 85.0 ? Math.cos((dStickney / 85.0) * Math.PI * 0.5) * 28.0 : 0.0;

      const scale = (len + craterNoise - stickneyIndent) / len;
      posAttr.setXYZ(i, x * scale, y * scale, z * scale);
    }
    phobosGeo.computeVertexNormals();

    const phobosMat = new THREE.MeshStandardMaterial({
      color: 0x8a847e,
      roughness: 0.92,
      metalness: 0.05,
      bumpScale: 3.5
    });
    this.phobosMesh = new THREE.Mesh(phobosGeo, phobosMat);
    this.phobosOrbitRadius = 88000.0;
    this.phobosOrbitAngle = 0.65;
    this.spaceGroup.add(this.phobosMesh);

    // 2. Procedural 3D Moon Deimos (Smaller, smoother outer moon)
    const deimosGeo = new THREE.DodecahedronGeometry(55.0, 2);
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
    this.deimosOrbitRadius = 145000.0;
    this.deimosOrbitAngle = 2.4;
    this.spaceGroup.add(this.deimosMesh);

    // 3. The "Pale Blue Dot" (Distant Earth & Moon in Mars orbital sky)
    // Famous Carl Sagan perspective: Earth visible as a jewel-like sapphire pixel
    this.earthGroup = new THREE.Group();
    const earthMat = new THREE.MeshBasicMaterial({ color: 0x4da6ff });
    const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(18.0, 16, 16), earthMat);
    this.earthGroup.add(earthMesh);

    // Earth's atmospheric blue glow corona
    const earthGlowMat = new THREE.MeshBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending
    });
    const earthGlow = new THREE.Mesh(new THREE.SphereGeometry(32.0, 16, 16), earthGlowMat);
    this.earthGroup.add(earthGlow);

    // Tiny companion dot: Luna (Earth's Moon)
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
    const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(4.5, 8, 8), moonMat);
    moonMesh.position.set(45.0, 18.0, 0);
    this.earthGroup.add(moonMesh);

    // Position Earth ~180,000 m out in deep space
    this.earthGroup.position.set(-110000.0, 95000.0, -110000.0);
    this.spaceGroup.add(this.earthGroup);
  }

  initOrbitalSatellite() {
    // Autonomous Mars Communications Relay / Starlink Mars Orbital Tug
    // Drifts in low Mars orbit with gleaming solar arrays and telemetry beacons
    this.satellite = new THREE.Group();

    // Central satellite bus with gold foil MLI thermal blanket
    const busGeo = new THREE.BoxGeometry(4.5, 3.2, 3.0);
    const busMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Gold foil
      roughness: 0.32,
      metalness: 0.88
    });
    const bus = new THREE.Mesh(busGeo, busMat);
    this.satellite.add(bus);

    // Parabolic High-Gain Antenna pointing toward Earth
    const dishGeo = new THREE.CylinderGeometry(2.4, 0.4, 0.9, 16, 1, true);
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

    // Twin Photovoltaic Solar Array Wings
    const panelGeo = new THREE.BoxGeometry(11.0, 0.08, 2.6);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1a3366, // Dark blue silicon solar cells
      roughness: 0.2,
      metalness: 0.92
    });
    const leftPanel = new THREE.Mesh(panelGeo, panelMat);
    leftPanel.position.set(-8.2, 0, 0);
    this.satellite.add(leftPanel);

    const rightPanel = new THREE.Mesh(panelGeo, panelMat);
    rightPanel.position.set(8.2, 0, 0);
    this.satellite.add(rightPanel);

    // Blinking Optical Telemetry LED
    const beaconGeo = new THREE.SphereGeometry(0.35, 8, 8);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0x33ff88 });
    const beacon = new THREE.Mesh(beaconGeo, this.beaconMat);
    beacon.position.set(0, -1.8, 0);
    this.satellite.add(beacon);

    this.satelliteOrbitRadius = 57000.0;
    this.satelliteOrbitAngle = 1.25;
    this.spaceGroup.add(this.satellite);
  }

  update(dt, alt, speed, shipPos) {
    // Smooth fade-in as Starship ascends into space:
    // Starts revealing curvature at 4 km, reaching full planetary majesty by 18 km+
    const fade = THREE.MathUtils.clamp((alt - 3800.0) / 14000.0, 0.0, 1.0);
    this.group.visible = fade > 0.005;

    if (!this.group.visible) return;

    if (this.planetMat) {
      this.planetMat.uniforms.uFade.value = fade;
      this.planetMat.uniforms.uTime.value += dt;
    }
    if (this.airglowMat) {
      this.airglowMat.uniforms.uFade.value = fade;
    }

    // Anchor the 3D Mars globe below Starship:
    // At low altitude, top of sphere is tangent to surface at pad elevation.
    // As altitude increases, planet centers gracefully below the flight trajectory,
    // producing authentic spherical perspective curvature of the Red Planet.
    const padX = this.padCoords.x;
    const padZ = this.padCoords.y;

    const globeCenterY = shipPos.y - this.planetRadius - Math.min(alt, 120000.0) * 0.42;
    this.planetMesh.position.set(padX, globeCenterY, padZ);
    this.airglowMesh.position.set(padX, globeCenterY, padZ);

    // Slow planetary diurnal rotation
    this.orbitRotation += dt * 0.003;
    this.planetMesh.rotation.y = -Math.PI * 0.42 + this.orbitRotation * 0.05;

    // Orbit Phobos across the Martian space sky
    if (this.phobosMesh) {
      this.phobosOrbitAngle += dt * 0.008;
      const px = padX + Math.cos(this.phobosOrbitAngle) * this.phobosOrbitRadius;
      const pz = padZ + Math.sin(this.phobosOrbitAngle) * this.phobosOrbitRadius;
      const py = globeCenterY + Math.sin(this.phobosOrbitAngle * 0.6) * 14000.0 + 26000.0;
      this.phobosMesh.position.set(px, py, pz);
      this.phobosMesh.rotation.y += dt * 0.02;
    }

    // Orbit Deimos in the far distance
    if (this.deimosMesh) {
      this.deimosOrbitAngle += dt * 0.003;
      const dx = padX + Math.cos(this.deimosOrbitAngle) * this.deimosOrbitRadius;
      const dz = padZ + Math.sin(this.deimosOrbitAngle) * this.deimosOrbitRadius;
      const dy = globeCenterY + 54000.0;
      this.deimosMesh.position.set(dx, dy, dz);
    }

    // Orbit Communications Satellite
    if (this.satellite) {
      this.satelliteOrbitAngle += dt * 0.035;
      const sx = padX + Math.cos(this.satelliteOrbitAngle) * this.satelliteOrbitRadius;
      const sz = padZ + Math.sin(this.satelliteOrbitAngle) * this.satelliteOrbitRadius;
      const sy = globeCenterY + 49500.0 + Math.sin(this.satelliteOrbitAngle * 2.0) * 2200.0;
      this.satellite.position.set(sx, sy, sz);
      this.satellite.rotation.y += dt * 0.15;

      // Pulse telemetry beacon (1 Hz blink)
      if (this.beaconMat) {
        const blink = (Math.sin(performance.now() * 0.006) > 0.3) ? 1.0 : 0.05;
        this.beaconMat.opacity = blink;
      }
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
