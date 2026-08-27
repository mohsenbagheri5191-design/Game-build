/**
 * Low-poly geometry builder.
 *
 * Everything the player places is authored here in code rather than loaded as
 * a mesh: it compresses to nothing, it is exactly on-module, and it lets every
 * part carry material *zones* so the player can colour each piece of it
 * separately.
 *
 * Style rules, applied everywhere:
 *   - flat shading, one normal per triangle, low counts, readable silhouettes
 *   - chamfered edges by default; a hard 90 degree box reads as a placeholder
 *   - a baked shade term per vertex for cheap crevice/ground darkening, kept
 *     strictly neutral so it multiplies whatever colour the player picks
 *
 * Zones are indices 0..2. Zone 0 is the body, 1 the trim/accent, 2 the
 * glass/metal/foliage detail. Parts declare what each zone means.
 */

import * as THREE from 'three';

const V = new THREE.Vector3();
const A = new THREE.Vector3();
const B = new THREE.Vector3();
const N = new THREE.Vector3();

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.zone = [];
    this.shade = [];
    this.seed = [];
    this.tone = [];
    this.stack = [];
    this.m = new THREE.Matrix4();
    this.nm = new THREE.Matrix3();
    this.z = 0;
    this.sh = 1;
    // per-object channels, used by the scenery builder to give every real
    // building its own facade phase and tone inside one merged chunk mesh
    this.sd = 0;
    this.tn = 0.5;
  }

  objectOf(seed, tone) { this.sd = seed; this.tn = tone; return this; }

  // --- transform stack ---
  // The stack recycles its matrices: a dense chunk pushes tens of thousands of
  // times and cloning each one dominated the build cost.
  push() {
    const depth = this.stack.length;
    let m = this.pool && this.pool[depth];
    if (!m) { m = new THREE.Matrix4(); (this.pool || (this.pool = []))[depth] = m; }
    m.copy(this.m);
    this.stack.push(m);
    return this;
  }
  pop() {
    const m = this.stack.pop();
    this.m.copy(m);
    this.nm.setFromMatrix4(this.m).invert().transpose();
    return this;
  }
  reset() { this.m.identity(); this.nm.identity(); return this; }
  translate(x, y, z) { this.m.multiply(new THREE.Matrix4().makeTranslation(x, y, z)); return this; }
  rotateX(a) { this.m.multiply(new THREE.Matrix4().makeRotationX(a)); this.nm.setFromMatrix4(this.m).invert().transpose(); return this; }
  rotateY(a) { this.m.multiply(new THREE.Matrix4().makeRotationY(a)); this.nm.setFromMatrix4(this.m).invert().transpose(); return this; }
  rotateZ(a) { this.m.multiply(new THREE.Matrix4().makeRotationZ(a)); this.nm.setFromMatrix4(this.m).invert().transpose(); return this; }
  scale(x, y = x, z = x) { this.m.multiply(new THREE.Matrix4().makeScale(x, y, z)); this.nm.setFromMatrix4(this.m).invert().transpose(); return this; }

  zoneOf(z) { this.z = z; return this; }
  shadeOf(s) { this.sh = s; return this; }

  // --- primitive faces ---
  tri(p0, p1, p2, shades) {
    A.subVectors(p1, p0); B.subVectors(p2, p0);
    N.crossVectors(A, B).normalize();
    const pts = [p0, p1, p2];
    for (let i = 0; i < 3; i++) {
      V.copy(pts[i]).applyMatrix4(this.m);
      this.pos.push(V.x, V.y, V.z);
      V.copy(N).applyMatrix3(this.nm).normalize();
      this.nrm.push(V.x, V.y, V.z);
      this.zone.push(this.z);
      this.shade.push(shades ? shades[i] * this.sh : this.sh);
      this.seed.push(this.sd);
      this.tone.push(this.tn);
    }
    return this;
  }

  quad(p0, p1, p2, p3, shades) {
    this.tri(p0, p1, p2, shades && [shades[0], shades[1], shades[2]]);
    this.tri(p0, p2, p3, shades && [shades[0], shades[2], shades[3]]);
    return this;
  }

  /** Convex fan from an ordered ring. */
  fan(ring, flip) {
    for (let i = 1; i < ring.length - 1; i++) {
      if (flip) this.tri(ring[0], ring[i + 1], ring[i]);
      else this.tri(ring[0], ring[i], ring[i + 1]);
    }
    return this;
  }

  /** Stitch two equal-length rings into a tube wall. */
  band(a, b, shadeA = 1, shadeB = 1) {
    const n = a.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.quad(a[i], a[j], b[j], b[i], [shadeA, shadeA, shadeB, shadeB]);
    }
    return this;
  }

  // -------------------------------------------------------------------------
  // BOXES
  // -------------------------------------------------------------------------
  /** Axis-aligned box centred on x/z, sitting on y=0 unless centred. */
  box(w, h, d, opt = {}) {
    const { centreY = false, taper = 1, shadeBottom = 0.72, shadeTop = 1.06 } = opt;
    const y0 = centreY ? -h / 2 : 0, y1 = y0 + h;
    const hw = w / 2, hd = d / 2;
    const tw = hw * taper, td = hd * taper;
    const p = (x, y, z) => new THREE.Vector3(x, y, z);
    const b = [p(-hw, y0, -hd), p(hw, y0, -hd), p(hw, y0, hd), p(-hw, y0, hd)];
    const t = [p(-tw, y1, -td), p(tw, y1, -td), p(tw, y1, td), p(-tw, y1, td)];
    this.quad(b[3], b[2], b[1], b[0], [shadeBottom, shadeBottom, shadeBottom, shadeBottom]);
    this.quad(t[0], t[1], t[2], t[3], [shadeTop, shadeTop, shadeTop, shadeTop]);
    const s = [shadeBottom, shadeBottom, 1, 1];
    this.quad(b[0], b[1], t[1], t[0], s);
    this.quad(b[1], b[2], t[2], t[1], s);
    this.quad(b[2], b[3], t[3], t[2], s);
    this.quad(b[3], b[0], t[0], t[3], s);
    return this;
  }

  /**
   * Box with chamfered vertical edges and optional chamfered top/bottom.
   * This is the workhorse — it is what stops every part reading as a cube.
   */
  chamfer(w, h, d, c = 0.06, opt = {}) {
    const { centreY = false, capTop = true, capBottom = false, shadeBottom = 0.7 } = opt;
    const y0 = centreY ? -h / 2 : 0, y1 = y0 + h;
    const cy = Math.min(c, h * 0.35);
    const by = capBottom ? y0 + cy : y0;
    const ty = capTop ? y1 - cy : y1;
    const hw = w / 2, hd = d / 2;
    const cc = Math.min(c, Math.min(hw, hd) * 0.7);
    const p = (x, y, z) => new THREE.Vector3(x, y, z);

    // an octagonal ring: the four faces plus four chamfer strips
    const ring = (y, inset) => {
      const x = hw - inset, z = hd - inset;
      const xc = x - cc, zc = z - cc;
      return [
        p(-xc, y, -z), p(xc, y, -z),
        p(x, y, -zc), p(x, y, zc),
        p(xc, y, z), p(-xc, y, z),
        p(-x, y, zc), p(-x, y, -zc),
      ];
    };
    const lo = ring(by, 0), hi = ring(ty, 0);
    this.band(lo, hi, 0.82, 1.0);

    if (capBottom) {
      const b = ring(y0, cc);
      this.band(b, lo, shadeBottom, 0.82);
      this.fan(b.slice().reverse(), false);
    } else {
      this.fan(lo.slice().reverse(), false);
    }
    if (capTop) {
      const t = ring(y1, cc);
      this.band(hi, t, 1.0, 1.08);
      this.fan(t, false);
    } else {
      this.fan(hi, false);
    }
    return this;
  }

  /** Triangular prism lying along X — the roof/gable workhorse. */
  wedge(w, h, d, opt = {}) {
    const { peak = 0.5, overhang = 0 } = opt;
    const hw = w / 2 + overhang, hd = d / 2 + overhang;
    const px = (peak * 2 - 1) * hw;
    const p = (x, y, z) => new THREE.Vector3(x, y, z);
    const a = p(-hw, 0, -hd), b = p(hw, 0, -hd), c = p(hw, 0, hd), d2 = p(-hw, 0, hd);
    const r0 = p(px, h, -hd), r1 = p(px, h, hd);
    this.quad(d2, c, b, a, [0.7, 0.7, 0.7, 0.7]);
    this.tri(a, b, r0, [0.86, 0.86, 1]);
    this.tri(c, d2, r1, [0.86, 0.86, 1]);
    this.quad(b, c, r1, r0, [0.9, 0.9, 1.06, 1.06]);
    this.quad(d2, a, r0, r1, [0.9, 0.9, 1.06, 1.06]);
    return this;
  }

  // -------------------------------------------------------------------------
  // ROUND FORMS
  // -------------------------------------------------------------------------
  ringPts(y, r, seg, phase = 0, sx = 1, sz = 1) {
    const out = [];
    for (let i = 0; i < seg; i++) {
      const a = phase + (i / seg) * Math.PI * 2;
      out.push(new THREE.Vector3(Math.cos(a) * r * sx, y, Math.sin(a) * r * sz));
    }
    return out;
  }

  cylinder(r, h, seg = 8, opt = {}) {
    const { rTop = r, centreY = false, capTop = true, capBottom = true, phase = 0, chamfer = 0 } = opt;
    const y0 = centreY ? -h / 2 : 0, y1 = y0 + h;
    if (chamfer > 0) {
      const c = Math.min(chamfer, h * 0.3, r * 0.4);
      const b0 = this.ringPts(y0, r - c, seg, phase);
      const b1 = this.ringPts(y0 + c, r, seg, phase);
      const t1 = this.ringPts(y1 - c, rTop, seg, phase);
      const t0 = this.ringPts(y1, rTop - c, seg, phase);
      if (capBottom) this.fan(b0.slice().reverse(), false);
      this.band(b0, b1, 0.72, 0.86);
      this.band(b1, t1, 0.86, 1.0);
      this.band(t1, t0, 1.0, 1.08);
      if (capTop) this.fan(t0, false);
      return this;
    }
    const b = this.ringPts(y0, r, seg, phase);
    const t = this.ringPts(y1, rTop, seg, phase);
    if (capBottom) this.fan(b.slice().reverse(), false);
    this.band(b, t, 0.8, 1.02);
    if (capTop) this.fan(t, false);
    return this;
  }

  cone(r, h, seg = 8, opt = {}) {
    const { phase = 0, capBottom = true } = opt;
    const b = this.ringPts(0, r, seg, phase);
    const apex = new THREE.Vector3(0, h, 0);
    if (capBottom) this.fan(b.slice().reverse(), false);
    for (let i = 0; i < seg; i++) {
      this.tri(b[i], b[(i + 1) % seg], apex, [0.84, 0.84, 1.1]);
    }
    return this;
  }

  /** Low-poly UV sphere; rings/seg stay small on purpose. */
  sphere(r, seg = 8, rings = 5, opt = {}) {
    const { squash = 1, centreY = true } = opt;
    const cy = centreY ? 0 : r * squash;
    const levels = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const phi = t * Math.PI;
      const y = cy + Math.cos(phi) * r * squash;
      const rr = Math.sin(phi) * r;
      levels.push(rr < 1e-4 ? [new THREE.Vector3(0, y, 0)] : this.ringPts(y, rr, seg, i % 2 ? Math.PI / seg : 0));
    }
    for (let i = 0; i < rings; i++) {
      const a = levels[i], b = levels[i + 1];
      const sa = 1.06 - (i / rings) * 0.36, sb = 1.06 - ((i + 1) / rings) * 0.36;
      if (a.length === 1) { for (let j = 0; j < b.length; j++) this.tri(a[0], b[j], b[(j + 1) % b.length], [sa, sb, sb]); }
      else if (b.length === 1) { for (let j = 0; j < a.length; j++) this.tri(a[j], a[(j + 1) % a.length], b[0], [sa, sa, sb]); }
      else this.band(a, b, sa, sb);
    }
    return this;
  }

  /** Revolve a 2D profile [[r,y],...] around Y. */
  lathe(profile, seg = 8, opt = {}) {
    const { phase = 0, closeTop = false, closeBottom = false } = opt;
    const rings = profile.map(([r, y]) =>
      r < 1e-5 ? [new THREE.Vector3(0, y, 0)] : this.ringPts(y, r, seg, phase));
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i], b = rings[i + 1];
      const sa = 0.82 + (i / rings.length) * 0.26, sb = 0.82 + ((i + 1) / rings.length) * 0.26;
      if (a.length === 1) { for (let j = 0; j < b.length; j++) this.tri(a[0], b[(j + 1) % b.length], b[j], [sa, sb, sb]); }
      else if (b.length === 1) { for (let j = 0; j < a.length; j++) this.tri(a[j], a[(j + 1) % a.length], b[0], [sa, sa, sb]); }
      else this.band(a, b, sa, sb);
    }
    if (closeBottom && rings[0].length > 1) this.fan(rings[0].slice().reverse(), false);
    if (closeTop && rings[rings.length - 1].length > 1) this.fan(rings[rings.length - 1], false);
    return this;
  }

  torus(R, r, seg = 10, side = 6) {
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ring = [];
      for (let j = 0; j < side; j++) {
        const b = (j / side) * Math.PI * 2;
        const rr = R + Math.cos(b) * r;
        ring.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(b) * r, Math.sin(a) * rr));
      }
      pts.push(ring);
    }
    for (let i = 0; i < seg; i++) this.band(pts[i], pts[(i + 1) % seg], 0.9, 1.02);
    return this;
  }

  // -------------------------------------------------------------------------
  // EXTRUSION
  // -------------------------------------------------------------------------
  /** Extrude a closed 2D polygon [[x,z],...] (CCW) upward by h. */
  extrude(poly, h, opt = {}) {
    const { y0 = 0, capTop = true, capBottom = true, shadeBottom = 0.72, inset = 0 } = opt;
    const pts = inset ? insetPoly(poly, inset) : poly;
    if (pts.length < 3) return this;
    const lo = pts.map(([x, z]) => new THREE.Vector3(x, y0, z));
    const hi = pts.map(([x, z]) => new THREE.Vector3(x, y0 + h, z));
    const tri = triangulate(pts);
    if (capBottom) for (const [a, b, c] of tri) this.tri(lo[a], lo[c], lo[b], [shadeBottom, shadeBottom, shadeBottom]);
    if (capTop) for (const [a, b, c] of tri) this.tri(hi[a], hi[b], hi[c], [1.08, 1.08, 1.08]);
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      this.quad(lo[i], lo[j], hi[j], hi[i], [0.82, 0.82, 1.0, 1.0]);
    }
    return this;
  }

  // -------------------------------------------------------------------------
  // COMPOSITES used across the kit
  // -------------------------------------------------------------------------
  /** A run of slats — fences, benches, railings, crates. */
  slats(count, len, w, h, gapAxis = 'x', opt = {}) {
    const { chamferAmt = 0.012, spread = len } = opt;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const o = (t - 0.5) * (spread - w);
      this.push();
      if (gapAxis === 'x') this.translate(o, 0, 0);
      else if (gapAxis === 'z') this.translate(0, 0, o);
      else this.translate(0, o, 0);
      this.chamfer(w, h, opt.depth ?? w, chamferAmt, { capTop: true, capBottom: true, centreY: opt.centreY });
      this.pop();
    }
    return this;
  }

  /** Stepped run — stairs, seating, ziggurat roofs. */
  steps(n, totalW, totalH, totalD, opt = {}) {
    const { chamferAmt = 0.01, solid = true } = opt;
    const sh = totalH / n, sd = totalD / n;
    for (let i = 0; i < n; i++) {
      this.push();
      const y = solid ? 0 : i * sh;
      const h = solid ? (i + 1) * sh : sh;
      this.translate(0, y, totalD / 2 - sd * (i + 0.5));
      this.chamfer(totalW, h, sd, chamferAmt, { capTop: true });
      this.pop();
    }
    return this;
  }

  /** A window or door opening: recessed frame with a real inset pane. */
  opening(w, h, frame = 0.07, depth = 0.1, opt = {}) {
    const { paneZone = 2, frameZone = 1, sill = true, mullions = 0, arch = false } = opt;
    const oz = this.z;
    this.zoneOf(frameZone);
    // frame ring
    const parts = [
      [0, h / 2 - frame / 2, w, frame],
      [0, -h / 2 + frame / 2, w, frame],
      [-w / 2 + frame / 2, 0, frame, h - frame * 2],
      [w / 2 - frame / 2, 0, frame, h - frame * 2],
    ];
    for (const [x, y, fw, fh] of parts) {
      this.push();
      this.translate(x, y, 0);
      this.chamfer(fw, fh, depth, 0.012, { centreY: true, capTop: false, capBottom: false });
      this.pop();
    }
    if (arch) {
      const r = w / 2;
      this.push();
      this.translate(0, h / 2 - frame / 2, 0);
      this.rotateX(Math.PI / 2);
      const seg = 10;
      for (let i = 0; i < seg; i++) {
        const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
        this.push();
        this.translate(Math.cos((a0 + a1) / 2) * (r - frame / 2), 0, -Math.sin((a0 + a1) / 2) * (r - frame / 2));
        this.rotateY(-(a0 + a1) / 2);
        this.chamfer(frame, depth, (Math.PI * r) / seg + 0.01, 0.006, { centreY: true });
        this.pop();
      }
      this.pop();
    }
    // pane, recessed
    this.zoneOf(paneZone);
    this.push();
    this.translate(0, 0, -depth * 0.28);
    this.box(w - frame * 1.9, h - frame * 1.9, depth * 0.16, { centreY: true });
    this.pop();
    if (mullions > 0) {
      this.zoneOf(frameZone);
      for (let i = 1; i <= mullions; i++) {
        this.push();
        this.translate(-w / 2 + (w * i) / (mullions + 1), 0, -depth * 0.16);
        this.box(frame * 0.42, h - frame * 1.9, depth * 0.3, { centreY: true });
        this.pop();
      }
    }
    if (sill) {
      this.zoneOf(frameZone);
      this.push();
      this.translate(0, -h / 2 - frame * 0.2, depth * 0.18);
      this.chamfer(w + frame * 1.4, frame * 0.72, depth * 1.5, 0.012, { centreY: true });
      this.pop();
    }
    this.zoneOf(oz);
    return this;
  }

  // -------------------------------------------------------------------------
  build(name) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('zone', new THREE.Float32BufferAttribute(this.zone, 1));
    g.setAttribute('shade', new THREE.Float32BufferAttribute(this.shade, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    g.userData.name = name;
    g.userData.tris = this.pos.length / 9;
    return g;
  }

  /** Scenery variant: also ships the per-building facade seed and tone. */
  buildScenery() {
    const g = this.build();
    g.setAttribute('bseed', new THREE.Float32BufferAttribute(this.seed, 1));
    g.setAttribute('btone', new THREE.Float32BufferAttribute(this.tone, 1));
    return g;
  }

  get triCount() { return this.pos.length / 9; }
  get isEmpty() { return this.pos.length === 0; }
}

