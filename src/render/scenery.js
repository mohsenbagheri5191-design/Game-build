/**
 * Turn baked parcels into 3D Toronto, one 250 m chunk at a time.
 *
 * The bake ships lots, not buildings. The building that stands on a lot is
 * derived here, deterministically, from the lot rectangle plus its form and
 * height — so the same corner always looks the same when you come back to it,
 * and demolishing a lot is just "stop deriving this one".
 */

import * as THREE from 'three';
import { MeshBuilder, roundRect, blob } from '../kit/mesh.js';
import { CLS_ORDER } from '../core/city.js';

// ---------------------------------------------------------------------------
const R = (x, y, s) => {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

// Ground colours. Neutral and desaturated on purpose — the map is not
// art-directed, it is a backdrop the player paints on top of.
export const GC = {
  land:     [0.80, 0.79, 0.76],
  asphalt:  [0.315, 0.318, 0.335],
  laneway:  [0.36, 0.355, 0.35],
  sidewalk: [0.735, 0.725, 0.70],
  plaza:    [0.775, 0.755, 0.715],
  grass:    [0.455, 0.585, 0.375],
  grassDark:[0.395, 0.525, 0.325],
  gravel:   [0.50, 0.485, 0.455],
  rail:     [0.40, 0.385, 0.365],
  line:     [0.86, 0.83, 0.60],
  track:    [0.46, 0.45, 0.47],
  curb:     [0.66, 0.65, 0.63],
};

// Streets that really carry streetcar track downtown.
const STREETCAR = new Set([
  'King St', 'Queen St', 'Dundas St', 'College St', 'Carlton St',
  'Spadina Ave', 'Bathurst St', 'Queens Quay', 'Harbourfront',
]);

// ---------------------------------------------------------------------------
// BUILDING MASSING
// ---------------------------------------------------------------------------
/**
 * Derive the footprint a building occupies inside its lot.
 * Downtown fabric builds to the street line; houses sit back behind a garden.
 */
export function footprintFor(p) {
  const w = p.u1 - p.u0, d = p.v1 - p.v0;
  const s = R(Math.round(p.u0), Math.round(p.v0), 5);
  let front, back, side;
  switch (p.form) {
    case 'row':       front = 2.4 + s * 2.2; back = d * (0.30 + s * 0.14); side = 0.0; break;
    case 'semi':      front = 3.0 + s * 2.6; back = d * (0.32 + s * 0.15); side = 0.9 + s * 0.8; break;
    case 'shop':      front = 0.2; back = d * (0.16 + s * 0.14); side = 0.0; break;
    case 'brick':     front = 0.3; back = d * (0.14 + s * 0.13); side = 0.0; break;
    case 'warehouse': front = 0.5; back = d * (0.08 + s * 0.10); side = 0.25; break;
    case 'church':    front = 2.0; back = d * 0.22; side = 1.6; break;
    case 'institution': front = 3.4 + s * 3.0; back = d * (0.16 + s * 0.12); side = 2.0 + s * 2.0; break;
    case 'midrise':   front = 0.6; back = d * (0.12 + s * 0.12); side = 0.4; break;
    default:          front = 1.0 + s * 1.4; back = d * (0.10 + s * 0.10); side = 0.6 + s * 0.8; break;
  }
  // "front" is measured from whichever side of the lot faces its street
  let u0 = p.u0 + side, u1 = p.u1 - side, v0 = p.v0 + side, v1 = p.v1 - side;
  if (p.side === 0) { v0 = p.v0 + front; v1 = p.v1 - back; }
  else if (p.side === 1) { v1 = p.v1 - front; v0 = p.v0 + back; }
  else if (p.side === 2) { u0 = p.u0 + front; u1 = p.u1 - back; }
  else { u1 = p.u1 - front; u0 = p.u0 + back; }
  if (u1 - u0 < 3) { const c = (p.u0 + p.u1) / 2; u0 = c - 1.5; u1 = c + 1.5; }
  if (v1 - v0 < 3) { const c = (p.v0 + p.v1) / 2; v0 = c - 1.5; v1 = c + 1.5; }
  return { u0, v0, u1, v1 };
}

/** Which way is "the street" from this lot, as a unit vector in the grid. */
function frontDir(side) {
  return side === 0 ? [0, -1] : side === 1 ? [0, 1] : side === 2 ? [-1, 0] : [1, 0];
}

/**
 * Add one derived building. `mb` is already translated to chunk-local space.
 */
export function addBuilding(mb, p, lod) {
  const f = footprintFor(p);
  const w = f.u1 - f.u0, d = f.v1 - f.v0;
  if (w < 1 || d < 1) return;
  const cx = (f.u0 + f.u1) / 2, cz = -(f.v0 + f.v1) / 2;
  const key = [Math.round(p.u0), Math.round(p.v0)];
  const s1 = R(key[0], key[1], 1), s2 = R(key[0], key[1], 2), s3 = R(key[0], key[1], 3);
  const h = p.height;
  const detail = lod >= 2;

  mb.objectOf(R(key[0], key[1], 17), s2);
  mb.push();
  mb.translate(cx, 0, cz);

  // Beyond the far band only the skyline is readable, so anything that is not
  // part of it is dropped rather than drawn at four pixels tall.
  if (lod < 0 && h < 14) { mb.pop(); return; }

  // Far chunks: silhouette only. The skyline still reads correctly because the
  // heights and footprints are the real ones — only the trim is gone.
  if (lod <= 0) {
    if (p.form === 'podiumTower' || p.form === 'tower') {
      const podH = Math.min(h * 0.18, 14);
      mb.box(w, podH, d);
      mb.push(); mb.translate(0, podH, 0);
      mb.box(w * 0.66, h - podH, d * 0.66);
      mb.pop();
    } else if ((p.form === 'row' || p.form === 'semi') && p.roof === 'gable') {
      const bodyH = Math.max(2, h - 1.4);
      mb.box(w, bodyH, d);
      mb.push(); mb.translate(0, bodyH, 0);
      if (Math.abs(frontDir(p.side)[0]) < 0.5) mb.rotateY(Math.PI / 2);
      mb.wedge(Math.abs(frontDir(p.side)[0]) > 0.5 ? w : d, 1.4, Math.abs(frontDir(p.side)[0]) > 0.5 ? d : w);
      mb.pop();
    } else {
      mb.box(w, h, d);
    }
    mb.pop();
    return;
  }

  const [fu, fv] = frontDir(p.side);
  const facing = Math.abs(fu) > 0.5;

  switch (p.form) {
    case 'row':
    case 'semi': {
      const bodyH = Math.max(3, h - 1.6);
      mb.chamfer(w, bodyH, d, 0.10);
      // roof
      const rh = 1.2 + s1 * 1.5;
      mb.push();
      mb.translate(0, bodyH, 0);
      if (p.roof === 'gable') {
        mb.push();
        if (!facing) mb.rotateY(Math.PI / 2);
        mb.wedge(facing ? w : d, rh, facing ? d : w, { overhang: 0.22 });
        mb.pop();
      } else if (p.roof === 'mansard') {
        mb.box(w, rh * 0.72, d, { taper: 0.68 });
        mb.push(); mb.translate(0, rh * 0.72, 0);
        mb.chamfer(w * 0.70, rh * 0.30, d * 0.70, 0.06);
        mb.pop();
      } else {
        mb.box(w + 0.3, rh * 0.8, d + 0.3, { taper: 0.30 });
      }
      mb.pop();
      if (detail) {
        // chimney
        mb.push();
        mb.translate((s2 - 0.5) * w * 0.5, bodyH + rh * 0.5, (s3 - 0.5) * d * 0.4);
        mb.chamfer(0.7, 1.5 + s1 * 0.8, 0.7, 0.06);
        mb.pop();
        // bay window / porch on the street face
        const bw = Math.min(w, d) * 0.42;
        mb.push();
        mb.translate((fu * w) / 2, 0, (-fv * d) / 2);
        mb.chamfer(facing ? 0.9 : bw, Math.min(bodyH * 0.62, 5.2), facing ? bw : 0.9, 0.07);
        mb.pop();
        // stoop
        mb.push();
        mb.translate((fu * (w / 2 + 0.7)), 0, (-fv * (d / 2 + 0.7)));
        mb.chamfer(facing ? 1.4 : 2.0, 0.45, facing ? 2.0 : 1.4, 0.05);
        mb.pop();
      }
      break;
    }

    case 'shop':
    case 'brick': {
      const cornice = 0.55 + s1 * 0.5;
      mb.chamfer(w, h - cornice, d, 0.08);
      mb.push(); mb.translate(0, h - cornice, 0);
      mb.chamfer(w + 0.34, cornice, d + 0.34, 0.09); // projecting cornice
      mb.pop();
      if (p.roof === 'stepped' && detail) {
        mb.push();
        mb.translate((fu * w) / 2 * 0.55, h, (-fv * d) / 2 * 0.55);
        mb.chamfer(facing ? 0.5 : w * 0.5, 0.9 + s2, facing ? d * 0.5 : 0.5, 0.06);
        mb.pop();
      }
      break;
    }

    case 'warehouse': {
      const par = 0.7;
      mb.chamfer(w, h - par, d, 0.10);
      mb.push(); mb.translate(0, h - par, 0);
      mb.chamfer(w + 0.20, par, d + 0.20, 0.07);
      mb.pop();
      if (detail) addRoofPlant(mb, w, d, h, s1, s2);
      break;
    }

    case 'institution': {
      const bodyH = h - 1.0;
      mb.chamfer(w, bodyH, d, 0.14);
      // symmetrical end pavilions
      mb.push(); mb.translate(-w * 0.34, 0, 0);
      mb.chamfer(w * 0.24, bodyH + 1.4, d * 1.03, 0.12); mb.pop();
      mb.push(); mb.translate(w * 0.34, 0, 0);
      mb.chamfer(w * 0.24, bodyH + 1.4, d * 1.03, 0.12); mb.pop();
      // entrance portico on the street side
      mb.push();
      mb.translate((fu * w) / 2, 0, (-fv * d) / 2);
      mb.chamfer(facing ? 2.0 : w * 0.30, bodyH * 0.55, facing ? d * 0.30 : 2.0, 0.10);
      mb.pop();
      mb.push(); mb.translate(0, bodyH + 1.4, 0);
      mb.box(w * 0.22, 1.3, d * 0.22, { taper: 0.5 });
      mb.pop();
      break;
    }

    case 'church': {
      const nave = h * 0.42;
      mb.chamfer(w, nave, d, 0.10);
      mb.push(); mb.translate(0, nave, 0);
      mb.push(); if (!facing) mb.rotateY(Math.PI / 2);
      mb.wedge(facing ? w : d, nave * 0.5, facing ? d : w, { overhang: 0.2 });
      mb.pop(); mb.pop();
      // steeple over the entrance
      const sw = Math.min(w, d) * 0.34;
      mb.push();
      mb.translate((fu * (w / 2 - sw * 0.6)), 0, (-fv * (d / 2 - sw * 0.6)));
      mb.chamfer(sw, h * 0.78, sw, 0.08);
      mb.push(); mb.translate(0, h * 0.78, 0);
      mb.cone(sw * 0.78, h * 0.30, 4, { phase: Math.PI / 4 });
      mb.pop();
      mb.pop();
      break;
    }

    case 'midrise': {
      const cap = 1.1;
      mb.chamfer(w, h - cap, d, 0.10);
      mb.push(); mb.translate(0, h - cap, 0);
      mb.chamfer(w * 0.93, cap, d * 0.93, 0.08);
      mb.pop();
      if (detail) addRoofPlant(mb, w * 0.9, d * 0.9, h, s1, s3);
      break;
    }

    case 'tower': {
      const podH = Math.min(h * 0.22, 12 + s1 * 6);
      mb.chamfer(w, podH, d, 0.12);
      const tw = w * (0.70 + s2 * 0.16), td = d * (0.70 + s3 * 0.16);
      mb.push(); mb.translate((s1 - 0.5) * w * 0.06, podH, (s2 - 0.5) * d * 0.06);
      mb.chamfer(tw, h - podH - 2.2, td, 0.22);
      mb.push(); mb.translate(0, h - podH - 2.2, 0);
      mb.chamfer(tw * 0.94, 2.2, td * 0.94, 0.14); // crown
      mb.pop();
      mb.pop();
      if (detail) addRoofPlant(mb, tw * 0.5, td * 0.5, h, s2, s1);
      break;
    }

    case 'podiumTower': {
      const podH = Math.min(h * 0.16, 16 + s1 * 8);
      mb.chamfer(w, podH, d, 0.14);
      // podium cornice
      mb.push(); mb.translate(0, podH, 0);
      mb.chamfer(w + 0.4, 0.7, d + 0.4, 0.10); mb.pop();
      const tw = w * (0.56 + s2 * 0.14), td = d * (0.56 + s3 * 0.14);
      const shaft = h - podH - 3.4;
      mb.push();
      mb.translate((s1 - 0.5) * (w - tw) * 0.6, podH + 0.7, (s2 - 0.5) * (d - td) * 0.6);
      mb.chamfer(tw, shaft * 0.62, td, 0.24);
      // setback upper shaft — the Toronto condo silhouette
      mb.push(); mb.translate(0, shaft * 0.62, 0);
      mb.chamfer(tw * 0.86, shaft * 0.38, td * 0.86, 0.20);
      mb.push(); mb.translate(0, shaft * 0.38, 0);
      mb.chamfer(tw * 0.80, 2.7, td * 0.80, 0.14);
      if (detail) {
        mb.push(); mb.translate(0, 2.7, 0);
        mb.cylinder(0.16, 5 + s3 * 5, 4); // mast
        mb.pop();
      }
      mb.pop(); mb.pop(); mb.pop();
      break;
    }

    default:
      mb.chamfer(w, h, d, 0.10);
  }
  mb.pop();
}

/** Rooftop mechanical clutter — the thing that stops a skyline reading as boxes. */
function addRoofPlant(mb, w, d, h, s1, s2) {
  const n = 1 + Math.floor(s1 * 3);
  for (let i = 0; i < n; i++) {
    const a = R(Math.round(w * 100 + i), Math.round(d * 100), 40 + i);
    const b = R(Math.round(d * 100 + i), Math.round(w * 100), 60 + i);
    const bw = 1.0 + a * Math.min(3.5, w * 0.22);
    const bd = 1.0 + b * Math.min(3.5, d * 0.22);
    mb.push();
    mb.translate((a - 0.5) * (w - bw) * 0.8, h, (b - 0.5) * (d - bd) * 0.8);
    mb.chamfer(bw, 0.8 + a * 1.9, bd, 0.06);
    mb.pop();
  }
  if (s2 > 0.72 && Math.min(w, d) > 8) {
    // rooftop water tank on legs
    mb.push();
    mb.translate((s1 - 0.5) * w * 0.4, h, (s2 - 0.5) * d * 0.4);
    for (const [ox, oz] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) {
      mb.push(); mb.translate(ox, 0, oz); mb.cylinder(0.11, 2.0, 4); mb.pop();
    }
    mb.push(); mb.translate(0, 2.0, 0);
    mb.cylinder(1.15, 2.4, 8, { chamfer: 0.2 });
    mb.push(); mb.translate(0, 2.4, 0); mb.cone(1.15, 0.7, 8); mb.pop();
    mb.pop();
    mb.pop();
  }
}

// ---------------------------------------------------------------------------
// LANDMARKS — the named ones, each shaped for its own silhouette
// ---------------------------------------------------------------------------
export function addLandmark(mb, l, quality) {
  // Landmarks keep their real shape at every distance — they are the skyline.
  const w = l.u1 - l.u0, d = l.v1 - l.v0, h = l.height;
  const cx = (l.u0 + l.u1) / 2, cz = -(l.v0 + l.v1) / 2;
  const s = R(Math.round(l.u0), Math.round(l.v0), 9);
  mb.objectOf(R(Math.round(l.u0), Math.round(l.v0), 21), 0.5 + s * 0.3);
  mb.push();
  mb.translate(cx, 0, cz);

  switch (l.form) {
    case 'cntower': {
      // The one silhouette everybody checks. Real proportions:
      // hexagonal shaft, SkyPod at 342 m, upper pod, antenna to 553 m.
      const podY = h * 0.618, podH = h * 0.058;
      mb.lathe([
        [17, 0], [12, h * 0.03], [8.2, h * 0.10], [6.4, h * 0.30],
        [5.4, h * 0.52], [5.0, podY],
      ], 6, { closeBottom: true });
      // three leg buttresses
      for (let i = 0; i < 3; i++) {
        mb.push();
        mb.rotateY((i / 3) * Math.PI * 2 + 0.4);
        mb.translate(6.5, 0, 0);
        mb.box(3.4, h * 0.34, 8.5, { taper: 0.22 });
        mb.pop();
      }
      // SkyPod
      mb.push(); mb.translate(0, podY, 0);
      mb.lathe([[5.0, 0], [13.5, podH * 0.22], [15.5, podH * 0.5], [14.0, podH * 0.82], [9.0, podH], [5.0, podH * 1.06]], 12);
      mb.pop();
      // upper shaft + SkyPod 2
      mb.push(); mb.translate(0, podY + podH * 1.06, 0);
      mb.cylinder(4.4, h * 0.155, 6, { rTop: 3.4 });
      mb.push(); mb.translate(0, h * 0.155, 0);
      mb.lathe([[3.4, 0], [6.6, 1.6], [6.0, 5.0], [3.2, 6.4]], 10);
      mb.pop(); mb.pop();
      // antenna
      mb.push(); mb.translate(0, podY + podH * 1.06 + h * 0.155 + 6.4, 0);
      mb.cylinder(1.6, h - (podY + podH * 1.06 + h * 0.155 + 6.4), 6, { rTop: 0.35 });
      mb.pop();
      break;
    }

    case 'dome': {
      // Rogers Centre — drum plus the retractable roof panels
      const r = Math.min(w, d) / 2;
      mb.cylinder(r, h * 0.55, 16, { chamfer: 1.2 });
      mb.push(); mb.translate(0, h * 0.55, 0);
      mb.lathe([[r, 0], [r * 0.97, h * 0.10], [r * 0.80, h * 0.26], [r * 0.50, h * 0.40], [0, h * 0.45]], 16);
      mb.pop();
      // panel seams
      if (quality >= 2) {
        for (let i = 0; i < 4; i++) {
          mb.push();
          mb.translate(0, h * 0.55, 0);
          mb.rotateY((i / 8) * Math.PI * 2);
          mb.translate(0, h * 0.06, 0);
          mb.box(r * 1.92, 0.5, 0.9, { centreY: true });
          mb.pop();
        }
      }
      break;
    }

    case 'cityhall': {
      // A curved slab: approximate the arc with a fan of thin segments.
      const segs = 9;
      const arc = Math.PI * 0.52;
      const rad = Math.max(w, d) * 1.5;
      for (let i = 0; i < segs; i++) {
        const t = (i / (segs - 1) - 0.5) * arc;
        mb.push();
        mb.rotateY(t);
        mb.translate(0, 0, -rad);
        mb.chamfer((rad * arc) / segs + 0.6, h, Math.min(w, d) * 0.9, 0.2);
        mb.pop();
      }
      break;
    }

    case 'clocktower': {
      const bodyH = Math.min(h, 34);
      mb.chamfer(w, bodyH, d, 0.2);
      mb.push(); mb.translate(0, bodyH, 0);
      mb.push(); mb.rotateY(Math.PI / 2); mb.wedge(d, 5.5, w, { overhang: 0.5 }); mb.pop();
      mb.pop();
      // the clock tower itself
      const tw = Math.min(w, d) * 0.34;
      mb.push();
      mb.translate(-w * 0.28, 0, d * 0.20);
      mb.chamfer(tw, h * 0.82, tw, 0.14);
      mb.push(); mb.translate(0, h * 0.82, 0);
      mb.chamfer(tw * 1.18, tw * 0.55, tw * 1.18, 0.10); // clock stage
      mb.push(); mb.translate(0, tw * 0.55, 0);
      mb.cone(tw * 0.86, h * 0.16, 4, { phase: Math.PI / 4 });
      mb.pop(); mb.pop(); mb.pop();
      break;
    }

    case 'church': {
      mb.chamfer(w, h * 0.34, d, 0.14);
      mb.push(); mb.translate(0, h * 0.34, 0);
      mb.wedge(w, h * 0.14, d, { overhang: 0.4 });
      mb.pop();
      const tw = Math.min(w, d) * 0.30;
      mb.push();
      mb.translate(0, 0, -d * 0.32);
      mb.chamfer(tw, h * 0.62, tw, 0.10);
      mb.push(); mb.translate(0, h * 0.62, 0);
      mb.cone(tw * 0.80, h * 0.34, 4, { phase: Math.PI / 4 });
      mb.pop(); mb.pop();
      break;
    }

    case 'flatiron': {
      // Gooderham Building — the wedge
      const poly = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2 + w * 0.18, d / 2]];
      mb.extrude(poly.map(([a, b]) => [a, -b]), h - 1.2);
      mb.push(); mb.translate(0, h - 1.2, 0);
      mb.extrude(poly.map(([a, b]) => [a * 1.05, -b * 1.05]), 1.2);
      mb.pop();
      break;
    }

    case 'silo': {
      const r = Math.min(w, d) / 2;
      for (let i = 0; i < 3; i++) {
        mb.push(); mb.translate((i - 1) * r * 0.95, 0, 0);
        mb.cylinder(r * 0.48, h, 10, { chamfer: 0.4 });
        mb.push(); mb.translate(0, h, 0); mb.cone(r * 0.48, r * 0.5, 10); mb.pop();
        mb.pop();
      }
      break;
    }

    case 'heritage': {
      // Distillery-style brick range: several joined blocks with pitched roofs
      const n = 3;
      for (let i = 0; i < n; i++) {
        const bw = w / n;
        const bh = h * (0.75 + R(i, 3, 11) * 0.5);
        mb.push();
        mb.translate(-w / 2 + bw * (i + 0.5), 0, 0);
        mb.chamfer(bw * 0.94, bh, d * 0.9, 0.1);
        mb.push(); mb.translate(0, bh, 0);
        mb.wedge(bw * 0.94, 1.8, d * 0.9, { overhang: 0.25 });
        mb.pop(); mb.pop();
      }
      break;
    }

    case 'spire': {
      const podH = Math.min(h * 0.13, 14);
      mb.chamfer(w, podH, d, 0.14);
      const tw = w * 0.66, td = d * 0.66;
      mb.push(); mb.translate(0, podH, 0);
      mb.chamfer(tw, h - podH - h * 0.10, td, 0.2);
      mb.push(); mb.translate(0, h - podH - h * 0.10, 0);
      mb.lathe([[Math.min(tw, td) * 0.5, 0], [Math.min(tw, td) * 0.34, h * 0.05], [0.5, h * 0.10]], 6);
      mb.pop(); mb.pop();
      break;
    }

    case 'shed': {
      mb.chamfer(w, h * 0.75, d, 0.12);
      mb.push(); mb.translate(0, h * 0.75, 0);
      mb.wedge(w, h * 0.4, d, { overhang: 0.5 });
      mb.pop();
      break;
    }

    case 'hall': {
      mb.chamfer(w, h * 0.86, d, 0.16);
      mb.push(); mb.translate(0, h * 0.86, 0);
      mb.chamfer(w * 0.90, h * 0.14, d * 0.90, 0.12);
      mb.pop();
      if (quality >= 2) addRoofPlant(mb, w * 0.7, d * 0.7, h, s, R(1, 2, 3));
      break;
    }

    case 'slab': {
      mb.chamfer(w, h - 2.0, d, 0.18);
      mb.push(); mb.translate(0, h - 2.0, 0);
      mb.chamfer(w * 0.96, 2.0, d * 0.96, 0.12);
      mb.pop();
      break;
    }

    case 'podium':
      mb.chamfer(w, h, d, 0.16);
      break;

    default: { // 'tower'
      const podH = Math.min(h * 0.10, 14);
      mb.chamfer(w, podH, d, 0.16);
      mb.push(); mb.translate(0, podH, 0);
      mb.chamfer(w * 0.92, h - podH - 3.0, d * 0.92, 0.26);
      mb.push(); mb.translate(0, h - podH - 3.0, 0);
      mb.chamfer(w * 0.86, 3.0, d * 0.86, 0.16);
      if (quality >= 2) {
        mb.push(); mb.translate(0, 3.0, 0);
        mb.cylinder(0.22, 6 + s * 8, 4);
        mb.pop();
      }
      mb.pop(); mb.pop();
    }
  }
  mb.pop();
}

