/**
 * The kit of parts.
 *
 * Every item the player can place is modelled here in code. Nothing is a bare
 * primitive: walls get plinths and cap rails, fences get pickets with shaped
 * heads, lamps get finials and real glass, planters get rims and soil. That is
 * the whole difference between a placeholder and something worth building with.
 *
 * Conventions
 *   cell   parts are centred on the origin, footprint U x U, standing on y=0
 *   edge   parts run along +X with length U, thickness in Z, standing on y=0
 *   corner parts are centred on the origin, standing on y=0
 *
 * Zones
 *   0 body, 1 trim, 2 detail/glass. Every part declares what its zones mean so
 *   the colour picker can label them. Zone 2 marked `glows` lights at night.
 */

import * as THREE from 'three';
import { MeshBuilder, roundRect, blob } from './mesh.js';
import { CONFIG } from '../core/config.js';
import { roofSpanGeometry } from './roof.js';

export const U = CONFIG.grid.unit;          // one module
const WT = CONFIG.grid.wallThickness;
const HU = U / 2;

const REG = new Map();
const ORDER = [];

// Parts are declared with readable slot names; the slot system addresses them
// by single letter. Normalising here keeps both honest — the two drifting
// apart silently breaks every floor and post in the kit.
const SLOT_CODE = { cell: 'c', edge: 'e', corner: 'k', c: 'c', e: 'e', k: 'k' };
export const SLOT_NAME = { c: 'Cell', e: 'Edge', k: 'Corner' };

function def(id, meta, build) {
  const slot = SLOT_CODE[meta.slot || 'cell'];
  if (!slot) throw new Error(`part ${id}: unknown slot kind "${meta.slot}"`);
  const rec = {
    id,
    name: meta.name,
    cat: meta.cat,
    slot,
    fit: meta.fit || 'tile',
    cost: meta.cost ?? 10,
    level: meta.level ?? 1,
    zones: meta.zones || ['Body', 'Trim', 'Detail'],
    glows: !!meta.glows,
    vary: !!meta.vary,             // per-instance scale/rotation jitter
    tall: meta.tall ?? 1,
    earned: meta.earned || null,
    span: !!meta.span,
    spanDefault: meta.spanDefault || [2, 2],
    style: meta.style || null,
    tags: meta.tags || '',
    build,
    _geom: null,
  };
  REG.set(id, rec);
  ORDER.push(rec);
  return rec;
}

export function getPart(id) { return REG.get(id); }
export function allParts() { return ORDER.slice(); }

/** Geometry is built once, on first use, then cached. */
export function partGeometry(id) {
  const p = REG.get(id);
  if (!p) return null;
  if (!p._geom) {
    const mb = new MeshBuilder();
    p.build(mb);
    p._geom = mb.build(id);
  }
  return p._geom;
}

// ---------------------------------------------------------------------------
// shared detail helpers
// ---------------------------------------------------------------------------
const plank = (mb, w, h, d, c = 0.018) => mb.chamfer(w, h, d, c, { capTop: true, capBottom: true });

/** A turned post: base torus, shaft, collar, cap. */
function turnedPost(mb, r, h, seg = 8) {
  mb.lathe([
    [r * 1.35, 0], [r * 1.35, h * 0.035], [r * 1.05, h * 0.07],
    [r, h * 0.16], [r * 0.88, h * 0.55], [r, h * 0.80],
    [r * 1.2, h * 0.855], [r * 1.05, h * 0.90], [r * 0.7, h * 0.955], [0, h],
  ], seg, { closeBottom: true });
}

/** Rounded foliage mass built from overlapping blobs. */
function foliage(mb, r, n = 4, seed = 1, squash = 0.9) {
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  mb.sphere(r, 7, 5, { squash });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd();
    const rr = r * (0.44 + rnd() * 0.30);
    mb.push();
    mb.translate(Math.cos(a) * r * 0.62, (rnd() - 0.35) * r * 0.75, Math.sin(a) * r * 0.62);
    mb.sphere(rr, 6, 4, { squash: 0.92 });
    mb.pop();
  }
}

/** A small flower: stem, petals, centre. */
function flower(mb, h = 0.20, petalR = 0.055, petals = 5) {
  mb.zoneOf(1);
  mb.cylinder(0.012, h, 4);
  mb.zoneOf(2);
  mb.push();
  mb.translate(0, h, 0);
  for (let i = 0; i < petals; i++) {
    mb.push();
    mb.rotateY((i / petals) * Math.PI * 2);
    mb.translate(petalR * 0.9, 0, 0);
    mb.rotateZ(-0.34);
    mb.sphere(petalR, 5, 3, { squash: 0.34 });
    mb.pop();
  }
  mb.zoneOf(1);
  mb.sphere(petalR * 0.42, 5, 3, { squash: 0.8 });
  mb.pop();
}

/** Terracotta-style pot with a rim. */
function pot(mb, rTop, rBot, h) {
  mb.zoneOf(0);
  mb.lathe([
    [rBot * 0.82, 0], [rBot, h * 0.06], [rTop * 0.94, h * 0.80],
    [rTop, h * 0.86], [rTop * 1.10, h * 0.90], [rTop * 1.08, h], [rTop * 0.90, h * 0.985],
  ], 9, { closeBottom: true });
  mb.zoneOf(1);
  mb.push(); mb.translate(0, h * 0.90, 0);
  mb.cylinder(rTop * 0.90, 0.02, 9); // soil
  mb.pop();
}

/** Roof shingle courses — stepped strips, not a smooth slope. */
function shingles(mb, w, d, h, courses = 4) {
  for (let i = 0; i < courses; i++) {
    const t = i / courses;
    const y = h * t;
    const inset = t * 0.5;
    mb.push();
    mb.translate(0, y, 0);
    mb.chamfer(w - inset * w * 0.5, h / courses + 0.02, d - inset * d * 0.5, 0.02, { capTop: false });
    mb.pop();
  }
}

// ===========================================================================
// 10.1  MODULAR STRUCTURE KIT
// ===========================================================================

// --- walls -----------------------------------------------------------------
/** Base wall body with plinth and cap rail; openings are cut by the caller. */
function wallBody(mb, h = U, thickness = WT, opt = {}) {
  const { plinth = true, cap = true } = opt;
  mb.zoneOf(0);
  mb.chamfer(U, h, thickness, 0.022, { capTop: !cap });
  if (plinth) {
    mb.zoneOf(1);
    mb.push(); mb.translate(0, 0, 0);
    mb.chamfer(U + 0.05, 0.16, thickness + 0.05, 0.02);
    mb.pop();
  }
  if (cap) {
    mb.zoneOf(1);
    mb.push(); mb.translate(0, h - 0.09, 0);
    mb.chamfer(U + 0.06, 0.09, thickness + 0.06, 0.02);
    mb.pop();
  }
  mb.zoneOf(0);
}

/** A wall built as a frame around a hole, so openings are real. */
function wallWithHole(mb, holeW, holeH, holeY, thickness = WT) {
  mb.zoneOf(0);
  const sideW = (U - holeW) / 2;
  const topH = U - (holeY + holeH);
  const botH = holeY;
  if (sideW > 0.001) {
    for (const sx of [-1, 1]) {
      mb.push();
      mb.translate(sx * (U - sideW) / 2, 0, 0);
      mb.chamfer(sideW, U, thickness, 0.022, { capTop: false });
      mb.pop();
    }
  }
  if (botH > 0.001) {
    mb.push(); mb.translate(0, 0, 0);
    mb.chamfer(holeW, botH, thickness, 0.02, { capTop: false });
    mb.pop();
  }
  if (topH > 0.001) {
    mb.push(); mb.translate(0, holeY + holeH, 0);
    mb.chamfer(holeW, topH, thickness, 0.02, { capTop: false });
    mb.pop();
  }
  // plinth + cap wrap the whole module so runs line up
  mb.zoneOf(1);
  mb.push(); mb.chamfer(U + 0.05, 0.16, thickness + 0.05, 0.02); mb.pop();
  mb.push(); mb.translate(0, U - 0.09, 0);
  mb.chamfer(U + 0.06, 0.09, thickness + 0.06, 0.02); mb.pop();
  mb.zoneOf(0);
}

def('wall', { name: 'Wall', cat: 'walls', slot: 'edge', fit: 'span', cost: 12, zones: ['Wall', 'Trim', 'Detail'], tags: 'wall solid' },
  (mb) => {
    wallBody(mb, U);
    // A moulded panel outline, so a bare wall has a face without becoming a
    // second block of colour — a filled panel here reads as a mistake once the
    // player gives the trim zone any contrast at all.
    mb.zoneOf(1);
    const pw = U * 0.72, ph = U * 0.48, t = 0.055;
    for (const sz of [-1, 1]) {
      const z = sz * (WT / 2 + 0.004);
      for (const [ox, oy, w, h] of [
        [0, ph / 2, pw, t], [0, -ph / 2, pw, t],
        [-pw / 2, 0, t, ph], [pw / 2, 0, t, ph],
      ]) {
        mb.push();
        mb.translate(ox, U * 0.5 + oy, z);
        mb.chamfer(w, h, 0.014, 0.006, { centreY: true });
        mb.pop();
      }
    }
  });

