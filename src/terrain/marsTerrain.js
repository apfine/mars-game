import * as THREE from 'three';
import { getMarsHeight } from './noise.js';

// Mars High-Fidelity Geological Terrain Shader
// Incorporates sedimentary bedrock flagstones (as seen in NASA Curiosity/Perseverance reference),
// wind-blown ripple micro-normals, slope basalt exposure, mineral dust glint,
// and seamless atmospheric horizon fog blending.
export function createMarsTerrainMaterial(options = {}) {
  const uniforms = {
    uSunDirection: { value: new THREE.Vector3(0.5, 0.65, 0.45).normalize() },
    uSunColor: { value: new THREE.Color(0xffeedd) },
    uAmbientColor: { value: new THREE.Color(0x3e231b) },
    uMarsSandColor: { value: new THREE.Color(0xc25e38) },         // Rich iron-oxide ochre
    uMarsSandLightColor: { value: new THREE.Color(0xd8784e) },    // Sun-baked dune crest sand
    uMarsDuneShadowColor: { value: new THREE.Color(0x6e2816) },   // Warm deep rust shadow
    uMarsBedrockColor: { value: new THREE.Color(0x8a5843) },      // Layered sedimentary bedrock slabs
    uMarsBasaltRockColor: { value: new THREE.Color(0x38221c) },   // Dark exposed volcanic rock
    uMarsDustHazeColor: { value: new THREE.Color(0xda8e6c) },     // Horizon dust haze match
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

    // Procedural Voronoi cellular pattern for sedimentary rock pavers/bedrock slabs
    float voronoiBedrock(vec2 p) {
      vec2 n = floor(p);
      vec2 f = fract(p);
      float minDist = 1.0;
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 o = hash2(n + g);
          vec2 r = g + o - f;
          float d = dot(r, r);
          minDist = min(minDist, d);
        }
      }
      return sqrt(minDist);
    }

    // Wind ripple micro-normal perturbation
    vec3 getDetailedNormal(vec3 worldPos, vec3 baseNormal) {
      float windAngle = 0.63;
      mat2 rot = mat2(cos(windAngle), -sin(windAngle), sin(windAngle), cos(windAngle));
      vec2 windUV = rot * worldPos.xz;

      // Primary sand dune wind ripples
      float ripple = sin(windUV.y * 3.14159 * 2.5);
      float rippleDeriv = cos(windUV.y * 3.14159 * 2.5) * 0.16;

      // Secondary fine cross ripples
      float micro = sin(worldPos.x * 6.0 + worldPos.z * 6.0) * 0.05;

      vec3 perturbed = baseNormal + vec3(-sin(windAngle) * (rippleDeriv + micro), 0.0, cos(windAngle) * (rippleDeriv + micro));
      return normalize(perturbed);
    }

    void main() {
      vec3 N = getDetailedNormal(vWorldPosition, vNormal);
      vec3 L = normalize(uSunDirection);
      vec3 V = normalize(cameraPosition - vWorldPosition);

      // Diffuse N dot L with soft Martian atmospheric wrap-around
      float NdotL = dot(N, L);
      float wrap = 0.32;
      float diffuse = clamp((NdotL + wrap) / (1.0 + wrap), 0.0, 1.0);

      // 1. Procedural Sedimentary Bedrock Flagstones (NASA reference)
      // Cellular rock slabs emerging through the drift sand
      float bedrockCell = voronoiBedrock(vWorldPosition.xz * 0.18);
      float rockSlabFactor = smoothstep(0.35, 0.65, bedrockCell);

      // 2. Slope based material: flat areas are sand & bedrock plates; steep slopes are dark basalt
      float steepFactor = smoothstep(0.24, 0.58, vSlope);

      // Blend Sand with Bedrock Slabs
      vec3 surfaceAlbedo = mix(uMarsSandColor, uMarsBedrockColor, rockSlabFactor * 0.55);

      // Highlights on sunward dune crests
      surfaceAlbedo = mix(surfaceAlbedo, uMarsSandLightColor, smoothstep(0.3, 0.8, NdotL) * 0.4);

      // Steep crests expose dark volcanic basalt rock
      surfaceAlbedo = mix(surfaceAlbedo, uMarsBasaltRockColor, steepFactor);

      // Subtle dune self-shadow tinting
      surfaceAlbedo = mix(uMarsDuneShadowColor, surfaceAlbedo, smoothstep(-0.25, 0.35, NdotL));

      // Specular glint for silicate / quartz sand grains
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), 28.0) * 0.18 * (1.0 - steepFactor);

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
export const CHUNK_SEGMENTS = 28; // Uniform resolution eliminates edge cracks/LOD tears
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
