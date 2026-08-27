/**
 * Bundle everything into one self-contained HTML file.
 *
 *   node build/bundle.mjs [--entry src/main.js] [--out dist/index.html] [--dev]
 *
 * three.js, the game code and the baked city all end up inline. The result
 * makes no network request of any kind once it has loaded.
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const dev = args.includes('--dev');
const entry = arg('--entry', 'src/main.js');
const out = arg('--out', 'dist/index.html');
const title = arg('--title', 'Toronto Builder');

const res = await build({
  entryPoints: [entry],
  bundle: true,
  // esm rather than iife so the entry can use top-level await for the city
  // decode; the script tag below is type="module" to match.
  format: 'esm',
  target: ['safari15', 'chrome100'],
  minify: !dev,
  sourcemap: false,
  legalComments: 'none',
  write: false,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
});
const js = res.outputFiles[0].text;

const cssPath = 'src/ui/style.css';
const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${title}">
<meta name="theme-color" content="#111820">
<meta name="color-scheme" content="dark light">
<meta name="description" content="A low-poly city builder on the real streets of downtown Toronto.">
<title>${title}</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#16202b"/><path d="M20 46V28l7-5 7 5v18z" fill="#e8d9b8"/><path d="M38 46V20l4-3 4 3v26z" fill="#c8b48b"/><rect x="14" y="46" width="38" height="4" rx="2" fill="#6d7f8c"/></svg>')}">
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<noscript>This game needs JavaScript.</noscript>
<script type="module">${js}</script>
</body>
</html>`;

mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
writeFileSync(out, html);

const bytes = Buffer.byteLength(html);
const gz = gzipSync(Buffer.from(html)).length;
const report = {
  out,
  bytes,
  kb: +(bytes / 1024).toFixed(1),
  gzipKb: +(gz / 1024).toFixed(1),
  jsKb: +(Buffer.byteLength(js) / 1024).toFixed(1),
  cssKb: +(Buffer.byteLength(css) / 1024).toFixed(1),
};
writeFileSync('build/bundle-stats.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