def('wallThin', { name: 'Thin panel', cat: 'walls', slot: 'edge', fit: 'span', cost: 8, zones: ['Panel', 'Frame', 'Detail'], tags: 'wall thin partition' },
  (mb) => {
    mb.zoneOf(1);
    // frame
    mb.push(); mb.chamfer(U, 0.10, WT * 0.55, 0.015); mb.pop();
    mb.push(); mb.translate(0, U - 0.10, 0); mb.chamfer(U, 0.10, WT * 0.55, 0.015); mb.pop();
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * (U / 2 - 0.05), 0, 0);
      mb.chamfer(0.10, U, WT * 0.55, 0.015); mb.pop();
    }
    mb.zoneOf(0);
    mb.push(); mb.translate(0, U / 2, 0);
    mb.chamfer(U - 0.18, U - 0.22, WT * 0.34, 0.012, { centreY: true });
    mb.pop();
  });

def('wallDoorway', { name: 'Doorway wall', cat: 'walls', slot: 'edge', fit: 'span', cost: 16, zones: ['Wall', 'Frame', 'Detail'], tags: 'wall door opening' },
  (mb) => {
    const hw = U * 0.46, hh = U * 0.74;
    wallWithHole(mb, hw, hh, 0);
    // reveal lining so the opening has depth
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * hw / 2, hh / 2, 0);
      mb.chamfer(0.05, hh, WT * 1.16, 0.01, { centreY: true }); mb.pop();
    }
    mb.push(); mb.translate(0, hh, 0);
    mb.chamfer(hw + 0.10, 0.06, WT * 1.16, 0.01); mb.pop();
  });

def('wallArch', { name: 'Arched doorway wall', cat: 'walls', slot: 'edge', fit: 'span', cost: 22, level: 3, zones: ['Wall', 'Arch', 'Detail'], tags: 'wall arch door opening' },
  (mb) => {
    const hw = U * 0.48, straight = U * 0.44, r = hw / 2;
    mb.zoneOf(0);
    const sideW = (U - hw) / 2;
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * (U - sideW) / 2, 0, 0);
      mb.chamfer(sideW, U, WT, 0.022, { capTop: false }); mb.pop();
    }
    // spandrels above the arch, approximated by a stepped stack
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const y = straight + Math.sin(t * Math.PI / 2) * r;
      const halfOpen = Math.cos(t * Math.PI / 2) * r;
      const w = hw / 2 - halfOpen;
      if (w <= 0.002) continue;
      for (const sx of [-1, 1]) {
        mb.push();
        mb.translate(sx * (hw / 2 - w / 2), y, 0);
        mb.chamfer(w, (r / steps) + 0.02, WT, 0.012, { capTop: false });
        mb.pop();
      }
    }
    mb.push(); mb.translate(0, straight + r, 0);
    mb.chamfer(hw, U - straight - r, WT, 0.02, { capTop: false }); mb.pop();
    // voussoir ring
    mb.zoneOf(1);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (i + 0.5) / 7;
      mb.push();
      mb.translate(-Math.cos(a) * r, straight + Math.sin(a) * r, 0);
      mb.rotateZ(a - Math.PI / 2);
      mb.chamfer(0.11, 0.10, WT * 1.2, 0.012, { centreY: true });
      mb.pop();
    }
    mb.push(); mb.chamfer(U + 0.05, 0.16, WT + 0.05, 0.02); mb.pop();
    mb.push(); mb.translate(0, U - 0.09, 0); mb.chamfer(U + 0.06, 0.09, WT + 0.06, 0.02); mb.pop();
  });

def('wallWindow', { name: 'Window wall', cat: 'walls', slot: 'edge', fit: 'span', cost: 20, zones: ['Wall', 'Frame', 'Glass'], glows: true, tags: 'wall window glass' },
  (mb) => {
    const w = U * 0.52, h = U * 0.40, y = U * 0.36;
    wallWithHole(mb, w, h, y);
    mb.push(); mb.translate(0, y + h / 2, 0);
    mb.opening(w, h, 0.07, WT * 1.3, { mullions: 1 });
    mb.pop();
  });

def('wallWindowWide', { name: 'Wide window wall', cat: 'walls', slot: 'edge', fit: 'span', cost: 26, level: 2, zones: ['Wall', 'Frame', 'Glass'], glows: true, tags: 'wall window wide glass' },
  (mb) => {
    const w = U * 0.78, h = U * 0.46, y = U * 0.30;
    wallWithHole(mb, w, h, y);
    mb.push(); mb.translate(0, y + h / 2, 0);
    mb.opening(w, h, 0.07, WT * 1.3, { mullions: 2 });
    mb.pop();
  });

// --- openings --------------------------------------------------------------
def('door', { name: 'Door', cat: 'openings', slot: 'edge', fit: 'span', cost: 18, zones: ['Door', 'Frame', 'Handle'], tags: 'door entrance' },
  (mb) => {
    const w = U * 0.46, h = U * 0.74;
    mb.zoneOf(1);
    mb.opening(w + 0.16, h + 0.08, 0.08, WT * 1.1, { paneZone: 1, sill: false });
    mb.zoneOf(0);
    mb.push(); mb.translate(0, h / 2, 0.01);
    mb.chamfer(w, h, WT * 0.62, 0.02, { centreY: true });
    mb.pop();
    // two recessed panels + rails
    mb.zoneOf(1);
    for (const py of [h * 0.28, h * 0.66]) {
      mb.push(); mb.translate(0, py, WT * 0.34);
      mb.chamfer(w * 0.66, h * 0.26, 0.016, 0.01, { centreY: true });
      mb.pop();
    }
    // handle + plate
    mb.zoneOf(2);
    mb.push(); mb.translate(w * 0.32, h * 0.46, WT * 0.36);
    mb.rotateX(Math.PI / 2);
    mb.cylinder(0.035, 0.09, 6);
    mb.push(); mb.translate(0, 0.09, 0); mb.sphere(0.055, 6, 4); mb.pop();
    mb.pop();
  });

def('doorTall', { name: 'Tall door', cat: 'openings', slot: 'edge', fit: 'span', cost: 24, level: 2, tall: 2, zones: ['Door', 'Frame', 'Handle'], tags: 'door tall double' },
  (mb) => {
    const w = U * 0.60, h = U * 1.30;
    mb.zoneOf(1);
    mb.opening(w + 0.18, h + 0.10, 0.09, WT * 1.1, { paneZone: 1, sill: false });
    mb.zoneOf(0);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * w * 0.25, h / 2, 0.01);
      mb.chamfer(w * 0.48, h, WT * 0.62, 0.02, { centreY: true });
      mb.pop();
    }
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      for (const py of [h * 0.22, h * 0.50, h * 0.78]) {
        mb.push(); mb.translate(sx * w * 0.25, py, WT * 0.34);
        mb.chamfer(w * 0.32, h * 0.18, 0.016, 0.01, { centreY: true });
        mb.pop();
      }
    }
    mb.zoneOf(2);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * 0.06, h * 0.42, WT * 0.36);
      mb.rotateX(Math.PI / 2);
      mb.cylinder(0.028, 0.10, 6);
      mb.pop();
    }
  });

def('windowSquare', { name: 'Square window', cat: 'openings', slot: 'edge', fit: 'span', cost: 14, zones: ['Frame', 'Sill', 'Glass'], glows: true, tags: 'window glass' },
  (mb) => {
    mb.push(); mb.translate(0, U * 0.56, 0);
    mb.opening(U * 0.50, U * 0.50, 0.07, WT * 1.3, { mullions: 1, frameZone: 0 });
    mb.pop();
  });

def('windowSlim', { name: 'Slim window', cat: 'openings', slot: 'edge', fit: 'span', cost: 12, zones: ['Frame', 'Sill', 'Glass'], glows: true, tags: 'window narrow glass' },
  (mb) => {
    mb.push(); mb.translate(0, U * 0.58, 0);
    mb.opening(U * 0.24, U * 0.62, 0.06, WT * 1.3, { frameZone: 0 });
    mb.pop();
  });

