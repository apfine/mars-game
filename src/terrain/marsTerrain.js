import * as THREE from 'three';
import { getMarsHeight } from './noise.js';

// Mars High-Fidelity Geological Terrain Shader
// Incorporates sedimentary bedrock flagstones (as seen in NASA Curiosity/Perseverance reference),
// wind-blown ripple micro-normals, slope basalt exposure, mineral dust glint,
// and seamless atmospheric horizon fog blending.
export function createMarsTerrainMaterial(options = {}) {
  const uniforms = {
    uSunDirection: { value: new THREE.Vector3(0.5, 0.65, 0.45).normalize() },
    uSunColor: { value: new THREE.Color(0xffe6d0) },
    uAmbientColor: { value: new THREE.Color(0x6a4438) },
    uMarsSandColor: { value: new THREE.Color(0xd08a62) },         // Pale salmon drift sand
    uMarsSandLightColor: { value: new THREE.Color(0xdf9d74) },    // Sun-lit slab tops / crests
    uMarsDuneShadowColor: { value: new THREE.Color(0x7c3e2a) },   // Warm shadow & cracks
    uMarsBedrockColor: { value: new THREE.Color(0xc4724a) },      // Orange sedimentary slabs
    uMarsBasaltRockColor: { value: new THREE.Color(0x7a4632) },   // Darker rust rock on steep faces
    uMarsDustHazeColor: { value: new THREE.Color(0xe0aa8c) },     // Horizon dust haze match
    uGridColor: { value: new THREE.Color(0x28120b) },
    uGridEnabled: { value: options.gridEnabled !== undefined ? options.gridEnabled : 1.0 },
    uGridScale: { value: 10.0 }, // 10 meter topographical survey grid
    uFogNear: { value: 100.0 },
    uFogFar: { value: 520.0 },
    uQuality: { value: 2.0 },    // 0 = Low, 1 = Medium, 2 = High/Ultra
    uCamAltitude: { value: 0.0 }
  };

  const vertexShader = `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying float vSlope;

    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      
      vec3 wNormal = normalize(mat3(modelMatrix) * normal);
      vNormal = wNormal;
      vSlope = 1.0 - clamp(wNormal.y, 0.0, 1.0);

      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = `
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform vec3 uAmbientColor;
    uniform vec3 uMarsSandColor;
    uniform vec3 uMarsSandLightColor;
    uniform vec3 uMarsDuneShadowColor;
    uniform vec3 uMarsBedrockColor;
    uniform vec3 uMarsBasaltRockColor;
    uniform vec3 uMarsDustHazeColor;
    uniform vec3 uGridColor;
    uniform float uGridEnabled;
    uniform float uGridScale;
    uniform float uFogNear;
    uniform float uFogFar;
    uniform float uQuality;
    uniform float uCamAltitude;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying float vSlope;

    const float COS_W = 0.8080275;
    const float SIN_W = 0.5891448;
    const mat2 ROT_W = mat2(COS_W, -SIN_W, SIN_W, COS_W);

    // Fast sin-less GPU hashes (avoids slow SFU trig on mobile/integrated GPUs)
    float hash11(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec2 hash2(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.xx + p3.yz) * p3.zy);
    }

    // Smooth value noise
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash11(i);
      float b = hash11(i + vec2(1.0, 0.0));
      float c = hash11(i + vec2(0.0, 1.0));
      float d = hash11(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    // Voronoi slabs: x = distance to nearest slab border (cracks), y = per-slab random id
    vec2 voronoiBedrock(vec2 p) {
      vec2 n = floor(p);
      vec2 f = fract(p);
      float d1 = 8.0, d2 = 8.0, id = 0.0;
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 o = hash2(n + g);
          vec2 r = g + o - f;
          float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; id = o.x; }
          else if (d < d2) { d2 = d; }
        }
      }
      return vec2(sqrt(d2) - sqrt(d1), id);
    }

    // Wind-warped, meandering sand ripples (evaluated only in near field)
    vec2 sandRipple(vec2 xz) {
      vec2 windUV = ROT_W * xz;
      float warp = vnoise(windUV * vec2(0.35, 0.9)) * 5.0 + vnoise(windUV * 1.7) * 1.2;
      float phase = windUV.y * 7.5 + warp;
      float s = sin(phase);
      float h = s + 0.35 * sin(phase * 2.0 + 1.2);
      float dh = cos(phase) + 0.7 * cos(phase * 2.0 + 1.2);
      return vec2(h, dh);
    }

    void main() {
      vec3 toCam = cameraPosition - vWorldPosition;
      float camDist = length(toCam);
      float horizDist = length(toCam.xz);

      // Use horizontal distance for fog when at high altitude so ground directly beneath is crystal clear during landing!
      float effectiveFogDist = mix(camDist, horizDist, clamp(uCamAltitude / 350.0, 0.0, 1.0));

      // Early exit if completely obscured by distant horizon dust haze
      if (effectiveFogDist >= uFogFar) {
        gl_FragColor = vec4(uMarsDustHazeColor, 1.0);
        return;
      }

      float detailFade = (uQuality > 0.5) ? (1.0 - smoothstep(18.0, 80.0, camDist)) : 0.0;
      float grainFade = (uQuality > 1.5) ? (1.0 - smoothstep(6.0, 42.0, camDist)) : 0.0;

      vec3 N = normalize(vNormal);
      vec2 rip = vec2(0.0);
      float grain = 0.5;

      if (detailFade > 0.005) {
        rip = sandRipple(vWorldPosition.xz);
        float grainBump = 0.0;
        if (grainFade > 0.005) {
          grain = hash11(floor(vWorldPosition.xz * 55.0));
          grainBump = (grain - 0.5) * 0.10 * grainFade;
        }
        float d = rip.y * (0.075 * detailFade) + grainBump;
        N = normalize(N + vec3(-SIN_W * d, 0.0, COS_W * d));
      }

      vec3 L = uSunDirection;
      vec3 V = toCam / max(camDist, 0.001);

      // Diffuse N dot L with soft Martian atmospheric wrap-around
      float NdotL = dot(N, L);
      float diffuse = clamp((NdotL + 0.32) * 0.757575, 0.0, 1.0);

      // 1. Cracked sedimentary flagstone pavement (distance & quality gated)
      float sandMix = smoothstep(0.55, 0.88, vnoise(vWorldPosition.xz * 0.03 + 4.0)) * 0.55;
      float rockSlabFactor = 1.0 - sandMix;
      float steepFactor = smoothstep(0.30, 0.65, vSlope);

      float slabFade = (uQuality > 0.5) ? (1.0 - smoothstep(95.0, 155.0, camDist)) : 0.0;
      vec2 slab = vec2(1.0, 0.5);
      if (slabFade > 0.01) {
        slab = voronoiBedrock(vWorldPosition.xz * 0.33);
      }
      float crack = (1.0 - smoothstep(0.0, 0.1, slab.x)) * slabFade;

      vec3 slabCol = mix(uMarsBedrockColor, uMarsSandLightColor, slab.y * 0.55);
      if (detailFade > 0.005) {
        slabCol *= 0.9 + 0.2 * vnoise(vWorldPosition.xz * 7.0);
      }
      vec3 surfaceAlbedo = mix(slabCol, uMarsSandColor, sandMix);
      surfaceAlbedo = mix(surfaceAlbedo, uMarsDuneShadowColor * 0.55, crack * 0.7 * rockSlabFactor);

      // Multi-scale sand mottling + macro geological albedo for realistic high-altitude descent views
      float mottleMacro = vnoise(vWorldPosition.xz * 0.004);
      float mottleLarge = vnoise(vWorldPosition.xz * 0.045);
      float mottleMid = vnoise(vWorldPosition.xz * 0.35 + 7.3);
      float mottle = mottleLarge * 0.62 + mottleMid * 0.38;
      surfaceAlbedo *= 0.80 + 0.40 * mottle;
      surfaceAlbedo = mix(surfaceAlbedo, uMarsBasaltRockColor * 0.75, smoothstep(0.58, 0.85, mottleMacro) * 0.35);
      surfaceAlbedo = mix(surfaceAlbedo, uMarsDuneShadowColor, smoothstep(0.62, 0.9, mottleLarge) * 0.28);
      surfaceAlbedo = mix(surfaceAlbedo, uMarsSandLightColor * 1.08, smoothstep(0.65, 0.95, mottleMid) * 0.22 * (1.0 - rockSlabFactor));

      if (grainFade > 0.005) {
        surfaceAlbedo *= 1.0 + (grain - 0.5) * 0.28 * grainFade;
      }

      if (detailFade > 0.005) {
        surfaceAlbedo *= 1.0 + rip.x * 0.07 * detailFade * (1.0 - rockSlabFactor * 0.6);
      }

      // Highlights on sunward dune crests & basalt exposure on steep faces
      surfaceAlbedo = mix(surfaceAlbedo, uMarsSandLightColor, smoothstep(0.3, 0.8, NdotL) * 0.4);
      surfaceAlbedo = mix(surfaceAlbedo, uMarsBasaltRockColor, steepFactor);
      surfaceAlbedo = mix(uMarsDuneShadowColor, surfaceAlbedo, smoothstep(-0.25, 0.35, NdotL));

      // Specular glint for silicate / quartz sand grains
      vec3 H = normalize(L + V);
      float NdotH = max(dot(N, H), 0.0);
      float NdotH2 = NdotH * NdotH;
      float NdotH4 = NdotH2 * NdotH2;
      float NdotH16 = NdotH4 * NdotH4;
      float spec = (NdotH16 * NdotH16) * 0.18 * (1.0 - steepFactor);

      if (grainFade > 0.005) {
        float sparkSeed = hash11(floor(vWorldPosition.xz * 38.0) + 13.0);
        float sparkle = step(0.975, sparkSeed) * (NdotH4 * NdotH2) * grainFade * (1.0 - steepFactor);
        spec += sparkle * 0.9;
      }

      vec3 lighting = uAmbientColor + uSunColor * diffuse + vec3(spec);
      vec3 finalColor = surfaceAlbedo * lighting;

      // 3. Topographical / Surveyor Grid Overlay
      if (uGridEnabled > 0.5 && camDist < 225.0) {
        vec2 gridCoord = vWorldPosition.xz / uGridScale;
        vec2 gridWidth = fwidth(gridCoord) * 1.05;
        vec2 gridFrac = abs(fract(gridCoord - 0.5) - 0.5);
        vec2 lineFactor = smoothstep(gridWidth * 1.4, vec2(0.0), gridFrac);
        float gridIntensity = max(lineFactor.x, lineFactor.y);
        float gridFade = clamp(1.0 - (camDist - 35.0) / 190.0, 0.0, 1.0);
        finalColor = mix(finalColor, uGridColor, gridIntensity * gridFade * 0.45);
      }

      // 4. Seamless Atmospheric Distance Fog (blends edge of chunk grid into regional surface & horizon)
      float fogFactor = clamp((effectiveFogDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
      fogFactor = fogFactor * (fogFactor * 0.4 + 0.6);

      finalColor = mix(finalColor, uMarsDustHazeColor, fogFactor);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    wireframe: false,
    flatShading: false
  });
}

