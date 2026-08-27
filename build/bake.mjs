/**
 * Build-time bake: turn the real Toronto geography source into a compact
 * binary the game inlines. Nothing here runs at play time.
 *
 *   node build/bake.mjs
 *
 * Pipeline
 *   1. street network  -> city blocks  (bands between real streets)
 *   2. subtract parks / water / rail corridor from the blocks
 *   3. BSP-subdivide each block into parcels with real street frontage
 *   4. give every parcel a real address and a height from the district zones
 *   5. quantise -> varint binary -> gzip -> base64
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import * as T from './toronto-source.mjs';

// ---------------------------------------------------------------------------
// OPTIONAL: real OpenStreetMap footprints
// ---------------------------------------------------------------------------
/**
 * If `build/fetch-osm.mjs` has been run, its output replaces the *derived*
 * half of the geography — the infill parcels and their heights — with real
 * building footprints. The authored street network stays either way, because
 * it carries the names and the block structure the game addresses lots by.
 *
 * Returns null when there is no extract to use, which is the case for the
 * build that currently ships (see ATTRIBUTION.md).
 */
export function loadOsm(path = process.env.OSM_FILE || 'data/toronto-osm.json') {
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const buildings = [];
  for (const el of raw.elements || []) {
    if (!el.tags?.building || !el.geometry) continue;
    // OSM height, then levels, then a default for the tag
    const h = parseFloat(el.tags.height ?? el.tags['building:height'] ?? '');
    const levels = parseFloat(el.tags['building:levels'] ?? '');
    const height = Number.isFinite(h) ? h
      : Number.isFinite(levels) ? levels * 3.4
        : null;
    const ring = el.geometry.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (ring.length < 3) continue;
    buildings.push({
      id: el.id,
      name: el.tags.name || null,
      height,
      ring: ring.map((p) => latLonToGrid(p.lat, p.lon)),
    });
  }
  return { buildings, count: buildings.length, bbox: raw.bbox };
}

/** Inverse of gridToLatLon in toronto-source.mjs. */
export function latLonToGrid(lat, lon) {
  const n = (lat - T.ORIGIN_LAT) * 111320;
  const e = (lon - T.ORIGIN_LON) * 111320 * Math.cos((lat * Math.PI) / 180);
  // solve [e;n] = [[UC,-VS],[US,VC]] * [u;v]
  const UC = Math.cos((17.2 * Math.PI) / 180), US = Math.sin((17.2 * Math.PI) / 180);
  const VC = Math.cos((14.2 * Math.PI) / 180), VS = Math.sin((14.2 * Math.PI) / 180);
  const det = UC * VC - -VS * US;
  return {
    u: (e * VC - -VS * n) / det,
    v: (UC * n - US * e) / det,
  };
}

/** Axis-aligned bounds of a ring, in grid metres. */
export function ringBounds(ring) {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const p of ring) {
    u0 = Math.min(u0, p.u); v0 = Math.min(v0, p.v);
    u1 = Math.max(u1, p.u); v1 = Math.max(v1, p.v);
  }
  return { u0, v0, u1, v1 };
}

const OSM_PATH = process.env.OSM_FILE || 'data/toronto-osm.json';
const OSM = loadOsm(OSM_PATH);
if (OSM) console.log(`Using ${OSM.count} real OSM building footprints from ${OSM_PATH}`);

// ---------------------------------------------------------------------------
// deterministic hash / rng
// ---------------------------------------------------------------------------
function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}
const rnd = (x, y, s = 0) => hash2(x, y, s) / 4294967296;

// ---------------------------------------------------------------------------
// street table -> normalised records
// ---------------------------------------------------------------------------
const CW = (cls) => (T.CLASS[cls] ? T.CLASS[cls].width : cls === 'expressway' ? 30 : 12);

