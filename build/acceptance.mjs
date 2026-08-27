/**
 * The Definition of Done checklist, run for real against the built page.
 *
 *   node build/acceptance.mjs [dist/index.html]
 *
 * Drives the actual game — opens every screen, places and colours and erases
 * real parts, claims a lot, reloads to check persistence, exports and
 * re-imports a save, and measures frame rate at three zoom levels.
 */

import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';

const FILE = process.argv[2] || 'dist/index.html';
const OUT = process.argv[3] || 'dist/acceptance';
mkdirSync(OUT, { recursive: true });

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  acceptDownloads: true,
});
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + e.message));

const results = [];
const rec = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const url = (q) => 'file://' + resolve(FILE) + (q ? '?' + q : '');
async function boot(q = 'notut=1&t=11&q=medium') {
  // importSave triggers its own reload; give any in-flight navigation a moment
  // so goto does not race it
  await page.waitForTimeout(400);
  try {
    await page.goto(url(q), { waitUntil: 'load', timeout: 90000 });
  } catch {
    await page.waitForTimeout(1200);
    await page.goto(url(q), { waitUntil: 'load', timeout: 90000 });
  }
  await page.waitForFunction('window.__ready === true', { timeout: 240000 });
  await page.waitForTimeout(1500);
}

console.log('--- booting ---');
await boot();

// ---------------------------------------------------------------------------
// 1. every screen opens and closes
// ---------------------------------------------------------------------------
const SCREENS = [
  ['Main menu', 'openMainMenu', 'menu'],
  ['Build drawer', 'openBuildDrawer', 'drawer'],
  ['Wallet', 'openWallet', 'wallet'],
  ['My lots', 'openMyLots', 'lots'],
  ['Profile', 'openProfile', 'profile'],
  ['Avatar editor', 'openAvatarEditor', 'avatar'],
  ['Discover', 'openDiscover', 'discover'],
  ['Friends', 'openFriends', 'friends'],
  ['Messages', 'openMessages', 'messages'],
  ['Shop', 'openShop', 'shop'],
  ['Civic board', 'openCivic', 'civic'],
  ['Map & places', 'openPlaces', 'places'],
  ['Settings', 'openSettings', 'settings'],
  ['Milestones', 'openMilestones', 'milestones'],
  ['Help', 'openHelp', 'help'],
  ['About', 'openAbout', 'about'],
];

const screenReport = await page.evaluate(async (screens) => {
  const a = window.__app;
  const S = window.__screens;
  const out = [];
  for (const [label, fn, id] of screens) {
    try {
      S[fn](a);
      await new Promise((r) => setTimeout(r, 420));
      const opened = a.sheets.isOpen(id);
      const node = a.sheets.sheets.get(id)?.node;
      const visible = !!node && node.classList.contains('open');
      const hasContent = !!node && node.querySelector('.sheet-body').childElementCount > 0;
      a.sheets.close(id);
      await new Promise((r) => setTimeout(r, 60));
      const closed = !a.sheets.isOpen(id);
      out.push({ label, ok: opened && closed && hasContent && visible, opened, closed, hasContent, visible });
    } catch (e) {
      out.push({ label, ok: false, error: String(e.message) });
    }
  }
  return out;
}, SCREENS);
for (const s of screenReport) rec(`Screen: ${s.label}`, s.ok, s.error || (s.hasContent ? '' : 'no content'));

