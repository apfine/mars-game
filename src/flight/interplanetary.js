import * as THREE from 'three';
import { PLANET_PROFILES, getPlanetProfile } from './planetProfiles.js';
import { STARBASE_LAYOUT as L } from './starbaseLayout.js';

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
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const g = cv.getContext('2d');
  const ocean = g.createLinearGradient(0, 0, 0, 512);
  ocean.addColorStop(0, '#071a3a');
  ocean.addColorStop(0.45, '#0b3f7a');
  ocean.addColorStop(0.55, '#0c4c8f');
  ocean.addColorStop(1, '#06142e');
  g.fillStyle = ocean;
  g.fillRect(0, 0, 1024, 512);

  // Continent masses. Blobby, layered ellipses read as land from orbit.
  const land = [
    [230, 180, 95, 55, '#5c7c3f'], [270, 230, 60, 80, '#6e8a46'],
    [180, 300, 48, 90, '#7a8b4b'], [330, 330, 42, 55, '#6a7b3e'],
    [500, 170, 90, 62, '#8a8b55'], [540, 230, 55, 70, '#7c7f45'],
    [600, 290, 42, 55, '#92855a'], [720, 190, 100, 70, '#6f8442'],
    [780, 260, 58, 50, '#7f8a47'], [860, 330, 44, 34, '#8d8a55'],
    [820, 120, 76, 40, '#87905a'], [420, 380, 58, 35, '#8b8258'],
    [110, 390, 58, 32, '#93a08a'], [870, 405, 90, 30, '#aebfb7']
  ];
  for (const [x, y, rx, ry, color] of land) {
    const grad = g.createRadialGradient(x, y, 2, x, y, Math.max(rx, ry));
    grad.addColorStop(0, color);
    grad.addColorStop(0.75, color);
    grad.addColorStop(1, 'rgba(60,80,40,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, rx, ry, Math.sin(x * 0.01) * 0.7, 0, Math.PI * 2);
    g.fill();
  }

  // Deserts and highlands
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 1024;
    const y = 80 + Math.random() * 350;
    g.fillStyle = `rgba(${170 + Math.random() * 40},${150 + Math.random() * 30},${95 + Math.random() * 30},${0.08 + Math.random() * 0.12})`;
    g.beginPath();
    g.arc(x, y, 8 + Math.random() * 28, 0, Math.PI * 2);
    g.fill();
  }

  // Polar ice
  g.fillStyle = 'rgba(240,248,255,0.92)';
  g.fillRect(0, 0, 1024, 28);
  g.fillRect(0, 490, 1024, 22);
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    g.arc(Math.random() * 1024, 26 + Math.random() * 16, 5 + Math.random() * 16, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(Math.random() * 1024, 480 - Math.random() * 12, 4 + Math.random() * 12, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
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

export class InterplanetaryJourney {
  constructor(scene, physics, vehicle, options = {}) {
    this.scene = scene;
    this.physics = physics;
    this.vehicle = vehicle;
    this.options = options;
    this.active = false;
    this.target = null;
    this.progress = 0;
    this.duration = 90;
    this.arrived = false;
    this.planetId = 'mars';
    this.time = 0;
    this._lastScaleWarp = 1;

    this.padCoords = physics.padCoords.clone();
    this.padGroundY = physics.padGroundY;

    this._buildCelestialBodies();
    this._buildEarthSurface();
    this._buildSatellites();
    this._buildTransferPath();
  }

  _buildCelestialBodies() {
    this.celestialGroup = new THREE.Group();
    this.scene.add(this.celestialGroup);

    this.earthAnchor = new THREE.Vector3(
      this.padCoords.x + 270000,
      this.padCoords.y + 82000,
      this.padCoords.y + 0 // replaced below for clarity
    );
    // Keep the destination along the launch azimuth so the transfer reads as a
    // natural continuation of the ascent.
    const azimuth = 0.6;
    this.earthAnchor.set(
      this.padCoords.x + Math.sin(azimuth) * 290000,
      this.padGroundY + 110000,
      this.padCoords.y + Math.cos(azimuth) * 290000
    );

    const earthMat = new THREE.MeshStandardMaterial({
      map: makeEarthTexture(),
      roughness: 0.72,
      metalness: 0.02,
      emissive: new THREE.Color(0x0a1c33),
      emissiveIntensity: 0.22
    });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS_SCENE, 64, 40), earthMat);
    this.earth.position.copy(this.earthAnchor);
    this.earth.rotation.y = -1.2;
    this.celestialGroup.add(this.earth);

    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS_SCENE * 1.012, 48, 32),
      new THREE.MeshStandardMaterial({
        map: makeCloudTexture(),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        roughness: 1.0,
        metalness: 0.0
      })
    );
    this.clouds.position.copy(this.earthAnchor);
    this.celestialGroup.add(this.clouds);

    // Atmospheric rim glow.
    this.earthGlow = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS_SCENE * 1.045, 48, 32),
      new THREE.MeshBasicMaterial({
        color: 0x5ba8ff,
        transparent: true,
        opacity: 0.14,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.earthGlow.position.copy(this.earthAnchor);
    this.celestialGroup.add(this.earthGlow);

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
    this.celestialGroup.add(this.moon);

    // Distant, subdued Moon orbit ring to make the cislunar geometry legible.
    const ringGeo = new THREE.RingGeometry(this.moonOrbitRadius - 120, this.moonOrbitRadius + 120, 96);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0x6f9fc9,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(this.earthAnchor);
    this.celestialGroup.add(ring);
    this.moonOrbitRing = ring;
  }

  _buildEarthSurface() {
    this.earthSurface = new THREE.Group();
    this.earthSurface.visible = false;
    this.scene.add(this.earthSurface);

    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(400000, 400000),
      new THREE.MeshStandardMaterial({
        color: 0x14558f,
        roughness: 0.28,
        metalness: 0.12,
        envMapIntensity: 1.0
      })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(this.padCoords.x, this.padGroundY - 0.7, this.padCoords.y);
    this.earthSurface.add(ocean);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(9000, 96),
      new THREE.MeshStandardMaterial({
        map: makeGrassTexture(),
        color: 0xffffff,
        roughness: 0.96,
        metalness: 0.0
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(this.padCoords.x, this.padGroundY + 0.06, this.padCoords.y);
    ground.receiveShadow = true;
    this.earthSurface.add(ground);
    this.earthGround = ground;

    // Graded concrete apron around the launch complex.
    const apron = new THREE.Mesh(
      new THREE.CircleGeometry(470, 80),
      new THREE.MeshStandardMaterial({
        map: makeEarthConcreteTexture(),
        color: 0xc9cbc4,
        roughness: 0.9,
        metalness: 0.02
      })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(this.padCoords.x, this.padGroundY + 0.14, this.padCoords.y);
    apron.receiveShadow = true;
    this.earthSurface.add(apron);

    // Low rolling hills and a treeline so the Earth site is immediately
    // distinguishable from the Martian apron.
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x4f6e3d, roughness: 1.0, metalness: 0.0 });
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2;
      const r = 3200 + (i % 5) * 380;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(280 + (i % 4) * 90, 70 + (i % 3) * 40, 14), hillMat);
      hill.position.set(
        this.padCoords.x + Math.cos(a) * r,
        this.padGroundY + 30,
        this.padCoords.y + Math.sin(a) * r
      );
      hill.rotation.y = a;
      this.earthSurface.add(hill);
    }

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x59402a, roughness: 1.0 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x2e5c2f, roughness: 0.95 });
    for (let i = 0; i < 90; i++) {
      const angle = (i / 90) * Math.PI * 2 + 0.17;
      const radius = 650 + (i % 11) * 55;
      const x = this.padCoords.x + Math.cos(angle) * radius;
      const z = this.padCoords.y + Math.sin(angle) * radius;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.7, 11, 6), trunkMat);
      trunk.position.set(x, this.padGroundY + 5.5, z);
      this.earthSurface.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(7, 24, 7), crownMat);
      crown.position.set(x, this.padGroundY + 22, z);
      this.earthSurface.add(crown);
    }

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

  _buildTransferPath() {
    this.pathStart = new THREE.Vector3();
    this.pathEnd = new THREE.Vector3();
    this.pathControl = new THREE.Vector3();
    this._pathPoint = new THREE.Vector3();
    this._pathTangent = new THREE.Vector3();
    this.transferTrail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0x63d7ff, transparent: true, opacity: 0.0 })
    );
    this.transferTrail.frustumCulled = false;
    this.scene.add(this.transferTrail);
  }

  start(target = 'earth') {
    if (this.active) return;
    this.target = target;
    this.progress = 0;
    this.arrived = false;
    this.active = true;
    this.time = 0;

    const profile = getPlanetProfile(target);
    this.physics.setPlanet(this.physics.planetId);
    this.pathStart.copy(this.physics.position);
    const destination = target === 'earth' ? this.earthAnchor : this._marsAnchor();
    const dir = destination.clone().sub(this.pathStart).normalize();
    this.pathEnd.copy(destination).addScaledVector(dir, -(target === 'earth' ? 62000 : 180000));
    this.pathControl.copy(this.pathStart).lerp(this.pathEnd, 0.5);
    this.pathControl.y += Math.min(90000, this.pathStart.distanceTo(this.pathEnd) * 0.16);

    // Aim Earth at the end of the cruise and make sure the Moon is visible.
    if (target === 'earth') {
      this.celestialGroup.visible = true;
      this.earth.visible = true;
      this.clouds.visible = true;
      this.earthGlow.visible = true;
      this.moon.visible = true;
      this.moonOrbitRing.visible = true;
      this.earth.scale.setScalar(1);
      this.clouds.scale.setScalar(1);
      this.earthGlow.scale.setScalar(1);
    }

    this.transferTrail.material.opacity = 0.5;
    this._updateTrail();
  }

  _marsAnchor() {
    return new THREE.Vector3(
      this.padCoords.x - 180000,
      this.padGroundY + 50000,
      this.padCoords.y - 120000
    );
  }

  _updateTrail() {
    const points = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      points.push(this._samplePath(t, new THREE.Vector3()));
    }
    this.transferTrail.geometry.dispose();
    this.transferTrail.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  _samplePath(t, out) {
    const inv = 1 - t;
    return out.set(
      inv * inv * this.pathStart.x + 2 * inv * t * this.pathControl.x + t * t * this.pathEnd.x,
      inv * inv * this.pathStart.y + 2 * inv * t * this.pathControl.y + t * t * this.pathEnd.y,
      inv * inv * this.pathStart.z + 2 * inv * t * this.pathControl.z + t * t * this.pathEnd.z
    );
  }

  _sampleTangent(t, out) {
    const inv = 1 - t;
    out.set(
      2 * inv * (this.pathControl.x - this.pathStart.x) + 2 * t * (this.pathEnd.x - this.pathControl.x),
      2 * inv * (this.pathControl.y - this.pathStart.y) + 2 * t * (this.pathEnd.y - this.pathControl.y),
      2 * inv * (this.pathControl.z - this.pathStart.z) + 2 * t * (this.pathEnd.z - this.pathControl.z)
    );
    return out.normalize();
  }

  update(dt, timeScale = 1) {
    this.time += dt;
    this._satelliteTime += dt;

    // Satellites stay alive in every mode so the sky is never empty.
    this._updateSatelliteSet(this.marsSatellites, dt, 1.0);
    this._updateSatelliteSet(this.earthSatellites, dt, 1.0);
    this._updateSatelliteSet(this.earthSurfaceSatellites, dt, 1.0);

    this.earth.rotation.y += dt * 0.012;
    this.clouds.rotation.y += dt * 0.016;
    this.moon.position.set(
      this.earthAnchor.x - 38000 + Math.sin(this.time * 0.004) * 9000,
      this.earthAnchor.y + 12000,
      this.earthAnchor.z + 44000 + Math.cos(this.time * 0.004) * 9000
    );
    this.moon.rotation.y += dt * 0.01;

    if (!this.active) return;

    // Compressed visual transit. High time warp shortens the cruise but never
    // skips it entirely, so the Moon and Earth remain legible.
    const warp = Math.max(1, Math.min(timeScale, 30));
    this._lastScaleWarp = warp;
    this.progress = Math.min(1, this.progress + (dt * warp) / this.duration);
    this.physics.missionTime += dt * timeScale;

    const t = this.progress;
    this._samplePath(t, this._pathPoint);
    this._sampleTangent(t, this._pathTangent);
    this.physics.position.copy(this._pathPoint);
    this.physics.quaternion.setFromUnitVectors(this._upAxis || new THREE.Vector3(0, 1, 0), this._pathTangent);
    this.vehicle.setStarshipThrottle(t < 0.06 || t > 0.9 ? 0.55 : 0.0, true);
    this.vehicle.setReentryHeat(Math.max(0, Math.sin(t * Math.PI) * 0.05));

    if (t >= 1 && !this.arrived) {
      this.arrived = true;
      this.active = false;
      this.transferTrail.material.opacity = 0.0;
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
      // The globe is replaced by the local Earth surface; keep the Moon in the
      // night sky above the new Starbase.
      this.earth.visible = false;
      this.clouds.visible = false;
      this.earthGlow.visible = false;
      this.earthSatellites.group.visible = false;
      this.moonOrbitRing.visible = false;
      this.moon.visible = true;
      this.moon.scale.setScalar(0.32);
      this.moon.position.set(
        this.padCoords.x + 26000,
        this.padGroundY + 14000,
        this.padCoords.y - 38000
      );
    } else {
      this.earth.visible = true;
      this.clouds.visible = true;
      this.earthGlow.visible = true;
      this.earthSatellites.group.visible = true;
      this.moonOrbitRing.visible = true;
      this.moon.visible = true;
      this.moon.scale.setScalar(0.55);
      // From the Martian surface Earth and the Moon read as bright worlds
      // rather than filling the sky.
      this.earth.position.copy(this.earthAnchor);
      this.earth.scale.setScalar(0.42);
      this.clouds.position.copy(this.earthAnchor);
      this.clouds.scale.setScalar(0.42);
      this.earthGlow.position.copy(this.earthAnchor);
      this.earthGlow.scale.setScalar(0.42);
      this.moon.position.set(
        this.earthAnchor.x - 38000,
        this.earthAnchor.y + 12000,
        this.earthAnchor.z + 44000
      );
    }
  }

  reset() {
    this.active = false;
    this.progress = 0;
    this.arrived = false;
    this.target = null;
    this.transferTrail.material.opacity = 0.0;
    this.setPlanet('mars');
  }
}