const streets = [];
for (const [name, v, uMin, uMax, cls, split] of T.EW_STREETS) {
  streets.push({ name, axis: 'ew', pos: v, min: uMin, max: uMax, cls, split: !!split, width: CW(cls) });
}
for (const [name, u, vMin, vMax, cls] of T.NS_STREETS) {
  streets.push({ name, axis: 'ns', pos: u, min: vMin, max: vMax, cls, split: false, width: CW(cls) });
}
streets.forEach((s, i) => (s.idx = i));

const EW = streets.filter((s) => s.axis === 'ew').sort((a, b) => a.pos - b.pos);
const NS = streets.filter((s) => s.axis === 'ns').sort((a, b) => a.pos - b.pos);

// Expressways and the rail corridor are barriers, not addressable frontage.
const addressable = (s) => s.cls !== 'expressway' && s.cls !== 'lane';

// ---------------------------------------------------------------------------
// rectangle helpers
// ---------------------------------------------------------------------------
const rect = (u0, v0, u1, v1) => ({ u0, v0, u1, v1 });
const rw = (r) => r.u1 - r.u0;
const rh = (r) => r.v1 - r.v0;
const rarea = (r) => Math.max(0, rw(r)) * Math.max(0, rh(r));
const overlaps = (a, b) => a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1;

/** a minus b -> up to four rectangles. */
function subtract(a, b) {
  if (!overlaps(a, b)) return [a];
  const out = [];
  if (b.v1 < a.v1) out.push(rect(a.u0, Math.max(a.v0, b.v1), a.u1, a.v1));
  if (b.v0 > a.v0) out.push(rect(a.u0, a.v0, a.u1, Math.min(a.v1, b.v0)));
  const cv0 = Math.max(a.v0, b.v0), cv1 = Math.min(a.v1, b.v1);
  if (cv1 > cv0) {
    if (b.u0 > a.u0) out.push(rect(a.u0, cv0, Math.min(a.u1, b.u0), cv1));
    if (b.u1 < a.u1) out.push(rect(Math.max(a.u0, b.u1), cv0, a.u1, cv1));
  }
  return out.filter((r) => rw(r) > 0.5 && rh(r) > 0.5);
}

// ---------------------------------------------------------------------------
// 1. blocks — the land between consecutive real streets
// ---------------------------------------------------------------------------
const coversEW = (s, u) => u >= s.min - 1 && u <= s.max + 1;
const coversNS = (s, v) => v >= s.min - 1 && v <= s.max + 1;

const blocks = [];
const seenBlock = new Set();

for (let i = 0; i < EW.length - 1; i++) {
  const bandS = EW[i], bandN = EW[i + 1];
  const vMid = (bandS.pos + bandN.pos) / 2;
  if (vMid < T.BOUNDS.vMin || vMid > T.BOUNDS.vMax) continue;

  // north-south streets that actually exist across this band
  const cols = NS.filter((s) => coversNS(s, vMid)).sort((a, b) => a.pos - b.pos);
  for (let j = 0; j < cols.length - 1; j++) {
    const w = cols[j], e = cols[j + 1];
    const uMid = (w.pos + e.pos) / 2;
    if (uMid < T.BOUNDS.uMin || uMid > T.BOUNDS.uMax) continue;

    // walk outward until we find east-west streets that reach this column
    let sIdx = i;
    while (sIdx >= 0 && !coversEW(EW[sIdx], uMid)) sIdx--;
    let nIdx = i + 1;
    while (nIdx < EW.length && !coversEW(EW[nIdx], uMid)) nIdx++;
    if (sIdx < 0 || nIdx >= EW.length) continue;
    const south = EW[sIdx], north = EW[nIdx];

    const key = `${south.idx}|${north.idx}|${w.idx}|${e.idx}`;
    if (seenBlock.has(key)) continue;
    seenBlock.add(key);

    const r = rect(
      w.pos + w.width / 2, south.pos + south.width / 2,
      e.pos - e.width / 2, north.pos - north.width / 2,
    );
    if (rw(r) < 16 || rh(r) < 16) continue;
    if (r.u1 < T.BOUNDS.uMin || r.u0 > T.BOUNDS.uMax) continue;
    if (r.v1 < T.BOUNDS.vMin || r.v0 > T.BOUNDS.vMax) continue;

    blocks.push({ r, south, north, west: w, east: e });
  }
}

