/**
 * Decor, seasonal and prestige items. Registers into the same part table as
 * kit/parts.js — importing this module is what makes these items exist.
 */

import { def, U, plank, flower, pot } from './parts.js';
import { MeshBuilder, roundRect, blob } from './mesh.js';

const HU = U / 2;

/** Slack rope/wire between two points, as a chain of short segments. */
function catenary(mb, x0, y0, x1, y1, sag, r, seg = 9, z = 0) {
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg, t1 = (i + 1) / seg;
    const p = (t) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag];
    const a = p(t0), b = p(t1);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.01;
    mb.push();
    mb.translate(mx, my, z);
    mb.rotateZ(Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.PI / 2);
    mb.cylinder(r, len, 4, { centreY: true });
    mb.pop();
  }
}

// ===========================================================================
// 10.6  DECOR
// ===========================================================================
def('bench', { name: 'Bench', cat: 'decor', slot: 'cell', fit: 'free', cost: 18, zones: ['Slats', 'Frame', 'Detail'], tags: 'bench seat sit park' },
  (mb) => {
    const w = U * 0.86, seatY = 0.44;
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      // cast side frame: leg, apron, curved arm
      mb.push(); mb.translate(sx * (w / 2 - 0.07), 0, -0.14);
      plank(mb, 0.07, seatY, 0.09); mb.pop();
      mb.push(); mb.translate(sx * (w / 2 - 0.07), 0, 0.16);
      plank(mb, 0.07, seatY, 0.09); mb.pop();
      mb.push(); mb.translate(sx * (w / 2 - 0.07), seatY - 0.05, 0);
      plank(mb, 0.07, 0.06, 0.44); mb.pop();
      // back upright, raked
      mb.push(); mb.translate(sx * (w / 2 - 0.07), seatY, -0.16);
      mb.rotateX(0.20);
      plank(mb, 0.07, 0.50, 0.07); mb.pop();
      // armrest
      mb.push(); mb.translate(sx * (w / 2 - 0.07), seatY + 0.24, 0.02);
      plank(mb, 0.075, 0.055, 0.34, 0.014); mb.pop();
    }
    mb.zoneOf(0);
    for (let i = 0; i < 3; i++) {
      mb.push(); mb.translate(0, seatY, -0.12 + i * 0.13);
      plank(mb, w - 0.05, 0.045, 0.105, 0.012); mb.pop();
    }
    for (let i = 0; i < 3; i++) {
      mb.push();
      mb.translate(0, seatY + 0.14 + i * 0.14, -0.18 - i * 0.028);
      mb.rotateX(0.20);
      plank(mb, w - 0.05, 0.105, 0.042, 0.012);
      mb.pop();
    }
  });

def('picnicBlanket', { name: 'Picnic blanket', cat: 'decor', slot: 'cell', cost: 9, vary: true, zones: ['Cloth', 'Check', 'Basket'], tags: 'blanket picnic rug ground' },
  (mb) => {
    mb.zoneOf(0);
    mb.extrude(roundRect(U * 0.84, U * 0.84, 0.10, 2), 0.022);
    mb.zoneOf(1);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if ((i + j) % 2) continue;
        mb.push();
        mb.translate(-U * 0.28 + i * U * 0.28, 0.022, -U * 0.28 + j * U * 0.28);
        mb.chamfer(U * 0.24, 0.006, U * 0.24, 0.004);
        mb.pop();
      }
    }
    mb.zoneOf(2);
    mb.push(); mb.translate(U * 0.20, 0.028, -U * 0.18);
    mb.lathe([[0.16, 0], [0.19, 0.16], [0.20, 0.19]], 8, { closeBottom: true });
    mb.push(); mb.translate(0, 0.19, 0);
    mb.torus(0.15, 0.022, 8, 4);
    mb.pop(); mb.pop();
  });

def('lamppost', { name: 'Lamppost', cat: 'decor', slot: 'corner', fit: 'free', cost: 30, level: 2, glows: true, zones: ['Post', 'Ironwork', 'Lantern'], tags: 'lamp light lamppost street glow' },
  (mb) => {
    const H = 3.4;
    mb.zoneOf(1);
    mb.lathe([[0.26, 0], [0.26, 0.08], [0.20, 0.13], [0.18, 0.42], [0.22, 0.48], [0.15, 0.55]], 8, { closeBottom: true });
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.55, 0);
    mb.cylinder(0.085, H - 0.55, 8, { rTop: 0.06 });
    mb.pop();
    mb.zoneOf(1);
    mb.push(); mb.translate(0, H * 0.55, 0);
    mb.lathe([[0.075, 0], [0.13, 0.05], [0.13, 0.11], [0.075, 0.15]], 8);
    mb.pop();
    // lantern
    mb.push(); mb.translate(0, H, 0);
    mb.lathe([[0.06, 0], [0.15, 0.05], [0.19, 0.10]], 6);
    mb.zoneOf(2);
    mb.lathe([[0.19, 0.10], [0.22, -0.10], [0.19, -0.36], [0.10, -0.46]], 6);
    mb.zoneOf(1);
    // cap and finial
    mb.push(); mb.translate(0, 0.10, 0);
    mb.cone(0.23, 0.18, 6);
    mb.push(); mb.translate(0, 0.18, 0);
    mb.sphere(0.05, 6, 4);
    mb.pop(); mb.pop();
    mb.push(); mb.translate(0, -0.48, 0); mb.sphere(0.045, 6, 3); mb.pop();
    mb.pop();
  });

