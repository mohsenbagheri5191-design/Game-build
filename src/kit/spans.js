/**
 * Span parts, and the registry that generates them.
 *
 * A span is a part that covers a whole w x d rectangle of modules instead of
 * one, and is generated as a single mesh at exactly that size. That matters
 * for anything wide and continuous: tile a roof, an awning or a deck across a
 * building and you get a seam at every module and a surface that reads as
 * corrugated. Generated whole, there is nothing to line up, so there is
 * nothing to leave a gap.
 *
 * Each span part registers a builder here. The player sizes it by dragging any
 * side — see World.resizeSpan() — and geometry is cached per (part, size,
 * style), so a street of identical awnings is still one instanced draw.
 */

import * as THREE from 'three';
import { MeshBuilder } from './mesh.js';
import { CONFIG } from '../core/config.js';
import { roofSpan, ROOF_STYLES, roofHeight } from './roof.js';

const U = CONFIG.grid.unit;
const P = (x, y, z) => new THREE.Vector3(x, y, z);
const cache = new Map();
const builders = new Map();

/**
 * Register a span builder.
 * @param id      part id
 * @param styles  style ids, in the order the pills appear
 * @param names   style id -> label
 * @param fn      (mb, cols, rows, style) -> void
 */
export function defSpan(id, styles, names, fn) {
  builders.set(id, { styles, names, fn });
}

export function spanStyles(id) { return builders.get(id)?.styles || []; }
export function spanStyleNames(id) { return builders.get(id)?.names || {}; }
export function isSpanPart(id) { return builders.has(id); }

/** Cached geometry for one span part at one size and style. */
export function spanGeometry(id, cols, rows, style) {
  const b = builders.get(id);
  if (!b) return null;
  const st = b.styles.includes(style) ? style : b.styles[0];
  const c = Math.max(1, cols | 0), r = Math.max(1, rows | 0);
  const key = `${id}:${c}x${r}:${st}`;
  let g = cache.get(key);
  if (g) return g;
  const mb = new MeshBuilder();
  b.fn(mb, c, r, st);
  g = mb.build(key);
  cache.set(key, g);
  return g;
}

// ---------------------------------------------------------------------------
// ROOF — lives in roof.js, registered here
// ---------------------------------------------------------------------------
defSpan('roof', ROOF_STYLES, {
  gable: 'Gable', hip: 'Hipped', shed: 'Single slope', flat: 'Flat',
}, roofSpan);

export { roofHeight };

// ---------------------------------------------------------------------------
// AWNING — a shopfront canopy
// ---------------------------------------------------------------------------
/**
 * The canopy hangs off the front of the building and only ever needs to be one
 * module deep, so `rows` sets the projection and `cols` the width it runs.
 * The valance — the hanging strip along the front edge — is what makes an
 * awning look like an awning rather than a ramp, so it gets the detail:
 * scalloped, straight or none, with a bead along its bottom edge either way.
 */
const AW_STYLES = ['scallop', 'straight', 'barrel', 'flat'];

