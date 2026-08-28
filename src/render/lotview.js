/**
 * Rendering for anything the player (or a simulated neighbour) has placed.
 *
 * Parts are instanced per type, so a lot with three hundred pieces on it is
 * still a couple of dozen draw calls. The ghost, the slot grid, the lot
 * outline and the selection ring all live here too, since they share the
 * same coordinate maths.
 */

import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { getPart, partGeometry } from '../kit/parts.js';
import { hexToRgb01 } from '../kit/colors.js';
import { lotGrid, parseSlot, slotTransform, slotValid, spanTransform, spanValid } from '../game/world.js';
import { spanGeometry } from '../kit/spans.js';
import { makeInstanced, setInstanceColors, flushInstanceColors } from './props.js';
import { makeOverlayMaterial } from './materials.js';

const U = CONFIG.grid.unit;
const SH = CONFIG.grid.storeyHeight;

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

/** Deterministic per-slot jitter so a row of trees is not a stamped repeat. */
function jitterFor(key, part) {
  if (!part.vary) return { scale: 1, spin: 0 };
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  const a = ((h >>> 0) % 1000) / 1000;
  const b = ((h >>> 10) % 1000) / 1000;
  return { scale: 0.86 + a * 0.30, spin: b * Math.PI * 2 };
}

export class LotView {
  constructor(scene, material, city) {
    this.scene = scene;
    this.material = material;
    this.city = city;
    this.group = new THREE.Group();
    this.group.name = 'placed';
    scene.add(this.group);
    this.pools = new Map();     // partId -> { mesh, capacity }
    this.entries = [];          // { key, lotId, partId, index }
    this.castShadow = true;
  }

  clear() {
    for (const { mesh } of this.pools.values()) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.pools.clear();
    this.entries = [];
  }

