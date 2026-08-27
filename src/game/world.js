/**
 * Lots, the module grid, and every operation that changes what stands on one.
 *
 * The grid is derived from the lot rectangle, not from a lattice laid over the
 * city — so a build never straddles a road, and every lot's grid is square with
 * its own frontage. Slots come in the three kinds the brief names, and each is
 * addressed by a short string key that doubles as its identity in the save.
 *
 *   cell    c:storey:i:j        the square footprint of one module
 *   edge    e:storey:i:j:axis   the boundary between two cells, with an axis
 *   corner  k:storey:i:j        where four cells meet
 *
 * Every mutation is a command with an inverse, so undo/redo is deep and free.
 */

import { CONFIG, lotPrice, lotUpkeep } from '../core/config.js';
import { getPart } from '../kit/parts.js';
import { defaultColorsFor } from '../kit/colors.js';

export const U = CONFIG.grid.unit;

// ---------------------------------------------------------------------------
// LOT GRID
// ---------------------------------------------------------------------------
/**
 * The module grid for a parcel: as many whole cells as fit, centred, with the
 * remainder left as an even margin on all sides.
 */
export function lotGrid(parcel) {
  const w = parcel.u1 - parcel.u0, d = parcel.v1 - parcel.v0;
  const cols = Math.max(1, Math.floor(w / U));
  const rows = Math.max(1, Math.floor(d / U));
  const ou = parcel.u0 + (w - cols * U) / 2;
  const ov = parcel.v0 + (d - rows * U) / 2;
  return { cols, rows, ou, ov, w, d, parcel };
}

/** Slot key -> its parsed parts. */
export function parseSlot(key) {
  const p = key.split(':');
  const kind = p[0];
  return {
    kind,
    storey: +p[1],
    i: +p[2],
    j: +p[3],
    axis: kind === 'e' ? +p[4] : 0,
  };
}

export function slotKey(kind, storey, i, j, axis = 0) {
  return kind === 'e' ? `e:${storey}:${i}:${j}:${axis}` : `${kind}:${storey}:${i}:${j}`;
}

/** Is this slot inside the lot's grid? */
export function slotValid(g, s) {
  if (s.storey < CONFIG.grid.minStorey || s.storey >= CONFIG.grid.maxStoreys) return false;
  if (s.kind === 'c') return s.i >= 0 && s.j >= 0 && s.i < g.cols && s.j < g.rows;
  if (s.kind === 'k') return s.i >= 0 && s.j >= 0 && s.i <= g.cols && s.j <= g.rows;
  if (s.kind === 'e') {
    return s.axis === 0
      ? (s.i >= 0 && s.i < g.cols && s.j >= 0 && s.j <= g.rows)
      : (s.i >= 0 && s.i <= g.cols && s.j >= 0 && s.j < g.rows);
  }
  return false;
}

/** World placement for a slot: grid position, base height, and base rotation. */
export function slotTransform(g, s) {
  let u, v, rot = 0;
  if (s.kind === 'c') {
    u = g.ou + (s.i + 0.5) * U; v = g.ov + (s.j + 0.5) * U;
  } else if (s.kind === 'k') {
    u = g.ou + s.i * U; v = g.ov + s.j * U;
  } else if (s.axis === 0) {
    // runs along u; the wall faces +/- v
    u = g.ou + (s.i + 0.5) * U; v = g.ov + s.j * U;
  } else {
    // runs along v; rotate the part a quarter turn
    u = g.ou + s.i * U; v = g.ov + (s.j + 0.5) * U;
    rot = Math.PI / 2;
  }
  return { u, v, y: s.storey * CONFIG.grid.storeyHeight, rot };
}