def('ladder', { name: 'Ladder', cat: 'openings', slot: 'edge', fit: 'span', cost: 10, zones: ['Rails', 'Rungs', 'Detail'], tags: 'ladder climb' },
  (mb) => {
    const h = U, w = 0.52;
    mb.zoneOf(0);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * w / 2, 0, 0);
      plank(mb, 0.075, h, 0.075);
      mb.pop();
    }
    mb.zoneOf(1);
    const rungs = 6;
    for (let i = 1; i <= rungs; i++) {
      mb.push(); mb.translate(0, (h * i) / (rungs + 1), 0);
      mb.rotateZ(Math.PI / 2);
      mb.cylinder(0.032, w, 6, { centreY: true });
      mb.pop();
    }
  });

def('ladderTall', { name: 'Tall ladder', cat: 'openings', slot: 'edge', fit: 'span', cost: 16, level: 2, tall: 2, zones: ['Rails', 'Rungs', 'Detail'], tags: 'ladder tall climb' },
  (mb) => {
    const h = U * 2, w = 0.52;
    mb.zoneOf(0);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * w / 2, 0, 0);
      plank(mb, 0.075, h, 0.075);
      mb.pop();
    }
    mb.zoneOf(1);
    const rungs = 12;
    for (let i = 1; i <= rungs; i++) {
      mb.push(); mb.translate(0, (h * i) / (rungs + 1), 0);
      mb.rotateZ(Math.PI / 2);
      mb.cylinder(0.032, w, 6, { centreY: true });
      mb.pop();
    }
    mb.zoneOf(2);
    mb.push(); mb.translate(0, h + 0.05, 0);
    mb.rotateZ(Math.PI / 2); mb.cylinder(0.026, w, 6, { centreY: true }); mb.pop();
  });

// --- floors & roof ---------------------------------------------------------
def('floor', { name: 'Floor', cat: 'floors', slot: 'cell', cost: 9, zones: ['Boards', 'Edge', 'Detail'], tags: 'floor deck boards' },
  (mb) => {
    mb.zoneOf(1);
    mb.chamfer(U, 0.10, U, 0.02);
    mb.zoneOf(0);
    const n = 5;
    for (let i = 0; i < n; i++) {
      mb.push();
      mb.translate(0, 0.10, -HU + (U * (i + 0.5)) / n);
      plank(mb, U - 0.04, 0.055, U / n - 0.035, 0.012);
      mb.pop();
    }
  });

def('floorWide', { name: 'Wide floor', cat: 'floors', slot: 'cell', fit: 'span', cost: 16, level: 2, zones: ['Boards', 'Edge', 'Detail'], tags: 'floor wide deck' },
  (mb) => {
    mb.zoneOf(1);
    mb.chamfer(U * 2, 0.10, U, 0.02);
    mb.zoneOf(0);
    const n = 5;
    for (let i = 0; i < n; i++) {
      mb.push();
      mb.translate(0, 0.10, -HU + (U * (i + 0.5)) / n);
      plank(mb, U * 2 - 0.04, 0.055, U / n - 0.035, 0.012);
      mb.pop();
    }
  });

def('floorCorner', { name: 'Corner floor', cat: 'floors', slot: 'cell', cost: 9, zones: ['Boards', 'Edge', 'Detail'], tags: 'floor corner triangle' },
  (mb) => {
    mb.zoneOf(1);
    mb.extrude([[-HU, -HU], [HU, -HU], [-HU, HU]], 0.10);
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.10, 0);
    mb.extrude([[-HU + 0.03, -HU + 0.03], [HU - 0.07, -HU + 0.03], [-HU + 0.03, HU - 0.07]], 0.05);
    mb.pop();
  });

def('slab', { name: 'Slab', cat: 'floors', slot: 'cell', cost: 7, zones: ['Slab', 'Edge', 'Detail'], tags: 'floor slab concrete' },
  (mb) => {
    mb.zoneOf(0);
    mb.chamfer(U, 0.14, U, 0.03);
    mb.zoneOf(1);
    mb.push(); mb.translate(0, 0.14, 0);
    mb.chamfer(U - 0.10, 0.02, U - 0.10, 0.01);
    mb.pop();
  });

/**
 * The roof.
 *
 * One piece covering a whole rectangle of modules, not a tile you repeat — so
 * it never has seams or gaps however big the building is. Drag any side to
 * resize it, or use "Fit to building" to snap it to the walls underneath.
 * Geometry is generated per size in kit/roof.js.
 */
def('roof', { name: 'Roof', cat: 'floors', slot: 'cell', fit: 'span', cost: 13, span: true,
  spanDefault: [2, 2], style: 'gable',
  zones: ['Roof', 'Trim', 'Detail'], tags: 'roof gable hip shed pitch cover whole building resize' },
  (mb) => {
    // the catalogue thumbnail and the drag ghost use a default 2x2 gable
    const g = roofSpanGeometry(2, 2, 'gable');
    const pos = g.getAttribute('position'), nrm = g.getAttribute('normal');
    const zone = g.getAttribute('zone'), sh = g.getAttribute('shade');
    for (let i = 0; i < pos.count; i++) {
      mb.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      mb.nrm.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      mb.zone.push(zone.getX(i)); mb.shade.push(sh.getX(i));
      mb.seed.push(0); mb.tone.push(0.5);
    }
  });


def('roofFlat', { name: 'Flat roof deck', cat: 'floors', slot: 'cell', cost: 11, zones: ['Deck', 'Coping', 'Detail'], tags: 'roof flat deck' },
  (mb) => {
    mb.zoneOf(0);
    mb.chamfer(U, 0.12, U, 0.02);
    mb.zoneOf(1);
    mb.push(); mb.translate(0, 0.12, 0);
    // slight fall to a corner drain
    mb.chamfer(U - 0.14, 0.03, U - 0.14, 0.01);
    mb.pop();
    mb.zoneOf(2);
    mb.push(); mb.translate(HU * 0.66, 0.13, HU * 0.66);
    mb.cylinder(0.08, 0.03, 8);
    mb.pop();
  });

def('roofCoping', { name: 'Roof coping', cat: 'floors', slot: 'edge', fit: 'span', cost: 8, zones: ['Coping', 'Cap', 'Detail'], tags: 'roof parapet edge trim' },
  (mb) => {
    mb.zoneOf(0);
    mb.chamfer(U, 0.34, WT * 1.3, 0.02);
    mb.zoneOf(1);
    mb.push(); mb.translate(0, 0.34, 0);
    mb.chamfer(U + 0.08, 0.07, WT * 1.7, 0.02);
    mb.pop();
  });

// --- stairs ----------------------------------------------------------------
def('stairs', { name: 'Straight stairs', cat: 'stairs', slot: 'cell', cost: 20, zones: ['Steps', 'Stringer', 'Detail'], tags: 'stairs step up' },
  (mb) => {
    mb.zoneOf(0);
    mb.steps(6, U - 0.14, U, U);
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * (U - 0.14) / 2, 0, 0);
      mb.extrude([[-0.035, -HU], [0.035, -HU], [0.035, HU], [-0.035, HU]], 0.001);
      mb.pop();
    }
    // nosing on each tread
    for (let i = 0; i < 6; i++) {
      mb.push();
      mb.translate(0, (U * (i + 1)) / 6, HU - (U / 6) * (i + 1));
      mb.chamfer(U - 0.12, 0.03, 0.07, 0.01);
      mb.pop();
    }
  });

def('stairsLow', { name: 'Low stairs', cat: 'stairs', slot: 'cell', cost: 13, zones: ['Steps', 'Stringer', 'Detail'], tags: 'stairs low step' },
  (mb) => {
    mb.zoneOf(0);
    mb.steps(3, U - 0.14, U * 0.5, U);
    mb.zoneOf(1);
    for (let i = 0; i < 3; i++) {
      mb.push();
      mb.translate(0, (U * 0.5 * (i + 1)) / 3, HU - (U / 3) * (i + 1));
      mb.chamfer(U - 0.12, 0.03, 0.07, 0.01);
      mb.pop();
    }
  });

def('stairsTurn', { name: 'Turning stairs', cat: 'stairs', slot: 'cell', cost: 26, level: 3, zones: ['Steps', 'Stringer', 'Detail'], tags: 'stairs corner turn spiral' },
  (mb) => {
    mb.zoneOf(0);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * (Math.PI / 2);
      mb.push();
      mb.translate(-HU, (U * i) / n, -HU);
      mb.rotateY(-a);
      mb.translate(U * 0.42, 0, 0);
      mb.chamfer(U * 0.66, U / n + 0.02, U * 0.40, 0.015);
      mb.pop();
    }
    mb.zoneOf(1);
    mb.push(); mb.translate(-HU, 0, -HU);
    mb.cylinder(0.11, U, 8);
    mb.pop();
  });

