import * as THREE from 'three';

// Procedural Earth cities: instanced towers with lit-window textures, street
// grids and a few landmark spires. Inland of the Starbase coast, so they read
// as distant skylines on approach and from orbit.

const CITY_SITES = [
  { name: 'Port Meridian', x: -4300, z: -5200, radius: 1500, core: 190 },
  { name: 'Halcyon Bay', x: -6200, z: 3100, radius: 1900, core: 240 },
  { name: 'New Aurora', x: -3000, z: 7600, radius: 1300, core: 150 }
];

function rand(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function windowTexture(cols, rows, warm) {
  const c = document.createElement('canvas');
  c.width = 64 * cols; c.height = 64 * rows;
  const g = c.getContext('2d');
  g.fillStyle = '#05080c'; g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < rows * 8; y++) {
    for (let x = 0; x < cols * 8; x++) {
      if (rand(x * 31 + y * 17 + cols) > 0.42) {
        const tint = rand(x + y * 9) > 0.8 ? '#9fd4ff' : warm ? '#ffd9a0' : '#fff2cf';
        g.fillStyle = tint;
        g.globalAlpha = 0.55 + rand(x * 7 + y) * 0.45;
        g.fillRect(x * 8 + 1.5, y * 8 + 2, 5, 4.5);
      }
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildEarthCities({ padCoords, padGroundY, surfaceHeight, coastDistance }) {
  const group = new THREE.Group();
  group.name = 'earth-cities';
  const dummy = new THREE.Object3D();

  const classes = [
    { key: 'low', w: [14, 30], h: [10, 28], count: 520, cols: 2, rows: 2, warm: true },
    { key: 'mid', w: [18, 34], h: [34, 90], count: 300, cols: 2, rows: 5, warm: false },
    { key: 'tall', w: [22, 40], h: [110, 260], count: 70, cols: 2, rows: 12, warm: false }
  ];
  const meshes = classes.map((cls) => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9aa3ad, roughness: 0.38, metalness: 0.55,
      emissive: 0xffffff, emissiveMap: windowTexture(cls.cols, cls.rows, cls.warm),
      emissiveIntensity: 0.55
    });
    const mesh = new THREE.InstancedMesh(geo, mat, cls.count * CITY_SITES.length);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    mesh.userData.used = 0;
    return mesh;
  });

  // Street grid ribbons (one merged line set per city).
  const roadMat = new THREE.LineBasicMaterial({ color: 0xffc77a, transparent: true, opacity: 0.55 });

  CITY_SITES.forEach((site, si) => {
    const roadPts = [];
    for (let k = -4; k <= 4; k++) {
      const off = k * site.radius * 0.22;
      for (const [ax, az, bx, bz] of [
        [-site.radius, off, site.radius, off],
        [off, -site.radius, off, site.radius]
      ]) {
        const steps = 24;
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps, t1 = (s + 1) / steps;
          const p = (t) => {
            const x = site.x + ax + (bx - ax) * t, z = site.z + az + (bz - az) * t;
            return [padCoords.x + x, padGroundY + surfaceHeight(x, z) + 0.6, padCoords.y + z];
          };
          roadPts.push(...p(t0), ...p(t1));
        }
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(roadPts, 3));
    group.add(new THREE.LineSegments(rg, roadMat));

    classes.forEach((cls, ci) => {
      const mesh = meshes[ci];
      for (let n = 0; n < cls.count; n++) {
        const seed = si * 10000 + ci * 1000 + n;
        // Density falls off from the downtown core; tall towers cluster centrally.
        const dist = Math.sqrt(rand(seed + 1)) * site.radius * (ci === 2 ? 0.45 : ci === 1 ? 0.75 : 1);
        const ang = rand(seed + 2) * Math.PI * 2;
        const grid = site.radius * 0.055;
        const lx = Math.round((site.x + Math.cos(ang) * dist) / grid) * grid;
        const lz = Math.round((site.z + Math.sin(ang) * dist) / grid) * grid;
        if (coastDistance(lx, lz) < 500) continue;
        const falloff = 1 - Math.min(1, Math.hypot(lx - site.x, lz - site.z) / site.radius);
        const w = cls.w[0] + rand(seed + 3) * (cls.w[1] - cls.w[0]);
        const h = (cls.h[0] + rand(seed + 4) * (cls.h[1] - cls.h[0])) * (0.55 + 0.45 * falloff) *
          (ci === 2 ? site.core / 190 : 1);
        dummy.position.set(padCoords.x + lx, padGroundY + surfaceHeight(lx, lz) - 1, padCoords.y + lz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(w, h, w * (0.8 + rand(seed + 5) * 0.5));
        dummy.updateMatrix();
        mesh.setMatrixAt(mesh.userData.used++, dummy.matrix);
      }
    });
  });

  meshes.forEach((m) => {
    m.count = m.userData.used;
    m.instanceMatrix.needsUpdate = true;
    group.add(m);
  });
  group.userData.sites = CITY_SITES;
  return group;
}