/** Nearest valid slot of a given kind to a point, for magnetism. */
export function nearestSlot(g, kind, u, v, storey) {
  const fu = (u - g.ou) / U, fv = (v - g.ov) / U;
  if (kind === 'c') {
    const i = clampI(Math.floor(fu), 0, g.cols - 1);
    const j = clampI(Math.floor(fv), 0, g.rows - 1);
    return { kind: 'c', storey, i, j, axis: 0 };
  }
  if (kind === 'k') {
    const i = clampI(Math.round(fu), 0, g.cols);
    const j = clampI(Math.round(fv), 0, g.rows);
    return { kind: 'k', storey, i, j, axis: 0 };
  }
  // edge: pick whichever of the two families is genuinely closer
  const a0 = { kind: 'e', storey, axis: 0, i: clampI(Math.floor(fu), 0, g.cols - 1), j: clampI(Math.round(fv), 0, g.rows) };
  const a1 = { kind: 'e', storey, axis: 1, i: clampI(Math.round(fu), 0, g.cols), j: clampI(Math.floor(fv), 0, g.rows - 1) };
  const t0 = slotTransform(g, a0), t1 = slotTransform(g, a1);
  const d0 = (t0.u - u) ** 2 + (t0.v - v) ** 2;
  const d1 = (t1.u - u) ** 2 + (t1.v - v) ** 2;
  return d0 <= d1 ? a0 : a1;
}

function clampI(x, a, b) { return x < a ? a : x > b ? b : x; }

/** Every slot key a run-drag would cross between two points. */
export function slotsAlong(g, kind, from, to, storey) {
  const out = [];
  const seen = new Set();
  const dist = Math.hypot(to.u - from.u, to.v - from.v);
  const steps = Math.max(1, Math.ceil(dist / (U * 0.34)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = from.u + (to.u - from.u) * t;
    const v = from.v + (to.v - from.v) * t;
    const s = nearestSlot(g, kind, u, v, storey);
    if (!slotValid(g, s)) continue;
    const k = slotKey(s.kind, s.storey, s.i, s.j, s.axis);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ key: k, slot: s });
  }
  return out;
}

// ---------------------------------------------------------------------------
// LOT GEOMETRY / OVERLAP
// ---------------------------------------------------------------------------
/**
 * Oriented-rectangle overlap, by the separating axis theorem.
 *
 * The brief calls this out specifically, and rightly: a circle test around a
 * lot centre either rejects legal neighbouring lots or lets overlapping ones
 * through, depending on the radius you pick. There is no radius that works.
 */
export function obbOverlap(a, b) {
  const ra = rectCorners(a), rb = rectCorners(b);
  const axes = [...rectAxes(a), ...rectAxes(b)];
  for (const ax of axes) {
    const pa = project(ra, ax), pb = project(rb, ax);
    if (pa.max < pb.min - 1e-6 || pb.max < pa.min - 1e-6) return false;
  }
  return true;
}

