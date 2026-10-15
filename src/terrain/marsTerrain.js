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
    uFogFar: { value: 520.0 }
  };

  const vertexShader = `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vSlope;

    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      
      vec3 wNormal = normalize(mat3(modelMatrix) * normal);
      vNormal = wNormal;
      vSlope = 1.0 - clamp(dot(wNormal, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
      vUv = uv;

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

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vSlope;

    // Fast 2D pseudo hash
    vec2 hash2(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return fract(sin(p) * 43758.5453);
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

    float hash11(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
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

    // Wind-warped, meandering sand ripples (wavy crests like real aeolian ripples)
    // Returns ripple height phase in .x and crest derivative in .y
    vec2 sandRipple(vec2 xz) {
      float windAngle = 0.63;
      mat2 rot = mat2(cos(windAngle), -sin(windAngle), sin(windAngle), cos(windAngle));
      vec2 windUV = rot * xz;
      float warp = vnoise(windUV * vec2(0.35, 0.9)) * 5.0 + vnoise(windUV * 1.7) * 1.2;
      float phase = windUV.y * 7.5 + warp;
      // Asymmetric ripple profile: gentle windward face, steep lee face
      float s = sin(phase);
      float h = s + 0.35 * sin(phase * 2.0 + 1.2);
      float dh = cos(phase) + 0.7 * cos(phase * 2.0 + 1.2);
      return vec2(h, dh);
    }

    // Wind ripple micro-normal perturbation (faded with distance to avoid aliasing)
    vec3 getDetailedNormal(vec3 worldPos, vec3 baseNormal, float distFade) {
      float windAngle = 0.63;
      vec2 r = sandRipple(worldPos.xz);
      float grainBump = (hash11(floor(worldPos.xz * 55.0)) - 0.5) * 0.10 * distFade;
      float strength = 0.075 * distFade;
      float d = r.y * strength + grainBump;
      vec3 perturbed = baseNormal + vec3(-sin(windAngle) * d, 0.0, cos(windAngle) * d);
      return normalize(perturbed);
    }

    void main() {
      float camDist = length(vWorldPosition - cameraPosition);
      float detailFade = 1.0 - smoothstep(18.0, 85.0, camDist);
      float grainFade = 1.0 - smoothstep(6.0, 45.0, camDist);

      vec3 N = getDetailedNormal(vWorldPosition, vNormal, detailFade);
      vec3 L = normalize(uSunDirection);
      vec3 V = normalize(cameraPosition - vWorldPosition);

      // Diffuse N dot L with soft Martian atmospheric wrap-around
      float NdotL = dot(N, L);
      float wrap = 0.32;
      float diffuse = clamp((NdotL + wrap) / (1.0 + wrap), 0.0, 1.0);

      // 1. Cracked sedimentary flagstone pavement (reference photo): slabs of varying tint separated by
      // dark cracks, with sand drifts pooling in low patches
      vec2 slab = voronoiBedrock(vWorldPosition.xz * 0.33);
      float crack = 1.0 - smoothstep(0.0, 0.1, slab.x);
      float sandMix = smoothstep(0.55, 0.88, vnoise(vWorldPosition.xz * 0.03 + 4.0)) * 0.55;
      float rockSlabFactor = 1.0 - sandMix;

      // 2. Steep slopes shed sand and show darker rust rock
      float steepFactor = smoothstep(0.30, 0.65, vSlope);

      vec3 slabCol = mix(uMarsBedrockColor, uMarsSandLightColor, slab.y * 0.55);
      slabCol *= 0.9 + 0.2 * vnoise(vWorldPosition.xz * 7.0) + (vnoise(vWorldPosition.xz * 1.3) - 0.5) * 0.12;
      vec3 surfaceAlbedo = mix(slabCol, uMarsSandColor, sandMix);
      surfaceAlbedo = mix(surfaceAlbedo, uMarsDuneShadowColor * 0.55, crack * 0.7 * rockSlabFactor);

      // Multi-scale sand mottling: broad drifts, medium patches, fine speckle
      float mottleLarge = vnoise(vWorldPosition.xz * 0.045);
      float mottleMid = vnoise(vWorldPosition.xz * 0.35 + 7.3);
      float mottleFine = vnoise(vWorldPosition.xz * 2.4 + 31.7);
      float mottle = mottleLarge * 0.5 + mottleMid * 0.32 + mottleFine * 0.18;
      surfaceAlbedo *= 0.80 + 0.40 * mottle;
      // Darker, iron-rich dust patches and paler wind-swept patches
      surfaceAlbedo = mix(surfaceAlbedo, uMarsDuneShadowColor, smoothstep(0.62, 0.9, mottleLarge) * 0.28);
      surfaceAlbedo = mix(surfaceAlbedo, uMarsSandLightColor * 1.08, smoothstep(0.65, 0.95, mottleMid) * 0.22 * (1.0 - rockSlabFactor));

      // Individual sand grain variation (near field only)
      float grain = hash11(floor(vWorldPosition.xz * 55.0));
      surfaceAlbedo *= 1.0 + (grain - 0.5) * 0.28 * grainFade;

      // Ripple troughs collect darker, finer dust; crests are lighter coarse grains
      vec2 rip = sandRipple(vWorldPosition.xz);
      surfaceAlbedo *= 1.0 + rip.x * 0.07 * detailFade * (1.0 - rockSlabFactor * 0.6);

      // Highlights on sunward dune crests
      surfaceAlbedo = mix(surfaceAlbedo, uMarsSandLightColor, smoothstep(0.3, 0.8, NdotL) * 0.4);

      // Steep crests expose dark volcanic basalt rock
      surfaceAlbedo = mix(surfaceAlbedo, uMarsBasaltRockColor, steepFactor);

      // Subtle dune self-shadow tinting
      surfaceAlbedo = mix(uMarsDuneShadowColor, surfaceAlbedo, smoothstep(-0.25, 0.35, NdotL));

      // Specular glint for silicate / quartz sand grains
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), 28.0) * 0.18 * (1.0 - steepFactor);

      // Sparkling individual quartz grains catching the sun
      float sparkSeed = hash11(floor(vWorldPosition.xz * 38.0) + 13.0);
      float sparkle = step(0.975, sparkSeed) * pow(max(dot(N, H), 0.0), 6.0) * grainFade * (1.0 - steepFactor);
      spec += sparkle * 0.9;

      vec3 lighting = uAmbientColor + uSunColor * diffuse + vec3(spec);
      vec3 finalColor = surfaceAlbedo * lighting;

      // 3. Topographical / Surveyor Grid Overlay
      if (uGridEnabled > 0.5) {
        vec2 gridCoord = vWorldPosition.xz / uGridScale;
        vec2 gridWidth = fwidth(gridCoord) * 1.05;
        vec2 gridFrac = abs(fract(gridCoord - 0.5) - 0.5);
        vec2 lineFactor = smoothstep(gridWidth * 1.4, vec2(0.0), gridFrac);
        float gridIntensity = max(lineFactor.x, lineFactor.y);

        // Smooth distance fade to prevent moire artifacts
        float distToCam = distance(cameraPosition, vWorldPosition);
        float gridFade = clamp(1.0 - (distToCam - 35.0) / 190.0, 0.0, 1.0);
        
        finalColor = mix(finalColor, uGridColor, gridIntensity * gridFade * 0.45);
      }

      // 4. Seamless Atmospheric Distance Fog
      // Reaches 100% opacity smoothly before terrain chunk edges, completely eliminating popping/glitches
      float dist = length(vWorldPosition - cameraPosition);
      float fogFactor = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
      fogFactor = pow(fogFactor, 1.4); // Natural atmospheric perspective curve

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
export const CHUNK_SEGMENTS = 48; // 2.5m cells: resolves bedrock ledges, ramps and steep dunes
export const GRID_RADIUS = 3;     // 7x7 = 49 total active chunks covering ~840m x 840m

export class MarsTerrainManager {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.material = createMarsTerrainMaterial(options);
    this.chunks = new Map();
    this.geometryTemplate = null;
    this.lastPlayerChunkX = NaN;
    this.lastPlayerChunkZ = NaN;
    this.pendingChunks = []; // Queue for progressive smooth chunk generation without lag spikes
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
    }
    return this.geometryTemplate.clone();
  }

  createChunkMesh(cx, cz) {
    const geo = this.getGeometry();
    const posAttr = geo.attributes.position;
    const originX = cx * CHUNK_SIZE;
    const originZ = cz * CHUNK_SIZE;

    // Apply procedural continuous Mars elevation
    for (let i = 0; i < posAttr.count; i++) {
      const lx = posAttr.getX(i);
      const lz = posAttr.getZ(i);
      const wx = originX + lx;
      const wz = originZ + lz;
      const wy = getMarsHeight(wx, wz);
      posAttr.setY(i, wy);
    }

    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(originX, 0, originZ);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    this.scene.add(mesh);

    return {
      cx,
      cz,
      mesh,
      disposed: false
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

      // Sort closest first
      chunksToGenerate.sort((a, b) => a.distSq - b.distSq);
      this.pendingChunks = chunksToGenerate;

      // Remove distant chunks outside active radius
      for (const [key, chunk] of this.chunks.entries()) {
        if (!neededKeys.has(key)) {
          this.scene.remove(chunk.mesh);
          chunk.mesh.geometry.dispose();
          this.chunks.delete(key);
        }
      }
    }

    // Smooth Progressive Chunk Generation (max 2 chunks per frame to guarantee 60fps)
    if (this.pendingChunks.length > 0) {
      const budget = 2;
      for (let b = 0; b < budget && this.pendingChunks.length > 0; b++) {
        const item = this.pendingChunks.shift();
        if (!this.chunks.has(item.key)) {
          const chunk = this.createChunkMesh(item.cx, item.cz);
          this.chunks.set(item.key, chunk);
        }
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
    this.chunks.clear();
    this.material.dispose();
    if (this.geometryTemplate) {
      this.geometryTemplate.dispose();
    }
  }
}