def('ramp', { name: 'Ramp', cat: 'stairs', slot: 'cell', cost: 16, zones: ['Surface', 'Kerb', 'Detail'], tags: 'ramp slope accessible' },
  (mb) => {
    mb.zoneOf(0);
    mb.extrude([[-HU, -HU], [HU, -HU], [HU, HU], [-HU, HU]], 0.001);
    // wedge lying along Z
    mb.push(); mb.rotateY(Math.PI / 2);
    mb.wedge(U, U, U - 0.12, { peak: 1 });
    mb.pop();
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * (U / 2 - 0.05), 0, 0);
      mb.rotateY(Math.PI / 2);
      mb.wedge(U, U + 0.06, 0.09, { peak: 1 });
      mb.pop();
    }
  });

def('rampLow', { name: 'Low ramp', cat: 'stairs', slot: 'cell', cost: 11, zones: ['Surface', 'Kerb', 'Detail'], tags: 'ramp low slope' },
  (mb) => {
    mb.zoneOf(0);
    mb.push(); mb.rotateY(Math.PI / 2);
    mb.wedge(U, U * 0.5, U - 0.12, { peak: 1 });
    mb.pop();
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * (U / 2 - 0.05), 0, 0);
      mb.rotateY(Math.PI / 2);
      mb.wedge(U, U * 0.5 + 0.05, 0.09, { peak: 1 });
      mb.pop();
    }
  });

// --- posts & rails ---------------------------------------------------------
def('pillar', { name: 'Pillar', cat: 'posts', slot: 'corner', fit: 'free', cost: 10, zones: ['Shaft', 'Cap', 'Detail'], tags: 'pillar post column' },
  (mb) => {
    mb.zoneOf(1);
    mb.chamfer(0.36, 0.12, 0.36, 0.02);
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.12, 0);
    mb.chamfer(0.26, U - 0.24, 0.26, 0.03);
    mb.pop();
    mb.zoneOf(1);
    mb.push(); mb.translate(0, U - 0.12, 0);
    mb.chamfer(0.36, 0.12, 0.36, 0.02);
    mb.pop();
  });

def('pillarTall', { name: 'Tall pillar', cat: 'posts', slot: 'corner', fit: 'free', cost: 16, level: 2, tall: 2, zones: ['Shaft', 'Cap', 'Detail'], tags: 'pillar tall post column' },
  (mb) => {
    const H = U * 2;
    mb.zoneOf(1);
    mb.chamfer(0.40, 0.14, 0.40, 0.02);
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.14, 0);
    mb.chamfer(0.28, H - 0.28, 0.28, 0.03);
    mb.pop();
    mb.zoneOf(1);
    mb.push(); mb.translate(0, H - 0.14, 0);
    mb.chamfer(0.40, 0.14, 0.40, 0.02);
    mb.pop();
    mb.zoneOf(2);
    mb.push(); mb.translate(0, H * 0.5, 0);
    mb.chamfer(0.32, 0.05, 0.32, 0.012, { centreY: true });
    mb.pop();
  });

def('pillarCarved', { name: 'Carved pillar', cat: 'posts', slot: 'corner', fit: 'free', cost: 24, level: 4, zones: ['Shaft', 'Cap', 'Detail'], tags: 'pillar carved fluted classical' },
  (mb) => {
    mb.zoneOf(1);
    mb.lathe([[0.22, 0], [0.22, 0.06], [0.18, 0.10], [0.16, 0.16]], 10, { closeBottom: true });
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.16, 0);
    mb.cylinder(0.145, U - 0.40, 10, { rTop: 0.125 });
    mb.pop();
    // flutes
    mb.zoneOf(2);
    for (let i = 0; i < 8; i++) {
      mb.push();
      mb.rotateY((i / 8) * Math.PI * 2);
      mb.translate(0.132, 0.20, 0);
      mb.box(0.035, U - 0.48, 0.035);
      mb.pop();
    }
    mb.zoneOf(1);
    mb.push(); mb.translate(0, U - 0.24, 0);
    mb.lathe([[0.125, 0], [0.16, 0.05], [0.15, 0.10], [0.21, 0.16], [0.21, 0.22], [0.16, 0.24]], 10);
    mb.pop();
  });

def('cornerPost', { name: 'Corner post', cat: 'posts', slot: 'corner', fit: 'free', cost: 8, zones: ['Post', 'Cap', 'Detail'], tags: 'post corner timber' },
  (mb) => {
    mb.zoneOf(0);
    plank(mb, 0.19, U - 0.10, 0.19, 0.02);
    mb.zoneOf(1);
    mb.push(); mb.translate(0, U - 0.10, 0);
    mb.chamfer(0.25, 0.06, 0.25, 0.015);
    mb.push(); mb.translate(0, 0.06, 0);
    mb.cone(0.13, 0.10, 4, { phase: Math.PI / 4 });
    mb.pop(); mb.pop();
  });

def('railing', { name: 'Railing', cat: 'posts', slot: 'edge', fit: 'span', cost: 11, zones: ['Rail', 'Balusters', 'Detail'], tags: 'railing balustrade rail' },
  (mb) => {
    const h = U * 0.44;
    mb.zoneOf(0);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * (U / 2 - 0.06), 0, 0);
      plank(mb, 0.11, h, 0.11, 0.015);
      mb.pop();
    }
    mb.push(); mb.translate(0, h - 0.05, 0);
    mb.chamfer(U, 0.07, 0.13, 0.018);
    mb.pop();
    mb.zoneOf(1);
    mb.push(); mb.translate(0, 0.06, 0);
    mb.chamfer(U - 0.14, 0.05, 0.09, 0.012);
    mb.pop();
    // turned balusters
    mb.zoneOf(1);
    const n = 5;
    for (let i = 0; i < n; i++) {
      mb.push();
      mb.translate(-U / 2 + (U * (i + 1)) / (n + 1), 0.09, 0);
      mb.lathe([[0.035, 0], [0.05, 0.04], [0.032, 0.10], [0.045, h * 0.45], [0.03, h * 0.68], [0.048, h * 0.80], [0.034, h - 0.14]], 6, { closeBottom: true });
      mb.pop();
    }
  });

def('fenceRail', { name: 'Fence rail', cat: 'posts', slot: 'edge', fit: 'span', cost: 7, zones: ['Rails', 'Posts', 'Detail'], tags: 'fence rail paddock' },
  (mb) => {
    const h = U * 0.40;
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * (U / 2 - 0.05), 0, 0);
      plank(mb, 0.10, h, 0.10, 0.015);
      mb.pop();
    }
    mb.zoneOf(0);
    for (const y of [h * 0.42, h * 0.84]) {
      mb.push(); mb.translate(0, y, 0);
      mb.chamfer(U, 0.09, 0.05, 0.012);
      mb.pop();
    }
  });

def('slatFence', { name: 'Slat fence', cat: 'posts', slot: 'edge', fit: 'span', cost: 9, zones: ['Slats', 'Frame', 'Detail'], tags: 'fence slat modern' },
  (mb) => {
    const h = U * 0.56;
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * (U / 2 - 0.05), 0, 0);
      plank(mb, 0.10, h + 0.06, 0.10, 0.015);
      mb.pop();
    }
    mb.zoneOf(0);
    const n = 7;
    for (let i = 0; i < n; i++) {
      mb.push();
      mb.translate(0, 0.10 + ((h - 0.20) * i) / (n - 1), 0);
      mb.chamfer(U - 0.14, (h - 0.20) / n * 0.62, 0.04, 0.008);
      mb.pop();
    }
  });

def('lowFence', { name: 'Low fence', cat: 'posts', slot: 'edge', fit: 'span', cost: 6, zones: ['Fence', 'Posts', 'Detail'], tags: 'fence low border edging' },
  (mb) => {
    const h = U * 0.24;
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * (U / 2 - 0.04), 0, 0);
      plank(mb, 0.08, h + 0.05, 0.08, 0.012);
      mb.pop();
    }
    mb.zoneOf(0);
    mb.push(); mb.translate(0, h - 0.04, 0);
    mb.chamfer(U, 0.06, 0.05, 0.01);
    mb.pop();
    const n = 6;
    for (let i = 0; i < n; i++) {
      mb.push();
      mb.translate(-U / 2 + (U * (i + 0.5)) / n, 0, 0);
      mb.chamfer(0.055, h, 0.04, 0.008);
      mb.pop();
    }
  });

