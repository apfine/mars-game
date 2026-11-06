// Gargantua is a near-extremal Kerr black hole in the fiction. The ratio below
// belongs to Miller's orbiting clock, not to a Newtonian surface gravity field.
export const SOLAR_MASS_KG = 1.98847e30;
export const SPEED_OF_LIGHT = 299792458;
export const G = 6.67430e-11;
export const GARGANTUA_MASS_KG = 100_000_000 * SOLAR_MASS_KG;
export const GARGANTUA_SCHWARZSCHILD_RADIUS_M = 2 * G * GARGANTUA_MASS_KG / SPEED_OF_LIGHT ** 2;
export const MILLER_DISTANT_SECONDS_PER_LOCAL_SECOND = 7 * 365.25 * 86400 / 3600;

export function distantElapsedSeconds(localSeconds, location) {
  return localSeconds * (location === 'miller' ? MILLER_DISTANT_SECONDS_PER_LOCAL_SECOND : 1);
}

// A wormhole is a portal between two coordinate charts, not a gravity source.
export function missionRoute(from, to) {
  if (from === to) return [];
  const outer = new Set(['gargantua', 'miller']);
  const fromOuter = outer.has(from), toOuter = outer.has(to);
  const solarRoute = (origin, destination) => {
    const route = [];
    let at = origin;
    if (at === 'moon' && destination !== 'earth') { route.push('earth'); at = 'earth'; }
    if (at === 'mercury' && destination !== 'venus') { route.push('venus'); at = 'venus'; }
    if (destination === 'moon') {
      if (at !== 'earth') route.push('earth');
      route.push('moon');
      return route;
    }
    const far = new Set(['jupiter','saturn','uranus','neptune']);
    if (destination === 'mercury' && (at === 'mars' || at === 'jupiter')) { route.push('venus'); at = 'venus'; }
    if (far.has(destination) && ['mercury','venus','earth'].includes(at)) { route.push('mars'); at = 'mars'; }
    if ((destination === 'uranus' || destination === 'neptune') && at === 'mars') route.push('saturn');
    if (at !== destination) route.push(destination);
    return route;
  };
  if (!fromOuter && !toOuter) return solarRoute(from, to);
  if (!fromOuter) return [...solarRoute(from, 'saturn'), 'gargantua', ...(to === 'miller' ? ['miller'] : [])];
  if (fromOuter && toOuter) return [to];
  return [...(from === 'miller' ? ['gargantua'] : []), 'saturn', ...solarRoute('saturn', to)];
}

export function transferKind(from, to) {
  if ((from === 'saturn' && to === 'gargantua') || (from === 'gargantua' && to === 'saturn')) return 'wormhole';
  if ((from === 'gargantua' && to === 'miller') || (from === 'miller' && to === 'gargantua')) return 'gargantua-local';
  return 'kepler';
}

// Visual beats for the Saturn mouth. `along` is 0 at departure, 1 at the
// throat, and 2 once the ship has left the mouth in the other chart.
export function wormholeTransit(t) {
  const u = Math.min(1, Math.max(0, t));
  if (u < 0.42) return { phase: 'approach', along: u / 0.42 };
  if (u < 0.62) return { phase: 'throat', along: 1 };
  return { phase: 'emergence', along: 1 + (u - 0.62) / 0.38 };
}
