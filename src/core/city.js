/**
 * The baked city: decode once, then answer questions about it cheaply.
 *
 * Nothing in here is player state. Demolitions and claims live in the save and
 * are applied as an overlay, so the underlying city is always reconstructible.
 */

import { Reader, b64ToBytes, gunzipFast } from './decode.js';
import { CITY_B64, CITY_RAW_BYTES, CITY_GZ_BYTES } from '../generated/citydata.js';

export const CLS_ORDER = ['lane', 'local', 'collector', 'major', 'arterial', 'boulevard', 'expressway'];
export const FORMS = ['row', 'semi', 'brick', 'warehouse', 'midrise', 'tower', 'podiumTower', 'institution', 'shop', 'church'];
export const ROOFS = ['flat', 'gable', 'hip', 'mansard', 'parapet', 'stepped'];
export const LM_FORMS = ['tower', 'slab', 'podium', 'dome', 'hall', 'shed', 'spire', 'cntower', 'cityhall',
  'clocktower', 'church', 'heritage', 'flatiron', 'silo'];
export const WATER_KINDS = ['lake', 'river', 'island'];
export const PLACE_KINDS = ['neighbourhood', 'square', 'transit', 'civic', 'school', 'park', 'landmark', 'water'];

export const SIZE_BYTES = { raw: CITY_RAW_BYTES, gz: CITY_GZ_BYTES, b64: CITY_B64.length };

export class City {
  constructor() {
    this.streets = [];
    this.parks = [];
    this.water = [];
    this.rail = [];
    this.landmarks = [];
    this.places = [];
    this.chunks = [];
    this.parcelCount = 0;
  }

  async load(onProgress) {
    onProgress?.(0.05, 'Unpacking Toronto');
    const gz = b64ToBytes(CITY_B64);
    const bytes = await gunzipFast(gz);
    onProgress?.(0.35, 'Reading the street network');

    const r = new Reader(bytes);
    if (r.s() !== 'TOR3') throw new Error('bad city payload');
    r.v(); // version
    this.uMin = -r.v(); this.vMin = -r.v();
    this.uSpan = r.v(); this.vSpan = r.v();
    this.uMax = this.uMin + this.uSpan; this.vMax = this.vMin + this.vSpan;
    this.chunkSize = r.v(); this.cu = r.v(); this.cv = r.v();

    // --- streets ---
    const ns = r.v();
    for (let i = 0; i < ns; i++) {
      const name = r.s();
      const axis = r.u8() === 0 ? 'ew' : 'ns';
      const cls = CLS_ORDER[r.u8()];
      const split = r.u8() === 1;
      const pos = r.v() + this.uMin - 4000;
      const min = r.v() - 4000, max = r.v() - 4000;
      const width = r.v() / 4;
      this.streets.push({ idx: i, name, axis, cls, split, pos, min, max, width });
    }
    onProgress?.(0.45, 'Placing parks and water');

    // --- parks ---
    const np = r.v();
    for (let i = 0; i < np; i++) {
      const name = r.s(); const square = r.u8() === 1;
      const u0 = r.v() - 4000, v0 = r.v() - 4000;
      const w = r.v(), h = r.v();
      this.parks.push({ name, kind: square ? 'square' : 'park', u0, v0, u1: u0 + w, v1: v0 + h });
    }

    // --- water ---
    const nw = r.v();
    for (let i = 0; i < nw; i++) {
      const name = r.s(); const kind = WATER_KINDS[r.u8()] || 'lake';
      const n = r.v(); const poly = [];
      for (let j = 0; j < n; j++) poly.push([r.v() - 8000, r.v() - 8000]);
      this.water.push({ name, kind, poly });
    }

    // --- rail corridor ---
    const nr = r.v();
    for (let j = 0; j < nr; j++) this.rail.push([r.v() - 4000, r.v() - 4000]);

    // --- landmarks ---
    const nl = r.v();
    for (let i = 0; i < nl; i++) {
      const name = r.s();
      const u0 = r.v() - 4000, v0 = r.v() - 4000;
      const w = r.v(), h = r.v();
      const height = r.v() / 4;
      const form = LM_FORMS[r.u8()];
      this.landmarks.push({ id: `lm${i}`, name, u0, v0, u1: u0 + w, v1: v0 + h, height, form });
    }

    // --- places ---
    const npl = r.v();
    for (let i = 0; i < npl; i++) {
      this.places.push({ name: r.s(), u: r.v() - 4000, v: r.v() - 4000, kind: PLACE_KINDS[r.u8()] });
    }
    onProgress?.(0.6, 'Laying out lots');

    // --- parcels, per chunk ---
    this.parcelCount = r.v();
    for (let ci = 0; ci < this.cu * this.cv; ci++) {
      const count = r.v();
      const cu0 = this.uMin + (ci % this.cu) * this.chunkSize;
      const cv0 = this.vMin + Math.floor(ci / this.cu) * this.chunkSize;
      const list = new Array(count);
      let pu = 0, pv = 0;
      for (let k = 0; k < count; k++) {
        pu += r.z(); pv += r.z();
        const u0 = cu0 + pu / 2, v0 = cv0 + pv / 2;
        const w = r.v() / 2, h = r.v() / 2;
        const height = r.v() / 2;
        const fb = r.u8();
        const side = r.u8();
        const streetIdx = r.u8();
        list[k] = {
          id: ci * 4096 + k,
          u0, v0, u1: u0 + w, v1: v0 + h,
          height,
          form: FORMS[fb & 15],
          roof: ROOFS[(fb >> 4) & 7],
          interior: !!(fb & 128),
          side, streetIdx, chunk: ci,
        };
      }
      this.chunks.push(list);
      if ((ci & 63) === 0) onProgress?.(0.6 + 0.3 * (ci / (this.cu * this.cv)), 'Laying out lots');
    }

    onProgress?.(0.9, 'Indexing lots');
    this.buildParcelIndex();
    this.buildHeightField();
    onProgress?.(0.95, 'Ready');
    return this;
  }