// --- structural bits -------------------------------------------------------
def('crate', { name: 'Crate', cat: 'bits', slot: 'cell', fit: 'free', cost: 6, vary: true, zones: ['Crate', 'Bands', 'Detail'], tags: 'crate box wooden' },
  (mb) => {
    const s = U * 0.42;
    mb.zoneOf(0);
    mb.chamfer(s, s, s, 0.025);
    mb.zoneOf(1);
    // corner battens + diagonal brace
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      for (const sgn of [-1, 1]) {
        mb.push();
        mb.translate(ax * sgn * s / 2, s / 2, az * sgn * s / 2);
        mb.chamfer(ax ? 0.03 : s * 1.01, s * 0.10, az ? 0.03 : s * 1.01, 0.008, { centreY: true });
        mb.pop();
        mb.push();
        mb.translate(ax * sgn * s / 2, s * 0.90, az * sgn * s / 2);
        mb.chamfer(ax ? 0.03 : s * 1.01, s * 0.10, az ? 0.03 : s * 1.01, 0.008, { centreY: true });
        mb.pop();
      }
    }
  });

def('block', { name: 'Block', cat: 'bits', slot: 'cell', cost: 5, zones: ['Block', 'Edge', 'Detail'], tags: 'block cube stone' },
  (mb) => { mb.zoneOf(0); mb.chamfer(U * 0.8, U * 0.8, U * 0.8, 0.05); });

def('blockLow', { name: 'Low block', cat: 'bits', slot: 'cell', cost: 4, zones: ['Block', 'Edge', 'Detail'], tags: 'block low plinth' },
  (mb) => { mb.zoneOf(0); mb.chamfer(U * 0.8, U * 0.36, U * 0.8, 0.04); });

def('column', { name: 'Column', cat: 'bits', slot: 'corner', fit: 'free', cost: 9, zones: ['Column', 'Cap', 'Detail'], tags: 'column round post' },
  (mb) => {
    mb.zoneOf(1);
    mb.cylinder(0.20, 0.09, 10, { chamfer: 0.03 });
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.09, 0);
    mb.cylinder(0.155, U - 0.20, 10, { rTop: 0.14 });
    mb.pop();
    mb.zoneOf(1);
    mb.push(); mb.translate(0, U - 0.11, 0);
    mb.cylinder(0.20, 0.11, 10, { chamfer: 0.03 });
    mb.pop();
  });

def('planter', { name: 'Planter', cat: 'bits', slot: 'cell', cost: 12, zones: ['Planter', 'Rim', 'Plants'], tags: 'planter box plants' },
  (mb) => {
    const w = U * 0.72, h = U * 0.30;
    mb.zoneOf(0);
    mb.chamfer(w, h, w, 0.03);
    mb.zoneOf(1);
    mb.push(); mb.translate(0, h, 0);
    mb.chamfer(w + 0.08, 0.07, w + 0.08, 0.02);
    mb.pop();
    mb.zoneOf(2);
    mb.push(); mb.translate(0, h + 0.05, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      mb.push();
      mb.translate(Math.cos(a) * w * 0.22, 0, Math.sin(a) * w * 0.22);
      mb.sphere(w * 0.19, 6, 4, { squash: 0.72, centreY: false });
      mb.pop();
    }
    mb.pop();
  });

def('sphere', { name: 'Sphere', cat: 'bits', slot: 'cell', fit: 'free', cost: 7, zones: ['Sphere', 'Base', 'Detail'], tags: 'sphere ball orb' },
  (mb) => {
    mb.zoneOf(1);
    mb.cylinder(U * 0.20, 0.07, 10, { chamfer: 0.02 });
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.07 + U * 0.30, 0);
    mb.sphere(U * 0.30, 9, 6);
    mb.pop();
  });

def('cone', { name: 'Cone', cat: 'bits', slot: 'cell', fit: 'free', cost: 6, zones: ['Cone', 'Base', 'Detail'], tags: 'cone spike point' },
  (mb) => {
    mb.zoneOf(1);
    mb.cylinder(U * 0.24, 0.07, 10, { chamfer: 0.02 });
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.07, 0);
    mb.cone(U * 0.30, U * 0.74, 10);
    mb.pop();
  });

def('beam', { name: 'Beam', cat: 'bits', slot: 'edge', fit: 'span', cost: 8, zones: ['Beam', 'Ends', 'Detail'], tags: 'beam lintel timber' },
  (mb) => {
    mb.zoneOf(0);
    mb.push(); mb.translate(0, U - 0.18, 0);
    mb.chamfer(U, 0.20, 0.20, 0.025);
    mb.pop();
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * (U / 2 - 0.03), U - 0.18, 0);
      mb.chamfer(0.06, 0.24, 0.24, 0.015);
      mb.pop();
    }
  });

// ===========================================================================
// 10.2  FENCES AND BOUNDARIES
// ===========================================================================
def('wickerFence', { name: 'Wicker fence', cat: 'fences', slot: 'edge', fit: 'span', cost: 9, zones: ['Weave', 'Posts', 'Detail'], tags: 'fence wicker woven rustic' },
  (mb) => {
    const h = U * 0.46;
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * (U / 2 - 0.05), 0, 0);
      mb.cylinder(0.055, h + 0.10, 6);
      mb.pop();
    }
    mb.push(); mb.translate(0, 0, 0); mb.cylinder(0.05, h + 0.06, 6); mb.pop();
    // woven courses weaving in and out around the uprights
    mb.zoneOf(0);
    const courses = 6;
    for (let i = 0; i < courses; i++) {
      const y = 0.06 + ((h - 0.10) * i) / (courses - 1);
      const off = (i % 2 ? 1 : -1) * 0.035;
      const seg = 6;
      for (let j = 0; j < seg; j++) {
        const t = (j + 0.5) / seg;
        const z = Math.sin(t * Math.PI * 3) * 0.035 + off * 0.4;
        mb.push();
        mb.translate(-U / 2 + U * t, y, z);
        mb.chamfer(U / seg + 0.02, 0.055, 0.05, 0.01);
        mb.pop();
      }
    }
  });

def('picketFence', { name: 'Picket fence', cat: 'fences', slot: 'edge', fit: 'span', cost: 8, zones: ['Pickets', 'Rails', 'Detail'], tags: 'fence picket cottage white' },
  (mb) => {
    const h = U * 0.50;
    mb.zoneOf(1);
    for (const y of [h * 0.30, h * 0.68]) {
      mb.push(); mb.translate(0, y, 0);
      mb.chamfer(U, 0.07, 0.04, 0.01);
      mb.pop();
    }
    mb.zoneOf(0);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x = -U / 2 + (U * (i + 0.5)) / n;
      mb.push();
      mb.translate(x, 0, 0);
      mb.chamfer(0.09, h - 0.09, 0.035, 0.008);
      // pointed head
      mb.push(); mb.translate(0, h - 0.09, 0);
      mb.rotateY(Math.PI / 4);
      mb.cone(0.068, 0.11, 4);
      mb.pop();
      mb.pop();
    }
  });

def('stoneWall', { name: 'Low stone wall', cat: 'fences', slot: 'edge', fit: 'span', cost: 13, zones: ['Stone', 'Capping', 'Detail'], tags: 'wall stone dry low' },
  (mb) => {
    const h = U * 0.34;
    mb.zoneOf(0);
    // irregular courses of stones
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const y = (h - 0.06) * (r / rows);
      const rh = (h - 0.06) / rows;
      const n = 3 + (r % 2);
      for (let i = 0; i < n; i++) {
        const w = U / n;
        const jitter = ((i * 37 + r * 91) % 11) / 11;
        mb.push();
        mb.translate(-U / 2 + w * (i + 0.5) + (jitter - 0.5) * 0.04, y, (jitter - 0.5) * 0.05);
        mb.chamfer(w * (0.86 + jitter * 0.12), rh * 1.06, 0.28 + jitter * 0.05, 0.035);
        mb.pop();
      }
    }
    mb.zoneOf(1);
    mb.push(); mb.translate(0, h - 0.06, 0);
    mb.chamfer(U, 0.09, 0.36, 0.03);
    mb.pop();
  });

def('hedge', { name: 'Hedge', cat: 'fences', slot: 'edge', fit: 'span', cost: 10, vary: true, zones: ['Foliage', 'Base', 'Detail'], tags: 'hedge green boundary topiary' },
  (mb) => {
    const h = U * 0.56;
    mb.zoneOf(1);
    mb.chamfer(U, 0.07, 0.52, 0.02);
    mb.zoneOf(0);
    // clipped mass built from overlapping lumps so the top isn't a flat lid
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4;
      mb.push();
      mb.translate(-U / 2 + U * t, 0.07, ((i % 2) - 0.5) * 0.03);
      mb.sphere(0.36, 7, 4, { squash: h / 0.72, centreY: false });
      mb.pop();
    }
  });