function rectCorners(r) {
  const rot = r.rot || 0;
  const cu = (r.u0 + r.u1) / 2, cv = (r.v0 + r.v1) / 2;
  const hw = (r.u1 - r.u0) / 2, hh = (r.v1 - r.v0) / 2;
  const c = Math.cos(rot), s = Math.sin(rot);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [
    cu + x * c - y * s, cv + x * s + y * c,
  ]);
}
function rectAxes(r) {
  const rot = r.rot || 0;
  const c = Math.cos(rot), s = Math.sin(rot);
  return [[c, s], [-s, c]];
}
function project(pts, ax) {
  let min = Infinity, max = -Infinity;
  for (const p of pts) {
    const d = p[0] * ax[0] + p[1] * ax[1];
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

// ---------------------------------------------------------------------------
// THE WORLD FACADE
// ---------------------------------------------------------------------------
export class World extends EventTarget {
  constructor(city, state) {
    super();
    this.city = city;
    this.state = state;
    this.undoStack = [];
    this.redoStack = [];
    this.maxUndo = 400;
    this.demolishedSet = new Set(state.s.demolished);
  }

  // --- lot queries -------------------------------------------------------
  ownedLots() {
    return this.state.s.lots
      .map((l) => ({ ...l, parcel: this.city.parcelById(l.parcelId) }))
      .filter((l) => l.parcel);
  }
  ownsParcel(id) { return !!this.state.lot(id); }

  nextLotPrice() { return lotPrice(this.state.lotCount); }
  nextLotUpkeep() { return lotUpkeep(this.state.lotCount); }
  totalUpkeep() {
    return this.state.s.lots.reduce((s, _l, i) => s + lotUpkeep(i), 0);
  }

  /** Everything a site card needs about a point on the map. */
  siteInfo(u, v) {
    const city = this.city;
    const water = city.inWater(u, v);
    if (water) return { kind: 'water', name: water.name, u, v };
    const park = city.parkAt(u, v);
    if (park) return { kind: 'park', name: park.name, u, v, buildable: false };
    if (city.inRail(u, v)) return { kind: 'rail', name: 'Union Station rail corridor', u, v, buildable: false };
    const lm = city.landmarkAt(u, v);
    if (lm) {
      return {
        kind: 'landmark', name: lm.name, u, v, buildable: false,
        height: lm.height,
        place: city.neighbourhoodAt(u, v),
      };
    }
    const parcel = city.parcelAt(u, v);
    if (!parcel) {
      const st = city.streetAt(u, v);
      return { kind: 'street', name: st ? city.streetName(st, u) : 'Public land', u, v, buildable: false };
    }

    const addr = city.addressOf(parcel);
    const near = city.nearestPlace(u, v, ['landmark', 'square', 'park', 'transit', 'civic', 'school']);
    const owned = this.state.lot(parcel.id);
    const demolished = this.demolishedSet.has(parcel.id);
    return {
      kind: 'parcel',
      parcel,
      buildable: true,
      address: addr.full,
      street: addr.street,
      place: city.neighbourhoodAt(u, v),
      nearest: near ? `${near.place.name} · ${Math.round(near.dist)} m` : null,
      widthM: parcel.u1 - parcel.u0,
      depthM: parcel.v1 - parcel.v0,
      areaM2: (parcel.u1 - parcel.u0) * (parcel.v1 - parcel.v0),
      standing: demolished ? 'Cleared ground' : describeBuilding(parcel),
      height: demolished ? 0 : parcel.height,
      price: this.nextLotPrice(),
      upkeep: this.nextLotUpkeep(),
      owned,
      demolished,
      u, v,
    };
  }

  /**
   * Claim a lot. Demolition of whatever stood there is part of the same
   * transaction, so you can never pay and not get the cleared ground.
   */
  claim(parcel, opts = {}) {
    if (this.state.lot(parcel.id)) return { ok: false, reason: 'You already hold this lot.' };
    if (this.state.lotCount >= CONFIG.lots.maxHeld) {
      return { ok: false, reason: `You can hold at most ${CONFIG.lots.maxHeld} lots.` };
    }
    // A lot must never be claimable if it overlaps one already held.
    for (const l of this.ownedLots()) {
      if (obbOverlap(parcel, l.parcel)) return { ok: false, reason: 'That overlaps a lot you already hold.' };
    }
    const price = opts.free ? 0 : this.nextLotPrice();
    const entries = price ? [{ type: 'lot', amount: -price, note: `Claimed ${this.city.addressOf(parcel).full}` }] : [];
    if (opts.free) entries.push({ type: 'grant', amount: 0, note: `Starter site: ${this.city.addressOf(parcel).full}` });

    const res = this.state.commit({
      entries,
      apply: (st) => {
        st.s.lots.push({
          parcelId: parcel.id,
          claimedAt: Date.now(),
          name: opts.name || this.city.addressOf(parcel).full,
          condition: 0,
          upkeepPaidTo: Date.now(),
          parts: {},
          storeys: 1,
        });
        if (!st.s.demolished.includes(parcel.id)) st.s.demolished.push(parcel.id);
      },
    });
    if (res.ok) {
      this.demolishedSet.add(parcel.id);
      // Nothing may still believe there is a tower on cleared ground.
      this.city.refreshHeightField(parcel, this.demolishedSet);
      this.dispatchEvent(new CustomEvent('lots', { detail: { parcel, action: 'claim' } }));
    }
    return res;
  }

  /** Release a lot: part of its value back, and the original scenery returns. */
  release(parcelId) {
    const lot = this.state.lot(parcelId);
    if (!lot) return { ok: false, reason: 'You do not hold that lot.' };
    const parcel = this.city.parcelById(parcelId);
    const idx = this.state.s.lots.indexOf(lot);
    const paid = lotPrice(Math.max(0, idx));
    const refund = Math.round(paid * CONFIG.economy.releaseRefund);

    const res = this.state.commit({
      entries: [{ type: 'lot', amount: refund, note: `Released ${lot.name}` }],
      apply: (st) => {
        st.s.lots = st.s.lots.filter((l) => l.parcelId !== parcelId);
        st.s.demolished = st.s.demolished.filter((d) => d !== parcelId);
      },
    });
    if (res.ok) {
      this.demolishedSet.delete(parcelId);
      if (parcel) this.city.refreshHeightField(parcel, this.demolishedSet);
      this.dispatchEvent(new CustomEvent('lots', { detail: { parcel, action: 'release' } }));
    }
    return res;
  }

  // --- placement ---------------------------------------------------------
  partAt(lot, key) { return lot.parts[key] || null; }

  costOf(partId) {
    const p = getPart(partId);
    return p ? p.cost : 0;
  }

  /**
   * Place one part. Occupying a slot that already holds a part replaces it,
   * and the replaced part is captured in the undo record.
   */
  place(lot, key, partId, opts = {}) {
    const part = getPart(partId);
    if (!part) return { ok: false, reason: 'Unknown part.' };
    if (part.level > this.state.level) return { ok: false, reason: `Unlocks at level ${part.level}.` };
    if (part.earned && !this.state.s.milestones.includes(part.earned)) {
      return { ok: false, reason: 'That one has to be earned.' };
    }
    const slot = parseSlot(key);
    const g = lotGrid(this.city.parcelById(lot.parcelId));
    if (!slotValid(g, slot)) return { ok: false, reason: 'Outside the lot.' };
    if (part.slot !== slot.kind) return { ok: false, reason: 'Wrong kind of slot for that part.' };

    const previous = lot.parts[key] ? { ...lot.parts[key] } : null;
    const cost = opts.free ? 0 : part.cost;
    const reward = CONFIG.economy.placeReward + CONFIG.economy.placeRewardPerLevel * (this.state.level - 1);
    const isNewType = !this.state.s.stats.partTypes.includes(partId);

    const rec = {
      part: partId,
      rot: opts.rot ?? 0,
      free: opts.freeRot ?? 0,
      colors: opts.colors ? opts.colors.slice() : defaultColorsFor(part),
      t: Date.now(),
    };

    const res = this.state.commit({
      entries: [
        { type: 'build', amount: -cost, note: part.name },
        { type: 'reward', amount: Math.round(reward), note: `Placed ${part.name}` },
      ],
      xp: CONFIG.progression.xpPerPart + (isNewType ? CONFIG.progression.xpPerNewPartType : 0),
      apply: (st) => {
        lot.parts[key] = rec;
        st.s.stats.placed++;
        if (isNewType) st.s.stats.partTypes.push(partId);
        const maxStorey = Math.max(1, slot.storey + 1);
        if (maxStorey > (lot.storeys || 1)) {
          st.s.stats.storeysBuilt++;
          lot.storeys = maxStorey;
        }
      },
    });
    if (res.ok) {
      this.pushUndo({
        label: `Place ${part.name}`,
        undo: () => { if (previous) lot.parts[key] = previous; else delete lot.parts[key]; },
        redo: () => { lot.parts[key] = rec; },
        refund: cost - Math.round(reward),
      });
      this.dispatchEvent(new CustomEvent('build', { detail: { lot, key, action: 'place' } }));
    }
    return res;
  }

  /** Erase, with a full refund inside the grace window and partial after it. */
  erase(lot, key) {
    const rec = lot.parts[key];
    if (!rec) return { ok: false, reason: 'Nothing there.' };
    const part = getPart(rec.part);
    const age = Date.now() - (rec.t || 0);
    const rate = age <= CONFIG.economy.refundGraceMs ? CONFIG.economy.refundFull : CONFIG.economy.refundPartial;
    const refund = Math.round((part?.cost || 0) * rate);
    const snapshot = { ...rec };

    const res = this.state.commit({
      entries: [{ type: 'refund', amount: refund, note: `Removed ${part?.name || rec.part}` }],
      apply: (st) => { delete lot.parts[key]; st.s.stats.erased++; },
    });
    if (res.ok) {
      this.pushUndo({
        label: `Erase ${part?.name || rec.part}`,
        undo: () => { lot.parts[key] = snapshot; },
        redo: () => { delete lot.parts[key]; },
      });
      this.dispatchEvent(new CustomEvent('build', { detail: { lot, key, action: 'erase' } }));
    }
    return { ...res, refund };
  }

  /** Recolour in place. Instant and free, per the brief. */
  paint(lot, key, colors) {
    const rec = lot.parts[key];
    if (!rec) return { ok: false, reason: 'Nothing there.' };
    const before = rec.colors.slice();
    const after = colors.slice();
    if (before.join() === after.join()) return { ok: true, unchanged: true };
    rec.colors = after;
    this.state.s.stats.painted++;
    this.state.touch();
    this.pushUndo({
      label: 'Paint',
      undo: () => { rec.colors = before; },
      redo: () => { rec.colors = after; },
    });
    this.dispatchEvent(new CustomEvent('build', { detail: { lot, key, action: 'paint' } }));
    return { ok: true };
  }

  /** Rotate in 90 degree steps, or freely where the part allows it. */
  rotate(lot, key, delta, freeDelta = 0) {
    const rec = lot.parts[key];
    if (!rec) return { ok: false, reason: 'Nothing there.' };
    const bRot = rec.rot, bFree = rec.free || 0;
    rec.rot = ((rec.rot + delta) % 4 + 4) % 4;
    rec.free = (rec.free || 0) + freeDelta;
    this.state.touch();
    this.pushUndo({
      label: 'Rotate',
      undo: () => { rec.rot = bRot; rec.free = bFree; },
      redo: () => { rec.rot = ((bRot + delta) % 4 + 4) % 4; rec.free = bFree + freeDelta; },
    });
    this.dispatchEvent(new CustomEvent('build', { detail: { lot, key, action: 'rotate' } }));
    return { ok: true };
  }

  /** Pick a placed part up and re-snap it elsewhere. Free — nothing is bought. */
  move(lot, fromKey, toKey) {
    const rec = lot.parts[fromKey];
    if (!rec) return { ok: false, reason: 'Nothing to move.' };
    if (fromKey === toKey) return { ok: true };
    const part = getPart(rec.part);
    const to = parseSlot(toKey);
    if (part.slot !== to.kind) return { ok: false, reason: 'That slot takes a different kind of part.' };
    const g = lotGrid(this.city.parcelById(lot.parcelId));
    if (!slotValid(g, to)) return { ok: false, reason: 'Outside the lot.' };

    const displaced = lot.parts[toKey] ? { ...lot.parts[toKey] } : null;
    const snapshot = { ...rec };
    delete lot.parts[fromKey];
    lot.parts[toKey] = snapshot;
    this.state.touch();
    this.pushUndo({
      label: 'Move',
      undo: () => {
        delete lot.parts[toKey];
        lot.parts[fromKey] = snapshot;
        if (displaced) lot.parts[toKey] = displaced;
      },
      redo: () => {
        delete lot.parts[fromKey];
        lot.parts[toKey] = snapshot;
      },
    });
    this.dispatchEvent(new CustomEvent('build', { detail: { lot, key: toKey, action: 'move' } }));
    return { ok: true };
  }

  /** Wipe a lot back to bare ground. Refunds nothing; the confirm is in the UI. */
  clearLot(lot) {
    const snapshot = JSON.parse(JSON.stringify(lot.parts));
    const n = Object.keys(snapshot).length;
    if (!n) return { ok: false, reason: 'Already empty.' };
    lot.parts = {};
    lot.storeys = 1;
    this.state.touch();
    this.pushUndo({
      label: `Clear ${n} parts`,
      undo: () => { lot.parts = JSON.parse(JSON.stringify(snapshot)); },
      redo: () => { lot.parts = {}; },
    });
    this.dispatchEvent(new CustomEvent('build', { detail: { lot, action: 'clear' } }));
    return { ok: true, count: n };
  }

  // --- designs -----------------------------------------------------------
  saveDesign(lot, name) {
    const parts = Object.entries(lot.parts).map(([key, rec]) => ({ key, ...rec }));
    if (!parts.length) return { ok: false, reason: 'Nothing on this lot to save.' };
    this.state.s.designs.push({
      id: `d${Date.now().toString(36)}`,
      name: name || `Design ${this.state.s.designs.length + 1}`,
      parts,
      savedAt: Date.now(),
      count: parts.length,
    });
    this.state.touch();
    return { ok: true };
  }

  /** Stamp a saved design onto another lot, skipping slots it doesn't have. */
  stampDesign(lot, designId) {
    const d = this.state.s.designs.find((x) => x.id === designId);
    if (!d) return { ok: false, reason: 'Design not found.' };
    const g = lotGrid(this.city.parcelById(lot.parcelId));

    const usable = d.parts.filter((p) => slotValid(g, parseSlot(p.key)) && getPart(p.part));
    if (!usable.length) return { ok: false, reason: 'This lot is too small for that design.' };
    const cost = usable.reduce((s, p) => s + (getPart(p.part)?.cost || 0), 0);
    if (this.state.credits < cost) return { ok: false, reason: `That design costs ${cost} credits.` };

    const snapshot = JSON.parse(JSON.stringify(lot.parts));
    const res = this.state.commit({
      entries: [{ type: 'build', amount: -cost, note: `Stamped ${d.name}` }],
      xp: usable.length * CONFIG.progression.xpPerPart,
      apply: (st) => {
        for (const p of usable) {
          lot.parts[p.key] = { part: p.part, rot: p.rot || 0, free: p.free || 0, colors: (p.colors || []).slice(), t: Date.now() };
        }
        st.s.stats.placed += usable.length;
      },
    });
    if (res.ok) {
      this.pushUndo({
        label: `Stamp ${d.name}`,
        undo: () => { lot.parts = JSON.parse(JSON.stringify(snapshot)); },
        redo: () => {
          for (const p of usable) lot.parts[p.key] = { part: p.part, rot: p.rot || 0, free: p.free || 0, colors: (p.colors || []).slice(), t: Date.now() };
        },
      });
      this.dispatchEvent(new CustomEvent('build', { detail: { lot, action: 'stamp' } }));
    }
    return { ...res, placed: usable.length, skipped: d.parts.length - usable.length };
  }

  // --- undo / redo -------------------------------------------------------
  pushUndo(cmd) {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack.length = 0;
    this.dispatchEvent(new CustomEvent('history'));
  }

  /** Undo is always free and never costs credits. */
  undo() {
    const c = this.undoStack.pop();
    if (!c) return { ok: false, reason: 'Nothing to undo.' };
    c.undo();
    this.redoStack.push(c);
    this.state.touch();
    this.dispatchEvent(new CustomEvent('build', { detail: { action: 'undo' } }));
    this.dispatchEvent(new CustomEvent('history'));
    return { ok: true, label: c.label };
  }

  redo() {
    const c = this.redoStack.pop();
    if (!c) return { ok: false, reason: 'Nothing to redo.' };
    c.redo();
    this.undoStack.push(c);
    this.state.touch();
    this.dispatchEvent(new CustomEvent('build', { detail: { action: 'redo' } }));
    this.dispatchEvent(new CustomEvent('history'));
    return { ok: true, label: c.label };
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  // --- starter site ------------------------------------------------------
  /**
   * The first lot is granted, and it must be *open* — a site walled in by tall
   * neighbours makes every camera angle useless, and no camera logic fixes it.
   */
  findStarterSite() {
    const c = this.city;
    const cfg = CONFIG.lots;
    // Search outward from a pleasant, legible part of downtown rather than the
    // dead centre of the financial district.
    const anchors = [
      [-1150, 700],  // Queen West / Fashion District
      [-900, 1050],  // Grange
      [500, 400],    // St Lawrence
      [-1500, 1300], // Kensington
      [1050, 1750],  // Cabbagetown
      [700, 1000],   // Moss Park
    ];
    /*
     * Openness is scored, not merely filtered. Downtown has a tall neighbour
     * almost everywhere, so a hard cap either rejects the whole map or accepts
     * the first mediocre lot it meets. What actually matters is that the site
     * has street frontage and *open sky on at least one side*, which is what
     * makes the opening camera view show something.
     */
    const seen = new Set();
    let best = null, bestScore = -Infinity;
    for (const [au, av] of anchors) {
      for (let r = 20; r < cfg.starterSearchRadius; r += 16) {
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2 + r * 0.017;
          const u = au + Math.cos(ang) * r, v = av + Math.sin(ang) * r;
          const p = c.parcelAt(u, v);
          if (!p || seen.has(p.id)) continue;
          seen.add(p.id);
          if (this.state.lot(p.id)) continue;
          if (p.interior) continue;                       // must front a street
          const area = (p.u1 - p.u0) * (p.v1 - p.v0);
          if (area < cfg.starterMinArea || area > cfg.starterMaxArea) continue;

          const cu = (p.u0 + p.u1) / 2, cv = (p.v0 + p.v1) / 2;
          const around = c.maxHeightAround(cu, cv, 44);
          if (around > cfg.starterMaxNeighbourHeight * 2.5) continue;

          // how much open sky there is, sampled around the lot at 35 m
          let openSides = 0, tallest = 0;
          for (let k = 0; k < 8; k++) {
            const t = (k / 8) * Math.PI * 2;
            const h = c.heightAt(cu + Math.cos(t) * 35, cv + Math.sin(t) * 35);
            if (h < 6) openSides++;
            tallest = Math.max(tallest, h);
          }
          const park = c.nearestPlace(cu, cv, ['park', 'square']);
          const nearPark = park && park.dist < 220 ? 1 : 0;

          const score = openSides * 26
            - Math.max(0, tallest - cfg.starterMaxNeighbourHeight) * 3
            - around * 0.6
            + nearPark * 30
            + Math.min(area, 900) * 0.03
            - r * 0.008;
          if (score > bestScore) { bestScore = score; best = p; }
        }
      }
    }
    // Absolute fallback: any parcel with street frontage that nobody holds.
    if (!best) {
      outer:
      for (const list of c.chunks) {
        for (const p of list) {
          if (p.interior || this.state.lot(p.id)) continue;
          const area = (p.u1 - p.u0) * (p.v1 - p.v0);
          if (area < cfg.starterMinArea) continue;
          best = p; break outer;
        }
      }
    }
    return best;
  }

  grantStarterSite() {
    if (this.state.lotCount > 0) return { ok: true, existing: true };
    const p = this.findStarterSite();
    if (!p) return { ok: false, reason: 'Could not find an open starter site.' };
    const res = this.claim(p, { free: true, name: 'My first lot' });
    return { ...res, parcel: p };
  }
}

function describeBuilding(p) {
  const storeys = Math.max(1, Math.round(p.height / 3.4));
  const names = {
    row: 'a row house', semi: 'a semi-detached house', brick: 'a brick building',
    warehouse: 'a warehouse', midrise: 'a mid-rise block', tower: 'a tower',
    podiumTower: 'a tower on a podium', institution: 'an institutional building',
    shop: 'a shopfront', church: 'a church',
  };
  return `${names[p.form] || 'a building'}, ${storeys} ${storeys === 1 ? 'storey' : 'storeys'}`;
}
