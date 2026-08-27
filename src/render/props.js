/**
 * Street furniture that belongs to the city rather than the player: the trees
 * and lampposts along the real streets, and the park canopies.
 *
 * These share the instanced part pipeline, so the lantern glass sits in zone 2
 * and lights up at night with everything else.
 */

import * as THREE from 'three';
import { MeshBuilder } from '../kit/mesh.js';

/** A tree: tapered trunk, a few boughs, clustered canopy blobs. */
export function treeGeometry(opt = {}) {
  const {
    trunkH = 2.6, trunkR = 0.19, canopyR = 1.9, clusters = 3,
    seg = 6, lift = 0.55, boughs = true,
  } = opt;
  const mb = new MeshBuilder();

  mb.zoneOf(1);
  mb.lathe([
    [trunkR * 1.5, 0], [trunkR * 1.08, trunkH * 0.14],
    [trunkR * 0.92, trunkH * 0.62], [trunkR * 0.74, trunkH],
  ], seg, { closeBottom: true });

  if (boughs) {
    for (let i = 0; i < 3; i++) {
      mb.push();
      mb.rotateY((i / 3) * Math.PI * 2 + 0.7);
      mb.translate(0, trunkH * 0.74, 0);
      mb.rotateZ(-0.72);
      mb.cylinder(trunkR * 0.45, canopyR * 0.62, 4, { rTop: trunkR * 0.22 });
      mb.pop();
    }
  }

  mb.zoneOf(0);
  const spots = [
    [0, trunkH + canopyR * lift, 0, 1.0],
    [canopyR * 0.52, trunkH + canopyR * lift * 0.52, canopyR * 0.20, 0.70],
    [-canopyR * 0.42, trunkH + canopyR * lift * 0.66, -canopyR * 0.44, 0.76],
    [canopyR * 0.10, trunkH + canopyR * lift * 1.42, -canopyR * 0.24, 0.62],
    [-canopyR * 0.30, trunkH + canopyR * lift * 1.20, canopyR * 0.40, 0.58],
  ].slice(0, clusters + 1);

  for (const [x, y, z, s] of spots) {
    mb.push();
    mb.translate(x, y, z);
    mb.sphere(canopyR * s, seg + 1, 4, { squash: 0.86 });
    mb.pop();
  }
  return mb.build('tree');
}

/** Narrow columnar street tree with a grate at its foot. */
export function streetTreeGeometry() {
  const mb = new MeshBuilder();
  mb.zoneOf(1);
  mb.push(); mb.translate(0, 0.02, 0);
  mb.cylinder(0.62, 0.06, 8, { chamfer: 0.02 }); // tree grate
  mb.pop();
  const t = treeGeometry({ trunkH: 3.4, trunkR: 0.16, canopyR: 1.55, clusters: 2, seg: 6, lift: 0.7 });
  return mergeInto(mb, t, 0.08);
}

export function parkTreeGeometry() {
  return treeGeometry({ trunkH: 2.2, trunkR: 0.24, canopyR: 2.7, clusters: 4, seg: 7, lift: 0.5 });
}

/**
 * Downtown lamppost: fluted base, tapered shaft, scrolled arm, acorn lantern.
 * The glass is zone 2, so it glows at night.
 */