def('mailbox', { name: 'Mailbox', cat: 'decor', slot: 'cell', fit: 'free', cost: 12, zones: ['Box', 'Post', 'Flag'], tags: 'mailbox post letter' },
  (mb) => {
    mb.zoneOf(1);
    plank(mb, 0.11, 1.05, 0.11, 0.015);
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 1.05, 0);
    mb.lathe([[0.20, 0], [0.20, 0.16], [0.17, 0.24], [0.10, 0.28], [0, 0.29]], 8, { phase: Math.PI / 8, closeBottom: true });
    mb.pop();
    // barrel body along Z
    mb.push(); mb.translate(0, 1.20, 0);
    mb.rotateX(Math.PI / 2);
    mb.cylinder(0.17, 0.46, 8, { centreY: true, phase: Math.PI / 8 });
    mb.pop();
    mb.zoneOf(2);
    mb.push(); mb.translate(0.15, 1.30, 0.02);
    plank(mb, 0.03, 0.24, 0.06, 0.006);
    mb.push(); mb.translate(0, 0.24, 0);
    plank(mb, 0.03, 0.10, 0.14, 0.006);
    mb.pop(); mb.pop();
    mb.zoneOf(1);
    mb.push(); mb.translate(0, 1.20, 0.24);
    mb.chamfer(0.30, 0.26, 0.025, 0.01, { centreY: true });
    mb.pop();
  });

def('birdhouse', { name: 'Birdhouse', cat: 'decor', slot: 'cell', fit: 'free', cost: 14, zones: ['House', 'Roof', 'Perch'], tags: 'birdhouse bird nest garden' },
  (mb) => {
    mb.zoneOf(1);
    plank(mb, 0.085, 1.45, 0.085, 0.012);
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 1.45, 0);
    mb.chamfer(0.40, 0.40, 0.34, 0.02);
    mb.pop();
    mb.zoneOf(1);
    mb.push(); mb.translate(0, 1.85, 0);
    mb.wedge(0.50, 0.24, 0.44, { overhang: 0.05 });
    mb.pop();
    mb.zoneOf(2);
    // entrance hole ring + perch
    mb.push(); mb.translate(0, 1.66, 0.175);
    mb.rotateX(Math.PI / 2);
    mb.torus(0.075, 0.022, 8, 4);
    mb.pop();
    mb.push(); mb.translate(0, 1.56, 0.20);
    mb.rotateX(Math.PI / 2);
    mb.cylinder(0.016, 0.13, 4);
    mb.pop();
  });

def('firewood', { name: 'Firewood stack', cat: 'decor', slot: 'cell', fit: 'free', cost: 10, vary: true, zones: ['Bark', 'Ends', 'Detail'], tags: 'firewood logs stack winter' },
  (mb) => {
    const w = U * 0.72;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const n = 4 - (r % 2 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const rr = 0.11;
        mb.zoneOf(0);
        mb.push();
        mb.translate(-w / 2 + (w * (i + 0.5)) / n, rr + r * rr * 1.85, 0);
        mb.rotateZ(Math.PI / 2);
        mb.cylinder(rr, w * 0.92, 7, { centreY: true });
        mb.pop();
        mb.zoneOf(1);
        for (const sz of [-1, 1]) {
          mb.push();
          mb.translate(-w / 2 + (w * (i + 0.5)) / n, rr + r * rr * 1.85, sz * w * 0.46);
          mb.rotateX(Math.PI / 2);
          mb.cylinder(rr * 0.94, 0.012, 7, { centreY: true });
          mb.pop();
        }
      }
    }
  });

def('windChimes', { name: 'Wind chimes', cat: 'decor', slot: 'edge', fit: 'free', cost: 16, level: 2, zones: ['Disc', 'Cord', 'Tubes'], tags: 'chimes wind hanging sound' },
  (mb) => {
    const top = U * 0.90;
    mb.zoneOf(1);
    mb.push(); mb.translate(0, top, 0); mb.cylinder(0.02, 0.10, 4); mb.pop();
    mb.zoneOf(0);
    mb.push(); mb.translate(0, top - 0.12, 0);
    mb.lathe([[0.20, 0], [0.21, -0.03], [0.18, -0.06]], 9, { closeTop: true, closeBottom: true });
    mb.pop();
    mb.zoneOf(2);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const len = 0.34 + (i % 3) * 0.10;
      mb.push();
      mb.translate(Math.cos(a) * 0.14, top - 0.20, Math.sin(a) * 0.14);
      mb.zoneOf(1); mb.cylinder(0.006, 0.10, 3); mb.zoneOf(2);
      mb.push(); mb.translate(0, -len - 0.02, 0);
      mb.cylinder(0.028, len, 6);
      mb.pop(); mb.pop();
    }
    mb.zoneOf(1);
    mb.push(); mb.translate(0, top - 0.62, 0);
    mb.chamfer(0.16, 0.02, 0.16, 0.006);
    mb.pop();
  });

def('stringLights', { name: 'String lights', cat: 'decor', slot: 'edge', fit: 'span', cost: 20, level: 2, glows: true, zones: ['Wire', 'Fittings', 'Bulbs'], tags: 'lights string festoon glow night' },
  (mb) => {
    const y = U * 0.88;
    mb.zoneOf(0);
    catenary(mb, -U / 2, y, U / 2, y, 0.34, 0.012, 10);
    const n = 7;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const bx = -U / 2 + U * t;
      const by = y - Math.sin(t * Math.PI) * 0.34;
      mb.zoneOf(1);
      mb.push(); mb.translate(bx, by - 0.04, 0);
      mb.cylinder(0.022, 0.05, 5);
      mb.pop();
      mb.zoneOf(2);
      mb.push(); mb.translate(bx, by - 0.14, 0);
      mb.lathe([[0.02, 0.10], [0.062, 0.055], [0.068, -0.02], [0.04, -0.062], [0, -0.075]], 6);
      mb.pop();
    }
  });

