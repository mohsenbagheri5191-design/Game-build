/**
 * Toronto downtown survey grid <-> the real world.
 *
 * The game world IS the survey grid: X = u (metres east along the east-west
 * streets), Z = -v (so +v is "up the map"), Y = up. That keeps every lot and
 * every build slot axis-aligned, which is what makes snapping cheap and exact.
 *
 * True north and WGS84 only come back into it for the compass and for the
 * addresses on site cards. These constants mirror build/toronto-source.mjs.
 */

export const ORIGIN_LAT = 43.6455;
export const ORIGIN_LON = -79.3778;

const TH_U = (17.2 * Math.PI) / 180; // east-west streets, north of true east
const TH_V = (14.2 * Math.PI) / 180; // north-south streets, west of true north
const UC = Math.cos(TH_U), US = Math.sin(TH_U);
const VC = Math.cos(TH_V), VS = Math.sin(TH_V);

/** True north measured inside the game's own grid frame, in radians. */
export const NORTH_IN_GRID = Math.atan2(-VS, VC);
export const GRID_ROT_DEG = 17.2;

export function gridToEN(u, v) {
  return { e: u * UC - v * VS, n: u * US + v * VC };
}

export function gridToLatLon(u, v) {
  const e = u * UC - v * VS;
  const n = u * US + v * VC;
  const lat = ORIGIN_LAT + n / 111320;
  const lon = ORIGIN_LON + e / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat, lon };
}

export function formatLatLon(u, v) {
  const { lat, lon } = gridToLatLon(u, v);
  return `${lat.toFixed(5)}°N, ${Math.abs(lon).toFixed(5)}°W`;
}

/** Compass bearing (degrees from true north) for a heading in the grid frame. */
export function headingToBearing(headingRad) {
  let deg = ((headingRad - NORTH_IN_GRID) * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return deg;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function cardinal(bearingDeg) {
  return CARDINALS[Math.round(bearingDeg / 45) % 8];
}

// --- units ----------------------------------------------------------------
export function fmtLength(m, imperial) {
  if (!imperial) return `${m < 10 ? m.toFixed(1) : Math.round(m)} m`;
  const ft = m * 3.28084;
  return `${ft < 30 ? ft.toFixed(1) : Math.round(ft)} ft`;
}
export function fmtArea(m2, imperial) {
  if (!imperial) return `${Math.round(m2)} m²`;
  return `${Math.round(m2 * 10.7639)} sq ft`;
}