def('ironRailing', { name: 'Iron railing', cat: 'fences', slot: 'edge', fit: 'span', cost: 15, level: 2, zones: ['Iron', 'Finials', 'Detail'], tags: 'railing iron wrought fence' },
  (mb) => {
    const h = U * 0.62;
    mb.zoneOf(0);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * (U / 2 - 0.04), 0, 0);
      mb.chamfer(0.075, h + 0.10, 0.075, 0.012);
      mb.pop();
    }
    for (const y of [0.12, h - 0.14]) {
      mb.push(); mb.translate(0, y, 0);
      mb.chamfer(U, 0.05, 0.045, 0.01);
      mb.pop();
    }
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x = -U / 2 + (U * (i + 0.5)) / n;
      mb.push(); mb.translate(x, 0.12, 0);
      mb.cylinder(0.022, h - 0.20, 5);
      mb.pop();
      mb.zoneOf(1);
      mb.push(); mb.translate(x, h - 0.08, 0);
      mb.cone(0.045, 0.10, 5);
      mb.pop();
      mb.zoneOf(0);
    }
    // scroll flourish between the posts
    mb.zoneOf(1);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mb.push();
      mb.translate(Math.cos(a) * 0.16, h * 0.5 + Math.sin(a) * 0.16, 0);
      mb.rotateZ(a);
      mb.chamfer(0.06, 0.028, 0.028, 0.006, { centreY: true });
      mb.pop();
    }
  });

// ===========================================================================
// 10.3  PATHS AND GROUND
// ===========================================================================
/** Paving tiles all sit in the same 0..0.06 band so they tile against each other. */
function pavingBase(mb, color = 1) {
  mb.zoneOf(color);
  mb.chamfer(U, 0.05, U, 0.006);
}

def('pathCobble', { name: 'Cobblestone', cat: 'paths', slot: 'cell', cost: 5, vary: true, zones: ['Stones', 'Joints', 'Detail'], tags: 'path cobble stone paving' },
  (mb) => {
    pavingBase(mb, 1);
    mb.zoneOf(0);
    const n = 4;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const jit = ((i * 13 + j * 29) % 17) / 17;
        const off = (j % 2) * (U / n) * 0.5;
        mb.push();
        mb.translate(-HU + (U * (i + 0.5)) / n + off - (U / n) * 0.25,
          0.048, -HU + (U * (j + 0.5)) / n);
        mb.rotateY(jit * 0.5);
        mb.shadeOf(1.06);
        mb.sphere((U / n) * 0.46, 6, 2, { squash: 0.13, centreY: false });
        mb.shadeOf(1);
        mb.pop();
      }
    }
  });

def('pathBrick', { name: 'Brick', cat: 'paths', slot: 'cell', cost: 5, zones: ['Bricks', 'Mortar', 'Detail'], tags: 'path brick paving herringbone' },
  (mb) => {
    pavingBase(mb, 1);
    mb.zoneOf(0);
    const rows = 6, cols = 3;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (U / cols) * 0.5;
      for (let c = -1; c <= cols; c++) {
        const x = -HU + (U * (c + 0.5)) / cols + off;
        if (x < -HU + 0.02 || x > HU - 0.02) continue;
        mb.push();
        mb.translate(x, 0.05, -HU + (U * (r + 0.5)) / rows);
        mb.chamfer((U / cols) * 0.90, 0.022, (U / rows) * 0.82, 0.006);
        mb.pop();
      }
    }
  });

def('pathPlank', { name: 'Plank', cat: 'paths', slot: 'cell', cost: 5, zones: ['Planks', 'Gaps', 'Detail'], tags: 'path plank boardwalk wood deck' },
  (mb) => {
    pavingBase(mb, 1);
    mb.zoneOf(0);
    const n = 4;
    for (let i = 0; i < n; i++) {
      mb.push();
      mb.translate(0, 0.05, -HU + (U * (i + 0.5)) / n);
      mb.chamfer(U - 0.03, 0.028, (U / n) - 0.045, 0.008);
      mb.pop();
    }
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * (HU - 0.10), 0.05, 0);
      mb.chamfer(0.05, 0.034, U - 0.04, 0.006);
      mb.pop();
    }
  });

def('pathGravel', { name: 'Gravel', cat: 'paths', slot: 'cell', cost: 4, vary: true, zones: ['Gravel', 'Edging', 'Detail'], tags: 'path gravel loose stones' },
  (mb) => {
    pavingBase(mb, 1);
    mb.zoneOf(0);
    for (let i = 0; i < 26; i++) {
      const a = ((i * 71) % 97) / 97, b = ((i * 43) % 89) / 89;
      mb.push();
      mb.translate(-HU + a * U, 0.05, -HU + b * U);
      mb.rotateY(a * 6.0);
      mb.sphere(0.045 + b * 0.045, 5, 3, { squash: 0.44, centreY: false });
      mb.pop();
    }
  });

def('pathStepping', { name: 'Stepping stones', cat: 'paths', slot: 'cell', cost: 6, vary: true, zones: ['Stones', 'Ground', 'Detail'], tags: 'path stepping stones garden' },
  (mb) => {
    mb.zoneOf(1);
    mb.chamfer(U, 0.035, U, 0.006);
    mb.zoneOf(0);
    for (const [x, z, r] of [[-0.55, -0.62, 0.40], [0.42, -0.10, 0.44], [-0.38, 0.52, 0.38], [0.55, 0.66, 0.34]]) {
      mb.push();
      mb.translate(x, 0.035, z);
      mb.rotateY(x * 3.1);
      mb.extrude(blob(r, 7, 0.35, Math.abs(x * 100) | 0), 0.055);
      mb.pop();
    }
  });

def('pathPaving', { name: 'Plain paving', cat: 'paths', slot: 'cell', cost: 4, zones: ['Paving', 'Joints', 'Detail'], tags: 'path paving slab plain flagstone' },
  (mb) => {
    pavingBase(mb, 1);
    mb.zoneOf(0);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        mb.push();
        mb.translate(-HU + (U * (i + 0.5)) / 2, 0.05, -HU + (U * (j + 0.5)) / 2);
        mb.chamfer(U / 2 - 0.05, 0.024, U / 2 - 0.05, 0.012);
        mb.pop();
      }
    }
  });

// ===========================================================================
// 10.4  PLANTS AND NATURE
// ===========================================================================
def('treeRound', { name: 'Rounded tree', cat: 'plants', slot: 'cell', fit: 'free', cost: 14, vary: true, zones: ['Leaves', 'Trunk', 'Detail'], tags: 'tree round leafy' },
  (mb) => {
    mb.zoneOf(1);
    mb.lathe([[0.24, 0], [0.15, 0.20], [0.13, 1.10], [0.11, 1.55]], 7, { closeBottom: true });
    for (let i = 0; i < 3; i++) {
      mb.push(); mb.rotateY(i * 2.1); mb.translate(0, 1.15, 0); mb.rotateZ(-0.7);
      mb.cylinder(0.055, 0.42, 4, { rTop: 0.03 });
      mb.pop();
    }
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 2.05, 0);
    foliage(mb, 0.86, 4, 3, 0.94);
    mb.pop();
  });

def('treeSlender', { name: 'Slender tree', cat: 'plants', slot: 'cell', fit: 'free', cost: 14, vary: true, zones: ['Leaves', 'Trunk', 'Detail'], tags: 'tree slender tall poplar' },
  (mb) => {
    mb.zoneOf(1);
    mb.lathe([[0.17, 0], [0.11, 0.20], [0.085, 1.6], [0.07, 2.2]], 6, { closeBottom: true });
    mb.zoneOf(0);
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      mb.push();
      mb.translate(0, 1.5 + t * 1.35, 0);
      mb.sphere(0.62 - t * 0.24, 7, 4, { squash: 1.15 });
      mb.pop();
    }
  });

def('treeBlossom', { name: 'Blossom tree', cat: 'plants', slot: 'cell', fit: 'free', cost: 22, level: 2, vary: true, zones: ['Blossom', 'Trunk', 'Petals'], tags: 'tree blossom cherry spring pink' },
  (mb) => {
    mb.zoneOf(1);
    mb.lathe([[0.26, 0], [0.16, 0.22], [0.13, 0.85], [0.115, 1.25]], 7, { closeBottom: true });
    for (let i = 0; i < 4; i++) {
      mb.push(); mb.rotateY(i * 1.62); mb.translate(0, 0.95, 0); mb.rotateZ(-0.85);
      mb.cylinder(0.06, 0.62, 4, { rTop: 0.028 });
      mb.pop();
    }
    mb.zoneOf(0);
    // wide flat canopy
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      mb.push();
      mb.translate(Math.cos(a) * 0.58, 1.62 + ((i % 2) * 0.16), Math.sin(a) * 0.58);
      mb.sphere(0.56, 7, 4, { squash: 0.66 });
      mb.pop();
    }
    mb.push(); mb.translate(0, 1.80, 0); mb.sphere(0.62, 7, 4, { squash: 0.62 }); mb.pop();
    // fallen petals at the foot
    mb.zoneOf(2);
    for (let i = 0; i < 7; i++) {
      const a = (i * 2.4), r = 0.55 + (i % 3) * 0.22;
      mb.push();
      mb.translate(Math.cos(a) * r, 0.015, Math.sin(a) * r);
      mb.sphere(0.10, 5, 2, { squash: 0.12, centreY: false });
      mb.pop();
    }
  });

