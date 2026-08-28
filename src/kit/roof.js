/**
 * Roofs, built as one continuous piece.
 *
 * A roof is not a per-cell part. Tiling a one-cell A-frame across a wide
 * building gives you corrugated iron and visible seams, which is exactly the
 * broken look this replaces. Instead a roof covers a whole rectangle of
 * modules and is generated as a single watertight mesh: two slopes meeting at
 * one ridge, closed ends, a solid underside. There is nothing to line up, so
 * there is nothing to leave a gap.
 *
 * The player sizes it by dragging any side. See World.resizeSpan().
 */

import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

const U = CONFIG.grid.unit;

export const ROOF_STYLES = ['gable', 'hip', 'shed', 'flat'];

const OVERHANG = 0.34;   // eaves projection beyond the walls
const PITCH = 0.46;      // rise per metre of run
const FASCIA = 0.14;     // depth of the eaves board

const P = (x, y, z) => new THREE.Vector3(x, y, z);

/** Span builder, registered in kit/spans.js. Caching lives there. */
export function roofSpan(mb, cols, rows, style) {
  const W = cols * U, D = rows * U;
  const hw = W / 2 + OVERHANG;
  const hd = D / 2 + OVERHANG;

  if (style === 'flat') return buildFlat(mb, hw, hd);
  if (style === 'shed') return buildShed(mb, hw, hd);

  // Ridge runs along the longer axis, which is what makes a rectangular
  // building look right rather than absurdly steep across its short side.
  const alongX = W >= D;
  const run = alongX ? hd : hw;
  const h = run * PITCH;

  mb.zoneOf(0);
  if (style === 'hip') buildHip(mb, hw, hd, h, alongX);
  else buildGable(mb, hw, hd, h, alongX);

  // solid underside, so you never see through the roof from below
  mb.zoneOf(1);
  mb.quad(P(-hw, 0, hd), P(-hw, 0, -hd), P(hw, 0, -hd), P(hw, 0, hd),
    [0.62, 0.62, 0.62, 0.62]);

  // fascia boards all the way round the eaves
  mb.zoneOf(1);
  for (const [x, z, w, d] of [
    [0, hd, hw * 2, FASCIA], [0, -hd, hw * 2, FASCIA],
    [hw, 0, FASCIA, hd * 2], [-hw, 0, FASCIA, hd * 2],
  ]) {
    mb.push();
    mb.translate(x, 0.02, z);
    mb.chamfer(w, 0.13, d, 0.02, { centreY: true });
    mb.pop();
  }
}

function buildGable(mb, hw, hd, h, alongX) {
  if (alongX) {
    // two slopes meeting at a ridge that runs the full length in X
    mb.quad(P(-hw, 0, hd), P(hw, 0, hd), P(hw, h, 0), P(-hw, h, 0), [0.9, 0.9, 1.08, 1.08]);
    mb.quad(P(hw, 0, -hd), P(-hw, 0, -hd), P(-hw, h, 0), P(hw, h, 0), [0.78, 0.78, 0.98, 0.98]);
    // closed gable ends
    mb.tri(P(hw, 0, hd), P(hw, 0, -hd), P(hw, h, 0), [0.94, 0.94, 1.02]);
    mb.tri(P(-hw, 0, -hd), P(-hw, 0, hd), P(-hw, h, 0), [0.86, 0.86, 1.0]);
    ridgeCap(mb, -hw, hw, h, true);
  } else {
    mb.quad(P(0, h, -hd), P(0, h, hd), P(hw, 0, hd), P(hw, 0, -hd), [1.08, 1.08, 0.9, 0.9]);
    mb.quad(P(0, h, hd), P(0, h, -hd), P(-hw, 0, -hd), P(-hw, 0, hd), [0.98, 0.98, 0.78, 0.78]);
    mb.tri(P(-hw, 0, hd), P(hw, 0, hd), P(0, h, hd), [0.94, 0.94, 1.02]);
    mb.tri(P(hw, 0, -hd), P(-hw, 0, -hd), P(0, h, -hd), [0.86, 0.86, 1.0]);
    ridgeCap(mb, -hd, hd, h, false);
  }
}

function buildHip(mb, hw, hd, h, alongX) {
  // the ridge is pulled in by the half-span at each end, giving hipped ends
  if (alongX) {
    const r = Math.min(hd, hw * 0.9);
    const x0 = -hw + r, x1 = hw - r;
    mb.quad(P(-hw, 0, hd), P(hw, 0, hd), P(x1, h, 0), P(x0, h, 0), [0.9, 0.9, 1.08, 1.08]);
    mb.quad(P(hw, 0, -hd), P(-hw, 0, -hd), P(x0, h, 0), P(x1, h, 0), [0.78, 0.78, 0.98, 0.98]);
    mb.tri(P(hw, 0, hd), P(hw, 0, -hd), P(x1, h, 0), [0.96, 0.96, 1.04]);
    mb.tri(P(-hw, 0, -hd), P(-hw, 0, hd), P(x0, h, 0), [0.84, 0.84, 1.0]);
    ridgeCap(mb, x0, x1, h, true);
  } else {
    const r = Math.min(hw, hd * 0.9);
    const z0 = -hd + r, z1 = hd - r;
    mb.quad(P(0, h, z0), P(0, h, z1), P(hw, 0, hd), P(hw, 0, -hd), [1.08, 1.08, 0.9, 0.9]);
    mb.quad(P(0, h, z1), P(0, h, z0), P(-hw, 0, -hd), P(-hw, 0, hd), [0.98, 0.98, 0.78, 0.78]);
    mb.tri(P(-hw, 0, hd), P(hw, 0, hd), P(0, h, z1), [0.96, 0.96, 1.04]);
    mb.tri(P(hw, 0, -hd), P(-hw, 0, -hd), P(0, h, z0), [0.84, 0.84, 1.0]);
    ridgeCap(mb, z0, z1, h, false);
  }
}

