const R_EARTH = 6371000;
const DEG = Math.PI / 180;

/** Distanza haversine in metri. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Bearing iniziale in gradi 0-360. */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin((lon2 - lon1) * DEG) * Math.cos(lat2 * DEG);
  const x =
    Math.cos(lat1 * DEG) * Math.sin(lat2 * DEG) -
    Math.sin(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.cos((lon2 - lon1) * DEG);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

/** Sposta un punto di (distM, bearingDeg). Approssimazione locale, ok per tracce di volo. */
export function destination(
  lat: number,
  lon: number,
  bearingDeg: number,
  distM: number,
): { lat: number; lon: number } {
  const dLat = (distM * Math.cos(bearingDeg * DEG)) / R_EARTH / DEG;
  const dLon =
    (distM * Math.sin(bearingDeg * DEG)) / (R_EARTH * Math.cos(lat * DEG)) / DEG;
  return { lat: lat + dLat, lon: lon + dLon };
}

/** Differenza angolare con segno in (-180, 180]. */
export function angleDiff(fromDeg: number, toDeg: number): number {
  let d = (toDeg - fromDeg) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}