def('treeFruit', { name: 'Fruit tree', cat: 'plants', slot: 'cell', fit: 'free', cost: 24, level: 3, vary: true, zones: ['Leaves', 'Trunk', 'Fruit'], tags: 'tree fruit apple orchard' },
  (mb) => {
    mb.zoneOf(1);
    mb.lathe([[0.24, 0], [0.15, 0.20], [0.13, 0.95]], 7, { closeBottom: true });
    for (let i = 0; i < 3; i++) {
      mb.push(); mb.rotateY(i * 2.1 + 0.4); mb.translate(0, 0.82, 0); mb.rotateZ(-0.75);
      mb.cylinder(0.055, 0.5, 4, { rTop: 0.03 });
      mb.pop();
    }
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 1.62, 0);
    foliage(mb, 0.82, 4, 7, 0.88);
    mb.pop();
    mb.zoneOf(2);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39, r = 0.42 + ((i * 7) % 5) * 0.10;
      mb.push();
      mb.translate(Math.cos(a) * r, 1.30 + ((i * 11) % 7) * 0.12, Math.sin(a) * r);
      mb.sphere(0.095, 6, 4);
      mb.pop();
    }
  });

def('evergreen', { name: 'Evergreen', cat: 'plants', slot: 'cell', fit: 'free', cost: 16, vary: true, zones: ['Needles', 'Trunk', 'Detail'], tags: 'tree evergreen pine fir conifer' },
  (mb) => {
    mb.zoneOf(1);
    mb.cylinder(0.13, 0.55, 6, { rTop: 0.10 });
    mb.zoneOf(0);
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      mb.push();
      mb.translate(0, 0.42 + t * 1.75, 0);
      mb.cone(0.86 - t * 0.52, 0.86 - t * 0.30, 8, { phase: i * 0.4 });
      mb.pop();
    }
  });

def('treeBare', { name: 'Bare tree', cat: 'plants', slot: 'cell', fit: 'free', cost: 12, vary: true, zones: ['Branches', 'Trunk', 'Detail'], tags: 'tree bare winter branches' },
  (mb) => {
    mb.zoneOf(1);
    mb.lathe([[0.26, 0], [0.16, 0.24], [0.12, 1.30], [0.09, 1.75]], 7, { closeBottom: true });
    mb.zoneOf(0);
    const branch = (x, y, z, ang, tilt, len, r, depth) => {
      mb.push();
      mb.translate(x, y, z);
      mb.rotateY(ang); mb.rotateZ(tilt);
      mb.cylinder(r, len, 4, { rTop: r * 0.55 });
      if (depth > 0) {
        mb.push(); mb.translate(0, len, 0);
        branch(0, 0, 0, 1.1, 0.55, len * 0.66, r * 0.6, depth - 1);
        branch(0, 0, 0, -1.4, -0.62, len * 0.60, r * 0.6, depth - 1);
        mb.pop();
      }
      mb.pop();
    };
    for (let i = 0; i < 4; i++) {
      branch(0, 1.55, 0, (i / 4) * Math.PI * 2, 0.42, 0.66, 0.062, 2);
    }
  });

def('bush', { name: 'Bush', cat: 'plants', slot: 'cell', fit: 'free', cost: 8, vary: true, zones: ['Foliage', 'Stems', 'Berries'], tags: 'bush shrub small green' },
  (mb) => {
    mb.zoneOf(1);
    mb.cylinder(0.075, 0.20, 5);
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.42, 0);
    foliage(mb, 0.48, 4, 11, 0.86);
    mb.pop();
    mb.zoneOf(2);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.9;
      mb.push();
      mb.translate(Math.cos(a) * 0.34, 0.44 + (i % 3) * 0.11, Math.sin(a) * 0.34);
      mb.sphere(0.048, 5, 3);
      mb.pop();
    }
  });

def('flowerbed', { name: 'Flowerbed', cat: 'plants', slot: 'cell', cost: 13, vary: true, zones: ['Soil', 'Edging', 'Flowers'], tags: 'flowers bed garden colourful' },
  (mb) => {
    mb.zoneOf(1);
    mb.extrude(roundRect(U * 0.92, U * 0.92, 0.30, 3), 0.10);
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.10, 0);
    mb.extrude(roundRect(U * 0.80, U * 0.80, 0.26, 3), 0.05);
    mb.pop();
    mb.push(); mb.translate(0, 0.15, 0);
    for (let i = 0; i < 11; i++) {
      const a = i * 2.39, r = 0.18 + ((i * 5) % 7) * 0.10;
      mb.push();
      mb.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
      flower(mb, 0.20 + ((i * 3) % 5) * 0.035, 0.055, 5 + (i % 2));
      mb.pop();
    }
    mb.pop();
  });

def('tallGrass', { name: 'Tall grasses', cat: 'plants', slot: 'cell', fit: 'free', cost: 7, vary: true, zones: ['Blades', 'Base', 'Tips'], tags: 'grass tall reeds ornamental' },
  (mb) => {
    mb.zoneOf(0);
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39, r = ((i * 7) % 9) / 9 * 0.34;
      const h = 0.55 + ((i * 11) % 7) / 7 * 0.55;
      mb.push();
      mb.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
      mb.rotateY(a);
      mb.rotateZ((((i * 13) % 11) / 11 - 0.5) * 0.6);
      mb.lathe([[0.045, 0], [0.032, h * 0.55], [0.006, h]], 3, { closeBottom: true });
      mb.pop();
    }
  });

def('pottedPlant', { name: 'Potted plant', cat: 'plants', slot: 'cell', fit: 'free', cost: 11, vary: true, zones: ['Pot', 'Soil', 'Leaves'], tags: 'plant pot potted indoor' },
  (mb) => {
    pot(mb, 0.30, 0.22, 0.40);
    mb.zoneOf(2);
    mb.push(); mb.translate(0, 0.42, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mb.push();
      mb.rotateY(a);
      mb.translate(0.12, 0.10, 0);
      mb.rotateZ(-0.85);
      mb.lathe([[0.03, 0], [0.16, 0.24], [0.11, 0.46], [0.01, 0.58]], 4, { closeBottom: true });
      mb.pop();
    }
    mb.push(); mb.translate(0, 0.18, 0); mb.sphere(0.20, 6, 4, { squash: 0.8 }); mb.pop();
    mb.pop();
  });

def('hangingPlanter', { name: 'Hanging planter', cat: 'plants', slot: 'edge', fit: 'free', cost: 15, level: 2, vary: true, zones: ['Pot', 'Rope', 'Trailing'], tags: 'planter hanging basket trailing' },
  (mb) => {
    const top = U * 0.92;
    mb.zoneOf(1);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      mb.push();
      mb.translate(Math.cos(a) * 0.16, top - 0.42, Math.sin(a) * 0.16);
      mb.rotateZ(Math.cos(a) * 0.34); mb.rotateX(-Math.sin(a) * 0.34);
      mb.cylinder(0.014, 0.44, 4);
      mb.pop();
    }
    mb.push(); mb.translate(0, top, 0);
    mb.cylinder(0.03, 0.06, 5);
    mb.pop();
    mb.zoneOf(0);
    mb.push(); mb.translate(0, top - 0.60, 0);
    mb.lathe([[0.05, 0], [0.20, 0.10], [0.26, 0.20], [0.26, 0.24]], 9, { closeBottom: true });
    mb.pop();
    mb.zoneOf(2);
    mb.push(); mb.translate(0, top - 0.38, 0);
    mb.sphere(0.26, 7, 4, { squash: 0.6 });
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      mb.push();
      mb.translate(Math.cos(a) * 0.20, -0.12, Math.sin(a) * 0.20);
      mb.lathe([[0.05, 0], [0.035, -0.22], [0.02, -0.42]], 4);
      mb.pop();
    }
    mb.pop();
  });