  /**
   * Rebuild every instance from a list of lots. Cheap enough to run whole
   * rather than diff: a lot is hundreds of parts, not thousands.
   */
  sync(lots) {
    const byPart = new Map();
    for (const lot of lots) {
      const parcel = lot.parcel || this.city.parcelById(lot.parcelId);
      if (!parcel) continue;
      const g = lotGrid(parcel);
      for (const [key, rec] of Object.entries(lot.parts || {})) {
        const part = getPart(rec.part);
        if (!part) continue;
        const slot = parseSlot(key);
        // A span (the roof) covers w x d cells and is keyed by its size and
        // shape, so each distinct roof gets its own generated mesh and
        // identical ones still share an instanced draw.
        const isSpan = !!rec.w;
        if (isSpan ? !spanValid(g, slot, rec.w, rec.d) : !slotValid(g, slot)) continue;
        const t = isSpan ? spanTransform(g, slot, rec.w, rec.d) : slotTransform(g, slot);
        const poolKey = isSpan ? `${rec.part}|${rec.w}x${rec.d}|${rec.style || 'gable'}` : rec.part;
        let list = byPart.get(poolKey);
        if (!list) { list = []; byPart.set(poolKey, list); }
        list.push({ key, lotId: lot.parcelId, rec, part, t, g, isSpan });
      }
    }

    // retire pools no longer needed
    for (const [id, pool] of this.pools) {
      if (!byPart.has(id)) {
        this.group.remove(pool.mesh);
        pool.mesh.geometry.dispose();
        this.pools.delete(id);
      }
    }

    this.entries = [];
    for (const [poolKey, list] of byPart) {
      const first = list[0];
      const partId = first.rec.part;
      const geom = first.isSpan
        ? spanGeometry(partId, first.rec.w, first.rec.d, first.rec.style)
        : partGeometry(partId);
      if (!geom) continue;
      let pool = this.pools.get(poolKey);
      if (!pool || pool.capacity < list.length) {
        if (pool) { this.group.remove(pool.mesh); pool.mesh.geometry.dispose(); }
        const capacity = Math.max(8, Math.ceil(list.length * 1.5));
        const mesh = makeInstanced(geom.clone(), this.material, capacity);
        mesh.castShadow = this.castShadow;
        mesh.receiveShadow = true;
        mesh.userData.partId = partId;
        this.group.add(mesh);
        pool = { mesh, capacity };
        this.pools.set(poolKey, pool);
      }
      const { mesh } = pool;
      list.forEach((it, i) => {
        const part = it.part;
        const j = it.isSpan ? { scale: 1, spin: 0 } : jitterFor(it.key, part);
        const rot = it.t.rot + (it.rec.rot || 0) * (Math.PI / 2) + (it.rec.free || 0) + j.spin;
        _q.setFromAxisAngle(_up, rot);
        _v.set(it.t.u, it.t.y, -it.t.v);
        _s.set(j.scale, j.scale, j.scale);
        _m4.compose(_v, _q, _s);
        mesh.setMatrixAt(i, _m4);
        const cols = (it.rec.colors || []).map(hexToRgb01);
        setInstanceColors(mesh, i, cols.length ? cols : [[1, 1, 1]], part.glows ? 1 : 0);
        this.entries.push({ key: it.key, lotId: it.lotId, partId, index: i, u: it.t.u, v: it.t.v, y: it.t.y, span: it.isSpan ? { w: it.rec.w, d: it.rec.d } : null });
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      flushInstanceColors(mesh);
    }
  }

  /** Nearest placed part to a world point, for tap-to-select. */
  pickNearest(u, v, y, maxDist = 2.2) {
    let best = null, bd = maxDist * maxDist;
    for (const e of this.entries) {
      const d = (e.u - u) ** 2 + (e.v - v) ** 2 + ((e.y - y) * 0.5) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}

// ---------------------------------------------------------------------------
// GHOST — the held part previewed in the snapped slot
// ---------------------------------------------------------------------------
export class Ghost {
  constructor(scene, material) {
    this.scene = scene;
    this.material = material;
    this.mesh = null;
    this.partId = null;
    this.group = new THREE.Group();
    scene.add(this.group);

    // A validity ring under the ghost. Colour alone is never the signal —
    // the ring changes shape too, and the HUD carries a label.
    const ringGeom = new THREE.RingGeometry(U * 0.40, U * 0.50, 4, 1);
    this.okRing = new THREE.Mesh(ringGeom, makeOverlayMaterial(0x64e6c8, 0.85));
    this.badRing = new THREE.Mesh(new THREE.RingGeometry(U * 0.30, U * 0.52, 4, 1), makeOverlayMaterial(0xff6b6b, 0.9));
    for (const r of [this.okRing, this.badRing]) {
      r.rotation.x = -Math.PI / 2;
      r.rotation.z = Math.PI / 4;
      r.visible = false;
      this.group.add(r);
    }
    this.visible = false;
  }

  set(partId, transform, valid, rot = 0) {
    const part = getPart(partId);
    if (!part) { this.hide(); return; }
    if (this.partId !== partId) {
      if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); }
      const geom = partGeometry(partId).clone();
      this.mesh = makeInstanced(geom, this.material, 1);
      this.mesh.castShadow = false;
      this.group.add(this.mesh);
      this.partId = partId;
    }
    const angle = transform.rot + rot * (Math.PI / 2);
    _q.setFromAxisAngle(_up, angle);
    _v.set(transform.u, transform.y, -transform.v);
    _s.set(1, 1, 1);
    _m4.compose(_v, _q, _s);
    this.mesh.setMatrixAt(0, _m4);
    setInstanceColors(this.mesh, 0, valid ? [[0.55, 1, 0.85]] : [[1, 0.42, 0.42]], 0);
    this.mesh.instanceMatrix.needsUpdate = true;
    flushInstanceColors(this.mesh);
    this.mesh.count = 1;
    this.mesh.visible = true;

    this.okRing.visible = valid;
    this.badRing.visible = !valid;
    for (const r of [this.okRing, this.badRing]) {
      r.position.set(transform.u, transform.y + 0.06, -transform.v);
    }
    this.visible = true;
  }

  hide() {
    if (this.mesh) this.mesh.visible = false;
    this.okRing.visible = false;
    this.badRing.visible = false;
    this.visible = false;
  }
}

// ---------------------------------------------------------------------------
// GRID + OUTLINES
// ---------------------------------------------------------------------------
export class LotOverlay {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.renderOrder = 6;
    scene.add(this.group);
    this.gridMat = makeOverlayMaterial(0xffffff, 0.20);
    this.outlineMat = makeOverlayMaterial(0x7fffd8, 0.85);
    this.selMat = makeOverlayMaterial(0xffe66d, 0.95);
    this.gridMesh = null;
    this.outlineMesh = null;
    this.selMesh = null;
    this.showGrid = true;
  }

  /** Slot grid for the storey being edited, plus the lot boundary. */
  set(parcel, storey, showGrid) {
    this.clearGrid();
    if (!parcel) return;
    const g = lotGrid(parcel);
    const y = storey * SH + 0.05;

    if (showGrid) {
      const verts = [];
      const line = (u0, v0, u1, v1, w) => {
        const dx = u1 - u0, dz = v1 - v0;
        const len = Math.hypot(dx, dz);
        const nx = (-dz / len) * w, nz = (dx / len) * w;
        const a = [u0 + nx, -(v0 + nz)], b = [u1 + nx, -(v1 + nz)];
        const c = [u1 - nx, -(v1 - nz)], d = [u0 - nx, -(v0 - nz)];
        verts.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1]);
        verts.push(a[0], y, a[1], c[0], y, c[1], d[0], y, d[1]);
      };
      for (let i = 0; i <= g.cols; i++) line(g.ou + i * U, g.ov, g.ou + i * U, g.ov + g.rows * U, 0.035);
      for (let j = 0; j <= g.rows; j++) line(g.ou, g.ov + j * U, g.ou + g.cols * U, g.ov + j * U, 0.035);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      this.gridMesh = new THREE.Mesh(geom, this.gridMat);
      this.group.add(this.gridMesh);
    }