defSpan('awning', AW_STYLES, {
  scallop: 'Scalloped', straight: 'Straight', barrel: 'Curved', flat: 'Box',
}, (mb, cols, rows, style) => {
  const W = cols * U;
  const D = Math.min(rows, 2) * U * 0.78;   // projection, capped: it is a canopy
  const rise = 0.62;                        // how much higher the wall end sits
  const hw = W / 2;
  const seg = Math.max(6, Math.min(28, Math.round(W * 1.6)));

  // --- the sloping canvas ------------------------------------------------
  // Profile from the wall (z = -D/2, high) to the front edge (z = +D/2, low).
  const prof = (t) => {
    if (style === 'flat') return { y: rise, z: -D / 2 + t * D };
    if (style === 'barrel') {
      // quarter-circle sag, which is what a real barrel awning does
      const a = (t * Math.PI) / 2;
      return { y: rise * Math.cos(a * 0.92), z: -D / 2 + Math.sin(a) * D };
    }
    return { y: rise * (1 - t), z: -D / 2 + t * D };
  };
  const steps = style === 'barrel' ? 6 : 2;

  // The canvas is a thin closed ribbon, not a single sheet: a sheet is only
  // ever right from one side, and you walk underneath an awning. Every quad
  // below is wound so its normal points out of the solid.
  const TH = 0.05;

  for (let s = 0; s < steps; s++) {
    const a = prof(s / steps), b = prof((s + 1) / steps);
    const shA = 1.06 - (s / steps) * 0.16, shB = 1.06 - ((s + 1) / steps) * 0.16;
    for (let i = 0; i < seg; i++) {
      const x0 = -hw + (W * i) / seg, x1 = -hw + (W * (i + 1)) / seg;
      // stripes: alternate panels take the trim colour, the classic awning look
      mb.zoneOf(i % 2 ? 1 : 0);
      // upper face — normal +y
      mb.quad(
        P(x0, a.y, a.z), P(x0, b.y, b.z),
        P(x1, b.y, b.z), P(x1, a.y, a.z),
        [shA, shB, shB, shA]);
      // under face — normal -y
      mb.quad(
        P(x0, a.y - TH, a.z), P(x1, a.y - TH, a.z),
        P(x1, b.y - TH, b.z), P(x0, b.y - TH, b.z),
        [0.6, 0.6, 0.58, 0.58]);
    }
  }

  // --- side cheeks, closing the long edges --------------------------------
  mb.zoneOf(0);
  for (let s = 0; s < steps; s++) {
    const a = prof(s / steps), b = prof((s + 1) / steps);
    // right cheek, normal +x
    mb.quad(
      P(hw, a.y, a.z), P(hw, b.y, b.z),
      P(hw, b.y - TH, b.z), P(hw, a.y - TH, a.z),
      [0.94, 0.94, 0.86, 0.86]);
    // left cheek, normal -x
    mb.quad(
      P(-hw, a.y, a.z), P(-hw, a.y - TH, a.z),
      P(-hw, b.y - TH, b.z), P(-hw, b.y, b.z),
      [0.82, 0.76, 0.76, 0.82]);
  }

  // --- caps at the wall end and the front edge ----------------------------
  const back = prof(0), front = prof(1);
  // back cap, normal -z
  mb.quad(
    P(-hw, back.y, back.z), P(-hw, back.y - TH, back.z),
    P(hw, back.y - TH, back.z), P(hw, back.y, back.z),
    [0.7, 0.64, 0.64, 0.7]);
  // front cap, normal +z
  mb.quad(
    P(-hw, front.y, front.z), P(hw, front.y, front.z),
    P(hw, front.y - TH, front.z), P(-hw, front.y - TH, front.z),
    [1.0, 1.0, 0.88, 0.88]);

  // --- the valance --------------------------------------------------------
  // A separate hanging plate, in front of the canvas so it shares no edge
  // with it. Front faces +z, back faces -z, and the profiled bottom edge is
  // closed by a band between them.
  const vz = front.z + 0.012, vt = 0.045;
  const valance = (x0, x1, y0, y1) => {
    // front
    mb.quad(P(x0, front.y, vz), P(x1, front.y, vz), P(x1, y1, vz), P(x0, y0, vz),
      [1.02, 1.02, 0.9, 0.9]);
    // back
    mb.quad(P(x0, front.y, vz - vt), P(x0, y0, vz - vt), P(x1, y1, vz - vt), P(x1, front.y, vz - vt),
      [0.72, 0.66, 0.66, 0.72]);
    // the profiled bottom edge, joining the two
    mb.quad(P(x0, y0, vz), P(x1, y1, vz), P(x1, y1, vz - vt), P(x0, y0, vz - vt),
      [0.8, 0.8, 0.72, 0.72]);
  };

  mb.zoneOf(1);
  if (style === 'scallop') {
    // a row of half-round lobes, one per ~0.55 m, each a closed little plate
    const n = Math.max(3, Math.round(W / 0.55));
    const sw = W / n, drop = 0.20, arc = 5, gap = 0.012;
    for (let i = 0; i < n; i++) {
      const a0 = -hw + sw * i + gap, a1 = -hw + sw * (i + 1) - gap;
      const lw = a1 - a0;
      for (let k = 0; k < arc; k++) {
        const t0 = k / arc, t1 = (k + 1) / arc;
        valance(
          a0 + lw * t0, a0 + lw * t1,
          front.y - Math.sin(t0 * Math.PI) * drop,
          front.y - Math.sin(t1 * Math.PI) * drop);
      }
    }
    // top edge band, closing the lobes against the canvas line
    mb.quad(P(-hw, front.y, vz - vt), P(hw, front.y, vz - vt),
      P(hw, front.y, vz), P(-hw, front.y, vz), [1.06, 1.06, 1.06, 1.06]);
  } else if (style !== 'flat') {
    const drop = 0.19;
    valance(-hw, hw, front.y - drop, front.y - drop);
    // ends and top, closing the plate
    mb.quad(P(hw, front.y, vz), P(hw, front.y - drop, vz),
      P(hw, front.y - drop, vz - vt), P(hw, front.y, vz - vt), [0.92, 0.86, 0.86, 0.92]);
    mb.quad(P(-hw, front.y, vz), P(-hw, front.y, vz - vt),
      P(-hw, front.y - drop, vz - vt), P(-hw, front.y - drop, vz), [0.82, 0.82, 0.76, 0.76]);
    mb.quad(P(-hw, front.y, vz - vt), P(hw, front.y, vz - vt),
      P(hw, front.y, vz), P(-hw, front.y, vz), [1.06, 1.06, 1.06, 1.06]);
  }

  // --- front bar and support arms ----------------------------------------
  mb.zoneOf(2);
  mb.push();
  mb.translate(0, front.y + 0.015, front.z);
  mb.rotateZ(Math.PI / 2);
  mb.cylinder(0.045, W, 7, { centreY: true });
  mb.pop();
  const arms = Math.max(2, Math.round(cols) + 1);
  for (let i = 0; i < arms; i++) {
    const x = arms === 1 ? 0 : -hw + (W * i) / (arms - 1);
    const xi = Math.max(-hw + 0.12, Math.min(hw - 0.12, x));
    mb.push();
    mb.translate(xi, (rise + front.y) / 2 - 0.06, 0);
    mb.rotateX(Math.atan2(rise - front.y, D));
    mb.chamfer(0.07, 0.07, Math.hypot(D, rise - front.y), 0.02, { centreY: true });
    mb.pop();
    // the little diagonal brace back to the wall
    mb.push();
    mb.translate(xi, rise * 0.42, -D / 2 + 0.10);
    mb.rotateX(-0.72);
    mb.chamfer(0.05, 0.05, rise * 0.85, 0.015, { centreY: true });
    mb.pop();
  }
});

