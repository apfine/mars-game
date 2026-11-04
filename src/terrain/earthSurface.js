// Shared render/collision surface: coastal launch site, inland hills and tidal flats.
export const EARTH_RADIUS = 6371000;
export function earthCoastDistance(x, z) {
  return 2300 + Math.sin(z * 0.00045) * 650 + Math.sin(z * 0.0013) * 170 - x;
}
export function earthSurfaceHeight(x, z) {
  const r = Math.hypot(x, z);
  if (r < 490) return 0;
  const blend = Math.min(1, (r - 490) / 500);
  const coast = earthCoastDistance(x, z);
  const inland = Math.max(0, Math.min(1, coast / 1600));
  const hills = (Math.sin(x * 0.0007) * Math.cos(z * 0.00055) + 1) * 16 * inland;
  const rolling = (Math.sin(x * 0.006 + Math.sin(z * 0.002)) * Math.cos(z * 0.005) * 2.4 +
    Math.sin(x * 0.018 + z * 0.011) * Math.sin(z * 0.014) * 0.65) * inland;
  const elevation = coast < 0 ? Math.max(-35, coast * 0.025) : Math.min(8, coast * 0.025) + hills + rolling;
  return blend * elevation - r * r / (2 * EARTH_RADIUS);
}
