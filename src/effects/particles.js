import * as THREE from 'three';

// Soft billowing sprite particle pool (single draw call, per-particle size/alpha/color).
// CPU simulated; kept light enough for mobile.
export class SoftParticlePool {
  constructor(scene, count, { additive = false, softness = 1.0, maxPointSize = 220 } = {}) {
    this.count = count;
    this.cursor = 0;

    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count).fill(1);
    this.size0 = new Float32Array(count);
    this.size1 = new Float32Array(count);
    this.alpha0 = new Float32Array(count);
    this.drag = new Float32Array(count).fill(1);
    this.gravity = new Float32Array(count);
    this.col0 = new Float32Array(count * 3);
    this.col1 = new Float32Array(count * 3);
    this.alive = new Uint8Array(count);

    this.aSize = new Float32Array(count);
    this.aAlpha = new Float32Array(count);
    this.aColor = new Float32Array(count * 3);
    this.aSeed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.aSeed[i] = Math.random() * 10.0;
      this.pos[i * 3 + 1] = -9999;
    }

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    this.sizeAttr = new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.aAlpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(this.aColor, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSize', this.sizeAttr);
    geo.setAttribute('aAlpha', this.alphaAttr);
    geo.setAttribute('aColor', this.colorAttr);
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.aSeed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
      uniforms: {
        uScale: { value: 700.0 },
        uSoftness: { value: softness },
        uMaxSize: { value: maxPointSize }
      },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        attribute float aSeed;
        uniform float uScale;
        uniform float uMaxSize;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vSeed;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float ps = aSize * uScale / max(0.5, -mv.z);
          gl_PointSize = clamp(ps, 0.0, uMaxSize);
          vAlpha = aAlpha;
          vColor = aColor;
          vSeed = aSeed;
        }
      `,
      fragmentShader: `
        uniform float uSoftness;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vSeed;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float d2 = dot(p, p);
          if (d2 > 1.0 || vAlpha < 0.004) discard;
          float d = sqrt(d2);
          // Fast billow edge without slow atan() per fragment
          float lump = 0.84 + 0.16 * sin(p.x * 3.2 + vSeed) * cos(p.y * 3.2 - vSeed * 0.7);
          float a = 1.0 - smoothstep(lump * (1.0 - 0.45 * uSoftness), lump, d);
          a *= 1.0 - d * 0.35;
          gl_FragColor = vec4(vColor, a * vAlpha);
        }
      `
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
    this.activeCount = 0;
    this.dirty = false;
    scene.add(this.points);
  }

  setViewScale(heightPx, fovDeg) {
    this.material.uniforms.uScale.value = heightPx / (2.0 * Math.tan(THREE.MathUtils.degToRad(fovDeg) * 0.5));
  }

  // Emit a particle into the ring buffer (oldest is recycled if the pool is full)
  emit(o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const i3 = i * 3;
    if (!this.alive[i]) {
      this.alive[i] = 1;
      this.activeCount++;
    }
    this.pos[i3] = o.x; this.pos[i3 + 1] = o.y; this.pos[i3 + 2] = o.z;
    this.vel[i3] = o.vx; this.vel[i3 + 1] = o.vy; this.vel[i3 + 2] = o.vz;
    this.life[i] = 0;
    this.maxLife[i] = o.life;
    this.size0[i] = o.size0;
    this.size1[i] = o.size1;
    this.alpha0[i] = o.alpha;
    this.drag[i] = o.drag !== undefined ? o.drag : 1.0;
    this.gravity[i] = o.gravity || 0;
    this.col0[i3] = o.c0r; this.col0[i3 + 1] = o.c0g; this.col0[i3 + 2] = o.c0b;
    this.col1[i3] = o.c1r !== undefined ? o.c1r : o.c0r;
    this.col1[i3 + 1] = o.c1g !== undefined ? o.c1g : o.c0g;
    this.col1[i3 + 2] = o.c1b !== undefined ? o.c1b : o.c0b;
    this.dirty = true;
    return i;
  }

  update(dt, wind) {
    if (this.activeCount === 0 && !this.dirty) return;

    const windX = wind ? wind.x * dt * 0.6 : 0;
    const windZ = wind ? wind.z * dt * 0.6 : 0;
    const dt60 = Math.min(3.0, dt * 60.0);

    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const i3 = i * 3;
      const newLife = this.life[i] + dt;
      this.life[i] = newLife;
      const t = newLife / this.maxLife[i];
      if (t >= 1.0) {
        this.alive[i] = 0;
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.aAlpha[i] = 0;
        this.pos[i3 + 1] = -9999;
        continue;
      }
      const damp = Math.max(0.0, 1.0 - (1.0 - this.drag[i]) * dt60);
      const vx = this.vel[i3] * damp + windX;
      const vy = this.vel[i3 + 1] * damp + this.gravity[i] * dt;
      const vz = this.vel[i3 + 2] * damp + windZ;
      this.vel[i3] = vx;
      this.vel[i3 + 1] = vy;
      this.vel[i3 + 2] = vz;
      this.pos[i3] += vx * dt;
      this.pos[i3 + 1] += vy * dt;
      this.pos[i3 + 2] += vz * dt;

      const invT = 1.0 - t;
      const ease = 1.0 - invT * invT;
      this.aSize[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * ease;
      // Quick fade-in, long fade-out
      const fadeIn = t < 0.125 ? t * 8.0 : 1.0;
      this.aAlpha[i] = this.alpha0[i] * fadeIn * invT * (1.0 - t * 0.4);
      this.aColor[i3] = this.col0[i3] + (this.col1[i3] - this.col0[i3]) * t;
      this.aColor[i3 + 1] = this.col0[i3 + 1] + (this.col1[i3 + 1] - this.col0[i3 + 1]) * t;
      this.aColor[i3 + 2] = this.col0[i3 + 2] + (this.col1[i3 + 2] - this.col0[i3 + 2]) * t;
    }
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.dirty = false;
  }
}