def('outdoorRug', { name: 'Outdoor rug', cat: 'decor', slot: 'cell', cost: 8, zones: ['Rug', 'Border', 'Pattern'], tags: 'rug outdoor mat ground' },
  (mb) => {
    mb.zoneOf(1);
    mb.extrude(roundRect(U * 0.88, U * 0.68, 0.06, 2), 0.016);
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.016, 0);
    mb.extrude(roundRect(U * 0.78, U * 0.58, 0.05, 2), 0.006);
    mb.pop();
    mb.zoneOf(2);
    for (let i = 0; i < 3; i++) {
      mb.push();
      mb.translate(0, 0.022, -U * 0.16 + i * U * 0.16);
      mb.chamfer(U * 0.62, 0.005, 0.05, 0.003);
      mb.pop();
    }
    // fringe
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        mb.push();
        mb.translate(sx * U * 0.45, 0.008, -U * 0.30 + (U * 0.60 * i) / 8);
        mb.chamfer(0.06, 0.008, 0.018, 0.003);
        mb.pop();
      }
    }
  });

def('hammock', { name: 'Hammock', cat: 'decor', slot: 'cell', fit: 'span', cost: 26, level: 3, zones: ['Cloth', 'Posts', 'Rope'], tags: 'hammock relax swing garden' },
  (mb) => {
    const span = U * 1.6, h = 1.5;
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * span / 2, 0, 0);
      mb.rotateZ(sx * 0.13);
      mb.lathe([[0.13, 0], [0.10, 0.20], [0.085, h], [0.07, h + 0.06]], 7, { closeBottom: true });
      mb.pop();
    }
    mb.zoneOf(2);
    catenary(mb, -span / 2 + 0.10, h, -span * 0.28, h - 0.42, 0.06, 0.014, 4);
    catenary(mb, span / 2 - 0.10, h, span * 0.28, h - 0.42, 0.06, 0.014, 4);
    mb.zoneOf(0);
    // slung cloth: a run of slats following the sag
    const seg = 11;
    for (let i = 0; i < seg; i++) {
      const t = (i + 0.5) / seg;
      const x = -span * 0.28 + span * 0.56 * t;
      const y = h - 0.42 - Math.sin(t * Math.PI) * 0.34;
      mb.push();
      mb.translate(x, y, 0);
      mb.rotateZ(Math.cos(t * Math.PI) * 0.42);
      mb.chamfer((span * 0.56) / seg + 0.03, 0.03, 0.62, 0.01);
      mb.pop();
    }
  });

def('signpost', { name: 'Signpost', cat: 'decor', slot: 'cell', fit: 'free', cost: 13, zones: ['Post', 'Boards', 'Detail'], tags: 'sign signpost direction post' },
  (mb) => {
    mb.zoneOf(0);
    mb.lathe([[0.10, 0], [0.085, 0.10], [0.075, 1.80], [0.09, 1.86]], 7, { closeBottom: true });
    mb.push(); mb.translate(0, 1.86, 0); mb.cone(0.11, 0.16, 7); mb.pop();
    mb.zoneOf(1);
    const boards = [[1.60, 0.5, 1], [1.30, 2.4, -1], [1.02, 4.0, 1]];
    for (const [y, a, dir] of boards) {
      mb.push();
      mb.translate(0, y, 0);
      mb.rotateY(a);
      mb.translate(dir * 0.30, 0, 0);
      mb.chamfer(0.56, 0.19, 0.045, 0.015, { centreY: true });
      // pointed end
      mb.push(); mb.translate(dir * 0.28, 0, 0);
      mb.rotateZ(Math.PI / 2); mb.rotateY(dir > 0 ? 0 : Math.PI);
      mb.cone(0.10, 0.11, 3);
      mb.pop();
      mb.zoneOf(2);
      mb.push(); mb.translate(0, 0, 0.026);
      mb.chamfer(0.40, 0.045, 0.008, 0.003, { centreY: true });
      mb.pop();
      mb.zoneOf(1);
      mb.pop();
    }
  });

def('cafeSet', { name: 'Café table and chairs', cat: 'decor', slot: 'cell', fit: 'free', cost: 30, level: 2, zones: ['Frame', 'Top', 'Detail'], tags: 'cafe table chairs bistro seat' },
  (mb) => {
    // table
    mb.zoneOf(0);
    mb.lathe([[0.26, 0], [0.24, 0.03], [0.06, 0.08], [0.05, 0.66]], 8, { closeBottom: true });
    mb.zoneOf(1);
    mb.push(); mb.translate(0, 0.66, 0);
    mb.lathe([[0.05, 0], [0.42, 0.02], [0.44, 0.05], [0.42, 0.07], [0.05, 0.075]], 12,
      { closeTop: true, closeBottom: true });
    mb.pop();
    // two chairs
    for (const [ax, az, rot] of [[0.78, 0.10, -0.3], [-0.72, -0.22, 2.9]]) {
      mb.push();
      mb.translate(ax, 0, az);
      mb.rotateY(rot);
      mb.zoneOf(0);
      for (const [lx, lz] of [[-0.16, -0.16], [0.16, -0.16], [0.16, 0.16], [-0.16, 0.16]]) {
        mb.push(); mb.translate(lx, 0, lz);
        mb.cylinder(0.022, 0.42, 5);
        mb.pop();
      }
      mb.zoneOf(1);
      mb.push(); mb.translate(0, 0.42, 0);
      mb.lathe([[0.24, 0], [0.25, 0.02], [0.23, 0.045]], 10,
        { closeTop: true, closeBottom: true });
      mb.pop();
      mb.zoneOf(0);
      // curved bistro back
      for (let i = 0; i < 5; i++) {
        const a = -0.8 + (i / 4) * 1.6;
        mb.push();
        mb.translate(Math.sin(a) * 0.21, 0.44, -Math.cos(a) * 0.21);
        mb.cylinder(0.018, 0.44, 4);
        mb.pop();
      }
      mb.push(); mb.translate(0, 0.86, -0.14);
      mb.rotateX(0.2);
      mb.chamfer(0.36, 0.05, 0.05, 0.014);
      mb.pop();
      mb.pop();
    }
  });

