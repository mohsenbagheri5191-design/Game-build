/**
 * The simulated layer: neighbours, civic projects, milestones, upkeep.
 *
 * Everything here is local and fictional. No network, no real users, no real
 * identity. Neighbours' towns are *generated* from a seed using the same kit
 * the player builds with — none of them are hand-placed, and none of them use
 * a part the player cannot also place.
 */

import { CONFIG, lotUpkeep, xpForLevel } from '../core/config.js';
import { lotGrid, slotKey, parseSlot } from './world.js';
import { getPart } from '../kit/parts.js';
import { defaultColorsFor } from '../kit/colors.js';
import { todayKey } from './save.js';

// ---------------------------------------------------------------------------
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

const FIRST = ['Mira', 'Desmond', 'Priya', 'Tobias', 'Sena', 'Rafi', 'Ines', 'Nkechi', 'Oskar', 'Yuki',
  'Halima', 'Caleb', 'Rosalind', 'Emeka', 'Lena', 'Ari', 'Fatou', 'Marek', 'Noor', 'Bo',
  'Ivo', 'Anwen', 'Tomas', 'Zaria', 'Kit', 'Soren', 'Delphine', 'Ravi'];
const LAST = ['Okonjo', 'Vance', 'Halloran', 'Ashworth', 'Nakamura', 'Bergström', 'Duarte', 'Whitlock',
  'Iyer', 'Novak', 'Adeyemi', 'Castellan', 'Rourke', 'Petrova', 'Sandoval', 'Fitzgerald'];
const TOWN_A = ['Little', 'Old', 'North', 'Upper', 'Bright', 'Quiet', 'Copper', 'Willow', 'Amber', 'Hollow',
  'Fern', 'Ash', 'Cedar', 'Harbour', 'Lantern', 'Maple'];
const TOWN_B = ['Yard', 'Corner', 'Row', 'Works', 'Green', 'Commons', 'Landing', 'Terrace', 'Gate', 'Mews',
  'Court', 'Wharf', 'Close', 'Walk'];

const NOTES = [
  'Love what you did with the roofline.',
  'That fence run is very tidy.',
  'Came for the garden, stayed for the lanterns.',
  'Your corner looks great at night.',
  'Borrowed your bench idea, hope that\'s alright.',
  'The blossom tree was a good call.',
  'Nice use of the arch.',
  'This is my favourite lot on the street.',
];

// ---------------------------------------------------------------------------
// NEIGHBOURS
// ---------------------------------------------------------------------------
/**
 * How far along a neighbour's town is, 0 to 1.
 *
 * Towns that never change make the whole neighbourhood feel like scenery, and
 * a visit you have already made is a visit not worth making again. So each one
 * builds, slowly, against the clock the player's own save started on — anchored
 * to createdAt rather than to wall-clock time, so a save opened for the first
 * time today does not begin surrounded by finished towns.
 *
 * Every neighbour moves at their own pace off their seed, and growth is read
 * in whole stages rather than continuously: the point is that you come back
 * after a few days and see something new, not that a hedge creeps a millimetre
 * an hour.
 */
export const GROWTH_STAGES = 6;

export function growthOf(nb, createdAt, now = Date.now()) {
  const days = Math.max(0, (now - (createdAt || now)) / 86400000);
  // seeded pace: the keenest builder is roughly three times the slowest
  const pace = 0.55 + ((nb.seed >>> 11) & 255) / 255 * 1.15;
  /*
   * A wide head start, so day one is a real street rather than twenty-four
   * identical building sites: some neighbours are nearly done, some are
   * halfway, a few have only just broken ground. Everyone finishes inside a
   * couple of weeks, and the ones who were already close finish first — which
   * is what gives the player something new to look at early on.
   */
  const head = ((nb.seed >>> 3) & 255) / 255 * 6.5;
  const t = (head + days * pace) / 9;
  return Math.max(0, Math.min(1, t));
}