// ---------------------------------------------------------------------------
// GROUND
// ---------------------------------------------------------------------------
class GroundBuilder {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.shade = []; }

  /** Flat top-facing slab from y0 to y1 with vertical sides. */
  slab(u0, v0, u1, v1, y0, y1, color, opt = {}) {
    if (u1 <= u0 || v1 <= v0) return;
    const { sides = true, shade = 1 } = opt;
    const x0 = u0, x1 = u1, z0 = -v1, z1 = -v0;
    const push = (x, y, z, nx, ny, nz, sh) => {
      this.pos.push(x, y, z); this.nrm.push(nx, ny, nz);
      this.col.push(color[0], color[1], color[2]); this.shade.push(sh);
    };
    // top
    push(x0, y1, z0, 0, 1, 0, shade); push(x0, y1, z1, 0, 1, 0, shade); push(x1, y1, z1, 0, 1, 0, shade);
    push(x0, y1, z0, 0, 1, 0, shade); push(x1, y1, z1, 0, 1, 0, shade); push(x1, y1, z0, 0, 1, 0, shade);
    if (sides && y1 > y0) {
      const c = GC.curb;
      const sideCol = opt.curbColor || c;
      const q = (ax, az, bx, bz, nx, nz) => {
        const p = (x, y, z, sh) => {
          this.pos.push(x, y, z); this.nrm.push(nx, 0, nz);
          this.col.push(sideCol[0], sideCol[1], sideCol[2]); this.shade.push(sh);
        };
        p(ax, y0, az, 0.74); p(bx, y0, bz, 0.74); p(bx, y1, bz, 0.98);
        p(ax, y0, az, 0.74); p(bx, y1, bz, 0.98); p(ax, y1, az, 0.98);
      };
      q(x0, z1, x1, z1, 0, 1);
      q(x1, z0, x0, z0, 0, -1);
      q(x1, z1, x1, z0, 1, 0);
      q(x0, z0, x0, z1, -1, 0);
    }
  }

  poly(pts, y, color, shade = 1) {
    // pts are [u,v]; fan from the first vertex (shapes here are convex enough)
    for (let i = 1; i < pts.length - 1; i++) {
      for (const p of [pts[0], pts[i], pts[i + 1]]) {
        this.pos.push(p[0], y, -p[1]);
        this.nrm.push(0, 1, 0);
        this.col.push(color[0], color[1], color[2]);
        this.shade.push(shade);
      }
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('shade', new THREE.Float32BufferAttribute(this.shade, 1));
    g.computeBoundingSphere();
    return g;
  }
  get isEmpty() { return this.pos.length === 0; }
}