export function lamppostGeometry() {
  const mb = new MeshBuilder();
  const H = 5.4;

  mb.zoneOf(1);
  // base
  mb.lathe([[0.30, 0], [0.30, 0.10], [0.24, 0.16], [0.22, 0.52], [0.26, 0.60], [0.20, 0.68]], 8, { closeBottom: true });
  // fluting
  for (let i = 0; i < 6; i++) {
    mb.push();
    mb.rotateY((i / 6) * Math.PI * 2);
    mb.translate(0.20, 0.16, 0);
    mb.box(0.05, 0.40, 0.05);
    mb.pop();
  }
  mb.zoneOf(0);
  // shaft
  mb.push(); mb.translate(0, 0.68, 0);
  mb.cylinder(0.115, H - 0.68, 8, { rTop: 0.075 });
  mb.pop();
  // collar
  mb.zoneOf(1);
  mb.push(); mb.translate(0, H * 0.52, 0);
  mb.lathe([[0.10, 0], [0.16, 0.05], [0.16, 0.12], [0.10, 0.17]], 8);
  mb.pop();

  // scrolled arm reaching out
  mb.zoneOf(0);
  const armSeg = 5, armLen = 0.95;
  for (let i = 0; i < armSeg; i++) {
    const t0 = i / armSeg, t1 = (i + 1) / armSeg;
    const a0 = (Math.PI / 2) * t0, a1 = (Math.PI / 2) * t1;
    const p0 = [Math.sin(a0) * armLen, H - armLen + Math.cos(a0) * armLen];
    const p1 = [Math.sin(a1) * armLen, H - armLen + Math.cos(a1) * armLen];
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + 0.03;
    mb.push();
    mb.translate(mx, my, 0);
    mb.rotateZ(-Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + Math.PI / 2);
    mb.cylinder(0.055, len, 5, { centreY: true });
    mb.pop();
  }

  // lantern head
  const lx = armLen, ly = H - armLen;
  mb.push();
  mb.translate(lx, ly - 0.10, 0);
  mb.zoneOf(1);
  mb.lathe([[0.07, 0], [0.15, -0.06], [0.20, -0.12]], 6);       // cap fitting
  mb.zoneOf(2);
  mb.lathe([[0.20, -0.12], [0.235, -0.30], [0.185, -0.50], [0.10, -0.60]], 6); // glass acorn
  mb.zoneOf(1);
  mb.push(); mb.translate(0, -0.62, 0);
  mb.sphere(0.055, 6, 3);
  mb.pop();
  mb.pop();

  // little finial on top
  mb.zoneOf(1);
  mb.push(); mb.translate(0, H, 0);
  mb.cone(0.085, 0.20, 6);
  mb.pop();

  return mb.build('lamppost');
}

function mergeInto(mb, geom, yOffset) {
  const base = mb.build('base');
  const merged = new MeshBuilder();
  const copy = (g, dy) => {
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    const z = g.getAttribute('zone'), s = g.getAttribute('shade');
    for (let i = 0; i < p.count; i++) {
      merged.pos.push(p.getX(i), p.getY(i) + dy, p.getZ(i));
      merged.nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      merged.zone.push(z.getX(i));
      merged.shade.push(s.getX(i));
      merged.seed.push(0); merged.tone.push(0.5);
    }
  };
  copy(base, 0);
  copy(geom, yOffset);
  return merged.build('merged');
}

/** Fixed palettes for the city's own furniture. */
export const PROP_COLORS = {
  tree:       [[0.36, 0.55, 0.30], [0.42, 0.33, 0.25], [0.36, 0.55, 0.30]],
  parkTree:   [[0.33, 0.53, 0.28], [0.40, 0.31, 0.24], [0.33, 0.53, 0.28]],
  lamp:       [[0.22, 0.24, 0.26], [0.16, 0.17, 0.19], [1.00, 0.86, 0.62]],
};

/** Instanced mesh helper carrying the three zone colours + flags. */
export function makeInstanced(geometry, material, capacity) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const c0 = new Float32Array(capacity * 3);
  const c1 = new Float32Array(capacity * 3);
  const c2 = new Float32Array(capacity * 3);
  const fl = new Float32Array(capacity);
  geometry.setAttribute('aC0', new THREE.InstancedBufferAttribute(c0, 3));
  geometry.setAttribute('aC1', new THREE.InstancedBufferAttribute(c1, 3));
  geometry.setAttribute('aC2', new THREE.InstancedBufferAttribute(c2, 3));
  geometry.setAttribute('aFlags', new THREE.InstancedBufferAttribute(fl, 1));
  mesh.userData.colors = { c0, c1, c2, fl };
  mesh.frustumCulled = false;
  return mesh;
}

export function setInstanceColors(mesh, i, zones, flags = 0) {
  const { c0, c1, c2, fl } = mesh.userData.colors;
  const arrs = [c0, c1, c2];
  for (let z = 0; z < 3; z++) {
    const col = zones[z] || zones[0];
    arrs[z][i * 3] = col[0]; arrs[z][i * 3 + 1] = col[1]; arrs[z][i * 3 + 2] = col[2];
  }
  fl[i] = flags;
}

export function flushInstanceColors(mesh) {
  const g = mesh.geometry;
  g.getAttribute('aC0').needsUpdate = true;
  g.getAttribute('aC1').needsUpdate = true;
  g.getAttribute('aC2').needsUpdate = true;
  g.getAttribute('aFlags').needsUpdate = true;
}
