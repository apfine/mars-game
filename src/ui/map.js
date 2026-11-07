import { getMarsHeightFast } from '../terrain/noise.js';
import { earthSurfaceHeight, earthCoastDistance } from '../terrain/earthSurface.js';
import { getMoonHeight } from '../terrain/moonSurface.js';
import { PLANET_PROFILES } from '../flight/planetProfiles.js';
import { sceneRadius } from '../flight/orbitalMechanics.js';
import { universalMapState, solarBodyPositions } from './universalMap.js';

// Minimap (always on, heading arrow, off-screen landmark pointers) and full-screen expedition map.
// Terrain layers are hill-shaded off-screen canvases rebuilt only when needed to stay cheap.
export class MarsMap {
  constructor(hud) {
    this.hud = hud;
    this.mini = document.getElementById('minimap');
    this.full = document.getElementById('map-full');
    this.modal = document.getElementById('map-modal');
    this.open = false;
    this.view = 'local';
    this.frame = 0;
    this.planetId = 'mars';
    this.padX = 1400;
    this.padZ = 1150;
    this.miniLayer = { c: document.createElement('canvas'), cx: 1e9, cz: 1e9, span: 560, res: 64 };
    this.fullLayer = { c: document.createElement('canvas'), cx: 0, cz: 0, span: 3600, res: 96 };
    this._hGrid = new Float32Array(97 * 97);

    const toggle = () => this.toggle();
    document.getElementById('map-btn')?.addEventListener('click', toggle);
    document.getElementById('flight-map-btn')?.addEventListener('click', toggle);
    document.getElementById('minimap')?.addEventListener('click', toggle);
    document.getElementById('close-map')?.addEventListener('click', () => this.toggle(false));
    document.getElementById('map-local-btn')?.addEventListener('click', () => this.setView('local'));
    document.getElementById('map-universal-btn')?.addEventListener('click', () => this.setView('universal'));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.toggle();
      else if (e.code === 'Escape' && this.open) this.toggle(false);
    });
  }

  toggle(force) {
    this.open = force !== undefined ? force : !this.open;
    this.modal?.classList.toggle('active', this.open);
    this.needFull = this.open;
    if (this.open) {
      const actor = this.lastActor;
      this.setView(this.journey?.active || (actor?.altitude || 0) > 50000 ? 'universal' : 'local');
    }
  }

  setView(view) {
    this.view = view === 'universal' ? 'universal' : 'local';
    for (const name of ['local', 'universal']) {
      const button = document.getElementById(`map-${name}-btn`);
      button?.classList.toggle('active', this.view === name);
      button?.setAttribute('aria-pressed', String(this.view === name));
    }
    this.needFull = true;
  }

  setPlanet(planetId, padCoords) {
    this.planetId = planetId;
    if (padCoords) { this.padX = padCoords.x; this.padZ = padCoords.y; }
    this.fullLayer.span = planetId === 'earth' ? 12000 : 3600;
    this.miniLayer.cx = this.fullLayer.cx = 1e9;
    this.needFull = true;
  }

  buildLayer(L, cx, cz) {
    const { c, res, span } = L;
    if (c.width !== res) {
      c.width = c.height = res;
    }
    const g = L.ctx || (L.ctx = c.getContext('2d'));
    const img = L.img || (L.img = g.createImageData(res, res));
    const data = img.data;
    const step = span / res;
    const invStep2 = 2.0 / step;
    const stride = res + 1;
    const hGrid = this._hGrid;

    // Single pass: sample getMarsHeightFast once per grid vertex
    for (let j = 0; j <= res; j++) {
      const wz = cz + (0.5 - j / res) * span;
      const rowOffset = j * stride;
      for (let i = 0; i <= res; i++) {
        const wx = cx + (i / res - 0.5) * span;
        hGrid[rowOffset + i] = this.planetId === 'earth'
          ? earthSurfaceHeight(wx - this.padX, wz - this.padZ)
          : this.planetId === 'moon' ? getMoonHeight(wx, wz)
            : getMarsHeightFast(wx, wz);
      }
    }

    for (let j = 0; j < res; j++) {
      const rowOffset = j * stride;
      for (let i = 0; i < res; i++) {
        const h = hGrid[rowOffset + i + 1];
        const hNW = hGrid[rowOffset + i]; // neighbour to the west/north-west
        const dh = hNW - h;
        const shade = Math.min(1.25, Math.max(0.55, 0.9 + dh * invStep2));
        const t = Math.min(1, Math.max(0, (h + 25) * 0.0142857));
        const k = (j * res + i) * 4;
        if (this.planetId === 'earth') {
          const wx = cx + ((i + 0.5) / res - 0.5) * span - this.padX;
          const wz = cz + (0.5 - (j + 0.5) / res) * span - this.padZ;
          const water = earthCoastDistance(wx, wz) < 0;
          data[k] = Math.min(255, (water ? 35 : 80 + 26 * t) * shade);
          data[k + 1] = Math.min(255, (water ? 111 : 132 + 35 * t) * shade);
          data[k + 2] = Math.min(255, (water ? 157 : 68 + 18 * t) * shade);
        } else if (this.planetId === 'moon') {
          const regolith = Math.min(255, (119 + 35 * t) * shade);
          data[k] = regolith;
          data[k + 1] = regolith;
          data[k + 2] = regolith * 0.96;
        } else {
          data[k] = Math.min(255, (168 + 56 * t) * shade);
          data[k + 1] = Math.min(255, (86 + 70 * t) * shade);
          data[k + 2] = Math.min(255, (56 + 62 * t) * shade);
        }
        data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    L.cx = cx; L.cz = cz;
  }

  draw(canvas, L, p, yaw, pois, beacons, isFull) {
    const ctx = canvas._ctx || (canvas._ctx = canvas.getContext('2d'));
    const W = canvas.width, H = canvas.height;
    const viewSpan = isFull ? L.span : 420;
    const s = W / viewSpan;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (!isFull) { ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip(); }
    ctx.imageSmoothingEnabled = true;
    const size = L.span * s;
    ctx.drawImage(L.c, W / 2 + (L.cx - p.x) * s - size / 2, H / 2 - (L.cz - p.z) * s - size / 2, size, size);
    ctx.fillStyle = this.planetId === 'earth' ? 'rgba(4,27,36,0.10)' : 'rgba(30,12,6,0.18)';
    ctx.fillRect(0, 0, W, H);

    // Tactical Crosshairs
    ctx.strokeStyle = 'rgba(255,180,120,0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
    ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Scientific Range Rings & Metric Annotations
    ctx.strokeStyle = 'rgba(255,200,160,0.28)'; ctx.lineWidth = 1;
    const rings = isFull ? [L.span / 8, L.span / 4, L.span * 3 / 8] : [100, 200];
    ctx.font = '600 8.5px monospace, sans-serif';
    ctx.fillStyle = 'rgba(255,220,190,0.65)';
    ctx.textAlign = 'left';
    for (const r of rings) {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r * s, 0, Math.PI * 2);
      ctx.stroke();
      const rLabel = r >= 1000 ? `${(r / 1000).toFixed(1)}km` : `${Math.round(r)}m`;
      ctx.fillText(rLabel, W / 2 + 4, H / 2 - (r * s) + 10);
    }

    const R = W / 2 - (isFull ? 14 : 10);
    const marker = (wx, wz, color, label, big) => {
      let x = W / 2 + (wx - p.x) * s, y = H / 2 - (wz - p.z) * s;
      const dx = x - W / 2, dy = y - H / 2;
      const d = Math.hypot(dx, dy);
      const clamp = isFull ? (Math.abs(dx) > R || Math.abs(dy) > R) : d > R;
      if (clamp) {
        if (isFull) { const k = R / Math.max(Math.abs(dx), Math.abs(dy)); x = W / 2 + dx * k; y = H / 2 + dy * k; }
        else { x = W / 2 + (dx / d) * R; y = H / 2 + (dy / d) * R; }
      }
      ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath();
      if (clamp && !isFull) {
        const a = Math.atan2(dy, dx);
        ctx.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
        ctx.lineTo(x + Math.cos(a + 2.5) * 5, y + Math.sin(a + 2.5) * 5);
        ctx.lineTo(x + Math.cos(a - 2.5) * 5, y + Math.sin(a - 2.5) * 5);
      } else {
        ctx.arc(x, y, big ? 6 : 4, 0, Math.PI * 2);
      }
      ctx.closePath(); ctx.stroke(); ctx.fill();
      if (isFull && label) {
        ctx.font = '600 11px monospace, sans-serif';
        ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
        const km = Math.hypot(wx - p.x, wz - p.z);
        const t = `${label} · ${km < 1000 ? Math.round(km) + ' m' : (km / 1000).toFixed(1) + ' km'}`;
        ctx.strokeText(t, x + 9, y + 4); ctx.fillText(t, x + 9, y + 4);
      }
    };
    for (const poi of pois) marker(poi.position.x, poi.position.z, '#35e8ff', poi.name.split('(')[0].trim(), true);
    for (const b of beacons) marker(b.position.x, b.position.z, '#ffb02e', b.name, false);

    // Player arrow (forward = +Z = up the map when yaw is 0)
    ctx.translate(W / 2, H / 2);
    ctx.rotate(yaw);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#e8541c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    if (!isFull) {
      // Outer Tactical Bezel
      ctx.strokeStyle = 'rgba(255,200,160,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2); ctx.stroke();

      // Cardinal Azimuth Marks
      ctx.fillStyle = '#ffffff'; ctx.font = '700 9px monospace, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('000° N', W / 2, 13);
      ctx.fillText('090° E', W - 22, H / 2 + 3);
      ctx.fillText('180° S', W / 2, H - 5);
      ctx.fillText('270° W', 22, H / 2 + 3);
    }
  }

  drawUniversal(canvas, actor) {
    const ctx = canvas._ctx || (canvas._ctx = canvas.getContext('2d'));
    const W = canvas.width, H = canvas.height;
    const state = universalMapState(actor, this.journey);
    ctx.fillStyle = '#07111d';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 110; i++) {
      const x = (i * 347.3) % W, y = (i * 193.7) % H;
      ctx.fillStyle = i % 7 ? '#67829b77' : '#d6e8ffbb';
      ctx.fillRect(x, y, i % 9 ? 1 : 2, i % 9 ? 1 : 2);
    }

    const title = document.getElementById('map-title');
    const status = document.getElementById('map-status');
    if (title) title.textContent = state.chart === 'solar' ? 'UNIVERSAL MAP · SOLAR SYSTEM' : 'UNIVERSAL MAP · GARGANTUA SYSTEM';
    if (status) status.textContent = `${state.label} · Player centered · relative system chart`;

    if (state.chart === 'gargantua') {
      const scale = W / 8;
      const project = (x, z) => [W / 2 + (x - state.x) * scale, H / 2 - (z - state.z) * scale];
      const bodies = [
        { x: -3, z: 0, radius: 11, color: '#a288ff', label: 'WORMHOLE · SOLAR SYSTEM' },
        { x: 0, z: 0, radius: 36, color: '#dca977', label: 'GARGANTUA' },
        { x: 2, z: 0, radius: 8, color: '#89b9c1', label: 'MILLER' }
      ];
      ctx.strokeStyle = '#8f789a55'; ctx.lineWidth = 2;
      ctx.beginPath();
      const [gx, gy] = project(0, 0);
      ctx.arc(gx, gy, scale * 2, 0, Math.PI * 2); ctx.stroke();
      for (const body of bodies) {
        const [x, y] = project(body.x, body.z);
        ctx.fillStyle = body.color;
        ctx.beginPath(); ctx.arc(x, y, body.radius, 0, Math.PI * 2); ctx.fill();
        if (body.label === 'GARGANTUA') {
          ctx.fillStyle = '#07070e'; ctx.beginPath(); ctx.arc(x, y, 23, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#ffc778'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(x, y, 48, 18, -0.3, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = '#f6e8d5'; ctx.font = '700 13px monospace';
        ctx.fillText(body.label, Math.min(W - 205, Math.max(8, x + body.radius + 8)), Math.max(18, y - 8));
      }
    } else {
      const bodies = solarBodyPositions(this.journey);
      const sunDistance = Math.hypot(state.x, state.z);
      const maxDistance = Math.max(3, ...bodies.map((b) => Math.hypot(b.x - state.x, b.z - state.z)));
      const focusScale = Math.max(0.35, Math.min(5, sunDistance * 0.35));
      const denom = Math.asinh(maxDistance / focusScale);
      const project = (x, z) => [
        W / 2 + Math.asinh((x - state.x) / focusScale) / denom * W * 0.43,
        H / 2 - Math.asinh((z - state.z) / focusScale) / denom * H * 0.43
      ];
      for (const body of bodies) {
        ctx.strokeStyle = '#6f8aa333'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 96; i++) {
          const a = i / 96 * Math.PI * 2;
          const [x, y] = project(Math.cos(a) * body.au, Math.sin(a) * body.au);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      const [sunX, sunY] = project(0, 0);
      ctx.fillStyle = '#ffd184'; ctx.shadowColor = '#ffad4c'; ctx.shadowBlur = 22;
      ctx.beginPath(); ctx.arc(sunX, sunY, 10, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffe4af'; ctx.font = '700 11px monospace';
      ctx.fillText('SUN', Math.min(W - 40, sunX + 13), Math.max(16, sunY - 8));
      for (const body of bodies) {
        const [x, y] = project(body.x, body.z);
        ctx.fillStyle = `#${body.color.toString(16).padStart(6, '0')}`;
        ctx.beginPath(); ctx.arc(x, y, body.id === 'jupiter' || body.id === 'saturn' ? 7 : 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e6e5e4'; ctx.font = '700 11px monospace';
        ctx.fillText(body.id.toUpperCase(), Math.min(W - 88, x + 9), Math.max(16, y - 7));
      }
      const saturn = bodies.find((b) => b.id === 'saturn');
      if (saturn) {
        const [x, y] = project(saturn.x, saturn.z);
        ctx.fillStyle = '#a998db'; ctx.font = '700 10px monospace';
        ctx.fillText('↗ GARGANTUA VIA WORMHOLE', Math.min(W - 205, x + 10), Math.min(H - 12, y + 22));
      }
      if (status) status.textContent = `${state.label} · ${sunDistance.toFixed(2)} AU from Sun · Auto focused on your position`;
    }

    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#ff783d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '800 14px monospace'; ctx.textAlign = 'left';
    ctx.fillText('YOU', W / 2 + 18, H / 2 + 5);
  }

  drawSpaceLocal(canvas, actor) {
    const ctx = canvas._ctx || (canvas._ctx = canvas.getContext('2d'));
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#07111d'; ctx.fillRect(0, 0, W, H);
    const profile = PLANET_PROFILES[this.planetId] || PLANET_PROFILES.mars;
    const title = document.getElementById('map-title');
    const status = document.getElementById('map-status');
    if (title) title.textContent = `LOCAL MAP · ${this.planetId.toUpperCase()}`;

    if (this.journey?.active) {
      const targetId = this.journey.target;
      const targetProfile = PLANET_PROFILES[targetId];
      const target = targetId === 'moon' ? this.journey.moonEphemeris : this.journey.bodyEphemeris?.get(targetId);
      const dx = target ? target.x - actor.position.x : this.journey.pathEnd.x - actor.position.x;
      const dz = target ? target.z - actor.position.z : this.journey.pathEnd.z - actor.position.z;
      const distance = Math.hypot(dx, dz);
      const radius = targetProfile && this.journey.routeKind === 'kepler'
        ? sceneRadius(targetProfile.radius) * (this.journey.progress > 0.97 ? this.journey.arrivalVisualScale : 1) : 12;
      const span = Math.max(300, distance * 2.4, radius * 5);
      const s = W / span;
      const x = W / 2 + dx * s, y = H / 2 - dz * s;
      ctx.strokeStyle = '#b8894d88'; ctx.setLineDash([7, 7]);
      ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = targetProfile && this.journey.routeKind === 'kepler'
        ? `#${targetProfile.sky.limb.toString(16).padStart(6, '0')}` : '#bd99ff';
      ctx.beginPath(); ctx.arc(x, y, Math.max(7, Math.min(W * 0.35, radius * s)), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 13px monospace'; ctx.fillText(targetId?.toUpperCase() || 'TARGET', Math.min(W - 130, x + 12), Math.max(18, y - 12));
      if (status) status.textContent = `SHIP · ${targetId?.toUpperCase() || 'TARGET'} APPROACH · Auto scale ${Math.round(span).toLocaleString()} scene units`;
    } else {
      const altitude = Math.max(0, actor.altitude || 0);
      const apparent = profile.radius / (profile.radius + altitude);
      const radius = W * 0.32 * apparent;
      ctx.fillStyle = `#${profile.sky.limb.toString(16).padStart(6, '0')}`;
      ctx.beginPath(); ctx.arc(W / 2, H * 0.79, radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b8d3ee66'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(W / 2, H * 0.79, radius + 16, 0, Math.PI * 2); ctx.stroke();
      if (status) status.textContent = `${this.planetId.toUpperCase()} · ${Math.round(altitude).toLocaleString()} m altitude · Auto focused on your ship`;
    }
    ctx.fillStyle = '#ff783d'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '800 14px monospace'; ctx.fillText('YOU', W / 2 + 18, H / 2 + 5);
  }

  update(physics, pois = [], context = {}) {
    this.frame++;
    this.lastActor = physics;
    this.lastContext = context;
    const p = physics.position;
    const beacons = this.hud.userBeacons;
    if (this.mini && !context.flight && this.frame % 6 === 0) {
      const L = this.miniLayer;
      const dx = p.x - L.cx, dz = p.z - L.cz;
      if (dx * dx + dz * dz > 65 * 65) this.buildLayer(L, p.x, p.z);
      this.draw(this.mini, L, p, physics.yaw, pois, beacons, false);
    }
    if (this.open && this.full) {
      if (this.view === 'universal') {
        if (this.needFull || this.frame % 6 === 0) this.drawUniversal(this.full, physics);
      } else if (context.flight && (this.journey?.active || (physics.altitude || 0) > 50000 || !PLANET_PROFILES[this.planetId]?.landable)) {
        if (this.needFull || this.frame % 6 === 0) this.drawSpaceLocal(this.full, physics);
      } else {
        const L = this.fullLayer;
        const dx = p.x - L.cx, dz = p.z - L.cz;
        if (this.needFull || dx * dx + dz * dz > (L.span * 0.18) ** 2) this.buildLayer(L, p.x, p.z);
        if (this.needFull || this.frame % 6 === 0) this.draw(this.full, L, p, physics.yaw || 0, pois, beacons, true);
        const title = document.getElementById('map-title');
        const status = document.getElementById('map-status');
        if (title) title.textContent = `LOCAL MAP · ${this.planetId.toUpperCase()}`;
        if (status) status.textContent = `${this.planetId.toUpperCase()} · ${Math.round(p.x)}, ${Math.round(p.z)} · Player centered · ${Math.round(L.span / 1000)} km span`;
      }
      this.needFull = false;
    }
  }
}
