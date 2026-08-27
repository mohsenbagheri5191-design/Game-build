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
 * Generate the neighbouring builders. Deterministic from the seed, so the
 * same neighbours are in the same places every time you come back.
 */
export function generateNeighbours(city, count = CONFIG.social.neighbourCount, seed = 20260827) {
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
    n.parts = buildNeighbourTown(city, p, n);
    n.partCount = Object.keys(n.parts).length;
    n.blurb = describeTown(n);
    out.push(n);
  }
  return out;
}

/**
 * A neighbour's lot, assembled from the same kit the player uses: a walled
 * footprint with a door and windows, a roof, a fence line, and a garden.
 */
function buildNeighbourTown(city, parcel, nb) {
  const r = rng(nb.seed);
  const g = lotGrid(parcel);
  const parts = {};
  const put = (key, partId, rot = 0, colors = null) => {
    const p = getPart(partId);
    if (!p) return;
    parts[key] = { part: partId, rot, free: 0, colors: colors || defaultColorsFor(p), t: 0 };
  };

  // pick a footprint inside the grid, set back from the street
  const fw = Math.max(1, Math.min(g.cols, 2 + Math.floor(r() * 3)));
  const fd = Math.max(1, Math.min(g.rows, 2 + Math.floor(r() * 3)));
  const fi = Math.floor((g.cols - fw) * (0.2 + r() * 0.6));
  const fj = Math.floor((g.rows - fd) * (0.2 + r() * 0.6));

  const palette = [
    ['#e6ddd0', '#8a6f57', '#a9cfe0'],
    ['#cfd9dd', '#54504a', '#a9cfe0'],
    ['#e7c9a8', '#7d5734', '#a9cfe0'],
    ['#c6d4c0', '#4d8636', '#a9cfe0'],
  ][nb.style];

  const storeys = 1 + (r() < 0.42 ? 1 : 0);
  const doorEdge = Math.floor(r() * fw);

  for (let s = 0; s < storeys; s++) {
    for (let i = 0; i < fw; i++) {
      for (let j = 0; j < fd; j++) {
        put(slotKey('c', s, fi + i, fj + j), s === 0 ? 'floor' : 'floor', 0, palette);
      }
    }
    // walls around the perimeter
    for (let i = 0; i < fw; i++) {
      for (const jj of [fj, fj + fd]) {
        const isDoor = s === 0 && jj === fj && i === doorEdge;
        const wall = isDoor ? 'wallDoorway' : (r() < 0.45 ? 'wallWindow' : 'wall');
        put(slotKey('e', s, fi + i, jj, 0), wall, 0, palette);
        if (isDoor) put(slotKey('e', s, fi + i, jj, 0), 'wallDoorway', 0, palette);
      }
    }
    for (let j = 0; j < fd; j++) {
      for (const ii of [fi, fi + fw]) {
        put(slotKey('e', s, ii, fj + j, 1), r() < 0.40 ? 'wallWindow' : 'wall', 0, palette);
      }
    }
    // corner posts
    for (const ii of [fi, fi + fw]) {
      for (const jj of [fj, fj + fd]) {
        if (r() < 0.55) put(slotKey('k', s, ii, jj), 'cornerPost', 0, palette);
      }
    }
  }
  // roof: one span over the whole footprint, the same as the player gets
  {
    const style = r() < 0.30 ? 'flat' : (r() < 0.30 ? 'hip' : 'gable');
    const p = getPart('roof');
    if (p) {
      parts[slotKey('c', storeys, fi, fj)] = {
        part: 'roof', rot: 0, free: 0, w: fw, d: fd, style,
        colors: palette, t: 0,
      };
    }
  }
  // a fence along the street edge
  const fenceKind = pick(r, ['picketFence', 'lowFence', 'hedge', 'wickerFence', 'slatFence']);
  for (let i = 0; i < g.cols; i++) {
    if (r() < 0.14) continue;
    put(slotKey('e', 0, i, 0, 0), fenceKind, 0, palette);
  }
  // garden: trees, a path, and something charming
  const treeKinds = ['treeRound', 'treeSlender', 'evergreen', 'bush', 'treeBlossom'];
  for (let i = 0; i < g.cols; i++) {
    for (let j = 0; j < g.rows; j++) {
      if (i >= fi && i < fi + fw && j >= fj && j < fj + fd) continue;
      const k = slotKey('c', 0, i, j);
      if (parts[k]) continue;
      const q = r();
      if (q < 0.20) put(k, pick(r, treeKinds));
      else if (q < 0.34) put(k, pick(r, ['pathCobble', 'pathBrick', 'pathStepping', 'pathPaving']));
      else if (q < 0.42) put(k, pick(r, ['flowerbed', 'bench', 'planterBox', 'pottedPlant', 'rock']));
      else if (q < 0.46) put(k, pick(r, ['lamppost', 'birdhouse', 'mailbox', 'signpost']));
    }
  }
  return parts;
}

function describeTown(nb) {
  const n = nb.partCount;
  const size = n > 90 ? 'a sprawling' : n > 55 ? 'a busy' : n > 28 ? 'a tidy' : 'a small';
  const flavour = ['garden-heavy', 'tightly built', 'full of lanterns', 'all fences and hedges'][nb.style];
  return `${size} lot, ${flavour}.`;
}

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