    this.outlineMesh = new THREE.Mesh(outlineGeometry(parcel, 0.16, 0.06), this.outlineMat);
    this.group.add(this.outlineMesh);
  }

  /** Highlight one slot — used by select, move and the context menu. */
  select(parcel, key, rec) {
    if (this.selMesh) { this.group.remove(this.selMesh); this.selMesh.geometry.dispose(); this.selMesh = null; }
    if (!parcel || !key) return;
    const g = lotGrid(parcel);
    const s = parseSlot(key);
    if (rec && rec.w) {
      // a span is outlined around its whole footprint, so you can see what a
      // resize is about to change
      const t = spanTransform(g, s, rec.w, rec.d);
      const geom = outlineGeometry({
        u0: t.u - (rec.w * U) / 2, v0: t.v - (rec.d * U) / 2,
        u1: t.u + (rec.w * U) / 2, v1: t.v + (rec.d * U) / 2,
      }, 0.13, t.y + 0.09);
      this.selMesh = new THREE.Mesh(geom, this.selMat);
      this.group.add(this.selMesh);
      return;
    }
    const t = slotTransform(g, s);
    const r = s.kind === 'c' ? U * 0.5 : U * 0.30;
    const geom = new THREE.RingGeometry(r * 0.80, r, 4, 1);
    this.selMesh = new THREE.Mesh(geom, this.selMat);
    this.selMesh.rotation.x = -Math.PI / 2;
    this.selMesh.rotation.z = Math.PI / 4;
    this.selMesh.position.set(t.u, t.y + 0.08, -t.v);
    this.group.add(this.selMesh);
  }

  /**
   * Drag handles on the four sides of a span. Returns their world positions so
   * the input layer can hit-test them in screen space — dragging one is how
   * the player sizes a roof to their building.
   */
  spanHandles(parcel, key, rec) {
    for (const h of this._handles || []) { this.group.remove(h); h.geometry.dispose(); }
    this._handles = [];
    if (!parcel || !rec || !rec.w) return [];
    const g = lotGrid(parcel);
    const s = parseSlot(key);
    const y = s.storey * SH + 0.45;
    const cu = g.ou + (s.i + rec.w / 2) * U;
    const cv = g.ov + (s.j + rec.d / 2) * U;
    const spots = [
      { side: 0, u: cu, v: g.ov + s.j * U },
      { side: 1, u: cu, v: g.ov + (s.j + rec.d) * U },
      { side: 2, u: g.ou + s.i * U, v: cv },
      { side: 3, u: g.ou + (s.i + rec.w) * U, v: cv },
    ];
    for (const sp of spots) {
      const geom = new THREE.RingGeometry(U * 0.16, U * 0.30, 4, 1);
      const m = new THREE.Mesh(geom, this.selMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.PI / 4;
      m.position.set(sp.u, y, -sp.v);
      m.renderOrder = 8;
      this.group.add(m);
      this._handles.push(m);
      sp.y = y;
    }
    return spots;
  }

  clearHandles() {
    for (const h of this._handles || []) { this.group.remove(h); h.geometry.dispose(); }
    this._handles = [];
  }

  clearGrid() {
    for (const m of [this.gridMesh, this.outlineMesh]) {
      if (m) { this.group.remove(m); m.geometry.dispose(); }
    }
    this.gridMesh = null; this.outlineMesh = null;
  }

  clear() {
    this.clearGrid();
    this.clearHandles();
    if (this.selMesh) { this.group.remove(this.selMesh); this.selMesh.geometry.dispose(); this.selMesh = null; }
  }
}