def('bicycle', { name: 'Bicycle', cat: 'decor', slot: 'cell', fit: 'free', cost: 22, level: 2, zones: ['Frame', 'Tyres', 'Detail'], tags: 'bicycle bike wheels' },
  (mb) => {
    const R = 0.36;
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push();
      mb.translate(sx * 0.52, R, 0);
      mb.rotateX(Math.PI / 2);
      mb.torus(R, 0.045, 12, 5);
      mb.zoneOf(2);
      mb.cylinder(0.05, 0.06, 6, { centreY: true });
      for (let i = 0; i < 6; i++) {
        mb.push(); mb.rotateZ((i / 6) * Math.PI);
        mb.chamfer(R * 1.9, 0.012, 0.012, 0.004, { centreY: true });
        mb.pop();
      }
      mb.zoneOf(1);
      mb.pop();
    }
    mb.zoneOf(0);
    const tube = (x0, y0, x1, y1, r = 0.032) => {
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const len = Math.hypot(x1 - x0, y1 - y0);
      mb.push();
      mb.translate(mx, my, 0);
      mb.rotateZ(Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2);
      mb.cylinder(r, len, 6, { centreY: true });
      mb.pop();
    };
    tube(-0.52, R, -0.06, 0.72);   // seat stay
    tube(-0.06, 0.72, 0.40, 0.78); // top tube
    tube(-0.52, R, 0.10, 0.34);    // chain stay
    tube(0.10, 0.34, 0.40, 0.78);  // seat tube
    tube(0.40, 0.78, 0.52, R);     // fork
    tube(-0.06, 0.72, 0.10, 0.34); // down tube
    mb.zoneOf(2);
    mb.push(); mb.translate(-0.06, 0.80, 0);
    mb.sphere(0.10, 6, 3, { squash: 0.34 });
    mb.pop();
    mb.push(); mb.translate(0.42, 0.86, 0);
    mb.rotateZ(Math.PI / 2);
    mb.cylinder(0.02, 0.44, 5, { centreY: true });
    mb.pop();
    mb.push(); mb.translate(0.10, 0.30, 0);
    mb.rotateX(Math.PI / 2);
    mb.cylinder(0.09, 0.03, 8, { centreY: true });
    mb.pop();
  });

def('planterBox', { name: 'Planter box', cat: 'decor', slot: 'cell', cost: 14, vary: true, zones: ['Box', 'Rim', 'Plants'], tags: 'planter box trough plants' },
  (mb) => {
    const w = U * 0.84, d = U * 0.42, h = 0.44;
    mb.zoneOf(0);
    mb.chamfer(w, h, d, 0.025);
    mb.zoneOf(1);
    mb.push(); mb.translate(0, h, 0); mb.chamfer(w + 0.07, 0.06, d + 0.07, 0.018); mb.pop();
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * (w / 2 - 0.05), 0, 0);
      mb.chamfer(0.08, h + 0.08, d + 0.03, 0.015);
      mb.pop();
    }
    mb.zoneOf(2);
    mb.push(); mb.translate(0, h + 0.04, 0);
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 6;
      mb.push();
      mb.translate(-w / 2 + w * t, 0, ((i % 2) - 0.5) * d * 0.36);
      mb.sphere(0.19, 6, 4, { squash: 0.74, centreY: false });
      mb.pop();
    }
    for (let i = 0; i < 4; i++) {
      mb.push();
      mb.translate(-w * 0.30 + (w * 0.6 * i) / 3, 0.14, 0);
      flower(mb, 0.16, 0.05, 5);
      mb.pop();
    }
    mb.pop();
  });

def('gardenArch', { name: 'Garden arch', cat: 'decor', slot: 'edge', fit: 'span', cost: 34, level: 3, zones: ['Frame', 'Lattice', 'Flowers'], tags: 'arch garden trellis rose' },
  (mb) => {
    const w = U * 0.86, h = 2.1, r = w / 2;
    mb.zoneOf(0);
    for (const sx of [-1, 1]) {
      for (const sz of [-0.16, 0.16]) {
        mb.push(); mb.translate(sx * r, 0, sz);
        mb.chamfer(0.075, h, 0.075, 0.015);
        mb.pop();
      }
    }
    // arched top: a fan of short segments
    const seg = 8;
    for (const sz of [-0.16, 0.16]) {
      for (let i = 0; i < seg; i++) {
        const a = Math.PI * (i + 0.5) / seg;
        mb.push();
        mb.translate(-Math.cos(a) * r, h + Math.sin(a) * r * 0.72, sz);
        mb.rotateZ(a - Math.PI / 2);
        mb.chamfer(0.075, (Math.PI * r) / seg * 0.86, 0.075, 0.012, { centreY: true });
        mb.pop();
      }
    }
    mb.zoneOf(1);
    // lattice on both sides
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        mb.push();
        mb.translate(sx * r, 0.20 + i * 0.40, 0);
        mb.chamfer(0.10, 0.035, 0.34, 0.008);
        mb.pop();
      }
    }
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (i + 0.5) / 5;
      mb.push();
      mb.translate(-Math.cos(a) * r, h + Math.sin(a) * r * 0.72, 0);
      mb.chamfer(0.06, 0.035, 0.34, 0.008);
      mb.pop();
    }
    mb.zoneOf(2);
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * ((i * 7) % 13) / 13;
      const sx = i % 2 ? 1 : -1;
      mb.push();
      mb.translate(-Math.cos(a) * r + sx * 0.05, h * ((i % 5) / 5) + Math.sin(a) * r * 0.2, ((i % 3) - 1) * 0.17);
      mb.sphere(0.075, 5, 3);
      mb.pop();
    }
  });