/** Growth as a whole stage, which is what the geometry keys off. */
export function stageOf(nb, createdAt, now = Date.now()) {
  return Math.min(GROWTH_STAGES - 1, Math.floor(growthOf(nb, createdAt, now) * GROWTH_STAGES));
}

/**
 * What a finished builder does next: they redecorate.
 *
 * A lot is finite and growth may only ever add — a visitor who saw a fence
 * last week must not find it gone — so building has to stop somewhere. It
 * stops after about a fortnight, and then nothing would ever change again,
 * which is the same dead neighbourhood arriving two weeks later.
 *
 * So a finished town starts repainting instead. The structure is untouched;
 * only the palette moves, every ten days or so, each builder on their own
 * clock. Nothing is lost, the place you remember is still the place, and there
 * is a reason to look again.
 */
const REPAINT_DAYS = 10;
export const PALETTES = [
  ['#e6ddd0', '#8a6f57', '#a9cfe0'],
  ['#cfd9dd', '#54504a', '#a9cfe0'],
  ['#e7c9a8', '#7d5734', '#a9cfe0'],
  ['#c6d4c0', '#4d8636', '#a9cfe0'],
  ['#dcc9d8', '#6b4a63', '#b8d9e6'],
  ['#e3d5b8', '#9a6b3f', '#c3dbe3'],
  ['#c9d6e0', '#3f5f78', '#dfe8ee'],
  ['#e8cfc2', '#a3543f', '#bcd8dd'],
];

export function coatOf(nb, createdAt, now = Date.now()) {
  if (stageOf(nb, createdAt, now) < GROWTH_STAGES - 1) return 0;
  const days = Math.max(0, (now - (createdAt || now)) / 86400000);
  const own = ((nb.seed >>> 19) & 255) / 255 * REPAINT_DAYS;   // their own clock
  return Math.max(0, Math.floor((days + own) / REPAINT_DAYS));
}

/**
 * Generate the neighbouring builders. Deterministic from the seed, so the
 * same neighbours are in the same places every time you come back.
 *
 * @param createdAt when this save was started; drives how far along the
 *                  neighbours' towns are. See growthOf().
 */
export function generateNeighbours(city, count = CONFIG.social.neighbourCount, seed = 20260827, createdAt = Date.now()) {
  const r = rng(seed);
  const out = [];
  const used = new Set();
  const anchors = [
    [-1150, 700], [-900, 1050], [500, 400], [-1500, 1300], [1050, 1750],
    [700, 1000], [-1300, 500], [250, 1400], [-600, 1900], [1250, 300],
    [-1800, 900], [900, 1400],
  ];

  let guard = 0;
  while (out.length < count && guard++ < count * 60) {
    const [au, av] = anchors[out.length % anchors.length];
    const u = au + (r() - 0.5) * 620;
    const v = av + (r() - 0.5) * 620;
    const p = city.parcelAt(u, v);
    if (!p || used.has(p.id)) continue;
    const area = (p.u1 - p.u0) * (p.v1 - p.v0);
    if (area < 260 || area > 1600) continue;
    used.add(p.id);

    const level = 3 + Math.floor(r() * 22);
    const n = {
      id: `nb${out.length}`,
      name: `${pick(r, FIRST)} ${pick(r, LAST)}`,
      town: `${pick(r, TOWN_A)} ${pick(r, TOWN_B)}`,
      parcelId: p.id,
      level,
      xp: xpForLevel(level),
      seed: (seed + out.length * 7919) >>> 0,
      avatar: {
        body: Math.floor(r() * 3), head: Math.floor(r() * 3), hair: Math.floor(r() * 5),
        hat: Math.floor(r() * 4), face: Math.floor(r() * 3),
        colors: {
          skin: pick(r, ['#f2d3b3', '#e8b98d', '#c68a5f', '#8d5a3b', '#5c3a26']),
          hair: pick(r, ['#2a1d13', '#43301f', '#7a4b23', '#b07a3c', '#d9c39a', '#6a6a72']),
          top: pick(r, ['#4f7fa8', '#c25b4a', '#6faa4e', '#9a6dc0', '#d4bb2c', '#3f8c72']),
          legs: pick(r, ['#3b4757', '#54504a', '#7d5734']),
          shoes: '#2f2a26',
          hat: pick(r, ['#c25b4a', '#4f7fa8', '#d4bb2c', '#54504a']),
        },
      },
      style: Math.floor(r() * 4),
      visits: Math.floor(r() * 900),
      blurb: '',
    };
    n.stage = stageOf(n, createdAt);
    n.growth = growthOf(n, createdAt);
    n.coat = coatOf(n, createdAt);
    n.parts = buildNeighbourTown(city, p, n, n.stage, n.coat);
    n.partCount = Object.keys(n.parts).length;
    n.blurb = describeTown(n);
    out.push(n);
  }
  return out;
}