  // -------------------------------------------------------------------------
  // chunk helpers
  // -------------------------------------------------------------------------
  chunkIndexAt(u, v) {
    const cx = Math.floor((u - this.uMin) / this.chunkSize);
    const cz = Math.floor((v - this.vMin) / this.chunkSize);
    if (cx < 0 || cz < 0 || cx >= this.cu || cz >= this.cv) return -1;
    return cz * this.cu + cx;
  }
  chunkOrigin(ci) {
    return {
      u: this.uMin + (ci % this.cu) * this.chunkSize,
      v: this.vMin + Math.floor(ci / this.cu) * this.chunkSize,
    };
  }
  parcelById(id) {
    const ci = Math.floor(id / 4096);
    return this.chunks[ci]?.[id % 4096] || null;
  }

  /**
   * Uniform grid over every parcel so "what is under this point" is O(1).
   *
   * Worth the few megabytes: the tap-to-select path and the street-furniture
   * placement both hammer this, and a linear scan of the chunk neighbourhood
   * made chunk builds roughly ten times slower than the geometry itself.
   */
  buildParcelIndex() {
    this.pgCell = 4;
    this.pgW = Math.ceil(this.uSpan / this.pgCell) + 1;
    this.pgH = Math.ceil(this.vSpan / this.pgCell) + 1;
    this.pg = new Int32Array(this.pgW * this.pgH);
    for (const list of this.chunks) {
      for (const p of list) {
        const x0 = Math.max(0, Math.floor((p.u0 - this.uMin) / this.pgCell));
        const x1 = Math.min(this.pgW - 1, Math.floor((p.u1 - this.uMin) / this.pgCell));
        const z0 = Math.max(0, Math.floor((p.v0 - this.vMin) / this.pgCell));
        const z1 = Math.min(this.pgH - 1, Math.floor((p.v1 - this.vMin) / this.pgCell));
        for (let z = z0; z <= z1; z++) {
          const row = z * this.pgW;
          for (let x = x0; x <= x1; x++) this.pg[row + x] = p.id + 1;
        }
      }
    }
  }

