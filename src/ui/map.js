import { getMarsHeightFast } from '../terrain/noise.js';

// Minimap (always on, heading arrow, off-screen landmark pointers) and full-screen expedition map.
// Terrain layers are hill-shaded off-screen canvases rebuilt only when needed to stay cheap.
export class MarsMap {
  constructor(hud) {
    this.hud = hud;
    this.mini = document.getElementById('minimap');
    this.full = document.getElementById('map-full');
    this.modal = document.getElementById('map-modal');
    this.open = false;
    this.frame = 0;
    this.miniLayer = { c: document.createElement('canvas'), cx: 1e9, cz: 1e9, span: 560, res: 64 };
    this.fullLayer = { c: document.createElement('canvas'), cx: 0, cz: 0, span: 3600, res: 96 };
    this._hGrid = new Float32Array(97 * 97);

    const toggle = () => this.toggle();
    document.getElementById('map-btn')?.addEventListener('click', toggle);
    document.getElementById('minimap')?.addEventListener('click', toggle);
    document.getElementById('close-map')?.addEventListener('click', () => this.toggle(false));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyG') this.toggle();
      else if (e.code === 'Escape' && this.open) this.toggle(false);
    });
  }

  toggle(force) {
    this.open = force !== undefined ? force : !this.open;
    this.modal?.classList.toggle('active', this.open);
    this.needFull = this.open;
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
        hGrid[rowOffset + i] = getMarsHeightFast(wx, wz);
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
        data[k] = Math.min(255, (168 + 56 * t) * shade);
        data[k + 1] = Math.min(255, (86 + 70 * t) * shade);
        data[k + 2] = Math.min(255, (56 + 62 * t) * shade);
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
    ctx.fillStyle = 'rgba(30,12,6,0.18)';
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
    const rings = isFull ? [500, 1000, 1500] : [100, 200];
    ctx.font = '600 8.5px monospace, sans-serif';
    ctx.fillStyle = 'rgba(255,220,190,0.65)';
    ctx.textAlign = 'left';
    for (const r of rings) {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r * s, 0, Math.PI * 2);
      ctx.stroke();
      const rLabel = r >= 1000 ? `${(r / 1000).toFixed(1)}k` : `${r}m`;
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

  update(physics, pois) {
    this.frame++;
    const p = physics.position;
    const beacons = this.hud.userBeacons;
    if (this.mini && this.frame % 6 === 0) {
      const L = this.miniLayer;
      const dx = p.x - L.cx, dz = p.z - L.cz;
      if (dx * dx + dz * dz > 65 * 65) this.buildLayer(L, p.x, p.z);
      this.draw(this.mini, L, p, physics.yaw, pois, beacons, false);
    }
    if (this.open && this.full) {
      const L = this.fullLayer;
      if (this.needFull) { this.buildLayer(L, p.x, p.z); this.needFull = false; }
      if (this.frame % 6 === 0) this.draw(this.full, L, p, physics.yaw, pois, beacons, true);
    }
  }
}
