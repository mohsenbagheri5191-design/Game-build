/**
 * SwiftShader rasterises on the CPU, so the fps it reports says almost nothing
 * about a phone with a GPU. This isolates the part that *is* representative:
 * the per-frame JavaScript cost (streaming, camera, instancing, scene graph),
 * measured at a viewport small enough that rasterisation is negligible.
 */
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });

const out = {};
for (const [label, w, h] of [['tiny 120x260', 120, 260], ['phone 390x844', 390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('file://' + resolve('dist/index.html') + '?notut=1&t=11&q=medium', { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction('window.__ready === true', { timeout: 240000 });
  await page.evaluate(() => window.__app.cam.frame(-240, 500, 60, 2.5, 0.5, true));
  await page.waitForFunction('window.__app.chunks.pendingCount === 0', { timeout: 200000 }).catch(() => {});
  await page.waitForTimeout(2500);
  out[label] = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
      else res({ fps: +((n * 1000) / (performance.now() - t0)).toFixed(1),
                 draws: window.__app.stage.renderer.info.render.calls,
                 tris: window.__app.stage.renderer.info.render.triangles }); };
    requestAnimationFrame(tick);
  }));
  await ctx.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