  /** The parcel under a grid point, or null if it's street / park / water. */
  parcelAt(u, v) {
    if (!this.pg) return null;
    const x = Math.floor((u - this.uMin) / this.pgCell);
    const z = Math.floor((v - this.vMin) / this.pgCell);
    if (x < 0 || z < 0 || x >= this.pgW || z >= this.pgH) return null;
    // the cell is a candidate; the rect test is what decides
    for (let dz = 0; dz <= 1; dz++) {
      for (let dx = 0; dx <= 1; dx++) {
        const nx = x + (dx ? (dx === 1 ? 1 : -1) : 0), nz = z + (dz ? 1 : 0);
        if (nx < 0 || nz < 0 || nx >= this.pgW || nz >= this.pgH) continue;
        const id = this.pg[nz * this.pgW + nx];
        if (!id) continue;
        const p = this.parcelById(id - 1);
        if (p && u >= p.u0 && u <= p.u1 && v >= p.v0 && v <= p.v1) return p;
      }
    }
    const id0 = this.pg[z * this.pgW + x];
    if (id0) {
      const p = this.parcelById(id0 - 1);
      if (p && u >= p.u0 && u <= p.u1 && v >= p.v0 && v <= p.v1) return p;
    }
    return null;
  }

  landmarkAt(u, v) {
    for (const l of this.landmarks) {
      if (u >= l.u0 && u <= l.u1 && v >= l.v0 && v <= l.v1) return l;
    }
    return null;
  }

  parkAt(u, v) {
    for (const p of this.parks) {
      if (u >= p.u0 && u <= p.u1 && v >= p.v0 && v <= p.v1) return p;
    }
    return null;
  }

  inWater(u, v) {
    for (const w of this.water) if (pointInPoly(u, v, w.poly)) return w;
    return null;
  }
  inRail(u, v) { return pointInPoly(u, v, this.rail) ? { name: 'Rail corridor' } : null; }

