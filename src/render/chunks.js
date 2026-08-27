/**
 * Chunk streaming.
 *
 * Chunks are built on demand around the camera, on a strict per-frame budget so
 * a build never lands as a hitch, and kept in an LRU so walking back over your
 * own path doesn't rebuild anything. Layout is derived from the bake, so a
 * chunk rebuilt an hour later is identical — nothing re-lays-out under the
 * player.
 */

import * as THREE from 'three';
import { buildChunk, buildWater, buildIslands, islandTrees } from './scenery.js';
import { streetTreeGeometry, parkTreeGeometry, lamppostGeometry, makeInstanced, setInstanceColors, flushInstanceColors, PROP_COLORS } from './props.js';

/**
 * Detail bands, tuned against a triangle budget rather than by eye. The whole
 * point of the bands is that a street-level view is not paying full price for
 * geometry a kilometre away that covers four pixels.
 */
export const QUALITY = {
  low:    { radius: 520,  detail: 1, budgetMs: 7,  shadows: false, cache: 40,  lod2: 140, lod1: 340, lodFar: 1100 },
  medium: { radius: 720,  detail: 2, budgetMs: 9,  shadows: true,  cache: 80,  lod2: 230, lod1: 480, lodFar: 1500 },
  high:   { radius: 1100, detail: 2, budgetMs: 12, shadows: true,  cache: 140, lod2: 380, lod1: 780, lodFar: 2200 },
};