/**
 * Re-derive any neighbour whose town has moved on since it was last built.
 *
 * Growth is a pure function of elapsed time and the seed, so nothing is stored
 * and nothing can drift: the same save at the same moment always produces the
 * same neighbourhood. This just notices which ones have stepped up and rebuilds
 * those, so a long session does not have to redo twenty-four towns to find out
 * that none of them changed.
 *
 * @returns the neighbours that grew
 */
export function rebuildNeighbours(city, neighbours, createdAt, now = Date.now()) {
  const grown = [];
  for (const nb of neighbours) {
    const stage = stageOf(nb, createdAt, now);
    const coat = coatOf(nb, createdAt, now);
    if (stage === nb.stage && coat === nb.coat) continue;
    const repaintOnly = stage === nb.stage;
    nb.stage = stage;
    nb.coat = coat;
    nb.growth = growthOf(nb, createdAt, now);
    nb.parts = buildNeighbourTown(city, city.parcelById(nb.parcelId), nb, stage, coat);
    nb.partCount = Object.keys(nb.parts).length;
    nb.blurb = describeTown(nb);
    nb.lastChange = repaintOnly ? 'repaint' : 'build';
    grown.push(nb);
  }
  return grown;
}

/**
 * A neighbour's lot, assembled from the same kit the player uses: a walled
 * footprint with a door and windows, a roof, a fence line, and a garden.
 *
 * `stage` is how far along they are, 0 to GROWTH_STAGES-1. The shape of the
 * house is fixed from the seed so it is recognisably the same house every
 * time; what the stage decides is how much of it they have finished. A town
 * you saw last week has the same silhouette and more in it.
 *
 *   0  a bare footprint, one storey, no roof yet
 *   1  roofed, a door and windows
 *   2  the fence goes up
 *   3  the garden gets planted
 *   4  a second storey if they were ever going to build one
 *   5  the flourishes — awning, terrace, lanterns
 */
