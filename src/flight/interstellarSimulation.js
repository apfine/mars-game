import * as THREE from 'three';

// ============================================================================
// GARGANTUA & MILLER'S PLANET EXPEDITION: RELATIVISTIC 3D SIMULATION ENGINE
// Recreating the astronomical scale, Kerr metric physics, and cinematic
// exploration journey from Interstellar.
//
// Key Physical & Metric Constants (Kip Thorne / Interstellar specifications):
// - Gargantua Mass: M ~ 100 million solar masses (10^8 M_sun)
// - Gravitational radius r_g = GM / c^2 ~ 1.477e11 m (~ 0.987 AU)
// - Dimensionless spin parameter: a* = 0.99999999 (near extremal Kerr limit)
// - Miller's Planet Orbit: equatorial prograde orbit r ~ 1.0000002 r_H
// - Miller's Time Dilation: 1 local hour = 7 Earth years (factor = 61,320x)
// - Miller's Surface Gravity: 1.3g = 12.75 m/s²
// - Rendezvous Orbit (Endurance parking): r ~ 10 r_g, dilation factor ~ 1.15x
// ============================================================================

export const INTERSTELLAR_STAGES = [
  {
    id: 'EARTH_ORBIT',
    number: 1,
    title: 'EARTH ORBIT',
    subtitle: 'DEPARTURE POINT // REFERENCE ZERO',
    summary: 'Stationed at 350 km in low Earth orbit. Curvature of the horizon, thin atmospheric limb, and recognizable continents establish Earth as reference for distance, familiar scale, and baseline proper time.',
    loreType: 'ESTABLISHED PHYSICS',
    physicsNote: 'Baseline Minkowski spacetime (dilation = 1.000x). Earth establishes the observer reference frame for all subsequent time dilation comparisons.',
    dilationTarget: 1.0,
    camDistance: 380,
    camHeight: 120,
    camTargetOffset: new THREE.Vector3(0, 0, 0),
    speedKmh: 27600
  },
  {
    id: 'SATURN_DEPARTURE',
    number: 2,
    title: 'SOLAR SYSTEM CRUISE TO SATURN',
    subtitle: 'OUTWARD HELIOCENTRIC CRUISE // 9.5 AU',
    summary: 'Propelling outward across the Solar System past the orbits of Mars and Jupiter toward Saturn. Interplanetary cruise is explicitly compressed over ~2.1 years of travel time.',
    loreType: 'ESTABLISHED PHYSICS',
    physicsNote: 'Keplerian heliocentric transfer. Journey compression is visibly indicated to emphasize true astronomical scale across 1.4 billion km.',
    dilationTarget: 1.0,
    timeSkipEarthSec: 2.1 * 365.25 * 86400, // 2.1 years
    camDistance: 800,
    camHeight: 250,
    speedKmh: 42000
  },
  {
    id: 'WORMHOLE_APPROACH',
    number: 3,
    title: 'WORMHOLE AT SATURN',
    subtitle: 'SPHERICAL GRAVITATIONAL DEFLECTION',
    summary: 'Near Saturn’s rings, a 3D spherical wormhole floats suspended in deep space. Its surface shows a gravitational lensing distorted view of the distant galaxy and starfield beyond.',
    loreType: 'CINEMATIC & THEORETICAL PREMISE',
    physicsNote: 'Morris-Thorne traversable wormhole. The mouth is a 3D sphere (not a 2D flat portal). Negative-mass exotic matter would theoretically be required to prevent collapse.',
    dilationTarget: 1.0,
    camDistance: 450,
    camHeight: 90,
    speedKmh: 12500
  },
  {
    id: 'WORMHOLE_CROSSING',
    number: 4,
    title: 'WORMHOLE TRANSIT',
    subtitle: 'INTERSTELLAR THROAT PENETRATION',
    summary: 'The craft descends directly into the spherical mouth. Space curves around the hull as the throat connects our Solar System to the distant star system of Gargantua.',
    loreType: 'CINEMATIC PREMISE',
    physicsNote: 'Throat crossing through higher-dimensional bulk spacetime. The journey reaches Gargantua’s neighborhood via the wormhole, kept entirely separate from entering the black hole.',
    dilationTarget: 1.05,
    camDistance: 120,
    camHeight: 15,
    speedKmh: 35000
  },
  {
    id: 'GARGANTUA_DISTANT',
    number: 5,
    title: 'GARGANTUA FIRST SIGHT',
    subtitle: '100 MILLION SOLAR MASS KERR BLACK HOLE',
    summary: 'Emerging into the foreign system. Gargantua dominates space: a supermassive rotating black hole with a dark optical shadow encircled by a blazing, razor-thin luminous accretion disk.',
    loreType: 'ESTABLISHED ASTROPHYSICS',
    physicsNote: 'M ~ 10^8 M_sun, r_g ~ 0.987 AU (event horizon size comparable to Earth’s orbit around the Sun). Extreme Kerr spin a* ~ 0.99999999.',
    dilationTarget: 1.15,
    camDistance: 1500,
    camHeight: 400,
    speedKmh: 54000
  },
  {
    id: 'GARGANTUA_INSPECT',
    number: 6,
    title: 'GRAVITATIONAL LENSING INSPECTION',
    subtitle: 'ONE DISK BENT ABOVE AND BELOW THE SHADOW',
    summary: 'Inspecting Gargantua up close. The far side of the accretion disk is warped by gravity over and under the dark shadow, while the near side crosses in front. A razor-thin photon ring surrounds the shadow.',
    loreType: 'ESTABLISHED GENERAL RELATIVITY',
    physicsNote: 'Deflection of light by strong Kerr spacetime curvature. The upper and lower arcs are lensed images of one single equatorial disk. Doppler beaming boosts brightness on the approaching side.',
    dilationTarget: 1.35,
    camDistance: 700,
    camHeight: 120,
    speedKmh: 68000
  },
  {
    id: 'MILLER_APPROACH',
    number: 7,
    title: 'APPROACH TO MILLER’S ORBIT',
    subtitle: 'PROGRADE NEAR-HORIZON INSERTION',
    summary: 'Deorbiting into the extreme gravity well. Miller’s planet orbits prograde at the innermost stable circular orbit, riding with the black hole’s frame-dragging spin.',
    loreType: 'THEORETICAL EXTREME / CINEMATIC SELECTION',
    physicsNote: 'Only possible because Gargantua spins at a* > 0.99999999. In non-rotating Schwarzschild geometry, the orbit would plunge into the singularity.',
    dilationTarget: 2450.0,
    camDistance: 320,
    camHeight: 80,
    speedKmh: 145000
  },
  {
    id: 'ATMOSPHERIC_DESCENT',
    number: 8,
    title: 'ATMOSPHERIC ENTRY AT MILLER’S PLANET',
    subtitle: 'THROUGH PALE HAZE AND LOW CLOUD DECK',
    summary: 'Plunging through the pale, hazy atmosphere and dense low clouds. Plasma glow fades into a diffuse gray-blue sky as the vast horizon reveals an endless, unbroken ocean world.',
    loreType: 'PHYSICAL / CINEMATIC PLANETOLOGY',
    physicsNote: 'Earth-sized ocean world (radius ~ 6,370 km). No dry land, continents, or artificial structures. Time dilation surges toward the full surface ratio.',
    dilationTarget: 28500.0,
    camDistance: 180,
    camHeight: 50,
    speedKmh: 4200
  },
  {
    id: 'WATER_LANDING',
    number: 9,
    title: 'SHALLOW-WATER TOUCHDOWN',
    subtitle: 'ANKLE-TO-KNEE DEEP GLOBAL OCEAN // 1.3G',
    summary: 'Touchdown in ankle-to-knee deep water (0.4m depth). The ocean appears mirror-flat to the horizon, with clear ripples, reflections, and a visible submerged seabed beneath the shallows.',
    loreType: 'CINEMATIC SPECIFICATION',
    physicsNote: 'Surface gravity = 1.3g (12.75 m/s²). Full time dilation is active: 1 hour on the surface = 7 years on Earth (61,320x dilation factor; 1 second = 17.03 Earth hours).',
    dilationTarget: 61320.0,
    camDistance: 32,
    camHeight: 5.5,
    speedKmh: 0
  },
  {
    id: 'WAVE_DISCOVERY',
    number: 10,
    title: 'DISTANT WAVE DISCOVERY',
    subtitle: '“THOSE AREN’T MOUNTAINS... THOSE ARE WAVES.”',
    summary: 'Distant silhouettes along the horizon resemble jagged mountain ridges. As instruments track them, the mountains are revealed to be moving—an immense wall of water spanning the skyline.',
    loreType: 'CINEMATIC PREMISE',
    physicsNote: 'Kilometer-scale tidal solitary wave (1.2 km high). Ordinary equilibrium tides cannot sustain solitary walls of this height; Kip Thorne justified it as extreme gravitational quadrupole tidal resonance.',
    dilationTarget: 61320.0,
    camDistance: 45,
    camHeight: 9.0,
    speedKmh: 0
  },
  {
    id: 'WAVE_ENCOUNTER',
    number: 11,
    title: 'CLOSE WAVE ENCOUNTER',
    subtitle: '1,200-METRE WALL OF WATER SURGING OVERHEAD',
    summary: 'The wave surges at terrifying speed! A towering 1.2-kilometer-high wall of churning water looms directly overhead, casting Gargantua and the sky into deep shadow.',
    loreType: 'CINEMATIC SPECTACLE',
    physicsNote: 'Immense crest velocity and spray. Local instruments, heartbeat, and proper time tick normally, while outside the gravity well, days pass with every heartbeat.',
    dilationTarget: 61320.0,
    camDistance: 65,
    camHeight: 18.0,
    speedKmh: 0
  },
  {
    id: 'EMERGENCY_ASCENT',
    number: 12,
    title: 'EMERGENCY THRUST ASCENT',
    subtitle: 'HIGH-G ESCAPE OUT OF THE CREST',
    summary: 'Main engines ignite at maximum throttle! Fighting the 1.3g gravitational pull, the craft rockets upward through dense sea spray and crest foam, punching through the cloud layer.',
    loreType: 'MISSION DYNAMICS',
    physicsNote: 'High-thrust vertical ascent against 12.75 m/s² gravity. Rapidly climbing outward through the atmosphere reduces aerodynamic drag and begins egress from the severe time well.',
    dilationTarget: 18000.0,
    camDistance: 140,
    camHeight: 70,
    speedKmh: 5600
  },
  {
    id: 'RENDEZVOUS_ORBIT',
    number: 13,
    title: 'RENDEZVOUS PARKING ORBIT',
    subtitle: 'SAFE DISTANCE // THE IRREVERSIBLE COST',
    summary: 'Inserted into a safe parking orbit far above Gargantua (r ~ 10 r_g). Inspecting the comparison between clocks: only a few minutes passed on the surface, but years to decades were lost forever on Earth.',
    loreType: 'ESTABLISHED RELATIVISTIC CONSEQUENCE',
    physicsNote: 'Rendezvous orbit experiences moderate dilation (dilation ~ 1.15x), distinctly different from Miller’s surface (61,320x) and Earth time. The irreversible loss of Earth time is absolute.',
    dilationTarget: 1.15,
    camDistance: 600,
    camHeight: 180,
    speedKmh: 31000
  }
];