const CURB_H = 0.15;
const PARK_H = 0.11;

/**
 * Build every ground surface inside one chunk: land, sidewalks with real
 * curbs, road asphalt, centre lines, streetcar track, parks, plazas, rail.
 */
function buildGround(city, ci, gb, lod = 2) {
  const o = city.chunkOrigin(ci);
  const cs = city.chunkSize;
  const U0 = o.u, V0 = o.v, U1 = o.u + cs, V1 = o.v + cs;
  const clampU = (a, b) => [Math.max(U0, a), Math.min(U1, b)];
  const clampV = (a, b) => [Math.max(V0, a), Math.min(V1, b)];

  // base land
  gb.slab(U0, V0, U1, V1, -0.4, 0, GC.land, { sides: false });

  // parks and squares
  for (const p of city.parks) {
    const [a, b] = clampU(p.u0, p.u1), [c, d] = clampV(p.v0, p.v1);
    if (b <= a || d <= c) continue;
    const col = p.kind === 'square' ? GC.plaza : GC.grass;
    gb.slab(a, c, b, d, 0, p.kind === 'square' ? PARK_H * 1.1 : PARK_H, col, { curbColor: GC.curb });
    if (p.kind !== 'square') {
      // a couple of darker patches so grass isn't one flat colour
      const s = R(Math.round(p.u0), Math.round(p.v0), 31);
      const pw = (b - a) * 0.34, pd = (d - c) * 0.34;
      const px = a + s * ((b - a) - pw), pz = c + R(Math.round(p.v0), 3, 7) * ((d - c) - pd);
      gb.slab(px, pz, px + pw, pz + pd, 0, PARK_H + 0.012, GC.grassDark, { sides: false });
    }
  }

  // rail corridor
  {
    let ru0 = Infinity, rv0 = Infinity, ru1 = -Infinity, rv1 = -Infinity;
    for (const [u, v] of city.rail) {
      ru0 = Math.min(ru0, u); rv0 = Math.min(rv0, v);
      ru1 = Math.max(ru1, u); rv1 = Math.max(rv1, v);
    }
    const [a, b] = clampU(ru0, ru1), [c, d] = clampV(rv0, rv1);
    if (b > a && d > c) {
      gb.slab(a, c, b, d, 0, 0.05, GC.gravel, { sides: false });
      for (let i = 0; i < 6; i++) {
        const tv = c + ((d - c) * (i + 0.5)) / 6;
        if (tv < V0 || tv > V1) continue;
        gb.slab(a, tv - 0.7, b, tv + 0.7, 0.05, 0.16, GC.rail, { sides: false });
      }
    }
  }

  // streets
  for (const s of city.streets) {
    // far chunks keep only the arterial grid — the lanes are sub-pixel
    if (lod < 0 && CLS_ORDER.indexOf(s.cls) < 3) continue;
    const hw = s.width / 2;
    const walk = Math.max(2.0, s.width * 0.19);
    if (s.axis === 'ew') {
      if (s.pos + hw + walk < V0 || s.pos - hw - walk > V1) continue;
      const [a, b] = clampU(Math.max(s.min, city.uMin), Math.min(s.max, city.uMax));
      if (b <= a) continue;
      const road = s.cls === 'lane' ? GC.laneway : GC.asphalt;
      gb.slab(a, s.pos - hw, b, s.pos + hw, 0, 0.02, road, { sides: false });
      if (s.cls !== 'lane') {
        gb.slab(a, s.pos + hw, b, s.pos + hw + walk, 0, CURB_H, GC.sidewalk, { sides: lod >= 2 });
        gb.slab(a, s.pos - hw - walk, b, s.pos - hw, 0, CURB_H, GC.sidewalk, { sides: lod >= 2 });
      }
      if (lod >= 1) addRoadMarks(gb, s, a, b, true);
    } else {
      if (s.pos + hw + walk < U0 || s.pos - hw - walk > U1) continue;
      const [c, d] = clampV(Math.max(s.min, city.vMin), Math.min(s.max, city.vMax));
      if (d <= c) continue;
      const road = s.cls === 'lane' ? GC.laneway : GC.asphalt;
      gb.slab(s.pos - hw, c, s.pos + hw, d, 0, 0.02, road, { sides: false });
      if (s.cls !== 'lane') {
        gb.slab(s.pos + hw, c, s.pos + hw + walk, d, 0, CURB_H, GC.sidewalk, { sides: lod >= 2 });
        gb.slab(s.pos - hw - walk, c, s.pos - hw, d, 0, CURB_H, GC.sidewalk, { sides: lod >= 2 });
      }
      if (lod >= 1) addRoadMarks(gb, s, c, d, false);
    }
  }
}