def('gardenSwing', { name: 'Garden swing', cat: 'decor', slot: 'cell', fit: 'span', cost: 38, level: 4, zones: ['Frame', 'Seat', 'Chains'], tags: 'swing seat garden bench' },
  (mb) => {
    const span = U * 1.5, h = 2.0;
    mb.zoneOf(0);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        mb.push();
        mb.translate(sx * span / 2, 0, sz * 0.46);
        mb.rotateZ(-sx * 0.14); mb.rotateX(-sz * 0.12);
        mb.chamfer(0.10, h, 0.10, 0.02);
        mb.pop();
      }
    }
    mb.push(); mb.translate(0, h - 0.06, 0);
    mb.chamfer(span + 0.24, 0.12, 0.13, 0.025);
    mb.pop();
    mb.zoneOf(2);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        mb.push();
        mb.translate(sx * span * 0.30, h - 0.60, sz * 0.24);
        mb.cylinder(0.014, 0.54, 4);
        mb.pop();
      }
    }
    mb.zoneOf(1);
    mb.push(); mb.translate(0, h - 0.62, 0);
    for (let i = 0; i < 3; i++) {
      mb.push(); mb.translate(0, 0, -0.16 + i * 0.16);
      mb.chamfer(span * 0.74, 0.045, 0.13, 0.012);
      mb.pop();
    }
    for (let i = 0; i < 3; i++) {
      mb.push();
      mb.translate(0, 0.14 + i * 0.15, -0.22 - i * 0.03);
      mb.rotateX(0.22);
      mb.chamfer(span * 0.74, 0.115, 0.04, 0.012);
      mb.pop();
    }
    mb.pop();
  });

// ===========================================================================
// 10.7  SEASONAL
// ===========================================================================
def('bunting', { name: 'Bunting', cat: 'seasonal', slot: 'edge', fit: 'span', cost: 12, zones: ['Cord', 'Flags A', 'Flags B'], tags: 'bunting flags party seasonal' },
  (mb) => {
    const y = U * 0.90;
    mb.zoneOf(0);
    catenary(mb, -U / 2, y, U / 2, y, 0.28, 0.011, 10);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const bx = -U / 2 + U * t;
      const by = y - Math.sin(t * Math.PI) * 0.28;
      mb.zoneOf(i % 2 ? 1 : 2);
      mb.push();
      mb.translate(bx, by - 0.10, 0);
      mb.rotateY(0.1 * i);
      // triangular pennant
      mb.rotateX(Math.PI / 2);
      mb.extrude([[-0.085, 0.10], [0.085, 0.10], [0, -0.10]], 0.008);
      mb.pop();
    }
  });

def('tulipBed', { name: 'Tulip bed', cat: 'seasonal', slot: 'cell', cost: 15, vary: true, zones: ['Soil', 'Leaves', 'Tulips'], tags: 'tulip flowers spring bed' },
  (mb) => {
    mb.zoneOf(0);
    mb.extrude(roundRect(U * 0.86, U * 0.86, 0.24, 3), 0.09);
    mb.push(); mb.translate(0, 0.09, 0);
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39, r = 0.16 + ((i * 5) % 9) * 0.085;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = 0.40 + ((i * 7) % 5) * 0.06;
      mb.zoneOf(1);
      mb.push(); mb.translate(x, 0, z);
      mb.cylinder(0.016, h, 4);
      // strap leaves
      for (const sx of [-1, 1]) {
        mb.push(); mb.translate(sx * 0.045, 0.02, 0);
        mb.rotateZ(sx * 0.30);
        mb.lathe([[0.04, 0], [0.055, h * 0.32], [0.01, h * 0.62]], 3, { closeBottom: true });
        mb.pop();
      }
      mb.zoneOf(2);
      mb.push(); mb.translate(0, h, 0);
      // cupped tulip head
      mb.lathe([[0.02, 0], [0.075, 0.055], [0.085, 0.13], [0.070, 0.175], [0.045, 0.185]], 6, { closeBottom: true });
      for (let p = 0; p < 3; p++) {
        mb.push(); mb.rotateY((p / 3) * Math.PI * 2);
        mb.translate(0.062, 0.15, 0);
        mb.rotateZ(-0.22);
        mb.sphere(0.045, 5, 3, { squash: 0.5 });
        mb.pop();
      }
      mb.pop();
      mb.pop();
    }
    mb.pop();
  });