// ---------------------------------------------------------------------------
// 2. subtract non-buildable land
// ---------------------------------------------------------------------------
function polyBounds(poly) {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const [u, v] of poly) {
    u0 = Math.min(u0, u); v0 = Math.min(v0, v);
    u1 = Math.max(u1, u); v1 = Math.max(v1, v);
  }
  return rect(u0, v0, u1, v1);
}

const parkRects = T.PARKS.map(([name, u0, v0, u1, v1, kind]) => ({ name, kind, ...rect(u0, v0, u1, v1) }));
const railRect = polyBounds(T.RAIL_CORRIDOR.poly);
const waterRects = T.WATER.filter((w) => w.kind !== 'island')
  .map((w) => ({ name: w.name, kind: w.kind, ...polyBounds(w.poly) }));
const landmarkRects = T.LANDMARKS
  .filter((l) => l[6] !== 'skip')
  .map(([name, u0, v0, u1, v1, h, form]) => ({ name, h, form, ...rect(u0, v0, u1, v1) }));

const noBuild = [...parkRects, railRect, ...waterRects];

const parcelBlocks = [];
for (const b of blocks) {
  let pieces = [b.r];
  for (const nb of noBuild) {
    const next = [];
    for (const p of pieces) next.push(...subtract(p, nb));
    pieces = next;
  }
  // landmarks own their footprint outright
  for (const lm of landmarkRects) {
    const next = [];
    for (const p of pieces) next.push(...subtract(p, lm));
    pieces = next;
  }
  for (const p of pieces) {
    if (rw(p) < 11 || rh(p) < 11) continue;
    parcelBlocks.push({ r: p, src: b });
  }
}

// ---------------------------------------------------------------------------
// 3. BSP subdivision into parcels
// ---------------------------------------------------------------------------
/** Which sides of this piece still sit on the parent block's street edge. */
function frontage(piece, block) {
  const eps = 1.5;
  return {
    s: Math.abs(piece.v0 - block.r.v0) < eps,
    n: Math.abs(piece.v1 - block.r.v1) < eps,
    w: Math.abs(piece.u0 - block.r.u0) < eps,
    e: Math.abs(piece.u1 - block.r.u1) < eps,
  };
}

/**
 * Target parcel area for a location. Toronto's default downtown fabric is the
 * narrow deep Victorian lot; tall districts are where land has been assembled
 * into big single parcels, so parcel size tracks the height zones.
 */
function targetArea(u, v) {
  let area = 520, strongest = 0;
  for (const [zu, zv, rad, peak] of T.HEIGHT_ZONES) {
    const d = Math.hypot(u - zu, v - zv);
    if (d > rad) continue;
    const t = 1 - d / rad;
    const ease = t * t * (3 - 2 * t); // smoothstep
    if (ease <= strongest) continue;
    strongest = ease;
    const peakArea = peak > 30 ? 2200 : peak > 20 ? 1600 : peak > 12 ? 1000 : peak > 6 ? 640 : 460;
    area = 520 + (peakArea - 520) * ease;
  }
  return area;
}

const parcels = [];
function bsp(r, block, depth) {
  const u = (r.u0 + r.u1) / 2, v = (r.v0 + r.v1) / 2;
  const tgt = targetArea(u, v);
  const area = rarea(r);
  const jitter = 0.72 + rnd(Math.round(u), Math.round(v), 7) * 0.7;

  if (depth > 9 || area < tgt * jitter || (rw(r) < 13 && rh(r) < 13)) {
    if (rw(r) >= 7 && rh(r) >= 7 && area >= 70) parcels.push({ r, block });
    return;
  }

  const splitU = rw(r) >= rh(r);
  const len = splitU ? rw(r) : rh(r);
  if (len < 16) {
    if (rw(r) >= 7 && rh(r) >= 7) parcels.push({ r, block });
    return;
  }
  // bias splits toward halves, with real variation in frontage widths
  const t = 0.5 + (rnd(Math.round(u), Math.round(v), depth * 31 + 3) - 0.5) * 0.42;
  const cut = len * t;
  if (cut < 7 || len - cut < 7) {
    parcels.push({ r, block });
    return;
  }
  if (splitU) {
    bsp(rect(r.u0, r.v0, r.u0 + cut, r.v1), block, depth + 1);
    bsp(rect(r.u0 + cut, r.v0, r.u1, r.v1), block, depth + 1);
  } else {
    bsp(rect(r.u0, r.v0, r.u1, r.v0 + cut), block, depth + 1);
    bsp(rect(r.u0, r.v0 + cut, r.u1, r.v1), block, depth + 1);
  }
}
for (const pb of parcelBlocks) bsp(pb.r, pb.src, 0);

