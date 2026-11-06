// Radial/tangent coordinates centred on the active world's launch site.
// x/z are local arc distances and y is radial altitude. These curvature terms
// are the polar-coordinate form of Newtonian central gravity; in particular,
// tangential speed changes as the craft climbs, conserving angular momentum.
export function localCentralAcceleration(radius, surfaceGravity, altitude, velocity, out) {
  const r = radius + Math.max(0, altitude);
  const radialSpeed = velocity.y;
  const inverseRadius = 1 / r;
  const tangentialSpeedSq = velocity.x * velocity.x + velocity.z * velocity.z;
  out.set(
    -radialSpeed * velocity.x * inverseRadius,
    tangentialSpeedSq * inverseRadius - surfaceGravity * (radius * inverseRadius) ** 2,
    -radialSpeed * velocity.z * inverseRadius
  );
  return out;
}

export function localOrbitElements(radius, surfaceGravity, altitude, velocity) {
  const r = radius + Math.max(0, altitude);
  const mu = surfaceGravity * radius * radius;
  const tangentialSpeedSq = velocity.x * velocity.x + velocity.z * velocity.z;
  const angularMomentumSq = r * r * tangentialSpeedSq;
  const energy = (tangentialSpeedSq + velocity.y * velocity.y) / 2 - mu / r;
  // Eccentricity-vector components avoid cancellation in nearly circular orbit.
  const eccentricity = Math.hypot(r * tangentialSpeedSq / mu - 1,
    r * velocity.y * Math.sqrt(tangentialSpeedSq) / mu);
  const periapsis = angularMomentumSq / (mu * (1 + eccentricity)) - radius;
  const apoapsis = energy < 0 && eccentricity < 1
    ? angularMomentumSq / (mu * (1 - eccentricity)) - radius
    : Infinity;
  return { periapsis, apoapsis, eccentricity, energy };
}
