/** Poke at the running game from Playwright and print state. */
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
const file = process.argv[2] || 'dist/index.html';
const script = process.argv[3];

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('ERR ' + m.text()); });

await page.goto('file://' + resolve(file), { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.__ready === true', { timeout: 180000 });
await page.waitForTimeout(3000);

// the script is an arrow function source; invoke it in the page
const out = await page.evaluate(`(${script})()`);
console.log(JSON.stringify(out, null, 2));
if (errors.length) { console.log('\nERRORS:'); errors.forEach((e) => console.log('  ' + e)); }
await browser.close();
