// Physical profiles for every world the Starship can visit.
//
// The flight model is written once and reads gravity, radius, atmosphere
// layers and sky colours from these profiles. Adding another destination is a
// data change rather than a second physics implementation.

const MARS_G0 = 3.721;
const EARTH_G0 = 9.80665;

function buildLayers(surfaceDensity, definitions) {
  let density = surfaceDensity;
  return definitions.map((layer) => {
    const next = {
      ...layer,
      densityBottom: density,
      densityTop: density * Math.exp(-(layer.top - layer.bottom) / layer.scaleHeight)
    };
    density = next.densityTop;
    return next;
  });
}

export const PLANET_PROFILES = {
  mars: {
    id: 'mars',
    name: 'MARS',
    surfaceType: 'solid', landable: true,
    designation: 'SOL IV',
    gravity: MARS_G0,
    gasConstant: 188.92,
    gamma: 1.33,
    radius: 3389500,
    surfaceDensity: 0.020,
    surfacePressurePa: 610,
    seaLevelTemperatureK: 214,
    starbaseName: 'STARBASE ARES',
    entryAltitude: 78000,
    arrivalSpeed: 3400,
    sky: {
      zenith: 0xc47e5a,
      horizon: 0xe0aa8c,
      sun: 0xfff6ea,
      halo: 0x62a8dc,
      limb: 0xe07a45,
      ground: 0x94502f,
      forward: 0x382416
    },
    layers: buildLayers(0.020, [
      { bottom: 0, top: 7000, scaleHeight: 11100, tempBottom: 214, tempTop: 206 },
      { bottom: 7000, top: 18000, scaleHeight: 9600, tempBottom: 206, tempTop: 188 },
      { bottom: 18000, top: 40000, scaleHeight: 6900, tempBottom: 188, tempTop: 168 },
      { bottom: 40000, top: 75000, scaleHeight: 4600, tempBottom: 168, tempTop: 150 },
      { bottom: 75000, top: 120000, scaleHeight: 3100, tempBottom: 150, tempTop: 138 }
    ])
  },

  earth: {
    id: 'earth',
    name: 'EARTH',
    surfaceType: 'solid', landable: true,
    designation: 'SOL III',
    gravity: EARTH_G0,
    gasConstant: 287.05,
    gamma: 1.4,
    radius: 6371000,
    surfaceDensity: 1.225,
    surfacePressurePa: 101325,
    seaLevelTemperatureK: 288,
    starbaseName: 'STARBASE ATLANTIS',
    entryAltitude: 120000,
    arrivalSpeed: 7600,
    sky: {
      zenith: 0x2f6fd0,
      horizon: 0xbcd8f0,
      sun: 0xfff7e8,
      halo: 0x9fc8ff,
      limb: 0x7fb4ff,
      ground: 0x2f5a34,
      forward: 0x9fb9c9
    },
    layers: buildLayers(1.225, [
      { bottom: 0, top: 11000, scaleHeight: 8500, tempBottom: 288, tempTop: 216 },
      { bottom: 11000, top: 25000, scaleHeight: 6400, tempBottom: 216, tempTop: 221 },
      { bottom: 25000, top: 50000, scaleHeight: 7200, tempBottom: 221, tempTop: 270 },
      { bottom: 50000, top: 90000, scaleHeight: 6200, tempBottom: 270, tempTop: 190 },
      { bottom: 90000, top: 140000, scaleHeight: 4800, tempBottom: 190, tempTop: 160 }
    ])
  }
};

PLANET_PROFILES.moon = {
  id: 'moon', name: 'MOON', designation: 'LUNA', gravity: 1.625,
  surfaceType: 'solid', landable: true,
  gasConstant: 1, gamma: 1, radius: 1737400, surfaceDensity: 0,
  surfacePressurePa: 0, seaLevelTemperatureK: 220, starbaseName: 'STARBASE SELENE',
  entryAltitude: 20000, arrivalSpeed: 150,
  sky: { zenith: 0x000000, horizon: 0x000000, sun: 0xffffff, halo: 0x000000, limb: 0x000000, ground: 0x808080, forward: 0x000000 },
  layers: buildLayers(0, [{bottom:0,top:100000,scaleHeight:1,tempBottom:220,tempTop:220}])
};

// The six additional Solar System worlds are orbital destinations. The gas
// giants have no solid surface; Mercury/Venus local terrain and entry are not
// simulated. Gas-giant altitude zero is the conventional 1-bar reference level.
// Physical constants: NASA/JPL https://ssd.jpl.nasa.gov/planets/phys_par.html
PLANET_PROFILES.mercury = {
  id: 'mercury', name: 'MERCURY', designation: 'SOL I',
  surfaceType: 'solid', landable: false, gravity: 3.7, radius: 2439700,
  gasConstant: 1, gamma: 1, surfaceDensity: 0, surfacePressurePa: 0,
  seaLevelTemperatureK: 440, starbaseName: 'MERCURY FLYBY',
  entryAltitude: 100000, arrivalSpeed: 0,
  sky: { zenith: 0x000000, horizon: 0x000000, sun: 0xffffff, halo: 0,
    limb: 0, ground: 0x8d8277, forward: 0 },
  layers: buildLayers(0, [{ bottom: 0, top: 100000, scaleHeight: 1,
    tempBottom: 440, tempTop: 440 }])
};
PLANET_PROFILES.venus = {
  id: 'venus', name: 'VENUS', designation: 'SOL II',
  surfaceType: 'solid', landable: false, gravity: 8.87, radius: 6051800,
  gasConstant: 188.9, gamma: 1.3, surfaceDensity: 65,
  surfacePressurePa: 9200000, seaLevelTemperatureK: 737,
  starbaseName: 'VENUS FLYBY', entryAltitude: 250000, arrivalSpeed: 0,
  sky: { zenith: 0xc7a464, horizon: 0xeacb8b, sun: 0xffeed0,
    halo: 0xf6cf83, limb: 0xd9b369, ground: 0x98743f, forward: 0x765a38 },
  layers: buildLayers(65, [
    { bottom: 0, top: 50000, scaleHeight: 15900, tempBottom: 737, tempTop: 340 },
    { bottom: 50000, top: 100000, scaleHeight: 10000, tempBottom: 340, tempTop: 180 },
    { bottom: 100000, top: 250000, scaleHeight: 12500, tempBottom: 180, tempTop: 160 }
  ])
};

