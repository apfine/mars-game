import * as THREE from 'three';
import { getMarsHeight, getMarsNormal } from '../terrain/noise.js';
import { SoftParticlePool } from './particles.js';

const SUN_DIR = new THREE.Vector3(0.5, 0.65, 0.45).normalize();

// Mars Atmospheric Skydome, Moons (Phobos/Deimos), Dust Devils, and Tire/Thruster Particles
export class MarsAtmosphere {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.wind = new THREE.Vector3(Math.cos(0.62) * 6.0, 0, Math.sin(0.62) * 6.0);
    this.dustDensity = 1.0; // quality scaler for emission (mobile / Low reduces this)

    this.createSky();
    this.createDistantMountains();
    this.createMoons();
    this.createWindDust();
    this.createVehicleParticles();
    this.createDustDevils();
  }

  setQuality(preset) {
    this.dustDensity = preset === 'Low' ? 0.4 : preset === 'Medium' ? 0.7 : preset === 'Ultra' ? 1.3 : 1.0;
  }

  setViewScale(heightPx, fovDeg) {
    this.dustPool.setViewScale(heightPx, fovDeg);
    this.fxPool.setViewScale(heightPx, fovDeg);
    this.devilPool.setViewScale(heightPx, fovDeg);
  }

  createSky() {
    // Custom Mars Atmospheric Sky Dome
    const skyGeo = new THREE.SphereGeometry(1200, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSunPos: { value: SUN_DIR.clone() },
        uSkyZenith: { value: new THREE.Color(0xb8795a) },     // Butterscotch overhead
        uSkyHorizon: { value: new THREE.Color(0xd9a07e) },    // Pale dusty tan horizon (matches terrain haze + scene fog)
        uSunColor: { value: new THREE.Color(0xfff5e6) },      // Brilliant Martian sun
        uSunHaloBlue: { value: new THREE.Color(0x5ca0d3) }    // Signature Mars twilight blue scattering halo
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uSunPos;
        uniform vec3 uSkyZenith;
        uniform vec3 uSkyHorizon;
        uniform vec3 uSunColor;
        uniform vec3 uSunHaloBlue;
        varying vec3 vWorldPosition;

        float h11(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h11(i), h11(i + vec2(1.0, 0.0)), f.x),
                     mix(h11(i + vec2(0.0, 1.0)), h11(i + vec2(1.0, 1.0)), f.x), f.y);
        }

        float fbm2(vec2 p) {
          float a = 0.5; float s = 0.0;
          for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
          return s;
        }

        void main() {
          vec3 dir = normalize(vWorldPosition);
          float e = max(dir.y, 0.0);
          vec3 sunDir = normalize(uSunPos);

          // Base gradient: pale dusty tan horizon rising to a deeper butterscotch zenith
          vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(e, 0.42));

          // Suspended-dust haze band hugging the horizon
          float band = exp(-e * 7.0);
          sky = mix(sky, uSkyHorizon * 1.08, band * 0.6);
          sky *= 1.0 - 0.12 * smoothstep(0.55, 1.0, e);

          // Sun-side brightening (dust forward scatters sunlight over a wide area)
          float sc = max(dot(dir, sunDir), 0.0);
          sky += vec3(0.30, 0.20, 0.12) * pow(sc, 3.0) * 0.45;

          // Wispy water-ice cirrus clouds streaked by high winds
          vec2 cp = dir.xz / (dir.y + 0.28);
          vec2 wind = vec2(uTime * 0.010, uTime * 0.004);
          vec2 q = cp * vec2(0.9, 2.6) + wind;
          float c1 = fbm2(q + fbm2(q * 0.7) * 1.2);
          float cloud = smoothstep(0.50, 0.78, c1) * smoothstep(0.05, 0.30, e) * (1.0 - smoothstep(0.7, 1.0, e) * 0.5);
          float thin = smoothstep(0.42, 0.62, fbm2(cp * vec2(0.5, 5.0) - wind * 1.5)) * smoothstep(0.08, 0.4, e) * 0.35;
          vec3 cloudCol = mix(vec3(0.95, 0.74, 0.62), vec3(1.0, 0.92, 0.84), pow(sc, 2.0));
          sky = mix(sky, cloudCol, clamp(cloud * 0.55 + thin, 0.0, 0.7));

          // Mars forward-scattering: blue corona around the sun + warm glare lobes
          float blueHalo = pow(sc, 14.0) * 0.55 * (1.0 - band * 0.3);
          sky = mix(sky, uSunHaloBlue, blueHalo);
          float glare = pow(sc, 6.0) * 0.30 + pow(sc, 40.0) * 0.6 + pow(sc, 420.0) * 1.8;
          sky += uSunColor * glare * 0.6;

          // Sharp Sun disk (Mars sun appears ~2/3 size of Earth sun)
          float sunDisk = smoothstep(0.9988, 0.9995, sc);
          vec3 col = sky + uSunColor * sunDisk * 3.0;

          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `
    });
    this.skyMat = skyMat;

    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.renderOrder = -10;
    this.scene.add(this.skyMesh);

    // Directional Sunlight & Ambient
    this.sunLight = new THREE.DirectionalLight(0xffecd4, 2.4);
    this.sunLight.position.copy(SUN_DIR).multiplyScalar(500);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 900;
    const d = 50;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.ambientLight = new THREE.AmbientLight(0x6a4034, 0.5);
    this.scene.add(this.ambientLight);

    // Warm sky fill / sand bounce light (soft, realistic shadow fill)
    this.hemiLight = new THREE.HemisphereLight(0xd9a98a, 0x8a4a30, 0.7);
    this.scene.add(this.hemiLight);

    // Atmospheric perspective for all standard-lit objects (terrain has its own matching fog)
    this.scene.fog = new THREE.Fog(0xd9a07e, 110, 520);
  }

  // Build an image-based lighting environment from the sky shader so metals, glass and paint reflect
  // the Martian sky and sand instead of looking flat and black.
  buildEnvironment(renderer) {
    const envScene = new THREE.Scene();
    const skyClone = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 24), this.skyMat.clone());
    skyClone.material.uniforms.uTime.value = 0;
    skyClone.renderOrder = -10;
    envScene.add(skyClone);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(95, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x9c5a3c })
    );
    ground.position.y = -1.0;
    envScene.add(ground);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(envScene, 0.015);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.85;
    pmrem.dispose();
    skyClone.geometry.dispose();
    ground.geometry.dispose();
  }

  createDistantMountains() {
    // 360-degree distant Martian mountain silhouettes (Olympus Mons caldera peak and crater rims)
    const segs = 180;
    const radius = 950.0;
    const geo = new THREE.BufferGeometry();
    const positions = [];

    const ridge = (t) => {
      const base = 30.0 + Math.sin(t * 3.0) * 18.0 + Math.pow(Math.max(0, Math.cos(t - 0.78)), 4.0) * 90.0;
      // Jagged high-frequency ridgelines (deterministic)
      const jag = Math.sin(t * 23.0 + 1.3) * 4.5 + Math.sin(t * 47.0) * 2.4 + Math.sin(t * 91.0 + 2.0) * 1.2;
      return base + jag;
    };

    for (let i = 0; i < segs; i++) {
      const theta1 = (i / segs) * Math.PI * 2;
      const theta2 = ((i + 1) / segs) * Math.PI * 2;
      const h1 = ridge(theta1);
      const h2 = ridge(theta2);

      const x1 = Math.cos(theta1) * radius;
      const z1 = Math.sin(theta1) * radius;
      const x2 = Math.cos(theta2) * radius;
      const z2 = Math.sin(theta2) * radius;

      positions.push(x1, -15, z1, x1, h1, z1, x2, h2, z2);
      positions.push(x1, -15, z1, x2, h2, z2, x2, -15, z2);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      fog: false,
      uniforms: {
        uHaze: { value: new THREE.Color(0xd9a07e) },
        uPeak: { value: new THREE.Color(0xb27a5e) }
      },
      vertexShader: `
        varying float vY;
        void main() {
          vY = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uHaze;
        uniform vec3 uPeak;
        varying float vY;
        void main() {
          // Atmospheric perspective: bases dissolve into haze, ridges stay slightly darker
          float t = smoothstep(-5.0, 120.0, vY);
          gl_FragColor = vec4(mix(uHaze, uPeak, t * 0.7), 1.0);
          #include <colorspace_fragment>
        }
      `
    });

    this.distantMountains = new THREE.Mesh(geo, mat);
    this.scene.add(this.distantMountains);
  }

  createMoons() {
    // Phobos (craggy potato-shaped Martian moon)
    const phobosGeo = new THREE.DodecahedronGeometry(14, 1);
    const phobosMat = new THREE.MeshStandardMaterial({
      color: 0x999088,
      roughness: 0.9,
      flatShading: true
    });
    this.phobos = new THREE.Mesh(phobosGeo, phobosMat);
    this.phobos.position.set(-450, 520, -600);
    this.scene.add(this.phobos);

    // Deimos (smaller distant speck)
    const deimosGeo = new THREE.DodecahedronGeometry(5, 1);
    const deimosMat = new THREE.MeshStandardMaterial({
      color: 0x888078,
      roughness: 0.95,
      flatShading: true
    });
    this.deimos = new THREE.Mesh(deimosGeo, deimosMat);
    this.deimos.position.set(580, 680, -750);
    this.scene.add(this.deimos);
  }

  createWindDust() {
    // Blowing sand particles drifting across the dunes
    this.dustCount = 1200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.dustCount * 3);
    const velocities = new Float32Array(this.dustCount * 3);

    this.windDustRadius = 120.0;

    for (let i = 0; i < this.dustCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * this.windDustRadius * 2;
      positions[i * 3 + 1] = Math.random() * 25 + 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.windDustRadius * 2;

      // Wind direction ~ 35 degrees
      const speed = 12.0 + Math.random() * 10.0;
      velocities[i * 3 + 0] = Math.cos(0.62) * speed;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 1.5;
      velocities[i * 3 + 2] = Math.sin(0.62) * speed;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.dustVelocities = velocities;

    const material = new THREE.PointsMaterial({
      color: 0xd98d6c,
      size: 1.4,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    this.dustPoints = new THREE.Points(geometry, material);
    this.dustPoints.frustumCulled = false;
    this.scene.add(this.dustPoints);
  }

  createVehicleParticles() {
    // 1. Sand dust (soft billowing sprites, tinted to the sand under the wheels)
    this.dustPool = new SoftParticlePool(this.scene, 900, { additive: false, softness: 1.0 });
    this.tireAcc = [0, 0, 0, 0];
    this.sandTints = [
      [0.78, 0.50, 0.34],
      [0.72, 0.44, 0.30],
      [0.84, 0.58, 0.40]
    ];

    // 2. Nitro sparks / embers (additive glow)
    this.fxPool = new SoftParticlePool(this.scene, 420, { additive: true, softness: 1.0, maxPointSize: 120 });
    this.nitroAcc = 0;
    this.emberAcc = 0;
    this.nitroLevel = 0;

    this.createNitroPlumes();
    this.createTireTracks();
  }

  createNitroPlumes() {
    // Volumetric-looking layered plume cones with animated flame shader + mach diamonds
    const makePlumeMaterial = (scale) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uScale: { value: scale }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        uniform float uScale;
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float t = vUv.y;                     // 0 at nozzle -> 1 at flame tip
          float ang = vUv.x * 6.2831853;
          float turb = 0.5 + 0.5 * sin(ang * 3.0 + t * 20.0 - uTime * 42.0);
          turb *= 0.5 + 0.5 * sin(ang * 5.0 - t * 31.0 - uTime * 57.0 + 1.7);
          float core = pow(1.0 - t, 2.0);
          float fres = pow(abs(dot(normalize(vN), normalize(vV))), 0.7);
          // Mach (shock) diamonds, stationary in the exhaust
          float diamonds = pow(max(0.0, sin(t * 26.0 / uScale + 0.6)), 8.0) * (1.0 - t) * step(0.04, t);
          vec3 outer = vec3(1.0, 0.42, 0.10);
          vec3 mid = vec3(1.0, 0.78, 0.40);
          vec3 inner = vec3(0.55, 0.80, 1.0);
          vec3 col = mix(outer, mid, smoothstep(0.55, 0.0, t));
          col = mix(col, inner, core * fres);
          col += vec3(0.9, 0.95, 1.0) * diamonds * 0.9;
          float flick = 0.75 + 0.25 * turb;
          float a = pow(1.0 - t, 1.3) * fres * flick * uIntensity;
          a += diamonds * 0.5 * uIntensity;
          gl_FragColor = vec4(col * (1.2 + core * 1.5), clamp(a, 0.0, 1.0));
        }
      `
    });

    const makeConeGeo = (radius) => {
      // Wide at nozzle (y = 0) tapering to a tip (y = 1), then pointed along -Z (rover rear)
      const g = new THREE.CylinderGeometry(0.0, radius, 1, 20, 6, true);
      g.translate(0, 0.5, 0);
      g.rotateX(-Math.PI / 2);
      return g;
    };

    this.plumes = [];
    for (let side = 0; side < 2; side++) {
      const outer = new THREE.Mesh(makeConeGeo(0.26), makePlumeMaterial(1.0));
      const inner = new THREE.Mesh(makeConeGeo(0.13), makePlumeMaterial(0.7));
      for (const m of [outer, inner]) {
        m.frustumCulled = false;
        m.visible = false;
        m.renderOrder = 12;
        this.scene.add(m);
      }
      this.plumes.push({ outer, inner, x: side === 0 ? -0.55 : 0.55 });
    }

    // Flickering exhaust light that paints the sand orange behind the rover
    this.nitroLight = new THREE.PointLight(0xff9a4a, 0, 26, 1.6);
    this.scene.add(this.nitroLight);
  }

  createTireTracks() {
    // Ring buffer of tire tread decals stamped onto the sand
    this.trackMax = 520;
    this.trackCursor = 0;

    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 32, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(2, 0, 28, 64);
    // Deep directional tread bars
    ctx.fillStyle = 'rgba(255,255,255,1.0)';
    for (let y = 0; y < 64; y += 8) {
      ctx.fillRect(2, y, 28, 4);
    }
    // Soft shoulder edges
    ctx.globalCompositeOperation = 'destination-out';
    const grad = ctx.createLinearGradient(0, 0, 32, 0);
    grad.addColorStop(0.0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.18, 'rgba(0,0,0,0)');
    grad.addColorStop(0.82, 'rgba(0,0,0,0)');
    grad.addColorStop(1.0, 'rgba(0,0,0,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 64);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;

    const planeGeo = new THREE.PlaneGeometry(1, 1);
    planeGeo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: 0x2b130c,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });

    this.tracks = new THREE.InstancedMesh(planeGeo, mat, this.trackMax);
    this.tracks.frustumCulled = false;
    this.tracks.renderOrder = 2;
    this._trackDummy = new THREE.Object3D();
    this._trackDummy.scale.set(0, 0, 0);
    this._trackDummy.updateMatrix();
    for (let i = 0; i < this.trackMax; i++) this.tracks.setMatrixAt(i, this._trackDummy.matrix);
    this.tracks.instanceMatrix.needsUpdate = true;
    this.scene.add(this.tracks);

    this.lastTrackPos = [0, 1, 2, 3].map(() => new THREE.Vector3(1e6, 0, 1e6));
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  createDustDevils() {
    // Wandering dust devils: rotating columns of dust that drift across the plain
    this.devilCount = 3;
    this.devilParticles = 80;
    this.devilPool = new SoftParticlePool(this.scene, this.devilCount * this.devilParticles, { additive: false, softness: 1.0, maxPointSize: 260 });
    this.devils = [];
    for (let i = 0; i < this.devilCount; i++) {
      this.devils.push({
        x: 0, z: 0, y: 0,
        radius: 2.5 + Math.random() * 2.5,
        height: 30 + Math.random() * 25,
        spin: 2.2 + Math.random() * 1.2,
        phase: Math.random() * 100,
        needsSpawn: true,
        meander: Math.random() * 6.28
      });
    }
    for (let i = 0; i < this.devilPool.count; i++) this.devilPool.alive[i] = 1;
  }

  spawnDevil(dv, playerPos, idx) {
    const a = (idx / this.devilCount) * Math.PI * 2 + Math.random() * 1.6;
    const r = 110 + Math.random() * 120;
    dv.x = playerPos.x + Math.cos(a) * r;
    dv.z = playerPos.z + Math.sin(a) * r;
    dv.needsSpawn = false;
  }

  updateDustDevils(dt, playerPos) {
    const pool = this.devilPool;
    const t = this.time;
    for (let d = 0; d < this.devilCount; d++) {
      const dv = this.devils[d];
      if (dv.needsSpawn) this.spawnDevil(dv, playerPos, d);
      dv.meander += dt * 0.25;
      dv.x += (this.wind.x * 0.8 + Math.cos(dv.meander) * 2.0) * dt;
      dv.z += (this.wind.z * 0.8 + Math.sin(dv.meander) * 2.0) * dt;
      const dx = dv.x - playerPos.x;
      const dz = dv.z - playerPos.z;
      if (dx * dx + dz * dz > 300 * 300) dv.needsSpawn = true;
      dv.y = getMarsHeight(dv.x, dv.z);

      for (let k = 0; k < this.devilParticles; k++) {
        const i = d * this.devilParticles + k;
        const i3 = i * 3;
        const seed = (k * 0.6180339) % 1.0;
        const u = (k / this.devilParticles + t * (0.10 + seed * 0.05) + dv.phase) % 1.0;
        const r = dv.radius * (0.25 + u * 1.15) * (0.7 + seed * 0.6);
        const ang = seed * 6.2831 * 3.0 + t * (dv.spin - u * 1.1) + u * 4.0;
        pool.pos[i3] = dv.x + Math.cos(ang) * r + this.wind.x * u * 1.8;
        pool.pos[i3 + 1] = dv.y + u * dv.height + 0.5;
        pool.pos[i3 + 2] = dv.z + Math.sin(ang) * r + this.wind.z * u * 1.8;
        pool.aSize[i] = 1.6 + u * 5.5 + seed * 1.5;
        pool.aAlpha[i] = 0.30 * Math.sin(Math.min(1.0, u * 1.05) * Math.PI) * (0.6 + seed * 0.4);
        const shade = 0.78 - u * 0.12;
        pool.aColor[i3] = 0.80 * shade;
        pool.aColor[i3 + 1] = 0.50 * shade;
        pool.aColor[i3 + 2] = 0.36 * shade;
      }
    }
    pool.posAttr.needsUpdate = true;
    pool.sizeAttr.needsUpdate = true;
    pool.alphaAttr.needsUpdate = true;
    pool.colorAttr.needsUpdate = true;
  }

  emitDust(x, y, z, vx, vy, vz, sizeStart, sizeEnd, alpha, life) {
    const tint = this.sandTints[(Math.random() * this.sandTints.length) | 0];
    const v = 0.88 + Math.random() * 0.24;
    this.dustPool.emit({
      x, y, z, vx, vy, vz,
      life,
      size0: sizeStart,
      size1: sizeEnd,
      alpha,
      drag: 0.965,
      gravity: -1.2,
      c0r: tint[0] * v, c0g: tint[1] * v, c0b: tint[2] * v,
      c1r: tint[0] * v * 1.08, c1g: tint[1] * v * 1.04, c1b: tint[2] * v * 0.98
    });
  }

  // Landing / impact burst of sand
  burstDust(pos, strength = 1.0) {
    const n = Math.floor(26 * Math.min(2.0, strength) * this.dustDensity);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (2.5 + Math.random() * 5.0) * strength;
      this.emitDust(
        pos.x + Math.cos(a) * 0.8, pos.y + 0.2, pos.z + Math.sin(a) * 0.8,
        Math.cos(a) * sp, 1.0 + Math.random() * 3.0 * strength, Math.sin(a) * sp,
        0.8, 4.5 + Math.random() * 2.5, 0.5, 1.0 + Math.random() * 0.9
      );
    }
  }

  stampTrack(w, contact, yaw) {
    const gp = contact.groundPoint;
    const last = this.lastTrackPos[w];
    const dx = gp.x - last.x;
    const dz = gp.z - last.z;
    if (dx * dx + dz * dz < 0.55 * 0.55) return;
    last.copy(gp);

    const n = getMarsNormal(gp.x, gp.z);
    this._qa.setFromUnitVectors(this._up, n);
    this._qb.setFromAxisAngle(this._up, yaw);
    this._qa.multiply(this._qb);

    const dummy = this._trackDummy;
    dummy.position.set(gp.x + n.x * 0.05, gp.y + n.y * 0.05, gp.z + n.z * 0.05);
    dummy.quaternion.copy(this._qa);
    dummy.scale.set(0.46, 1, 0.95);
    dummy.updateMatrix();
    this.tracks.setMatrixAt(this.trackCursor, dummy.matrix);
    this.trackCursor = (this.trackCursor + 1) % this.trackMax;
    this.tracks.instanceMatrix.needsUpdate = true;
  }

  updateVehicleEffects(dt, playerPos, physics) {
    const speed = Math.abs(physics.speed);
    const slip = Math.abs(physics.lateralVelocity);
    const forward = physics._vForward;
    const grounded = !physics.isAirborne;

    // --- Sand dust behind the wheels (rate scales with speed, throttle and drift) ---
    if (grounded && speed > 2.0) {
      const baseRate = (5.0 + speed * 1.3 + slip * 12.0) * this.dustDensity;
      for (let w = 0; w < 4; w++) {
        const c = physics.wheelContacts[w];
        if (!c.onGround) continue;
        this.tireAcc[w] += baseRate * dt;
        while (this.tireAcc[w] >= 1.0) {
          this.tireAcc[w] -= 1.0;
          const gp = c.groundPoint;
          const spread = 0.5 + slip * 0.25;
          const lift = 0.9 + Math.random() * 1.8 + speed * 0.05;
          const back = -0.25 - Math.random() * 0.2;
          this.emitDust(
            gp.x + (Math.random() - 0.5) * 0.5, gp.y + 0.12, gp.z + (Math.random() - 0.5) * 0.5,
            physics.velocity.x * 0.35 + forward.x * speed * back * 0.8 + (Math.random() - 0.5) * spread * 2.0,
            lift,
            physics.velocity.z * 0.35 + forward.z * speed * back * 0.8 + (Math.random() - 0.5) * spread * 2.0,
            0.5 + Math.random() * 0.3,
            2.6 + speed * 0.07 + Math.random() * 1.6,
            0.28 + Math.min(0.25, speed * 0.006),
            0.9 + Math.random() * 0.9
          );
        }
      }
    } else {
      for (let w = 0; w < 4; w++) this.tireAcc[w] = 0;
    }

    // --- Tire track decals ---
    if (grounded && speed > 0.5) {
      for (let w = 0; w < 4; w++) {
        const c = physics.wheelContacts[w];
        if (c.onGround) this.stampTrack(w, c, physics.yaw);
      }
    }

    // --- Nitro plumes ---
    const active = physics.isNitroActive;
    this.nitroLevel += ((active ? 1 : 0) - this.nitroLevel) * Math.min(1, dt * (active ? 9 : 5));
    const level = this.nitroLevel;
    const vis = level > 0.02;

    const flicker = 0.85 + Math.random() * 0.3;
    for (const p of this.plumes) {
      p.outer.visible = vis;
      p.inner.visible = vis;
      if (!vis) continue;
      const nozzle = new THREE.Vector3(p.x, -0.25, -2.75).applyQuaternion(physics.quaternion).add(playerPos);
      const len = (2.2 + 6.5 * level + speed * 0.05) * flicker;
      for (const [m, lenMul, widMul] of [[p.outer, 1.0, 1.0], [p.inner, 0.68, 1.0]]) {
        m.position.copy(nozzle);
        m.quaternion.copy(physics.quaternion);
        m.scale.set(widMul * (0.7 + 0.5 * level), widMul * (0.7 + 0.5 * level), len * lenMul);
        m.material.uniforms.uTime.value = this.time;
        m.material.uniforms.uIntensity.value = level * (0.9 + Math.random() * 0.2);
      }
    }

    // Exhaust glow light
    const lp = new THREE.Vector3(0, 0.0, -4.5).applyQuaternion(physics.quaternion).add(playerPos);
    this.nitroLight.position.copy(lp);
    this.nitroLight.intensity = level * (7 + Math.random() * 5);

    if (vis && active) {
      // Hot sparks (blue-white core fading to orange) and slow glowing embers
      this.nitroAcc += 140 * this.dustDensity * dt;
      this.emberAcc += 50 * this.dustDensity * dt;
      const nozzles = [-0.55, 0.55].map((x) => new THREE.Vector3(x, -0.25, -2.75).applyQuaternion(physics.quaternion).add(playerPos));

      while (this.nitroAcc >= 1.0) {
        this.nitroAcc -= 1.0;
        const n = nozzles[(Math.random() * 2) | 0];
        const sp = 32 + Math.random() * 20 + speed * 0.4;
        this.fxPool.emit({
          x: n.x, y: n.y, z: n.z,
          vx: -forward.x * sp + (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, vz: -forward.z * sp + (Math.random() - 0.5) * 5,
          life: 0.22 + Math.random() * 0.22,
          size0: 0.35, size1: 1.1 + Math.random() * 0.6,
          alpha: 0.85,
          drag: 0.97, gravity: 0,
          c0r: 0.75, c0g: 0.9, c0b: 1.0,
          c1r: 1.0, c1g: 0.35, c1b: 0.08
        });
      }
      while (this.emberAcc >= 1.0) {
        this.emberAcc -= 1.0;
        const n = nozzles[(Math.random() * 2) | 0];
        const sp = 8 + Math.random() * 16;
        this.fxPool.emit({
          x: n.x - forward.x * 0.6, y: n.y, z: n.z - forward.z * 0.6,
          vx: -forward.x * sp + (Math.random() - 0.5) * 9, vy: 1.5 + Math.random() * 4, vz: -forward.z * sp + (Math.random() - 0.5) * 9,
          life: 0.7 + Math.random() * 0.8,
          size0: 0.16, size1: 0.04,
          alpha: 1.0,
          drag: 0.985, gravity: -3.7,
          c0r: 1.0, c0g: 0.75, c0b: 0.35,
          c1r: 0.9, c1g: 0.2, c1b: 0.05
        });
      }

      // Boost kicks up a heavy rooster tail of sand
      if (grounded && this.dustDensity > 0.5) {
        const extra = 22 * this.dustDensity * dt;
        this.tailAcc = (this.tailAcc || 0) + extra;
        while (this.tailAcc >= 1.0) {
          this.tailAcc -= 1.0;
          const rear = new THREE.Vector3((Math.random() - 0.5) * 1.6, -0.85, -2.2).applyQuaternion(physics.quaternion).add(playerPos);
          this.emitDust(
            rear.x, rear.y, rear.z,
            -forward.x * speed * 0.3 + (Math.random() - 0.5) * 3, 2.5 + Math.random() * 3.0, -forward.z * speed * 0.3 + (Math.random() - 0.5) * 3,
            1.2, 5.5 + Math.random() * 2.0, 0.34, 1.3 + Math.random() * 0.8
          );
        }
      }
    }

    this.dustPool.update(dt, this.wind);
    this.fxPool.update(dt, null);
  }

  update(dt, playerPos, physics) {
    this.time += dt;
    this.skyMat.uniforms.uTime.value = this.time;

    // 1. Anchor skydome, distant mountains and directional light to player
    this.skyMesh.position.copy(playerPos);
    if (this.distantMountains) {
      this.distantMountains.position.set(playerPos.x, 0, playerPos.z);
    }
    this.sunLight.position.set(
      playerPos.x + SUN_DIR.x * 500,
      SUN_DIR.y * 500,
      playerPos.z + SUN_DIR.z * 500
    );
    this.sunLight.target.position.copy(playerPos);
    this.sunLight.target.updateMatrixWorld();

    // Slowly orbit moons
    this.phobos.rotation.y += dt * 0.02;
    this.deimos.rotation.y += dt * 0.01;

    // 2. Update Wind Dust Specks
    const dustPosAttr = this.dustPoints.geometry.attributes.position;
    const r = this.windDustRadius;

    for (let i = 0; i < this.dustCount; i++) {
      let x = dustPosAttr.getX(i);
      let y = dustPosAttr.getY(i);
      let z = dustPosAttr.getZ(i);

      x += this.dustVelocities[i * 3 + 0] * dt;
      y += this.dustVelocities[i * 3 + 1] * dt;
      z += this.dustVelocities[i * 3 + 2] * dt;

      // Wrap around player box
      if (x - playerPos.x > r) x -= r * 2;
      if (x - playerPos.x < -r) x += r * 2;
      if (z - playerPos.z > r) z -= r * 2;
      if (z - playerPos.z < -r) z += r * 2;
      if (y < playerPos.y) y += 25;
      if (y > playerPos.y + 35) y -= 25;

      dustPosAttr.setXYZ(i, x, y, z);
    }
    dustPosAttr.needsUpdate = true;

    // 3. Vehicle dust, tracks and nitro plumes; ambient dust devils
    this.updateVehicleEffects(dt, playerPos, physics);
    this.updateDustDevils(dt, playerPos);
  }
}
