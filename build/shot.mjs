/**
 * Screenshot / smoke-test harness.
 *   node build/shot.mjs <file.html> <outdir> [name=query ...]
 * Renders at iPhone 14 resolution (390x844 CSS, dpr 3) and reports console
 * errors, which is the only way to know the page is actually right.
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const [file, outDir, ...shots] = process.argv.slice(2);
if (!file) { console.error('usage: shot.mjs <file.html> <outdir> [name=query ...]'); process.exit(1); }
mkdirSync(outDir, { recursive: true });

// The image ships a pinned chromium that may not match the npm playwright
// build number, so find it rather than letting playwright guess.
const CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
];
const exe = CANDIDATES.find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
    '--disable-dev-shm-usage', '--hide-scrollbars'],
});

const errors = [];
const results = [];

for (const spec of (shots.length ? shots : ['default='])) {
  const eq = spec.indexOf('=');
  const name = eq < 0 ? spec : spec.slice(0, eq);
  const query = eq < 0 ? '' : spec.slice(eq + 1);
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${name}] PAGEERROR ${e.message}`));

  const url = 'file://' + resolve(file) + (query ? '?' + query : '');
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });

  try {
    await page.waitForFunction('window.__ready === true', { timeout: 240000 });
  } catch {
    errors.push(`[${name}] never became ready`);
  }
  // let a few frames settle so streaming and springs land
  await page.waitForTimeout(2200);

  const stats = await page.evaluate(() => window.__stats?.() ?? null);
  const path = `${outDir}/${name}.png`;
  await page.screenshot({ path });
  results.push({ name, path, stats });
  console.log(`shot ${name} -> ${path}${stats ? ' ' + JSON.stringify(stats) : ''}`);
  await ctx.close();
}

await browser.close();
if (errors.length) {
  console.log('\nCONSOLE ERRORS:');
  for (const e of errors) console.log('  ' + e);
} else {
  console.log('\nNo console errors.');
}
process.exit(errors.length ? 2 : 0);