function addRoadMarks(gb, s, a, b, ew) {
  const rank = CLS_ORDER.indexOf(s.cls);
  if (rank < 3) return;
  const y = 0.028;
  const track = STREETCAR.has(s.name);
  if (track) {
    for (const off of [-1.7, -0.25, 0.25, 1.7]) {
      if (ew) gb.slab(a, s.pos + off - 0.08, b, s.pos + off + 0.08, y, y + 0.004, GC.track, { sides: false });
      else gb.slab(s.pos + off - 0.08, a, s.pos + off + 0.08, b, y, y + 0.004, GC.track, { sides: false });
    }
    return;
  }
  // dashed centre line
  const len = b - a;
  const dash = 3.2, gap = 4.4;
  for (let t = 0; t < len; t += dash + gap) {
    const p0 = a + t, p1 = Math.min(b, a + t + dash);
    if (p1 <= p0) break;
    if (ew) gb.slab(p0, s.pos - 0.10, p1, s.pos + 0.10, y, y + 0.004, GC.line, { sides: false });
    else gb.slab(s.pos - 0.10, p0, s.pos + 0.10, p1, y, y + 0.004, GC.line, { sides: false });
  }
}

// ---------------------------------------------------------------------------
// STREET FURNITURE placement (returned as instance lists)
// ---------------------------------------------------------------------------
function collectFurniture(city, ci, out) {
  const o = city.chunkOrigin(ci);
  const cs = city.chunkSize;
  const U0 = o.u, V0 = o.v, U1 = o.u + cs, V1 = o.v + cs;

  for (const s of city.streets) {
    const rank = CLS_ORDER.indexOf(s.cls);
    if (rank < 2 || s.cls === 'expressway') continue;
    const gapTree = rank >= 4 ? 21 : 27;
    const gapLamp = rank >= 4 ? 33 : 45;
    const hw = s.width / 2 + Math.max(2.0, s.width * 0.19) * 0.55;

    const run = (lo, hi, place) => {
      const start = Math.ceil(lo / gapTree) * gapTree;
      for (let t = start; t <= hi; t += gapTree) place(t, 'tree');
      const startL = Math.ceil(lo / gapLamp) * gapLamp;
      for (let t = startL; t <= hi; t += gapLamp) place(t, 'lamp');
    };

    if (s.axis === 'ew') {
      if (s.pos + hw < V0 - 4 || s.pos - hw > V1 + 4) continue;
      const lo = Math.max(s.min, U0 - 4), hi = Math.min(s.max, U1 + 4);
      run(lo, hi, (u, kind) => {
        for (const side of [-1, 1]) {
          const v = s.pos + side * hw;
          if (u < U0 || u >= U1 || v < V0 || v >= V1) continue;
          if (city.parcelAt(u, v)) continue;
          push(out, kind, u, v, R(Math.round(u), Math.round(v), kind === 'tree' ? 71 : 73));
        }
      });
    } else {
      if (s.pos + hw < U0 - 4 || s.pos - hw > U1 + 4) continue;
      const lo = Math.max(s.min, V0 - 4), hi = Math.min(s.max, V1 + 4);
      run(lo, hi, (v, kind) => {
        for (const side of [-1, 1]) {
          const u = s.pos + side * hw;
          if (u < U0 || u >= U1 || v < V0 || v >= V1) continue;
          if (city.parcelAt(u, v)) continue;
          push(out, kind, u, v, R(Math.round(u), Math.round(v), kind === 'tree' ? 71 : 73));
        }
      });
    }
  }

  // park trees
  for (const p of city.parks) {
    if (p.kind === 'square') continue;
    if (p.u1 < U0 || p.u0 > U1 || p.v1 < V0 || p.v0 > V1) continue;
    const step = 13;
    for (let u = Math.ceil(p.u0 / step) * step; u < p.u1; u += step) {
      for (let v = Math.ceil(p.v0 / step) * step; v < p.v1; v += step) {
        if (u < U0 || u >= U1 || v < V0 || v >= V1) continue;
        const r = R(Math.round(u), Math.round(v), 83);
        if (r < 0.42) continue;
        const jx = (R(Math.round(u), Math.round(v), 84) - 0.5) * 5;
        const jz = (R(Math.round(u), Math.round(v), 85) - 0.5) * 5;
        push(out, 'parkTree', u + jx, v + jz, r);
      }
    }
  }
}