export class ChunkManager {
  constructor(city, scene, materials, demolished) {
    this.city = city;
    this.scene = scene;
    this.mats = materials;
    this.demolished = demolished;
    this.loaded = new Map();      // ci -> { group, ... }
    this.queue = [];
    this.queued = new Set();
    this.setQuality('medium');

    this.root = new THREE.Group();
    this.root.name = 'city';
    scene.add(this.root);

    this.propGeoms = {
      tree: streetTreeGeometry(),
      parkTree: parkTreeGeometry(),
      lamp: lamppostGeometry(),
    };

    const water = buildWater(city);
    if (water) {
      this.waterMesh = new THREE.Mesh(water, materials.water);
      this.waterMesh.renderOrder = -1;
      this.root.add(this.waterMesh);
    }
    const isles = buildIslands(city);
    if (isles) {
      this.islandMesh = new THREE.Mesh(isles, materials.ground);
      this.islandMesh.receiveShadow = false;
      this.root.add(this.islandMesh);
      const trees = islandTrees(city);
      if (trees.length) {
        const geom = this.propGeoms.parkTree.clone();
        const mesh = makeInstanced(geom, materials.part, trees.length);
        const m4 = new THREE.Matrix4();
        trees.forEach((t, i) => {
          const s = 0.9 + t.r * 0.7;
          m4.compose(
            new THREE.Vector3(t.u, 0.22, -t.v),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r * 7.1),
            new THREE.Vector3(s, 0.9 + t.r * 0.6, s));
          mesh.setMatrixAt(i, m4);
          const c = PROP_COLORS.parkTree;
          setInstanceColors(mesh, i, [
            [c[0][0] * (0.88 + t.r * 0.25), c[0][1] * (0.9 + t.r * 0.2), c[0][2] * (0.88 + t.r * 0.3)],
            c[1], c[2],
          ], 0);
        });
        mesh.instanceMatrix.needsUpdate = true;
        flushInstanceColors(mesh);
        this.root.add(mesh);
      }
    }
    this.stats = { built: 0, tris: 0, visible: 0 };
  }

  setQuality(name) {
    this.q = QUALITY[name] || QUALITY.medium;
    this.qualityName = name;
  }

  /** Rebuild one chunk right now — used after a demolition. */
  invalidate(ci) {
    const rec = this.loaded.get(ci);
    if (rec) { this.disposeChunk(rec); this.loaded.delete(ci); }
    this.queued.delete(ci);
    this.buildOne(ci);
  }

  invalidateAround(rect) {
    const set = new Set();
    for (const [u, v] of [[rect.u0, rect.v0], [rect.u1, rect.v0], [rect.u0, rect.v1], [rect.u1, rect.v1]]) {
      const ci = this.city.chunkIndexAt(u, v);
      if (ci >= 0) set.add(ci);
    }
    for (const ci of set) this.invalidate(ci);
  }

  /**
   * Detail level for a chunk at distance d. Near chunks get the full massing
   * with roof plant and street furniture; far ones become plain volumes, which
   * is what makes a whole-city overview affordable at all.
   */
  lodFor(d) {
    if (d < this.q.lod2) return 2;
    if (d < this.q.lod1) return 1;
    if (d < this.q.lodFar) return 0;
    // Beyond this only the skyline is legible, so low buildings are dropped
    // entirely. It is the difference between a whole-city view costing a
    // million triangles and costing a couple of hundred thousand.
    return -1;
  }

  /**
   * @param camPos  world position of the camera
   * @param viewDist orbit distance — the overview needs a far bigger radius
   *                 than street level, or the city simply isn't there.
   */
  update(camPos, dt, viewDist = 300) {
    const city = this.city;
    const cs = city.chunkSize;
    const diag = Math.hypot(city.uSpan, city.vSpan);
    const r = Math.min(diag, Math.max(this.q.radius, viewDist * 2.1 + 260));
    const cu = Math.floor((camPos.x - city.uMin) / cs);
    const cv = Math.floor((-camPos.z - city.vMin) / cs);
    const span = Math.ceil(r / cs);
    this.radius = r;

    // --- decide what should exist, and at what detail ---
    const want = [];
    for (let dz = -span; dz <= span; dz++) {
      for (let dx = -span; dx <= span; dx++) {
        const x = cu + dx, z = cv + dz;
        if (x < 0 || z < 0 || x >= city.cu || z >= city.cv) continue;
        const ci = z * city.cu + x;
        const ox = city.uMin + (x + 0.5) * cs, oz = city.vMin + (z + 0.5) * cs;
        const d = Math.hypot(ox - camPos.x, oz - -camPos.z);
        if (d > r + cs) continue;
        want.push({ ci, d, lod: this.lodFor(d) });
      }
    }
    want.sort((a, b) => a.d - b.d);
    this.wantCount = want.length;

    for (const { ci, lod } of want) {
      const rec = this.loaded.get(ci);
      if (rec) {
        // Hysteresis: only re-detail on a clear step, never on a wobble, or
        // the world visibly rebuilds itself while the player pans.
        if (rec.lod < lod && !this.queued.has(ci)) {
          rec.wantLod = lod;
          this.queued.add(ci);
          this.queue.push(ci);
        }
        continue;
      }
      if (this.queued.has(ci)) continue;
      this.queued.add(ci);
      this.queue.push(ci);
      this.pendingLod = this.pendingLod || new Map();
      this.pendingLod.set(ci, lod);
    }

    // --- build within the frame budget ---
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < this.q.budgetMs) {
      const ci = this.queue.shift();
      this.queued.delete(ci);
      const existing = this.loaded.get(ci);
      const lod = existing ? existing.wantLod : (this.pendingLod?.get(ci) ?? 1);
      this.pendingLod?.delete(ci);
      if (existing) {
        if (existing.lod >= lod) continue;
        this.disposeChunk(existing);
        this.loaded.delete(ci);
      }
      this.buildOne(ci, lod);
    }

    // --- retire what is far away, keeping an LRU so backtracking is free ---
    const keep = r + cs * 2.5;
    const far = [];
    for (const [ci, rec] of this.loaded) {
      const ox = city.uMin + ((ci % city.cu) + 0.5) * cs;
      const oz = city.vMin + (Math.floor(ci / city.cu) + 0.5) * cs;
      const d = Math.hypot(ox - camPos.x, oz - -camPos.z);
      rec.dist = d;
      rec.group.visible = d < r + cs;
      if (d > keep) far.push(rec);
    }
    const cacheCap = Math.max(this.q.cache, want.length + 8);
    if (this.loaded.size > cacheCap) {
      far.sort((a, b) => b.dist - a.dist);
      const drop = Math.min(far.length, this.loaded.size - cacheCap);
      for (let i = 0; i < drop; i++) {
        this.disposeChunk(far[i]);
        this.loaded.delete(far[i].ci);
      }
    }
    this.stats.visible = 0;
    for (const rec of this.loaded.values()) if (rec.group.visible) this.stats.visible++;
  }

  buildOne(ci, lod = 2) {
    const city = this.city;
    lod = Math.min(lod, this.q.detail);
    if (lod < 0) lod = -1;
    const t0 = performance.now();
    const data = buildChunk(city, ci, this.demolished, lod);
    const ms = performance.now() - t0;
    this.stats.totalMs = (this.stats.totalMs || 0) + ms;
    this.stats.maxMs = Math.max(this.stats.maxMs || 0, ms);
    const g = new THREE.Group();
    g.name = `chunk${ci}`;

    const shadows = this.q.shadows && lod >= 2;
    if (data.ground) {
      const m = new THREE.Mesh(data.ground, this.mats.ground);
      m.receiveShadow = shadows;
      m.userData.pickable = 'ground';
      m.userData.chunk = ci;
      g.add(m);
    }
    if (data.buildings) {
      const m = new THREE.Mesh(data.buildings, this.mats.scenery);
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      m.userData.pickable = 'scenery';
      m.userData.chunk = ci;
      g.add(m);
    }

    if (lod >= 1) {
      for (const [kind, list] of Object.entries(data.furniture)) {
        if (!list.length) continue;
        const geomKey = kind === 'lamp' ? 'lamp' : kind === 'parkTree' ? 'parkTree' : 'tree';
        const geom = this.propGeoms[geomKey].clone();
        const mesh = makeInstanced(geom, this.mats.part, list.length);
        const mat4 = new THREE.Matrix4();
        const colors = PROP_COLORS[kind === 'lamp' ? 'lamp' : kind === 'parkTree' ? 'parkTree' : 'tree'];
        list.forEach((it, i) => {
          const s = kind === 'lamp' ? 1 : 0.78 + it.r * 0.55;
          mat4.compose(
            new THREE.Vector3(it.u, kind === 'parkTree' ? 0.11 : 0.15, -it.v),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.r * Math.PI * 2),
            new THREE.Vector3(s, kind === 'lamp' ? 1 : 0.82 + it.r * 0.5, s),
          );
          mesh.setMatrixAt(i, mat4);
          // per-instance foliage tint so a row of trees is not a stamped repeat
          const zones = colors.map((c, zi) =>
            zi === 1 ? c : [c[0] * (0.86 + it.r * 0.28), c[1] * (0.88 + it.r * 0.24), c[2] * (0.86 + it.r * 0.3)]);
          setInstanceColors(mesh, i, kind === 'lamp' ? colors : zones, kind === 'lamp' ? 1 : 0);
        });
        mesh.instanceMatrix.needsUpdate = true;
        flushInstanceColors(mesh);
        mesh.castShadow = shadows && kind !== 'lamp';
        g.add(mesh);
      }
    }

    this.root.add(g);
    this.loaded.set(ci, { ci, group: g, tris: data.tris, dist: 0, lod, wantLod: lod });
    this.stats.built++;
    return g;
  }

  disposeChunk(rec) {
    rec.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.root.remove(rec.group);
  }

  /** Everything currently in the scene that a ray should be able to hit. */
  pickTargets() {
    const out = [];
    for (const rec of this.loaded.values()) {
      if (!rec.group.visible) continue;
      for (const c of rec.group.children) {
        if (c.isMesh && !c.isInstancedMesh) out.push(c);
      }
    }
    return out;
  }

  get loadedCount() { return this.loaded.size; }
  get pendingCount() { return this.queue.length; }
}
