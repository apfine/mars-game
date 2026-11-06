import * as THREE from 'three';
import { getMarsHeight } from './noise.js';

// A local, moving ocean patch. Coordinates and time are metres and seconds.
// The narrow, fixed landing raft is the only safe ground in this local patch.
export const MILLER_PAD_X = 1400;
export const MILLER_PAD_Z = 1150;
export const MILLER_PAD_Y = getMarsHeight(MILLER_PAD_X, MILLER_PAD_Z);
const FLAT_RADIUS = 350;
const SWELL_RADIUS = 600;

// This is a cinematic, soliton-inspired tidal swell: one tall crest passes a
// fixed point about once per local hour. It is not a Kerr hydrodynamics solver.
// Speed, width and amplitude are visual choices; the period is the story cue.
export const MILLER_TIDAL_SWELL = Object.freeze({
  amplitude: 900,
  repeatSeconds: 3600,
  speed: 30,
  width: 300,
  initialCrestOffset: 1800,
  direction: Object.freeze([0.84, 0.542586])
});

// Small waves add local surface motion. The same constants generate the CPU
// collision field and vertex shader, avoiding a separate render-only wave.
const WAVES = [
  { amplitude: 10, wavelength: 540, speed: 24, direction: [0.84, 0.542586], phase: 0.2 },
  { amplitude: 5, wavelength: 235, speed: 15, direction: [-0.32, 0.947418], phase: 1.3 },
  { amplitude: 2.5, wavelength: 150, speed: 11, direction: [0.61, -0.792401], phase: 2.1 }
];

const SWELL_REPEAT_DISTANCE = MILLER_TIDAL_SWELL.speed * MILLER_TIDAL_SWELL.repeatSeconds;

function tidalCrestDistance(x, z, timeSeconds) {
  const swell = MILLER_TIDAL_SWELL;
  const along = swell.direction[0] * (x - MILLER_PAD_X) + swell.direction[1] * (z - MILLER_PAD_Z);
  const offset = along + swell.speed * timeSeconds - swell.initialCrestOffset;
  return ((offset + SWELL_REPEAT_DISTANCE / 2) % SWELL_REPEAT_DISTANCE + SWELL_REPEAT_DISTANCE) % SWELL_REPEAT_DISTANCE - SWELL_REPEAT_DISTANCE / 2;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function oceanDisplacement(x, z, timeSeconds) {
  const distance = Math.hypot(x - MILLER_PAD_X, z - MILLER_PAD_Z);
  const apronBlend = smoothstep(FLAT_RADIUS, SWELL_RADIUS, distance);
  if (apronBlend === 0) return 0;
  const crest = tidalCrestDistance(x, z, timeSeconds) / MILLER_TIDAL_SWELL.width;
  let height = MILLER_TIDAL_SWELL.amplitude * Math.exp(-0.5 * crest * crest);
  for (const wave of WAVES) {
    const k = 2 * Math.PI / wave.wavelength;
    const along = wave.direction[0] * (x - MILLER_PAD_X) + wave.direction[1] * (z - MILLER_PAD_Z);
    height += wave.amplitude * Math.sin(k * (along - wave.speed * timeSeconds) + wave.phase);
  }
  return apronBlend * height;
}

export function getMillerHeight(x, z, timeSeconds = 0) {
  return MILLER_PAD_Y + oceanDisplacement(x, z, timeSeconds);
}

export function getMillerNormal(x, z, timeSeconds = 0) {
  const step = 2;
  const dx = getMillerHeight(x + step, z, timeSeconds) - getMillerHeight(x - step, z, timeSeconds);
  const dz = getMillerHeight(x, z + step, timeSeconds) - getMillerHeight(x, z - step, timeSeconds);
  const length = Math.hypot(dx, 2 * step, dz);
  return { x: -dx / length, y: 2 * step / length, z: -dz / length };
}

const glslNumber = value => Number(value).toFixed(8);
const swellGlsl = `
    float along = dot(d, vec2(${glslNumber(MILLER_TIDAL_SWELL.direction[0])}, ${glslNumber(MILLER_TIDAL_SWELL.direction[1])}));
    float repeatDistance = ${glslNumber(SWELL_REPEAT_DISTANCE)};
    float distanceToCrest = mod(along + ${glslNumber(MILLER_TIDAL_SWELL.speed)} * uTime - ${glslNumber(MILLER_TIDAL_SWELL.initialCrestOffset)} + repeatDistance * 0.5, repeatDistance) - repeatDistance * 0.5;
    float crest = distanceToCrest / ${glslNumber(MILLER_TIDAL_SWELL.width)};
    float h = ${glslNumber(MILLER_TIDAL_SWELL.amplitude)} * exp(-0.5 * crest * crest);`;
const waveGlsl = WAVES.map(wave => {
  const k = 2 * Math.PI / wave.wavelength;
  return `h += ${glslNumber(wave.amplitude)} * sin(${glslNumber(k)} * (dot(d, vec2(${glslNumber(wave.direction[0])}, ${glslNumber(wave.direction[1])})) - ${glslNumber(wave.speed)} * uTime) + ${glslNumber(wave.phase)});`;
}).join('\n  ');

const vertexShader = `
  uniform float uTime;
  uniform vec2 uPad;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vFoam;

  float waveHeight(vec2 worldXZ) {
    vec2 d = worldXZ - uPad;
    float blend = smoothstep(${glslNumber(FLAT_RADIUS)}, ${glslNumber(SWELL_RADIUS)}, length(d));
    ${swellGlsl}
    ${waveGlsl}
    return blend * h;
  }

  void main() {
    vec4 originalWorld = modelMatrix * vec4(position, 1.0);
    vec2 xz = originalWorld.xz;
    float h = waveHeight(xz);
    vec3 displaced = position + vec3(0.0, h, 0.0);
    vec4 world = modelMatrix * vec4(displaced, 1.0);
    float dx = (waveHeight(xz + vec2(2.0, 0.0)) - waveHeight(xz - vec2(2.0, 0.0))) * 0.25;
    float dz = (waveHeight(xz + vec2(0.0, 2.0)) - waveHeight(xz - vec2(0.0, 2.0))) * 0.25;
    vWorldNormal = normalize(vec3(-dx, 1.0, -dz));
    vWorldPosition = world.xyz;
    vFoam = clamp(length(vec2(dx, dz)) * 0.55 + max(0.0, h) * 0.006, 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = `
  uniform vec3 uLightDirection;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vFoam;

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 view = normalize(cameraPosition - vWorldPosition);
    vec3 light = normalize(uLightDirection);
    float diffuse = max(dot(normal, light), 0.0);
    float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 3.0);
    vec3 halfVector = normalize(light + view);
    float glitter = pow(max(dot(normal, halfVector), 0.0), 90.0);
    vec3 deep = vec3(0.012, 0.052, 0.069);
    vec3 lit = vec3(0.038, 0.14, 0.17);
    vec3 color = mix(deep, lit, diffuse * 0.8);
    color += vec3(0.12, 0.17, 0.20) * fresnel;
    color += vec3(0.57, 0.64, 0.66) * glitter * 0.75;
    color = mix(color, vec3(0.25, 0.31, 0.32), vFoam * 0.27);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Creates the moving ocean and a distinct landing raft. */
