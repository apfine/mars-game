import * as THREE from 'three';
import { getMarsHeight } from './noise.js';

// Mars custom shader material with procedural wind ripples, rock slope tinting,
// surveyor topography grid (drune.io style), and atmospheric depth fog.
export function createMarsTerrainMaterial(options = {}) {
  const uniforms = {
    uSunDirection: { value: new THREE.Vector3(0.5, 0.7, 0.4).normalize() },
    uSunColor: { value: new THREE.Color(0xffeedd) },
    uAmbientColor: { value: new THREE.Color(0x3a221a) },
    uMarsSandColor: { value: new THREE.Color(0xc95e3a) },
    uMarsDuneShadowColor: { value: new THREE.Color(0x782f1b) },
    uMarsRockColor: { value: new THREE.Color(0x381f18) },
    uMarsDustHazeColor: { value: new THREE.Color(0xd98d6c) },
    uGridColor: { value: new THREE.Color(0x28120b) },
    uGridEnabled: { value: options.gridEnabled !== undefined ? options.gridEnabled : 1.0 },
    uGridScale: { value: 10.0 }, // 10 meter grid lines like drune.io
    uFogNear: { value: 60.0 },
    uFogFar: { value: 600.0 }
  };

  const vertexShader = `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vSlope;

    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      
      // Calculate true normal
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
    uniform vec3 uMarsDuneShadowColor;
    uniform vec3 uMarsRockColor;
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

    // Procedural sand ripple micro-normal
    vec3 getSandNormal(vec3 worldPos, vec3 baseNormal) {
      // Wind direction ~ 35 degrees
      float windAngle = 0.62;
      mat2 rot = mat2(cos(windAngle), -sin(windAngle), sin(windAngle), cos(windAngle));
      vec2 windUV = rot * worldPos.xz * 1.5;

      // Small sharp wind ripples
      float ripple = sin(windUV.y * 3.14159 * 2.0);
      float rippleDeriv = cos(windUV.y * 3.14159 * 2.0) * 0.18;

      vec3 perturbed = baseNormal + vec3(-sin(windAngle) * rippleDeriv, 0.0, cos(windAngle) * rippleDeriv);
      return normalize(perturbed);
    }

    void main() {
      vec3 N = getSandNormal(vWorldPosition, vNormal);
      vec3 L = normalize(uSunDirection);
      vec3 V = normalize(cameraPosition - vWorldPosition);

      // Diffuse N dot L with soft Martian dust wrap-around
      float NdotL = dot(N, L);
      float wrap = 0.35;
      float diffuse = clamp((NdotL + wrap) / (1.0 + wrap), 0.0, 1.0);

      // Slope-based material blending: flat areas are fine red sand; steep crests expose dark basaltic rock
      float rockFactor = smoothstep(0.28, 0.65, vSlope);
      vec3 albedo = mix(uMarsSandColor, uMarsRockColor, rockFactor);

      // Subtle dune self-shadow tint
      albedo = mix(uMarsDuneShadowColor, albedo, smoothstep(-0.2, 0.4, NdotL));

      // Specular sheen for fine mineral dust grains
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), 32.0) * 0.15 * (1.0 - rockFactor);

      vec3 lighting = uAmbientColor + uSunColor * diffuse + vec3(spec);
      vec3 finalColor = albedo * lighting;

      // Topographic / Surveyor Grid Overlay (as seen in drune.io)
      if (uGridEnabled > 0.5) {
        vec2 gridCoord = vWorldPosition.xz / uGridScale;
        vec2 gridWidth = fwidth(gridCoord) * 1.1;
        vec2 gridFrac = abs(fract(gridCoord - 0.5) - 0.5);
        vec2 lineFactor = smoothstep(gridWidth * 1.5, vec2(0.0), gridFrac);
        float gridIntensity = max(lineFactor.x, lineFactor.y);

        // Fade grid with distance so it doesn't cause high-frequency moire
        float distToCam = distance(cameraPosition, vWorldPosition);
        float gridFade = clamp(1.0 - (distToCam - 40.0) / 180.0, 0.0, 1.0);
        
        finalColor = mix(finalColor, uGridColor, gridIntensity * gridFade * 0.48);
      }

      // Mars Atmospheric Distance Fog
      float dist = length(vWorldPosition - cameraPosition);
      float fogFactor = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
      fogFactor = pow(fogFactor, 1.35); // Gentle curve

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

// Chunk Size & Infinite Streaming Configuration
export const CHUNK_SIZE = 120.0;
export const CHUNK_SEGMENTS_HIGH = 36;
export const CHUNK_SEGMENTS_LOW = 18;
export const GRID_RADIUS = 3; // (2*3 + 1) = 7x7 = 49 active chunks

export class MarsTerrainManager {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.material = createMarsTerrainMaterial(options);
    this.chunks = new Map(); // key: "x,z" -> Chunk
    this.geometryCache = new Map();
    this.lastPlayerChunkX = NaN;
    this.lastPlayerChunkZ = NaN;
  }

  getChunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  getGeometry(resolution) {
    if (!this.geometryCache.has(resolution)) {
      const geo = new THREE.PlaneGeometry(
        CHUNK_SIZE,
        CHUNK_SIZE,
        resolution,
        resolution
      );
      geo.rotateX(-Math.PI / 2);
      this.geometryCache.set(resolution, geo);
    }
    return this.geometryCache.get(resolution).clone();
  }

  createChunk(cx, cz, resolution) {
    const geo = this.getGeometry(resolution);
    const posAttr = geo.attributes.position;
    const originX = cx * CHUNK_SIZE;
    const originZ = cz * CHUNK_SIZE;

    // Apply procedural Mars height
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
      resolution,
      mesh,
      disposed: false
    };
  }

  update(playerPos) {
    const pcx = Math.floor((playerPos.x + CHUNK_SIZE * 0.5) / CHUNK_SIZE);
    const pcz = Math.floor((playerPos.z + CHUNK_SIZE * 0.5) / CHUNK_SIZE);

    if (pcx === this.lastPlayerChunkX && pcz === this.lastPlayerChunkZ) {
      return;
    }

    this.lastPlayerChunkX = pcx;
    this.lastPlayerChunkZ = pcz;

    const neededKeys = new Set();

    for (let dx = -GRID_RADIUS; dx <= GRID_RADIUS; dx++) {
      for (let dz = -GRID_RADIUS; dz <= GRID_RADIUS; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = this.getChunkKey(cx, cz);
        neededKeys.add(key);

        const dist = Math.hypot(dx, dz);
        const resolution = dist <= 1.5 ? CHUNK_SEGMENTS_HIGH : CHUNK_SEGMENTS_LOW;

        if (!this.chunks.has(key)) {
          const chunk = this.createChunk(cx, cz, resolution);
          this.chunks.set(key, chunk);
        } else {
          const chunk = this.chunks.get(key);
          // Upgrade / downgrade LOD if needed
          if (chunk.resolution !== resolution) {
            this.scene.remove(chunk.mesh);
            chunk.mesh.geometry.dispose();
            const newChunk = this.createChunk(cx, cz, resolution);
            this.chunks.set(key, newChunk);
          }
        }
      }
    }

    // Remove distant chunks
    for (const [key, chunk] of this.chunks.entries()) {
      if (!neededKeys.has(key)) {
        this.scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        this.chunks.delete(key);
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
  }
}