// ---------------------------------------------------------------------------
// polygon helpers
// ---------------------------------------------------------------------------
/** Ear clipping for simple polygons. */
export function triangulate(poly) {
  const n = poly.length;
  if (n < 3) return [];
  const idx = [...Array(n).keys()];
  if (signedArea(poly) < 0) idx.reverse();
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      const A2 = poly[a], B2 = poly[b], C2 = poly[c];
      const cross = (B2[0] - A2[0]) * (C2[1] - A2[1]) - (B2[1] - A2[1]) * (C2[0] - A2[0]);
      if (cross <= 0) continue;
      let ok = true;
      for (const j of idx) {
        if (j === a || j === b || j === c) continue;
        if (inTriangle(poly[j], A2, B2, C2)) { ok = false; break; }
      }
      if (!ok) continue;
      out.push([a, b, c]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

function inTriangle(p, a, b, c) {
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(d) < 1e-12) return false;
  const u = ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / d;
  const v = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / d;
  return u >= 0 && v >= 0 && u + v <= 1;
}

export function signedArea(poly) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
  }
  return s / 2;
}

/** Naive polygon inset — fine for the convex-ish shapes the kit uses. */
export function insetPoly(poly, d) {
  const n = poly.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i], a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    const n1 = norm([p[1] - a[1], a[0] - p[0]]);
    const n2 = norm([b[1] - p[1], p[0] - b[0]]);
    const bis = norm([n1[0] + n2[0], n1[1] + n2[1]]);
    const cos = bis[0] * n1[0] + bis[1] * n1[1];
    const k = cos > 0.15 ? d / cos : d;
    out.push([p[0] - bis[0] * k, p[1] - bis[1] * k]);
  }
  return out;
}
function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }

/** Rounded-rectangle outline, used for planters, ponds, rugs, pads. */
export function roundRect(w, d, r, seg = 3) {
  const hw = w / 2, hd = d / 2;
  r = Math.min(r, hw, hd);
  const pts = [];
  const corners = [[hw - r, hd - r, 0], [-hw + r, hd - r, Math.PI / 2], [-hw + r, -hd + r, Math.PI], [hw - r, -hd + r, -Math.PI / 2]];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  }
  return pts;
}

/** Irregular blob outline — ponds, flowerbeds, leaf piles. */
export function blob(radius, seg, wobble, seed = 1) {
  const pts = [];
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const r = radius * (1 - wobble / 2 + rnd() * wobble);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

export function mergeGeoms(list) {
  let pc = 0;
  for (const g of list) pc += g.getAttribute('position').count;
  const pos = new Float32Array(pc * 3), nrm = new Float32Array(pc * 3);
  const zone = new Float32Array(pc), shade = new Float32Array(pc);
  let o = 0;
  for (const g of list) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    const z = g.getAttribute('zone'), s = g.getAttribute('shade');
    pos.set(p.array, o * 3); nrm.set(n.array, o * 3);
    zone.set(z.array, o); shade.set(s.array, o);
    o += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('zone', new THREE.BufferAttribute(zone, 1));
  g.setAttribute('shade', new THREE.BufferAttribute(shade, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