export function createMillerOcean(scene, options = {}) {
  const size = options.size ?? 12000;
  const segments = options.segments ?? 256;
  const group = new THREE.Group();
  group.name = 'Miller Ocean and Landing Apron';
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPad: { value: new THREE.Vector2(MILLER_PAD_X, MILLER_PAD_Z) },
      uLightDirection: { value: new THREE.Vector3(0.4, 0.7, 0.2).normalize() }
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide
  });
  const ocean = new THREE.Mesh(geometry, material);
  ocean.name = 'Animated Miller Ocean';
  ocean.position.set(MILLER_PAD_X, MILLER_PAD_Y, MILLER_PAD_Z);
  ocean.frustumCulled = false;
  group.add(ocean);

  const apronGeometry = new THREE.CylinderGeometry(125, 125, 3, 96);
  const apronMaterial = new THREE.MeshStandardMaterial({ color: 0x222a2c, roughness: 0.83, metalness: 0.25 });
  const apron = new THREE.Mesh(apronGeometry, apronMaterial);
  apron.name = 'Miller Landing Raft';
  apron.position.set(MILLER_PAD_X, MILLER_PAD_Y - 1.6, MILLER_PAD_Z);
  apron.receiveShadow = true;
  group.add(apron);
  const ring = new THREE.Mesh(new THREE.RingGeometry(44, 48, 96),
    new THREE.MeshBasicMaterial({ color: 0xaab8b3, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(MILLER_PAD_X, MILLER_PAD_Y + 0.03, MILLER_PAD_Z);
  group.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, 9, 8),
      new THREE.MeshStandardMaterial({ color: 0x3b4545, emissive: 0x253a38, emissiveIntensity: 0.28 }));
    post.position.set(MILLER_PAD_X + Math.cos(a) * 113, MILLER_PAD_Y + 4.5,
      MILLER_PAD_Z + Math.sin(a) * 113);
    group.add(post);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 6),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffca79 : 0xd9eff0 }));
    beacon.position.set(post.position.x, MILLER_PAD_Y + 9.5, post.position.z);
    group.add(beacon);
  }
  scene.add(group);

  return {
    group,
    ocean,
    apron,
    update(timeSeconds) { material.uniforms.uTime.value = Number.isFinite(timeSeconds) ? timeSeconds : 0; },
    dispose() {
      scene.remove(group);
      geometry.dispose(); material.dispose(); apronGeometry.dispose(); apronMaterial.dispose();
    }
  };
}
