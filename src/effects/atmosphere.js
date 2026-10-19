import * as THREE from 'three';
import { getMarsHeight, getMarsNormal } from '../terrain/noise.js';
import { SoftParticlePool } from './particles.js';
import { PostLaunchSpace } from './postLaunchSpace.js';

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
    this.createFlightAtmosphere();
    this.postLaunchSpace = new PostLaunchSpace(this.scene, new THREE.Vector2(1400, 1150));
  }

  setQuality(preset) {
    this.dustDensity = preset === 'Low' ? 0.4 : preset === 'Medium' ? 0.7 : preset === 'Ultra' ? 1.3 : 1.0;
    if (this.dustPoints) {
      const count = Math.floor(this.dustCount * Math.min(1.0, this.dustDensity));
      this.dustPoints.geometry.setDrawRange(0, count);
    }
    if (this.devilPool && this.devilPool.points) {
      this.devilPool.points.visible = !this.isFlight && this.dustDensity > 0.45;
    }
  }

  setViewScale(heightPx, fovDeg) {
    this.dustPool.setViewScale(heightPx, fovDeg);
    this.fxPool.setViewScale(heightPx, fovDeg);
    this.devilPool.setViewScale(heightPx, fovDeg);
  }

  createSky() {
    // Custom Mars Atmospheric Sky Dome
    const skyGeo = new THREE.SphereGeometry(1200, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSunPos: { value: SUN_DIR.clone() },
        uSkyZenith: { value: new THREE.Color(0xcd8a66) },     // Butterscotch overhead
        uSkyHorizon: { value: new THREE.Color(0xe0aa8c) },    // Pale dusty salmon horizon
        uSunColor: { value: new THREE.Color(0xfff5e6) },      // Brilliant Martian sun
        uSunHaloBlue: { value: new THREE.Color(0x5ca0d3) },   // Signature Mars twilight blue scattering halo
        uSpaceFade: { value: 0.0 },                           // 0 = surface, 1 = orbit/space
        uAltitude: { value: 0.0 }                             // vehicle altitude in meters
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
        uniform float uSpaceFade;
        uniform float uAltitude;
        varying vec3 vWorldPosition;

        void main() {
          vec3 dir = normalize(vWorldPosition);
          vec3 sunDir = normalize(uSunPos);
          float sc = max(dot(dir, sunDir), 0.0);

          float atmoFade = exp(-max(0.0, uAltitude) / 13500.0);
          float horizonFade = smoothstep(-0.4, 0.05, dir.y);

          // Base atmospheric colors
          vec3 atmoCol = mix(uSkyHorizon, uSkyZenith, clamp(dir.y * 1.6 + 0.1, 0.0, 1.0));
          atmoCol += vec3(0.24, 0.16, 0.10) * pow(sc, 2.5);

          // Deep inky space black
          vec3 spaceBlack = vec3(0.0004, 0.0006, 0.0014);

          // Blend atmosphere towards space as rocket climbs
          vec3 sky = mix(spaceBlack, atmoCol, clamp(atmoFade * 1.2 * horizonFade, 0.0, 1.0));

          // Martian Mie Twilight Blue Corona around the sun
          float blueHalo = pow(sc, 14.0) * 0.26 * atmoFade;
          sky = mix(sky, uSunHaloBlue, blueHalo);

          // Solar disk and glare
          float sc2 = sc * sc;
          float sc6 = sc2 * sc2 * sc2;
          float solarGlare = sc6 * 0.35 + pow(sc, 35.0) * 0.85 + pow(sc, 300.0) * 2.2;
          sky += uSunColor * solarGlare;
          float sunDisk = smoothstep(0.9990, 0.9997, sc);
          sky += uSunColor * sunDisk * 1.8;

          // Procedural Starfield & Milky Way visible as atmosphere thins
          float starFactor = clamp(1.0 - atmoFade * 0.82, 0.0, 1.0);
          if (starFactor > 0.02) {
            vec3 starDir = dir;
            vec2 starCoord = floor(starDir.xz / (abs(starDir.y) + 0.08) * 320.0);
            float starHash = fract(sin(dot(starCoord, vec2(127.1, 311.7))) * 43758.5453);
            float isStar = step(0.980, starHash) * pow(fract(sin(dot(starCoord * 2.7, vec2(19.2, 53.4))) * 28419.1), 3.0) * 2.2;

            float twinkle = 0.82 + 0.18 * sin(uTime * 3.5 + starHash * 40.0);

            vec2 cCoord = floor(starDir.xz / (abs(starDir.y) + 0.08) * 95.0);
            float cHash = fract(sin(dot(cCoord, vec2(83.1, 19.7))) * 38291.3);
            float majorStar = step(0.990, cHash) * 2.5;

            vec3 starCol = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.92, 0.8), starHash);
            sky += starCol * (isStar * twinkle + majorStar) * starFactor;

            float galacticPlane = 1.0 - smoothstep(0.0, 0.35, abs(dir.x * 0.6 + dir.y * 0.7 - dir.z * 0.35));
            sky += vec3(0.08, 0.10, 0.15) * galacticPlane * starFactor * 0.35;
          }

          gl_FragColor = vec4(sky, 1.0);
          #include <colorspace_fragment>
        }
      `
    });
    this.skyMat = skyMat;

    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.renderOrder = -10;
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh);

    // Directional Sunlight & Ambient
    this.sunLight = new THREE.DirectionalLight(0xffe6d0, 1.8);
    this.sunLight.position.copy(SUN_DIR).multiplyScalar(500);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 900;
    const d = 32;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.ambientLight = new THREE.AmbientLight(0x7a5044, 0.7);
    this.scene.add(this.ambientLight);

    // Warm sky fill / sand bounce light (soft, realistic shadow fill)
    this.hemiLight = new THREE.HemisphereLight(0xe8b496, 0xa0583a, 0.95);
    this.scene.add(this.hemiLight);

    // Atmospheric perspective for all standard-lit objects (terrain has its own matching fog)
    this.scene.fog = new THREE.Fog(0xe0aa8c, 110, 520);
  }

  // Build an image-based lighting environment from the sky shader so metals, glass and paint reflect
  // the Martian sky and sand instead of looking flat and black.
  buildEnvironment(renderer) {
    const envScene = new THREE.Scene();
    const skyClone = new THREE.Mesh(new THREE.SphereGeometry(50, 16, 12), this.skyMat.clone());
    skyClone.material.uniforms.uTime.value = 0;
    skyClone.renderOrder = -10;
    envScene.add(skyClone);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(95, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xc4724a })
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
    const segs = 120;
    const radius = 950.0;
    const geo = new THREE.BufferGeometry();
    const positions = [];

    const ridge = (t) => {
      const base = 30.0 + Math.sin(t * 3.0) * 18.0 + Math.pow(Math.max(0, Math.cos(t - 0.78)), 4.0) * 90.0;
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
        uHaze: { value: new THREE.Color(0xe0aa8c) },
        uPeak: { value: new THREE.Color(0xc88d70) }
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
          float t = smoothstep(-5.0, 120.0, vY);
          gl_FragColor = vec4(mix(uHaze, uPeak, t * 0.7), 1.0);
          #include <colorspace_fragment>
        }
      `
    });

    this.distantMountains = new THREE.Mesh(geo, mat);
    this.distantMountains.frustumCulled = false;
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
    // GPU-driven blowing sand particles drifting across the dunes (zero CPU loop per frame)
    this.dustCount = 700;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.dustCount * 3);
    const velocities = new Float32Array(this.dustCount * 3);

    this.windDustRadius = 110.0;

    for (let i = 0; i < this.dustCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * this.windDustRadius * 2;
      positions[i * 3 + 1] = Math.random() * 25 + 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.windDustRadius * 2;

      const speed = 12.0 + Math.random() * 10.0;
      velocities[i * 3 + 0] = Math.cos(0.62) * speed;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 1.5;
      velocities[i * 3 + 2] = Math.sin(0.62) * speed;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));

    this.windDustUniforms = {
      uTime: { value: 0 },
      uPlayerPos: { value: new THREE.Vector3() },
      uRadius: { value: this.windDustRadius }
    };

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: this.windDustUniforms,
      vertexShader: `
        attribute vec3 aVelocity;
        uniform float uTime;
        uniform vec3 uPlayerPos;
        uniform float uRadius;
        void main() {
          vec3 p = position + aVelocity * uTime - uPlayerPos;
          float span = uRadius * 2.0;
          p.x = mod(p.x + uRadius, span) - uRadius + uPlayerPos.x;
          p.z = mod(p.z + uRadius, span) - uRadius + uPlayerPos.z;
          p.y = mod(p.y, 26.0) + uPlayerPos.y + 0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(340.0 / max(1.0, -mv.z), 1.5, 5.5);
        }
      `,
      fragmentShader: `
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          if (dot(d, d) > 0.25) discard;
          gl_FragColor = vec4(0.85, 0.55, 0.42, 0.42);
        }
      `
    });

    this.dustPoints = new THREE.Points(geometry, material);
    this.dustPoints.frustumCulled = false;
    this.scene.add(this.dustPoints);
  }

  createVehicleParticles() {
    // 1. Sand dust (soft billowing sprites, tinted to the sand under the wheels)
    this.dustPool = new SoftParticlePool(this.scene, 650, { additive: false, softness: 1.0 });
    this.tireAcc = [0, 0, 0, 0];
    this.sandTints = [
      [0.78, 0.50, 0.34],
      [0.72, 0.44, 0.30],
      [0.84, 0.58, 0.40]
    ];

    // 2. Nitro sparks / embers (additive glow)
    this.fxPool = new SoftParticlePool(this.scene, 320, { additive: true, softness: 1.0, maxPointSize: 120 });
    this.nitroAcc = 0;
    this.emberAcc = 0;
    this.nitroLevel = 0;

    // Reusable scratch vectors for zero per-frame allocations
    this._tmpNozzle0 = new THREE.Vector3();
    this._tmpNozzle1 = new THREE.Vector3();
    this._tmpRear = new THREE.Vector3();

    this.createNitroPlumes();
    this.createTireTracks();
  }

  createFlightAtmosphere() {
    this.flightAtmosphereGroup = new THREE.Group();
    this.isFlight = false;

    // Soft round procedural cloud texture (ZERO square artifacts!)
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.0, 'rgba(255, 235, 218, 0.70)');
    grad.addColorStop(0.38, 'rgba(235, 195, 175, 0.42)');
    grad.addColorStop(0.72, 'rgba(215, 170, 150, 0.12)');
    grad.addColorStop(1.0, 'rgba(195, 150, 130, 0.0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const cloudTex = new THREE.CanvasTexture(cv);
    cloudTex.colorSpace = THREE.SRGBColorSpace;

    const cloudMat = new THREE.SpriteMaterial({
      map: cloudTex,
      color: 0xffe6d2,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    const cirrusMat = new THREE.SpriteMaterial({
      map: cloudTex,
      color: 0xeed6c8,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    // 1. Lower Atmospheric Cloud Deck (Y = 3,500m to 7,500m)
    this.clouds = [];
    const lowerCount = 40;
    for (let i = 0; i < lowerCount; i++) {
      const sprite = new THREE.Sprite(cloudMat);
      const angle = Math.random() * Math.PI * 2;
      const radius = 180 + Math.random() * 3200;
      const x = 1400 + Math.cos(angle) * radius;
      const z = 1150 + Math.sin(angle) * radius;
      const y = 3500 + Math.random() * 4000;
      const scale = 420 + Math.random() * 480;
      sprite.position.set(x, y, z);
      sprite.scale.set(scale, scale * 0.42, 1);
      this.flightAtmosphereGroup.add(sprite);
      this.clouds.push(sprite);
    }

    // 2. High-Altitude Mesospheric Cirrus (Y = 18,000m to 24,000m)
    const upperCount = 28;
    for (let i = 0; i < upperCount; i++) {
      const sprite = new THREE.Sprite(cirrusMat);
      const angle = Math.random() * Math.PI * 2;
      const radius = 250 + Math.random() * 4200;
      const x = 1400 + Math.cos(angle) * radius;
      const z = 1150 + Math.sin(angle) * radius;
      const y = 18000 + Math.random() * 6000;
      const scale = 680 + Math.random() * 750;
      sprite.position.set(x, y, z);
      sprite.scale.set(scale, scale * 0.28, 1);
      this.flightAtmosphereGroup.add(sprite);
      this.clouds.push(sprite);
    }

    // 3. High-Speed Aerodynamic Vapor Streamers (Motion Parallax)
    const streamerCount = 32;
    const streamerGeo = new THREE.CylinderGeometry(0.08, 0.14, 20.0, 5, 1, true);
    streamerGeo.translate(0, -10.0, 0);
    this.streamerMat = new THREE.MeshBasicMaterial({
      color: 0xcceeec,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.streamers = [];
    this.streamerGroup = new THREE.Group();
    for (let i = 0; i < streamerCount; i++) {
      const mesh = new THREE.Mesh(streamerGeo, this.streamerMat);
      const rad = 7.0 + Math.random() * 15.0;
      const theta = Math.random() * Math.PI * 2;
      mesh.userData = {
        cosTheta: Math.cos(theta) * rad,
        sinTheta: Math.sin(theta) * rad,
        yOffset: (Math.random() - 0.5) * 80.0,
        speedFactor: 0.8 + Math.random() * 0.5
      };
      this.streamerGroup.add(mesh);
      this.streamers.push(mesh);
    }
    this.flightAtmosphereGroup.add(this.streamerGroup);

    this.flightAtmosphereGroup.visible = false;
    this.scene.add(this.flightAtmosphereGroup);
  }

  setFlightMode(isFlight) {
    this.isFlight = isFlight;
    if (this.dustPoints) this.dustPoints.visible = !isFlight;
    if (this.dustPool && this.dustPool.points) this.dustPool.points.visible = !isFlight;
    if (this.devilPool && this.devilPool.points) this.devilPool.points.visible = !isFlight && this.dustDensity > 0.45;
    if (this.tracks) this.tracks.visible = !isFlight;
    if (this.phobos) this.phobos.visible = !isFlight;
    if (this.deimos) this.deimos.visible = !isFlight;
    if (this.flightAtmosphereGroup) this.flightAtmosphereGroup.visible = isFlight;
    if (this.postLaunchSpace) this.postLaunchSpace.group.visible = isFlight;

    if (this.scene.fog) {
      if (isFlight) {
        this.scene.fog.near = 150000;
        this.scene.fog.far = 1000000;
      } else {
        this.scene.fog.near = 110;
        this.scene.fog.far = 520;
      }
    }
  }

  updateSpeedStreamers(alt, speed = 0, playerPos = null) {
    if (!this.streamerGroup || !this.isFlight) return;
    const inAtmo = alt > 400 && alt < 38000;
    const speedRatio = THREE.MathUtils.clamp((speed - 40.0) / 280.0, 0.0, 1.0);
    const visible = inAtmo && speedRatio > 0.02;

    this.streamerGroup.visible = visible;
    if (!visible) return;

    if (playerPos) {
      this.streamerGroup.position.copy(playerPos);
    }

    this.streamerMat.opacity = speedRatio * 0.65;
    const baseStep = Math.max(15.0, speed * 0.035);
    for (let i = 0; i < this.streamers.length; i++) {
      const s = this.streamers[i];
      const ud = s.userData;
      ud.yOffset -= baseStep * ud.speedFactor;
      if (ud.yOffset < -45.0) {
        ud.yOffset = 45.0 + Math.random() * 20.0;
      }
      s.position.set(ud.cosTheta, ud.yOffset, ud.sinTheta);
    }
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
          float t = vUv.y;
          float ang = vUv.x * 6.2831853;
          float turb = 0.5 + 0.5 * sin(ang * 3.0 + t * 20.0 - uTime * 42.0);
          turb *= 0.5 + 0.5 * sin(ang * 5.0 - t * 31.0 - uTime * 57.0 + 1.7);
          float oneMinusT = 1.0 - t;
          float core = oneMinusT * oneMinusT;
          float fres = sqrt(abs(dot(normalize(vN), normalize(vV))));
          float s = max(0.0, sin(t * 26.0 / uScale + 0.6));
          float s2 = s * s;
          float s4 = s2 * s2;
          float diamonds = (s4 * s4) * oneMinusT * step(0.04, t);
          vec3 outer = vec3(1.0, 0.42, 0.10);
          vec3 mid = vec3(1.0, 0.78, 0.40);
          vec3 inner = vec3(0.55, 0.80, 1.0);
          vec3 col = mix(outer, mid, smoothstep(0.55, 0.0, t));
          col = mix(col, inner, core * fres);
          col += vec3(0.9, 0.95, 1.0) * diamonds * 0.9;
          float flick = 0.75 + 0.25 * turb;
          float a = oneMinusT * fres * flick * uIntensity;
          a += diamonds * 0.5 * uIntensity;
          gl_FragColor = vec4(col * (1.2 + core * 1.5), clamp(a, 0.0, 1.0));
        }
      `
    });

    const makeConeGeo = (radius) => {
      const g = new THREE.CylinderGeometry(0.0, radius, 1, 14, 4, true);
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
  }

  createTireTracks() {
    // Ring buffer of tire tread decals stamped onto the sand
    this.trackMax = 400;
    this.trackCursor = 0;

    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 32, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(2, 0, 28, 64);
    ctx.fillStyle = 'rgba(255,255,255,1.0)';
    for (let y = 0; y < 64; y += 8) {
      ctx.fillRect(2, y, 28, 4);
    }
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
    this.devilCount = 2;
    this.devilParticles = 60;
    this.devilPool = new SoftParticlePool(this.scene, this.devilCount * this.devilParticles, { additive: false, softness: 1.0, maxPointSize: 220 });
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
    if (this.dustDensity <= 0.45) return;
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
    const n = Math.floor(22 * Math.min(2.0, strength) * this.dustDensity);
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
    if (dx * dx + dz * dz < 0.65 * 0.65) return;
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
      const baseRate = (4.0 + speed * 1.1 + slip * 10.0) * this.dustDensity;
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

    if (vis) {
      const flicker = 0.85 + Math.random() * 0.3;
      const len = (2.2 + 6.5 * level + speed * 0.05) * flicker;
      const wScale = 0.7 + 0.5 * level;
      for (let i = 0; i < this.plumes.length; i++) {
        const p = this.plumes[i];
        p.outer.visible = true;
        p.inner.visible = true;
        const nozzle = i === 0 ? this._tmpNozzle0 : this._tmpNozzle1;
        nozzle.set(p.x, -0.25, -2.75).applyQuaternion(physics.quaternion).add(playerPos);

        p.outer.position.copy(nozzle);
        p.outer.quaternion.copy(physics.quaternion);
        p.outer.scale.set(wScale, wScale, len);
        p.outer.material.uniforms.uTime.value = this.time;
        p.outer.material.uniforms.uIntensity.value = level * (0.9 + Math.random() * 0.2);

        p.inner.position.copy(nozzle);
        p.inner.quaternion.copy(physics.quaternion);
        p.inner.scale.set(wScale, wScale, len * 0.68);
        p.inner.material.uniforms.uTime.value = this.time;
        p.inner.material.uniforms.uIntensity.value = level * (0.9 + Math.random() * 0.2);
      }
    } else {
      for (let i = 0; i < this.plumes.length; i++) {
        this.plumes[i].outer.visible = false;
        this.plumes[i].inner.visible = false;
      }
    }

    if (vis && active) {
      this.nitroAcc += 110 * this.dustDensity * dt;
      this.emberAcc += 40 * this.dustDensity * dt;

      while (this.nitroAcc >= 1.0) {
        this.nitroAcc -= 1.0;
        const n = Math.random() < 0.5 ? this._tmpNozzle0 : this._tmpNozzle1;
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
        const n = Math.random() < 0.5 ? this._tmpNozzle0 : this._tmpNozzle1;
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

      if (grounded && this.dustDensity > 0.5) {
        const extra = 18 * this.dustDensity * dt;
        this.tailAcc = (this.tailAcc || 0) + extra;
        while (this.tailAcc >= 1.0) {
          this.tailAcc -= 1.0;
          const rear = this._tmpRear.set((Math.random() - 0.5) * 1.6, -0.85, -2.2).applyQuaternion(physics.quaternion).add(playerPos);
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

  setAltitude(alt, speed = 0) {
    const spaceFade = THREE.MathUtils.clamp((alt - 1500) / 14500, 0.0, 1.0);
    if (this.skyMat) {
      this.skyMat.uniforms.uSpaceFade.value = spaceFade;
      this.skyMat.uniforms.uAltitude.value = Math.max(0, alt);
    }
    if (this.distantMountains) {
      this.distantMountains.visible = alt < 12000;
    }
    if (this.scene.fog && !this.isFlight) {
      this.scene.fog.near = THREE.MathUtils.lerp(110, 80000, spaceFade);
      this.scene.fog.far = THREE.MathUtils.lerp(520, 250000, spaceFade);
    }
    if (this.dustPoints) {
      this.dustPoints.visible = !this.isFlight && alt < 600;
    }
    this.updateSpeedStreamers(alt, speed);
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

    // In Flight Mode, skip rover dust & ground dust devils completely; update speed streamers & 3D space
    if (this.isFlight) {
      this.updateSpeedStreamers(physics?.altitude || 0, physics?.speed || 0, playerPos);
      if (this.postLaunchSpace) {
        this.postLaunchSpace.update(dt, physics?.altitude || 0, physics?.speed || 0, playerPos);
      }
      return;
    }

    // 2. Update GPU Wind Dust Uniforms (zero CPU loop / buffer upload)
    if (this.windDustUniforms) {
      this.windDustUniforms.uTime.value = this.time;
      this.windDustUniforms.uPlayerPos.value.copy(playerPos);
    }

    // 3. Vehicle dust, tracks and nitro plumes; ambient dust devils
    this.updateVehicleEffects(dt, playerPos, physics);
    this.updateDustDevils(dt, playerPos);
  }
}