function buildNeighbourTown(city, parcel, nb, stage = GROWTH_STAGES - 1, coat = 0) {
  const r = rng(nb.seed);
  const g = lotGrid(parcel);

  /*
   * The whole finished town is planned first, in one pass, with every random
   * draw taken in a fixed order that does not depend on the stage. Only then
   * is it filtered down to what has been built so far.
   *
   * Doing it the other way round — branching on the stage while drawing — was
   * the bug: an early stage skips a block, that block does not consume its
   * random numbers, and every draw after it shifts. The garden came out
   * differently at every stage, so things a visitor had already seen moved or
   * vanished. Planning the finished town once makes growth monotone by
   * construction: a later stage is a superset of an earlier one, always.
   */
  const plan = [];
  // One slot, one part, decided by whoever plans it first. Without this the
  // fence line runs straight over the front wall of a house that sits on the
  // street edge, and at stage 2 the door turns into a hedge.
  const taken = new Set();
  const add = (when, key, partId, rot = 0, colors = null) => {
    const p = getPart(partId);
    if (!p || taken.has(key)) return;
    taken.add(key);
    plan.push({ when, key, rec: { part: partId, rot, free: 0, colors: colors || defaultColorsFor(p), t: 0 } });
  };
  const addSpan = (when, key, partId, w, d, style, colors) => {
    if (!getPart(partId) || taken.has(key)) return;
    taken.add(key);
    plan.push({ when, key, rec: { part: partId, rot: 0, free: 0, w, d, style, colors, t: 0 } });
  };
  // cells a span covers, so nothing is planted underneath one
  const reserved = new Set();
  const reserve = (i0, j0, w, d) => {
    for (let i = i0; i < i0 + w; i++) for (let j = j0; j < j0 + d; j++) reserved.add(`${i},${j}`);
  };

  // --- the house, fixed from the seed ---
  const fw = Math.max(1, Math.min(g.cols, 2 + Math.floor(r() * 3)));
  const fd = Math.max(1, Math.min(g.rows, 2 + Math.floor(r() * 3)));
  const fi = Math.floor((g.cols - fw) * (0.2 + r() * 0.6));
  const fj = Math.floor((g.rows - fd) * (0.2 + r() * 0.6));

  // A finished builder repaints every so often; `coat` is how many times.
  const palette = PALETTES[(nb.style + coat) % PALETTES.length];

  // A second storey is decided here but only built at stage 4, so a house that
  // was always going to be two storeys grows into the second one rather than
  // turning into a different building.
  const wantsUpper = r() < 0.42;
  const storeys = 1 + (wantsUpper ? 1 : 0);
  const doorEdge = Math.floor(r() * fw);

  for (let s = 0; s < storeys; s++) {
    const when = s === 0 ? 0 : 4;
    for (let i = 0; i < fw; i++) {
      for (let j = 0; j < fd; j++) add(when, slotKey('c', s, fi + i, fj + j), 'floor', 0, palette);
    }
    for (let i = 0; i < fw; i++) {
      for (const jj of [fj, fj + fd]) {
        const isDoor = s === 0 && jj === fj && i === doorEdge;
        const wall = isDoor ? 'wallDoorway' : (r() < 0.45 ? 'wallWindow' : 'wall');
        add(when, slotKey('e', s, fi + i, jj, 0), wall, 0, palette);
      }
    }
    for (let j = 0; j < fd; j++) {
      for (const ii of [fi, fi + fw]) {
        add(when, slotKey('e', s, ii, fj + j, 1), r() < 0.40 ? 'wallWindow' : 'wall', 0, palette);
      }
    }
    for (const ii of [fi, fi + fw]) {
      for (const jj of [fj, fj + fd]) {
        if (r() < 0.55) add(when, slotKey('k', s, ii, jj), 'cornerPost', 0, palette);
      }
    }
  }

  /*
   * The roof goes on top of the house this builder is actually making, and it
   * goes on once — a bungalow is roofed at stage 1, a two-storey house not
   * until its upper floor exists at stage 4. Roofing low and moving it up
   * later would mean taking a roof off, and taking things away is what makes a
   * growing town look like a glitching one. Until then it is a house with no
   * roof on it yet, which is what a building site looks like.
   */
  const roofStyle = r() < 0.30 ? 'flat' : (r() < 0.30 ? 'hip' : 'gable');
  addSpan(storeys > 1 ? 4 : 1, slotKey('c', storeys, fi, fj), 'roof', fw, fd, roofStyle, palette);

  // --- the fence, stage 2 ---
  const fenceKind = pick(r, ['picketFence', 'lowFence', 'hedge', 'wickerFence', 'slatFence']);
  for (let i = 0; i < g.cols; i++) {
    if (r() < 0.14) continue;
    add(2, slotKey('e', 0, i, 0, 0), fenceKind, 0, palette);
  }

  /*
   * The flourishes are planned before the garden even though they arrive last,
   * so the ground they will stand on can be reserved. Plant first and the
   * terrace lands on top of a flowerbed at stage 5, which is a removal — and
   * removals are what makes a growing town feel like a glitching one.
   */
  if (r() < 0.7 && fj >= 1) {
    addSpan(5, slotKey('c', 0, fi + doorEdge, fj - 1), 'awning', 1, 1,
      pick(r, ['scallop', 'straight', 'barrel']), palette);
    reserve(fi + doorEdge, fj - 1, 1, 1);
  }
  if (fi + fw < g.cols && r() < 0.6) {
    const tw = Math.min(2, g.cols - (fi + fw)), td = Math.min(2, fd);
    addSpan(5, slotKey('c', 0, fi + fw, fj), 'terrace', tw, td,
      pick(r, ['plank', 'paving', 'lawn']), palette);
    reserve(fi + fw, fj, tw, td);
  }
  for (let i = 0; i < fw; i++) {
    if (r() < 0.5) add(5, slotKey('e', storeys - 1, fi + i, fj, 0), 'stringLights', 0, palette);
  }

  // --- the garden, half at stage 3 and the rest at 5 ---
  const treeKinds = ['treeRound', 'treeSlender', 'evergreen', 'bush', 'treeBlossom'];
  for (let i = 0; i < g.cols; i++) {
    for (let j = 0; j < g.rows; j++) {
      if (i >= fi && i < fi + fw && j >= fj && j < fj + fd) continue;
      if (reserved.has(`${i},${j}`)) continue;
      const k = slotKey('c', 0, i, j);
      const q = r();
      const late = r() > 0.62 ? 5 : 3;
      if (q < 0.20) add(late, k, pick(r, treeKinds));
      else if (q < 0.34) add(late, k, pick(r, ['pathCobble', 'pathBrick', 'pathStepping', 'pathPaving']));
      else if (q < 0.42) add(late, k, pick(r, ['flowerbed', 'bench', 'planterBox', 'pottedPlant', 'rock']));
      else if (q < 0.46) add(late, k, pick(r, ['lamppost', 'birdhouse', 'mailbox', 'signpost']));
    }
  }

  // --- filter the plan down to what has been built so far ---
  // Nothing collides: every key was claimed once when the plan was made.
  const parts = {};
  for (const it of plan) {
    if (it.when > stage) continue;
    parts[it.key] = it.rec;
  }
  return parts;
}

