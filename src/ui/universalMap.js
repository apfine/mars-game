import { SCENE_AU, SOLAR_BODIES } from '../flight/orbitalMechanics.js';

export function universalMapState(physics, journey) {
  const route = journey?.routeKind;
  const progress = journey?.progress || 0;
  const wormholeFarSide = journey?.active && route === 'wormhole'
    && (journey.target === 'gargantua' ? progress >= 0.5 : progress < 0.5);
  const gargantuaSystem = journey?.active && route === 'wormhole'
    ? wormholeFarSide
    : ['gargantua', 'miller'].includes(physics.planetId)
      || (journey?.active && route === 'gargantua-local');

  if (gargantuaSystem) {
    let x = physics.planetId === 'miller' ? 2 : 0;
    if (journey?.active && route === 'gargantua-local') {
      x = journey.target === 'miller' ? progress * 2 : 2 - progress * 2;
    } else if (wormholeFarSide) {
      x = journey.target === 'gargantua' ? -3 + Math.max(0, progress - 0.5) * 6 : -3 + Math.max(0, 0.5 - progress) * 6;
    }
    return { chart: 'gargantua', x, z: 0, label: journey?.active ? 'IN TRANSIT' : physics.planetId.toUpperCase() };
  }

  const origin = journey?.solarOrigin;
  if (journey?.active && route === 'kepler' && origin) {
    return {
      chart: 'solar',
      x: (physics.position.x - origin.x) / SCENE_AU,
      z: (physics.position.z - origin.z) / SCENE_AU,
      label: `TO ${journey.target.toUpperCase()}`
    };
  }

  const bodyId = physics.planetId === 'moon' ? 'moon' : physics.planetId;
  if (journey?.active && route === 'wormhole') {
    const saturn = journey.bodyEphemeris?.get('saturn');
    return {
      chart: 'solar',
      x: saturn && origin ? (saturn.x - origin.x) / SCENE_AU : 9.5549,
      z: saturn && origin ? (saturn.z - origin.z) / SCENE_AU : 0,
      label: 'SATURN WORMHOLE'
    };
  }
  const position = bodyId === 'moon' ? journey?.moonEphemeris : journey?.bodyEphemeris?.get(bodyId);
  const body = SOLAR_BODIES.find((item) => item.id === bodyId);
  return {
    chart: 'solar',
    x: position && origin ? (position.x - origin.x) / SCENE_AU : body?.au || 1,
    z: position && origin ? (position.z - origin.z) / SCENE_AU : 0,
    label: physics.planetId.toUpperCase()
  };
}

export function solarBodyPositions(journey) {
  const origin = journey?.solarOrigin;
  return SOLAR_BODIES.map((body) => {
    const position = journey?.bodyEphemeris?.get(body.id);
    return {
      ...body,
      x: position && origin ? (position.x - origin.x) / SCENE_AU : body.au,
      z: position && origin ? (position.z - origin.z) / SCENE_AU : 0
    };
  });
}