function push(out, kind, u, v, r) {
  (out[kind] || (out[kind] = [])).push({ u, v, r });
}

// ---------------------------------------------------------------------------
export function buildChunk(city, ci, demolished, lod) {
  const mb = new MeshBuilder();
  const o = city.chunkOrigin(ci);
  const cs = city.chunkSize;

  for (const p of city.chunks[ci]) {
    if (demolished.has(p.id)) continue;
    addBuilding(mb, p, lod);
  }
  for (const l of city.landmarks) {
    const cu = (l.u0 + l.u1) / 2, cv = (l.v0 + l.v1) / 2;
    if (cu < o.u || cu >= o.u + cs || cv < o.v || cv >= o.v + cs) continue;
    if (demolished.has(l.id)) continue;
    if (lod < 0 && l.height < 20) continue;
    addLandmark(mb, l, Math.max(1, lod));
  }

  const gb = new GroundBuilder();
  buildGround(city, ci, gb, lod);

  const furniture = {};
  if (lod >= 1) collectFurniture(city, ci, furniture);

  return {
    buildings: mb.isEmpty ? null : mb.buildScenery(),
    ground: gb.isEmpty ? null : gb.build(),
    furniture,
    tris: mb.triCount,
  };
}

/**
 * The Toronto Islands. They sit outside the buildable area and outside the
 * chunk grid, so they are built once with the water rather than streamed.
 */