function buildShed(mb, hw, hd) {
  const h = hd * 2 * PITCH;
  mb.zoneOf(0);
  // one plane from the low eave to the high edge
  mb.quad(P(-hw, 0, hd), P(hw, 0, hd), P(hw, h, -hd), P(-hw, h, -hd), [0.92, 0.92, 1.08, 1.08]);
  // side triangles and the high wall close it
  mb.tri(P(hw, 0, hd), P(hw, 0, -hd), P(hw, h, -hd), [0.96, 0.96, 1.02]);
  mb.tri(P(-hw, 0, -hd), P(-hw, 0, hd), P(-hw, h, -hd), [0.84, 0.84, 1.0]);
  mb.zoneOf(1);
  mb.quad(P(hw, 0, -hd), P(-hw, 0, -hd), P(-hw, h, -hd), P(hw, h, -hd), [0.7, 0.7, 0.92, 0.92]);
  mb.quad(P(-hw, 0, hd), P(-hw, 0, -hd), P(hw, 0, -hd), P(hw, 0, hd), [0.62, 0.62, 0.62, 0.62]);
  mb.push(); mb.translate(0, 0.02, hd);
  mb.chamfer(hw * 2, 0.13, FASCIA, 0.02, { centreY: true }); mb.pop();
  mb.push(); mb.translate(0, h, -hd);
  mb.chamfer(hw * 2, 0.12, FASCIA * 1.4, 0.02, { centreY: true }); mb.pop();
}

/**
 * Flat roof: a deck inside a parapet, built as one closed shell.
 *
 * Stacking a slab and four parapet boxes looks the same from outside but is
 * five overlapping solids, not one piece — the seams are real even where you
 * cannot see them. This walks the outside up, across the parapet, back down
 * the inside and over the deck, so every edge is shared by exactly two faces.
 */
function buildFlat(mb, hw, hd) {
  const deck = 0.18, top = 0.62;
  const t = Math.min(0.26, hw * 0.3, hd * 0.3);
  const iw = hw - t, id = hd - t;

  const outer = (y) => [P(-hw, y, -hd), P(hw, y, -hd), P(hw, y, hd), P(-hw, y, hd)];
  const inner = (y) => [P(-iw, y, -id), P(iw, y, -id), P(iw, y, id), P(-iw, y, id)];

  const o0 = outer(0), oT = outer(top);
  const iT = inner(top), iD = inner(deck);

  mb.zoneOf(1);
  // underside, facing down
  mb.quad(o0[0], o0[1], o0[2], o0[3], [0.6, 0.6, 0.6, 0.6]);
  // outer walls, facing out
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) % 4;
    mb.quad(o0[j], o0[k], oT[k], oT[j], [0.76, 0.76, 1.0, 1.0]);
  }
  // parapet coping, facing up
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) % 4;
    mb.quad(iT[k], iT[j], oT[j], oT[k], [1.02, 1.02, 1.08, 1.08]);
  }
  // inner walls, facing in toward the well
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) % 4;
    mb.quad(iD[k], iD[j], iT[j], iT[k], [0.62, 0.62, 0.7, 0.7]);
  }
  // the deck itself, facing up
  mb.zoneOf(0);
  mb.quad(iD[3], iD[2], iD[1], iD[0], [1.04, 1.04, 1.04, 1.04]);
}

function ridgeCap(mb, a, b, h, alongX) {
  mb.zoneOf(1);
  mb.push();
  mb.translate(alongX ? (a + b) / 2 : 0, h, alongX ? 0 : (a + b) / 2);
  if (alongX) mb.chamfer(b - a, 0.11, 0.20, 0.025, { centreY: true });
  else mb.chamfer(0.20, 0.11, b - a, 0.025, { centreY: true });
  mb.pop();
}

/** Ridge height for a span, so callers can size things above it. */
export function roofHeight(cols, rows, style = 'gable') {
  if (style === 'flat') return 0.58;
  const hw = (cols * U) / 2 + OVERHANG;
  const hd = (rows * U) / 2 + OVERHANG;
  if (style === 'shed') return hd * 2 * PITCH;
  return Math.min(hw, hd) * PITCH;
}
