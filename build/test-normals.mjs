/**
 * Winding audit for the mesh builder and the whole part kit.
 *
 * Flat shading takes the face normal straight from the winding order, so a
 * face wound the wrong way is lit as though the light were behind it. It does
 * not disappear or throw — it just goes dull — which is exactly the kind of
 * defect that survives every other test and every screenshot.
 *
 * Two checks, both exact:
 *
 *  1. Signed volume. For a closed mesh wound consistently outward,
 *     V = 1/6 * sum over triangles of dot(a, cross(b, c)) is positive. If the
 *     surface is inside out V comes back negative. This is the definition, not
 *     a heuristic.
 *
 *  2. Ray parity. For a sample of faces, cast a ray along the face normal from
 *     just outside the face and count crossings with the rest of the mesh. An
 *     outward normal on a closed surface must cross an even number of times.
 *     This catches a mesh whose faces are individually inconsistent but whose
 *     volume happens to come out positive.
 *
 * Run: node build/test-normals.mjs
 */

import { MeshBuilder } from '../src/kit/mesh.js';
import { allParts, partGeometry } from '../src/kit/parts.js';
import '../src/kit/decor.js';
import { spanGeometry, spanStyles } from '../src/kit/spans.js';

let pass = 0, fail = 0;
const failures = [];
function rec(name, ok, detail = '') {
  if (ok) { pass++; console.log(`PASS  ${name}${detail ? `  — ${detail}` : ''}`); }
  else { fail++; failures.push(name); console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ''}`); }
}

/** Signed volume; positive when the surface is wound outward. */
function signedVolume(g) {
  const p = g.getAttribute('position');
  let v = 0;
  for (let t = 0; t < p.count; t += 3) {
    const ax = p.getX(t), ay = p.getY(t), az = p.getZ(t);
    const bx = p.getX(t + 1), by = p.getY(t + 1), bz = p.getZ(t + 1);
    const cx = p.getX(t + 2), cy = p.getY(t + 2), cz = p.getZ(t + 2);
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

/** Every edge shared by exactly two triangles — i.e. the mesh is closed. */
function openEdges(g) {
  const p = g.getAttribute('position');
  const edges = new Map();
  const k = (i) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  for (let t = 0; t < p.count; t += 3) {
    const v = [k(t), k(t + 1), k(t + 2)];
    for (let e = 0; e < 3; e++) {
      const key = [v[e], v[(e + 1) % 3]].sort().join('|');
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  let open = 0;
  for (const n of edges.values()) if (n !== 2) open++;
  return open;
}

/**
 * Crossings of a ray with the mesh, Moller-Trumbore. Used to prove a normal
 * points out: leave the surface along it and you must cross an even number of
 * remaining faces before you are clear of the solid.
 */
function rayCrossings(g, ox, oy, oz, dx, dy, dz, skipTri) {
  const p = g.getAttribute('position');
  let hits = 0;
  for (let t = 0; t < p.count; t += 3) {
    if (t === skipTri) continue;
    const ax = p.getX(t), ay = p.getY(t), az = p.getZ(t);
    const e1x = p.getX(t + 1) - ax, e1y = p.getY(t + 1) - ay, e1z = p.getZ(t + 1) - az;
    const e2x = p.getX(t + 2) - ax, e2y = p.getY(t + 2) - ay, e2z = p.getZ(t + 2) - az;
    const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(det) < 1e-9) continue;
    const inv = 1 / det;
    const sx = ox - ax, sy = oy - ay, sz = oz - az;
    const u = (sx * hx + sy * hy + sz * hz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (dist > 1e-5) hits++;
  }
  return hits;
}

/** Sample faces and check each normal escapes the solid. */
function outwardFraction(g, samples = 40) {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const tris = p.count / 3;
  const step = Math.max(1, Math.floor(tris / samples));
  let good = 0, tested = 0;
  for (let i = 0; i < tris; i += step) {
    const t = i * 3;
    const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
    const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
    const cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
    const nx = n.getX(t), ny = n.getY(t), nz = n.getZ(t);
    const len = Math.hypot(nx, ny, nz);
    if (len < 0.5) continue;
    const e = 1e-4;
    const hits = rayCrossings(g, cx + nx * e, cy + ny * e, cz + nz * e, nx, ny, nz, t);
    tested++;
    if (hits % 2 === 0) good++;
  }
  return { good, tested };
}

// ---------------------------------------------------------------------------
console.log('--- primitives ---');
const prims = {
  'box': (mb) => mb.box(1, 1.4, 0.8),
  'box tapered': (mb) => mb.box(1, 1, 1, { taper: 0.6 }),
  'chamfer': (mb) => mb.chamfer(1, 1.4, 0.8, 0.1),
  'chamfer capBottom': (mb) => mb.chamfer(1, 1, 1, 0.1, { capBottom: true }),
  'chamfer centreY': (mb) => mb.chamfer(1, 0.4, 1, 0.05, { centreY: true }),
  'cylinder': (mb) => mb.cylinder(0.5, 1.2, 10),
  'cylinder chamfered': (mb) => mb.cylinder(0.5, 1.2, 10, { chamfer: 0.08 }),
  'cylinder tapered': (mb) => mb.cylinder(0.5, 1.2, 10, { rTop: 0.25 }),
  'cone': (mb) => mb.cone(0.5, 1.0, 9),
  'sphere': (mb) => mb.sphere(0.6, 8, 5),
  'wedge': (mb) => mb.wedge(1.2, 0.7, 0.9),
  'extrude': (mb) => mb.extrude([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], 0.6),
  'extrude triangle': (mb) => mb.extrude([[-0.5, -0.4], [0.5, -0.4], [0, 0.5]], 0.4),
  'lathe': (mb) => mb.lathe([[0.0, 0], [0.35, 0.1], [0.2, 0.5], [0.3, 0.8], [0.0, 0.95]], 10),
  'torus': (mb) => mb.torus(0.5, 0.14, 12, 7),
};

for (const [name, fn] of Object.entries(prims)) {
  const mb = new MeshBuilder();
  fn(mb);
  const g = mb.build(name);
  const vol = signedVolume(g);
  const open = openEdges(g);
  const out = outwardFraction(g);
  rec(`${name}: wound outward`, vol > 0, `volume ${vol.toFixed(4)}`);
  if (open === 0) {
    rec(`${name}: every normal escapes the solid`, out.good === out.tested,
      `${out.good}/${out.tested} faces`);
  } else {
    rec(`${name}: closed`, false, `${open} open edges`);
  }
}

/**
 * Look at the part from outside and check that what you see is facing you.
 *
 * Signed volume only means anything for a closed solid, and half the kit is
 * deliberately not one — a string of lights, a rug, a hammock. This works for
 * any mesh, and it is the property that actually decides how the thing looks:
 * fire a ray in from outside, take the first triangle it meets, and require
 * that triangle's normal to point back at the ray. If it points away, that is
 * a surface lit from behind — the defect, exactly as a player would meet it.
 */
function firstHitsFaceViewer(g, dirs, closed) {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  g.computeBoundingSphere();
  const bs = g.boundingSphere;
  const R = bs.radius * 3 + 1;
  let facing = 0, away = 0, missed = 0;

  for (const [dx0, dy0, dz0] of dirs) {
    const L = Math.hypot(dx0, dy0, dz0);
    const dx = -dx0 / L, dy = -dy0 / L, dz = -dz0 / L;   // pointing inward
    const ox = bs.center.x + (dx0 / L) * R;
    const oy = bs.center.y + (dy0 / L) * R;
    const oz = bs.center.z + (dz0 / L) * R;

    let best = Infinity, bestTri = -1, second = Infinity, crossings = 0, bestEdge = 1;
    for (let t = 0; t < p.count; t += 3) {
      const ax = p.getX(t), ay = p.getY(t), az = p.getZ(t);
      const e1x = p.getX(t + 1) - ax, e1y = p.getY(t + 1) - ay, e1z = p.getZ(t + 1) - az;
      const e2x = p.getX(t + 2) - ax, e2y = p.getY(t + 2) - ay, e2z = p.getZ(t + 2) - az;
      const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
      const det = e1x * hx + e1y * hy + e1z * hz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const sx = ox - ax, sy = oy - ay, sz = oz - az;
      const u = (sx * hx + sy * hy + sz * hz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (dist > 1e-4) {
        crossings++;
        // how far inside the triangle the ray landed; ~0 means it clipped the rim
        const edge = Math.min(u, v, 1 - u - v);
        if (dist < best) { second = best; best = dist; bestTri = t; bestEdge = edge; }
        else if (dist < second) { second = dist; }
      }
    }
    if (bestTri < 0) { missed++; continue; }
    // A ray through a closed solid crosses its surface an even number of
    // times. An odd count means it clipped a silhouette edge and the hit it
    // reported is a floating-point coin toss, not a fact about the model.
    if (closed && crossings % 2 === 1) { missed++; continue; }
    // A hit right on a triangle's rim is a silhouette graze: whether it
    // registers at all is floating point, so it decides nothing.
    if (bestEdge < 2e-3) { missed++; continue; }
    // Two surfaces at the same depth: which one the ray meets "first" is
    // arbitrary, and the renderer settles it on depth precision rather than on
    // winding. The sample says nothing about whether the model is right.
    if (second - best < 1e-3) { missed++; continue; }
    const nx = n.getX(bestTri), ny = n.getY(bestTri), nz = n.getZ(bestTri);
    const towardViewer = -(nx * dx + ny * dy + nz * dz);
    if (towardViewer > 0.08) facing++;
    else if (towardViewer < -0.08) away++;
  }
  return { facing, away, missed };
}

/**
 * Viewing directions: the corners, edges and faces of a cube, plus a few from
 * above — each nudged off the exact axis.
 *
 * The nudge matters. Much of the kit is built on 45 degree and axis-aligned
 * planes, so a ray fired exactly down a diagonal lands precisely on an edge or
 * runs along a face, and whether it registers a hit at all comes down to
 * floating point. Those samples say nothing about the model. Offsetting each
 * direction by an irrational-looking fraction of a degree keeps every ray in
 * general position while still looking at the part from all round.
 */
const DIRS = [];
let nudge = 0;
const off = () => ((nudge = (nudge * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 0.11;
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
  if (x || y || z) DIRS.push([x + off(), y + off(), z + off()]);
}
DIRS.push([0.4, 1, 0.3], [-0.43, 1, -0.31], [1, 0.35, 0.21], [-0.23, 0.31, 1]);

// ---------------------------------------------------------------------------
console.log('\n--- the kit ---');
const kitBad = [];
for (const part of allParts()) {
  const g = part.span ? spanGeometry(part.id, 2, 2, part.style) : partGeometry(part.id);
  if (!g) { kitBad.push(`${part.id}: no geometry`); continue; }
  const r = firstHitsFaceViewer(g, DIRS, openEdges(g) === 0);
  if (r.away > 0) kitBad.push(`${part.id} (${r.away}/${r.facing + r.away} away)`);
}
rec('Kit: every visible surface faces the viewer', kitBad.length === 0,
  kitBad.length ? kitBad.slice(0, 12).join(', ') : `${allParts().length} parts, ${DIRS.length} views each`);

// closed parts additionally get the exact test
const closedBad = [];
let closedCount = 0;
for (const part of allParts()) {
  const g = part.span ? spanGeometry(part.id, 2, 2, part.style) : partGeometry(part.id);
  if (!g || openEdges(g) !== 0) continue;
  closedCount++;
  if (!(signedVolume(g) > 0)) closedBad.push(`${part.id} (${signedVolume(g).toFixed(4)})`);
}
rec('Kit: every closed part encloses positive volume', closedBad.length === 0,
  closedBad.length ? closedBad.join(', ') : `${closedCount} closed parts`);

// ---------------------------------------------------------------------------
console.log('\n--- spans, every style and size ---');
const spanBad = [];
let spanCases = 0;
for (const part of allParts().filter((p) => p.span)) {
  for (const st of spanStyles(part.id)) {
    for (const [w, d] of [[1, 1], [3, 1], [1, 3], [4, 3], [8, 8]]) {
      const g = spanGeometry(part.id, w, d, st);
      spanCases++;
      const r = firstHitsFaceViewer(g, DIRS, openEdges(g) === 0);
      if (r.away > 0) spanBad.push(`${part.id}/${st} ${w}x${d} (${r.away} away)`);
    }
  }
}
rec('Spans: every style and size faces the viewer', spanBad.length === 0,
  spanBad.length ? spanBad.slice(0, 8).join(', ') : `${spanCases} cases`);

console.log(`\n${pass}/${pass + fail} checks passed`);
if (fail) { console.log('failed:', failures.join(', ')); process.exit(1); }