// ----------------------------------------------------------------------------
// Procedural Shader: Gravitational Lensing & Accretion Disk of Gargantua
// Renders the single equatorial accretion disk bent above and below the shadow,
// the thin photon ring, and optional relativistic Doppler beaming.
// ----------------------------------------------------------------------------
export function createGargantuaLensingShader(options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uCameraPos: { value: new THREE.Vector3(0, 15, 60) },
    uHolePos: { value: new THREE.Vector3(0, 0, 0) },
    uShadowRadius: { value: 7.2 },
    uDiskInnerRadius: { value: 8.5 },
    uDiskOuterRadius: { value: 34.0 },
    uPhotonRingWidth: { value: 0.28 },
    uDopplerBeaming: { value: 1.0 }, // 1.0 = physical Doppler asymmetry, 0.0 = film balanced gold
    uDiskColorCore: { value: new THREE.Color(0xfff6dc) },
    uDiskColorMid: { value: new THREE.Color(0xf6b343) },
    uDiskColorOuter: { value: new THREE.Color(0xb85210) }
  };

  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform vec3 uCameraPos;
    uniform vec3 uHolePos;
    uniform float uShadowRadius;
    uniform float uDiskInnerRadius;
    uniform float uDiskOuterRadius;
    uniform float uPhotonRingWidth;
    uniform float uDopplerBeaming;
    uniform vec3 uDiskColorCore;
    uniform vec3 uDiskColorMid;
    uniform vec3 uDiskColorOuter;

    varying vec2 vUv;
    varying vec3 vWorldPosition;

    #define PI 3.14159265359

    // Simplified Kerr analytic deflection mapping
    // Generates the iconic Interstellar appearance:
    // 1. Central dark optical shadow
    // 2. High-intensity narrow photon ring at boundary
    // 3. Primary disk crossing in front
    // 4. Secondary lensed image bent over the top and under the bottom
    void main() {
      vec3 rayOrigin = uCameraPos;
      vec3 rayDir = normalize(vWorldPosition - uCameraPos);

      // Relative to black hole center
      vec3 relCam = rayOrigin - uHolePos;
      float distToCenter = length(relCam);

      // Closest approach of undeflected ray to black hole (impact parameter b)
      float tClosest = -dot(relCam, rayDir);
      vec3 pClosest = relCam + rayDir * tClosest;
      float b = length(pClosest);

      vec3 finalColor = vec3(0.0);
      float alpha = 0.0;

      // 1. Check if ray falls into the optical shadow (photon capture cross section)
      // For extremal Kerr viewed near equatorial plane, shadow radius is approx uShadowRadius
      float rShadow = uShadowRadius;

      // Starfield background with gravitational deflection
      vec3 bgDir = rayDir;
      if (b > rShadow) {
        float deflection = (4.0 * rShadow) / (b + 0.1);
        bgDir = normalize(rayDir - normalize(pClosest) * (deflection * 0.45));
      }

      // Procedural background stars
      float star = pow(fract(sin(dot(bgDir.xy + bgDir.z * 0.3, vec2(12.9898, 78.233))) * 43758.5453), 32.0);
      finalColor += vec3(star * 0.4);

      // If ray is within the shadow, it's pitch black
      if (b < rShadow && tClosest > 0.0) {
        // Deep shadow
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // 2. Photon ring: intensely bright, extremely narrow band at shadow boundary
      float dShadow = abs(b - rShadow);
      if (dShadow < uPhotonRingWidth * 2.8) {
        float ringIntensity = pow(1.0 - smoothstep(0.0, uPhotonRingWidth * 2.8, dShadow), 4.0);
        vec3 ringColor = mix(uDiskColorMid, vec3(1.0, 0.98, 0.92), ringIntensity * 0.9);
        finalColor += ringColor * ringIntensity * 3.8;
        alpha = max(alpha, ringIntensity);
      }

      // 3. Accretion Disk sampling:
      // The disk is in the Y=0 plane (equatorial).
      // A ray can intersect the disk in two ways:
      // a) Directly (unlensed or weakly deflected near crossing)
      // b) Lensed around the black hole (upper arc and lower arc)

      // Direct intersection with Y = uHolePos.y plane:
      if (abs(rayDir.y) > 0.0001) {
        float tDisk = (uHolePos.y - rayOrigin.y) / rayDir.y;
        if (tDisk > 0.0) {
          vec3 pDisk = rayOrigin + rayDir * tDisk;
          float rDisk = length(pDisk.xz - uHolePos.xz);

          // Only front side (closer than black hole) or outside shadow
          if (tDisk < tClosest || b > rShadow * 1.05) {
            if (rDisk >= uDiskInnerRadius && rDisk <= uDiskOuterRadius) {
              float normR = (rDisk - uDiskInnerRadius) / (uDiskOuterRadius - uDiskInnerRadius);
              float angle = atan(pDisk.z - uHolePos.z, pDisk.x - uHolePos.x);

              // Relativistic rotation & fine filament noise
              float swirl = sin(angle * 8.0 - uTime * 2.2 + normR * 14.0) * 0.15 + 0.85;
              float band = sin(normR * 68.0 + swirl * 2.0) * 0.1 + 0.9;
              float profile = pow(1.0 - normR, 1.6) * smoothstep(0.0, 0.06, normR) * swirl * band;

              vec3 diskColor = mix(uDiskColorCore, uDiskColorMid, smoothstep(0.0, 0.45, normR));
              diskColor = mix(diskColor, uDiskColorOuter, smoothstep(0.45, 1.0, normR));

              // Relativistic Doppler beaming asymmetry (approaching side = boosted)
              // Disk rotates counterclockwise (prograde)
              float velDotCam = -sin(angle); // +1 when coming towards observer
              float dopplerFactor = 1.0;
              if (uDopplerBeaming > 0.5) {
                float beta = 0.55 * (1.0 - normR * 0.5); // orbital speed ~ 0.5c
                dopplerFactor = pow(1.0 + beta * velDotCam, 3.5);
                diskColor = mix(diskColor, vec3(1.0, 1.0, 0.95), max(0.0, velDotCam * 0.4));
              }

              finalColor += diskColor * profile * dopplerFactor * 1.6;
              alpha = max(alpha, profile * 0.95);
            }
          }
        }
      }

      // 4. Gravitational Lensing Arcs (Upper & Lower warped images)
      // Rays deflected over and under the black hole create the halo arcs.
      // In Kerr geometry, rays passing at distance b from center map to source disk radius
      // via Thorne deflection approximation: r_source ~ b * (1.0 + deflection)
      if (b >= rShadow * 0.98 && b <= uDiskOuterRadius * 1.45) {
        float lensedR = b * (0.82 + (rShadow / b) * 0.65);
        if (lensedR >= uDiskInnerRadius && lensedR <= uDiskOuterRadius) {
          float normLR = (lensedR - uDiskInnerRadius) / (uDiskOuterRadius - uDiskInnerRadius);

          // Elevation angle above/below equatorial plane in image space
          vec3 toPoint = normalize(pClosest);
          float elevation = abs(toPoint.y);

          // Strongest at top and bottom (perpendicular to disk plane)
          float arcMask = smoothstep(0.12, 0.85, elevation);
          float lensedProfile = pow(1.0 - normLR, 1.8) * smoothstep(0.0, 0.05, normLR) * arcMask;

          vec3 arcColor = mix(uDiskColorCore, uDiskColorMid, smoothstep(0.0, 0.4, normLR));
          arcColor = mix(arcColor, uDiskColorOuter, smoothstep(0.4, 1.0, normLR));

          // Fine ring filaments
          float lensedSwirl = sin(normLR * 85.0 - uTime * 1.8) * 0.12 + 0.88;

          float dopplerLensed = 1.0;
          if (uDopplerBeaming > 0.5) {
            float velSide = -sign(toPoint.x);
            dopplerLensed = 1.0 + 0.4 * velSide;
          }

          finalColor += arcColor * lensedProfile * lensedSwirl * dopplerLensed * 1.45;
          alpha = max(alpha, lensedProfile * 0.9);
        }
      }

      // Subtle atmospheric halo / optical scatter
      float halo = exp(-dShadow * 0.35) * 0.18;
      finalColor += uDiskColorMid * halo;

      gl_FragColor = vec4(finalColor, clamp(alpha + halo, 0.0, 1.0));
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
}

// ----------------------------------------------------------------------------
// Procedural Shader: 3D Spherical Wormhole near Saturn
// Renders the 3-dimensional spherical mouth with throat ray-bending and
// distorted view of the distant galaxy beyond.
// ----------------------------------------------------------------------------
export function createWormholeShader() {
  const uniforms = {
    uTime: { value: 0 },
    uCameraPos: { value: new THREE.Vector3(0, 0, 0) },
    uThroatColor: { value: new THREE.Color(0x3a7bd5) },
    uGargantuaTint: { value: new THREE.Color(0xf5d77f) }
  };

  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vNormal = normalize(mat3(modelMatrix) * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform vec3 uCameraPos;
    uniform vec3 uThroatColor;
    uniform vec3 uGargantuaTint;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    #define PI 3.14159265359

    void main() {
      vec3 rayDir = normalize(vWorldPosition - uCameraPos);
      vec3 normal = normalize(vNormal);

      // Fresnel rim deflection: light grazing the spherical mouth bends around the sphere
      float fresnel = 1.0 - max(0.0, dot(-rayDir, normal));
      float rimGlow = pow(fresnel, 3.2);

      // Interior throat refraction: fish-eye inverted mapping into distant galaxy
      // Rays refracted through 3D throat according to Morris-Thorne metric
      vec3 refr = refract(rayDir, normal, 0.72);
      if (length(refr) < 0.1) refr = reflect(rayDir, normal);

      // Spherical coordinate lookup on distant galaxy starfield
      float phi = atan(refr.z, refr.x);
      float theta = acos(clamp(refr.y, -1.0, 1.0));

      // Swirling distant accretion disk reflection inside the sphere
      float distGalaxy = sin(phi * 4.0 + uTime * 0.4) * cos(theta * 3.0);
      float galaxyStars = pow(fract(sin(dot(refr.xy, vec2(24.12, 63.45))) * 12345.67), 28.0);

      // Golden accretion core visible through the wormhole
      float coreGargantua = pow(max(0.0, dot(refr, vec3(0.3, 0.2, 0.9))), 6.0);
      vec3 throatView = mix(vec3(0.03, 0.05, 0.12), uGargantuaTint, coreGargantua * 2.2);
      throatView += vec3(galaxyStars * 0.8);
      throatView += uThroatColor * distGalaxy * 0.15;

      // Rim gravitational lensing ring
      vec3 rimColor = mix(vec3(0.85, 0.95, 1.0), uThroatColor, 0.5);
      vec3 finalColor = mix(throatView, rimColor, rimGlow * 0.85);

      gl_FragColor = vec4(finalColor, 0.92 + rimGlow * 0.08);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.FrontSide
  });
}

// ----------------------------------------------------------------------------
// Procedural Shader: Miller's Planet Ocean & 1.2-Kilometer Solitary Wave
// Shallow crystal water, visible seabed, foam ripples, and kilometer-scale
// towering wall of water.
// ----------------------------------------------------------------------------
export function createMillerOceanShader() {
  const uniforms = {
    uTime: { value: 0 },
    uWaveDistance: { value: 1600.0 }, // Distance of wave wall from player
    uWaveHeight: { value: 1200.0 },   // 1.2 km crest
    uWaveWidth: { value: 420.0 },     // Thickness of wave base
    uSunDir: { value: new THREE.Vector3(0.5, 0.4, 0.7).normalize() },
    uGargantuaDir: { value: new THREE.Vector3(-0.4, 0.7, -0.5).normalize() },
    uWaterColorDeep: { value: new THREE.Color(0x1a3b4c) },
    uWaterColorShallow: { value: new THREE.Color(0x3a6f88) },
    uSeabedColor: { value: new THREE.Color(0x8a7f6a) },
    uFoamColor: { value: new THREE.Color(0xdceef5) }
  };

  const vertexShader = `
    uniform float uTime;
    uniform float uWaveDistance;
    uniform float uWaveHeight;
    uniform float uWaveWidth;

    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vWaveFactor;

    void main() {
      vUv = uv;
      vec3 pos = position;

      // Solitary tidal wave profile along Z axis
      // Wave approaches from +Z towards -Z
      float zDist = pos.z - uWaveDistance;
      float waveShape = exp(-pow(zDist / uWaveWidth, 2.0));

      // Asymmetric steep front face and trailing taper (solitary wave profile)
      float frontSteepness = smoothstep(-uWaveWidth, 0.0, zDist);
      float h = waveShape * uWaveHeight * (0.3 + 0.7 * frontSteepness);

      // Fine ocean ripples across shallow flats
      float ripples = sin(pos.x * 0.4 + uTime * 3.0) * cos(pos.z * 0.4 + uTime * 2.5) * 0.08;
      pos.y += h + ripples;

      vWaveFactor = waveShape;
      vec4 worldPos = modelMatrix * vec4(pos, 1.0);
      vWorldPos = worldPos.xyz;

      // Approximate normal from wave gradient
      vec3 norm = vec3(0.0, 1.0, 0.0);
      if (waveShape > 0.01) {
        float dhdz = -2.0 * (zDist / (uWaveWidth * uWaveWidth)) * h;
        norm = normalize(vec3(0.0, 1.0, -dhdz));
      }
      vNormal = normalize(mat3(modelMatrix) * norm);

      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform vec3 uSunDir;
    uniform vec3 uGargantuaDir;
    uniform vec3 uWaterColorDeep;
    uniform vec3 uWaterColorShallow;
    uniform vec3 uSeabedColor;
    uniform vec3 uFoamColor;

    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vWaveFactor;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(cameraPosition - vWorldPos);

      // Fresnel reflection factor
      float fresnel = 0.04 + 0.96 * pow(1.0 - max(0.0, dot(viewDir, normal)), 4.0);

      // Reflected golden light from Gargantua looming in the sky
      vec3 reflDir = reflect(-viewDir, normal);
      float gargantuaSpec = pow(max(0.0, dot(reflDir, uGargantuaDir)), 16.0);
      vec3 gargantuaGlow = vec3(1.0, 0.88, 0.65) * gargantuaSpec * 1.8;

      // Transparent water depth with visible rippled sandy seabed
      // At player landing area, water is shallow (0.4m depth)
      float depthFactor = clamp(vWorldPos.y / 20.0, 0.0, 1.0);
      vec3 seabedRipples = uSeabedColor * (0.85 + 0.15 * sin(vWorldPos.x * 3.0) * cos(vWorldPos.z * 3.0));
      vec3 waterBody = mix(mix(seabedRipples, uWaterColorShallow, 0.65), uWaterColorDeep, depthFactor);

      // Solitary wave crest foaming
      float foam = smoothstep(0.75, 0.98, vWaveFactor) * (0.8 + 0.2 * sin(vWorldPos.x * 2.0 + uTime * 4.0));
      vec3 oceanColor = mix(waterBody, uFoamColor, foam);

      // Combine body, fresnel sky reflection, and Gargantua specular highlight
      vec3 skyRefl = mix(vec3(0.65, 0.78, 0.88), vec3(1.0, 0.85, 0.55), clamp(reflDir.y, 0.0, 1.0));
      vec3 finalColor = mix(oceanColor, skyRefl, fresnel) + gargantuaGlow;

      gl_FragColor = vec4(finalColor, 0.94);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide
  });
}

// ============================================================================
// MAIN SIMULATION ORCHESTRATOR CLASS
// ============================================================================
export class InterstellarSimulation {
  constructor(engine, scene, camera, renderer) {
    this.engine = engine;
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    this.active = false;
    this.currentStageIndex = 0;
    this.stage = INTERSTELLAR_STAGES[0];
    this.isPaused = false;
    this.autoAdvance = false;
    this.stageTimer = 0;

    // Relativistic Clocks
    this.travelerTimeSec = 0; // Proper time (tau)
    this.earthTimeSec = 0;    // Coordinate time (t)
    this.currentDilation = 1.0;
    this.timeScale = 1.0;

    // Doppler beaming toggle: true = physical asymmetry, false = film-balanced gold
    this.dopplerAsymmetry = false;

    // Audio acoustic pulse interval (1.25s = 1 Earth day on Miller's surface)
    this.tickTimer = 0;
    this.audioTickCount = 0;

    // Interactive camera inspection state
    this.inspectYaw = 0.2;
    this.inspectPitch = 0.15;
    this.inspectDistance = 380;
    this.cameraTarget = new THREE.Vector3();

    // Visual nodes
    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);
    this.rootGroup.visible = false;

    this.systemOverviewActive = false;

    this._buildEarthStage();
    this._buildSaturnWormhole();
    this._buildGargantuaSystem();
    this._buildMillersPlanet();
    this._buildSystemOverview();
    this._buildCraftModel();
  }

  // --------------------------------------------------------------------------
  // Builders
  // --------------------------------------------------------------------------
  _buildEarthStage() {
    this.earthGroup = new THREE.Group();
    this.rootGroup.add(this.earthGroup);

    // Large high-res Earth sphere for orbital sequence
    const earthRadius = 6371; // km scale in local orbital scene
    const earthGeo = new THREE.SphereGeometry(earthRadius, 64, 40);
    const earthMat = new THREE.MeshStandardMaterial({
      color: 0x224488,
      roughness: 0.8,
      metalness: 0.05
    });
    this.earthSphere = new THREE.Mesh(earthGeo, earthMat);
    this.earthSphere.position.set(0, -earthRadius, 0);
    this.earthGroup.add(this.earthSphere);

    // Atmosphere limb glow
    const atmGeo = new THREE.SphereGeometry(earthRadius * 1.015, 48, 32);
    const atmMat = new THREE.MeshBasicMaterial({
      color: 0x66aaff,
      transparent: true,
      opacity: 0.35,
      side: THREE.BackSide
    });
    this.earthAtmMini = new THREE.Mesh(atmGeo, atmMat);
    this.earthAtmMini.position.copy(this.earthSphere.position);
    this.earthGroup.add(this.earthAtmMini);

    // Drifting cloud layer
    const cloudGeo = new THREE.SphereGeometry(earthRadius * 1.006, 48, 32);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.42,
      roughness: 1.0
    });
    this.earthCloudSphere = new THREE.Mesh(cloudGeo, cloudMat);
    this.earthCloudSphere.position.copy(this.earthSphere.position);
    this.earthGroup.add(this.earthCloudSphere);
  }

  _buildSaturnWormhole() {
    this.saturnGroup = new THREE.Group();
    this.rootGroup.add(this.saturnGroup);

    // Saturn globe
    const saturnRadius = 120;
    const saturnGeo = new THREE.SphereGeometry(saturnRadius, 40, 24);
    const saturnMat = new THREE.MeshStandardMaterial({
      color: 0xe6cf9e,
      roughness: 0.95
    });
    this.saturnSphere = new THREE.Mesh(saturnGeo, saturnMat);
    this.saturnSphere.position.set(1800, 200, -2800);
    this.saturnGroup.add(this.saturnSphere);

    // Saturn rings
    const ringGeo = new THREE.RingGeometry(saturnRadius * 1.4, saturnRadius * 2.4, 48);
    ringGeo.rotateX(Math.PI / 2 + 0.35);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xd4ba8a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const rings = new THREE.Mesh(ringGeo, ringMat);
    rings.position.copy(this.saturnSphere.position);
    this.saturnGroup.add(rings);

    // 3D Spherical Wormhole suspended in space
    const wormholeRadius = 160;
    const whGeo = new THREE.SphereGeometry(wormholeRadius, 48, 32);
    this.wormholeMat = createWormholeShader();
    this.wormholeSphere = new THREE.Mesh(whGeo, this.wormholeMat);
    this.wormholeSphere.position.set(0, 0, 0);
    this.saturnGroup.add(this.wormholeSphere);
  }

  _buildGargantuaSystem() {
    this.gargantuaGroup = new THREE.Group();
    this.rootGroup.add(this.gargantuaGroup);

    // Gargantua Black Hole Sky Quad / Billboard with Kerr gravitational lensing shader
    const lensingSize = 3200;
    const lensingGeo = new THREE.PlaneGeometry(lensingSize, lensingSize, 1, 1);
    this.gargantuaShader = createGargantuaLensingShader();
    this.gargantuaMesh = new THREE.Mesh(lensingGeo, this.gargantuaShader);
    this.gargantuaMesh.position.set(0, 0, -1200);
    this.gargantuaGroup.add(this.gargantuaMesh);

    // Black Hole central dark sphere occlusion
    const shadowCoreGeo = new THREE.SphereGeometry(180, 32, 20);
    const shadowCoreMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.shadowCore = new THREE.Mesh(shadowCoreGeo, shadowCoreMat);
    this.shadowCore.position.set(0, 0, -1200);
    this.gargantuaGroup.add(this.shadowCore);

    // Physical Accretion Disk 3D particle filaments
    const particleCount = 1800;
    const pGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const cCore = new THREE.Color(0xfff6dc);
    const cOuter = new THREE.Color(0xb85210);

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 240 + Math.random() * 850;
      pos[i * 3 + 0] = Math.cos(angle) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8.0;
      pos[i * 3 + 2] = Math.sin(angle) * r - 1200;

      const normR = (r - 240) / 850;
      const c = cCore.clone().lerp(cOuter, normR);
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const pMat = new THREE.PointsMaterial({
      size: 4.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    this.diskParticles = new THREE.Points(pGeo, pMat);
    this.gargantuaGroup.add(this.diskParticles);
  }

  _buildMillersPlanet() {
    this.millersGroup = new THREE.Group();
    this.rootGroup.add(this.millersGroup);

    // Orbital globe of Miller's planet
    const millerRadius = 320;
    const mGeo = new THREE.SphereGeometry(millerRadius, 48, 32);
    const mMat = new THREE.MeshStandardMaterial({
      color: 0x2f5268,
      roughness: 0.6,
      metalness: 0.1
    });
    this.millerSphere = new THREE.Mesh(mGeo, mMat);
    this.millerSphere.position.set(0, -millerRadius, 0);
    this.millersGroup.add(this.millerSphere);

    // Miller's surface shallow ocean & giant 1.2 km solitary wave
    const oceanGridSize = 6000;
    const oceanGeo = new THREE.PlaneGeometry(oceanGridSize, oceanGridSize, 200, 200);
    oceanGeo.rotateX(-Math.PI / 2);
    this.millerOceanShader = createMillerOceanShader();
    this.millerOceanMesh = new THREE.Mesh(oceanGeo, this.millerOceanShader);
    this.millerOceanMesh.position.set(0, 0, 0);
    this.millersGroup.add(this.millerOceanMesh);

    // Ocean water spray particles around the base and crest
    const sprayCount = 600;
    const sprayGeo = new THREE.BufferGeometry();
    const sprayPos = new Float32Array(sprayCount * 3);
    for (let i = 0; i < sprayCount; i++) {
      sprayPos[i * 3 + 0] = (Math.random() - 0.5) * 800;
      sprayPos[i * 3 + 1] = Math.random() * 250;
      sprayPos[i * 3 + 2] = (Math.random() - 0.5) * 400;
    }
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
    const sprayMat = new THREE.PointsMaterial({
      color: 0xdff2fc,
      size: 2.2,
      transparent: true,
      opacity: 0.55
    });
    this.waveSpray = new THREE.Points(sprayGeo, sprayMat);
    this.millersGroup.add(this.waveSpray);

    // Miller's sky backdrop: Gargantua looming large across the clouds
    const skyLensingGeo = new THREE.PlaneGeometry(2800, 2800);
    this.millerSkyGargantua = new THREE.Mesh(skyLensingGeo, this.gargantuaShader);
    this.millerSkyGargantua.position.set(200, 750, -1800);
    this.millersGroup.add(this.millerSkyGargantua);

    // Pale atmospheric haze
    const hazeGeo = new THREE.SphereGeometry(3800, 32, 16);
    const hazeMat = new THREE.MeshBasicMaterial({
      color: 0x88aabb,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.28
    });
    this.millerHaze = new THREE.Mesh(hazeGeo, hazeMat);
    this.millersGroup.add(this.millerHaze);
  }

  _buildCraftModel() {
    // 3D Ranger / Expedition Lander spacecraft model
    this.craft = new THREE.Group();
    this.rootGroup.add(this.craft);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      metalness: 0.65,
      roughness: 0.35
    });
    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.85,
      roughness: 0.2
    });
    const thrusterMat = new THREE.MeshBasicMaterial({
      color: 0x66ccff
    });

    // Main fuselage (aerodynamic lifting body)
    const hullGeo = new THREE.BoxGeometry(10, 2.2, 16);
    const hull = new THREE.Mesh(hullGeo, bodyMat);
    this.craft.add(hull);

    // Cockpit canopy
    const canopyGeo = new THREE.BoxGeometry(4.2, 1.4, 6.5);
    const canopy = new THREE.Mesh(canopyGeo, blackMat);
    canopy.position.set(0, 1.2, 2.5);
    this.craft.add(canopy);

    // Swept delta wings
    const wingGeo = new THREE.BoxGeometry(22, 0.4, 9);
    const wings = new THREE.Mesh(wingGeo, bodyMat);
    wings.position.set(0, -0.2, -1.5);
    this.craft.add(wings);

    // Vertical stabilizers
    for (const side of [-1, 1]) {
      const finGeo = new THREE.BoxGeometry(0.3, 3.2, 4.5);
      const fin = new THREE.Mesh(finGeo, bodyMat);
      fin.position.set(side * 8.5, 1.4, -4.5);
      fin.rotation.z = side * 0.25;
      this.craft.add(fin);
    }

    // Rear main engines
    for (const side of [-1, 1]) {
      const engineGeo = new THREE.CylinderGeometry(0.8, 1.1, 3.5, 12);
      engineGeo.rotateX(Math.PI / 2);
      const engine = new THREE.Mesh(engineGeo, blackMat);
      engine.position.set(side * 2.8, 0, -8.5);
      this.craft.add(engine);

      const glowGeo = new THREE.ConeGeometry(0.7, 4.0, 8);
      glowGeo.rotateX(-Math.PI / 2);
      const glow = new THREE.Mesh(glowGeo, thrusterMat);
      glow.position.set(side * 2.8, 0, -10.5);
      this.craft.add(glow);
    }
  }

  _buildSystemOverview() {
    // 3D Orrery Map of the Kerr Black Hole & Planetary System
    this.overviewGroup = new THREE.Group();
    this.rootGroup.add(this.overviewGroup);
    this.overviewGroup.visible = false;

    // Center Gargantua icon
    const centerGeo = new THREE.SphereGeometry(18, 24, 16);
    const centerMat = new THREE.MeshBasicMaterial({ color: 0xffd266 });
    const center = new THREE.Mesh(centerGeo, centerMat);
    this.overviewGroup.add(center);

    // Event Horizon circle (r = r_H)
    const ehGeo = new THREE.RingGeometry(24, 25.5, 64);
    ehGeo.rotateX(Math.PI / 2);
    const ehMat = new THREE.MeshBasicMaterial({ color: 0xff3333, side: THREE.DoubleSide });
    this.overviewGroup.add(new THREE.Mesh(ehGeo, ehMat));

    // ISCO circle (Innermost Stable Circular Orbit)
    const iscoGeo = new THREE.RingGeometry(32, 33.5, 64);
    iscoGeo.rotateX(Math.PI / 2);
    const iscoMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide });
    this.overviewGroup.add(new THREE.Mesh(iscoGeo, iscoMat));

    // Miller's Planet orbit ring
    const millerOrbitGeo = new THREE.RingGeometry(38, 39.5, 64);
    millerOrbitGeo.rotateX(Math.PI / 2);
    const millerOrbitMat = new THREE.MeshBasicMaterial({ color: 0x4fc3f7, side: THREE.DoubleSide });
    this.overviewGroup.add(new THREE.Mesh(millerOrbitGeo, millerOrbitMat));

    // Rendezvous Parking orbit ring (Endurance safe distance)
    const safeOrbitGeo = new THREE.RingGeometry(180, 181.5, 64);
    safeOrbitGeo.rotateX(Math.PI / 2);
    const safeOrbitMat = new THREE.MeshBasicMaterial({ color: 0x66bb6a, side: THREE.DoubleSide });
    this.overviewGroup.add(new THREE.Mesh(safeOrbitGeo, safeOrbitMat));

    // Planet marker on orbit
    const pMarkerGeo = new THREE.SphereGeometry(4.5, 12, 12);
    const pMarkerMat = new THREE.MeshBasicMaterial({ color: 0x4fc3f7 });
    this.overviewMillerMarker = new THREE.Mesh(pMarkerGeo, pMarkerMat);
    this.overviewMillerMarker.position.set(38.5, 0, 0);
    this.overviewGroup.add(this.overviewMillerMarker);

    // Spacecraft marker
    const sMarkerGeo = new THREE.ConeGeometry(3.5, 8, 5);
    sMarkerGeo.rotateX(Math.PI / 2);
    const sMarkerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.overviewCraftMarker = new THREE.Mesh(sMarkerGeo, sMarkerMat);
    this.overviewGroup.add(this.overviewCraftMarker);
  }

  // --------------------------------------------------------------------------
  // Simulation Lifecycle & Mode Switching
  // --------------------------------------------------------------------------
  start() {
    this.active = true;
    this.rootGroup.visible = true;
    this.setStage(0);
    this.engine.setMode?.('interstellar');
  }

  stop() {
    this.active = false;
    this.rootGroup.visible = false;
  }

  setStage(index) {
    if (index < 0 || index >= INTERSTELLAR_STAGES.length) return;
    this.currentStageIndex = index;
    this.stage = INTERSTELLAR_STAGES[index];
    this.stageTimer = 0;

    // Apply instantaneous time skips when explicitly indicated in stage definition
    if (this.stage.timeSkipEarthSec) {
      this.earthTimeSec += this.stage.timeSkipEarthSec;
      this.travelerTimeSec += this.stage.timeSkipEarthSec / (this.stage.dilationTarget || 1.0);
    }

    // Toggle group visibility based on stage context
    const isEarth = index <= 1;
    const isSaturn = index >= 1 && index <= 3;
    const isGargantua = index >= 4 && index <= 6;
    const isMiller = index >= 7 && index <= 12;
    const isRendezvous = index === 12;

    this.earthGroup.visible = isEarth;
    this.saturnGroup.visible = isSaturn;
    this.gargantuaGroup.visible = isGargantua || isRendezvous;
    this.millersGroup.visible = isMiller;

    // Position craft and camera
    this.inspectDistance = this.stage.camDistance || 250;
    this.inspectPitch = 0.18;
    this.inspectYaw = 0.35;

    if (this.stage.id === 'WATER_LANDING' || this.stage.id === 'WAVE_DISCOVERY' || this.stage.id === 'WAVE_ENCOUNTER') {
      // Landed in water: craft floats at Y = 0.4 (knee deep water)
      this.craft.position.set(0, 0.4, 0);
      this.craft.rotation.set(0, 0, 0);
    } else if (this.stage.id === 'EMERGENCY_ASCENT') {
      this.craft.position.set(0, 80, 0);
      this.craft.rotation.set(0.6, 0, 0);
    } else {
      this.craft.position.set(0, 0, 0);
      this.craft.rotation.set(0, 0, 0);
    }

    if (window.__interstellarUI) {
      window.__interstellarUI.notifyStageChanged(this.stage, this.currentStageIndex);
    }
  }

  nextStage() {
    if (this.currentStageIndex < INTERSTELLAR_STAGES.length - 1) {
      this.setStage(this.currentStageIndex + 1);
    }
  }

  prevStage() {
    if (this.currentStageIndex > 0) {
      this.setStage(this.currentStageIndex - 1);
    }
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    return this.isPaused;
  }

  toggleSystemOverview() {
    this.systemOverviewActive = !this.systemOverviewActive;
    this.overviewGroup.visible = this.systemOverviewActive;
    return this.systemOverviewActive;
  }

  toggleDopplerAsymmetry() {
    this.dopplerAsymmetry = !this.dopplerAsymmetry;
    const val = this.dopplerAsymmetry ? 1.0 : 0.0;
    if (this.gargantuaShader?.uniforms?.uDopplerBeaming) {
      this.gargantuaShader.uniforms.uDopplerBeaming.value = val;
    }
    return this.dopplerAsymmetry;
  }

  setTimeScale(scale) {
    this.timeScale = Math.max(0.1, Math.min(scale, 1000));
  }

  // --------------------------------------------------------------------------
  // Update Loop
  // --------------------------------------------------------------------------
  update(dt) {
    if (!this.active) return;

    const scaledDt = this.isPaused ? 0 : dt * this.timeScale;
    this.stageTimer += scaledDt;

    // Smoothly blend time dilation toward the stage target
    const targetDilation = this.stage.dilationTarget || 1.0;
    const blendRate = Math.min(1.0, scaledDt * 0.85);
    this.currentDilation += (targetDilation - this.currentDilation) * blendRate;

    // Relativistic clock accumulation:
    // Proper time (tau) ticks at 1 second per second locally.
    // Earth coordinate time (t) ticks at gamma * dtau.
    this.travelerTimeSec += scaledDt;
    this.earthTimeSec += scaledDt * this.currentDilation;

    // Acoustic Pulse on Miller's Surface:
    // 1 tick = 1.25s locally = 1 full Earth day passed!
    if (this.stage.id === 'WATER_LANDING' || this.stage.id === 'WAVE_DISCOVERY' || this.stage.id === 'WAVE_ENCOUNTER') {
      this.tickTimer += scaledDt;
      if (this.tickTimer >= 1.25) {
        this.tickTimer -= 1.25;
        this.audioTickCount++;
        this._playAcousticTimePulse();
      }
    }

    // Auto-advance stages after 22 seconds if autoAdvance is enabled
    if (this.autoAdvance && this.stageTimer > 22 && this.currentStageIndex < INTERSTELLAR_STAGES.length - 1) {
      this.nextStage();
    }

    // Dynamic wave propagation on Miller's planet
    if (this.millersGroup.visible) {
      let waveDist = 1800;
      if (this.stage.id === 'WAVE_DISCOVERY') {
        // Wave far on horizon (1.8 km to 1.1 km)
        waveDist = Math.max(950, 1800 - this.stageTimer * 35.0);
      } else if (this.stage.id === 'WAVE_ENCOUNTER') {
        // Wave sweeping directly overhead (950m down to 60m)
        waveDist = Math.max(50, 850 - this.stageTimer * 65.0);
      } else if (this.stage.id === 'EMERGENCY_ASCENT') {
        waveDist = 40;
      }
      if (this.millerOceanShader?.uniforms) {
        this.millerOceanShader.uniforms.uWaveDistance.value = waveDist;
        this.millerOceanShader.uniforms.uTime.value += scaledDt;
      }
    }

    // Update shaders and particle dynamics
    if (this.gargantuaShader?.uniforms) {
      this.gargantuaShader.uniforms.uTime.value += scaledDt;
      this.gargantuaShader.uniforms.uCameraPos.value.copy(this.camera.position);
    }
    if (this.wormholeMat?.uniforms) {
      this.wormholeMat.uniforms.uTime.value += scaledDt;
      this.wormholeMat.uniforms.uCameraPos.value.copy(this.camera.position);
    }
    if (this.diskParticles) {
      this.diskParticles.rotation.y += scaledDt * 0.12;
    }

    // Interactive camera positioning
    this._updateCamera();

    // Push state to UI
    if (window.__interstellarUI) {
      window.__interstellarUI.updateTelemetry({
        travelerTimeSec: this.travelerTimeSec,
        earthTimeSec: this.earthTimeSec,
        dilation: this.currentDilation,
        stage: this.stage,
        stageIndex: this.currentStageIndex,
        isPaused: this.isPaused,
        timeScale: this.timeScale,
        doppler: this.dopplerAsymmetry,
        overview: this.systemOverviewActive
      });
    }
  }

  _updateCamera() {
    if (this.systemOverviewActive) {
      // Top-down orrery camera
      this.camera.position.set(0, 360, 180);
      this.camera.lookAt(0, 0, 0);
      return;
    }

    // Spherical orbit around the craft
    const cosP = Math.cos(this.inspectPitch);
    const sinP = Math.sin(this.inspectPitch);
    const sinY = Math.sin(this.inspectYaw);
    const cosY = Math.cos(this.inspectYaw);

    const dist = this.inspectDistance;
    const target = this.craft.position;

    this.camera.position.set(
      target.x + dist * cosP * sinY,
      target.y + dist * sinP + 2.0,
      target.z + dist * cosP * cosY
    );
    this.camera.lookAt(target.x, target.y + 1.2, target.z);
  }

  _playAcousticTimePulse() {
    try {
      const audioCtx = this.engine.audio?.ctx;
      if (!audioCtx || audioCtx.state !== 'running') return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High crisp clock pip
      osc.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.09);
    } catch (_) {}
  }

  // 360 Camera Drag Handling
  adjustGimbal(dYaw, dPitch) {
    this.inspectYaw += dYaw;
    this.inspectPitch = Math.max(-1.4, Math.min(1.4, this.inspectPitch + dPitch));
  }

  adjustZoom(delta) {
    this.inspectDistance = Math.max(12, Math.min(4000, this.inspectDistance * (1 + delta)));
  }
}