// ---------------------------------------------------------------------------
// 4. address, frontage, height, form
// ---------------------------------------------------------------------------
const FORMS = ['row', 'semi', 'brick', 'warehouse', 'midrise', 'tower', 'podiumTower', 'institution', 'shop', 'church'];
const ROOFS = ['flat', 'gable', 'hip', 'mansard', 'parapet', 'stepped'];

/**
 * Storeys at a point. Zones take the strongest influence rather than an
 * average — averaging flattens the Financial District spike into the same
 * mush as everything around it, and that spike is the whole skyline.
 */
function zoneStoreys(u, v) {
  let best = T.DEFAULT_STOREYS;
  for (const [zu, zv, rad, peak] of T.HEIGHT_ZONES) {
    const d = Math.hypot(u - zu, v - zv);
    if (d > rad) continue;
    const t = 1 - d / rad;
    const ease = Math.pow(t, 0.75); // broad shoulders, sharp core
    best = Math.max(best, T.DEFAULT_STOREYS + (peak - T.DEFAULT_STOREYS) * ease);
  }
  return best;
}

/** Which side of the parcel faces the street it is addressed on. */
function pickFront(p) {
  const f = frontage(p.r, p.block);
  const b = p.block;
  const cands = [];
  if (f.s && addressable(b.south)) cands.push({ side: 0, st: b.south, rank: T.CLASS[b.south.cls]?.rank ?? 0 });
  if (f.n && addressable(b.north)) cands.push({ side: 1, st: b.north, rank: T.CLASS[b.north.cls]?.rank ?? 0 });
  if (f.w && addressable(b.west)) cands.push({ side: 2, st: b.west, rank: T.CLASS[b.west.cls]?.rank ?? 0 });
  if (f.e && addressable(b.east)) cands.push({ side: 3, st: b.east, rank: T.CLASS[b.east.cls]?.rank ?? 0 });
  if (!cands.length) {
    // interior parcel — address it on the block's best street anyway
    const all = [b.south, b.north, b.west, b.east].filter(addressable);
    if (!all.length) return null;
    all.sort((a, c) => (T.CLASS[c.cls]?.rank ?? 0) - (T.CLASS[a.cls]?.rank ?? 0));
    const st = all[0];
    const side = st === b.south ? 0 : st === b.north ? 1 : st === b.west ? 2 : 3;
    return { side, st, interior: true };
  }
  cands.sort((a, c) => c.rank - a.rank);
  return { side: cands[0].side, st: cands[0].st, interior: false };
}

/**
 * Toronto addressing: east-west streets count outward from Yonge with W/E
 * suffixes; north-south streets count northward from the lake. Roughly 100
 * numbers per block, odd on one side.
 */
function addressFor(p, front) {
  const st = front.st;
  const cu = (p.r.u0 + p.r.u1) / 2, cv = (p.r.v0 + p.r.v1) / 2;
  let n, suffix = '';
  if (st.axis === 'ew') {
    const d = Math.abs(cu);
    n = Math.max(1, Math.round(d / 1.55));
    if (st.split) suffix = cu < 0 ? ' W' : ' E';
    // odd numbers on the south side
    const odd = front.side === 0;
    n = odd ? n | 1 : (n + 1) & ~1;
  } else {
    const d = cv + 340;
    n = Math.max(1, Math.round(d / 1.35));
    const odd = front.side === 2;
    n = odd ? n | 1 : (n + 1) & ~1;
  }
  return { num: n, suffix };
}