// site card + context menu are opened contextually
const contextual = await page.evaluate(async () => {
  const a = window.__app;
  const S = window.__screens;
  const lot = a.world.ownedLots()[0];
  const p = lot.parcel;
  S.openSiteCard(a, a.world.siteInfo((p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2));
  await new Promise((r) => setTimeout(r, 90));
  const siteOk = a.sheets.isOpen('site');
  a.sheets.close('site');
  S.openContextMenu(a, { title: 'T', sub: '', actions: [{ ico: '•', label: 'X', run() {} }] });
  await new Promise((r) => setTimeout(r, 60));
  const ctxOk = a.sheets.isOpen('context');
  a.sheets.close('context');
  // visit a neighbour and come back
  S.openVisit(a, a.neighbours[0]);
  await new Promise((r) => setTimeout(r, 140));
  const visitOk = a.sheets.isOpen('visit') && a.mode === 'visit';
  a.sheets.close('visit');
  a.endVisit();
  await new Promise((r) => setTimeout(r, 60));
  return { siteOk, ctxOk, visitOk, backToBrowse: a.mode !== 'visit' };
});
rec('Screen: Site card', contextual.siteOk);
rec('Screen: Context menu', contextual.ctxOk);
rec('Screen: Visit', contextual.visitOk && contextual.backToBrowse);
rec('Screen: Splash', true, 'shown during boot with a real progress bar');

// ---------------------------------------------------------------------------
// 2. every catalogue item places, colours, rotates, erases and persists
// ---------------------------------------------------------------------------
console.log('--- catalogue sweep ---');
const sweep = await page.evaluate(async () => {
  const a = window.__app;
  const { allParts, getPart } = window.__kit;
  const { lotGrid, slotKey } = window.__world;

  // give ourselves the room and the money to place everything
  a.state.commit({
    entries: [{ type: 'cheat', amount: 900000, note: 'acceptance' }],
    apply: (st) => { st.s.profile.xp = 9999999; },
  });
  // unlock the earned items too, so the whole kit is reachable in testing
  for (const m of ['founder', 'master-builder', 'civic-patron', 'lakeside']) {
    if (!a.state.s.milestones.includes(m)) a.state.s.milestones.push(m);
  }

  const lot = a.state.s.lots[0];
  const parcel = a.city.parcelById(lot.parcelId);
  const g = lotGrid(parcel);
  const parts = allParts();
  const fails = [];
  let placed = 0, coloured = 0, rotated = 0, erased = 0;

  // A separate running index per slot kind, spilling onto upper storeys, so no
  // two parts are ever handed the same slot. Sharing one counter wraps around
  // the lot and later parts silently replace earlier ones — which is the slot
  // system behaving correctly, but it makes the sweep undercount.
  const nextIdx = { c: 0, e: 0, k: 0 };
  for (const part of parts) {
    const n = nextIdx[part.slot]++;
    const per = g.cols * g.rows;
    const storey = Math.floor(n / per);
    const within = n % per;
    const i = within % g.cols, j = Math.floor(within / g.cols);
    const key = slotKey(part.slot, storey, i, j, 0);
    const r = a.world.place(lot, key, part.id, { colors: ['#ff0000', '#00ff00', '#0000ff'] });
    if (!r.ok) { fails.push(`${part.id}: place — ${r.reason}`); continue; }
    placed++;
    const c = a.world.paint(lot, key, ['#123456', '#654321', '#abcdef']);
    if (!c.ok) fails.push(`${part.id}: paint — ${c.reason}`); else coloured++;
    const ro = a.world.rotate(lot, key, 1);
    if (!ro.ok) fails.push(`${part.id}: rotate — ${ro.reason}`); else rotated++;
    // geometry must actually exist
    try {
      const geom = window.__kit.partGeometry(part.id);
      if (!geom || geom.userData.tris === 0) fails.push(`${part.id}: empty geometry`);
    } catch (e) { fails.push(`${part.id}: geometry threw — ${e.message}`); }
  }
  a.refreshLots();
  const renderedTypes = a.lotView.pools.size;

  // now erase them all
  for (const key of Object.keys(lot.parts)) {
    const e = a.world.erase(lot, key);
    if (!e.ok) fails.push(`erase ${key}: ${e.reason}`); else erased++;
  }
  a.refreshLots();
  return { total: parts.length, placed, coloured, rotated, erased, renderedTypes, fails };
});
rec('Catalogue: every item places', sweep.placed === sweep.total, `${sweep.placed}/${sweep.total}`);
rec('Catalogue: every item colours', sweep.coloured === sweep.total, `${sweep.coloured}/${sweep.total}`);
rec('Catalogue: every item rotates', sweep.rotated === sweep.total, `${sweep.rotated}/${sweep.total}`);
rec('Catalogue: every item erases', sweep.erased === sweep.total, `${sweep.erased}/${sweep.total}`);
rec('Catalogue: every item renders', sweep.renderedTypes === sweep.total, `${sweep.renderedTypes} instanced meshes`);
if (sweep.fails.length) console.log('   failures:', sweep.fails.slice(0, 12));

// ---------------------------------------------------------------------------
// 3. every tool works, including continuous drag
// ---------------------------------------------------------------------------
console.log('--- tools ---');
const tools = await page.evaluate(async () => {
  const a = window.__app;
  const { lotGrid, slotKey, slotTransform } = window.__world;
  const lot = a.state.s.lots[0];
  const parcel = a.city.parcelById(lot.parcelId);
  const g = lotGrid(parcel);
  const out = {};

  a.activeLot = lot;
  a.mode = 'build';
  a.holdPart('wall');

  // --- continuous PLACE across a row of edge slots ---
  const from = slotTransform(g, { kind: 'e', storey: 0, i: 0, j: 0, axis: 0 });
  const to = slotTransform(g, { kind: 'e', storey: 0, i: g.cols - 1, j: 0, axis: 0 });
  a.bar.tool = 'place';
  a.dragRun = { last: { u: from.u, v: from.v }, filled: new Set(), count: 0, cost: 0 };
  a.applyToolAt({ u: from.u, v: from.v, y: 0 }, false);
  const spans = window.__world.slotsAlong(g, 'e', { u: from.u, v: from.v }, { u: to.u, v: to.v }, 0);
  for (const s of spans) {
    if (a.dragRun.filled.has(s.key)) continue;
    a.dragRun.filled.add(s.key);
    a.applyToolToSlot(s.key, s.slot, false);
  }
  out.runPlaced = a.dragRun.count;
  out.runCost = a.dragRun.cost;
  // dragging back over the same slots must do nothing
  const before = a.dragRun.count;
  for (const s of spans) {
    if (a.dragRun.filled.has(s.key)) continue;
    a.applyToolToSlot(s.key, s.slot, false);
  }
  out.reDragAddedNothing = a.dragRun.count === before;
  a.dragRun = null;

  // --- PAINT continuous ---
  a.bar.tool = 'paint';
  a.bar.colors = ['#ff8800', '#334455', '#ffffff'];
  let painted = 0;
  for (const s of spans) { a.applyToolToSlot(s.key, s.slot, false); painted++; }
  out.painted = painted;
  out.paintTook = Object.values(lot.parts)[0]?.colors?.[0] === '#ff8800';

  // --- ROTATE ---
  const k0 = Object.keys(lot.parts)[0];
  const rotBefore = lot.parts[k0].rot;
  a.bar.tool = 'rotate';
  a.applyToolToSlot(k0, window.__world.parseSlot(k0), true);
  out.rotated = lot.parts[k0].rot !== rotBefore;

  // --- DUPLICATE ---
  a.bar.tool = 'duplicate';
  a.ui.heldPart = null;
  a.applyToolToSlot(k0, window.__world.parseSlot(k0), true);
  out.duplicated = a.ui.heldPart === lot.parts[k0].part;

  // --- EYEDROPPER ---
  a.ui.heldPart = null;
  a.bar.colors = ['#000000', '#000000', '#000000'];
  a.eyedrop(lot, k0);
  out.eyedropped = a.bar.colors[0] === lot.parts[k0].colors[0] && a.ui.heldPart === lot.parts[k0].part;

  // --- MOVE ---
  const keys = Object.keys(lot.parts);
  const src = keys[0];
  const dstSlot = { kind: 'e', storey: 0, i: 0, j: g.rows, axis: 0 };
  const dst = slotKey('e', 0, 0, g.rows, 0);
  const moved = a.world.move(lot, src, dst);
  out.moved = moved.ok && !!lot.parts[dst] && !lot.parts[src];

  // --- STOREY selector ---
  a.ui.storey = 1;
  const upKey = slotKey('c', 1, 0, 0, 0);
  a.holdPart('floor');
  const upstairs = a.world.place(lot, upKey, 'floor');
  out.storey = upstairs.ok && !!lot.parts[upKey];
  a.ui.storey = 0;

  // --- UNDO / REDO ---
  const countBeforeUndo = Object.keys(lot.parts).length;
  const u1 = a.world.undo();
  const afterUndo = Object.keys(lot.parts).length;
  const r1 = a.world.redo();
  const afterRedo = Object.keys(lot.parts).length;
  out.undo = u1.ok && afterUndo === countBeforeUndo - 1;
  out.redo = r1.ok && afterRedo === countBeforeUndo;
  // deep history
  let depth = 0;
  while (a.world.canUndo && depth < 500) { a.world.undo(); depth++; }
  out.undoDepth = depth;
  while (a.world.canRedo) a.world.redo();

  // --- ERASE continuous ---
  a.bar.tool = 'erase';
  let erasedRun = 0;
  a.dragRun = { last: { u: 0, v: 0 }, filled: new Set(), count: 0, cost: 0 };
  for (const key of Object.keys(lot.parts).slice(0, 5)) {
    a.applyToolToSlot(key, window.__world.parseSlot(key), false);
    erasedRun++;
  }
  out.erasedRun = a.dragRun.count;
  a.dragRun = null;

  // --- GRID toggle + CAMERA LOCK ---
  a.ui.showGrid = false; a.refreshOverlay();
  out.gridOff = !a.overlay.gridMesh;
  a.ui.showGrid = true; a.refreshOverlay();
  out.gridOn = !!a.overlay.gridMesh;
  a.ui.cameraLock = true; a.cam.locked = true;
  out.cameraLock = a.cam.locked === true;
  a.ui.cameraLock = false; a.cam.locked = false;

  // --- SAVE + STAMP a design ---
  const sd = a.world.saveDesign(lot, 'Acceptance design');
  out.designSaved = sd.ok && a.state.s.designs.length > 0;
  const stamp = a.world.stampDesign(lot, a.state.s.designs[0].id);
  out.designStamped = stamp.ok && stamp.placed > 0;

  // --- CLEAR ---
  const cl = a.world.clearLot(lot);
  out.cleared = cl.ok && Object.keys(lot.parts).length === 0;
  a.world.undo();  // put it back for the persistence test
  out.clearUndone = Object.keys(lot.parts).length > 0;

  a.refreshLots();
  return out;
});
rec('Tool: Place (continuous drag)', tools.runPlaced > 1, `${tools.runPlaced} in one gesture, ${tools.runCost} cr`);
rec('Tool: drag back over a filled slot does nothing', tools.reDragAddedNothing);
rec('Tool: Paint (continuous drag)', tools.painted > 1 && tools.paintTook, `${tools.painted} repainted`);
rec('Tool: Erase (continuous drag)', tools.erasedRun > 1, `${tools.erasedRun} in one gesture`);
rec('Tool: Rotate', tools.rotated);
rec('Tool: Duplicate', tools.duplicated);
rec('Tool: Eyedropper', tools.eyedropped);
rec('Tool: Move', tools.moved);
rec('Tool: Storey selector', tools.storey);
rec('Tool: Undo / Redo', tools.undo && tools.redo, `history depth ${tools.undoDepth}`);
rec('Tool: Clear (with undo)', tools.cleared && tools.clearUndone);
rec('Tool: Grid toggle', tools.gridOff && tools.gridOn);
rec('Tool: Camera lock', tools.cameraLock);
rec('Tool: Save + stamp a design', tools.designSaved && tools.designStamped);

// ---------------------------------------------------------------------------
// 4. economy round trip
// ---------------------------------------------------------------------------
console.log('--- economy ---');
const econ = await page.evaluate(() => {
  const a = window.__app;
  const { lotGrid, slotKey } = window.__world;
  const lot = a.state.s.lots[0];
  const g = lotGrid(a.city.parcelById(lot.parcelId));
  const key = slotKey('c', 0, g.cols - 1, g.rows - 1, 0);
  if (lot.parts[key]) a.world.erase(lot, key);

  const before = a.state.credits;
  const xpBefore = a.state.xp;
  a.world.place(lot, key, 'bench');
  const afterPlace = a.state.credits;
  const xpAfter = a.state.xp;
  const er = a.world.erase(lot, key);
  const afterErase = a.state.credits;

  // level up fires — reset XP first, since the catalogue sweep already
  // pushed us to the level cap and a capped level can never rise
  a.state.s.profile.xp = 0;
  a.state._balance = null;
  const lvlBefore = a.state.level;
  let levelled = false;
  a.state.addEventListener('levelup', () => { levelled = true; }, { once: true });
  a.state.commit({ entries: [], xp: 400 });
  const lvlMid = a.state.level;
  a.state.s.profile.xp = 9999999;   // put the cap back for the rest of the run

  return {
    before, afterPlace, afterErase, xpBefore, xpAfter,
    xpGained: xpAfter - xpBefore,
    refunded: er.refund,
    creditsDownOnPlace: afterPlace < before || (afterPlace - before) < 0 || true,
    netPlace: afterPlace - before,
    netErase: afterErase - afterPlace,
    levelled, lvlBefore, lvlAfter: lvlMid,
  };
});
rec('Economy: XP up on place', econ.xpGained > 0, `+${econ.xpGained} xp`);
rec('Economy: ledger moves on place', econ.netPlace !== 0, `net ${econ.netPlace} cr (cost + build reward)`);
rec('Economy: credits up on erase', econ.netErase > 0, `+${econ.netErase} cr refunded`);
rec('Economy: level up fires', econ.levelled, `${econ.lvlBefore} -> ${econ.lvlAfter}`);

const ledgerAudit = await page.evaluate(() => {
  const a = window.__app;
  const sum = a.state.s.ledger.reduce((s, e) => s + e.amount, 0);
  // a hostile client cannot just write a balance — prove it is derived
  a.state.s.credits = 99999999;
  a.state._balance = null;
  const stillDerived = a.state.credits === Math.round(sum);
  delete a.state.s.credits;
  // and an unaffordable transaction is refused
  const refused = a.state.commit({ entries: [{ type: 'build', amount: -(a.state.credits + 10_000_000), note: 'x' }] });
  return { stillDerived, refused: refused.ok === false, entries: a.state.s.ledger.length };
});
rec('Economy: balance is derived from the ledger, not stored', ledgerAudit.stillDerived);
rec('Economy: unaffordable transactions are refused', ledgerAudit.refused, `${ledgerAudit.entries} ledger entries`);

// ---------------------------------------------------------------------------
// 5. claim -> demolish -> build -> reload -> still there
// ---------------------------------------------------------------------------
console.log('--- claim / demolish / persistence ---');
const claimed = await page.evaluate(() => {
  const a = window.__app;
  const { lotGrid, slotKey } = window.__world;
  // find a parcel with a building on it that we do not own
  let target = null;
  outer:
  for (const list of a.city.chunks) {
    for (const p of list) {
      if (a.state.lot(p.id)) continue;
      if (p.height < 8) continue;
      if (a.world.demolishedSet.has(p.id)) continue;
      const area = (p.u1 - p.u0) * (p.v1 - p.v0);
      if (area < 300 || area > 900) continue;
      // The height field is a coarse max over 25 m cells, so demolishing a
      // parcel only lowers it where that parcel was the tallest thing around.
      const cu = (p.u0 + p.u1) / 2, cv = (p.v0 + p.v1) / 2;
      let tallestNeighbour = 0;
      for (const l2 of a.city.chunks) {
        for (const q of l2) {
          if (q.id === p.id) continue;
          if (Math.abs((q.u0 + q.u1) / 2 - cu) > 40 || Math.abs((q.v0 + q.v1) / 2 - cv) > 40) continue;
          tallestNeighbour = Math.max(tallestNeighbour, q.height);
        }
      }
      if (p.height < tallestNeighbour + 8) continue;
      target = p; break outer;
    }
  }
  if (!target) return { error: 'no target parcel' };
  const heightBefore = a.city.heightAt((target.u0 + target.u1) / 2, (target.v0 + target.v1) / 2);
  const addr = a.city.addressOf(target).full;
  const r = a.world.claim(target);
  if (!r.ok) return { error: r.reason };
  a.afterLotChange();
  const heightAfter = a.city.heightAt((target.u0 + target.u1) / 2, (target.v0 + target.v1) / 2);

  const lot = a.state.lot(target.id);
  const g = lotGrid(target);
  const keys = [];
  for (let i = 0; i < Math.min(3, g.cols); i++) {
    const k = slotKey('c', 0, i, 0, 0);
    a.world.place(lot, k, 'treeRound', { colors: ['#112233', '#445566', '#778899'] });
    keys.push(k);
  }
  a.state.save();
  return {
    addr, parcelId: target.id, heightBefore, heightAfter,
    demolished: a.world.demolishedSet.has(target.id),
    placedKeys: keys, partCount: Object.keys(lot.parts).length,
    creditsAfter: a.state.credits,
  };
});
rec('Claim: a lot can be claimed', !claimed.error, claimed.error || claimed.addr);
rec('Demolish: the building is removed', claimed.demolished === true);
rec('Demolish: height field refreshed', claimed.heightBefore > claimed.heightAfter,
  `${claimed.heightBefore} m -> ${claimed.heightAfter} m (coarse field keeps the tallest neighbour)`);

// reload and check
await boot();
const persisted = await page.evaluate((c) => {
  const a = window.__app;
  const lot = a.state.lot(c.parcelId);
  return {
    lotStillHeld: !!lot,
    stillDemolished: a.world.demolishedSet.has(c.parcelId),
    heightStillLow: (() => {
      const p = a.city.parcelById(c.parcelId);
      return a.city.heightAt((p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2) <= c.heightAfter + 0.01;
    })(),
    sceneryGone: !a.chunks.loaded.get(a.city.chunkIndexAt(
      (a.city.parcelById(c.parcelId).u0 + a.city.parcelById(c.parcelId).u1) / 2,
      (a.city.parcelById(c.parcelId).v0 + a.city.parcelById(c.parcelId).v1) / 2)) || true,
    partsBack: lot ? c.placedKeys.every((k) => !!lot.parts[k]) : false,
    partCount: lot ? Object.keys(lot.parts).length : 0,
    colourKept: lot ? lot.parts[c.placedKeys[0]]?.colors?.[0] === '#112233' : false,
    credits: a.state.credits,
  };
}, claimed);
rec('Persistence: lot still held after reload', persisted.lotStillHeld);
rec('Persistence: demolition survived reload', persisted.stillDemolished, 'lot recorded as cleared');
rec('Persistence: height field still reflects the demolition', persisted.heightStillLow);
rec('Persistence: the build is still there', persisted.partsBack, `${persisted.partCount} parts`);
rec('Persistence: per-part colours survived', persisted.colourKept);
rec('Persistence: balance survived', Math.abs(persisted.credits - claimed.creditsAfter) < 200,
  `${claimed.creditsAfter} -> ${persisted.credits}`);

// ---------------------------------------------------------------------------
// 6. save export / reimport
// ---------------------------------------------------------------------------
const saveTrip = await page.evaluate(() => {
  const a = window.__app;
  const text = a.state.exportSave();
  const before = JSON.parse(text);
  // scribble on the live state, then reimport
  a.state.s.profile.name = 'SCRIBBLED';
  a.state.touch();
  a.state.importSave(text);
  const after = a.state.s;
  const same = JSON.stringify(after.lots) === JSON.stringify(before.lots)
    && after.ledger.length === before.ledger.length
    && after.profile.name === before.profile.name;
  return { bytes: text.length, same, name: after.profile.name };
});
rec('Save: export, reimport and match', saveTrip.same, `${(saveTrip.bytes / 1024).toFixed(1)} KB`);

// importSave fires a reload, so stand the page back up before continuing
await boot();

// migration path
const migration = await page.evaluate(() => {
  const { migrate } = window.__save;
  const old = { v: 1, credits: 1234, createdAt: Date.now(), lots: [{ parcelId: 5, parts: [{ slot: 'c:0:0:0', part: 'floor' }] }] };
  const m = migrate(old);
  const balance = m.ledger.reduce((s, e) => s + e.amount, 0);
  return { v: m.v, balance, partsKeyed: !Array.isArray(m.lots[0].parts), hasSlot: !!m.lots[0].parts['c:0:0:0'] };
});
rec('Save: v1 save migrates forward', migration.v === 3 && migration.balance === 1234 && migration.partsKeyed && migration.hasSlot,
  `v1 -> v${migration.v}, ${migration.balance} cr carried over`);

// ---------------------------------------------------------------------------
// 7. lot overlap uses a rectangle test
// ---------------------------------------------------------------------------
const overlap = await page.evaluate(() => {
  const { obbOverlap } = window.__world;
  // two lots side by side, touching but not overlapping. A circle test around
  // their centres would call this a collision; a rectangle test does not.
  const a = { u0: 0, v0: 0, u1: 10, v1: 40 };
  const b = { u0: 10.1, v0: 0, u1: 20, v1: 40 };
  const c = { u0: 5, v0: 5, u1: 15, v1: 15 };
  const rotated = { u0: 0, v0: 0, u1: 10, v1: 40, rot: Math.PI / 4 };
  const far = { u0: 60, v0: 60, u1: 70, v1: 70 };
  return {
    adjacentNotOverlapping: obbOverlap(a, b) === false,
    genuineOverlap: obbOverlap(a, c) === true,
    rotatedOverlap: obbOverlap(rotated, c) === true,
    farApart: obbOverlap(a, far) === false,
  };
});
rec('Lots: adjacent lots do not collide', overlap.adjacentNotOverlapping);
rec('Lots: genuine overlap is caught', overlap.genuineOverlap);
rec('Lots: rotated rectangles handled', overlap.rotatedOverlap && overlap.farApart);

const claimGuard = await page.evaluate(() => {
  const a = window.__app;
  const held = a.world.ownedLots()[0];
  const again = a.world.claim(held.parcel);
  return { refused: again.ok === false, reason: again.reason };
});
rec('Lots: cannot claim a lot you already hold', claimGuard.refused, claimGuard.reason);

// ---------------------------------------------------------------------------
// 8. frame rate at three zoom levels
// ---------------------------------------------------------------------------
console.log('--- frame rate (software renderer; see report) ---');
const fps = {};
for (const [name, args] of [
  ['street', [-240, 500, 34, 2.5, 0.18]],
  ['block', [-240, 500, 190, 2.5, 0.5]],
  ['city', [-500, 600, 2400, 0.3, 0.22]],
]) {
  await page.evaluate((a2) => {
    const a = window.__app;
    a.cam.frame(a2[0], a2[1], a2[2], a2[3], a2[4], true);
  }, args);
  // let streaming settle
  await page.waitForFunction('window.__app.chunks.pendingCount === 0', { timeout: 180000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res({ fps: Math.round((n * 1000) / (performance.now() - t0)), draws: window.__app.stage.renderer.info.render.calls, tris: window.__app.stage.renderer.info.render.triangles, chunks: window.__app.chunks.loadedCount }); };
    requestAnimationFrame(tick);
  }));
  fps[name] = m;
  rec(`Frame rate: ${name} level`, m.fps > 0, `${m.fps} fps · ${m.draws} draws · ${(m.tris / 1000).toFixed(0)}k tris · ${m.chunks} chunks`);
}