function describeTown(nb) {
  const n = nb.partCount;
  const size = n > 90 ? 'a sprawling' : n > 55 ? 'a busy' : n > 28 ? 'a tidy' : 'a small';
  const flavour = ['garden-heavy', 'tightly built', 'full of lanterns', 'all fences and hedges'][nb.style];
  const progress = [
    'Just broken ground.',
    'Roof went on recently.',
    'Fencing the place in.',
    'Planting the garden.',
    'Adding a second storey.',
    'Finished, and fussing over the details.',
  ][nb.stage ?? 5];
  return `${size} lot, ${flavour} ${progress}`;
}

/** What changed at each step up, for the activity feed. */
export const GROWTH_NEWS = [
  'started building',
  'put a roof on',
  'fenced the lot',
  'planted the garden',
  'added a second storey',
  'finished the place off',
];

/** And what to say when a finished town has simply been repainted. */
export const REPAINT_NEWS = [
  'has repainted',
  'picked a new colour',
  'gave the place a fresh coat',
  'has been decorating',
];

// ---------------------------------------------------------------------------
// CIVIC PROJECTS
// ---------------------------------------------------------------------------
/**
 * Shared, city-wide projects on real streets. A completed project appears
 * physically in the world where it belongs.
 */
export const CIVIC_PROJECTS = [
  { id: 'trees-queen', name: 'Street trees on Queen St W', item: 'treeRound', target: 24,
    where: { u: -1200, v: 810 }, span: 420, axis: 'ew', desc: 'A new run of trees between Spadina and Bathurst.' },
  { id: 'benches-harbour', name: 'Benches along Queens Quay', item: 'bench', target: 18,
    where: { u: -700, v: -480 }, span: 380, axis: 'ew', desc: 'Somewhere to sit and watch the ferries.' },
  { id: 'lamps-distillery', name: 'Lamps in the Distillery District', item: 'lamppost', target: 14,
    where: { u: 1250, v: 210 }, span: 200, axis: 'ew', desc: 'Gas-lamp styling for the cobbles.' },
  { id: 'beds-allan', name: 'Flowerbeds at Allan Gardens', item: 'flowerbed', target: 20,
    where: { u: 710, v: 1660 }, span: 180, axis: 'ew', desc: 'Spring planting around the conservatory.' },
  { id: 'fountain-berczy', name: 'Fountain for Berczy Park', item: 'fountain', target: 6,
    where: { u: 225, v: 85 }, span: 60, axis: 'ew', desc: 'The dog fountain needs friends.' },
  { id: 'art-nathan', name: 'Public art at Nathan Phillips Square', item: 'sphere', target: 12,
    where: { u: -340, v: 900 }, span: 150, axis: 'ew', desc: 'A commissioned run of forms across the plaza.' },
  { id: 'bridge-don', name: 'Footbridge over the Don', item: 'beam', target: 22,
    where: { u: 1480, v: 700 }, span: 120, axis: 'ns', desc: 'Connecting Corktown to Riverside.' },
];