def('paperLantern', { name: 'Paper lantern', cat: 'seasonal', slot: 'edge', fit: 'free', cost: 18, glows: true, zones: ['Caps', 'Cord', 'Paper'], tags: 'lantern paper light glow festival' },
  (mb) => {
    const top = U * 0.92;
    mb.zoneOf(1);
    mb.push(); mb.translate(0, top, 0); mb.cylinder(0.012, 0.22, 4); mb.pop();
    mb.zoneOf(0);
    mb.push(); mb.translate(0, top - 0.24, 0); mb.cylinder(0.075, 0.035, 8); mb.pop();
    mb.zoneOf(2);
    mb.push(); mb.translate(0, top - 0.52, 0);
    mb.lathe([[0.06, 0.28], [0.20, 0.22], [0.26, 0.14], [0.26, 0.06], [0.20, -0.02], [0.06, -0.06]], 9);
    // ribs
    mb.zoneOf(0);
    for (const yy of [0.20, 0.13, 0.05]) {
      mb.push(); mb.translate(0, yy, 0);
      mb.torus(0.245, 0.008, 10, 4);
      mb.pop();
    }
    mb.pop();
    mb.zoneOf(0);
    mb.push(); mb.translate(0, top - 0.58, 0); mb.cylinder(0.07, 0.03, 8); mb.pop();
    mb.zoneOf(1);
    mb.push(); mb.translate(0, top - 0.62, 0);
    for (let i = 0; i < 5; i++) {
      mb.push(); mb.translate(((i - 2) * 0.018), 0, 0);
      mb.cylinder(0.008, 0.14, 3);
      mb.pop();
    }
    mb.pop();
  });

def('parasol', { name: 'Parasol', cat: 'seasonal', slot: 'cell', fit: 'free', cost: 24, level: 2, zones: ['Canopy', 'Pole', 'Trim'], tags: 'parasol umbrella shade summer' },
  (mb) => {
    const H = 2.2;
    mb.zoneOf(1);
    mb.lathe([[0.30, 0], [0.30, 0.06], [0.10, 0.10], [0.045, H]], 8, { closeBottom: true });
    mb.zoneOf(0);
    mb.push(); mb.translate(0, H - 0.42, 0);
    // scalloped canopy
    const seg = 8;
    for (let i = 0; i < seg; i++) {
      mb.push();
      mb.rotateY((i / seg) * Math.PI * 2);
      mb.translate(0.62, 0.10, 0);
      mb.rotateZ(0.42);
      mb.sphere(0.42, 5, 3, { squash: 0.16 });
      mb.pop();
    }
    mb.cone(1.02, 0.46, seg);
    mb.pop();
    mb.zoneOf(2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      mb.push();
      mb.translate(Math.cos(a) * 0.98, H - 0.44, Math.sin(a) * 0.98);
      mb.sphere(0.055, 5, 3);
      mb.pop();
    }
    mb.push(); mb.translate(0, H + 0.06, 0); mb.cone(0.06, 0.14, 6); mb.pop();
  });

def('iceCreamCart', { name: 'Ice-cream cart', cat: 'seasonal', slot: 'cell', fit: 'free', cost: 46, level: 3, glows: true, zones: ['Cart', 'Trim', 'Canopy'], tags: 'cart ice cream food summer' },
  (mb) => {
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.46, 0);
    mb.chamfer(1.30, 0.66, 0.72, 0.05, { centreY: true });
    mb.pop();
    mb.zoneOf(1);
    mb.push(); mb.translate(0, 0.80, 0);
    mb.chamfer(1.42, 0.08, 0.84, 0.02);
    mb.pop();
    // wheels
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push();
      mb.translate(sx * 0.50, 0.22, 0.38);
      mb.rotateX(Math.PI / 2);
      mb.torus(0.20, 0.055, 10, 5);
      mb.cylinder(0.05, 0.07, 6, { centreY: true });
      mb.pop();
    }
    // handle
    mb.push(); mb.translate(-0.78, 0.62, 0);
    mb.rotateZ(0.5);
    mb.cylinder(0.03, 0.5, 5);
    mb.pop();
    // striped canopy on posts
    mb.zoneOf(1);
    for (const sx of [-1, 1]) {
      mb.push(); mb.translate(sx * 0.58, 0.88, 0);
      mb.cylinder(0.03, 0.86, 5);
      mb.pop();
    }
    mb.zoneOf(2);
    mb.push(); mb.translate(0, 1.74, 0);
    for (let i = 0; i < 5; i++) {
      mb.push();
      mb.translate(0, -0.02 * i, 0);
      mb.rotateY(0);
      mb.chamfer(1.50 - i * 0.06, 0.045, 0.92 - i * 0.05, 0.015);
      mb.pop();
    }
    mb.pop();
    // scalloped valance
    for (let i = 0; i < 7; i++) {
      mb.push();
      mb.translate(-0.62 + (1.24 * i) / 6, 1.68, 0.44);
      mb.sphere(0.10, 5, 3, { squash: 0.7 });
      mb.pop();
    }
    // a cone on the counter
    mb.zoneOf(1);
    mb.push(); mb.translate(0.36, 0.88, 0);
    mb.rotateX(Math.PI);
    mb.cone(0.10, 0.26, 7);
    mb.pop();
    mb.zoneOf(2);
    mb.push(); mb.translate(0.36, 0.94, 0);
    mb.sphere(0.12, 6, 4);
    mb.push(); mb.translate(0.04, 0.10, 0.02); mb.sphere(0.085, 6, 4); mb.pop();
    mb.pop();
  });