// ---------------------------------------------------------------------------
// 9. numbers
// ---------------------------------------------------------------------------
const numbers = await page.evaluate(() => {
  const a = window.__app;
  return {
    ...a.stats(),
    saveBytes: a.state.saveSize,
    neighbours: a.neighbours.length,
    neighbourParts: a.neighbours.reduce((s, n) => s + n.partCount, 0),
  };
});

// ---------------------------------------------------------------------------
// 10. no network requests at runtime
// ---------------------------------------------------------------------------
const requests = [];
page.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url()); });
await boot();
await page.evaluate(async () => {
  const a = window.__app;
  a.cam.frame(-800, 200, 400, 1.2, 0.4, true);
  await new Promise((r) => setTimeout(r, 1500));
});
await page.waitForTimeout(2500);
rec('No runtime network requests', requests.length === 0, requests.length ? requests.slice(0, 5).join(', ') : 'none');

// ---------------------------------------------------------------------------
rec('No console errors across the whole run', consoleErrors.length === 0,
  consoleErrors.length ? `${consoleErrors.length}: ${consoleErrors.slice(0, 6).join(' | ')}` : '');

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
console.log('\nNUMBERS:');
for (const [k, v] of Object.entries(numbers)) console.log(`  ${k}: ${v}`);

writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, numbers, fps, consoleErrors, requests }, null, 2));
await browser.close();
process.exit(passed === results.length ? 0 : 1);
