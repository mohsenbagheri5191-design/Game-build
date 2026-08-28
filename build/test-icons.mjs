/**
 * The interface must not contain emoji, and every icon it asks for must exist.
 *
 * Emoji as icons was the single biggest reason this looked unfinished: they
 * arrive in someone else's art style, render differently on every phone, and
 * cannot take the colour of the control they sit on. There were 96 of them
 * across 52 distinct glyphs. This keeps them out.
 *
 * Run: node build/test-icons.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0, fail = 0;
const rec = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`PASS  ${name}${detail ? `  — ${detail}` : ''}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ''}`); }
};

const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js') || p.endsWith('.css')) out.push(p);
  }
  return out;
};
const files = walk('src');

// --- 1. no emoji anywhere in the interface -------------------------------
// Pictographs, dingbats, arrows-as-glyphs and the fullwidth forms that were
// standing in for + and -.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{FF01}-\u{FF5E}]/u;
const offenders = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  src.split('\n').forEach((line, i) => {
    const m = line.match(EMOJI);
    if (m) offenders.push(`${f}:${i + 1} ${m[0]}`);
  });
}
rec('No emoji anywhere in the interface', offenders.length === 0,
  offenders.length ? offenders.slice(0, 8).join(', ') : `${files.length} files clean`);

// --- 2. every icon asked for is one we actually drew ----------------------
const iconsSrc = readFileSync('src/ui/icons.js', 'utf8');
const defined = new Set();
const body = iconsSrc.slice(iconsSrc.indexOf('export const ICONS'), iconsSrc.indexOf('const ALIAS'));
for (const m of body.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\s*:\s*[{(]/gm)) defined.add(m[1]);
const aliasBody = iconsSrc.slice(iconsSrc.indexOf('const ALIAS'), iconsSrc.indexOf('export function icon'));
for (const m of aliasBody.matchAll(/([a-zA-Z][a-zA-Z0-9]*)\s*:\s*'/g)) defined.add(m[1]);

const asked = new Map();
for (const f of files.filter((x) => x.endsWith('.js') && !x.endsWith('icons.js'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bicon\(\s*'([a-zA-Z0-9]+)'/g)) asked.set(m[1], f);
  for (const m of src.matchAll(/\bico:\s*'([a-zA-Z0-9]+)'/g)) asked.set(m[1], f);
  for (const m of src.matchAll(/\btile\(\s*'([a-zA-Z0-9]+)'/g)) asked.set(m[1], f);
}
const missing = [...asked].filter(([n]) => !defined.has(n));
rec('Every icon the interface asks for exists', missing.length === 0,
  missing.length ? missing.map(([n, f]) => `${n} (${f})`).join(', ')
    : `${asked.size} names used, ${defined.size} defined`);

// --- 3. the set is drawn to one spec -------------------------------------
const bad = [];
for (const m of body.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\s*:\s*\{([\s\S]*?)\n\s{2}\}/gm)) {
  const [, name, def] = m;
  if (!/[sfc]\s*:/.test(def)) bad.push(`${name}: nothing drawn`);
}
// single-line entries too
for (const m of body.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\s*:\s*\{([^\n]*)\},?$/gm)) {
  const [, name, def] = m;
  if (!/[sfc]\s*:/.test(def)) bad.push(`${name}: nothing drawn`);
}
rec('Every icon actually draws something', bad.length === 0, bad.join(', ') || `${defined.size} names`);

// --- 4. no cold greys left among the neutrals ----------------------------
/*
 * The neutrals are the tell. "It looks like a dev tool" is, numerically, a
 * palette whose greys have as much blue in them as red — and this one's did.
 * Every paper, edge, ink and background must now lean warm.
 *
 * Accents are exempt on purpose: --sky is meant to be blue, and a cozy palette
 * is perfectly entitled to a cool accent. It is the neutrals that set the
 * temperature of the whole interface.
 */
const NEUTRALS = /^--(paper|edge|ink|bg)/;
const css = readFileSync('src/ui/style.css', 'utf8');
const tokenBlock = css.slice(css.indexOf(':root {'), css.indexOf('/* accessibility modes'));
const cold = [];
let checked = 0;
for (const m of tokenBlock.matchAll(/(--[a-z0-9-]+):\s*#([0-9a-fA-F]{6})/g)) {
  const [, name, hex] = m;
  if (!NEUTRALS.test(name)) continue;
  checked++;
  const r = parseInt(hex.slice(0, 2), 16), b = parseInt(hex.slice(4, 6), 16);
  if (r <= b) cold.push(`${name} #${hex}`);
}
rec('Every neutral in the palette is warm', cold.length === 0 && checked >= 8,
  cold.join(', ') || `${checked} neutrals, all warm`);

console.log(`\n${pass}/${pass + fail} checks passed`);
if (fail) process.exit(1);
