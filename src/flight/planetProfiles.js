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
    designation: 'SOL IV',
    gravity: MARS_G0,
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
    designation: 'SOL III',
    gravity: EARTH_G0,
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

export const DESTINATIONS = ['mars', 'earth'];

export function getPlanetProfile(id) {
  return PLANET_PROFILES[id] || PLANET_PROFILES.mars;
}