export function civicProgress(state, project) {
  const rec = state.s.civic[project.id];
  const given = rec?.given || 0;
  return { given, target: project.target, pct: Math.min(1, given / project.target), complete: given >= project.target };
}

export function contributeCivic(state, project, count = 1) {
  if (state.level < CONFIG.economy.civicUnlockLevel) {
    return { ok: false, reason: `Civic projects unlock at level ${CONFIG.economy.civicUnlockLevel}.` };
  }
  const day = todayKey();
  const rec = state.s.civic[project.id] || { given: 0, lastDay: day, count: 0 };
  const todayCount = rec.lastDay === day ? rec.count : 0;
  if (todayCount >= CONFIG.economy.civicDailyCap) {
    return { ok: false, reason: 'You have contributed all you can to this today.' };
  }
  const part = getPart(project.item);
  const cost = (part?.cost || 10) * count;
  const reward = CONFIG.economy.civicContribution * count;

  return state.commit({
    entries: [
      { type: 'civic', amount: -cost, note: `Contributed to ${project.name}` },
      { type: 'reward', amount: reward, note: 'Civic contribution' },
    ],
    apply: (st) => {
      st.s.civic[project.id] = {
        given: rec.given + count,
        lastDay: day,
        count: todayCount + count,
      };
    },
  });
}