/** A flat ring following a parcel rectangle. */
export function outlineGeometry(rect, width = 0.14, y = 0.05) {
  const { u0, v0, u1, v1 } = rect;
  const verts = [];
  const seg = (au, av, bu, bv) => {
    const dx = bu - au, dz = bv - av;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * width, nz = (dx / len) * width;
    const p = [
      [au + nx, -(av + nz)], [bu + nx, -(bv + nz)],
      [bu - nx, -(bv - nz)], [au - nx, -(av - nz)],
    ];
    verts.push(p[0][0], y, p[0][1], p[1][0], y, p[1][1], p[2][0], y, p[2][1]);
    verts.push(p[0][0], y, p[0][1], p[2][0], y, p[2][1], p[3][0], y, p[3][1]);
  };
  seg(u0, v0, u1, v0); seg(u1, v0, u1, v1);
  seg(u1, v1, u0, v1); seg(u0, v1, u0, v0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return g;
}

/**
 * Property borders for every parcel in view — the toggleable overlay.
 * Built lazily around the camera, and only while the setting is on.
 */
export class BorderOverlay {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.mat = makeOverlayMaterial(0xffffff, 0.30);
    this.built = new Map();
  }

  setVisible(v) { this.group.visible = v; }

  update(u, v, radius = 220) {
    if (!this.group.visible) return;
    const city = this.city;
    const ci = city.chunkIndexAt(u, v);
    if (ci < 0) return;
    const cx = ci % city.cu, cz = Math.floor(ci / city.cu);
    const want = new Set();
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= city.cu || z >= city.cv) continue;
        want.add(z * city.cu + x);
      }
    }
    for (const [key, mesh] of this.built) {
      if (!want.has(key)) { this.group.remove(mesh); mesh.geometry.dispose(); this.built.delete(key); }
    }
    for (const key of want) {
      if (this.built.has(key)) continue;
      const verts = [];
      for (const p of city.chunks[key]) {
        const g = outlineGeometry(p, 0.10, 0.055).getAttribute('position');
        for (let i = 0; i < g.count; i++) verts.push(g.getX(i), g.getY(i), g.getZ(i));
      }
      if (!verts.length) { this.built.set(key, new THREE.Group()); continue; }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      const mesh = new THREE.Mesh(geom, this.mat);
      this.group.add(mesh);
      this.built.set(key, mesh);
    }
  }
}