  /** Is this a street surface? Returns the street if so. */
  streetAt(u, v) {
    let best = null, bestRank = -1;
    for (const s of this.streets) {
      if (s.axis === 'ew') {
        if (v >= s.pos - s.width / 2 && v <= s.pos + s.width / 2 && u >= s.min && u <= s.max) {
          const rank = CLS_ORDER.indexOf(s.cls);
          if (rank > bestRank) { best = s; bestRank = rank; }
        }
      } else if (u >= s.pos - s.width / 2 && u <= s.pos + s.width / 2 && v >= s.min && v <= s.max) {
        const rank = CLS_ORDER.indexOf(s.cls);
        if (rank > bestRank) { best = s; bestRank = rank; }
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // coarse height field — "how tall is the world here", cheaply
  // -------------------------------------------------------------------------
  /**
   * @param demolished  parcels the player has cleared. Passing them matters on
   *   reload: without it the field is rebuilt believing there is still a tower
   *   on every lot the player already demolished, and the camera and placement
   *   logic go on avoiding buildings that are not there.
   */
  buildHeightField(demolished) {
    /*
     * 6 m cells, not 25. The field is what the camera uses to avoid ending up
     * inside a building, and at 25 m a single tower smears its height across
     * the road in front of it — so the camera "collides" with the open street
     * and gets shoved to roof height every time you try to look at your own
     * lot from the kerb. At 6 m a street reads as a street.
     */
    this.hfCell = 6;
    this.hfW = Math.ceil(this.uSpan / this.hfCell) + 1;
    this.hfH = Math.ceil(this.vSpan / this.hfCell) + 1;
    this.hf = new Float32Array(this.hfW * this.hfH);
    for (const list of this.chunks) {
      for (const p of list) {
        if (demolished && demolished.has(p.id)) continue;
        this.stampHeight(p, p.height);
      }
    }
    for (const l of this.landmarks) {
      if (demolished && demolished.has(l.id)) continue;
      this.stampHeight(l, l.height);
    }
  }

  /**
   * Mark the field nodes that actually fall inside a footprint.
   *
   * This used to round outward — floor on the near edge, ceil on the far one —
   * which inflated every building by up to a full cell in each direction. The
   * cost was not subtle: a tower put its height on the street in front of it
   * and on both lots beside it, so the camera collided with open ground, and a
   * lot that had genuinely been cleared still read as thirty metres of
   * building because its neighbours had spilled onto it.
   */
  stampHeight(rect, h) {
    let x0 = Math.max(0, Math.ceil((rect.u0 - this.uMin) / this.hfCell));
    let x1 = Math.min(this.hfW - 1, Math.floor((rect.u1 - this.uMin) / this.hfCell));
    let z0 = Math.max(0, Math.ceil((rect.v0 - this.vMin) / this.hfCell));
    let z1 = Math.min(this.hfH - 1, Math.floor((rect.v1 - this.vMin) / this.hfCell));
    // A footprint narrower than one cell still has to exist in the field, so
    // it keeps the single node nearest its middle.
    const node = (c, span) => Math.min(span - 1, Math.max(0, Math.round(c)));
    if (x1 < x0) x0 = x1 = node(((rect.u0 + rect.u1) / 2 - this.uMin) / this.hfCell, this.hfW);
    if (z1 < z0) z0 = z1 = node(((rect.v0 + rect.v1) / 2 - this.vMin) / this.hfCell, this.hfH);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const i = z * this.hfW + x;
        if (h > this.hf[i]) this.hf[i] = h;
      }
    }
  }

  /**
   * Recompute the height field over one rectangle from scratch. Called after a
   * demolition so nothing still believes there's a tower on a cleared lot.
   */
  refreshHeightField(rect, demolished) {
    const pad = this.hfCell * 2;
    const x0 = Math.max(0, Math.floor((rect.u0 - pad - this.uMin) / this.hfCell));
    const x1 = Math.min(this.hfW - 1, Math.ceil((rect.u1 + pad - this.uMin) / this.hfCell));
    const z0 = Math.max(0, Math.floor((rect.v0 - pad - this.vMin) / this.hfCell));
    const z1 = Math.min(this.hfH - 1, Math.ceil((rect.v1 + pad - this.vMin) / this.hfCell));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.hf[z * this.hfW + x] = 0;

    const u0 = this.uMin + x0 * this.hfCell, u1 = this.uMin + x1 * this.hfCell;
    const v0 = this.vMin + z0 * this.hfCell, v1 = this.vMin + z1 * this.hfCell;
    const region = { u0, v0, u1, v1 };
    const hit = (a, b) => a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1;

    const c0 = Math.max(0, Math.floor((u0 - this.uMin) / this.chunkSize) - 1);
    const c1 = Math.min(this.cu - 1, Math.floor((u1 - this.uMin) / this.chunkSize) + 1);
    const d0 = Math.max(0, Math.floor((v0 - this.vMin) / this.chunkSize) - 1);
    const d1 = Math.min(this.cv - 1, Math.floor((v1 - this.vMin) / this.chunkSize) + 1);
    for (let d = d0; d <= d1; d++) {
      for (let c = c0; c <= c1; c++) {
        for (const p of this.chunks[d * this.cu + c]) {
          if (demolished.has(p.id)) continue;
          if (hit(p, region)) this.stampHeight(p, p.height);
        }
      }
    }
    for (const l of this.landmarks) if (hit(l, region)) this.stampHeight(l, l.height);
  }

  /**
   * Anything still standing that overlaps this rectangle, other than the
   * rectangle's own parcel.
   *
   * The baked subdivision is not a partition: parcels can and do overlap, so a
   * lot can have another parcel's building physically on top of it. Clearing
   * the lot removes its own building and leaves the intruder, which is how
   * four neighbours ended up inside a thirty-metre block on ground the game
   * believed was empty. Anything choosing a site has to ask this first.
   */
  buildingsOver(rect, exceptId = null, cleared = null) {
    const hit = (a) => a.u0 < rect.u1 && rect.u0 < a.u1 && a.v0 < rect.v1 && rect.v0 < a.v1;
    const out = [];
    const c0 = Math.max(0, Math.floor((rect.u0 - this.uMin) / this.chunkSize) - 1);
    const c1 = Math.min(this.cu - 1, Math.floor((rect.u1 - this.uMin) / this.chunkSize) + 1);
    const d0 = Math.max(0, Math.floor((rect.v0 - this.vMin) / this.chunkSize) - 1);
    const d1 = Math.min(this.cv - 1, Math.floor((rect.v1 - this.vMin) / this.chunkSize) + 1);
    for (let d = d0; d <= d1; d++) {
      for (let c = c0; c <= c1; c++) {
        for (const p of this.chunks[d * this.cu + c] || []) {
          if (p.id === exceptId || p.height <= 1) continue;
          if (cleared && cleared.has(p.id)) continue;
          if (hit(p)) out.push(p);
        }
      }
    }
    for (const l of this.landmarks) {
      if (l.id === exceptId || l.height <= 1) continue;
      if (cleared && cleared.has(l.id)) continue;
      if (hit(l)) out.push(l);
    }
    return out;
  }

  heightAt(u, v) {
    const x = Math.round((u - this.uMin) / this.hfCell);
    const z = Math.round((v - this.vMin) / this.hfCell);
    if (x < 0 || z < 0 || x >= this.hfW || z >= this.hfH) return 0;
    return this.hf[z * this.hfW + x];
  }

  /** Tallest thing in a radius — used to keep the camera out of towers. */
  maxHeightAround(u, v, radius) {
    const r = Math.ceil(radius / this.hfCell);
    const cx = Math.round((u - this.uMin) / this.hfCell);
    const cz = Math.round((v - this.vMin) / this.hfCell);
    let m = 0;
    for (let z = cz - r; z <= cz + r; z++) {
      if (z < 0 || z >= this.hfH) continue;
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || x >= this.hfW) continue;
        const h = this.hf[z * this.hfW + x];
        if (h > m) m = h;
      }
    }
    return m;
  }

  // -------------------------------------------------------------------------
  // naming
  // -------------------------------------------------------------------------
  /** Street name with Toronto's W/E suffix applied. */
  streetName(street, u) {
    if (!street) return 'Unnamed lane';
    if (street.axis === 'ew' && street.split) return `${street.name} ${u < 0 ? 'W' : 'E'}`;
    return street.name;
  }

  /** Mirrors addressFor() in build/bake.mjs so addresses need not be baked. */
  addressOf(p) {
    const st = this.streets[p.streetIdx];
    if (!st) return { num: 0, street: 'Unnamed lane', full: 'Unaddressed lot' };
    const cu = (p.u0 + p.u1) / 2, cv = (p.v0 + p.v1) / 2;
    let n;
    if (st.axis === 'ew') {
      n = Math.max(1, Math.round(Math.abs(cu) / 1.55));
      n = p.side === 0 ? n | 1 : (n + 1) & ~1;
    } else {
      n = Math.max(1, Math.round((cv + 340) / 1.35));
      n = p.side === 2 ? n | 1 : (n + 1) & ~1;
    }
    const street = this.streetName(st, cu);
    return { num: n, street, full: `${n} ${street}` };
  }

  nearestPlace(u, v, kinds) {
    let best = null, bd = Infinity;
    for (const p of this.places) {
      if (kinds && !kinds.includes(p.kind)) continue;
      const d = (p.u - u) ** 2 + (p.v - v) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { place: best, dist: Math.sqrt(bd) } : null;
  }

  neighbourhoodAt(u, v) {
    const n = this.nearestPlace(u, v, ['neighbourhood']);
    return n ? n.place.name : 'Downtown Toronto';
  }

  searchPlaces(q, limit = 40) {
    const s = q.trim().toLowerCase();
    const out = [];
    if (!s) return out;
    for (const p of this.places) {
      const i = p.name.toLowerCase().indexOf(s);
      if (i >= 0) out.push({ kind: 'place', name: p.name, sub: p.kind, u: p.u, v: p.v, score: i });
    }
    for (const st of this.streets) {
      const i = st.name.toLowerCase().indexOf(s);
      if (i >= 0) {
        const u = st.axis === 'ew' ? (Math.max(st.min, this.uMin) + Math.min(st.max, this.uMax)) / 2 : st.pos;
        const v = st.axis === 'ew' ? st.pos : (Math.max(st.min, this.vMin) + Math.min(st.max, this.vMax)) / 2;
        out.push({ kind: 'street', name: st.name, sub: st.cls, u, v, score: i });
      }
    }
    for (const l of this.landmarks) {
      const i = l.name.toLowerCase().indexOf(s);
      if (i >= 0) out.push({ kind: 'landmark', name: l.name, sub: `${Math.round(l.height)} m`, u: (l.u0 + l.u1) / 2, v: (l.v0 + l.v1) / 2, score: i });
    }
    out.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
    return out.slice(0, limit);
  }
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