def('pumpkin', { name: 'Pumpkin', cat: 'seasonal', slot: 'cell', fit: 'free', cost: 9, vary: true, zones: ['Skin', 'Stem', 'Detail'], tags: 'pumpkin autumn harvest halloween' },
  (mb) => {
    mb.zoneOf(0);
    // ribbed body from overlapping lobes
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      mb.push();
      mb.translate(Math.cos(a) * 0.13, 0.28, Math.sin(a) * 0.13);
      mb.sphere(0.26, 7, 5, { squash: 0.82 });
      mb.pop();
    }
    mb.zoneOf(1);
    mb.push(); mb.translate(0, 0.48, 0);
    mb.rotateZ(0.16);
    mb.lathe([[0.055, 0], [0.045, 0.10], [0.06, 0.18], [0.03, 0.22]], 6, { closeBottom: true });
    mb.pop();
    mb.zoneOf(2);
    // curling tendril
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      mb.push();
      mb.translate(0.10 + Math.cos(t * 7) * 0.09, 0.52 + t * 0.16, Math.sin(t * 7) * 0.09);
      mb.sphere(0.018, 4, 3);
      mb.pop();
    }
  });

def('leafPile', { name: 'Leaf pile', cat: 'seasonal', slot: 'cell', cost: 6, vary: true, zones: ['Leaves', 'Under', 'Detail'], tags: 'leaves pile autumn rake' },
  (mb) => {
    mb.zoneOf(1);
    mb.extrude(blob(U * 0.42, 9, 0.30, 3), 0.06);
    mb.zoneOf(0);
    for (let i = 0; i < 22; i++) {
      const a = i * 2.39, r = ((i * 5) % 11) / 11 * U * 0.36;
      mb.push();
      mb.translate(Math.cos(a) * r, 0.05 + ((i * 3) % 5) * 0.045, Math.sin(a) * r);
      mb.rotateY(a * 1.7);
      mb.rotateX(((i % 3) - 1) * 0.4);
      mb.sphere(0.11, 5, 2, { squash: 0.22 });
      mb.pop();
    }
    mb.zoneOf(2);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      mb.push();
      mb.translate(Math.cos(a) * U * 0.44, 0.02, Math.sin(a) * U * 0.44);
      mb.rotateY(a);
      mb.sphere(0.09, 5, 2, { squash: 0.18 });
      mb.pop();
    }
  });

def('harvestBasket', { name: 'Harvest basket', cat: 'seasonal', slot: 'cell', fit: 'free', cost: 16, zones: ['Weave', 'Rim', 'Produce'], tags: 'basket harvest autumn produce' },
  (mb) => {
    mb.zoneOf(0);
    mb.lathe([[0.24, 0], [0.30, 0.08], [0.38, 0.36], [0.40, 0.42]], 10, { closeBottom: true });
    // weave bands
    mb.zoneOf(1);
    for (const y of [0.10, 0.22, 0.34]) {
      mb.push(); mb.translate(0, y, 0);
      mb.torus(0.30 + y * 0.24, 0.022, 12, 4);
      mb.pop();
    }
    mb.push(); mb.translate(0, 0.42, 0);
    mb.torus(0.40, 0.03, 12, 5);
    mb.pop();
    // handle
    mb.zoneOf(1);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (i + 0.5) / 7;
      mb.push();
      mb.translate(-Math.cos(a) * 0.38, 0.42 + Math.sin(a) * 0.34, 0);
      mb.rotateZ(a - Math.PI / 2);
      mb.chamfer(0.05, 0.17, 0.05, 0.012, { centreY: true });
      mb.pop();
    }
    mb.zoneOf(2);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.39, r = ((i * 3) % 5) / 5 * 0.22;
      mb.push();
      mb.translate(Math.cos(a) * r, 0.42, Math.sin(a) * r);
      mb.sphere(0.10 + (i % 3) * 0.02, 6, 4);
      mb.pop();
    }
  });

def('wreathPost', { name: 'Wreath post', cat: 'seasonal', slot: 'cell', fit: 'free', cost: 20, level: 2, zones: ['Post', 'Wreath', 'Ribbon'], tags: 'wreath post winter door festive' },
  (mb) => {
    mb.zoneOf(0);
    mb.chamfer(0.13, 1.60, 0.13, 0.02);
    mb.push(); mb.translate(0, 1.60, 0);
    mb.chamfer(0.20, 0.07, 0.20, 0.015);
    mb.push(); mb.translate(0, 0.07, 0); mb.cone(0.11, 0.13, 4); mb.pop();
    mb.pop();
    mb.zoneOf(1);
    mb.push(); mb.translate(0, 1.14, 0.10);
    mb.rotateX(Math.PI / 2);
    mb.torus(0.34, 0.10, 12, 6);
    // sprigs so it isn't a smooth doughnut
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      mb.push();
      mb.translate(Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0);
      mb.sphere(0.10, 5, 3, { squash: 0.8 });
      mb.pop();
    }
    mb.pop();
    mb.zoneOf(2);
    // bow
    mb.push(); mb.translate(0, 0.80, 0.12);
    for (const sx of [-1, 1]) {
      mb.push();
      mb.translate(sx * 0.11, 0.02, 0);
      mb.rotateZ(sx * 0.6);
      mb.sphere(0.11, 5, 3, { squash: 0.55 });
      mb.pop();
      mb.push();
      mb.translate(sx * 0.07, -0.18, 0);
      mb.rotateZ(sx * 0.28);
      mb.chamfer(0.06, 0.26, 0.02, 0.008, { centreY: true });
      mb.pop();
    }
    mb.sphere(0.05, 5, 3);
    mb.pop();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      mb.push();
      mb.translate(Math.cos(a) * 0.34, 1.14 + Math.sin(a) * 0.34, 0.16);
      mb.sphere(0.045, 5, 3);
      mb.pop();
    }
  });