export function buildIslands(city) {
  const gb = new GroundBuilder();
  let any = false;
  for (const w of city.water) {
    if (w.kind !== 'island') continue;
    any = true;
    const beach = [0.80, 0.75, 0.62];
    const grass = [0.40, 0.53, 0.34];
    // a sand shelf under a slightly inset green
    gb.poly(w.poly, 0.10, beach, 1);
    const inner = w.poly.map(([u, v]) => {
      const cu = w.poly.reduce((s, p) => s + p[0], 0) / w.poly.length;
      const cv = w.poly.reduce((s, p) => s + p[1], 0) / w.poly.length;
      return [u + (cu - u) * 0.14, v + (cv - v) * 0.14];
    });
    gb.poly(inner, 0.22, grass, 1);
  }
  return any ? gb.build() : null;
}

/** Island tree positions, so the harbour foreground isn't a bare green plate. */
export function islandTrees(city) {
  const out = [];
  for (const w of city.water) {
    if (w.kind !== 'island') continue;
    if (w.name.includes('Airport')) continue;
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const [u, v] of w.poly) {
      u0 = Math.min(u0, u); v0 = Math.min(v0, v);
      u1 = Math.max(u1, u); v1 = Math.max(v1, v);
    }
    for (let u = u0; u < u1; u += 26) {
      for (let v = v0; v < v1; v += 26) {
        const r = R(Math.round(u), Math.round(v), 97);
        if (r < 0.45) continue;
        const ju = u + (R(Math.round(u), Math.round(v), 98) - 0.5) * 16;
        const jv = v + (R(Math.round(u), Math.round(v), 99) - 0.5) * 16;
        if (!pointIn(ju, jv, w.poly)) continue;
        out.push({ u: ju, v: jv, r });
      }
    }
  }
  return out;
}