// Terrain Chunk Dimensions & Progressive Streaming Configuration
export const CHUNK_SIZE = 120.0;
export const CHUNK_SEGMENTS = 28; // 28x28 grid: fast generation with shader micro-normal detail
export const GRID_RADIUS = 3;     // 7x7 = 49 total active chunks covering ~840m x 840m

export class MarsTerrainManager {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.material = createMarsTerrainMaterial(options);
    this.chunks = new Map();
    this.chunkPool = []; // Recycled chunk meshes to eliminate geometry clone/dispose GC spikes
    this.geometryTemplate = null;
    this.lastPlayerChunkX = NaN;
    this.lastPlayerChunkZ = NaN;
    this.pendingChunks = []; // Queue for progressive smooth chunk generation without lag spikes
    this.initializedChunks = false;
  }

  setQuality(preset) {
    const qVal = preset === 'Low' ? 0.0 : preset === 'Medium' ? 1.0 : 2.0;
    this.material.uniforms.uQuality.value = qVal;
  }

  setCameraAltitude(alt) {
    const a = Math.max(0, alt);
    this.material.uniforms.uCamAltitude.value = a;
    // Keep chunk border fog aligned with the 420m chunk grid radius so chunks blend seamlessly into the regional planet surface
    this.material.uniforms.uFogNear.value = 110.0 + Math.min(140.0, a * 0.25);
    this.material.uniforms.uFogFar.value = 395.0;
  }

  getChunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  getGeometry() {
    if (!this.geometryTemplate) {
      this.geometryTemplate = new THREE.PlaneGeometry(
        CHUNK_SIZE,
        CHUNK_SIZE,
        CHUNK_SEGMENTS,
        CHUNK_SEGMENTS
      );
      this.geometryTemplate.rotateX(-Math.PI / 2);
      // Store template X/Z coordinates for fast reset when pooling
      const pos = this.geometryTemplate.attributes.position;
      this.templateXZ = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        this.templateXZ[i * 2] = pos.getX(i);
        this.templateXZ[i * 2 + 1] = pos.getZ(i);
      }
    }
    return this.geometryTemplate.clone();
  }

  createChunkMesh(cx, cz) {
    let mesh;
    let geo;
    if (this.chunkPool.length > 0) {
      mesh = this.chunkPool.pop();
      geo = mesh.geometry;
      mesh.visible = true;
    } else {
      geo = this.getGeometry();
      mesh = new THREE.Mesh(geo, this.material);
      mesh.receiveShadow = false; // Custom ShaderMaterial doesn't sample Three.js shadowMap
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
    }

    const posAttr = geo.attributes.position;
    const posArr = posAttr.array;
    const xz = this.templateXZ;
    const originX = cx * CHUNK_SIZE;
    const originZ = cz * CHUNK_SIZE;

    // Apply procedural continuous Mars elevation directly on typed array
    for (let i = 0, count = posAttr.count; i < count; i++) {
      const lx = xz[i * 2];
      const lz = xz[i * 2 + 1];
      posArr[i * 3 + 1] = getMarsHeight(originX + lx, originZ + lz);
    }
    posAttr.needsUpdate = true;

    geo.computeVertexNormals();
    if (geo.boundingSphere) {
      geo.computeBoundingSphere();
    }

    mesh.position.set(originX, 0, originZ);
    mesh.updateMatrix();
    mesh.updateMatrixWorld(true);

    return {
      cx,
      cz,
      mesh
    };
  }

  update(playerPos) {
    const pcx = Math.floor((playerPos.x + CHUNK_SIZE * 0.5) / CHUNK_SIZE);
    const pcz = Math.floor((playerPos.z + CHUNK_SIZE * 0.5) / CHUNK_SIZE);

    if (pcx !== this.lastPlayerChunkX || pcz !== this.lastPlayerChunkZ) {
      this.lastPlayerChunkX = pcx;
      this.lastPlayerChunkZ = pcz;

      const neededKeys = new Set();
      const chunksToGenerate = [];

      // Sort candidate chunks by proximity so closest chunks are built first
      for (let dx = -GRID_RADIUS; dx <= GRID_RADIUS; dx++) {
        for (let dz = -GRID_RADIUS; dz <= GRID_RADIUS; dz++) {
          const cx = pcx + dx;
          const cz = pcz + dz;
          const key = this.getChunkKey(cx, cz);
          neededKeys.add(key);

          if (!this.chunks.has(key)) {
            const distSq = dx * dx + dz * dz;
            chunksToGenerate.push({ cx, cz, key, distSq });
          }
        }
      }

      // Recycle distant chunks outside active radius into pool BEFORE generating new ones
      for (const [key, chunk] of this.chunks.entries()) {
        if (!neededKeys.has(key)) {
          chunk.mesh.visible = false;
          this.chunkPool.push(chunk.mesh);
          this.chunks.delete(key);
        }
      }

      // Sort closest first
      chunksToGenerate.sort((a, b) => a.distSq - b.distSq);

      if (!this.initializedChunks) {
        this.initializedChunks = true;
        // Build immediate 9 chunks surrounding the player instantly
        const immediate = chunksToGenerate.filter((c) => c.distSq <= 2);
        const outer = chunksToGenerate.filter((c) => c.distSq > 2);
        for (const item of immediate) {
          if (!this.chunks.has(item.key)) {
            const chunk = this.createChunkMesh(item.cx, item.cz);
            this.chunks.set(item.key, chunk);
          }
        }
        this.pendingChunks = outer;
      } else {
        this.pendingChunks = chunksToGenerate;
      }
    }

    // Smooth Progressive Chunk Generation (1 chunk per frame to prevent frame hitches)
    if (this.pendingChunks.length > 0) {
      const item = this.pendingChunks.shift();
      if (item && !this.chunks.has(item.key)) {
        const chunk = this.createChunkMesh(item.cx, item.cz);
        this.chunks.set(item.key, chunk);
      }
    }
  }

  setGridEnabled(enabled) {
    this.material.uniforms.uGridEnabled.value = enabled ? 1.0 : 0.0;
  }

  dispose() {
    for (const chunk of this.chunks.values()) {
      this.scene.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
    }
    for (const mesh of this.chunkPool) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.chunks.clear();
    this.chunkPool.length = 0;
    this.material.dispose();
    if (this.geometryTemplate) {
      this.geometryTemplate.dispose();
    }
  }
}