// ===========================================================================
// 10.8  EARNED / PRESTIGE  — cosmetic only, no gameplay power
// ===========================================================================
def('founderObelisk', { name: "Founder's obelisk", cat: 'prestige', slot: 'cell', fit: 'free', cost: 0, level: 1, glows: true,
  earned: 'founder', zones: ['Stone', 'Plaque', 'Glow'], tags: 'prestige obelisk founder earned' },
  (mb) => {
    mb.zoneOf(0);
    mb.chamfer(0.86, 0.20, 0.86, 0.04);
    mb.push(); mb.translate(0, 0.20, 0);
    mb.chamfer(0.66, 0.16, 0.66, 0.03);
    mb.push(); mb.translate(0, 0.16, 0);
    mb.box(0.44, 2.6, 0.44, { taper: 0.46 });
    mb.push(); mb.translate(0, 2.6, 0);
    mb.rotateY(Math.PI / 4);
    mb.cone(0.16, 0.40, 4);
    mb.pop(); mb.pop(); mb.pop();
    mb.zoneOf(1);
    mb.push(); mb.translate(0, 0.70, 0.23);
    mb.chamfer(0.30, 0.40, 0.02, 0.01, { centreY: true });
    mb.pop();
    mb.zoneOf(2);
    mb.push(); mb.translate(0, 3.06, 0);
    mb.sphere(0.11, 7, 5);
    mb.pop();
  });

def('goldenMaple', { name: 'Golden maple', cat: 'prestige', slot: 'cell', fit: 'free', cost: 0, level: 1, vary: true,
  earned: 'master-builder', zones: ['Leaves', 'Trunk', 'Detail'], tags: 'prestige tree maple earned gold' },
  (mb) => {
    mb.zoneOf(1);
    mb.lathe([[0.30, 0], [0.19, 0.24], [0.15, 1.10], [0.13, 1.55]], 8,
      { closeBottom: true, closeTop: true });
    for (let i = 0; i < 4; i++) {
      mb.push(); mb.rotateY(i * 1.6); mb.translate(0, 1.20, 0); mb.rotateZ(-0.78);
      mb.cylinder(0.07, 0.66, 5, { rTop: 0.032 });
      mb.pop();
    }
    mb.zoneOf(0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mb.push();
      mb.translate(Math.cos(a) * 0.62, 2.10 + ((i % 3) * 0.20), Math.sin(a) * 0.62);
      mb.sphere(0.62, 7, 5, { squash: 0.90 });
      mb.pop();
    }
    mb.push(); mb.translate(0, 2.50, 0); mb.sphere(0.72, 8, 5, { squash: 0.92 }); mb.pop();
    mb.zoneOf(2);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39;
      mb.push();
      mb.translate(Math.cos(a) * 1.0, 1.9 + ((i * 5) % 7) * 0.16, Math.sin(a) * 1.0);
      mb.rotateY(a);
      mb.sphere(0.13, 5, 3, { squash: 0.22 });
      mb.pop();
    }
  });

def('civicPlinth', { name: 'Civic plinth', cat: 'prestige', slot: 'cell', fit: 'free', cost: 0, level: 1,
  earned: 'civic-patron', zones: ['Plinth', 'Statue', 'Plaque'], tags: 'prestige statue civic earned' },
  (mb) => {
    mb.zoneOf(0);
    mb.chamfer(1.10, 0.18, 1.10, 0.04);
    mb.push(); mb.translate(0, 0.18, 0);
    mb.chamfer(0.78, 0.92, 0.78, 0.05);
    mb.pop();
    mb.zoneOf(2);
    mb.push(); mb.translate(0, 0.62, 0.40);
    mb.chamfer(0.40, 0.26, 0.02, 0.008, { centreY: true });
    mb.pop();
    // a small abstract figure, low poly and deliberately stylised
    mb.zoneOf(1);
    mb.push(); mb.translate(0, 1.10, 0);
    mb.lathe([[0.22, 0], [0.18, 0.16], [0.20, 0.52], [0.14, 0.70]], 7, { closeBottom: true });
    mb.push(); mb.translate(0, 0.70, 0);
    mb.sphere(0.16, 7, 5, { squash: 1.1 });
    mb.pop();
    for (const sx of [-1, 1]) {
      mb.push();
      mb.translate(sx * 0.17, 0.56, 0);
      mb.rotateZ(sx * 0.5);
      mb.cylinder(0.055, 0.42, 5, { rTop: 0.04 });
      mb.pop();
    }
    mb.pop();
  });

def('lakeLantern', { name: 'Harbour lantern', cat: 'prestige', slot: 'cell', fit: 'free', cost: 0, level: 1, glows: true,
  earned: 'lakeside', zones: ['Iron', 'Base', 'Light'], tags: 'prestige lantern harbour earned glow' },
  (mb) => {
    mb.zoneOf(1);
    mb.lathe([[0.44, 0], [0.46, 0.10], [0.40, 0.22], [0.24, 0.30]], 9, { closeBottom: true });
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.30, 0);
    mb.cylinder(0.13, 1.5, 8, { rTop: 0.10 });
    mb.pop();
    mb.push(); mb.translate(0, 1.80, 0);
    for (let i = 0; i < 4; i++) {
      mb.push(); mb.rotateY((i / 4) * Math.PI * 2);
      mb.translate(0.19, 0, 0);
      mb.chamfer(0.045, 0.62, 0.045, 0.01);
      mb.pop();
    }
    mb.zoneOf(2);
    mb.push(); mb.translate(0, 0.31, 0);
    mb.sphere(0.20, 8, 5);
    mb.pop();
    mb.zoneOf(0);
    mb.push(); mb.translate(0, 0.62, 0);
    mb.cone(0.32, 0.34, 8);
    mb.push(); mb.translate(0, 0.34, 0); mb.sphere(0.07, 6, 4); mb.pop();
    mb.pop();
    mb.pop();
  });