/** Water is one mesh for the whole world, not per chunk. */
export function buildWater(city) {
  const gb = new GroundBuilder();
  for (const w of city.water) {
    if (w.kind === 'island') continue;
    const col = w.kind === 'river' ? [0.30, 0.46, 0.42] : [0.24, 0.44, 0.60];
    // subdivide so the ripple in the vertex shader has something to move
    const b = { u0: Infinity, v0: Infinity, u1: -Infinity, v1: -Infinity };
    for (const [u, v] of w.poly) {
      b.u0 = Math.min(b.u0, u); b.v0 = Math.min(b.v0, v);
      b.u1 = Math.max(b.u1, u); b.v1 = Math.max(b.v1, v);
    }
    // The lake runs far past the playable area, so its tessellation is coarse
    // out there and fine near the shore where the ripple actually reads.
    const step = w.kind === 'river' ? 30 : 90;
    for (let u = b.u0; u < b.u1; u += step) {
      for (let v = b.v0; v < b.v1; v += step) {
        const cu = u + step / 2, cv = v + step / 2;
        if (!pointIn(cu, cv, w.poly)) continue;
        gb.poly([[u, v], [u + step, v], [u + step, v + step], [u, v + step]], -0.25, col, 1);
      }
    }
  }
  return gb.isEmpty ? null : gb.build();
}

function pointIn(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export { GroundBuilder, blob, roundRect };