def('climbingVine', { name: 'Climbing vine', cat: 'plants', slot: 'edge', fit: 'span', cost: 12, level: 2, vary: true, zones: ['Leaves', 'Stems', 'Flowers'], tags: 'vine climbing ivy wall' },
  (mb) => {
    mb.zoneOf(1);
    for (let i = 0; i < 3; i++) {
      const x = -U / 3 + (U / 3) * i;
      const seg = 7;
      for (let j = 0; j < seg; j++) {
        const t = j / seg;
        mb.push();
        mb.translate(x + Math.sin(t * 5 + i) * 0.16, U * t, 0.02);
        mb.rotateZ(Math.cos(t * 5 + i) * 0.4);
        mb.cylinder(0.018, U / seg + 0.02, 4);
        mb.pop();
      }
    }
    mb.zoneOf(0);
    for (let i = 0; i < 22; i++) {
      const t = ((i * 7) % 23) / 23;
      const x = -U / 2 + ((i * 13) % 19) / 19 * U;
      mb.push();
      mb.translate(x, U * t, 0.045);
      mb.rotateY(i * 1.1);
      mb.rotateX(-0.5);
      mb.sphere(0.11, 5, 3, { squash: 0.24 });
      mb.pop();
    }
    mb.zoneOf(2);
    for (let i = 0; i < 5; i++) {
      mb.push();
      mb.translate(-U / 2 + ((i * 17) % 13) / 13 * U, U * (((i * 5) % 11) / 11), 0.06);
      mb.sphere(0.055, 5, 3, { squash: 0.6 });
      mb.pop();
    }
  });

def('rock', { name: 'Rock', cat: 'plants', slot: 'cell', fit: 'free', cost: 5, vary: true, zones: ['Rock', 'Moss', 'Detail'], tags: 'rock stone boulder' },
  (mb) => {
    mb.zoneOf(0);
    mb.push(); mb.rotateY(0.6);
    mb.lathe([[0.30, 0], [0.46, 0.14], [0.42, 0.38], [0.24, 0.55], [0, 0.62]], 6, { closeBottom: true });
    mb.pop();
    mb.push(); mb.translate(0.30, 0, 0.16); mb.rotateY(1.9);
    mb.lathe([[0.18, 0], [0.26, 0.08], [0.20, 0.24], [0, 0.30]], 5, { closeBottom: true });
    mb.pop();
    mb.zoneOf(1);
    mb.push(); mb.translate(-0.10, 0.40, 0.10);
    mb.sphere(0.16, 5, 3, { squash: 0.22 });
    mb.pop();
  });

def('log', { name: 'Log', cat: 'plants', slot: 'cell', fit: 'free', cost: 6, vary: true, zones: ['Bark', 'Rings', 'Moss'], tags: 'log wood fallen trunk' },
  (mb) => {
    mb.zoneOf(0);
    mb.push();
    mb.translate(0, 0.22, 0);
    mb.rotateZ(Math.PI / 2);
    mb.cylinder(0.22, U * 0.82, 8, { centreY: true, rTop: 0.20 });
    mb.pop();
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push();
      mb.translate(sx * U * 0.41, 0.22, 0);
      mb.rotateZ(Math.PI / 2);
      mb.cylinder(0.185, 0.03, 8, { centreY: true });
      mb.pop();
    }
    mb.zoneOf(2);
    mb.push(); mb.translate(0.10, 0.40, 0.06);
    mb.sphere(0.13, 5, 3, { squash: 0.28 });
    mb.pop();
  });

// ===========================================================================
// 10.5  WATER
// ===========================================================================
def('pond', { name: 'Small pond', cat: 'water', slot: 'cell', cost: 26, level: 2, zones: ['Water', 'Bank', 'Plants'], tags: 'pond water garden lily' },
  (mb) => {
    mb.zoneOf(1);
    mb.extrude(blob(U * 0.46, 10, 0.22, 5), 0.10);
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.07, 0);
    mb.extrude(blob(U * 0.38, 10, 0.20, 5), 0.02);
    mb.pop();
    mb.zoneOf(2);
    for (const [x, z, r] of [[0.24, 0.18, 0.16], [-0.30, 0.30, 0.13], [0.10, -0.36, 0.11]]) {
      mb.push(); mb.translate(x, 0.09, z);
      mb.sphere(r, 6, 2, { squash: 0.10, centreY: false });
      mb.pop();
    }
    mb.push(); mb.translate(0.24, 0.12, 0.18); flower(mb, 0.09, 0.05, 6); mb.pop();
    mb.zoneOf(1);
    for (let i = 0; i < 8; i++) {
      const a = i * 2.39;
      mb.push();
      mb.translate(Math.cos(a) * U * 0.44, 0.05, Math.sin(a) * U * 0.44);
      mb.rotateY(a);
      mb.sphere(0.13, 5, 3, { squash: 0.36 });
      mb.pop();
    }
  });

def('fountain', { name: 'Fountain', cat: 'water', slot: 'cell', cost: 48, level: 4, glows: true, zones: ['Stone', 'Basin', 'Water'], tags: 'fountain water feature centrepiece' },
  (mb) => {
    mb.zoneOf(0);
    mb.lathe([[U * 0.46, 0], [U * 0.48, 0.18], [U * 0.46, 0.34], [U * 0.40, 0.36], [U * 0.40, 0.10], [U * 0.36, 0.08]], 12, { closeBottom: true });
    mb.zoneOf(2);
    mb.push(); mb.translate(0, 0.14, 0);
    mb.cylinder(U * 0.385, 0.02, 12);
    mb.pop();
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.10, 0);
    mb.lathe([[0.24, 0], [0.16, 0.14], [0.13, 0.52], [0.22, 0.58], [0.34, 0.64], [0.32, 0.70], [0.12, 0.72]], 10, { closeBottom: true });
    // upper bowl
    mb.push(); mb.translate(0, 0.72, 0);
    mb.lathe([[0.10, 0], [0.09, 0.26], [0.16, 0.32], [0.24, 0.38], [0.22, 0.42], [0.06, 0.44]], 10);
    mb.pop();
    mb.pop();
    // water: a rising jet and two falling sheets
    mb.zoneOf(2);
    mb.push(); mb.translate(0, 1.28, 0);
    mb.lathe([[0.045, 0], [0.03, 0.26], [0.05, 0.40], [0.09, 0.46]], 6);
    mb.pop();
    mb.push(); mb.translate(0, 0.80, 0);
    mb.lathe([[0.215, 0.34], [0.225, 0.20], [0.20, 0.02]], 10);
    mb.pop();
  });

def('streamTile', { name: 'Stream tile', cat: 'water', slot: 'cell', cost: 14, level: 2, zones: ['Water', 'Bed', 'Stones'], tags: 'stream water channel brook' },
  (mb) => {
    mb.zoneOf(1);
    mb.chamfer(U, 0.06, U, 0.01);
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.03, 0);
    mb.extrude([[-HU, -U * 0.30], [HU, -U * 0.34], [HU, U * 0.32], [-HU, U * 0.28]], 0.035);
    mb.pop();
    mb.zoneOf(2);
    for (let i = 0; i < 7; i++) {
      const t = (i + 0.5) / 7;
      mb.push();
      mb.translate(-HU + U * t, 0.06, Math.sin(t * 6) * 0.18);
      mb.sphere(0.09 + (i % 3) * 0.03, 5, 3, { squash: 0.40, centreY: false });
      mb.pop();
    }
  });

def('wishingWell', { name: 'Wishing well', cat: 'water', slot: 'cell', fit: 'free', cost: 40, level: 5, zones: ['Stone', 'Roof', 'Bucket'], tags: 'well wishing water stone roof' },
  (mb) => {
    mb.zoneOf(0);
    mb.lathe([[0.50, 0], [0.52, 0.10], [0.50, 0.44], [0.54, 0.50], [0.50, 0.56], [0.42, 0.56], [0.42, 0.10], [0.40, 0.06]], 10, { closeBottom: true });
    mb.zoneOf(2);
    mb.push(); mb.translate(0, 0.22, 0); mb.cylinder(0.40, 0.02, 10); mb.pop();
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * 0.40, 0.50, 0);
      plank(mb, 0.10, 0.85, 0.10, 0.015);
      mb.pop();
    }
    mb.push(); mb.translate(0, 1.35, 0);
    mb.wedge(1.30, 0.42, 1.10, { overhang: 0.10 });
    mb.pop();
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 1.28, 0);
    mb.rotateZ(Math.PI / 2);
    mb.cylinder(0.055, 0.90, 6, { centreY: true });
    mb.pop();
    mb.zoneOf(2);
    mb.push(); mb.translate(0, 0.98, 0);
    mb.cylinder(0.015, 0.28, 4);
    mb.push(); mb.translate(0, -0.22, 0);
    mb.lathe([[0.15, 0], [0.17, 0.20], [0.15, 0.22]], 8, { closeBottom: true });
    mb.pop(); mb.pop();
  });

// Decor, seasonal and prestige items register into this same table.
export { REG as PART_REGISTRY, def, plank, turnedPost, foliage, flower, pot, shingles };