/**
 * If a real OSM footprint covers this parcel, take its height. Matching by
 * containment of the parcel centre is deliberately forgiving: OSM footprints
 * and the derived parcels will never line up exactly, and a real height on an
 * approximately-right footprint is a better city than a derived height on one.
 */
let osmIndex = null;
function osmHeightAt(u, v) {
  if (!OSM) return null;
  if (!osmIndex) {
    osmIndex = new Map();
    const CELL = 50;
    for (const b of OSM.buildings) {
      if (b.height == null) continue;
      const bb = ringBounds(b.ring);
      for (let x = Math.floor(bb.u0 / CELL); x <= Math.floor(bb.u1 / CELL); x++) {
        for (let z = Math.floor(bb.v0 / CELL); z <= Math.floor(bb.v1 / CELL); z++) {
          const k = `${x},${z}`;
          (osmIndex.get(k) || osmIndex.set(k, []).get(k)).push({ b, bb });
        }
      }
    }
  }
  const list = osmIndex.get(`${Math.floor(u / 50)},${Math.floor(v / 50)}`);
  if (!list) return null;
  for (const { b, bb } of list) {
    if (u >= bb.u0 && u <= bb.u1 && v >= bb.v0 && v <= bb.v1) return b.height;
  }
  return null;
}

const records = [];
let osmMatched = 0;
let skipped = 0;
for (const p of parcels) {
  const front = pickFront(p);
  if (!front) { skipped++; continue; }
  const cu = (p.r.u0 + p.r.u1) / 2, cv = (p.r.v0 + p.r.v1) / 2;
  const key = [Math.round(cu), Math.round(cv)];

  const base = zoneStoreys(cu, cv);
  const vary = rnd(key[0], key[1], 11);
  const vary2 = rnd(key[0], key[1], 23);
  const area = rarea(p.r);

  // A parcel can only carry a tower if it is big enough to hold one.
  let storeys = Math.max(1, Math.round(base * (0.62 + vary * 0.82)));
  const maxByArea = area < 200 ? 3 : area < 320 ? 5 : area < 620 ? 11 : area < 1100 ? 26
    : area < 1900 ? 44 : area < 3200 ? 62 : 80;
  storeys = Math.min(storeys, maxByArea);
  if (front.interior) storeys = Math.min(storeys, Math.max(1, Math.round(storeys * 0.55)));

  // storey height varies by use
  const storeyH = storeys <= 3 ? 3.4 : storeys <= 8 ? 3.9 : 3.25;
  let height = storeys * storeyH;
  if (storeys <= 2) height += 0.9; // pitched roof bulk

  let form;
  if (storeys >= 22) form = 'podiumTower';
  else if (storeys >= 13) form = 'tower';
  else if (storeys >= 8) form = 'midrise';
  else if (storeys >= 5) form = vary2 < 0.55 ? 'warehouse' : 'brick';
  else if (storeys >= 3) form = vary2 < 0.35 ? 'brick' : vary2 < 0.6 ? 'shop' : 'semi';
  else form = vary2 < 0.62 ? 'row' : 'semi';
  if (area > 2400 && storeys <= 6 && vary2 > 0.82) form = 'institution';

  const realHeight = osmHeightAt(cu, cv);
  if (realHeight != null && realHeight > 2) {
    height = realHeight;
    storeys = Math.max(1, Math.round(realHeight / 3.4));
    osmMatched++;
  }

  let roof;
  if (storeys >= 8) roof = 'flat';
  else if (form === 'row' || form === 'semi') roof = vary < 0.45 ? 'gable' : vary < 0.7 ? 'mansard' : 'hip';
  else roof = vary < 0.6 ? 'parapet' : storeys >= 5 ? 'flat' : 'stepped';

  const addr = addressFor(p, front);
  records.push({
    u0: p.r.u0, v0: p.r.v0, u1: p.r.u1, v1: p.r.v1,
    height, storeys, form, roof,
    side: front.side, streetIdx: front.st.idx,
    addr: addr.num, suffix: addr.suffix,
    interior: front.interior,
  });
}

