/**
 * The player character: built from swappable parts, every part colourable.
 *
 * Unlike the placeable kit these are not instanced — there is one of you —
 * so the zones are baked straight into a vertex colour attribute, which lets
 * the avatar carry six colours instead of three.
 */

import * as THREE from 'three';
import { MeshBuilder } from './mesh.js';

export const AVATAR_ZONES = ['skin', 'hair', 'top', 'legs', 'shoes', 'hat'];
const Z = { SKIN: 0, HAIR: 1, TOP: 2, LEGS: 3, SHOES: 4, HAT: 5 };

export const BODY_NAMES = ['Round', 'Tall', 'Stout'];
export const HEAD_NAMES = ['Soft', 'Wide', 'Narrow'];
export const HAIR_NAMES = ['Crop', 'Bob', 'Bun', 'Curls', 'Long', 'Shaved'];
export const HAT_NAMES = ['None', 'Cap', 'Beanie', 'Wide brim', 'Hard hat'];
export const FACE_NAMES = ['Content', 'Bright', 'Focused'];

const BODY = [
  { h: 0.62, r: 0.27, taper: 0.86 },
  { h: 0.74, r: 0.23, taper: 0.92 },
  { h: 0.54, r: 0.31, taper: 0.80 },
];
const HEAD = [
  { r: 0.25, squash: 1.02, w: 1.0 },
  { r: 0.26, squash: 0.92, w: 1.12 },
  { r: 0.23, squash: 1.12, w: 0.92 },
];