/** Contributor list for a project — the player plus simulated neighbours. */
export function civicContributors(state, project, neighbours) {
  const r = rng(hashStr(project.id));
  const out = [];
  const mine = state.s.civic[project.id]?.given || 0;
  if (mine > 0) out.push({ name: state.s.profile.name, count: mine, you: true });
  const n = 3 + Math.floor(r() * 5);
  for (let i = 0; i < n && i < neighbours.length; i++) {
    const nb = neighbours[Math.floor(r() * neighbours.length) % neighbours.length];
    if (out.some((o) => o.name === nb.name)) continue;
    out.push({ name: nb.name, count: 1 + Math.floor(r() * 4) });
  }
  return out.sort((a, b) => b.count - a.count);
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// TIPPING / VISITING  (anti-farming guards)
// ---------------------------------------------------------------------------
export function canTip(state, neighbour) {
  const day = todayKey();
  const rec = state.s.social.tips[day] || { count: 0, recipients: [] };
  if (neighbour.partCount < CONFIG.economy.minPartsToBeTippable) {
    return { ok: false, reason: 'This town is too small to tip yet.' };
  }
  if (rec.count >= CONFIG.economy.tipDailyCap) {
    return { ok: false, reason: `You have given all ${CONFIG.economy.tipDailyCap} of today's tips.` };
  }
  if (rec.recipients.filter((x) => x === neighbour.id).length >= CONFIG.economy.tipPerRecipientPerDay) {
    return { ok: false, reason: 'You have already tipped them today.' };
  }
  return { ok: true };
}

export function tip(state, neighbour) {
  const guard = canTip(state, neighbour);
  if (!guard.ok) return guard;
  const day = todayKey();
  return state.commit({
    entries: [{ type: 'tip', amount: CONFIG.economy.tipGiven, note: `Tipped ${neighbour.name}` }],
    apply: (st) => {
      const rec = st.s.social.tips[day] || { count: 0, recipients: [] };
      rec.count++; rec.recipients.push(neighbour.id);
      st.s.social.tips[day] = rec;
    },
  });
}

/** A visit pays the visited town; here that is the player receiving one. */
export function receiveVisit(state, fromName) {
  return state.commit({
    entries: [{ type: 'visit', amount: CONFIG.economy.visitReward, note: `${fromName} visited your town` }],
    apply: (st) => { st.s.social.visitsReceived++; st.s.stats.visits++; },
  });
}

export function randomNote(seed) {
  const r = rng(seed >>> 0);
  return pick(r, NOTES);
}

// ---------------------------------------------------------------------------
// DAILY LOGIN + UPKEEP
// ---------------------------------------------------------------------------
export function processDailyLogin(state) {
  const day = todayKey();
  if (state.s.lastLoginDay === day) return { ok: false, already: true };
  const res = state.commit({
    entries: [{ type: 'daily', amount: CONFIG.economy.dailyLogin, note: 'Daily login' }],
    apply: (st) => { st.s.lastLoginDay = day; },
  });
  return { ...res, amount: CONFIG.economy.dailyLogin };
}

/**
 * Charge upkeep for elapsed intervals. Unpaid upkeep degrades a lot's
 * condition through visible stages, and warns while it is still healthy — but
 * it never destroys anything the player built.
 */
export function processUpkeep(state) {
  const interval = CONFIG.economy.upkeepIntervalHours * 3600 * 1000;
  const now = Date.now();
  const since = state.s.lastUpkeepAt || now;
  const periods = Math.floor((now - since) / interval);
  if (periods <= 0 || state.s.lots.length === 0) {
    if (periods > 0) state.s.lastUpkeepAt = since + periods * interval;
    return { charged: 0, periods: 0, degraded: [] };
  }

  const due = state.s.lots.reduce((s, _l, i) => s + lotUpkeep(i), 0) * periods;
  const degraded = [];
  const affordable = Math.min(due, Math.max(0, state.credits));

  state.commit({
    entries: affordable > 0 ? [{ type: 'upkeep', amount: -affordable, note: `Upkeep for ${periods} day${periods > 1 ? 's' : ''}` }] : [],
    apply: (st) => {
      st.s.lastUpkeepAt = since + periods * interval;
      if (affordable < due) {
        const missed = Math.ceil((due - affordable) / Math.max(1, due / periods));
        for (const lot of st.s.lots) {
          const before = lot.condition || 0;
          lot.condition = Math.min(CONFIG.economy.conditionStages.length - 1,
            before + missed * CONFIG.economy.conditionDecayPerMissedCharge);
          if (lot.condition > before) degraded.push({ name: lot.name, stage: lot.condition });
        }
      } else {
        for (const lot of st.s.lots) lot.condition = Math.max(0, (lot.condition || 0) - 1);
      }
    },
  });
  return { charged: affordable, due, periods, degraded, shortfall: due - affordable };
}

export function payUpkeepNow(state, lotIndex) {
  const amount = lotUpkeep(lotIndex);
  const lot = state.s.lots[lotIndex];
  if (!lot) return { ok: false, reason: 'No such lot.' };
  if (!lot.condition) return { ok: false, reason: 'This lot is already in good order.' };
  return state.commit({
    entries: [{ type: 'upkeep', amount: -amount, note: `Restored ${lot.name}` }],
    apply: () => { lot.condition = Math.max(0, lot.condition - 1); },
  });
}

// ---------------------------------------------------------------------------
// MILESTONES  (flat, known in advance, no randomness)
// ---------------------------------------------------------------------------
export const MILESTONES = [
  { id: 'first-part', name: 'First brick', desc: 'Place your first part.', test: (s) => s.s.stats.placed >= 1, reward: 120 },
  { id: 'ten-parts', name: 'Getting going', desc: 'Place 10 parts.', test: (s) => s.s.stats.placed >= 10, reward: 200 },
  { id: 'fifty-parts', name: 'A real build', desc: 'Place 50 parts.', test: (s) => s.s.stats.placed >= 50, reward: 400 },
  { id: 'two-hundred', name: 'Master builder', desc: 'Place 200 parts.', test: (s) => s.s.stats.placed >= 200, reward: 900, unlocks: 'master-builder' },
  { id: 'upstairs', name: 'Upstairs', desc: 'Build a second storey.', test: (s) => s.s.stats.storeysBuilt >= 1, reward: 260 },
  { id: 'variety', name: 'Well stocked', desc: 'Use 25 different part types.', test: (s) => s.s.stats.partTypes.length >= 25, reward: 500 },
  { id: 'two-lots', name: 'Landlord', desc: 'Hold two lots at once.', test: (s) => s.s.lots.length >= 2, reward: 350 },
  { id: 'four-lots', name: 'A little empire', desc: 'Hold four lots at once.', test: (s) => s.s.lots.length >= 4, reward: 800 },
  { id: 'level-5', name: 'Level 5', desc: 'Reach level 5.', test: (s) => s.level >= 5, reward: 300 },
  { id: 'level-10', name: 'Level 10', desc: 'Reach level 10.', test: (s) => s.level >= 10, reward: 700 },
  { id: 'level-20', name: 'Level 20', desc: 'Reach level 20.', test: (s) => s.level >= 20, reward: 1500 },
  { id: 'civic-patron', name: 'Civic patron', desc: 'Contribute 10 items to civic projects.',
    test: (s) => Object.values(s.s.civic).reduce((a, c) => a + (c.given || 0), 0) >= 10, reward: 600, unlocks: 'civic-patron' },
  { id: 'good-neighbour', name: 'Good neighbour', desc: 'Tip 10 towns.',
    test: (s) => Object.values(s.s.social.tips).reduce((a, c) => a + (c.count || 0), 0) >= 10, reward: 400 },
  { id: 'lakeside', name: 'Lakeside', desc: 'Hold a lot south of Front St.',
    test: (s, w) => w ? w.ownedLots().some((l) => l.parcel.v1 < 0) : false, reward: 550, unlocks: 'lakeside' },
  { id: 'founder', name: 'Founder', desc: 'Awarded for building your first town.',
    test: (s) => s.s.stats.placed >= 30 && s.s.lots.length >= 1, reward: 500, unlocks: 'founder' },
];

/** Check milestones and pay out any newly met. Flat rewards, no randomness. */
export function checkMilestones(state, world) {
  const newly = [];
  for (const m of MILESTONES) {
    if (state.s.milestones.includes(m.id)) continue;
    let met = false;
    try { met = !!m.test(state, world); } catch { met = false; }
    if (!met) continue;
    state.commit({
      entries: [{ type: 'milestone', amount: m.reward, note: m.name }],
      apply: (st) => {
        st.s.milestones.push(m.id);
        if (m.unlocks && !st.s.milestones.includes(m.unlocks)) st.s.milestones.push(m.unlocks);
      },
    });
    newly.push(m);
  }
  return newly;
}