// ---------------------------------------------------------------------------
// 5. quantise + encode
// ---------------------------------------------------------------------------
const CHUNK = 250;
const CU = Math.ceil((T.BOUNDS.uMax - T.BOUNDS.uMin) / CHUNK);
const CV = Math.ceil((T.BOUNDS.vMax - T.BOUNDS.vMin) / CHUNK);

class W {
  constructor() { this.b = []; }
  u8(x) { this.b.push(x & 255); }
  v(x) { x = Math.max(0, Math.round(x)); while (x >= 128) { this.b.push((x & 127) | 128); x >>>= 7; } this.b.push(x); }
  /** zigzag: small signed deltas stay one byte */
  z(x) { x = Math.round(x); this.v(x < 0 ? -2 * x - 1 : 2 * x); }
  s(str) { const e = new TextEncoder().encode(str); this.v(e.length); for (const c of e) this.b.push(c); }
  bytes() { return Uint8Array.from(this.b); }
}

const w = new W();
w.s('TOR3');
w.v(1);
w.v(-T.BOUNDS.uMin); w.v(-T.BOUNDS.vMin);
w.v(T.BOUNDS.uMax - T.BOUNDS.uMin); w.v(T.BOUNDS.vMax - T.BOUNDS.vMin);
w.v(CHUNK); w.v(CU); w.v(CV);

// --- streets ---
w.v(streets.length);
const CLS_ORDER = ['lane', 'local', 'collector', 'major', 'arterial', 'boulevard', 'expressway'];
for (const s of streets) {
  w.s(s.name);
  w.u8(s.axis === 'ew' ? 0 : 1);
  w.u8(CLS_ORDER.indexOf(s.cls));
  w.u8(s.split ? 1 : 0);
  w.v(s.pos - T.BOUNDS.uMin + 4000);
  w.v(s.min + 4000); w.v(s.max + 4000);
  w.v(s.width * 4);
}

// --- parks / water / rail / landmarks / places ---
w.v(parkRects.length);
for (const p of parkRects) {
  w.s(p.name); w.u8(p.kind === 'square' ? 1 : 0);
  w.v(p.u0 + 4000); w.v(p.v0 + 4000); w.v(p.u1 - p.u0); w.v(p.v1 - p.v0);
}
const WATER_KINDS = ['lake', 'river', 'island'];
w.v(T.WATER.length);
for (const wat of T.WATER) {
  w.s(wat.name); w.u8(Math.max(0, WATER_KINDS.indexOf(wat.kind)));
  w.v(wat.poly.length);
  for (const [u, v] of wat.poly) { w.v(u + 8000); w.v(v + 8000); }
}
w.v(T.RAIL_CORRIDOR.poly.length);
for (const [u, v] of T.RAIL_CORRIDOR.poly) { w.v(u + 4000); w.v(v + 4000); }

const LM_FORMS = ['tower', 'slab', 'podium', 'dome', 'hall', 'shed', 'spire', 'cntower', 'cityhall',
  'clocktower', 'church', 'heritage', 'flatiron', 'silo'];
const lmOut = landmarkRects.filter((l) => l.h > 0);
w.v(lmOut.length);
for (const l of lmOut) {
  w.s(l.name);
  w.v(l.u0 + 4000); w.v(l.v0 + 4000); w.v(l.u1 - l.u0); w.v(l.v1 - l.v0);
  w.v(l.h * 4);
  w.u8(Math.max(0, LM_FORMS.indexOf(l.form)));
}

const PLACE_KINDS = ['neighbourhood', 'square', 'transit', 'civic', 'school', 'park', 'landmark', 'water'];
w.v(T.PLACES.length);
for (const [name, u, v, kind] of T.PLACES) {
  w.s(name); w.v(u + 4000); w.v(v + 4000); w.u8(Math.max(0, PLACE_KINDS.indexOf(kind)));
}

