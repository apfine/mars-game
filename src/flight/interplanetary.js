import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANET_PROFILES, getPlanetProfile } from './planetProfiles.js';
import { getEarthMaps, getMoonMap } from '../effects/earthMaps.js';
import { earthSurfaceHeight, earthCoastDistance, EARTH_RADIUS } from '../terrain/earthSurface.js';
import { buildEarthCities } from '../terrain/earthCities.js';
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
import { transferKind, wormholeTransit } from './relativity.js';

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

function makeGiantTexture(id) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (id === 'saturn') {
    for (let y = 0; y < 256; y++) {
      const latitude = (y - 128) / 128;
      const band = 0.5 * Math.sin(y * 0.105) + 0.28 * Math.sin(y * 0.029 + 1.3)
        + 0.12 * Math.sin(y * 0.29);
      const polar = Math.abs(latitude) * 12;
      const r = Math.round(213 + band * 11 - polar);
      const g = Math.round(194 + band * 13 - polar * 0.9);
      const b = Math.round(158 + band * 12 - polar * 0.8);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, y, 512, 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }
  const palette = id === 'jupiter' ? ['#b98b68','#e7d0ad','#a66c51','#f0dfc1','#7f5647']
    : id === 'saturn' ? ['#d7c69f','#ece0bd','#bca77e','#e4d5a9']
      : id === 'uranus' ? ['#90c5c9','#b5dfe0','#78aeb8'] : ['#315aaf','#4d78c5','#27458f'];
  for (let y = 0; y < 256; y += 2) {
    const wave = Math.sin(y * .19) * 3 + Math.sin(y * .057) * 6;
    ctx.fillStyle = palette[Math.abs(Math.floor((y + wave) / 15)) % palette.length];
    ctx.fillRect(0, y, 512, 2);
  }
  if (id === 'jupiter') {
    ctx.fillStyle = '#a76854'; ctx.beginPath(); ctx.ellipse(370, 153, 48, 17, -.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#efd6b7'; ctx.lineWidth = 5; ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeNavigationGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(64, 64, 1, 64, 64, 64);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.08, 'rgba(255,255,255,0.96)');
  glow.addColorStop(0.22, 'rgba(255,255,255,0.45)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function makeInnerPlanetTexture(id) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = id === 'venus' ? '#d8bd87' : '#77716a';
  ctx.fillRect(0, 0, 512, 256);
  let seed = id === 'venus' ? 23 : 11;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  if (id === 'venus') {
    for (let y = 0; y < 256; y += 4) {
      ctx.fillStyle = `rgba(250,232,190,${.12 + random() * .24})`;
      ctx.fillRect(0, y + Math.sin(y * .035) * 3, 512, 2 + random() * 4);
    }
  } else {
    for (let i = 0; i < 950; i++) {
      const x = random() * 512, y = random() * 256, r = 1 + random() * 8;
      ctx.strokeStyle = `rgba(35,31,30,${.08 + random() * .2})`;
      ctx.lineWidth = 1 + random() * 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeGrassTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 512;
  const g = cv.getContext('2d');
  // Neutral detail map: biome colours come from terrain vertices. Multiplying
  // a green texture by green vertex colours made the entire coast nearly black.
  g.fillStyle = '#e9e9dc';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3000; i++) {
    const shade = 120 + Math.random() * 90;
    g.fillStyle = `rgba(${shade},${shade + 4},${shade - 8},${0.08 + Math.random() * 0.17})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 4, 1 + Math.random() * 4);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  return tex;
}

function makeLeafCluster(radius) {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.39996;
    const reach = i === 0 ? 0 : radius * (0.38 + (i % 3) * 0.055);
    const lobe = new THREE.IcosahedronGeometry(radius * (i === 0 ? 0.73 : 0.50), 1);
    lobe.scale(1.13, 0.82 + (i % 3) * 0.08, 0.96);
    lobe.translate(Math.cos(angle) * reach, Math.sin(i * 2.7) * radius * 0.18, Math.sin(angle) * reach);
    parts.push(lobe);
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged;
}

function makeOceanTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#0b5b89';
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
  tex.repeat.set(360, 360);
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
    this.routeKind = 'kepler';

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
      const giant = ['jupiter','saturn','uranus','neptune'].includes(body.id);
      const inner = body.id === 'mercury' || body.id === 'venus';
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48),
        new THREE.MeshStandardMaterial({ color: giant || inner ? 0xffffff : body.color,
          map: giant ? makeGiantTexture(body.id) : inner ? makeInnerPlanetTexture(body.id) : null,
          roughness: 0.9, fog: false }));
      if (body.id === 'saturn' || body.id === 'uranus') {
        const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.35, radius * (body.id === 'saturn' ? 2.35 : 1.9), 256),
          new THREE.MeshBasicMaterial({ color: body.id === 'saturn' ? 0xc8b58a : 0x91aeb1,
            transparent: true, opacity: .72, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = body.id === 'saturn' ? -0.45 : -1.2;
        mesh.add(ring);
      }
      this.solarBodies.set(body.id, mesh);
      const atmoTint = { venus: [1.0, 0.78, 0.45, 0.9], mars: [0.95, 0.62, 0.45, 0.45], jupiter: [0.85, 0.7, 0.55, 0.5],
        saturn: [0.9, 0.8, 0.6, 0.5], uranus: [0.55, 0.9, 0.95, 0.8], neptune: [0.3, 0.5, 1.0, 0.9] }[body.id];
      if (atmoTint) {
        // Limb-brightened Fresnel haze, sun-side weighted, so the disk reads as
        // a real world with an atmosphere instead of a flat shaded ball.
        const haze = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.035, 64, 48), new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.FrontSide,
          uniforms: { uTint: { value: new THREE.Vector4(...atmoTint) } },
          vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
          fragmentShader: 'uniform vec4 uTint; varying vec3 vN; varying vec3 vW; void main(){ vec3 v=normalize(cameraPosition-vW); float f=pow(1.0-abs(dot(normalize(vN),v)),3.2); gl_FragColor=vec4(uTint.rgb*f*uTint.a*0.8, f*0.85); }'
        }));
        mesh.add(haze);
      }
      this.celestialGroup.add(mesh);
    }
    // At astronomical distances a true planetary disk occupies less than a
    // pixel. A faint optical point source preserves visibility without
    // changing the planet's physical radius or transfer geometry.
    this.navigationMarkers = new Map();
    this._locatorPoint = new THREE.Vector3();
    const markerTexture = makeNavigationGlowTexture();
    for (const body of [...SOLAR_BODIES, { id: 'moon', color: 0xd4d7dd }]) {
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({
        map: markerTexture, color: body.color, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      marker.visible = false;
      this.navigationMarkers.set(body.id, marker);
      this.celestialGroup.add(marker);
    }
    this._buildGargantuaVisuals();
    this._solarPhases = new Map(SOLAR_BODIES.map((b, i) => [b.id, i * 0.81]));
    this._configureSolarFrame(this.physics.position);
    this.moonOrbitRing = null;
  }

  _buildGargantuaVisuals() {
    this.gargantuaGroup = new THREE.Group();
    this.scene.add(this.gargantuaGroup);
    this.gargantuaGroup.visible = false;
    // Analytic, loop-free approximation of Gargantua (cf. DNGR/Interstellar):
    // opaque shadow, razor photon ring, Doppler-beamed turbulent accretion disk
    // with differential rotation, and the gravitationally lensed far side of the
    // disk arching over and under the shadow. Premultiplied emission over an
    // opaque shadow keeps it cheap (single quad, no ray marching).
    const blackHoleMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
        float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
        float fbm(vec2 p){return vn(p)*0.5+vn(p*2.03+7.1)*0.28+vn(p*4.1+3.7)*0.14+vn(p*8.3+1.3)*0.08;}
        vec3 ramp(float t){ // blackbody-like: deep orange -> gold -> hot white
          t=clamp(t,0.0,1.0);
          return mix(mix(vec3(0.30,0.07,0.015),vec3(1.0,0.50,0.14),smoothstep(0.0,0.45,t)),
                     mix(vec3(1.0,0.50,0.14),vec3(1.0,0.90,0.74),smoothstep(0.45,1.0,t)),step(0.45,t));}
        // Disk emission at disk-plane radius rho (in shadow radii) and azimuth phi.
        vec3 disk(float rho,float phi,float sx,float seed){
          float inner=smoothstep(1.02,1.22,rho), outer=1.0-smoothstep(2.6,4.4,rho);
          float temp=pow(1.0/max(rho,0.5),0.85);
          float om=1.0/(pow(rho,1.5)+0.3); // Keplerian shear
          float ph=phi+uTime*2.6*om;
          vec2 q=vec2(ph*2.2,rho*5.5);
          float n=fbm(q+seed)*0.75+fbm(vec2(ph*7.0,rho*16.0)-seed)*0.45;
          float arms=pow(max(0.0,sin(ph*3.0+rho*4.5)),5.0)*0.9;
          float streak=0.22+1.55*smoothstep(0.22,0.95,n)+arms;
          float beam=pow(clamp(1.0+0.62*sx/max(rho,1.0),0.15,1.9),3.0); // Doppler beaming
          vec3 c=ramp(temp*1.25*mix(0.82,1.18,clamp(sx*0.5+0.5,0.0,1.0)))*temp*2.4;
          return c*streak*beam*inner*outer;}
        void main(){
          vec2 p=(vUv-0.5)*2.0; p.x*=1.575;
          float R=0.30; vec2 s=p/R; float r=length(s); float a=atan(s.y,s.x);
          float shadow=1.0-smoothstep(0.985,1.0,r);
          vec3 col=vec3(0.0);
          // Direct disk (inclined ~6deg): near half crosses in front of the shadow.
          vec2 d=vec2(s.x,(s.y+0.10)*5.2);
          float rhoD=length(d); float phiD=atan(d.y,d.x);
          float thick=exp(-pow(d.y*0.0+(s.y+0.10-0.0)*0.0,2.0));
          float frontMask=step(0.0,-(s.y+0.10))+step(1.0,abs(s.x));
          float vert=smoothstep(0.0,0.05,abs(s.y+0.10)+0.05*rhoD/ max(rhoD,1.0));
          col+=disk(rhoD,phiD,s.x/ max(rhoD,0.01)*rhoD,1.7)*clamp(frontMask,0.0,1.0)*(1.0-shadow)*1.0;
          // Lensed far-side image: wraps the shadow, thickness shrinks away from it.
          float lensR=1.0+ (r-1.0);
          float up=max(s.y+0.06,0.0), dn=max(-s.y-0.20,0.0);
          float arc=exp(-(r-1.03)*3.4)*smoothstep(1.0,1.05,r)*(1.0-smoothstep(1.9,2.9,r));
          float rhoL=1.0+(r-1.0)*2.6+0.15; // image radius maps to larger disk radius
          float pos=smoothstep(-0.3,0.9,s.y);
          vec3 up3=disk(rhoL,a*1.0,s.x*0.9,5.3)*arc*(0.35+0.9*pos);
          vec3 dn3=disk(rhoL*1.1,-a,s.x*0.9,9.1)*arc*(1.0-pos)*0.35*smoothstep(0.0,0.7,-s.y);
          col+=up3+dn3;
          // Photon ring (razor thin) + soft secondary ring + faint lensed halo.
          float ring=exp(-pow((r-1.035)/0.012,2.0))*1.5+exp(-pow((r-1.09)/0.05,2.0))*0.22;
          float ringBeam=0.75+0.5*clamp(s.x/ max(r,0.01)*0.5+0.5,0.0,1.0);
          col+=vec3(1.0,0.82,0.58)*ring*ringBeam;
          col+=vec3(0.55,0.62,0.80)*exp(-pow((r-1.35)/0.45,2.0))*0.05;
          col*=1.0-shadow;
          float edge=1.0-smoothstep(0.78,1.0,max(abs(vUv.x-0.5),abs(vUv.y-0.5))*2.0);
          col*=edge;
          gl_FragColor=vec4(col,shadow*edge);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    this.gargantuaBillboard = new THREE.Mesh(new THREE.PlaneGeometry(85000, 54000), blackHoleMaterial);
    this.gargantuaBillboard.frustumCulled = false;
    this.gargantuaGroup.add(this.gargantuaBillboard);
    // Ellis-style wormhole: the throat shows the other universe (refracted,
    // mirrored sky) while the rim shows our own sky smeared by lensing, with a
    // bright Einstein ring at the transition and chromatic dispersion.
    this.wormhole = new THREE.Mesh(new THREE.SphereGeometry(950, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uFarSide: { value: 1 },
          uAxis: { value: new THREE.Vector3(0, 0.14, 1).normalize() } },
        vertexShader: `varying vec3 vNormal; varying vec3 vView; varying vec3 vWorld; varying vec3 vCenter; varying float vRadius;
        void main(){
          vec4 world = modelMatrix * vec4(position,1.0);
          vWorld = world.xyz; vCenter = (modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
          vRadius = length(modelMatrix[0].xyz)*950.0;
          vNormal = normalize(mat3(modelMatrix) * normal);
          vView = normalize(cameraPosition-world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
        fragmentShader: `uniform float uTime; uniform float uFarSide; uniform vec3 uAxis;
          varying vec3 vNormal; varying vec3 vView; varying vec3 vWorld; varying vec3 vCenter; varying float vRadius;
          float h13(vec3 p){p=fract(p*0.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
          float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
            return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
                       mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z);}
          vec3 stars(vec3 d,float sc,float thr){
            vec3 c=floor(d*sc); vec3 f=fract(d*sc)-0.5; float h=h13(c);
            float s=step(thr,h)*pow(max(0.0,1.0-length(f)*2.2),6.0);
            vec3 tint=mix(vec3(1.0,0.72,0.55),vec3(0.65,0.8,1.0),h13(c+9.7));
            return tint*s*(0.6+1.6*h13(c+3.1));}
          vec3 sky(vec3 d,float seed,float far){
            vec3 col=stars(d,60.0,0.93)+stars(d,140.0,0.95)*0.8+stars(d,320.0,0.965)*0.6;
            float neb=n3(d*2.3+seed)*0.6+n3(d*5.1-seed)*0.3;
            col+=mix(vec3(0.02,0.03,0.07),vec3(0.07,0.04,0.09),n3(d*1.7+seed*2.0))*pow(neb,2.2)*2.2;
            float band=exp(-pow((d.y+0.2*sin(d.x*2.2+seed))*4.0,2.0));
            col+=vec3(0.05,0.055,0.075)*band*(0.5+n3(d*9.0));
            // Gargantua seen through the far mouth (lensed disk ring + shadow).
            vec2 g=d.xy-vec2(0.05,0.03); float gr=length(g);
            float gdisk=exp(-pow((d.y-0.03+0.0)*30.0,2.0))*smoothstep(0.08,0.12,abs(d.x-0.05))*(1.0-smoothstep(0.24,0.34,abs(d.x-0.05)));
            float gring=exp(-pow((gr-0.085)/0.006,2.0))+exp(-pow((gr-0.11)/0.04,2.0))*0.25;
            vec3 gc=vec3(1.0,0.55,0.2)*(gdisk*0.9+gring*1.2);
            col=mix(col,col*(1.0-(1.0-smoothstep(0.075,0.085,gr))),far)+gc*far*step(0.0,d.z+1.0);
            return col;}
          // Interstellar-style throat: a spiralling tunnel of lensed starlight
          // streaming past, warm gold bands, and the other universe as a
          // blazing disc dead ahead.
          vec3 tlayer(float z,float sw){
            float u=sw/6.2831853*28.0;
            vec2 cell=vec2(mod(floor(u),28.0),floor(z*1.7));
            vec2 f=vec2(fract(u)-0.5,fract(z*1.7));
            float h=h13(vec3(cell,3.0));
            float streak=step(0.80,h)*smoothstep(0.5,0.05,abs(f.x))*smoothstep(0.0,0.2,f.y)*smoothstep(1.0,0.35,f.y);
            vec3 tint=mix(vec3(1.0,0.78,0.5),vec3(0.6,0.8,1.0),h13(vec3(cell,9.0)));
            float cl=n3(vec3(cos(sw),sin(sw),z*0.32)*2.0)*0.7+n3(vec3(cos(sw),sin(sw),z*0.9)*4.0+5.0)*0.3;
            float bands=0.5+0.5*sin(sw*3.0+z*1.1);
            vec3 nebula=mix(vec3(0.015,0.04,0.16),vec3(0.38,0.14,0.52),cl)*(0.25+bands*0.9)*cl*1.4;
            nebula+=vec3(1.0,0.62,0.28)*pow(max(0.0,sin(sw*5.0+z*0.7)),18.0)*0.45;
            return nebula+tint*streak*2.2;
          }
          vec3 tunnel(vec3 rd){
            float c=clamp(dot(rd,uAxis),-1.0,1.0);
            float r=tan(acos(c)*0.5);
            vec3 side=normalize(cross(uAxis,vec3(0.0,1.0,0.0)));
            vec3 upv=cross(side,uAxis);
            float phi=atan(dot(rd,upv),dot(rd,side));
            float z=0.45/max(r,0.04)-uTime*2.2;
            float sw=phi+z*0.28+uTime*0.22;
            vec3 col=vec3(tlayer(z*1.03,sw).r,tlayer(z,sw).g,tlayer(z*0.97,sw).b);
            col*=smoothstep(0.03,0.45,r)*(1.0+0.9/(0.4+r*r*3.0));
            vec3 ahead=sky(rd,1.7,uFarSide)*1.5+vec3(0.55,0.7,1.0)*0.5;
            col=mix(col,ahead,smoothstep(0.26,0.12,r));
            col+=vec3(0.9,0.95,1.0)*exp(-pow((r-0.20)/0.018,2.0))*1.4;
            col+=vec3(0.45,0.6,1.0)*exp(-r*2.5)*0.28;
            return col;
          }
          void main(){
            vec3 n=normalize(vNormal); vec3 v=normalize(vView);
            bool inside=distance(cameraPosition,vCenter)<vRadius*0.995;
            vec3 rdInside=normalize(vWorld-cameraPosition);
            float facing=clamp(dot(n,v),0.0,1.0);
            float b=sqrt(max(0.0,1.0-facing*facing)); // impact parameter 0..1
            // Gravitational deflection: strong near the throat edge, weak at center.
            float defl=0.28+1.55*pow(b,3.0);
            vec3 refr=normalize(refract(-v,n,0.55)+n*(-0.2));
            vec3 other=normalize(mix(-v,refr,0.75)+cross(n,v)*0.04*sin(uTime*0.2));
            vec3 rim=normalize(reflect(-v,n)*(0.4+defl*0.5)+n*0.5+vec3(0.0,0.0,sin(b*6.0)*0.06));
            float split=smoothstep(0.78,0.90,b); // 0: far-universe center, 1: own-sky rim
            // chromatic dispersion of the lensed rim
            vec3 colO=sky(other,1.7,uFarSide);
            vec3 rimR=sky(normalize(rim+vec3(0.014,0.0,0.0)),4.2,0.0);
            vec3 rimG=sky(rim,4.2,0.0);
            vec3 rimB=sky(normalize(rim-vec3(0.014,0.0,0.0)),4.2,0.0);
            vec3 colR=vec3(rimR.r,rimG.g,rimB.b);
            vec3 col=mix(colO,colR,split);
            // Einstein ring + throat glow
            float ring=exp(-pow((b-0.84)/0.018,2.0));
            col+=vec3(0.85,0.92,1.0)*ring*1.15;
            col+=vec3(0.30,0.45,0.75)*exp(-pow((b-0.80)/0.12,2.0))*0.10;
            col+=vec3(0.45,0.58,0.72)*pow(b,6.0)*0.45; // limb brightening
            col*=0.55+0.45*smoothstep(0.0,0.2,facing+0.1);
            if(inside) col=tunnel(rdInside);
            gl_FragColor=vec4(col,1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`, fog: false, side: THREE.DoubleSide
      }));
    this.wormhole.visible = false;
    this.scene.add(this.wormhole);
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
    oceanMat.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vEarthLocalXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEarthLocalXZ = position.xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vEarthLocalXZ;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          float coast = 2300.0 + sin(vEarthLocalXZ.y * 0.00045) * 650.0
            + sin(vEarthLocalXZ.y * 0.0013) * 170.0 - vEarthLocalXZ.x;
          if (coast >= 0.0) discard;`);
    };
    // Entry is still hundreds of kilometres downrange at 15–20 km altitude.
    // Keep the curved ocean beyond the visible horizon throughout descent.
    const oceanGeo = new THREE.PlaneGeometry(1600000, 1600000, 160, 160);
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
    // The regional and detailed grids share a material. Clip both to the
    // coastline and leave the concrete apron free of grass at every camera
    // height; otherwise the submerged grid flickers through the ocean and
    // the ground bleeds over the Starbase floor.
    groundMat.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vEarthLocalXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEarthLocalXZ = position.xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vEarthLocalXZ;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          float coast = 2300.0 + sin(vEarthLocalXZ.y * 0.00045) * 650.0
            + sin(vEarthLocalXZ.y * 0.0013) * 170.0 - vEarthLocalXZ.x;
          if (coast < 0.0 || length(vEarthLocalXZ) < 490.0) discard;`);
    };

    const makeGroundGeometry = (size, segments, centerHole = 0) => {
      const geo = new THREE.PlaneGeometry(size, size, segments, segments);
      geo.rotateX(-Math.PI / 2);
      const positions = geo.attributes.position;
      const colors = new Float32Array(positions.count * 3);
      const sand = new THREE.Color(0xcbb991);
      const meadow = new THREE.Color(0x729553);
      const woodland = new THREE.Color(0x456d3e);
      const color = new THREE.Color();
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), z = positions.getZ(i);
        const coast = earthCoastDistance(x, z);
        positions.setY(i, earthSurfaceHeight(x, z));
        const inland = THREE.MathUtils.smoothstep(coast, -130, 420);
        const woodlandMix = THREE.MathUtils.smoothstep(coast, 900, 3000) *
          (0.28 + 0.22 * Math.sin(x * 0.0021) * Math.cos(z * 0.0017));
        color.copy(sand).lerp(meadow, inland).lerp(woodland, woodlandMix);
        const variation = 0.93 + 0.09 * Math.sin(x * 0.008) * Math.cos(z * 0.006);
        color.multiplyScalar(variation);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      if (centerHole) {
        const source = geo.getIndex();
        const kept = [];
        for (let i = 0; i < source.count; i += 3) {
          const a = source.getX(i), b = source.getX(i + 1), c = source.getX(i + 2);
          const x = (positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3;
          const z = (positions.getZ(a) + positions.getZ(b) + positions.getZ(c)) / 3;
          if (Math.abs(x) < centerHole && Math.abs(z) < centerHole) continue;
          kept.push(a, b, c);
        }
        geo.setIndex(kept);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      return geo;
    };
    const groundGeo = makeGroundGeometry(40000, 256, 3125);

    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(this.padCoords.x, this.padGroundY, this.padCoords.y);
    ground.receiveShadow = true;
    this.earthSurface.add(ground);
    this.earthGround = ground;
    this.earthGroundMat = groundMat;

    // Resolve the walkable landscape around Starbase at 20 m instead of the
    // 156 m regional grid. Both meshes sample the same collision height.
    const nearGround = new THREE.Mesh(makeGroundGeometry(6250, 250), groundMat);
    nearGround.position.set(this.padCoords.x, this.padGroundY, this.padCoords.y);
    nearGround.receiveShadow = true;
    this.earthSurface.add(nearGround);
    this.earthNearGround = nearGround;

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

    // The apron is the visible contact surface inside the grass cutout.
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
    apron.position.set(this.padCoords.x, this.padGroundY + 0.02, this.padCoords.y);
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
    const mapleRedMat = new THREE.MeshStandardMaterial({ color: 0x5e803d, roughness: 0.86, transparent: true, opacity: 1.0 });
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
    const oakDome1Inst = new THREE.InstancedMesh(makeLeafCluster(9.0), oakGreenMat, countOak);
    const oakDome2Inst = new THREE.InstancedMesh(makeLeafCluster(7.2), birchLeafMat, countOak);

    // Archetype 4: Mediterranean Cypress (slender columnar spire)
    const cypressTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.9, 6, 6), barkDarkMat, countCypress);
    const cypressSpireInst = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 26, 8), cypressMat, countCypress);

    // Archetype 5: Weeping Willow (umbrella + cascading fronds)
    const willowTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.2, 1.7, 12, 6), barkDarkMat, countWillow);
    const willowDomeInst = new THREE.InstancedMesh(makeLeafCluster(9.5), willowMat, countWillow);

    // Archetype 6: Autumn Red Maple (vibrant orange-crimson canopy)
    const mapleTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 1.4, 15, 6), barkDarkMat, countMaple);
    const mapleCanopyInst = new THREE.InstancedMesh(makeLeafCluster(8.2), mapleRedMat, countMaple);

    // Archetype 7: Silver Birch / Aspen (slender pale trunk + airy fluttering foliage)
    const birchTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.8, 20, 6), barkSilverMat, countBirch);
    const birchCanopyInst = new THREE.InstancedMesh(makeLeafCluster(6.8), birchLeafMat, countBirch);

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
    const magnoliaCanopyInst = new THREE.InstancedMesh(makeLeafCluster(7.0), magnoliaMat, countMagnolia);
    const magnoliaBloomInst = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(3.4, 1), flowerBlossomMat, countMagnolia);

    const dummy = new THREE.Object3D();

    // Helper to evaluate carved surface height for tree placement
    const sampleCarvedY = (vx, vz) => this.padGroundY + earthSurfaceHeight(vx, vz);
    const landCoords = (angle, radius) => {
      const z = Math.sin(angle) * radius;
      const x = Math.cos(angle) * radius;
      const shoreSetback = 80 + 220 * (0.5 + 0.5 * Math.sin(angle * 37 + radius * 0.013));
      return [x - Math.max(0, shoreSetback - earthCoastDistance(x, z)), z];
    };

    // 1. Plant Palms along coastal beaches & peninsulas
    for (let i = 0; i < countPalm; i++) {
      const angle = (i / countPalm) * Math.PI * 2 + (i % 7) * 0.2;
      const radius = 6200 + (i % 23) * 95 + Math.sin(i * 3.1) * 240;
      const [vx, vz] = landCoords(angle, radius);
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
      const [vx, vz] = landCoords(angle, radius);
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
      const [vx, vz] = landCoords(angle, radius);
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
      const [vx, vz] = landCoords(angle, radius);
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
      const [vx, vz] = landCoords(angle, radius);
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
      const [vx, vz] = landCoords(angle, radius);
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
      const [vx, vz] = landCoords(angle, radius);
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
      const [vx, vz] = landCoords(angle, radius);
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
      const [vx, vz] = landCoords(angle, radius);
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
      const [vx, vz] = landCoords(angle, radius);
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

    // Low vegetation fills the open ground beyond the clear launch apron.
    // A single instanced mesh keeps this dense coastal cover inexpensive.
    const shrubCount = 1800;
    const shrubs = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 1 }),
      shrubCount
    );
    const shrubColors = [0x54753c, 0x6e8c48, 0x45673b, 0x8b9c55].map(v => new THREE.Color(v));
    const fract = v => v - Math.floor(v);
    let planted = 0;
    for (let i = 0; i < shrubCount * 5 && planted < shrubCount; i++) {
      const angle = fract(Math.sin(i * 127.1 + 19.3) * 43758.5453) * Math.PI * 2;
      const radius = Math.sqrt(0.045 + fract(Math.sin(i * 78.233 + 91.7) * 9628.234) * 0.955) * 2700;
      const vx = Math.cos(angle) * radius;
      const vz = Math.sin(angle) * radius;
      if (radius < 530 || earthCoastDistance(vx, vz) < 60) continue;
      const size = 1.5 + fract(Math.sin(i * 17.41) * 7241.8) * 2.4;
      const height = size * (0.45 + fract(Math.sin(i * 4.13) * 914.2) * 0.25);
      dummy.position.set(this.padCoords.x + vx, sampleCarvedY(vx, vz) + height * 0.75, this.padCoords.y + vz);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.set(size, height, size);
      dummy.updateMatrix();
      shrubs.setMatrixAt(planted, dummy.matrix);
      shrubs.setColorAt(planted, shrubColors[i % shrubColors.length]);
      planted++;
    }
    shrubs.count = planted;
    shrubs.instanceMatrix.needsUpdate = true;
    if (shrubs.instanceColor) shrubs.instanceColor.needsUpdate = true;
    this.earthSurface.add(shrubs);
    this.earthTreeMaterials.push(shrubs.material);

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

    // Inland cities: distant skylines with lit windows and street grids.
    this.earthCities = buildEarthCities({
      padCoords: this.padCoords,
      padGroundY: this.padGroundY,
      surfaceHeight: earthSurfaceHeight,
      coastDistance: earthCoastDistance
    });
    this.earthSurface.add(this.earthCities);
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
    // Flowing cryogenic umbilical: bright slugs of LOX / methane travel along
    // the line toward the ship while a frost sheath breathes.
    this.tankerHose = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 1, 14, 1, true),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uFlow: { value: 0 }, uLen: { value: 1 } },
        vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `uniform float uTime,uFlow,uLen; varying vec2 vUv;
          void main(){
            float y=vUv.y*uLen;
            float slug=pow(0.5+0.5*sin(y*0.55-uTime*14.0*uFlow),6.0);
            float slug2=pow(0.5+0.5*sin(y*0.9-uTime*9.0*uFlow+2.0),8.0);
            float ring=0.5+0.5*sin(vUv.x*6.2831853*3.0);
            vec3 lox=vec3(0.45,0.85,1.0), ch4=vec3(1.0,0.72,0.45);
            vec3 col=lox*(0.35+slug*1.6*uFlow)+ch4*slug2*0.9*uFlow;
            float a=0.5+0.35*ring+0.4*uFlow;
            gl_FragColor=vec4(col,clamp(a*(0.55+uFlow*0.45),0.0,1.0));
          }`
      })
    );
    this.tankerHose.visible = false;
    this.tankerFleet.add(this.tankerHose);

    const gcv = document.createElement('canvas'); gcv.width = gcv.height = 64;
    const gg = gcv.getContext('2d');
    const grad = gg.createRadialGradient(32, 32, 1, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(170,220,255,0.55)');
    grad.addColorStop(1, 'rgba(60,120,255,0)');
    gg.fillStyle = grad; gg.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(gcv); glowTex.colorSpace = THREE.SRGBColorSpace;
    const mkGlow = (color) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      sp.visible = false; sp.renderOrder = 20; this.tankerFleet.add(sp); return sp;
    };
    this.dockGlowShip = mkGlow(0xb8e8ff);
    this.dockGlowTanker = mkGlow(0xb8e8ff);
    this.tankerRcsA = mkGlow(0xffffff);
    this.tankerRcsB = mkGlow(0xcfe6ff);
    this._dockFlash = 0;
    this._lastTankerPhase = 'idle';
    this._hoseFlow = 0;

    // Venting cryogenic mist at the coupling.
    const MIST = 90;
    this._mist = { n: MIST, vel: new Float32Array(MIST * 3), life: new Float32Array(MIST),
      pos: new Float32Array(MIST * 3), alpha: new Float32Array(MIST) };
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(this._mist.pos, 3));
    mg.setAttribute('aAlpha', new THREE.BufferAttribute(this._mist.alpha, 1));
    this.tankerMist = new THREE.Points(mg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `attribute float aAlpha; varying float vA;
        void main(){ vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=min(90.0, (1.5+aAlpha*7.0)*900.0/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; void main(){
          float d=length(gl_PointCoord-0.5)*2.0; float a=smoothstep(1.0,0.0,d)*vA*0.5;
          gl_FragColor=vec4(vec3(0.75,0.9,1.0),a); }`
    }));
    this.tankerMist.frustumCulled = false; this.tankerMist.visible = false; this.tankerMist.renderOrder = 19;
    this.tankerFleet.add(this.tankerMist);
  }

  _updateDockingFx(dt, active, docked) {
    if (!this.tankerMist || !active) return;
    const phase = this.tankerPhase;
    if (phase !== this._lastTankerPhase) {
      if (phase === 'docked') this._dockFlash = 1;
      this._lastTankerPhase = phase;
    }
    this._dockFlash = Math.max(0, this._dockFlash - dt * 1.4);
    const flowTarget = phase === 'transfer' ? 1 : docked ? 0.12 : 0;
    this._hoseFlow += (flowTarget - this._hoseFlow) * Math.min(1, dt * 3);
    const u = this.tankerHose.material.uniforms;
    u.uTime.value = this.time; u.uFlow.value = this._hoseFlow;
    const dock = active.userData.dock;
    u.uLen.value = Math.hypot(dock.x, dock.y - 10, dock.z);

    // Coupling lights: pulse while connected, flash when the latches close.
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 6);
    const lit = docked ? 1 : 0;
    for (const [g, p] of [[this.dockGlowShip, new THREE.Vector3(0, 10, 0)], [this.dockGlowTanker, dock]]) {
      g.visible = lit > 0 || this._dockFlash > 0;
      g.position.copy(p);
      g.material.opacity = Math.min(1, lit * (0.35 + 0.4 * this._hoseFlow) * pulse + this._dockFlash);
      g.scale.setScalar(5 + this._dockFlash * 26 + this._hoseFlow * 3);
    }

    // Approach: cold-gas RCS puffs on the tanker, firing in staggered bursts.
    const approaching = phase === 'rendezvous' || phase === 'soft-dock';
    for (let i = 0; i < 2; i++) {
      const g = i ? this.tankerRcsB : this.tankerRcsA;
      const on = approaching && Math.sin(this.time * 9 + i * 2.4) > -0.2 && Math.random() > 0.25;
      g.visible = on;
      if (on) {
        g.position.copy(active.position).add(new THREE.Vector3(i ? -6 : 6, i ? 8 : -4, i ? -5 : 7));
        g.material.opacity = 0.5 + Math.random() * 0.4;
        g.scale.setScalar(5 + Math.random() * 4);
      }
    }

    // Venting mist: spawns at the coupling during flow and on latch-up.
    const m = this._mist;
    const spawnRate = (this._hoseFlow * 55 + this._dockFlash * 160) * dt;
    let spawn = spawnRate;
    let any = false;
    for (let i = 0; i < m.n; i++) {
      if (m.life[i] <= 0 && spawn > 0 && (spawn >= 1 || Math.random() < spawn)) {
        spawn -= 1;
        m.life[i] = 1.2 + Math.random() * 1.6;
        const o = Math.random() < 0.5 ? dock : this._dockShipPoint || (this._dockShipPoint = new THREE.Vector3(0, 10, 0));
        m.pos[i * 3] = o.x; m.pos[i * 3 + 1] = o.y; m.pos[i * 3 + 2] = o.z;
        const sp = 5 + Math.random() * 9;
        const a = Math.random() * Math.PI * 2, b = Math.random() * 2 - 1, r = Math.sqrt(1 - b * b);
        m.vel[i * 3] = Math.cos(a) * r * sp; m.vel[i * 3 + 1] = b * sp; m.vel[i * 3 + 2] = Math.sin(a) * r * sp;
      }
      if (m.life[i] > 0) {
        m.life[i] -= dt; any = true;
        for (let k = 0; k < 3; k++) { m.pos[i * 3 + k] += m.vel[i * 3 + k] * dt; m.vel[i * 3 + k] *= 1 - 0.8 * dt; }
        m.alpha[i] = Math.max(0, Math.min(1, m.life[i] / 1.4));
      } else m.alpha[i] = 0;
    }
    this.tankerMist.visible = any;
    if (any) {
      this.tankerMist.geometry.attributes.position.needsUpdate = true;
      this.tankerMist.geometry.attributes.aAlpha.needsUpdate = true;
    }
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
        } else if (this.tankerPhase === 'soft-dock') {
          ship.position.copy(approach).lerp(dock, THREE.MathUtils.smoothstep(this.tankerProgress, 0, 1));
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

    this._updateDockingFx(dt, active, docked);
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
    this._alignTargetQuaternion = new THREE.Quaternion();
    this._alignStartQuaternion = new THREE.Quaternion();
    this._tangentA = new THREE.Vector3();
    this._tangentB = new THREE.Vector3();
    this._upAxis = new THREE.Vector3(0, 1, 0);
    this._flightDir = new THREE.Vector3();
    this._toDestination = new THREE.Vector3();
    this.flybyPoint = null;
    this.flybyBase = null;
    this.flybyDelta = null;
    this.arrivalOffset = new THREE.Vector3();
    this.arrivalVisualScale = 1;
    this.transferStatus = '';

    this.transferGroup = new THREE.Group();
    this.transferGroup.visible = false;
    this.scene.add(this.transferGroup);

    const trailGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.transferTrail = new THREE.Line(
      trailGeometry,
      new THREE.LineBasicMaterial({
        color: 0xffd56a,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
    );
    this.transferTrailGlow = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({
      color: 0xff9d19, transparent: true, opacity: 0,
      depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false
    }));
    this.transferTrailGlow.renderOrder = 2;
    this.transferGroup.add(this.transferTrailGlow);
    this.transferTrail.frustumCulled = false;
    this.transferTrail.renderOrder = 3;
    this.transferGroup.add(this.transferTrail);
    this.showTrajectory = false;
  }

  start(target = 'earth') {
    if (this.active) return;
    if (target === this.planetId) return;
    this.target = target;
    this.physics.inGargantuaSky = false;
    this.routeKind = transferKind(this.planetId, target);
    this.transferStage = this.routeKind === 'kepler' ? 'ALIGN' : 'TRANSIT';
    this.physics.transferStage = this.transferStage;
    this._alignStartQuaternion.copy(this.physics.quaternion);
    this.stageClock = 0;
    this.burnDeltaV = 0;
    this.captureDeltaV = 0;
    this.progress = 0;
    this.arrivalOffset.set(0, 0, 0);
    this.arrivalVisualScale = 1;
    this.arrived = false;
    this.active = true;
    this.time = 0;
    this.flightPhaseLabel = '';

    this.orbit = this.routeKind === 'kepler' ? createTransfer(this.planetId, target) : {
      seconds: this.routeKind === 'wormhole' ? 90 : 7200,
      lunar: false, injectionDeltaV: 0, arrivalRelativeSpeed: 0, phaseAngle: 0
    };
    const destination = PLANET_PROFILES[target];
    const orbitRadius = destination?.radius + destination?.entryAltitude;
    const circularSpeed = destination && orbitRadius
      ? Math.sqrt(destination.gravity * destination.radius ** 2 / orbitRadius) : 0;
    this.captureRequiredDeltaV = this.routeKind === 'kepler' && circularSpeed
      ? Math.sqrt(this.orbit.arrivalRelativeSpeed ** 2 + 2 * circularSpeed ** 2) - circularSpeed : 0;
    // One transfer day per real second on interplanetary routes; two lunar
    // transfer hours per second. The player-controlled time scale multiplies
    // this baseline. Cruise duration therefore follows the orbital period.
    this.cruiseSecondsPerRealSecond = this.orbit.lunar ? 7200 : 86400;
    this.duration = this.routeKind === 'wormhole' ? 28 : this.routeKind === 'gargantua-local' ? 24 : this.orbit.seconds / this.cruiseSecondsPerRealSecond;
    if (this.routeKind === 'kepler') this._configureSolarFrame(this.physics.position);
    else {
      this.specialStart = this.physics.position.clone();
      if (this.routeKind === 'wormhole') this._prepareWormholeFrames();
    }
    if (this.routeKind === 'kepler' && this.orbit.lunar) {
      const departure = sampleTransfer(this.orbit,0);
      this.localTransferOrigin.set(this.physics.position.x-departure.x/AU*SCENE_AU,
        this.physics.position.y,this.physics.position.z);
      this.solarOrigin.copy(this.localTransferOrigin); this.solarOrigin.x -= SCENE_AU;
      this._solarPhases.set('earth',0);
      this._lunarStartAngle = this.planetId === 'moon' ? Math.PI : Math.PI-this.orbit.seconds*2*Math.PI/(27.32*86400);
    }
    if (this.routeKind === 'kepler') {
      // Finish at the planet's entry interface rather than its center. The
      // destination disk then grows continuously to the size seen at handoff.
      const center = this._samplePath(1, new THREE.Vector3());
      const approach = this._samplePath(0.995, new THREE.Vector3());
      const profile = PLANET_PROFILES[target];
      // Navigation coordinates compress an AU into 180 km while the camera
      // still follows a full-size ship. Expand the destination smoothly in
      // the last leg so it occupies the same view as the local globe.
      this.arrivalVisualScale = Math.max(1, 70 / sceneRadius(profile.radius));
      this.arrivalOffset.subVectors(approach, center).normalize()
        .multiplyScalar(sceneRadius(profile.radius + profile.entryAltitude) * this.arrivalVisualScale);
    }
    this._samplePath(0, this.pathStart);
    this._samplePath(1, this.pathEnd);
    this.flybyPoint = null;
    // Departure: the origin world starts huge (matching the local globe the
    // pilot just left) and recedes as the ship accelerates away, mirroring the
    // arrival zoom. Before the burn the ship still moves along its parking
    // orbit (d0); the plotted trajectory bends from that heading onto the
    // transfer ellipse as delta-v accumulates.
    this.departureOffset = new THREE.Vector3();
    this.departureScale = 1;
    this._trailClock = 0;
    this._d0 = new THREE.Vector3(0, 1, 0).applyQuaternion(this._alignStartQuaternion).normalize();
    this._t0 = new THREE.Vector3(0, 1, 0);
    this._vdir = new THREE.Vector3();
    if (this.routeKind === 'kepler') {
      const fromProfile = PLANET_PROFILES[this.planetId];
      this._sampleTangent(0, this._t0);
      if (fromProfile) {
        this.departureScale = Math.max(1, 70 / sceneRadius(fromProfile.radius));
        this.departureOffset.copy(this._t0).multiplyScalar(-0.45)
          .add(new THREE.Vector3(0, -0.85, 0)).normalize()
          .multiplyScalar(sceneRadius(fromProfile.radius + fromProfile.entryAltitude) * this.departureScale);
      }
    }
    this._rebuildRouteGeometry(0);
    this.transferGroup.visible = this.showTrajectory;
    this.transferTrail.material.opacity = 0.7;
    this.transferTrailGlow.material.opacity = 0.38;

    this.celestialGroup.visible = this.routeKind === 'kepler' ||
      (this.routeKind === 'wormhole' && this.planetId === 'saturn');
    this.wormhole.visible = this.routeKind === 'wormhole';
    if (this.wormhole.visible) {
      this.wormhole.position.copy(this.wormholeMouth);
      this.wormhole.scale.setScalar(2.5);
    }
    this.gargantuaGroup.visible = this.routeKind === 'gargantua-local' ||
      (this.routeKind === 'wormhole' && this.planetId === 'gargantua');
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

    // setPlanet hides the observer's navigation globe. A new transfer needs
    // every solar body back before ephemerides and markers are refreshed.
    for (const mesh of this.solarBodies.values()) mesh.visible = true;

    if (this.routeKind === 'kepler') { this._updateSolarBodies(0); this._updateDepartureVisuals(0); }
    this.sun.visible = this.solarLight.visible = true;
    this.sunGlow.visible = false;
  }

  _configureSolarFrame(position) {
    if (this.planetId === 'gargantua' || this.planetId === 'miller') return;
    const from = SOLAR_BODIES.find(b => b.id === (this.planetId === 'moon' ? 'earth' : this.planetId));
    // sampleTransfer starts inward ellipses at negative X and outward ones at
    // positive X. The solar frame must use that same departure apsis for
    // *every* world, otherwise inward legs begin two orbital radii away.
    const angle = this.orbit ? (this.orbit.inward ? Math.PI : 0)
      : (this.planetId === 'mars' ? Math.PI : 0);
    this.solarOrigin.set(position.x - Math.cos(angle) * from.au * SCENE_AU,
      position.y, position.z);
    this.solarEpoch = 0;
    if (this.planetId === 'moon' && !this.orbit) this.solarOrigin.x += 384400000/AU*SCENE_AU;
    this._solarPhases.set(from.id, angle);
    if (this.orbit && this.target) {
      const dest = SOLAR_BODIES.find(b => b.id === (this.target === 'moon' ? 'earth' : this.target));
      this._solarPhases.set(dest.id, angle + Math.PI - orbitalRate(dest.au) * this.orbit.seconds);
    }
    this._updateSolarBodies(0);
  }

  _resetNavigationScales() {
    for (const body of SOLAR_BODIES) {
      if (body.id === 'earth' || body.id === 'mars') continue;
      this.solarBodies.get(body.id)?.scale.setScalar(1);
    }
  }

  _prepareWormholeFrames() {
    this.wormholeMouth = this.specialStart.clone().add(new THREE.Vector3(0, 2400, 18000));
    this.wormholeExit = this.wormholeMouth.clone().add(new THREE.Vector3(0, 5200, 36000));
  }

  _sampleWormhole(t, out) {
    const { along } = wormholeTransit(t);
    if (along <= 1) return out.copy(this.specialStart).lerp(this.wormholeMouth, along);
    return out.copy(this.wormholeMouth).lerp(this.wormholeExit, along - 1);
  }

  _placeLocalGlobe() {
    const body = SOLAR_BODIES.find(item => item.id === this.planetId);
    const profile = PLANET_PROFILES[this.planetId];
    const mesh = body && this.solarBodies.get(body.id);
    if (!mesh || !profile || profile.landable || profile.surfaceType === 'black-hole') return;
    // PostLaunchSpace owns the high-detail local globe. Drawing this small
    // navigation mesh at planetary radius creates a faceted second horizon.
    mesh.visible = false;
    return;
  }

  _updateNavigationMarkers(camera) {
    for (const [id, marker] of this.navigationMarkers) {
      const mesh = id === 'moon' ? this.moon : this.solarBodies.get(id);
      if (!mesh?.visible || !this.celestialGroup.visible) {
        marker.visible = false;
        continue;
      }
      const distance = Math.max(1, camera.position.distanceTo(mesh.position));
      const physicalRadius = mesh.geometry.parameters.radius * mesh.scale.x;
      const angularDiameter = 2 * Math.atan(physicalRadius / distance);
      const opacity = THREE.MathUtils.clamp((0.02 - angularDiameter) / 0.018, 0, 1);
      marker.visible = opacity > 0.02;
      marker.material.opacity = opacity;
      marker.position.copy(mesh.position);
      marker.scale.setScalar(distance * 0.017);
    }
  }

  _updateTargetLocator(camera) {
    const label = document.getElementById('flight-planet-locator');
    if (!label) return;
    const mesh = this.target === 'moon' ? this.moon : this.solarBodies.get(this.target);
    if (!this.active || this.routeKind !== 'kepler' || !mesh?.visible) {
      label.style.display = 'none';
      return;
    }
    camera.updateMatrixWorld();
    this._locatorPoint.copy(mesh.position).project(camera);
    const p = this._locatorPoint;
    if (p.z < -1 || p.z > 1 || Math.abs(p.x) > 0.94 || Math.abs(p.y) > 0.86) {
      label.style.display = 'none';
      return;
    }
    const distanceKm = Math.round(camera.position.distanceTo(mesh.position) / SCENE_AU * AU / 1000);
    label.textContent = `${this.target.toUpperCase()} · ${distanceKm.toLocaleString()} KM`;
    label.style.left = `${(p.x * 0.5 + 0.5) * window.innerWidth}px`;
    label.style.top = `${(1 - (p.y * 0.5 + 0.5)) * window.innerHeight - 13}px`;
    label.style.display = 'block';
  }

  _updateSolarBodies(seconds) {
    this._resetNavigationScales();
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

  _updateDepartureVisuals(progress) {
    if (this.routeKind !== 'kepler' || progress >= 0.05 || !this.departureOffset) return;
    const mesh = this.planetId === 'moon' ? this.moon : this.solarBodies.get(this.planetId);
    if (!mesh) return;
    const e = THREE.MathUtils.smootherstep(progress, 0, 0.05);
    const zoom = THREE.MathUtils.lerp(this.departureScale, 1, e);
    mesh.scale.multiplyScalar(zoom);
    mesh.position.addScaledVector(this.departureOffset, 1 - e);
    if (this.planetId === 'earth') {
      this.clouds.scale.copy(mesh.scale);
      this.earthGlow.scale.copy(mesh.scale);
      this.clouds.position.copy(mesh.position);
      this.earthGlow.position.copy(mesh.position);
    }
  }

  _updateArrivalVisuals(progress) {
    if (this.routeKind !== 'kepler' || progress <= 0.97) return;
    const mesh = this.target === 'moon' ? this.moon : this.solarBodies.get(this.target);
    if (!mesh) return;
    const zoom = THREE.MathUtils.lerp(1, this.arrivalVisualScale, THREE.MathUtils.smoothstep(progress, 0.97, 1));
    mesh.scale.multiplyScalar(zoom);
    if (this.target === 'earth') {
      this.clouds.scale.copy(mesh.scale);
      this.earthGlow.scale.copy(mesh.scale);
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
    this.gargantuaBillboard.quaternion.copy(camera.quaternion);
    if (this.active) {
      this._updateNavigationMarkers(camera);
      this._updateTargetLocator(camera);
      return;
    }
    this._updateTargetLocator(camera);
    if (this.planetId === 'gargantua' || this.planetId === 'miller') {
      this.gargantuaGroup.visible = true;
      this.gargantuaGroup.position.copy(camera.position).add(new THREE.Vector3(0, 9000, -37000));
      this.wormhole.visible = this.planetId === 'gargantua';
      if (this.wormhole.visible) {
        this.wormhole.scale.setScalar(3);
        this.wormhole.material.uniforms.uFarSide.value = 0;
        // The exit mouth stays opposite Gargantua in the local sky. It should
        // not read as a second planet beside the black hole after transit.
        this.wormhole.position.copy(camera.position).add(new THREE.Vector3(10000, 8500, 42000));
      }
      return;
    }
    this.gargantuaGroup.visible = false;
    this.wormhole.visible = this.planetId === 'saturn';
    if (this.wormhole.visible) {
      this.wormhole.scale.setScalar(5);
      this.wormhole.material.uniforms.uFarSide.value = 1;
      this.wormhole.position.copy(camera.position).add(new THREE.Vector3(8000, 3500, -26000));
    }
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
    this._placeLocalGlobe();
    this._updateNavigationMarkers(camera);
  }

  _rebuildRouteGeometry(burnFraction = 1) {
    const points = [];
    const n = 190;
    for (let i = 0; i <= n; i++) {
      points.push(this._samplePath(i / n, new THREE.Vector3()));
    }
    if (this.routeKind === 'kepler' && burnFraction < 0.999 && this._d0) {
      let length = 0;
      for (let i = 1; i < points.length; i++) length += points[i].distanceTo(points[i - 1]);
      const delta = this._vdir.copy(this._d0).lerp(this._t0, burnFraction).sub(this._t0);
      for (let i = 1; i < points.length; i++) {
        const s = i / n;
        // w(s) has unit slope at the ship and decays, so the curve leaves along
        // the current velocity and merges smoothly into the true ellipse.
        points[i].addScaledVector(delta, length * s * Math.exp(-s / 0.04));
      }
    }
    this.transferTrail.geometry.dispose();
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.transferTrail.geometry = geometry;
    this.transferTrailGlow.geometry = geometry;

  }

  setTrajectoryVisible(visible) {
    this.showTrajectory = visible;
    this.transferGroup.visible = visible && this.active;
  }

  _samplePath(t, out) {
    if (this.routeKind !== 'kepler') {
      // These legs cross coordinate charts. The rendered path is an approach,
      // not a distance on the solar-system navigation scale.
      if (this.routeKind === 'wormhole') return this._sampleWormhole(t, out);
      return out.copy(this.specialStart).add(new THREE.Vector3(8000 * t, 5000 * t, -70000 * t));
    }
    const point = sampleTransfer(this.orbit, t);
    const origin = this.orbit.lunar ? this.localTransferOrigin : this.solarOrigin;
    out.set(origin.x + point.x / AU * SCENE_AU,
      origin.y, origin.z + point.z / AU * SCENE_AU);
    if (this.arrivalOffset && t > 0.97) {
      out.addScaledVector(this.arrivalOffset, THREE.MathUtils.smoothstep(t, 0.97, 1));
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
    if (this.transferTrailGlow) this.transferTrailGlow.material.opacity = 0;
  }

  update(dt, timeScale = 1, currentAltitude = 0) {
    this.time += dt;
    this.elapsedAdvanceSeconds = 0;
    if (this.wormhole?.material?.uniforms?.uTime) this.wormhole.material.uniforms.uTime.value = this.time;
    if (this.gargantuaBillboard?.material?.uniforms?.uTime) this.gargantuaBillboard.material.uniforms.uTime.value = this.time;
    this._satelliteTime += dt;

    // Fade the regional detail into the spherical Earth before its finite
    // geometry can be seen from entry altitude. The wide ocean stays beyond
    // the atmospheric horizon during the blend.
    if (this.planetId === 'earth' && this.earthSurface) {
      if (currentAltitude > 14000) {
        this.earthSurface.visible = false;
      } else {
        this.earthSurface.visible = true;
        const fade = 1-THREE.MathUtils.smoothstep(currentAltitude,8000,14000);

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
    if (this.transferStage === 'CAPTURE') {
      const priorDeltaV = this.captureDeltaV;
      const burnDt = Math.min(4, dt * 35);
      const substeps = Math.max(1, Math.ceil(burnDt / .25));
      for (let i = 0; i < substeps && this.captureDeltaV < this.captureRequiredDeltaV; i++) {
        if (this.physics.starshipFuel <= .001) break;
        const before = this.physics.getShipMass();
        this.physics.burnPropellant(false, 6, 1, burnDt / substeps);
        const after = this.physics.getShipMass();
        this.captureDeltaV += 378 * 9.80665 * Math.log(before / after);
      }
      this.physics.missionTime += burnDt;
      this.physics.velocity.addScaledVector(this._pathTangent, -(this.captureDeltaV - priorDeltaV));
      this.physics.speed = this.physics.velocity.length();
      this.vehicle.setStarshipThrottle(1, true);
      this.transferStatus = `ORBIT INSERTION BURN // ${Math.round(Math.min(this.captureDeltaV, this.captureRequiredDeltaV))}/${Math.round(this.captureRequiredDeltaV)} M/S · SHIP TANK ${Math.round(this.physics.starshipFuel)}%`;
      this.physics.transferStatus = this.transferStatus;
      if (this.captureDeltaV >= this.captureRequiredDeltaV || this.physics.starshipFuel <= .001) {
        this.arrived = true;
        this.active = false;
        this.hideTransferTrail();
        this.vehicle.setStarshipThrottle(0, false);
        this.options.onArrive?.(this.target, Math.max(0, this.captureRequiredDeltaV - this.captureDeltaV));
      }
      return;
    }
    if (this.routeKind === 'wormhole') {
      const leg = wormholeTransit(this.progress);
      const towardGargantua = this.target === 'gargantua';
      this.wormhole.visible = leg.phase !== 'emergence' || leg.along < 1.55;
      this.wormhole.position.copy(this.wormholeMouth);
      this.wormhole.material.uniforms.uFarSide.value = towardGargantua ? 1 : 0;
      const solarSide = towardGargantua ? this.progress < 0.54 : this.progress >= 0.54;
      this.celestialGroup.visible = solarSide;
      this.physics.inGargantuaSky = !solarSide;
      this.gargantuaGroup.visible = !solarSide;
      if (this.gargantuaGroup.visible) this.gargantuaGroup.position.copy(this.physics.position).add(new THREE.Vector3(0, 9000, -37000));
    } else if (this.routeKind === 'gargantua-local') {
      this.physics.inGargantuaSky = true;
      this.gargantuaGroup.visible = true;
      this.gargantuaGroup.position.copy(this.physics.position).add(new THREE.Vector3(0, 9000, -37000));
    }

    // The booster NEVER transfers interplanetary; it stays on the home planet
    if (this.vehicle?.boosterGroup) {
      this.vehicle.boosterGroup.visible = false;
    }

    if (this.routeKind === 'kepler' && this.transferStage !== 'COAST') {
      this._sampleTangent(0, this._pathTangent);
      this._alignTargetQuaternion.setFromUnitVectors(this._upAxis, this._pathTangent);
      const ALIGN_SECONDS = 7;
      if (this.transferStage === 'ALIGN') {
        // Smootherstep slew: gentle angular acceleration and deceleration,
        // driven by cold-gas RCS bursts at the start and end of the rotation.
        const u = Math.min(1, this.stageClock / ALIGN_SECONDS);
        this.physics.quaternion.slerpQuaternions(this._alignStartQuaternion,
          this._alignTargetQuaternion, THREE.MathUtils.smootherstep(u, 0, 1));
        const slewing = u < 1 && (u < 0.2 || u > 0.78);
        this.vehicle.setRcsActivity?.(slewing ? 1 : 0);
      } else {
        this.physics.quaternion.copy(this._alignTargetQuaternion);
        this.vehicle.setRcsActivity?.(0);
      }
      // Thrust points along the transfer tangent but the velocity vector only
      // bends toward it as delta-v accumulates (thrust != velocity mid-burn).
      const burnFrac = this.orbit.injectionDeltaV > 0
        ? THREE.MathUtils.clamp(this.burnDeltaV / this.orbit.injectionDeltaV, 0, 1) : 1;
      this._vdir.copy(this._d0).lerp(this._pathTangent, burnFrac).normalize();
      const postBurnSpeed = sampleTransfer(this.orbit, 0).speed;
      this.physics.velocity.copy(this._vdir).multiplyScalar(
        Math.max(0, postBurnSpeed - this.orbit.injectionDeltaV) + this.burnDeltaV);
      this.physics.speed = this.physics.velocity.length();
      this.stageClock += dt;
      if (this.transferStage === 'ALIGN') {
        this.vehicle.setStarshipThrottle(0, true);
        this.physics.transferStatus = `TRANSFER ALIGNMENT // TANGENT VECTOR LOCKED · INJECTION ΔV ${Math.round(this.orbit.injectionDeltaV)} M/S`;
        if (this.stageClock >= ALIGN_SECONDS) { this.transferStage = 'INJECTION'; this.stageClock = 0; }
      } else {
        // Simulated burn time is compressed for the view, but propellant mass
        // and achieved delta-v follow the rocket equation in physical seconds.
        const burnDt = Math.min(4, dt * 35);
        const substeps = Math.max(1, Math.ceil(burnDt / .25));
        for (let i = 0; i < substeps && this.burnDeltaV < this.orbit.injectionDeltaV; i++) {
          if (this.physics.starshipFuel <= .001) break;
          const massBefore = this.physics.getShipMass();
          this.physics.burnPropellant(false, 6, 1, burnDt / substeps);
          const massAfter = this.physics.getShipMass();
          this.burnDeltaV += 378 * 9.80665 * Math.log(massBefore / massAfter);
        }
        this.physics.missionTime += burnDt;
        this.elapsedAdvanceSeconds = burnDt;
        // Burn time advances the orbit as well. The craft stays on the same
        // continuous transfer curve; COAST starts at this exact sample.
        this.progress = Math.min(0.999, this.progress + burnDt / this.orbit.seconds);
        this._samplePath(this.progress, this._pathPoint);
        this.physics.position.copy(this._pathPoint);
        this._updateSolarBodies(this.progress * this.orbit.seconds);
        this.physics.transferProgress = this.progress;
        // Engine spool-up, then throttle down as the target delta-v nears.
        const remainingFrac = 1 - burnFrac;
        const throttle = Math.min(THREE.MathUtils.smoothstep(this.stageClock, 0, 1.5),
          THREE.MathUtils.clamp(remainingFrac / 0.06, 0.25, 1));
        this.vehicle.setStarshipThrottle(Math.max(0.2, throttle), true);
        this._updateDepartureVisuals(this.progress);
        this._trailClock += dt;
        if (this.showTrajectory && this._trailClock > 0.12) {
          this._trailClock = 0;
          this._rebuildRouteGeometry(burnFrac);
        }
        this.physics.transferStatus = `INJECTION BURN // ${Math.round(Math.min(this.burnDeltaV, this.orbit.injectionDeltaV))}/${Math.round(this.orbit.injectionDeltaV)} M/S · SHIP TANK ${Math.round(this.physics.starshipFuel)}%`;
        if (this.burnDeltaV >= this.orbit.injectionDeltaV) {
          this._rebuildRouteGeometry(1);
          this.transferStage = 'COAST';
          this.vehicle.setStarshipThrottle(0, true);
        } else if (this.physics.starshipFuel <= .001) {
          this.active = false;
          this.transferStage = 'ABORT';
          this.physics.phase = 'ORBIT';
          this.physics.scriptedControl = false;
          if (this.departureState) {
            this.physics.position.copy(this.departureState.position);
            this.physics.velocity.copy(this.departureState.velocity);
          }
          this.physics.transferStatus = 'TRANSFER ABORTED // INSUFFICIENT PROPELLANT';
          this.vehicle.setStarshipThrottle(0, false);
        }
      }
      this.physics.transferStage = this.transferStage;
      return;
    }

    // Sample the Keplerian transfer ellipse at the elapsed mission time.
    const warp = Math.max(1, Math.min(timeScale, 1000));
    this._lastScaleWarp = warp;
    // Reduce visual time compression near a planet so its real angular size
    // grows over several frames instead of appearing only on the last tick.
    // Mission time still advances by the exact corresponding Kepler interval.
    const approachCompression = this.routeKind === 'kepler' && this.progress > 0.96
      ? Math.max(0.03, Math.pow((1 - this.progress) / 0.04, 1.3)) : 1;
    const departCompression = this.routeKind === 'kepler' && this.progress < 0.04
      ? Math.max(0.08, Math.pow(this.progress / 0.04, 1.3)) : 1;
    const advance = Math.min(1 - this.progress, (dt * warp * approachCompression * departCompression) / this.duration);
    this.progress += advance;
    this.elapsedAdvanceSeconds = advance * this.orbit.seconds;
    this.physics.missionTime += advance * this.orbit.seconds;

    const t = this.progress;
    this._samplePath(t, this._pathPoint);
    this._sampleTangent(t, this._pathTangent);
    this.physics.position.copy(this._pathPoint);

    if (this.routeKind === 'kepler') {
      this._updateSolarBodies(t * this.orbit.seconds);
      this._updateDepartureVisuals(t);
      this._updateArrivalVisuals(t);
    }
    this._flightDir.copy(this._pathTangent);
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
    const helioSpeed = this.routeKind === 'kepler' ? sampleTransfer(this.orbit, t).speed :
      this.routeKind === 'wormhole' ? 0 : 1200;
    this.physics.velocity.copy(this._pathTangent).multiplyScalar(helioSpeed);
    this.physics.speed = helioSpeed;
    this.physics.transferProgress = t;
    this.physics.transferStage = this.routeKind === 'kepler' ? 'COAST' : 'TRANSIT';

    this.vehicle.setStarshipThrottle(0, true);
    this.vehicle.setReentryHeat(0);

    // Instantaneous separation from the moving destination, using the shared AU scale.
    const targetPosition = this.target === 'moon' ? this.moon.position : this.solarBodies.get(this.target)?.position || this.physics.position;
    const remainingKm = Math.round(Math.hypot(
      this.physics.position.x - targetPosition.x,
      this.physics.position.z - targetPosition.z) / SCENE_AU * AU / 1000);
    const distAu = (remainingKm / 149597870.7).toFixed(3);
    const speedKmS = (helioSpeed / 1000).toFixed(1);

    // Mission time follows the semimajor axis, rather than a preset travel duration.
    const totalTransferDays = Math.round(this.orbit.seconds / 86400);
    const elapsedDays = Math.round(t * totalTransferDays);
    const pct = Math.round(t * 100);
    const deltaV = (this.orbit.injectionDeltaV / 1000).toFixed(2);
    const wormholeLeg = this.routeKind === 'wormhole' ? wormholeTransit(t) : null;
    const wormholeOrigin = this.target === 'gargantua' ? 'SATURN WORMHOLE' : 'GARGANTUA WORMHOLE';
    const wormholeChart = this.target === 'gargantua' ? 'GARGANTUA CHART' : 'SATURN CHART';
    const wormholeCopy = wormholeLeg?.phase === 'approach'
      ? `${wormholeOrigin} // APPROACHING THE MOUTH ${pct}%`
      : wormholeLeg?.phase === 'throat'
        ? 'WORMHOLE THROAT // CROSSING INTO THE OTHER CHART'
        : `${wormholeChart} // CLEARING THE MOUTH ${pct}%`;
    let status = this.routeKind === 'wormhole'
      ? wormholeCopy
      : this.routeKind === 'gargantua-local'
        ? `GARGANTUA SYSTEM // MILLER APPROACH ${pct}% · LOCAL CLOCK TRACKING`
        : this.orbit.lunar
      ? `LUNAR HOHMANN // DAY ${elapsedDays}/${totalTransferDays} · ${pct}% · ${speedKmS} KM/S · ${remainingKm.toLocaleString()} KM TO TARGET`
      : `SOLAR HOHMANN // DAY ${elapsedDays}/${totalTransferDays} · ${pct}% · ${speedKmS} KM/S · ${distAu} AU TO TARGET`;
    if (this.routeKind === 'kepler' && t < 0.07) status = `INJECTION // IDEAL ΔV ${deltaV} KM/S · TARGET LEAD ${Math.round(this.orbit.phaseAngle * 180 / Math.PI)}°`;
    if (this.routeKind === 'kepler' && t > 0.92) status = `${this.target === 'moon' ? 'LUNAR APPROACH' : 'ORBIT INSERTION'} // ${this.target.toUpperCase()} · DAY ${elapsedDays}/${totalTransferDays}`;
    this.transferStatus = status;
    this.physics.transferStatus = status;

    if (t >= 1 && !this.arrived) {
      if (this.routeKind === 'kepler' && this.captureRequiredDeltaV > 0) {
        this.transferStage = 'CAPTURE';
        this.physics.transferStage = 'CAPTURE';
        return;
      }
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
    this.celestialGroup.visible = planetId !== 'gargantua' && planetId !== 'miller';
    this.gargantuaGroup.visible = planetId === 'gargantua' || planetId === 'miller';
    this.wormhole.visible = planetId === 'saturn' || planetId === 'gargantua';

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
