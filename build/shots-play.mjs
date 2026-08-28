// The states you are actually in while playing, as opposed to the menus.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

// The camera chases its target per rendered frame, and this renderer manages
// well under one frame a second — so a fixed wait catches it mid-flight and the
// screenshot shows the side of whatever it was passing. Wait for it to arrive.
async function settleCam(p, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const done = await p.evaluate(() => {
      const c = window.__app?.cam; if (!c) return true;
      const da = Math.abs(Math.atan2(Math.sin(c.tHeading - c.heading), Math.cos(c.tHeading - c.heading)));
      return da < 0.01 && Math.abs(c.tDist - c.dist) < 0.5
        && c.focus.distanceTo(c.tFocus) < 0.5;
    });
    if (done) { await p.waitForTimeout(300); return; }
    await p.waitForTimeout(200);
  }
}

const OUT = process.argv[2] || 'dist/play';
mkdirSync(OUT, { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

// 1. the real first run, walkthrough and all
await p.goto('file://' + resolve('dist/index.html') + '?t=10&q=medium', { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.__ready===true', { timeout: 240000 });
await settleCam(p);
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/p1-first-run.png` });

// 2. browse mode, walkthrough dismissed
await p.evaluate(() => { window.__app.endTutorial?.(); window.__app.sheets.closeAll(); });
await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/p2-browse.png` });

// 3. the catalogue, opened the way a player opens it
await p.evaluate(() => { const a = window.__app; a.enterBuild(); });
await settleCam(p);
await p.evaluate(() => window.__app.hudRoot.querySelector('#buildbar .held .btn').click());
await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/p4-catalogue.png` });

// 4. build mode with a part actually held, picked from the drawer
await p.evaluate(() => {
  const a = window.__app;
  [...a.hudRoot.querySelectorAll('.cat-item')].find((n) => !n.classList.contains('locked')).click();
});
await p.waitForTimeout(900);
await p.evaluate(() => window.__app.sheets.closeAll());
await p.waitForTimeout(900);
await p.screenshot({ path: `${OUT}/p3-build-bar.png` });

// 5. a selected slot, with the colour row
await p.evaluate(() => {
  const a = window.__app; a.sheets.closeAll();
  const lot = a.state.s.lots[0]; const k = Object.keys(lot.parts)[0];
  a.ui.selectedSlot = k; a.ui.showColours = true; a.bar.render();
});
await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/p5-colours.png` });

// 6. the site card, from a tap on a lot
await p.evaluate(() => { const a = window.__app; a.exitBuild(); a.sheets.closeAll(); a.goHome(); });
await settleCam(p);
await p.screenshot({ path: `${OUT}/p6-home.png` });

console.log('errors:', errs.length ? errs.slice(0, 5) : 'none');
await b.close();