// --- parcels, bucketed by chunk ---
const buckets = Array.from({ length: CU * CV }, () => []);
for (const r of records) {
  const cu = Math.min(CU - 1, Math.max(0, Math.floor(((r.u0 + r.u1) / 2 - T.BOUNDS.uMin) / CHUNK)));
  const cv = Math.min(CV - 1, Math.max(0, Math.floor(((r.v0 + r.v1) / 2 - T.BOUNDS.vMin) / CHUNK)));
  buckets[cv * CU + cu].push(r);
}

w.v(records.length);
for (let ci = 0; ci < buckets.length; ci++) {
  const list = buckets[ci];
  // sort for delta locality
  list.sort((a, b) => (a.v0 - b.v0) || (a.u0 - b.u0));
  w.v(list.length);
  const cu0 = T.BOUNDS.uMin + (ci % CU) * CHUNK;
  const cv0 = T.BOUNDS.vMin + Math.floor(ci / CU) * CHUNK;
  // Parcel geometry is quantised to 0.5 m and delta-coded against the previous
  // parcel in the chunk; street addresses are not stored at all, they are
  // recomputed at runtime from the parcel centre with the same formula.
  let pu = 0, pv = 0;
  for (const r of list) {
    const qu = Math.round((r.u0 - cu0) * 2), qv = Math.round((r.v0 - cv0) * 2);
    w.z(qu - pu); w.z(qv - pv);
    pu = qu; pv = qv;
    w.v(Math.round((r.u1 - r.u0) * 2));
    w.v(Math.round((r.v1 - r.v0) * 2));
    w.v(Math.round(r.height * 2));
    w.u8((FORMS.indexOf(r.form) & 15) | ((ROOFS.indexOf(r.roof) & 7) << 4) | (r.interior ? 128 : 0));
    w.u8(r.side & 3);
    w.u8(r.streetIdx);
  }
}

const raw = w.bytes();
const gz = gzipSync(Buffer.from(raw), { level: 9 });
const b64 = gz.toString('base64');

mkdirSync('src/generated', { recursive: true });
writeFileSync(
  'src/generated/citydata.js',
  `// GENERATED by build/bake.mjs — do not edit.\n` +
  `export const CITY_B64 = '${b64}';\n` +
  `export const CITY_RAW_BYTES = ${raw.length};\n` +
  `export const CITY_GZ_BYTES = ${gz.length};\n`,
);

// stats for the report
const stats = {
  blocks: blocks.length,
  buildableBlockPieces: parcelBlocks.length,
  parcels: records.length,
  parcelsSkipped: skipped,
  osmBuildings: OSM ? OSM.count : 0,
  osmMatchedParcels: osmMatched,
  heightSource: OSM ? 'openstreetmap + district zones' : 'district zones (derived)',
  streets: streets.length,
  namedStreets: new Set(streets.map((s) => s.name)).size,
  parks: parkRects.length,
  landmarks: lmOut.length,
  places: T.PLACES.length,
  rawBytes: raw.length,
  gzBytes: gz.length,
  b64Bytes: b64.length,
  bytesPerParcel: +(raw.length / records.length).toFixed(2),
  areaKm2: +(((T.BOUNDS.uMax - T.BOUNDS.uMin) * (T.BOUNDS.vMax - T.BOUNDS.vMin)) / 1e6).toFixed(2),
  tallest: Math.max(...records.map((r) => r.height)).toFixed(1),
  storeyHistogram: (() => {
    const h = {};
    for (const r of records) { const k = r.storeys <= 2 ? '1-2' : r.storeys <= 4 ? '3-4' : r.storeys <= 8 ? '5-8' : r.storeys <= 15 ? '9-15' : r.storeys <= 30 ? '16-30' : '31+'; h[k] = (h[k] || 0) + 1; }
    return h;
  })(),
};
writeFileSync('build/bake-stats.json', JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
