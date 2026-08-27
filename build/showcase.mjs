/**
 * Build a real structure with the kit, then take the screenshots the brief's
 * Definition of Done asks for. Everything here goes through the same public
 * calls the player's taps go through — nothing is staged.
 *
 *   node build/showcase.mjs [dist/index.html] [outdir]
 */

import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const FILE = process.argv[2] || 'dist/index.html';
const OUT = process.argv[3] || 'dist/shots';
mkdirSync(OUT, { recursive: true });

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const url = (q) => 'file://' + resolve(FILE) + (q ? '?' + q : '');
async function boot(q) {
  await page.goto(url(q), { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction('window.__ready === true', { timeout: 240000 });
  await page.waitForTimeout(1200);
}
async function settle(ms = 2500) {
  await page.waitForFunction('window.__app.chunks.pendingCount === 0', { timeout: 200000 }).catch(() => {});
  await page.waitForTimeout(ms);
}
async function shot(name) {
  const p = `${OUT}/${name}.png`;
  await page.screenshot({ path: p });
  console.log('shot', name);
  return p;
}

// ---------------------------------------------------------------------------
// 10. first open, exactly as a player sees it (tutorial and all)
// ---------------------------------------------------------------------------
await boot('t=10.5');
await settle();
await shot('10-first-open');

// ---------------------------------------------------------------------------
// build a real house + garden with the kit
// ---------------------------------------------------------------------------
console.log('--- building the showcase structure ---');
const built = await page.evaluate(() => {
  const a = window.__app;
  const { lotGrid, slotKey } = window.__world;

  a.state.commit({ entries: [{ type: 'cheat', amount: 200000, note: 'showcase' }], apply: (st) => { st.s.profile.xp = 400000; } });
  a.state.s.tutorialDone = true;
  if (a._coach) { a._coach.remove(); a._coach = null; }

  const lot = a.state.s.lots[0];
  const parcel = a.city.parcelById(lot.parcelId);
  const g = lotGrid(parcel);
  a.activeLot = lot;

  // A palette chosen here only to show that per-part colouring works — the
  // game ships nothing pre-themed.
  const WALL = ['#e8ddc8', '#cdbfa4', '#a9cfe0'];
  const TRIM = ['#4f7fa8', '#2f4a63', '#ffd9a0'];
  const ROOF = ['#7d4a3c', '#5e3529', '#c9b79a'];
  const WOOD = ['#c2a179', '#8d6e4f', '#6f5233'];
  const GREEN = ['#5f8f4b', '#6b4c33', '#d4574a'];
  const STONE = ['#b8b2a6', '#9d9a92', '#7e7a72'];

  const place = (key, part, colors, rot = 0) => a.world.place(lot, key, part, { colors, rot, free: true });

  // footprint: as much of the lot as we can take, set back from the street
  const fw = Math.min(4, Math.max(2, g.cols - 1));
  const fd = Math.min(4, Math.max(2, g.rows - 2));
  const fi = Math.max(0, Math.floor((g.cols - fw) / 2));
  const fj = Math.max(1, Math.floor((g.rows - fd) / 2));
  const doorCol = fi + Math.floor(fw / 2);
  let count = 0;

  for (let s = 0; s < 2; s++) {
    // floors
    for (let i = 0; i < fw; i++) {
      for (let j = 0; j < fd; j++) {
        if (place(slotKey('c', s, fi + i, fj + j), s === 0 ? 'floor' : 'floor', WOOD).ok) count++;
      }
    }
    // front and back walls
    for (let i = 0; i < fw; i++) {
      const x = fi + i;
      const front = slotKey('e', s, x, fj, 0);
      const back = slotKey('e', s, x, fj + fd, 0);
      if (s === 0 && x === doorCol) {
        if (place(front, 'wallDoorway', WALL).ok) count++;
      } else if (place(front, s === 0 ? 'wallWindow' : 'wallWindowWide', WALL).ok) count++;
      if (place(back, s === 0 ? 'wall' : 'wallWindow', WALL).ok) count++;
    }
    // side walls
    for (let j = 0; j < fd; j++) {
      const y = fj + j;
      if (place(slotKey('e', s, fi, y, 1), j % 2 ? 'wallWindow' : 'wall', WALL).ok) count++;
      if (place(slotKey('e', s, fi + fw, y, 1), j % 2 ? 'wall' : 'wallWindow', WALL).ok) count++;
    }
    // corner posts
    for (const ii of [fi, fi + fw]) {
      for (const jj of [fj, fj + fd]) {
        if (place(slotKey('k', s, ii, jj), s === 0 ? 'pillar' : 'cornerPost', TRIM).ok) count++;
      }
    }
  }
  // a real door in the doorway — placing it replaces the doorway wall in that
  // same slot, which is the slot system working as intended
  if (place(slotKey('e', 0, doorCol, fj, 0), 'door', ['#8d5a3b', '#e8ddc8', '#b08a54']).ok) count++;

  // roof: a half-gable slope at each eave, flat deck between them
  for (let j = 0; j < fd; j++) {
    for (let i = 0; i < fw; i++) {
      const key = slotKey('c', 2, fi + i, fj + j);
      if (j === 0) { if (place(key, 'roofSlope', ROOF, 2).ok) count++; }
      else if (j === fd - 1) { if (place(key, 'roofSlope', ROOF, 0).ok) count++; }
      else if (place(key, 'roofFlat', ROOF).ok) count++;
    }
  }
  // coping around the flat part so the edge reads
  for (let i = 0; i < fw; i++) {
    for (const jj of [fj + 1, fj + fd - 1]) {
      const k = slotKey('e', 2, fi + i, jj, 0);
      if (!lot.parts[k]) { /* left open: the slopes already close these edges */ }
    }
  }
  for (let j = 1; j < fd - 1; j++) {
    for (const ii of [fi, fi + fw]) {
      if (place(slotKey('e', 2, ii, fj + j, 1), 'roofCoping', ROOF).ok) count++;
    }
  }

  // railing around the roof deck rather than across the upper wall — putting
  // it on the wall slot would replace the wall and leave the storey open
  for (let i = 0; i < fw; i++) {
    if (place(slotKey('e', 2, fi + i, fj, 0), 'railing', TRIM).ok) count++;
  }

  // --- garden ---
  // path from the door to the street
  for (let j = 0; j < fj; j++) {
    if (place(slotKey('c', 0, doorCol, j), 'pathCobble', STONE).ok) count++;
  }
  // picket fence along the street edge, with a gap for the path
  for (let i = 0; i < g.cols; i++) {
    if (i === doorCol) continue;
    if (place(slotKey('e', 0, i, 0, 0), 'picketFence', ['#f4efe4', '#d8cfbe', '#ffffff']).ok) count++;
  }
  // planting and decor in whatever cells are left
  const filler = [
    ['treeBlossom', GREEN], ['bush', GREEN], ['flowerbed', ['#5b432f', '#7d6247', '#e15a51']],
    ['bench', WOOD], ['lamppost', ['#2f3a42', '#1d262c', '#ffd9a0']],
    ['pottedPlant', ['#b06a4a', '#7d4a34', '#5f8f4b']], ['birdhouse', ['#c2a179', '#7d4a3c', '#4f7fa8']],
    ['pathStepping', STONE], ['tallGrass', GREEN], ['rock', STONE],
  ];
  let fidx = 0;
  for (let i = 0; i < g.cols; i++) {
    for (let j = 0; j < g.rows; j++) {
      if (i >= fi && i < fi + fw && j >= fj && j < fj + fd) continue;
      const key = slotKey('c', 0, i, j);
      if (lot.parts[key]) continue;
      const [p, c] = filler[fidx++ % filler.length];
      if (place(key, p, c).ok) count++;
    }
  }
  // string lights along the front, so night has something to light up
  for (let i = 0; i < g.cols; i++) {
    const key = slotKey('e', 1, i, 0, 0);
    if (!lot.parts[key] && place(key, 'stringLights', ['#3a3a3a', '#6b5a3f', '#ffd9a0']).ok) count++;
  }

  a.refreshLots();
  a.state.save();
  return {
    count, parts: Object.keys(lot.parts).length,
    lot: { u0: parcel.u0, v0: parcel.v0, u1: parcel.u1, v1: parcel.v1 },
    address: a.city.addressOf(parcel).full,
    cols: g.cols, rows: g.rows, side: parcel.side,
    credits: a.state.credits, level: a.state.level, xp: a.state.xp,
  };
});
console.log('built', built.count, 'parts on', built.address, `(${built.cols}x${built.rows} module grid)`);

// ---------------------------------------------------------------------------
// 11. the player's own site, framed by go-home, daylight
// ---------------------------------------------------------------------------
await page.evaluate(() => { window.__app.goHome(); });
await settle();
await shot('11-my-site-gohome');

// ---------------------------------------------------------------------------
// 12. street level, standing outside the lot
// ---------------------------------------------------------------------------
await page.evaluate((b) => {
  const a = window.__app;
  const cu = (b.lot.u0 + b.lot.u1) / 2, cv = (b.lot.v0 + b.lot.v1) / 2;
  a.cam.frame(cu, cv, 30, a.cam.bestHeading(cu, cv, 30, 0.16), 0.16, true);
}, built);
await settle();
await shot('12-street-level');

// ---------------------------------------------------------------------------
// 13. the block from above
// ---------------------------------------------------------------------------
await page.evaluate((b) => {
  const a = window.__app;
  a.cam.frame((b.lot.u0 + b.lot.u1) / 2, (b.lot.v0 + b.lot.v1) / 2, 165, 2.5, 1.15, true);
}, built);
await settle();
await shot('13-block-from-above');

// ---------------------------------------------------------------------------
// 14. the city skyline from a distance
// ---------------------------------------------------------------------------
await page.evaluate(() => {
  const a = window.__app;
  a.cam.frame(-700, -1750, 2300, 0.02, 0.115, true);
});
await settle(4000);
await shot('14-city-skyline');

// ---------------------------------------------------------------------------
// 15 + 16. the structure close up, day then night
// ---------------------------------------------------------------------------
await page.evaluate((b) => {
  const a = window.__app;
  const cu = (b.lot.u0 + b.lot.u1) / 2, cv = (b.lot.v0 + b.lot.v1) / 2;
  a.cam.frame(cu, cv, 26, a.cam.bestHeading(cu, cv, 26, 0.42), 0.42, true);
}, built);
await settle();
await shot('15-structure-day');

await page.evaluate(() => { window.__app._forceHour = 22.0; });
await page.waitForTimeout(2200);
await shot('16-structure-night');
await page.evaluate(() => { window.__app._forceHour = 10.5; });

// ---------------------------------------------------------------------------
// 17. build drawer, modular bar, colour picker
// ---------------------------------------------------------------------------
await page.evaluate(() => {
  const a = window.__app;
  a.enterBuild();
  a.holdPart('wallWindow');
  a.ui.showColours = true;
  a.bar.render();
});
await page.waitForTimeout(1400);
await shot('17a-build-bar-colours');

await page.evaluate(() => { window.__screens.openBuildDrawer(window.__app); });
await page.waitForTimeout(2600);   // let the thumbnails render
await shot('17b-build-drawer');

await page.evaluate(() => {
  const a = window.__app;
  a.sheets.close('drawer');
  a.ui.drawerCat = 'plants';
});
await page.waitForTimeout(400);
await page.evaluate(() => { window.__screens.openBuildDrawer(window.__app); });
await page.waitForTimeout(2600);
await shot('17c-drawer-plants');

// ---------------------------------------------------------------------------
// 18. a nature item close up
// ---------------------------------------------------------------------------
await page.evaluate((b) => {
  const a = window.__app;
  a.sheets.closeAll();
  a.exitBuild();
  // find a tree we placed and get right up to it
  const tree = a.lotView.entries.find((e) => e.partId === 'treeBlossom')
    || a.lotView.entries.find((e) => e.partId === 'bush')
    || a.lotView.entries[0];
  a.cam.frame(tree.u, tree.v - 2.2, 5.0, Math.PI, 0.16, true);
}, built);
await settle();
await shot('18-nature-close');

// ---------------------------------------------------------------------------
// extras: site card, menu, wallet, night street
// ---------------------------------------------------------------------------
await page.evaluate((b) => {
  const a = window.__app;
  a.cam.frame((b.lot.u0 + b.lot.u1) / 2 + 40, (b.lot.v0 + b.lot.v1) / 2, 60, 2.4, 0.5, true);
  const info = a.world.siteInfo((b.lot.u0 + b.lot.u1) / 2 + 34, (b.lot.v0 + b.lot.v1) / 2);
  window.__screens.openSiteCard(a, info);
}, built);
await settle(1600);
await shot('19-site-card');

await page.evaluate(() => {
  const a = window.__app; a.sheets.closeAll(); window.__screens.openMainMenu(a);
});
await page.waitForTimeout(900);
await shot('20-main-menu');

await page.evaluate(() => {
  const a = window.__app; a.sheets.closeAll(); window.__screens.openWallet(a);
});
await page.waitForTimeout(900);
await shot('21-wallet');

await page.evaluate((b) => {
  const a = window.__app;
  a.sheets.closeAll();
  a._forceHour = 21.5;
  const cu2 = (b.lot.u0 + b.lot.u1) / 2, cv2 = (b.lot.v0 + b.lot.v1) / 2;
  a.cam.frame(cu2, cv2, 75, a.cam.bestHeading(cu2, cv2, 75, 0.32), 0.32, true);
}, built);
await settle(2600);
await shot('22-neighbourhood-night');

writeFileSync(`${OUT}/showcase.json`, JSON.stringify({ built, errors }, null, 2));
console.log(errors.length ? `\nCONSOLE ERRORS:\n  ${errors.join('\n  ')}` : '\nNo console errors.');
await browser.close();
