/**
 * Colour.
 *
 * The brief forbids pre-picking a palette for the player's builds, and allows
 * exactly as much colour as legibility needs. So the defaults here are
 * *semantic*, not decorative: a zone called "Leaves" comes out green because a
 * grey tree is unreadable, and a zone called "Wall" comes out neutral because
 * choosing its colour is the player's job.
 *
 * Every one of these is a starting value the player can change per part.
 */

const SEMANTIC = [
  // [ keywords, hex ]
  [['leaves', 'foliage', 'needles', 'blades', 'hedge', 'trailing', 'plants', 'lattice'], '#5f8f4b'],
  [['blossom'], '#e6a7bd'],
  [['petals'], '#efc2d2'],
  [['trunk', 'bark', 'stems', 'branches', 'log'], '#6b4c33'],
  [['fruit'], '#c8492f'],
  [['flowers', 'tulips', 'berries', 'produce'], '#d4574a'],
  [['soil', 'under'], '#4d3a2b'],
  [['grass'], '#5f8f4b'],
  [['moss'], '#6f8f4a'],
  [['glass', 'pane', 'window'], '#a9cfe0'],
  [['water'], '#5892b0'],
  [['lantern', 'bulbs', 'light', 'glow', 'paper'], '#ffd9a0'],
  [['iron', 'ironwork', 'chains', 'rails', 'metal', 'wire', 'tubes'], '#3f454b'],
  [['rope', 'cord', 'weave', 'wicker'], '#b79a6b'],
  [['stone', 'stones', 'rock', 'paving', 'slab', 'gravel', 'cobble', 'plinth', 'capping', 'coping'], '#9d9a92'],
  [['brick', 'bricks'], '#a5674f'],
  [['mortar', 'joints', 'gaps'], '#b9b4a8'],
  [['roof', 'ridge', 'shingle', 'canopy'], '#7a5c4b'],
  [['boards', 'planks', 'slats', 'timber', 'pickets', 'deck', 'perch'], '#c2a179'],
  [['handle', 'fittings', 'finials', 'flag', 'bucket', 'plaque', 'statue'], '#b08a54'],
  [['tyres'], '#31353a'],
  [['check', 'pattern', 'ribbon', 'bow', 'flags a'], '#c2544c'],
  [['flags b'], '#4f86a8'],
  [['skin'], '#e8b98d'],
];

const NEUTRAL = '#cfc9be';
const TRIM = '#a89e8f';
const DETAIL = '#8f8779';

/** Starting colour for one named zone. */
export function defaultZoneColor(zoneName, zoneIndex = 0) {
  const n = String(zoneName || '').toLowerCase();
  for (const [keys, hex] of SEMANTIC) {
    for (const k of keys) if (n.includes(k)) return hex;
  }
  return zoneIndex === 0 ? NEUTRAL : zoneIndex === 1 ? TRIM : DETAIL;
}

export function defaultColorsFor(part) {
  const z = part.zones || ['Body', 'Trim', 'Detail'];
  return [0, 1, 2].map((i) => defaultZoneColor(z[i] ?? z[0], i));
}

// ---------------------------------------------------------------------------
// The swatch grid. Wide enough to be expressive without being a mood board —
// the free picker sits alongside it for anything not here.
// ---------------------------------------------------------------------------
export const SWATCHES = [
  // neutrals
  '#ffffff', '#eae6dd', '#cfc9be', '#a9a297', '#7d766c', '#54504a', '#332f2b', '#14120f',
  // warm earth
  '#f4d9b0', '#e0b483', '#c2a179', '#a5784c', '#7d5734', '#563a22', '#8b4a2f', '#5e2f1d',
  // red / pink
  '#ffd2cf', '#f3968f', '#e15a51', '#c0392b', '#8e2a20', '#f7b6cd', '#e07a9e', '#a84a69',
  // orange / yellow
  '#ffd9a0', '#ffbe5c', '#f59b25', '#d97d0d', '#9c5a08', '#fff3b0', '#f5df6a', '#d4bb2c',
  // green
  '#d8ecc4', '#a8d18a', '#6faa4e', '#4d8636', '#356024', '#b8e0cf', '#6fbfa0', '#3f8c72',
  // blue / teal
  '#cfe9f2', '#96cfe3', '#54a7c9', '#2f7fa3', '#1d5a77', '#c5d4f0', '#8aa6e0', '#4f6cb3',
  // purple
  '#e6d6f2', '#c2a3dd', '#9a6dc0', '#744a97', '#4e3068', '#f0d0e8', '#d295c6', '#a3609b',
  // accents
  '#7fffd8', '#64e6c8', '#ffe66d', '#ff9f68', '#ff6b6b', '#b8f2e6', '#3f454b', '#0d0f12',
];

export function hexToRgb01(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgb01ToHex(c) {
  const f = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');
  return `#${f(c[0])}${f(c[1])}${f(c[2])}`;
}