// ---------------------------------------------------------------------------
// TERRACE — a raised deck you can stand a whole scene on
// ---------------------------------------------------------------------------
/**
 * A deck is the other thing that must never tile: laid a module at a time you
 * see every joint and the boards do not run through. Here the boards run the
 * full length of the span in one piece, with a real fascia and a chamfered
 * nosing all the way round.
 */
const TER_STYLES = ['plank', 'paving', 'lawn'];

defSpan('terrace', TER_STYLES, {
  plank: 'Timber', paving: 'Paving', lawn: 'Garden',
}, (mb, cols, rows, style) => {
  const W = cols * U, D = rows * U;
  const hw = W / 2, hd = D / 2;
  const top = 0.26, edge = 0.09;

  // --- structure: fascia band round the outside, joists under -------------
  mb.zoneOf(1);
  mb.push();
  mb.translate(0, 0, 0);
  mb.chamfer(W, top - edge, D, 0.03);
  mb.pop();

  // joists, visible from below and from a low camera
  mb.zoneOf(2);
  const joists = Math.max(2, Math.round(D / 0.8));
  for (let j = 0; j < joists; j++) {
    const z = -hd + (D * (j + 0.5)) / joists;
    mb.push();
    mb.translate(0, 0.02, z);
    mb.chamfer(W - 0.16, 0.10, 0.09, 0.015);
    mb.pop();
  }

  mb.zoneOf(0);
  if (style === 'plank') {
    // boards running the long way, each one chamfered, with a gap between
    const along = W >= D;
    const len = along ? W : D;
    const span = along ? D : W;
    const n = Math.max(2, Math.round(span / 0.42));
    const bw = span / n;
    for (let i = 0; i < n; i++) {
      const o = -span / 2 + bw * (i + 0.5);
      // a touch of tone per board so the deck is not one flat sheet
      const sh = 0.95 + ((i * 7919) % 11) / 90;
      mb.push();
      mb.translate(along ? 0 : o, top - edge, along ? o : 0);
      mb.shadeOf(sh);
      mb.chamfer(along ? len - 0.05 : bw - 0.055, edge, along ? bw - 0.055 : len - 0.05, 0.018);
      mb.pop();
    }
    mb.shadeOf(1);
  } else if (style === 'paving') {
    // slabs on a grid, staggered row to row so it is not a waffle
    const nx = Math.max(1, Math.round(W / 0.62)), nz = Math.max(1, Math.round(D / 0.62));
    const sx = W / nx, sz = D / nz;
    for (let j = 0; j < nz; j++) {
      const off = (j % 2) * sx * 0.5;
      for (let i = 0; i < nx; i++) {
        let x = -hw + sx * (i + 0.5) + off;
        if (x > hw - sx * 0.25) x -= W;      // wrap the stagger, no half slabs
        const sh = 0.94 + ((i * 31 + j * 17) % 13) / 95;
        mb.push();
        mb.translate(x, top - edge, -hd + sz * (j + 0.5));
        mb.shadeOf(sh);
        mb.chamfer(sx - 0.07, edge, sz - 0.07, 0.02);
        mb.pop();
      }
    }
    mb.shadeOf(1);
  } else {
    // a planted terrace: turf panel inside a raised kerb, with tufts
    mb.zoneOf(1);
    mb.push(); mb.translate(0, top - edge, 0);
    mb.chamfer(W, edge + 0.05, D, 0.025);
    mb.pop();
    mb.zoneOf(0);
    mb.push(); mb.translate(0, top - edge + 0.03, 0);
    mb.chamfer(W - 0.20, edge, D - 0.20, 0.02);
    mb.pop();
    const tufts = Math.min(46, Math.max(6, Math.round(cols * rows * 2.2)));
    for (let i = 0; i < tufts; i++) {
      const a = (i * 2654435761) >>> 0;
      const rx = ((a >>> 8) & 1023) / 1023, rz = ((a >>> 18) & 1023) / 1023;
      const x = -hw + 0.28 + rx * (W - 0.56);
      const z = -hd + 0.28 + rz * (D - 0.56);
      mb.push();
      mb.translate(x, top - edge + 0.09, z);
      mb.rotateY(rx * 6.2);
      mb.cone(0.07 + rz * 0.05, 0.16 + rx * 0.16, 5);
      mb.pop();
    }
  }

  // --- nosing all the way round, so no edge is a raw cut ------------------
  mb.zoneOf(1);
  for (const [x, z, w, d] of [
    [0, hd, W, 0.07], [0, -hd, W, 0.07],
    [hw, 0, 0.07, D], [-hw, 0, 0.07, D],
  ]) {
    mb.push();
    mb.translate(x, top - edge - 0.01, z);
    mb.chamfer(w, edge + 0.04, d, 0.02);
    mb.pop();
  }
});

