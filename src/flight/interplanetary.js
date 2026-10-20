import * as THREE from 'three';
import { PLANET_PROFILES, getPlanetProfile } from './planetProfiles.js';
import { STARBASE_LAYOUT as L } from './starbaseLayout.js';
import { createProceduralEarthTexture } from '../effects/postLaunchSpace.js';

// ---------------------------------------------------------------------------
// Interplanetary stage, Earth, the Moon, satellite constellations and the
// Earth-side Starbase environment.
//
// Distances are deliberately scene-scaled: the transfer is a compressed
// cinematic trajectory, while the actual mission clock and telemetry report
// the heliocentric journey. Entry itself is handed back to the real flight
// physics with the Earth profile (gravity 9.81 m/s², 1.225 kg/m³ atmosphere).
// ---------------------------------------------------------------------------

const EARTH_RADIUS_SCENE = 26000;
const MOON_RADIUS_SCENE = 7000;

function makeEarthTexture() {
  return createProceduralEarthTexture();
}

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
    g.arc(x, y, r, 0, Math.PI * 2);
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
    this.sunGlow.scale.set(38000, 38000, 1);
    this.celestialGroup.add(this.sunGlow);

    const earthMat = new THREE.MeshStandardMaterial({
      map: makeEarthTexture(),
      roughness: 0.68,
      metalness: 0.02,
      emissive: new THREE.Color(0x071b33),
      emissiveIntensity: 0.18
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
      new THREE.MeshBasicMaterial({
        color: 0x5ba8ff,
        transparent: true,
        opacity: 0.22,
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

    // Mars seen from Earth's sky: realistic rust-red celestial body
    const marsAzimuth = -2.35;
    this.marsAnchor = new THREE.Vector3(
      this.padCoords.x + Math.sin(marsAzimuth) * 480000,
      this.padGroundY + 160000,
      this.padCoords.y + Math.cos(marsAzimuth) * 480000
    );
    this.marsGlobe = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS_SCENE * 0.53, 48, 32),
      new THREE.MeshStandardMaterial({
        color: 0xc86a42,
        roughness: 0.95,
        emissive: new THREE.Color(0x381208),
        emissiveIntensity: 0.24
      })
    );
    this.marsGlobe.position.copy(this.marsAnchor);
    this.marsGlobe.scale.setScalar(this.marsBaseScale);
    this.celestialGroup.add(this.marsGlobe);
    this.marsStar = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeStarGlowTexture(0xff8a5a),
      transparent: true,
      opacity: 0.75,
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
        map: makeMoonTexture(),
        color: 0xdfe2e4,
        roughness: 1.0,
        metalness: 0.0,
        emissive: new THREE.Color(0x2a2a2a),
        emissiveIntensity: 0.18
      })
    );
    this.moon.position.set(
      this.earthAnchor.x - 38000,
      this.earthAnchor.y + 12000,
      this.earthAnchor.z + 44000
    );
    this.moon.scale.setScalar(this.moonBaseScale);
    this.celestialGroup.add(this.moon);

    this.moonOrbitRing = null;
  }

  _buildEarthSurface() {
    this.earthSurface = new THREE.Group();
    this.earthSurface.visible = false;
    this.scene.add(this.earthSurface);

    // Realistic circular ocean body with shoreline blending (zero flat square box cutoffs in space!)
    const oceanMat = new THREE.MeshStandardMaterial({
      map: makeOceanTexture(),
      color: 0x4896d8,
      roughness: 0.15,
      metalness: 0.28,
      envMapIntensity: 1.25,
      transparent: true,
      opacity: 0.95
    });
    const ocean = new THREE.Mesh(new THREE.CircleGeometry(24000, 128), oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(this.padCoords.x, this.padGroundY - 1.2, this.padCoords.y);
    this.earthSurface.add(ocean);
    this.earthOcean = ocean;
    this.earthOceanMat = oceanMat;

    // Grassland and coastal peninsula
    const groundMat = new THREE.MeshStandardMaterial({
      map: makeGrassTexture(),
      color: 0x5a8848,
      roughness: 0.88,
      metalness: 0.02,
      transparent: true,
      opacity: 1.0,
      polygonOffset: true,
      polygonOffsetFactor: 4,
      polygonOffsetUnits: 4
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(9200, 96), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(this.padCoords.x, this.padGroundY - 0.22, this.padCoords.y);
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
    const beach = new THREE.Mesh(new THREE.RingGeometry(8900, 9900, 128), beachMat);
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(this.padCoords.x, this.padGroundY - 0.45, this.padCoords.y);
    this.earthSurface.add(beach);
    this.earthBeachMat = beachMat;

    // Graded concrete apron around the launch complex - set beneath pad structures to prevent Z-fighting
    const apronMat = new THREE.MeshStandardMaterial({
      map: makeEarthConcreteTexture(),
      color: 0xced1cb,
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

    // Low rolling hills along the inland perimeter
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x3d662c,
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: 1.0
    });
    this.earthHillMat = hillMat;
    for (let i = 0; i < 42; i++) {
      const a = (i / 42) * Math.PI * 2;
      const r = 3400 + (i % 7) * 420;
      const hill = new THREE.Mesh(
        new THREE.ConeGeometry(320 + (i % 4) * 110, 85 + (i % 3) * 55, 16),
        hillMat
      );
      hill.position.set(
        this.padCoords.x + Math.cos(a) * r,
        this.padGroundY + 36,
        this.padCoords.y + Math.sin(a) * r
      );
      hill.rotation.y = a;
      this.earthSurface.add(hill);
    }

    // High-fidelity natural 3D tree system (realistic multi-tier conifers & leafy oak broadleafs)
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x4a3520,
      roughness: 0.95,
      transparent: true,
      opacity: 1.0
    });
    const pineMat = new THREE.MeshStandardMaterial({
      color: 0x1d4d28,
      roughness: 0.92,
      transparent: true,
      opacity: 1.0
    });
    const pineLightMat = new THREE.MeshStandardMaterial({
      color: 0x276335,
      roughness: 0.90,
      transparent: true,
      opacity: 1.0
    });
    const oakMat = new THREE.MeshStandardMaterial({
      color: 0x2e6d30,
      roughness: 0.88,
      transparent: true,
      opacity: 1.0
    });
    const shrubMat = new THREE.MeshStandardMaterial({
      color: 0x3c7e3e,
      roughness: 0.92,
      transparent: true,
      opacity: 1.0
    });

    this.earthTreeMaterials = [trunkMat, pineMat, pineLightMat, oakMat, shrubMat];
    this.earthTreeObstacles = [];

    const totalPines = 160;
    const totalOaks = 140;
    const totalShrubs = 120;

    // Conifer pine instancing: realistic tiered boughs
    const pineTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.8, 1.4, 18, 6), trunkMat, totalPines);
    const pineTier1Inst = new THREE.InstancedMesh(new THREE.ConeGeometry(6.8, 14, 7), pineMat, totalPines);
    const pineTier2Inst = new THREE.InstancedMesh(new THREE.ConeGeometry(5.2, 12, 7), pineLightMat, totalPines);
    const pineTier3Inst = new THREE.InstancedMesh(new THREE.ConeGeometry(3.6, 10, 7), pineMat, totalPines);

    // Oak broadleaf instancing: clustered organic leafy canopies
    const oakTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.2, 1.8, 14, 6), trunkMat, totalOaks);
    const oakCanopyInst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(9.0, 2), oakMat, totalOaks);
    const oakCanopy2Inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(7.2, 2), shrubMat, totalOaks);

    // Shrubbery instancing
    const shrubInst = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(3.2, 1), shrubMat, totalShrubs);

    const dummy = new THREE.Object3D();

    // Plant pines in natural woodland groves along the coast & hills
    for (let i = 0; i < totalPines; i++) {
      const angle = (i / totalPines) * Math.PI * 2 + (i % 9) * 0.22;
      const radius = 680 + (i % 23) * 110 + (Math.sin(i * 3.7) * 220);
      const x = this.padCoords.x + Math.cos(angle) * radius;
      const z = this.padCoords.y + Math.sin(angle) * radius;
      const scale = 0.75 + (i % 5) * 0.16 + (Math.cos(i) * 0.1);

      this.earthTreeObstacles.push({ x, z, radius: 1.8 });

      // Trunk
      dummy.position.set(x, this.padGroundY + 8.0 * scale, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      pineTrunkInst.setMatrixAt(i, dummy.matrix);

      // Tier 1 (base bough)
      dummy.position.set(x, this.padGroundY + 16.0 * scale, z);
      dummy.updateMatrix();
      pineTier1Inst.setMatrixAt(i, dummy.matrix);

      // Tier 2 (middle bough)
      dummy.position.set(x, this.padGroundY + 23.0 * scale, z);
      dummy.updateMatrix();
      pineTier2Inst.setMatrixAt(i, dummy.matrix);

      // Tier 3 (top bough)
      dummy.position.set(x, this.padGroundY + 29.0 * scale, z);
      dummy.updateMatrix();
      pineTier3Inst.setMatrixAt(i, dummy.matrix);
    }

    // Plant broadleaf oaks in lush meadows
    for (let i = 0; i < totalOaks; i++) {
      const angle = (i / totalOaks) * Math.PI * 2 + 0.45 + (i % 7) * 0.18;
      const radius = 580 + (i % 19) * 95 + (Math.cos(i * 2.3) * 160);
      const x = this.padCoords.x + Math.cos(angle) * radius;
      const z = this.padCoords.y + Math.sin(angle) * radius;
      const scale = 0.8 + (i % 6) * 0.14;

      this.earthTreeObstacles.push({ x, z, radius: 2.2 });

      // Trunk
      dummy.position.set(x, this.padGroundY + 6.5 * scale, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(0, angle + 0.5, 0);
      dummy.updateMatrix();
      oakTrunkInst.setMatrixAt(i, dummy.matrix);

      // Main rounded canopy
      dummy.position.set(x, this.padGroundY + 20.0 * scale, z);
      dummy.updateMatrix();
      oakCanopyInst.setMatrixAt(i, dummy.matrix);

      // Secondary canopy cluster
      dummy.position.set(x + 3.0 * scale, this.padGroundY + 24.0 * scale, z + 2.0 * scale);
      dummy.scale.set(scale * 0.85, scale * 0.85, scale * 0.85);
      dummy.updateMatrix();
      oakCanopy2Inst.setMatrixAt(i, dummy.matrix);
    }

    // Plant coastal shrubs & bushes
    for (let i = 0; i < totalShrubs; i++) {
      const angle = (i / totalShrubs) * Math.PI * 2 + (i % 11) * 0.35;
      const radius = 500 + (i % 29) * 75;
      const x = this.padCoords.x + Math.cos(angle) * radius;
      const z = this.padCoords.y + Math.sin(angle) * radius;
      const scale = 0.6 + (i % 4) * 0.25;

      dummy.position.set(x, this.padGroundY + 2.0 * scale, z);
      dummy.scale.set(scale, scale * 0.8, scale);
      dummy.rotation.set(0, angle * 1.5, 0);
      dummy.updateMatrix();
      shrubInst.setMatrixAt(i, dummy.matrix);
    }

    pineTrunkInst.instanceMatrix.needsUpdate = true;
    pineTier1Inst.instanceMatrix.needsUpdate = true;
    pineTier2Inst.instanceMatrix.needsUpdate = true;
    pineTier3Inst.instanceMatrix.needsUpdate = true;
    oakTrunkInst.instanceMatrix.needsUpdate = true;
    oakCanopyInst.instanceMatrix.needsUpdate = true;
    oakCanopy2Inst.instanceMatrix.needsUpdate = true;
    shrubInst.instanceMatrix.needsUpdate = true;

    this.earthSurface.add(
      pineTrunkInst, pineTier1Inst, pineTier2Inst, pineTier3Inst,
      oakTrunkInst, oakCanopyInst, oakCanopy2Inst, shrubInst
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

    // The transfer itself is owned by the scripted route, not by the local
    // planet environment. Keeping the current profile avoids a sky swap until
    // the entry interface is actually reached.
    this.pathStart.copy(this.physics.position);
    const destination = target === 'earth' ? this.earthAnchor : this.marsAnchor;
    const dir = destination.clone().sub(this.pathStart).normalize();
    this.pathEnd.copy(destination).addScaledVector(dir, -(target === 'earth' ? 6000 : 8000));

    // Half-ellipse with endpoints at departure and arrival. The chord is the
    // major axis and the perpendicular axis gives the visible gravitational
    // arc. A real Hohmann ellipse is tangential at both ends; the probe follows
    // a Kepler-scaled true anomaly so it slows near the apsides instead of
    // looking like a straight-line warp.
    this.pathCenter.copy(this.pathStart).lerp(this.pathEnd, 0.5);
    this.pathU.copy(this.pathEnd).sub(this.pathStart).normalize();
    const chord = this.pathStart.distanceTo(this.pathEnd);
    this.pathA = chord * 0.5;
    const up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(up.dot(this.pathU)) > 0.94) up.set(1, 0, 0);
    this.pathV.copy(up).addScaledVector(this.pathU, -up.dot(this.pathU)).normalize();
    const lateral = new THREE.Vector3().crossVectors(this.pathU, this.pathV).normalize();
    this.pathV.multiplyScalar(Math.cos(0.14)).addScaledVector(lateral, Math.sin(0.14)).normalize();
    this.pathB = Math.max(11000, chord * 0.18);

    // Earth arrival is bent through the Moon's position: a real lunar flyby
    // changes the arrival geometry, and the path bump makes that legible.
    this.flybyPoint = null;
    this.flybyBase = null;
    this.flybyDelta = null;
    if (target === 'earth' && this.moon?.position) {
      this.flybyPoint = this.moon.position.clone();
      this.flybyTheta = 2.44;
      const base = new THREE.Vector3()
        .copy(this.pathCenter)
        .addScaledVector(this.pathU, -Math.cos(this.flybyTheta) * this.pathA)
        .addScaledVector(this.pathV, Math.sin(this.flybyTheta) * this.pathB);
      this.flybyBase = base;
      this.flybyDelta = this.flybyPoint.clone().sub(base);
    }

    this._rebuildRouteGeometry();
    this.transferGroup.visible = true;
    this.transferTrail.material.opacity = 0.88;
    this.transferTube.material.opacity = 0.2;
    this.transferDots.material.opacity = 0.72;

    if (target === 'earth') {
      this.celestialGroup.visible = true;
      this.earth.visible = true;
      this.clouds.visible = true;
      this.earthGlow.visible = true;
      this.earthStar.visible = true;
      this.moon.visible = true;
      this.earth.scale.setScalar(this.earthBaseScale);
      this.clouds.scale.setScalar(this.earthBaseScale);
      this.earthGlow.scale.setScalar(this.earthBaseScale);
      this.moon.scale.setScalar(this.moonBaseScale);
      this.moon.position.set(
        this.earthAnchor.x - 38000,
        this.earthAnchor.y + 12000,
        this.earthAnchor.z + 44000
      );
      this.marsGlobe.visible = false;
      this.marsStar.visible = false;
    } else {
      // Mars is the arrival world for an Earth departure. Keep it a small
      // navigational target rather than a giant red sphere in the sky.
      this.marsGlobe.visible = true;
      this.marsGlobe.scale.setScalar(this.marsBaseScale * 1.8);
      this.marsGlobe.position.copy(this.marsAnchor);
      this.marsStar.visible = true;
      this.earthSurface.visible = false;
      this.earthSurfaceSatellites.group.visible = false;
    }
  }

  _marsAnchor() {
    return new THREE.Vector3(
      this.padCoords.x - 180000,
      this.padGroundY + 50000,
      this.padCoords.y - 120000
    );
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
    // Kepler's equation for a moderately eccentric transfer ellipse. The
    // parameter is the mean anomaly; the geometrical position is the true
    // anomaly, so the craft moves slowly near the ends and quicker at the
    // midpoint like a real heliocentric coast.
    const e = 0.48;
    const M = THREE.MathUtils.clamp(t, 0, 1) * Math.PI;
    let E = M;
    for (let i = 0; i < 6; i++) E = M + e * Math.sin(E);
    const theta = 2 * Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E * 0.5),
      Math.sqrt(1 - e) * Math.cos(E * 0.5)
    );
    out.copy(this.pathCenter)
      .addScaledVector(this.pathU, -Math.cos(theta) * this.pathA)
      .addScaledVector(this.pathV, Math.sin(theta) * this.pathB);

    if (this.flybyPoint) {
      const d = theta - this.flybyTheta;
      const bump = Math.exp(-(d * d) / (2 * 0.2 * 0.2));
      out.addScaledVector(this.flybyDelta, bump * 0.82);
    }
    return out;
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
      if (currentAltitude > 3200) {
        this.earthSurface.visible = false;
      } else {
        this.earthSurface.visible = true;
        const fade = currentAltitude <= 1200
          ? 1.0
          : Math.max(0.0, 1.0 - (currentAltitude - 1200) / 2000);

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

    this.earth.rotation.y += dt * 0.012;
    this.clouds.rotation.y += dt * 0.016;
    if (this.marsGlobe) this.marsGlobe.rotation.y += dt * 0.008;
    if (this.planetId !== 'earth' && this.moon) {
      this.moon.position.set(
        this.earthAnchor.x - 38000 + Math.sin(this.time * 0.004) * 9000,
        this.earthAnchor.y + 12000,
        this.earthAnchor.z + 44000 + Math.cos(this.time * 0.004) * 9000
      );
      this.moon.rotation.y += dt * 0.01;
    } else if (this.moon) {
      this.moon.rotation.y += dt * 0.008;
    }

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
    this.physics.missionTime += dt * timeScale;

    const t = this.progress;
    this._samplePath(t, this._pathPoint);
    this._sampleTangent(t, this._pathTangent);
    this.physics.position.copy(this._pathPoint);

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
    const helioSpeed = 32700 - 11200 * t;
    this.physics.speed = helioSpeed;
    this.physics.transferProgress = t;

    const burn = t < 0.055 || t > 0.952;
    this.vehicle.setStarshipThrottle(burn ? 0.9 : 0.0, true);
    this.vehicle.setReentryHeat(Math.max(0, Math.sin(t * Math.PI) * 0.045));

    // Real Astronomical Distance calculation (Earth-Mars ~225.4 million km = 1.507 AU)
    const totalDistKm = 225400000;
    const remainingKm = Math.round(totalDistKm * (1.0 - t));
    const distAu = (remainingKm / 149597870.7).toFixed(3);
    const speedKmS = (helioSpeed / 1000).toFixed(1);

    const pct = Math.round(t * 100);
    let status = `GRAVITATIONAL TRANSFER // ${pct}% · ${Math.round(remainingKm / 1000000)}M KM (${distAu} AU) · ${speedKmS} KM/S`;
    if (t < 0.07) status = `TRANS-${this.target === 'earth' ? 'MARS' : 'EARTH'} INJECTION // ${pct}% · ${distAu} AU`;
    if (this.target === 'earth' && this.moon) {
      const moonDist = this.physics.position.distanceTo(this.moon.position);
      if (t > 0.62 && moonDist < 30000) status = `LUNAR FLYBY GRAVITY ASSIST // ${Math.round(moonDist / 1000)} KM`;
    }
    if (t > 0.92) status = `ENTRY INTERFACE // TARGET: ${this.target.toUpperCase()} STARBASE`;
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
    this.setPlanet('mars');
  }
}