function giantProfile(id, name, designation, gravity, radius, temperature, density, scaleHeight, colors) {
  const gasConstant = 3600; // Approximate hydrogen/helium mixture, J/(kg K).
  return {
    id, name, designation, surfaceType: 'gas', landable: false,
    gravity, radius, gasConstant, gamma: 1.4,
    surfaceDensity: density, surfacePressurePa: 100000,
    seaLevelTemperatureK: temperature, starbaseName: `${name} FLYBY`,
    entryAltitude: 500000, arrivalSpeed: 0,
    sky: { zenith: colors[0], horizon: colors[1], sun: 0xffffff,
      halo: colors[1], limb: colors[1], ground: colors[0], forward: colors[0] },
    layers: buildLayers(density, [
      { bottom: 0, top: 100000, scaleHeight,
        tempBottom: temperature, tempTop: temperature * 0.85 },
      { bottom: 100000, top: 500000, scaleHeight: scaleHeight * 1.5,
        tempBottom: temperature * 0.85, tempTop: temperature * 0.7 }
    ])
  };
}
PLANET_PROFILES.jupiter = giantProfile('jupiter', 'JUPITER', 'SOL V', 24.8,
  69911000, 165, 0.168, 27000, [0x9e7453, 0xd4b98a]);
PLANET_PROFILES.saturn = giantProfile('saturn', 'SATURN', 'SOL VI', 10.44,
  58232000, 135, 0.206, 59000, [0xa88b66, 0xe0c999]);
PLANET_PROFILES.uranus = giantProfile('uranus', 'URANUS', 'SOL VII', 8.69,
  25362000, 76, 0.365, 31000, [0x568d95, 0xa8e1e3]);
PLANET_PROFILES.neptune = giantProfile('neptune', 'NEPTUNE', 'SOL VIII', 11.15,
  24622000, 72, 0.386, 23000, [0x193b91, 0x5b8ed1]);

// Gargantua uses a separate Kerr navigation state. `radius` is the
// near-extremal horizon GM/c², not the Schwarzschild radius 2GM/c², and it
// must never be fed to the Newtonian flight integrator.
PLANET_PROFILES.gargantua = {
  id: 'gargantua', name: 'GARGANTUA', designation: 'KERR BLACK HOLE',
  surfaceType: 'black-hole', landable: false, gravity: 0, radius: 1.476625e11,
  gasConstant: 1, gamma: 1, surfaceDensity: 0, surfacePressurePa: 0,
  seaLevelTemperatureK: 3, starbaseName: 'GARGANTUA OBSERVER WAYPOINT',
  entryAltitude: 100000, arrivalSpeed: 0,
  sky: { zenith: 0x020309, horizon: 0x020309, sun: 0xffffff,
    halo: 0x020309, limb: 0x020309, ground: 0x020309, forward: 0x020309 },
  layers: buildLayers(0, [{ bottom: 0, top: 100000, scaleHeight: 1, tempBottom: 3, tempTop: 3 }])
};

// The film specifies the clock ratio, not Miller's measured radius, surface g,
// or air density. Earth-like local values below are explicit gameplay inputs.
PLANET_PROFILES.miller = {
  id: 'miller', name: "MILLER'S PLANET", designation: 'GARGANTUA SYSTEM',
  surfaceType: 'ocean', landable: true, gravity: 9.80665, radius: 6371000,
  gasConstant: 287.05, gamma: 1.4, surfaceDensity: 1.225,
  surfacePressurePa: 101325, seaLevelTemperatureK: 285,
  starbaseName: 'MILLER LANDING PLATFORM', entryAltitude: 120000, arrivalSpeed: 7600,
  sky: { zenith: 0x425961, horizon: 0x7b9499, sun: 0xf0dfbf,
    halo: 0x657d83, limb: 0x729fa7, ground: 0x243e49, forward: 0x243e49 },
  layers: buildLayers(1.225, [
    { bottom: 0, top: 11000, scaleHeight: 8500, tempBottom: 285, tempTop: 216 },
    { bottom: 11000, top: 25000, scaleHeight: 6400, tempBottom: 216, tempTop: 220 },
    { bottom: 25000, top: 50000, scaleHeight: 7200, tempBottom: 220, tempTop: 270 },
    { bottom: 50000, top: 90000, scaleHeight: 6200, tempBottom: 270, tempTop: 190 },
    { bottom: 90000, top: 140000, scaleHeight: 4800, tempBottom: 190, tempTop: 160 }
  ])
};

export const DESTINATIONS = ['mercury', 'venus', 'earth', 'moon', 'mars',
  'jupiter', 'saturn', 'uranus', 'neptune', 'gargantua', 'miller'];

export function getPlanetProfile(id) {
  return PLANET_PROFILES[id] || PLANET_PROFILES.mars;
}