// ---------------------------------------------------------------------------
// FLOOR PLATE — one storey of floor in a single piece
// ---------------------------------------------------------------------------
/**
 * The most boring span and the most useful: a whole storey of floor without
 * placing thirty tiles. Boards run through the whole plate, so a big room
 * reads as a room rather than a chequerboard.
 */
const FLR_STYLES = ['board', 'tile', 'slab'];

defSpan('floorPlate', FLR_STYLES, {
  board: 'Boards', tile: 'Tiles', slab: 'Concrete',
}, (mb, cols, rows, style) => {
  const W = cols * U, D = rows * U;
  const hw = W / 2, hd = D / 2;
  const th = 0.14;

  mb.zoneOf(1);
  mb.chamfer(W, th - 0.04, D, 0.02);

  mb.zoneOf(0);
  if (style === 'board') {
    const along = W >= D;
    const span = along ? D : W, len = along ? W : D;
    const n = Math.max(2, Math.round(span / 0.36));
    const bw = span / n;
    for (let i = 0; i < n; i++) {
      const o = -span / 2 + bw * (i + 0.5);
      mb.push();
      mb.translate(along ? 0 : o, th - 0.04, along ? o : 0);
      mb.shadeOf(0.96 + ((i * 6151) % 9) / 100);
      mb.chamfer(along ? len : bw - 0.03, 0.04, along ? bw - 0.03 : len, 0.012);
      mb.pop();
    }
    mb.shadeOf(1);
  } else if (style === 'tile') {
    const nx = Math.max(1, Math.round(W / 0.5)), nz = Math.max(1, Math.round(D / 0.5));
    const sx = W / nx, sz = D / nz;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        // chequer, which is what a tiled floor actually looks like
        mb.zoneOf((i + j) % 2 ? 2 : 0);
        mb.push();
        mb.translate(-hw + sx * (i + 0.5), th - 0.04, -hd + sz * (j + 0.5));
        mb.chamfer(sx - 0.035, 0.04, sz - 0.035, 0.012);
        mb.pop();
      }
    }
    mb.zoneOf(0);
  } else {
    mb.push();
    mb.translate(0, th - 0.04, 0);
    mb.chamfer(W - 0.06, 0.04, D - 0.06, 0.02);
    mb.pop();
    // A light expansion-joint grid, so a big plate is not a blank sheet. The
    // strips stand a little proud of the deck rather than flush with it —
    // two surfaces at exactly the same height z-fight, and which one wins is
    // down to depth precision, so it flickers as the camera moves.
    mb.zoneOf(2);
    const gx = Math.max(1, Math.round(cols / 2)), gz = Math.max(1, Math.round(rows / 2));
    for (let i = 1; i < gx; i++) {
      mb.push(); mb.translate(-hw + (W * i) / gx, th - 0.035, 0);
      mb.chamfer(0.035, 0.043, D - 0.08, 0.01); mb.pop();
    }
    for (let j = 1; j < gz; j++) {
      mb.push(); mb.translate(0, th - 0.035, -hd + (D * j) / gz);
      mb.chamfer(W - 0.08, 0.043, 0.035, 0.01); mb.pop();
    }
  }
});
