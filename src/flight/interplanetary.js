import * as THREE from 'three';
import { PLANET_PROFILES, getPlanetProfile } from './planetProfiles.js';
import { getEarthMaps, getMoonMap } from '../effects/earthMaps.js';
import { earthSurfaceHeight, earthCoastDistance, EARTH_RADIUS } from '../terrain/earthSurface.js';
import { STARBASE_LAYOUT as L } from './starbaseLayout.js';
import { createProceduralEarthTexture, createProceduralMarsTexture } from '../effects/postLaunchSpace.js';

// ---------------------------------------------------------------------------
// Interplanetary stage, Earth, the Moon, satellite constellations and the
// Earth-side Starbase environment.
//
// Distances are deliberately scene-scaled: the transfer is a compressed
// cinematic trajectory, while the actual mission clock and telemetry report
// the heliocentric journey. Entry itself is handed back to the real flight
// physics with the Earth profile (gravity 9.81 m/s², 1.225 kg/m³ atmosphere).
// ---------------------------------------------------------------------------

import { AU, SCENE_AU, SOLAR_BODIES, createTransfer, sampleTransfer, orbitalRate, sceneRadius } from './orbitalMechanics.js';

const EARTH_RADIUS_SCENE = 26000;
const MOON_RADIUS_SCENE = 7000;

function makeEarthTexture() {
  return createProceduralEarthTexture();
}

function makeEarthRoughness() { return getEarthMaps().roughnessMap; }

function makeCloudTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 1024, 512);
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * 1024;
    const y = 30 + Math.random() * 452;
    const r = 8 + Math.random() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, r * 2.8, r * 0.6, Math.sin(y * 0.02) * 0.4, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStarGlowTexture(hexColor = 0xffffff) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const g = cv.getContext('2d');
  const c = new THREE.Color(hexColor);
  const r = Math.round(c.r * 255);
  const gr = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  grad.addColorStop(0, `rgba(255,255,255,1)`);
  grad.addColorStop(0.12, `rgba(${r},${gr},${b},0.95)`);
  grad.addColorStop(0.34, `rgba(${r},${gr},${b},0.34)`);
  grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMoonTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#9c9c9c';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 256;
    const r = 2 + Math.random() * 22;
    g.fillStyle = `rgba(${80 + Math.random() * 40},${80 + Math.random() * 40},${80 + Math.random() * 40},0.55)`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(210,210,210,0.22)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(x - 1, y - 1, r * 0.85, Math.PI * 0.8, Math.PI * 1.9);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGrassTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#4a7038';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3000; i++) {
    const shade = 40 + Math.random() * 60;
    g.fillStyle = `rgba(${26 + shade * 0.35},${shade},${24 + shade * 0.25},${0.12 + Math.random() * 0.3})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 4, 1 + Math.random() * 4);
  }
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(120,100,64,${0.1 + Math.random() * 0.14})`;
    g.beginPath();
    g.arc(Math.random() * 512, Math.random() * 512, 14 + Math.random() * 48, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  return tex;
}

function makeOceanTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 512;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0b3766');
  grad.addColorStop(0.45, '#0b5a91');
  grad.addColorStop(0.7, '#126ca3');
  grad.addColorStop(1, '#08294f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 700; i++) {
    const y = Math.random() * 512;
    const x = Math.random() * 512;
    g.strokeStyle = `rgba(${120 + Math.random() * 80},${190 + Math.random() * 50},255,${0.03 + Math.random() * 0.08})`;
    g.lineWidth = 0.6 + Math.random() * 2.2;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + 18, y - 4, x + 42, y + 5, x + 70 + Math.random() * 40, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.anisotropy = 8;
  return tex;
}

function makeCloudPuffTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) {
    const x = 50 + Math.random() * 156;
    const y = 78 + Math.random() * 100;
    const r = 18 + Math.random() * 42;
    const grad = g.createRadialGradient(x, y, 1, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.38)');
    grad.addColorStop(0.55, 'rgba(246,251,255,0.22)');
    grad.addColorStop(1, 'rgba(235,245,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBeachTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#c9b887';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const v = 150 + Math.random() * 90;
    g.fillStyle = `rgba(${v},${v - 10},${v - 40},${0.08 + Math.random() * 0.2})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30);
  return tex;
}

function makeEarthConcreteTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#85867f';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6000; i++) {
    const v = 85 + Math.random() * 65;
    g.fillStyle = `rgba(${v},${v + 3},${v - 2},${0.05 + Math.random() * 0.18})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  // Expansion joints and weather staining.
  g.strokeStyle = 'rgba(48,50,46,0.42)';
  g.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(50,52,44,${0.04 + Math.random() * 0.08})`;
    g.beginPath();
    g.arc(Math.random() * 512, Math.random() * 512, 6 + Math.random() * 34, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.anisotropy = 8;
  return tex;
}

function makeSignTexture(title, subtitle, accent = '#4fc3ff') {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(6,14,20,0.9)';
  g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = accent;
  g.lineWidth = 6;
  g.strokeRect(4, 4, 1016, 248);
  g.fillStyle = accent;
  g.font = 'bold 74px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText(title, 512, 112);
  g.fillStyle = '#d7e8f4';
  g.font = '500 34px "Segoe UI", Arial, sans-serif';
  g.fillText(subtitle, 512, 178);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSatellite(accent = 0x8fd8ff) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcfd7df, metalness: 0.8, roughness: 0.35 });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x163e66,
    metalness: 0.55,
    roughness: 0.3,
    emissive: new THREE.Color(0x123a63),
    emissiveIntensity: 0.45
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.6), bodyMat);
  g.add(body);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.08, 1.5), panelMat);
    panel.position.x = side * 2.75;
    g.add(panel);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5), bodyMat);
    strut.rotation.z = Math.PI / 2;
    strut.position.x = side * 1.15;
    g.add(strut);
  }
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
    new THREE.MeshStandardMaterial({ color: 0xe8edf2, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide })
  );
  dish.rotation.x = Math.PI;
  dish.position.y = -1.1;
  g.add(dish);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 6, 5),
    new THREE.MeshBasicMaterial({ color: accent })
  );
  beacon.position.y = 1.2;
  g.add(beacon);
  return g;
}

function buildOrbitConstellation(count, radius, height, accent, phaseOffset = 0) {
  const group = new THREE.Group();
  const sats = [];
  for (let i = 0; i < count; i++) {
    const sat = createSatellite(accent);
    const plane = i % 3;
    const angle = (i / count) * Math.PI * 2 + plane * 0.7 + phaseOffset;
    const r = radius + plane * radius * 0.11;
    const inclination = 0.18 + plane * 0.14;
    sat.userData.orbit = {
      angle,
      radius: r,
      height: height + plane * 110,
      speed: 0.045 + (i % 4) * 0.008,
      inclination
    };
    sats.push(sat);
    group.add(sat);
  }
  return { group, sats };
}

function createMiniStarship(accent = 0x79c9ff, tanker = false) {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xd7e0e7, metalness: 0.82, roughness: 0.26 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x242b33, metalness: 0.5, roughness: 0.55 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: new THREE.Color(accent),
    emissiveIntensity: 0.12,
    metalness: 0.55,
    roughness: 0.42
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 3.2, 27, 18), steel);
  body.position.y = 2.0;
  group.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(2.7, 9.5, 18), steel);
  nose.position.y = 20.2;
  group.add(nose);

  const flapGeo = new THREE.BoxGeometry(0.5, 8.5, 2.0);
  for (const side of [-1, 1]) {
    for (const y of [12.5, -8.5]) {
      const flap = new THREE.Mesh(flapGeo, dark);
      flap.position.set(side * 3.3, y, -0.8);
      flap.rotation.z = side * 0.15;
      flap.rotation.y = Math.PI * 0.5;
      group.add(flap);
    }
  }

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 2.2, 8), dark);
    bell.position.set(Math.cos(a) * 1.7, -12.8, Math.sin(a) * 1.7);
    group.add(bell);
    if (i < 3) {
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 8), accentMat);
      glow.rotation.x = Math.PI * 0.5;
      glow.position.set(Math.cos(a) * 1.7, -13.95, Math.sin(a) * 1.7);
      group.add(glow);
    }
  }

  if (tanker) {
    // A tanker is visually distinct without looking like a second vehicle
    // glued across the first: two vertical cryogenic drums hug the hull,
    // capped with steel bands and a forward docking collar.
    for (const side of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.65, 14.5, 14), steel);
      tank.position.set(side * 4.4, 0.2, 0);
      group.add(tank);
      for (const y of [-5.0, 5.4]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(1.67, 0.16, 6, 16), accentMat);
        band.position.set(side * 4.4, y, 0);
        band.rotation.x = Math.PI * 0.5;
        group.add(band);
      }
    }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.32, 8, 20), accentMat);
    collar.position.y = 22.4;
    collar.rotation.x = Math.PI * 0.5;
    group.add(collar);
    const collarCore = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.7, 14), dark);
    collarCore.position.y = 23.0;
    group.add(collarCore);
  }

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0x66ff99 }));
  beacon.position.set(3.5, 21.0, 0.4);
  group.add(beacon);
  return group;
}

export class InterplanetaryJourney {
  constructor(scene, physics, vehicle, options = {}) {
    this.scene = scene;
    this.physics = physics;
    this.vehicle = vehicle;
    this.options = options;
    this.active = false;
    this.target = null;
    this.progress = 0;
    this.duration = 46;
    this.arrived = false;
    this.planetId = 'mars';
    this.time = 0;
    this._lastScaleWarp = 1;
    this.tankerActive = false;
    this.tankerPhase = 'idle';
    this.tankerProgress = 0;
    this._tankerClock = 0;
    this.flightPhaseLabel = '';

    this.padCoords = physics.padCoords.clone();
    this.padGroundY = physics.padGroundY;
    this.earthAnchor = new THREE.Vector3();
    this.marsAnchor = new THREE.Vector3();

    this._buildCelestialBodies();
    this._buildEarthSurface();
    this._buildSatellites();
    this._buildTankerFleet();
    this._buildTransferPath();
  }

  _buildCelestialBodies() {
    this.celestialGroup = new THREE.Group();
    this.scene.add(this.celestialGroup);

    // Astronomical scale & positions:
    // Earth-Mars mean orbital separation is 225,400,000 km (1.507 AU).
    // In our heliocentric 3D navigation volume:
    // Earth is at 1.000 AU equivalent, Mars at 1.524 AU equivalent.
    // The central Sun radiates gravitational field and celestial illumination.
    const azimuth = 0.6;
    this.earthAnchor.set(
      this.padCoords.x + Math.sin(azimuth) * 360000,
      this.padGroundY + 110000,
      this.padCoords.y + Math.cos(azimuth) * 360000
    );
    this.earthBaseScale = 0.045;
    this.moonBaseScale = 0.038;
    this.marsBaseScale = 0.040;

    // The Central Sun (SOL)
    const sunAzimuth = -0.92;
    this.sunAnchor = new THREE.Vector3(
      this.padCoords.x + Math.sin(sunAzimuth) * 650000,
      this.padGroundY + 280000,
      this.padCoords.y + Math.cos(sunAzimuth) * 650000
    );
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeStarGlowTexture(0xfff6d0),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    this.sunGlow.position.copy(this.sunAnchor);
    this.sunGlow.scale.setScalar(sceneRadius(695700000) * 3);
    this.celestialGroup.add(this.sunGlow);

    const earthMap = makeEarthTexture();
    const earthMat = new THREE.MeshStandardMaterial({
      map: earthMap,
      roughnessMap: makeEarthRoughness(earthMap),
      roughness: 1,
      metalness: 0.02,
      emissive: new THREE.Color(0x071b33),
      emissiveIntensity: 0.0
    });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS_SCENE, 64, 40), earthMat);
    this.earth.position.copy(this.earthAnchor);
    this.earth.scale.setScalar(this.earthBaseScale);
    this.earth.rotation.y = -1.2;
    this.celestialGroup.add(this.earth);

    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS_SCENE * 1.012, 48, 32),
      new THREE.MeshStandardMaterial({
        map: makeCloudTexture(),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        roughness: 1.0,
        metalness: 0.0
      })
    );
    this.clouds.position.copy(this.earthAnchor);
    this.clouds.scale.setScalar(this.earthBaseScale);
    this.celestialGroup.add(this.clouds);

    // Atmospheric rim glow
    this.earthGlow = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS_SCENE * 1.025, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: { sunPosition: { value: this.sunAnchor } },
        vertexShader: `
          varying vec3 vWorld; varying vec3 vNormal;
          void main() {
            vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
            vNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 sunPosition; varying vec3 vWorld; varying vec3 vNormal;
          void main() {
            float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(cameraPosition - vWorld))), 3.0);
            float day = smoothstep(-0.2, 0.4, dot(normalize(vNormal), normalize(sunPosition - vWorld)));
            gl_FragColor = vec4(mix(vec3(0.12,0.22,0.5), vec3(0.24,0.6,1.0), day), rim * (0.08 + day * 0.45));
          }`,
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.earthGlow.position.copy(this.earthAnchor);
    this.earthGlow.scale.setScalar(this.earthBaseScale);
    this.celestialGroup.add(this.earthGlow);

    this.earthStar = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeStarGlowTexture(0x7fc8ff),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    }));
    this.earthStar.position.copy(this.earthAnchor);
    this.earthStar.scale.set(3200, 3200, 1);
    this.celestialGroup.add(this.earthStar);

    // Mars fixed position in solar system (pad coordinates at Starbase Mars)
    this.marsAnchor = new THREE.Vector3(
      this.padCoords.x,
      this.padGroundY - 8000,
      this.padCoords.y
    );
    this.marsGlobe = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS_SCENE * 0.53, 48, 32),
      new THREE.MeshStandardMaterial({
        map: createProceduralMarsTexture(),
        color: 0xffffff,
        roughness: 0.95,
        emissive: new THREE.Color(0x381208),
        emissiveIntensity: 0.0
      })
    );
    this.marsGlobe.position.copy(this.marsAnchor);
    this.marsGlobe.scale.setScalar(this.marsBaseScale);
    this.celestialGroup.add(this.marsGlobe);
    this.marsStar = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeStarGlowTexture(0xff8a5a),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    this.marsStar.position.copy(this.marsAnchor);
    this.marsStar.scale.set(2800, 2800, 1);
    this.celestialGroup.add(this.marsStar);

    this.moonOrbitRadius = 62000;
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(MOON_RADIUS_SCENE, 40, 26),
      new THREE.MeshStandardMaterial({
        map: getMoonMap(),
        color: 0xdfe2e4,
        roughness: 1.0,
        metalness: 0.0,
        emissive: new THREE.Color(0x2a2a2a),
        emissiveIntensity: 0.0
      })
    );
    this.moon.position.set(
      this.earthAnchor.x - 38000,
      this.earthAnchor.y + 12000,
      this.earthAnchor.z + 44000
    );
    this.moon.scale.setScalar(this.moonBaseScale);
    this.celestialGroup.add(this.moon);

    this.solarOrigin = new THREE.Vector3();
    this.localTransferOrigin = new THREE.Vector3();
    this.solarEpoch = 0;
    this.solarBodies = new Map([['earth', this.earth], ['mars', this.marsGlobe]]);
    this.bodyEphemeris = new Map();
    this._skyDirection = new THREE.Vector3();
    this.moonEphemeris = new THREE.Vector3();
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(sceneRadius(695700000), 48, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe5b0, fog: false, toneMapped: false }));
    this.celestialGroup.add(this.sun);
    this.solarLight = new THREE.PointLight(0xfff1da, 3, 0, 0);
    this.celestialGroup.add(this.solarLight);
    for (const body of SOLAR_BODIES) {
      if (this.solarBodies.has(body.id)) continue;
      const radius = sceneRadius(body.radius);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20),
        new THREE.MeshStandardMaterial({ color: body.color, roughness: 0.9, fog: false }));
      this.solarBodies.set(body.id, mesh);
      this.celestialGroup.add(mesh);
    }
    this._solarPhases = new Map(SOLAR_BODIES.map((b, i) => [b.id, i * 0.81]));
    this._configureSolarFrame(this.physics.position);
    this.moonOrbitRing = null;
  }

  _buildEarthSurface() {
    this.earthSurface = new THREE.Group();
    this.earthSurface.visible = false;
    this.scene.add(this.earthSurface);

    // Realistic carved circular ocean body with spherical planetary curvature
    const oceanMat = new THREE.MeshStandardMaterial({
      map: makeOceanTexture(),
      color: 0x719eb2,
      roughness: 0.15,
      metalness: 0.02,
      envMapIntensity: 1.25,
      transparent: true,
      opacity: 0.95
    });
    const oceanGeo = new THREE.PlaneGeometry(80000, 80000, 96, 96);
    oceanGeo.rotateX(-Math.PI / 2);
    const oPos = oceanGeo.attributes.position;
    for (let i = 0; i < oPos.count; i++) {
      const vx = oPos.getX(i);
      const vz = oPos.getZ(i);
      const r = Math.hypot(vx, vz);
      oPos.setY(i, -(r * r) / (2.0 * EARTH_RADIUS) - 2.8);
    }
    oceanGeo.computeVertexNormals();

    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.position.set(this.padCoords.x, this.padGroundY, this.padCoords.y);
    this.earthSurface.add(ocean);
    this.earthOcean = ocean;
    this.earthOceanMat = oceanMat;

    // Carved coastal Earth peninsula with realistic 3D relief, bluffs, rolling hills, and planetary curvature
    const groundMat = new THREE.MeshStandardMaterial({
      map: makeGrassTexture(),
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02,
      transparent: true,
      opacity: 1.0,
      polygonOffset: true,
      polygonOffsetFactor: 4,
      polygonOffsetUnits: 4
    });

    const groundGeo = new THREE.PlaneGeometry(40000, 40000, 192, 192);
    groundGeo.rotateX(-Math.PI / 2);
    const gPos = groundGeo.attributes.position;
    for (let i = 0; i < gPos.count; i++) {
      const vx = gPos.getX(i);
      const vz = gPos.getZ(i);
      const r = Math.hypot(vx, vz);
      const y = earthSurfaceHeight(vx, vz);
      gPos.setY(i, y);
    }
    const colors = new Float32Array(gPos.count * 3);
    const sand = new THREE.Color(0xb7ac82), grass = new THREE.Color(0x637459), color = new THREE.Color();
    for (let i = 0; i < gPos.count; i++) {
      const x = gPos.getX(i), z = gPos.getZ(i);
      const inland = THREE.MathUtils.smoothstep(earthCoastDistance(x, z), 20, 700);
      color.copy(sand).lerp(grass, inland);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    groundGeo.computeVertexNormals();

    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(this.padCoords.x, this.padGroundY, this.padCoords.y);
    ground.receiveShadow = true;
    this.earthSurface.add(ground);
    this.earthGround = ground;
    this.earthGroundMat = groundMat;

    // Sandy coastal ring makes the land/ocean boundary read as a beach
    const beachMat = new THREE.MeshStandardMaterial({
      map: makeBeachTexture(),
      color: 0xd8c89a,
      roughness: 0.92,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1.0,
      polygonOffset: true,
      polygonOffsetFactor: 3,
      polygonOffsetUnits: 3
    });
    const beachGeo = new THREE.RingGeometry(8700, 9900, 96, 6);
    beachGeo.rotateX(-Math.PI / 2);
    const bPos = beachGeo.attributes.position;
    for (let i = 0; i < bPos.count; i++) {
      const vx = bPos.getX(i);
      const vz = bPos.getZ(i);
      const r = Math.hypot(vx, vz);
      bPos.setY(i, -(r * r) / (2.0 * EARTH_RADIUS) - 0.45);
    }
    beachGeo.computeVertexNormals();

    const beach = new THREE.Mesh(beachGeo, beachMat);
    beach.position.set(this.padCoords.x, this.padGroundY, this.padCoords.y);
    beach.visible = false;
    this.earthSurface.add(beach);
    this.earthBeachMat = beachMat;

    // Graded concrete apron around the launch complex - set beneath pad structures to prevent Z-fighting
    const apronMat = new THREE.MeshStandardMaterial({
      map: makeEarthConcreteTexture(),
      color: 0x8e9594,
      roughness: 0.88,
      metalness: 0.05,
      transparent: true,
      opacity: 1.0,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2
    });
    const apron = new THREE.Mesh(new THREE.CircleGeometry(490, 80), apronMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(this.padCoords.x, this.padGroundY - 0.04, this.padCoords.y);
    apron.receiveShadow = true;
    this.earthSurface.add(apron);
    this.earthApronMat = apronMat;

    // -------------------------------------------------------------------------
    // 10 DETAILED BOTANICAL TREE ARCHETYPES (High detail, zero draw-call lag via InstancedMesh)
    // -------------------------------------------------------------------------
    const barkDarkMat = new THREE.MeshStandardMaterial({ color: 0x483422, roughness: 0.95, transparent: true, opacity: 1.0 });
    const barkPaleMat = new THREE.MeshStandardMaterial({ color: 0x765a3c, roughness: 0.92, transparent: true, opacity: 1.0 });
    const barkSilverMat = new THREE.MeshStandardMaterial({ color: 0xd8d3c6, roughness: 0.85, transparent: true, opacity: 1.0 });
    const pineDarkMat = new THREE.MeshStandardMaterial({ color: 0x143c1c, roughness: 0.92, transparent: true, opacity: 1.0 });
    const pineMediumMat = new THREE.MeshStandardMaterial({ color: 0x1d5227, roughness: 0.90, transparent: true, opacity: 1.0 });
    const oakGreenMat = new THREE.MeshStandardMaterial({ color: 0x2d682c, roughness: 0.88, transparent: true, opacity: 1.0 });
    const cypressMat = new THREE.MeshStandardMaterial({ color: 0x173a1d, roughness: 0.92, transparent: true, opacity: 1.0 });
    const willowMat = new THREE.MeshStandardMaterial({ color: 0x648c34, roughness: 0.88, transparent: true, opacity: 1.0 });
    const mapleRedMat = new THREE.MeshStandardMaterial({ color: 0xb83818, roughness: 0.86, transparent: true, opacity: 1.0 });
    const birchLeafMat = new THREE.MeshStandardMaterial({ color: 0x5da83a, roughness: 0.88, transparent: true, opacity: 1.0 });
    const firDarkMat = new THREE.MeshStandardMaterial({ color: 0x102f15, roughness: 0.94, transparent: true, opacity: 1.0 });
    const mangroveMat = new THREE.MeshStandardMaterial({ color: 0x275628, roughness: 0.90, transparent: true, opacity: 1.0 });
    const magnoliaMat = new THREE.MeshStandardMaterial({ color: 0x214b22, roughness: 0.88, transparent: true, opacity: 1.0 });
    const flowerBlossomMat = new THREE.MeshStandardMaterial({ color: 0xffedf3, roughness: 0.75, emissive: new THREE.Color(0x331018), emissiveIntensity: 0.35 });

    this.earthTreeMaterials = [
      barkDarkMat, barkPaleMat, barkSilverMat, pineDarkMat, pineMediumMat,
      oakGreenMat, cypressMat, willowMat, mapleRedMat, birchLeafMat,
      firDarkMat, mangroveMat, magnoliaMat, flowerBlossomMat
    ];
    this.earthTreeObstacles = [];

    // Counts per archetype across the landscape (~1,120 trees total)
    const countPalm = 120;
    const countPine = 150;
    const countOak = 130;
    const countCypress = 100;
    const countWillow = 90;
    const countMaple = 100;
    const countBirch = 110;
    const countFir = 140;
    const countMangrove = 90;
    const countMagnolia = 90;

    // Archetype 1: Coastal Palm (curved trunk + radial drooping fronds + coconuts)
    const palmTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1.3, 16, 6), barkPaleMat, countPalm);
    const palmFrondInst = new THREE.InstancedMesh(new THREE.ConeGeometry(7.8, 2.2, 8), oakGreenMat, countPalm);
    const palmNutInst = new THREE.InstancedMesh(new THREE.SphereGeometry(1.4, 5, 5), barkDarkMat, countPalm);

    // Archetype 2: Ponderosa Pine (3 tiered cones)
    const pineTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.8, 1.4, 18, 6), barkDarkMat, countPine);
    const pineT1Inst = new THREE.InstancedMesh(new THREE.ConeGeometry(6.8, 12, 7), pineDarkMat, countPine);
    const pineT2Inst = new THREE.InstancedMesh(new THREE.ConeGeometry(5.2, 10, 7), pineMediumMat, countPine);
    const pineT3Inst = new THREE.InstancedMesh(new THREE.ConeGeometry(3.6, 9, 7), pineDarkMat, countPine);

    // Archetype 3: Sprawling English Oak (stout trunk + 2 broadleaf domes)
    const oakTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.3, 1.9, 14, 6), barkDarkMat, countOak);
    const oakDome1Inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(9.0, 2), oakGreenMat, countOak);
    const oakDome2Inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(7.2, 2), birchLeafMat, countOak);

    // Archetype 4: Mediterranean Cypress (slender columnar spire)
    const cypressTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.9, 6, 6), barkDarkMat, countCypress);
    const cypressSpireInst = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 26, 8), cypressMat, countCypress);

    // Archetype 5: Weeping Willow (umbrella + cascading fronds)
    const willowTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.2, 1.7, 12, 6), barkDarkMat, countWillow);
    const willowDomeInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(9.5, 7.0, 6, 8), willowMat, countWillow);

    // Archetype 6: Autumn Red Maple (vibrant orange-crimson canopy)
    const mapleTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 1.4, 15, 6), barkDarkMat, countMaple);
    const mapleCanopyInst = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(8.2, 2), mapleRedMat, countMaple);

    // Archetype 7: Silver Birch / Aspen (slender pale trunk + airy fluttering foliage)
    const birchTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.8, 20, 6), barkSilverMat, countBirch);
    const birchCanopyInst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(6.8, 2), birchLeafMat, countBirch);

    // Archetype 8: Douglas Fir / Giant Spruce (tall conifer with 4 dense tiered skirts)
    const firTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 1.5, 24, 6), barkDarkMat, countFir);
    const firT1Inst = new THREE.InstancedMesh(new THREE.ConeGeometry(7.5, 12, 7), firDarkMat, countFir);
    const firT2Inst = new THREE.InstancedMesh(new THREE.ConeGeometry(5.8, 10, 7), firDarkMat, countFir);
    const firT3Inst = new THREE.InstancedMesh(new THREE.ConeGeometry(4.2, 9, 7), pineDarkMat, countFir);

    // Archetype 9: Coastal Mangrove (stilt prop-roots + dense low umbrella)
    const mangroveTrunkInst = new THREE.InstancedMesh(new THREE.ConeGeometry(3.5, 7, 6), barkPaleMat, countMangrove);
    const mangroveDomeInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(8.0, 5.0, 4.5, 8), mangroveMat, countMangrove);

    // Archetype 10: Flowering Magnolia / Dogwood (glossy dark canopy with bright blossoms)
    const magnoliaTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.8, 1.2, 11, 6), barkPaleMat, countMagnolia);
    const magnoliaCanopyInst = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(7.0, 2), magnoliaMat, countMagnolia);
    const magnoliaBloomInst = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(3.4, 1), flowerBlossomMat, countMagnolia);

    const dummy = new THREE.Object3D();

    // Helper to evaluate carved surface height for tree placement
    const sampleCarvedY = (vx, vz) => this.padGroundY + earthSurfaceHeight(vx, vz);

    // 1. Plant Palms along coastal beaches & peninsulas
    for (let i = 0; i < countPalm; i++) {
      const angle = (i / countPalm) * Math.PI * 2 + (i % 7) * 0.2;
      const radius = 6200 + (i % 23) * 95 + Math.sin(i * 3.1) * 240;
      const vx = Math.cos(angle) * radius;
      const vz = Math.sin(angle) * radius;
      const x = this.padCoords.x + vx;
      const z = this.padCoords.y + vz;
      const y = sampleCarvedY(vx, vz);
      const s = 0.8 + (i % 5) * 0.12;

      this.earthTreeObstacles.push({ x, z, radius: 1.6 });

      dummy.position.set(x, y + 7.5 * s, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0.12 * Math.sin(i), angle, 0.12 * Math.cos(i));
      dummy.updateMatrix();
      palmTrunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x + Math.sin(i) * 1.5, y + 16.5 * s, z + Math.cos(i) * 1.5);
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      palmFrondInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x + Math.sin(i) * 0.8, y + 15.0 * s, z + Math.cos(i) * 0.8);
      dummy.scale.set(s * 0.7, s * 0.7, s * 0.7);
      dummy.updateMatrix();
      palmNutInst.setMatrixAt(i, dummy.matrix);
    }

    // 2. Plant Ponderosa Pines across inland slopes & ridges
    for (let i = 0; i < countPine; i++) {
      const angle = (i / countPine) * Math.PI * 2 + (i % 9) * 0.24;
      const radius = 950 + (i % 31) * 120 + Math.sin(i * 2.7) * 320;
      const vx = Math.cos(angle) * radius;
      const vz = Math.sin(angle) * radius;
      const x = this.padCoords.x + vx;
      const z = this.padCoords.y + vz;
      const y = sampleCarvedY(vx, vz);
      const s = 0.8 + (i % 5) * 0.15;

      this.earthTreeObstacles.push({ x, z, radius: 1.8 });

      dummy.position.set(x, y + 8.5 * s, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      pineTrunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 16.0 * s, z);
      dummy.updateMatrix();
      pineT1Inst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 22.0 * s, z);
      dummy.updateMatrix();
      pineT2Inst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 27.5 * s, z);
      dummy.updateMatrix();
      pineT3Inst.setMatrixAt(i, dummy.matrix);
    }

    // 3. Plant Sprawling English Oaks in meadows & parkways
    for (let i = 0; i < countOak; i++) {
      const angle = (i / countOak) * Math.PI * 2 + 0.45 + (i % 7) * 0.18;
      const radius = 680 + (i % 29) * 110 + Math.cos(i * 2.3) * 180;
      const vx = Math.cos(angle) * radius;
      const vz = Math.sin(angle) * radius;
      const x = this.padCoords.x + vx;
      const z = this.padCoords.y + vz;
      const y = sampleCarvedY(vx, vz);
      const s = 0.85 + (i % 6) * 0.14;

      this.earthTreeObstacles.push({ x, z, radius: 2.2 });

      dummy.position.set(x, y + 6.5 * s, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, angle + 0.5, 0);
      dummy.updateMatrix();
      oakTrunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 19.5 * s, z);
      dummy.updateMatrix();
      oakDome1Inst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x + 3.2 * s, y + 23.5 * s, z + 2.0 * s);
      dummy.scale.set(s * 0.82, s * 0.82, s * 0.82);
      dummy.updateMatrix();
      oakDome2Inst.setMatrixAt(i, dummy.matrix);
    }

    // 4. Plant Mediterranean Cypresses along facility borders
    for (let i = 0; i < countCypress; i++) {
      const angle = (i / countCypress) * Math.PI * 2 + (i % 5) * 0.15;
      const radius = 540 + (i % 17) * 70;
      const vx = Math.cos(angle) * radius;
      const vz = Math.sin(angle) * radius;
      const x = this.padCoords.x + vx;
      const z = this.padCoords.y + vz;
      const y = sampleCarvedY(vx, vz);
      const s = 0.8 + (i % 4) * 0.16;

      this.earthTreeObstacles.push({ x, z, radius: 1.2 });

      dummy.position.set(x, y + 3.0 * s, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      cypressTrunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 14.5 * s, z);
      dummy.updateMatrix();
      cypressSpireInst.setMatrixAt(i, dummy.matrix);
    }

    // 5. Plant Weeping Willows along lagoon banks & wetlands
    for (let i = 0; i < countWillow; i++) {
      const angle = (i / countWillow) * Math.PI * 2 + 1.2;
      const radius = 2400 + (i % 15) * 85 + Math.sin(i * 1.7) * 150;
      const vx = Math.cos(angle) * radius;
      const vz = Math.sin(angle) * radius;
      const x = this.padCoords.x + vx;
      const z = this.padCoords.y + vz;
      const y = sampleCarvedY(vx, vz);
      const s = 0.85 + (i % 5) * 0.14;

      this.earthTreeObstacles.push({ x, z, radius: 1.9 });

      dummy.position.set(x, y + 5.5 * s, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      willowTrunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 13.5 * s, z);
      dummy.updateMatrix();
      willowDomeInst.setMatrixAt(i, dummy.matrix);
    }

    // 6. Plant Autumn Red Maples across inland woodlands
    for (let i = 0; i < countMaple; i++) {
      const angle = (i / countMaple) * Math.PI * 2 + 2.1;
      const radius = 1800 + (i % 21) * 110 + Math.cos(i * 2.1) * 200;
      const vx = Math.cos(angle) * radius;
      const vz = Math.sin(angle) * radius;
      const x = this.padCoords.x + vx;
      const z = this.padCoords.y + vz;
      const y = sampleCarvedY(vx, vz);
      const s = 0.8 + (i % 6) * 0.15;

      this.earthTreeObstacles.push({ x, z, radius: 1.6 });

      dummy.position.set(x, y + 7.0 * s, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      mapleTrunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 17.5 * s, z);
      dummy.updateMatrix();
      mapleCanopyInst.setMatrixAt(i, dummy.matrix);
    }

    // 7. Plant Silver Birches / Aspens scattered across hillsides
    for (let i = 0; i < countBirch; i++) {
      const angle = (i / countBirch) * Math.PI * 2 + 0.8;
      const radius = 2900 + (i % 25) * 130 + Math.sin(i * 2.5) * 260;
      const vx = Math.cos(angle) * radius;
      const vz = Math.sin(angle) * radius;
      const x = this.padCoords.x + vx;
      const z = this.padCoords.y + vz;
      const y = sampleCarvedY(vx, vz);
      const s = 0.85 + (i % 5) * 0.12;

      this.earthTreeObstacles.push({ x, z, radius: 1.3 });

      dummy.position.set(x, y + 9.5 * s, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      birchTrunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 21.0 * s, z);
      dummy.updateMatrix();
      birchCanopyInst.setMatrixAt(i, dummy.matrix);
    }

    // 8. Plant Douglas Firs / Giant Spruces in high conifer stands
    for (let i = 0; i < countFir; i++) {
      const angle = (i / countFir) * Math.PI * 2 + 3.1;
      const radius = 3800 + (i % 27) * 140 + Math.cos(i * 1.9) * 320;
      const vx = Math.cos(angle) * radius;
      const vz = Math.sin(angle) * radius;
      const x = this.padCoords.x + vx;
      const z = this.padCoords.y + vz;
      const y = sampleCarvedY(vx, vz);
      const s = 0.9 + (i % 5) * 0.18;

      this.earthTreeObstacles.push({ x, z, radius: 2.0 });

      dummy.position.set(x, y + 11.0 * s, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      firTrunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 16.5 * s, z);
      dummy.updateMatrix();
      firT1Inst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 23.5 * s, z);
      dummy.updateMatrix();
      firT2Inst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 30.0 * s, z);
      dummy.updateMatrix();
      firT3Inst.setMatrixAt(i, dummy.matrix);
    }

    // 9. Plant Coastal Mangroves along the shoreline shallows
    for (let i = 0; i < countMangrove; i++) {
      const angle = (i / countMangrove) * Math.PI * 2 + 0.3;
      const radius = 7800 + (i % 17) * 75 + Math.sin(i * 2.2) * 140;
      const vx = Math.cos(angle) * radius;
      const vz = Math.sin(angle) * radius;
      const x = this.padCoords.x + vx;
      const z = this.padCoords.y + vz;
      const y = sampleCarvedY(vx, vz);
      const s = 0.8 + (i % 4) * 0.15;

      this.earthTreeObstacles.push({ x, z, radius: 2.2 });

      dummy.position.set(x, y + 3.2 * s, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      mangroveTrunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 8.5 * s, z);
      dummy.updateMatrix();
      mangroveDomeInst.setMatrixAt(i, dummy.matrix);
    }

    // 10. Plant Flowering Magnolias & Dogwoods around facility grounds
    for (let i = 0; i < countMagnolia; i++) {
      const angle = (i / countMagnolia) * Math.PI * 2 + 1.8;
      const radius = 620 + (i % 19) * 80;
      const vx = Math.cos(angle) * radius;
      const vz = Math.sin(angle) * radius;
      const x = this.padCoords.x + vx;
      const z = this.padCoords.y + vz;
      const y = sampleCarvedY(vx, vz);
      const s = 0.8 + (i % 5) * 0.14;

      this.earthTreeObstacles.push({ x, z, radius: 1.4 });

      dummy.position.set(x, y + 5.0 * s, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      magnoliaTrunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 13.0 * s, z);
      dummy.updateMatrix();
      magnoliaCanopyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x + 1.2 * s, y + 14.8 * s, z + 1.0 * s);
      dummy.updateMatrix();
      magnoliaBloomInst.setMatrixAt(i, dummy.matrix);
    }

    // Update instance matrices for all 10 archetypes
    palmTrunkInst.instanceMatrix.needsUpdate = true;
    palmFrondInst.instanceMatrix.needsUpdate = true;
    palmNutInst.instanceMatrix.needsUpdate = true;
    pineTrunkInst.instanceMatrix.needsUpdate = true;
    pineT1Inst.instanceMatrix.needsUpdate = true;
    pineT2Inst.instanceMatrix.needsUpdate = true;
    pineT3Inst.instanceMatrix.needsUpdate = true;
    oakTrunkInst.instanceMatrix.needsUpdate = true;
    oakDome1Inst.instanceMatrix.needsUpdate = true;
    oakDome2Inst.instanceMatrix.needsUpdate = true;
    cypressTrunkInst.instanceMatrix.needsUpdate = true;
    cypressSpireInst.instanceMatrix.needsUpdate = true;
    willowTrunkInst.instanceMatrix.needsUpdate = true;
    willowDomeInst.instanceMatrix.needsUpdate = true;
    mapleTrunkInst.instanceMatrix.needsUpdate = true;
    mapleCanopyInst.instanceMatrix.needsUpdate = true;
    birchTrunkInst.instanceMatrix.needsUpdate = true;
    birchCanopyInst.instanceMatrix.needsUpdate = true;
    firTrunkInst.instanceMatrix.needsUpdate = true;
    firT1Inst.instanceMatrix.needsUpdate = true;
    firT2Inst.instanceMatrix.needsUpdate = true;
    firT3Inst.instanceMatrix.needsUpdate = true;
    mangroveTrunkInst.instanceMatrix.needsUpdate = true;
    mangroveDomeInst.instanceMatrix.needsUpdate = true;
    magnoliaTrunkInst.instanceMatrix.needsUpdate = true;
    magnoliaCanopyInst.instanceMatrix.needsUpdate = true;
    magnoliaBloomInst.instanceMatrix.needsUpdate = true;

    this.earthSurface.add(
      palmTrunkInst, palmFrondInst, palmNutInst,
      pineTrunkInst, pineT1Inst, pineT2Inst, pineT3Inst,
      oakTrunkInst, oakDome1Inst, oakDome2Inst,
      cypressTrunkInst, cypressSpireInst,
      willowTrunkInst, willowDomeInst,
      mapleTrunkInst, mapleCanopyInst,
      birchTrunkInst, birchCanopyInst,
      firTrunkInst, firT1Inst, firT2Inst, firT3Inst,
      mangroveTrunkInst, mangroveDomeInst,
      magnoliaTrunkInst, magnoliaCanopyInst, magnoliaBloomInst
    );

    // Low clouds drifting through the coastal sky.
    this.earthCloudSprites = new THREE.Group();
    const cloudPuff = makeCloudPuffTexture();
    for (let i = 0; i < 22; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudPuff,
        transparent: true,
        opacity: 0.36 + Math.random() * 0.22,
        depthWrite: false,
        depthTest: true
      }));
      const a = (i / 22) * Math.PI * 2 + 0.3;
      const r = 1200 + Math.random() * 6800;
      sprite.position.set(
        this.padCoords.x + Math.cos(a) * r,
        this.padGroundY + 780 + Math.random() * 2100,
        this.padCoords.y + Math.sin(a) * r
      );
      const s = 700 + Math.random() * 1500;
      sprite.scale.set(s, s * 0.44, 1);
      sprite.userData.drift = 0.6 + Math.random() * 1.4;
      this.earthCloudSprites.add(sprite);
    }
    this.earthSurface.add(this.earthCloudSprites);

    // Earth Starbase marquee on two posts near the south gate.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(44, 11),
      new THREE.MeshBasicMaterial({
        map: makeSignTexture('EARTH STARBASE', 'NEW ATLANTIS // ATLANTIC CATCH RANGE', '#4fc3ff'),
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    sign.position.set(this.padCoords.x, this.padGroundY + 10.5, this.padCoords.y - 225);
    this.earthSurface.add(sign);

    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a4f52, roughness: 0.55, metalness: 0.6 });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 10, 8), postMat);
      post.position.set(this.padCoords.x + side * 18, this.padGroundY + 5, this.padCoords.y - 225);
      post.castShadow = true;
      this.earthSurface.add(post);
    }
  }

  _buildSatellites() {
    // Mars orbital relay network (DTN / laser crosslinks).
    const mars = buildOrbitConstellation(18, 3600, 1250, 0xff9d54, 0.2);
    mars.group.position.set(this.padCoords.x, this.padGroundY, this.padCoords.y);
    this.scene.add(mars.group);
    this.marsSatellites = mars;

    // Earth orbital constellation, positioned around the Earth globe.
    const earth = buildOrbitConstellation(24, EARTH_RADIUS_SCENE * 1.18, 1800, 0x63d7ff, 1.1);
    earth.group.position.copy(this.earthAnchor);
    earth.group.scale.setScalar(1.0);
    this.celestialGroup.add(earth.group);
    this.earthSatellites = earth;

    // Low Earth-orbit relay ring visible from the Earth Starbase.
    const surface = buildOrbitConstellation(12, 3200, 1450, 0x8fffd2, 2.2);
    surface.group.position.set(this.padCoords.x, this.padGroundY, this.padCoords.y);
    surface.group.visible = false;
    this.scene.add(surface.group);
    this.earthSurfaceSatellites = surface;

    this._satelliteTime = 0;
  }

  _buildTankerFleet() {
    this.tankerFleet = new THREE.Group();
    this.tankerFleet.visible = false;
    this.scene.add(this.tankerFleet);
    this.tankerShips = [];
    const specs = [
      { accent: 0xffb347, tanker: true, radius: 880, y: 24, speed: 0.045 },
      { accent: 0x77ccff, tanker: false, radius: 1180, y: -18, speed: -0.032 },
      { accent: 0x9dffd0, tanker: false, radius: 1520, y: 62, speed: 0.026 }
    ];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const ship = createMiniStarship(spec.accent, spec.tanker);
      ship.userData.station = {
        angle: i * 2.1 + 0.6,
        radius: spec.radius,
        y: spec.y,
        speed: spec.speed
      };
      ship.userData.dock = new THREE.Vector3(
        -32 - i * 1.5,
        5,
        10 + i * 1.5
      );
      ship.userData.tanker = spec.tanker;
      this.tankerShips.push(ship);
      this.tankerFleet.add(ship);
    }
    this.activeTanker = this.tankerShips[0];

    // Visible cryogenic umbilical during hard dock / transfer.
    this.tankerHose = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 1, 8),
      new THREE.MeshBasicMaterial({
        color: 0x9fe8ff,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.tankerHose.visible = false;
    this.tankerFleet.add(this.tankerHose);
  }

  startTankerRendezvous() {
    this.tankerActive = true;
    this.tankerPhase = 'rendezvous';
    this.tankerProgress = 0;
    this._tankerClock = 0;
    if (this.activeTanker) {
      this.activeTanker.userData.rendezvousStart = this.activeTanker.position.clone();
    }
  }

  setTankerPhase(phase) {
    this.tankerPhase = phase;
    this.tankerProgress = 0;
    this._tankerClock = 0;
  }

  endTanker() {
    this.tankerActive = false;
    this.tankerPhase = 'idle';
    this.tankerProgress = 0;
  }

  updateTankerFleet(dt, physics) {
    if (!this.tankerFleet) return;
    const inOrbit = physics && physics.phase === 'ORBIT';
    this.tankerFleet.visible = inOrbit || this.tankerActive;
    if (!this.tankerFleet.visible) return;
    this.tankerFleet.position.copy(physics.position);
    this.tankerFleet.quaternion.copy(physics.quaternion);

    const active = this.activeTanker;
    const docked = this.tankerPhase === 'docked'
      || this.tankerPhase === 'transfer'
      || this.tankerPhase === 'complete';
    for (const ship of this.tankerShips) {
      const st = ship.userData.station;
      st.angle += st.speed * dt;
      const station = new THREE.Vector3(
        Math.cos(st.angle) * st.radius,
        st.y + Math.sin(st.angle * 1.4) * 34,
        Math.sin(st.angle) * st.radius
      );
      if (ship === active && this.tankerActive) {
        const dock = ship.userData.dock;
        const approach = new THREE.Vector3(
          dock.x + 260,
          dock.y + 150,
          dock.z + 240
        );
        if (docked) {
          // Deterministic hard-dock pose: no frame-rate-dependent drift while
          // propellant transfer is running.
          ship.position.copy(dock);
        } else if (this.tankerPhase === 'rendezvous') {
          // Station -> approach -> dock, driven by mission progress rather
          // than a dt-based lerp. This keeps the rendezvous readable at any
          // frame rate and guarantees the tanker is alongside at 100%.
          const p = THREE.MathUtils.smoothstep(this.tankerProgress, 0, 1);
          const start = ship.userData.rendezvousStart || station;
          if (p < 0.72) {
            const q = THREE.MathUtils.smoothstep(p / 0.72, 0, 1);
            ship.position.copy(start).lerp(approach, q);
          } else {
            const q = THREE.MathUtils.smoothstep((p - 0.72) / 0.28, 0, 1);
            ship.position.copy(approach).lerp(dock, q);
          }
        } else {
          ship.position.copy(approach);
        }
        ship.rotation.set(0, Math.PI * 0.5, 0);
      } else {
        ship.position.copy(station);
        ship.rotation.set(0, st.angle + Math.PI * 0.5, 0);
      }
      const beacon = ship.children[ship.children.length - 1];
      if (beacon?.material) {
        beacon.material.color.setHex((Math.sin(this.time * 4 + st.angle) > 0.35) ? 0x66ff99 : 0x153b24);
      }
    }

    if (this.tankerHose && active) {
      this.tankerHose.visible = docked;
      if (docked) {
        const start = new THREE.Vector3(0, 10, 0);
        const end = active.userData.dock;
        const dir = end.clone().sub(start);
        const len = dir.length();
        this.tankerHose.position.copy(start).addScaledVector(dir, 0.5);
        this.tankerHose.scale.set(1, len, 1);
        this.tankerHose.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.normalize()
        );
      }
    }
  }

  _buildTransferPath() {
    this.pathStart = new THREE.Vector3();
    this.pathEnd = new THREE.Vector3();
    this.pathCenter = new THREE.Vector3();
    this.pathU = new THREE.Vector3(1, 0, 0);
    this.pathV = new THREE.Vector3(0, 1, 0);
    this.pathA = 1;
    this.pathB = 1;
    this._pathPoint = new THREE.Vector3();
    this._pathTangent = new THREE.Vector3();
    this._tangentA = new THREE.Vector3();
    this._tangentB = new THREE.Vector3();
    this._upAxis = new THREE.Vector3(0, 1, 0);
    this._flightDir = new THREE.Vector3();
    this._toDestination = new THREE.Vector3();
    this.flybyPoint = null;
    this.flybyBase = null;
    this.flybyDelta = null;
    this.transferStatus = '';

    this.transferGroup = new THREE.Group();
    this.transferGroup.visible = false;
    this.scene.add(this.transferGroup);

    this.transferTrail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({
        color: 0x7de3ff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    );
    this.transferTrail.frustumCulled = false;
    this.transferTrail.renderOrder = 3;

    this.transferTube = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0x2b9fd0,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    );
    this.transferTube.frustumCulled = false;
    this.transferTube.renderOrder = 2;

    this.transferDots = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        map: makeStarGlowTexture(0x9fe9ff),
        color: 0xbdefff,
        size: 900,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
    );
    this.transferDots.frustumCulled = false;
    this.transferDots.renderOrder = 4;

    this.transferGroup.add(this.transferTube, this.transferTrail, this.transferDots);
  }

  start(target = 'earth') {
    if (this.active) return;
    if (target === this.planetId) return;
    this.target = target;
    this.progress = 0;
    this.arrived = false;
    this.active = true;
    this.time = 0;
    this.duration = target === 'earth' ? 44 : 52;
    this.flightPhaseLabel = '';

    this.orbit = createTransfer(this.planetId, target);
    this._configureSolarFrame(this.physics.position);
    if (this.orbit.lunar) {
      const departure = sampleTransfer(this.orbit,0);
      this.localTransferOrigin.set(this.physics.position.x-departure.x/AU*SCENE_AU,
        this.physics.position.y-6000,this.physics.position.z);
      this.solarOrigin.copy(this.localTransferOrigin); this.solarOrigin.x -= SCENE_AU;
      this._solarPhases.set('earth',0);
      this._lunarStartAngle = this.planetId === 'moon' ? Math.PI : Math.PI-this.orbit.seconds*2*Math.PI/(27.32*86400);
    }
    this._samplePath(0, this.pathStart);
    this._samplePath(1, this.pathEnd);
    this.flybyPoint = null;
    this._rebuildRouteGeometry();
    this.transferGroup.visible = true;
    this.transferTrail.material.opacity = 0.88;
    this.transferTube.material.opacity = 0.2;
    this.transferDots.material.opacity = 0.72;

    this.celestialGroup.visible = true;
    this.earth.position.copy(this.earthAnchor);
    this.clouds.position.copy(this.earthAnchor);
    this.earthGlow.position.copy(this.earthAnchor);
    this.earthStar.position.copy(this.earthAnchor);
    this.marsGlobe.position.copy(this.marsAnchor);
    this.marsStar.position.copy(this.marsAnchor);

    this.earth.visible = true;
    this.clouds.visible = true;
    this.earthGlow.visible = true;
    this.earthStar.visible = true;
    this.marsGlobe.visible = true;
    this.marsStar.visible = true;
    this.moon.visible = true;

    this._updateSolarBodies(0);
    this.sun.visible = this.solarLight.visible = true;
    this.sunGlow.visible = false;
  }

  _configureSolarFrame(position) {
    const from = SOLAR_BODIES.find(b => b.id === (this.planetId === 'moon' ? 'earth' : this.planetId));
    const angle = this.planetId === 'mars' ? Math.PI : 0;
    this.solarOrigin.set(position.x - Math.cos(angle) * from.au * SCENE_AU,
      position.y - 6000, position.z);
    this.solarEpoch = 0;
    if (this.planetId === 'moon' && !this.orbit) this.solarOrigin.x += 384400000/AU*SCENE_AU;
    this._solarPhases.set(from.id, angle);
    if (this.orbit && this.target) {
      const dest = SOLAR_BODIES.find(b => b.id === (this.target === 'moon' ? 'earth' : this.target));
      this._solarPhases.set(dest.id, angle + Math.PI - orbitalRate(dest.au) * this.orbit.seconds);
    }
    this._updateSolarBodies(0);
  }

  _updateSolarBodies(seconds) {
    this.sun.position.copy(this.solarOrigin);
    this.earthGlow.material.uniforms.sunPosition.value.copy(this.solarOrigin);
    this.sunGlow.position.copy(this.solarOrigin);
    this.solarLight.position.copy(this.solarOrigin);
    for (const b of SOLAR_BODIES) {
      const angle = this.orbit?.lunar && b.id === 'earth' ? 0 : this._solarPhases.get(b.id) + orbitalRate(b.au) * seconds;
      this.solarBodies.get(b.id).position.set(
        this.solarOrigin.x + Math.cos(angle) * b.au * SCENE_AU,
        this.solarOrigin.y,
        this.solarOrigin.z + Math.sin(angle) * b.au * SCENE_AU);
      if (!this.bodyEphemeris.has(b.id)) this.bodyEphemeris.set(b.id,new THREE.Vector3());
      this.bodyEphemeris.get(b.id).copy(this.solarBodies.get(b.id).position);
    }
    this.earthAnchor.copy(this.earth.position);
    this.marsAnchor.copy(this.marsGlobe.position);
    this.earth.scale.setScalar(sceneRadius(6371000) / EARTH_RADIUS_SCENE);
    this.marsGlobe.scale.setScalar(sceneRadius(3389500) / (EARTH_RADIUS_SCENE * 0.53));
    for (const mesh of [this.clouds, this.earthGlow]) {
      mesh.position.copy(this.earth.position);
      mesh.scale.copy(this.earth.scale);
    }
    this.sunGlow.visible = false;
    this.earthStar.visible = false;
    this.marsStar.visible = false;
    this.moon.scale.setScalar(sceneRadius(1737400) / MOON_RADIUS_SCENE);
    const lunarAngle = (this.orbit?.lunar ? this._lunarStartAngle || 0 : 0) + seconds / (27.32 * 86400) * Math.PI * 2;
    this.moon.position.copy(this.earth.position);
    // Moon distance uses the same enlarged globe scale for a readable Earth system.
    this.moon.position.x += Math.cos(lunarAngle) * (384400000 / AU * SCENE_AU);
    this.moon.position.z += Math.sin(lunarAngle) * (384400000 / AU * SCENE_AU);
    this.moonEphemeris.copy(this.moon.position);
    if (this.earthSatellites) {
      this.earthSatellites.group.position.copy(this.earth.position);
      this.earthSatellites.group.scale.setScalar(0.1);
    }
  }

  _marsAnchor() {
    return new THREE.Vector3(
      this.padCoords.x - 180000,
      this.padGroundY + 50000,
      this.padCoords.y - 120000
    );
  }

  updateLocalSky(camera) {
    if (this.active) return;
    // Local flight is in metres, navigation is in AU-scaled units. Project
    // background bodies onto a camera-centred shell using their true angular
    // size, instead of mixing these two distance systems during descent.
    const observer = this.planetId === 'moon' ? this.moonEphemeris : this.bodyEphemeris.get(this.planetId);
    if (!observer) return;
    const shell = Math.min(150000,camera.far*.8);
    for (const b of SOLAR_BODIES) {
      const mesh = this.solarBodies.get(b.id);
      if (b.id === this.planetId) { mesh.visible=false; continue; }
      this._skyDirection.copy(this.bodyEphemeris.get(b.id)).sub(observer);
      const distance = Math.max(1,this._skyDirection.length());
      mesh.position.copy(camera.position).addScaledVector(this._skyDirection,shell/distance);
      mesh.scale.setScalar(sceneRadius(b.radius)*shell/distance/mesh.geometry.parameters.radius);
    }
    if (this.planetId !== 'earth') {
      for (const mesh of [this.clouds,this.earthGlow]) { mesh.position.copy(this.earth.position);mesh.scale.copy(this.earth.scale); }
    }
    if (this.planetId !== 'moon') {
      this._skyDirection.copy(this.moonEphemeris).sub(observer);
      const distance = Math.max(.001,this._skyDirection.length());
      this.moon.position.copy(camera.position).addScaledVector(this._skyDirection,shell/distance);
      this.moon.scale.setScalar(sceneRadius(1737400)*shell/distance/MOON_RADIUS_SCENE);
    }
  }

  _rebuildRouteGeometry() {
    const points = [];
    const n = 190;
    for (let i = 0; i <= n; i++) {
      points.push(this._samplePath(i / n, new THREE.Vector3()));
    }
    this.transferTrail.geometry.dispose();
    this.transferTrail.geometry = new THREE.BufferGeometry().setFromPoints(points);

    this.transferDots.geometry.dispose();
    const dotPoints = [];
    for (let i = 0; i <= 46; i++) {
      dotPoints.push(this._samplePath(i / 46, new THREE.Vector3()));
    }
    this.transferDots.geometry = new THREE.BufferGeometry().setFromPoints(dotPoints);

    const curve = new THREE.CatmullRomCurve3(points);
    const tube = new THREE.TubeGeometry(curve, 150, 260, 5, false);
    this.transferTube.geometry.dispose();
    this.transferTube.geometry = tube;
  }

  _samplePath(t, out) {
    const point = sampleTransfer(this.orbit, t);
    const origin = this.orbit.lunar ? this.localTransferOrigin : this.solarOrigin;
    return out.set(origin.x + point.x / AU * SCENE_AU,
      origin.y + 6000, origin.z + point.z / AU * SCENE_AU);
  }

  _sampleTangent(t, out) {
    const a = Math.max(0, t - 0.0015);
    const b = Math.min(1, t + 0.0015);
    this._samplePath(a, this._tangentA);
    this._samplePath(b, this._tangentB);
    out.subVectors(this._tangentB, this._tangentA);
    if (out.lengthSq() < 1e-8) out.set(0, 1, 0);
    return out.normalize();
  }

  hideTransferTrail() {
    if (this.transferGroup) this.transferGroup.visible = false;
    if (this.transferTrail) this.transferTrail.material.opacity = 0;
    if (this.transferTube) this.transferTube.material.opacity = 0;
    if (this.transferDots) this.transferDots.material.opacity = 0;
  }

  update(dt, timeScale = 1, currentAltitude = 0) {
    this.time += dt;
    this._satelliteTime += dt;

    // Altitude-based fading for Earth local terrain:
    // When ascending above 1200m, fade out the regional landing zone so it seamlessly gives way
    // to the 3D spherical Earth globe with zero flat-plane cutoffs in the sky!
    if (this.planetId === 'earth' && this.earthSurface) {
      if (currentAltitude > 26000) {
        this.earthSurface.visible = false;
      } else {
        this.earthSurface.visible = true;
        const fade = 1-THREE.MathUtils.smoothstep(currentAltitude,8000,26000);

        if (this.earthOceanMat) this.earthOceanMat.opacity = 0.95 * fade;
        if (this.earthGroundMat) this.earthGroundMat.opacity = fade;
        if (this.earthBeachMat) this.earthBeachMat.opacity = fade;
        if (this.earthApronMat) this.earthApronMat.opacity = fade;
        if (this.earthHillMat) this.earthHillMat.opacity = fade;
        if (this.earthTreeMaterials) {
          for (const m of this.earthTreeMaterials) m.opacity = fade;
        }
      }
    }

    // Satellites stay alive in every mode so the sky is never empty.
    this._updateSatelliteSet(this.marsSatellites, dt, 1.0);
    this._updateSatelliteSet(this.earthSatellites, dt, 1.0);
    this._updateSatelliteSet(this.earthSurfaceSatellites, dt, 1.0);
    this.updateTankerFleet(dt, this.physics);

    const simulatedDt = dt * Math.max(1, Math.min(timeScale, 8));
    this.earth.rotation.y += simulatedDt * Math.PI * 2 / 86164;
    this.clouds.rotation.y += simulatedDt * Math.PI * 2 / 85000;
    this.marsGlobe.rotation.y += simulatedDt * Math.PI * 2 / 88642;
    // Drifting low cloud decks over the Earth launch site.
    if (this.earthCloudSprites && this.earthSurface.visible) {
      for (const cloud of this.earthCloudSprites.children) {
        cloud.position.x += cloud.userData.drift * dt * 5.0;
        if (cloud.position.x > this.padCoords.x + 9000) {
          cloud.position.x = this.padCoords.x - 9000;
        }
      }
    }

    if (!this.active) return;

    // The booster NEVER transfers interplanetary; it stays on the home planet
    if (this.vehicle?.boosterGroup) {
      this.vehicle.boosterGroup.visible = false;
    }

    // Scripted cinematic transit along the Keplerian gravitational ellipse.
    const warp = Math.max(1, Math.min(timeScale, 3));
    this._lastScaleWarp = warp;
    this.progress = Math.min(1, this.progress + (dt * warp) / this.duration);
    this.physics.missionTime += dt * warp / this.duration * this.orbit.seconds;

    const t = this.progress;
    this._samplePath(t, this._pathPoint);
    this._sampleTangent(t, this._pathTangent);
    this.physics.position.copy(this._pathPoint);

    this._updateSolarBodies(t * this.orbit.seconds);
    this._toDestination.copy(this.pathEnd).sub(this._pathPoint).normalize();
    this._flightDir.copy(this._pathTangent)
      .lerp(this._toDestination, 0.42)
      .normalize();
    this.physics.quaternion.setFromUnitVectors(
      this._upAxis,
      this._flightDir
    );

    const flatSpeed = Math.hypot(this._flightDir.x, this._flightDir.z);
    this.physics.yaw = Math.atan2(this._flightDir.x, this._flightDir.z);
    this.physics.pitch = Math.atan2(flatSpeed, this._flightDir.y);
    this.physics.roll = 0;
    this.physics.yawDeg = ((this.physics.yaw * 180 / Math.PI) % 360 + 360) % 360;
    this.physics.pitchDeg = Math.abs(this.physics.pitch * 180 / Math.PI);
    this.physics.rollDeg = 0;

    // Physical heliocentric Keplerian velocity (from 32.7 km/s at Earth orbit to 21.5 km/s at Mars orbit)
    const helioSpeed = sampleTransfer(this.orbit, t).speed;
    this.physics.velocity.copy(this._pathTangent).multiplyScalar(helioSpeed);
    this.physics.speed = helioSpeed;
    this.physics.transferProgress = t;

    const burn = t < 0.055 || t > 0.952;
    this.vehicle.setStarshipThrottle(burn ? 0.9 : 0.0, true);
    this.vehicle.setReentryHeat(0);

    // Instantaneous separation from the moving destination, using the shared AU scale.
    const targetPosition = this.target === 'moon' ? this.moon.position : this.solarBodies.get(this.target).position;
    const remainingKm = Math.round(Math.hypot(
      this.physics.position.x - targetPosition.x,
      this.physics.position.z - targetPosition.z) / SCENE_AU * AU / 1000);
    const distAu = (remainingKm / 149597870.7).toFixed(3);
    const speedKmS = (helioSpeed / 1000).toFixed(1);

    // Mission time follows the semimajor axis, rather than a preset travel duration.
    const totalTransferDays = Math.round(this.orbit.seconds / 86400);
    const elapsedDays = Math.round(t * totalTransferDays);
    const elapsedMonths = (elapsedDays / 30.4375).toFixed(1);
    const totalMonths = (totalTransferDays / 30.4375).toFixed(1);

    const pct = Math.round(t * 100);
    let status = `KEPLER COAST // Day ${elapsedDays} of ${totalTransferDays} (${elapsedMonths}/${totalMonths} Mo) · ${pct}% · ${Math.round(remainingKm / 1000000)}M KM (${distAu} AU)`;
    if (t < 0.07) status = `TRANS-${this.target.toUpperCase()} INJECTION // Day ${elapsedDays} (${elapsedMonths} Mo) · ${pct}% · ${distAu} AU`;
    if (t > 0.92) status = `ENTRY INTERFACE // TARGET: ${this.target.toUpperCase()} STARBASE · DAY ${elapsedDays} (${elapsedMonths} MO)`;
    this.transferStatus = status;
    this.physics.transferStatus = status;

    if (t >= 1 && !this.arrived) {
      this.arrived = true;
      this.active = false;
      this.hideTransferTrail();
      this.transferStatus = 'ENTRY INTERFACE';
      this.physics.transferStatus = 'ENTRY INTERFACE';
      this.vehicle.setStarshipThrottle(0, false);
      if (this.options.onArrive) {
        this.options.onArrive(this.target);
      }
    }
  }

  _updateSatelliteSet(set, dt, scale) {
    if (!set || !set.group.visible) return;
    for (const sat of set.sats) {
      const o = sat.userData.orbit;
      o.angle += o.speed * dt;
      const x = Math.cos(o.angle) * o.radius;
      const z = Math.sin(o.angle) * o.radius;
      const y = Math.sin(o.angle * 1.7 + o.inclination) * o.radius * o.inclination;
      sat.position.set(x, y + o.height * 0.1, z);
      sat.rotation.y = -o.angle;
      sat.rotation.z = 0.2;
    }
  }

  // Called by the engine whenever the active world changes.
  setPlanet(planetId) {
    this.planetId = planetId;
    const onEarth = planetId === 'earth';
    this.earthSurface.visible = onEarth;
    this.earthSurfaceSatellites.group.visible = onEarth;
    this.marsSatellites.group.visible = !onEarth;
    this.celestialGroup.visible = true;

    if (onEarth) {
      // Local Earth environment. Earth's globe becomes the ground; Mars and the
      // Moon remain as small, believable objects in the sky.
      this.earth.visible = false;
      this.clouds.visible = false;
      this.earthGlow.visible = false;
      this.sunGlow.visible = false;
    this.earthStar.visible = false;
      this.earthSatellites.group.visible = false;
      this.moon.visible = true;
      this.moon.scale.setScalar(0.2);
      this.moon.position.set(
        this.padCoords.x + 120000,
        this.padGroundY + 70000,
        this.padCoords.y - 105000
      );
      this.marsGlobe.visible = true;
      this.marsGlobe.scale.setScalar(this.marsBaseScale * 0.62);
      this.marsGlobe.position.copy(this.marsAnchor);
      this.marsStar.visible = true;
    } else {
      this.earth.visible = true;
      this.clouds.visible = true;
      this.earthGlow.visible = true;
      this.earthStar.visible = true;
      this.earthSatellites.group.visible = true;
      this.earthSatellites.group.scale.setScalar(this.earthBaseScale);
      this.moon.visible = true;
      this.moon.scale.setScalar(this.moonBaseScale);
      // From the Martian surface Earth and the Moon read as a bright star-like
      // disc rather than filling the sky.
      this.earth.position.copy(this.earthAnchor);
      this.earth.scale.setScalar(this.earthBaseScale);
      this.clouds.position.copy(this.earthAnchor);
      this.clouds.scale.setScalar(this.earthBaseScale);
      this.earthGlow.position.copy(this.earthAnchor);
      this.earthGlow.scale.setScalar(this.earthBaseScale);
      this.moon.position.set(
        this.earthAnchor.x - 38000,
        this.earthAnchor.y + 12000,
        this.earthAnchor.z + 44000
      );
      this.marsGlobe.visible = false;
      this.marsStar.visible = false;
    }
    this.orbit = null;
    this.target = null;
    this._configureSolarFrame(this.physics.position);
    this.solarLight.visible = false;
    this.sun.visible = false;
    this.sunGlow.visible = false;
    for (const [id, mesh] of this.solarBodies) mesh.visible = id !== planetId;
    this.earth.visible = planetId !== 'earth';
    this.clouds.visible = this.earthGlow.visible = this.earth.visible;
    this.moon.visible = planetId !== 'moon';
  }

  reset() {
    this.active = false;
    this.progress = 0;
    this.arrived = false;
    this.target = null;
    this.transferStatus = '';
    this.flybyPoint = null;
    this.flybyBase = null;
    this.flybyDelta = null;
    this.endTanker();
    this.hideTransferTrail();
    this.physics.transferStatus = '';
    this.physics.transferProgress = 0;
    this.setPlanet(this.physics.planetId);
  }
}