/** @returns THREE.BufferGeometry with a vertex colour per avatar zone. */
export function buildAvatarGeometry(avatar) {
  const mb = new MeshBuilder();
  const body = BODY[avatar.body % BODY.length];
  const head = HEAD[avatar.head % HEAD.length];

  const legY = 0.34;
  // --- legs + shoes ---
  mb.zoneOf(Z.LEGS);
  for (const sx of [-1, 1]) {
    mb.push();
    mb.translate(sx * 0.105, 0.10, 0);
    mb.lathe([[0.085, 0], [0.095, 0.06], [0.088, legY - 0.04], [0.10, legY]], 7, { closeBottom: true });
    mb.pop();
  }
  mb.zoneOf(Z.SHOES);
  for (const sx of [-1, 1]) {
    mb.push();
    mb.translate(sx * 0.105, 0.0, 0.03);
    mb.chamfer(0.17, 0.11, 0.26, 0.035);
    mb.pop();
  }

  // --- torso ---
  mb.zoneOf(Z.TOP);
  mb.push();
  mb.translate(0, legY + 0.06, 0);
  mb.lathe([
    [body.r * 0.86, 0], [body.r, body.h * 0.20], [body.r * 0.99, body.h * 0.62],
    [body.r * body.taper, body.h * 0.92], [body.r * body.taper * 0.72, body.h],
  ], 9, { closeBottom: true });
  // collar
  mb.push(); mb.translate(0, body.h, 0);
  mb.lathe([[body.r * body.taper * 0.74, 0], [body.r * body.taper * 0.60, 0.045]], 9);
  mb.pop();
  mb.pop();

  const shoulderY = legY + 0.06 + body.h;

  // --- arms ---
  mb.zoneOf(Z.TOP);
  for (const sx of [-1, 1]) {
    mb.push();
    mb.translate(sx * (body.r * body.taper + 0.03), shoulderY - 0.07, 0);
    mb.rotateZ(sx * 0.20);
    mb.lathe([[0.085, 0], [0.075, -0.10], [0.068, -0.34]], 6, { closeTop: true });
    mb.pop();
  }
  mb.zoneOf(Z.SKIN);
  for (const sx of [-1, 1]) {
    mb.push();
    mb.translate(sx * (body.r * body.taper + 0.03 + Math.sin(0.20) * 0.34), shoulderY - 0.41, 0);
    mb.sphere(0.075, 6, 4);
    mb.pop();
  }

  // --- neck + head ---
  mb.zoneOf(Z.SKIN);
  mb.push();
  mb.translate(0, shoulderY, 0);
  mb.cylinder(0.075, 0.06, 7);
  mb.pop();

  const headY = shoulderY + 0.06 + head.r * head.squash;
  mb.push();
  mb.translate(0, headY, 0);
  mb.scale(head.w, 1, 1);
  mb.sphere(head.r, 9, 6, { squash: head.squash });
  mb.pop();

  // ears
  for (const sx of [-1, 1]) {
    mb.push();
    mb.translate(sx * head.r * head.w * 0.96, headY, 0);
    mb.sphere(0.045, 5, 3, { squash: 1.3 });
    mb.pop();
  }

  // --- face ---
  const fz = head.r * 0.95;
  const eyeY = headY + head.r * 0.10;
  mb.zoneOf(Z.HAIR); // eyes/brows read as hair colour, which keeps them legible
  for (const sx of [-1, 1]) {
    mb.push();
    mb.translate(sx * head.r * 0.38 * head.w, eyeY, fz);
    if (avatar.face % 3 === 2) {
      mb.chamfer(0.055, 0.018, 0.03, 0.006, { centreY: true }); // focused: a line
    } else {
      mb.sphere(avatar.face % 3 === 1 ? 0.040 : 0.033, 6, 4, { squash: 1.1 });
    }
    mb.pop();
    // brow
    mb.push();
    mb.translate(sx * head.r * 0.38 * head.w, eyeY + 0.075, fz * 0.96);
    mb.rotateZ(sx * (avatar.face % 3 === 2 ? -0.24 : 0.10));
    mb.chamfer(0.070, 0.016, 0.02, 0.005, { centreY: true });
    mb.pop();
  }
  // mouth
  mb.push();
  mb.translate(0, headY - head.r * 0.34, fz * 0.94);
  if (avatar.face % 3 === 1) {
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.15 + 0.7 * (i / 4));
      mb.push();
      mb.translate(Math.cos(a) * 0.055, -Math.sin(a) * 0.022, 0);
      mb.sphere(0.014, 4, 3);
      mb.pop();
    }
  } else {
    mb.chamfer(0.070, 0.016, 0.02, 0.005, { centreY: true });
  }
  mb.pop();

  // --- hair ---
  mb.zoneOf(Z.HAIR);
  const hair = avatar.hair % HAIR_NAMES.length;
  if (hair !== 5) {
    mb.push();
    mb.translate(0, headY, 0);
    mb.scale(head.w, 1, 1);
    // cap of hair over the crown
    mb.push();
    mb.translate(0, head.r * 0.12, 0);
    mb.lathe([
      [head.r * 1.06, -head.r * 0.30], [head.r * 1.08, head.r * 0.16],
      [head.r * 0.86, head.r * 0.66], [head.r * 0.40, head.r * 0.94], [0, head.r * 1.02],
    ], 10);
    mb.pop();
    if (hair === 1) { // bob
      for (const sx of [-1, 1]) {
        mb.push();
        mb.translate(sx * head.r * 0.92, -head.r * 0.30, -head.r * 0.05);
        mb.sphere(head.r * 0.40, 6, 4, { squash: 1.5 });
        mb.pop();
      }
    } else if (hair === 2) { // bun
      mb.push();
      mb.translate(0, head.r * 1.02, -head.r * 0.55);
      mb.sphere(head.r * 0.42, 7, 5);
      mb.pop();
    } else if (hair === 3) { // curls
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        mb.push();
        mb.translate(Math.cos(a) * head.r * 0.82, head.r * (0.45 + (i % 3) * 0.16), Math.sin(a) * head.r * 0.82);
        mb.sphere(head.r * 0.34, 6, 4);
        mb.pop();
      }
    } else if (hair === 4) { // long
      mb.push();
      mb.translate(0, -head.r * 0.55, -head.r * 0.34);
      mb.lathe([[head.r * 0.95, head.r * 0.85], [head.r * 0.86, 0], [head.r * 0.62, -head.r * 0.7]], 9);
      mb.pop();
    }
    mb.pop();
  }

  // --- hat ---
  const hat = avatar.hat % HAT_NAMES.length;
  if (hat > 0) {
    mb.zoneOf(Z.HAT);
    mb.push();
    mb.translate(0, headY + head.r * head.squash * 0.62, 0);
    if (hat === 1) { // cap
      mb.lathe([[head.r * 1.04, 0], [head.r * 1.0, head.r * 0.34], [head.r * 0.62, head.r * 0.56], [0, head.r * 0.62]], 10);
      mb.push(); mb.translate(0, 0.01, head.r * 0.95);
      mb.chamfer(head.r * 1.5, 0.035, head.r * 0.86, 0.02, { centreY: true });
      mb.pop();
    } else if (hat === 2) { // beanie
      mb.lathe([[head.r * 1.08, -head.r * 0.16], [head.r * 1.10, head.r * 0.10], [head.r * 0.84, head.r * 0.48], [head.r * 0.30, head.r * 0.66]], 10);
      mb.push(); mb.translate(0, head.r * 0.70, 0); mb.sphere(head.r * 0.22, 6, 4); mb.pop();
      mb.push(); mb.translate(0, -head.r * 0.14, 0);
      mb.torus(head.r * 1.06, head.r * 0.13, 12, 5);
      mb.pop();
    } else if (hat === 3) { // wide brim
      mb.lathe([[head.r * 1.02, 0], [head.r * 0.96, head.r * 0.50], [head.r * 0.66, head.r * 0.66], [0, head.r * 0.70]], 10);
      mb.push(); mb.translate(0, -0.005, 0);
      mb.lathe([[head.r * 1.06, 0.02], [head.r * 1.85, 0], [head.r * 1.92, -0.03], [head.r * 1.05, -0.03]], 12);
      mb.pop();
    } else { // hard hat
      mb.lathe([[head.r * 1.06, -0.01], [head.r * 1.04, head.r * 0.36], [head.r * 0.72, head.r * 0.60], [0, head.r * 0.66]], 10);
      for (let i = 0; i < 2; i++) {
        mb.push(); mb.rotateY(i * Math.PI / 2);
        mb.translate(0, head.r * 0.30, 0);
        mb.chamfer(0.03, head.r * 0.36, head.r * 2.0, 0.008, { centreY: true });
        mb.pop();
      }
      mb.push(); mb.translate(0, 0, head.r * 1.20);
      mb.chamfer(head.r * 1.3, 0.03, head.r * 0.6, 0.012, { centreY: true });
      mb.pop();
    }
    mb.pop();
  }

  // zone index -> vertex colour
  const g = mb.build('avatar');
  const zone = g.getAttribute('zone');
  const colors = new Float32Array(zone.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < zone.count; i++) {
    const key = AVATAR_ZONES[Math.round(zone.getX(i))] || 'skin';
    c.set(avatar.colors?.[key] || '#cccccc');
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.userData.height = headY + head.r * 1.4;
  return g;
}

export function avatarMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}
