/**
 * The icon set.
 *
 * Every one of these was drawn for this game. Nothing here is an emoji.
 *
 * Emoji were what the interface used before, and they are the single biggest
 * reason it looked unfinished: they arrive in someone else's art style, they
 * render differently on every phone, half of them are full-colour pictures
 * sitting next to line art, and none of them can take the colour of the button
 * they are on. A set drawn on one grid, with one stroke weight, in the page's
 * own colour, is most of the difference between "a prototype" and "a product".
 *
 * The rules, applied to all of them:
 *
 *   - 24x24 grid, everything inside a 20x20 optical area
 *   - one stroke weight (1.8), round caps and joins, no hairlines
 *   - `currentColor` throughout, so an icon on a dark button and the same icon
 *     on a cream one are the same icon
 *   - a filled accent shape only where it earns its keep — a coin's face, a
 *     roof's slope — never as decoration
 *   - drawn for 22-26px on a phone: no detail that dies at that size
 */

const NS = 'http://www.w3.org/2000/svg';

/*
 * Paths are stored as compact descriptors rather than markup so the whole set
 * costs a few kilobytes rather than a few tens of them.
 *
 *   s: stroked path data
 *   f: filled path data (drawn under the stroke)
 *   c: circles, [cx, cy, r, filled]
 */
export const ICONS = {
  // --- building tools ------------------------------------------------------
  place: { s: 'M12 5v14M5 12h14' },
  paint: {
    s: 'M6.5 16.5c-1.2 1.2-1.2 3 .3 3.9 1.3.8 3-.1 3.2-1.6.1-1-.4-1.6-.4-2.3M9.6 16.4 18.9 7a2 2 0 0 0 0-2.8l-.6-.6a2 2 0 0 0-2.8 0L6.2 13',
    f: 'M6.2 13l3.4 3.4-2.6 1.1-1.9-1.9z',
  },
  erase: {
    s: 'M8.5 19H19M4.6 15.2l5.2 5.2 8.4-8.4a2 2 0 0 0 0-2.8l-2.4-2.4a2 2 0 0 0-2.8 0l-8.4 8.4a2 2 0 0 0 0 2z',
    f: 'M4.6 15.2l5.2 5.2 2.9-2.9-5.2-5.2z',
  },
  move: { s: 'M12 3.5 9.6 6M12 3.5 14.4 6M12 3.5v17M12 20.5 9.6 18M12 20.5 14.4 18M3.5 12 6 9.6M3.5 12 6 14.4M3.5 12h17M20.5 12 18 9.6M20.5 12 18 14.4' },
  rotate: { s: 'M20 12a8 8 0 1 1-2.6-5.9M20 4.5V10h-5.4' },
  duplicate: { s: 'M9 9.5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2z', f: 'M3.5 5.5a2 2 0 0 1 2-2H13a2 2 0 0 1 2 2v.8h-4a3.2 3.2 0 0 0-3.2 3.2v6.3h-2.3a2 2 0 0 1-2-2z' },
  eyedrop: { s: 'M4.2 19.8 3.6 17l8.2-8.2M11.8 8.8l3.4 3.4M14 6.6l3.4 3.4M15.6 5l1.4-1.4a2.3 2.3 0 0 1 3.4 3.4L19 8.4M4.2 19.8 7 20.4l8.2-8.2', f: 'M4.2 19.8 3.6 17l1.6-1.6 2.2 2.2L5.8 19z' },
  select: { s: 'M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5M10.5 4h3M10.5 20h3M4 10.5v3M20 10.5v3' },

  // --- history and view ----------------------------------------------------
  undo: { s: 'M4 9h10.5a5.5 5.5 0 0 1 0 11H8M4 9l4-4M4 9l4 4' },
  redo: { s: 'M20 9H9.5a5.5 5.5 0 0 0 0 11H16M20 9l-4-4M20 9l-4 4' },
  grid: { s: 'M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16' },
  lockOpen: { s: 'M7 11V8a5 5 0 0 1 9.3-2.5M5.8 11h12.4a1.6 1.6 0 0 1 1.6 1.6v6a1.6 1.6 0 0 1-1.6 1.6H5.8a1.6 1.6 0 0 1-1.6-1.6v-6A1.6 1.6 0 0 1 5.8 11z', c: [[12, 15.6, 1.5, 1]] },
  lockClosed: { s: 'M7.6 11V8a4.4 4.4 0 0 1 8.8 0v3M5.8 11h12.4a1.6 1.6 0 0 1 1.6 1.6v6a1.6 1.6 0 0 1-1.6 1.6H5.8a1.6 1.6 0 0 1-1.6-1.6v-6A1.6 1.6 0 0 1 5.8 11z', c: [[12, 15.6, 1.5, 1]] },
  trash: { s: 'M4.8 6.6h14.4M9.4 6.6V4.9a1.4 1.4 0 0 1 1.4-1.4h2.4a1.4 1.4 0 0 1 1.4 1.4v1.7M6.6 6.6l.8 12a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.8-12M10.4 10.4v6M13.6 10.4v6' },
  save: { s: 'M5.6 4h9.6L20 8.8v9.6a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 18.4V5.6A1.6 1.6 0 0 1 5.6 4z M8 4v5h6.5V4.4M8 19.9v-5.2h8v5.2' },
  fit: { s: 'M4 9V5.6A1.6 1.6 0 0 1 5.6 4H9M15 4h3.4A1.6 1.6 0 0 1 20 5.6V9M20 15v3.4a1.6 1.6 0 0 1-1.6 1.6H15M9 20H5.6A1.6 1.6 0 0 1 4 18.4V15M8.4 8.4l2.2 2.2M15.6 8.4l-2.2 2.2M15.6 15.6l-2.2-2.2M8.4 15.6l2.2-2.2' },
  resize: { s: 'M3.4 12h4M3.4 12l2.2-2.2M3.4 12l2.2 2.2M20.6 12h-4M20.6 12l-2.2-2.2M20.6 12l2.2 2.2M12 4.5v15', c: [] },

  // --- the top bar ---------------------------------------------------------
  menu: { s: 'M4.6 7.2h14.8M4.6 12h14.8M4.6 16.8h14.8' },
  /*
   * The credit is a maple leaf struck on a coin. A currency squiggle inside a
   * ring turns to mush at the 19px it is actually drawn at, and this is a game
   * about Toronto — the leaf reads instantly and belongs here.
   */
  coin: {
    c: [[12, 12, 8.4, 0]],
    f: 'M12 5.6l1.15 2.5 1.9-.7-.6 2.1 2.35-.4-.85 1.75 1.65.55-2.4 1.85.5 1.15-2.9-.35.25 2.9h-1.9l.25-2.9-2.9.35.5-1.15L6.6 11.4l1.65-.55-.85-1.75 2.35.4-.6-2.1 1.9.7z',
  },
  layers: { s: 'M12 3.4 3.6 7.6 12 11.8l8.4-4.2zM3.6 12.4 12 16.6l8.4-4.2M3.6 16.6 12 20.8l8.4-4.2' },
  person: { c: [[12, 8, 3.6, 0]], s: 'M4.8 20.2a7.4 7.4 0 0 1 14.4 0' },
  /* A compass rose: the north half solid so the needle reads at 22px. The old
     one was a thin wedge in a circle and looked like a rendering artefact. */
  compass: {
    // Just the needle. The button it lives in is already a circle, so the ring
    // was a second circle inside the first, and at 24px the two together read
    // as a smudge. North is solid, south hollow — the classic rose.
    f: 'M12 3.6l3.2 8.4H8.8z',
    s: 'M12 20.4l-3.2-8.4h6.4z',
  },
  /*
   * Build is a trowel over a course of bricks. It was a house, which put three
   * near-identical little houses next to each other — Build, My lots and the
   * go-home button — and made the top of the screen unreadable at a glance.
   * Icons in the same view have to be distinguishable in silhouette.
   */
  build: {
    s: 'M4.2 20.4h15.6M4.2 16.8h15.6M4.2 13.2h15.6M8 16.8v3.6M12.6 16.8v3.6M17.2 16.8v3.6M6.4 13.2v3.6M11 13.2v3.6M15.6 13.2v3.6',
    f: 'M14.6 3.1a1.6 1.6 0 0 1 2.3 0l3.4 3.4a1.6 1.6 0 0 1 0 2.3l-2.6 2.6-5.7-5.7z',
  },
  sun: { c: [[12, 12, 4.2, 0]], s: 'M12 3.2v2.3M12 18.5v2.3M20.8 12h-2.3M5.5 12H3.2M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6M18.2 18.2l-1.6-1.6M7.4 7.4 5.8 5.8' },
  moon: { f: 'M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6z' },
  dusk: { s: 'M3.4 18.6h17.2M6.4 15.2a5.6 5.6 0 0 1 11.2 0M12 4.2v2.2M19.2 7.4l-1.5 1.5M6.3 8.9 4.8 7.4' },
  home: { s: 'M4.4 11.2 12 4.4l7.6 6.8M6.6 10v9.2a1 1 0 0 0 1 1h8.8a1 1 0 0 0 1-1V10M10 20.2v-5.1h4v5.1' },
  zoomIn: { c: [[10.8, 10.8, 6.6, 0]], s: 'M15.6 15.6 20.4 20.4M10.8 8.2v5.2M8.2 10.8h5.2' },
  zoomOut: { c: [[10.8, 10.8, 6.6, 0]], s: 'M15.6 15.6 20.4 20.4M8.2 10.8h5.2' },

  // --- screens and menu entries -------------------------------------------
  wallet: { s: 'M4 8.4a2 2 0 0 1 2-2h11.4a1.6 1.6 0 0 1 1.6 1.6v1.4M4 8.4v9.2a2 2 0 0 0 2 2h12.4a1.6 1.6 0 0 0 1.6-1.6v-7.2H15a2.4 2.4 0 0 0 0 4.8h5', c: [[15.4, 14.4, 0.9, 1]] },
  lots: { s: 'M3.6 20.4h16.8M5.6 20.4V9.2l4.4-3.1 4.4 3.1v11.2M14.4 20.4V12h4v8.4M7.8 12h1.6M7.8 15.2h1.6M11 12h1.6M11 15.2h1.6' },
  discover: { c: [[12, 12, 8.4, 0]], s: 'M3.8 12h16.4M12 3.6c2.2 2.4 3.3 5.3 3.3 8.4s-1.1 6-3.3 8.4c-2.2-2.4-3.3-5.3-3.3-8.4s1.1-6 3.3-8.4z' },
  friends: { c: [[9, 8.6, 3.2, 0]], s: 'M3.4 19.8a5.8 5.8 0 0 1 11.2 0M15.4 6.2a3.2 3.2 0 0 1 0 6.1M16.8 14.6a5.8 5.8 0 0 1 3.8 5.2' },
  message: { s: 'M4 7.2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.6a2 2 0 0 1-2 2h-6.6L7.4 20.4v-3.6H6a2 2 0 0 1-2-2z', c: [[9, 11, 1, 1], [12, 11, 1, 1], [15, 11, 1, 1]] },
  /* The catalogue is a tray of parts. The shop is a bag. They are not the same
     thing and they were the same icon. */
  catalogue: {
    s: 'M3.6 8.4a1.6 1.6 0 0 1 1.6-1.6h13.6a1.6 1.6 0 0 1 1.6 1.6v10.4a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6zM3.6 13.4h16.8M11.8 6.8v13.6M8 3.6h8',
    f: 'M5.2 6.8h13.6a1.6 1.6 0 0 1 1.6 1.6v1.4H3.6V8.4a1.6 1.6 0 0 1 1.6-1.6z',
  },
  shop: { s: 'M4.6 9.4h14.8l-1 9.4a1.6 1.6 0 0 1-1.6 1.4H7.2a1.6 1.6 0 0 1-1.6-1.4zM8.6 9.4V7.6a3.4 3.4 0 0 1 6.8 0v1.8M4.6 9.4 6.2 5.8a1.4 1.4 0 0 1 1.3-.8h9a1.4 1.4 0 0 1 1.3.8l1.6 3.6' },
  civic: { s: 'M3.6 20.4h16.8M4.8 20.4V10.2M19.2 20.4V10.2M4 10.2h16L12 4.2 4 10.2zM8.4 20.4v-6.6M12 20.4v-6.6M15.6 20.4v-6.6' },
  places: { s: 'M4 6.6 9.4 4.4v13L4 19.6zM9.4 4.4l5.2 2.2v13L9.4 17.4M14.6 6.6 20 4.4v13l-5.4 2.2' },
  settings: { c: [[12, 12, 2.8, 0]], s: 'M12 3.4l1.3 2.2 2.5-.5.6 2.5 2.3 1.1-1.2 2.2 1.2 2.2-2.3 1.1-.6 2.5-2.5-.5L12 20.6l-1.3-2.4-2.5.5-.6-2.5-2.3-1.1L6.5 13 5.3 10.8l2.3-1.1.6-2.5 2.5.5z' },
  milestone: { c: [[12, 9.4, 5.4, 0]], s: 'M8.6 13.8 7.2 20.6l4.8-2.6 4.8 2.6-1.4-6.8', f: 'M12 6.2l1.15 2.35 2.6.38-1.88 1.83.44 2.58L12 12.1l-2.31 1.24.44-2.58-1.88-1.83 2.6-.38z' },
  help: { c: [[12, 12, 8.4, 0], [12, 16.6, 1, 1]], s: 'M9.4 9.4a2.7 2.7 0 0 1 5.3.7c0 1.8-2.7 2.2-2.7 4' },
  about: { c: [[12, 12, 8.4, 0], [12, 7.8, 1, 1]], s: 'M12 11v5.6' },
  /*
   * Avatar wears a hat, and the hat is drawn in the same stroke weight as
   * everything else rather than as a faint fill — at 23px a 24%-opacity shape
   * simply is not there, which left this identical to Profile in the menu.
   */
  avatar: {
    c: [[12, 12.4, 3.1, 0]],
    s: 'M5.9 20.6a6.1 6.1 0 0 1 12.2 0M4.6 8.4h14.8M8.6 8.4V5.6a1.4 1.4 0 0 1 1.4-1.4h4a1.4 1.4 0 0 1 1.4 1.4v2.8',
    f: 'M8.6 5.1a1.4 1.4 0 0 1 1.4-.9h4a1.4 1.4 0 0 1 1.4.9v3.3H8.6z',
  },
  search: { c: [[10.6, 10.6, 6.4, 0]], s: 'M15.2 15.2 20.4 20.4' },
  pin: { s: 'M12 21c4-4.8 6-8.2 6-10.6A6 6 0 0 0 6 10.4C6 12.8 8 16.2 12 21z', c: [[12, 10.4, 2.3, 0]] },
  road: { s: 'M8.6 3.6 6.2 20.4M15.4 3.6l2.4 16.8M12 4.6v2.8M12 10.6v2.8M12 16.6v2.8' },
  skyline: { s: 'M3.4 20.4h17.2M5.4 20.4V11h4.4v9.4M14.2 20.4V6.6h4.4v13.8M9.8 20.4V14h4.4v6.4M7 13.8h1.2M7 16.6h1.2M15.8 9.4H17M15.8 12.2H17M15.8 15H17' },
  ledger: { s: 'M6 3.8h9.4L19 7.4v12.8H6zM8.8 9.6h7.4M8.8 13h7.4M8.8 16.4h4.4' },

  // --- small controls ------------------------------------------------------
  close: { s: 'M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4' },
  check: { s: 'M5 12.6 9.8 17.4 19 7.2' },
  chevronDown: { s: 'M6.6 9.6 12 15l5.4-5.4' },
  chevronRight: { s: 'M9.6 6.6 15 12l-5.4 5.4' },
  chevronLeft: { s: 'M14.4 6.6 9 12l5.4 5.4' },
  plus: { s: 'M12 5.6v12.8M5.6 12h12.8' },
  minus: { s: 'M5.6 12h12.8' },
  play: { f: 'M8 5.2 18.4 12 8 18.8z' },
  star: { f: 'M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.9l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85z' },
  starOutline: { s: 'M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.9l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85z' },
  heart: { f: 'M12 20.4c-5.6-3.7-8-6.6-8-9.7A4.6 4.6 0 0 1 12 7.6a4.6 4.6 0 0 1 8 3.1c0 3.1-2.4 6-8 9.7z' },
  up: { s: 'M12 19V5.4M12 5.4 6.6 10.8M12 5.4l5.4 5.4' },
  down: { s: 'M12 5v13.6M12 18.6 6.6 13.2M12 18.6l5.4-5.4' },
  send: { s: 'M20.4 3.6 3.6 10.4l7 2.9 2.9 7z', f: 'M10.6 13.3 20.4 3.6l-6.9 16.7-2.9-7z' },
  sparkle: { f: 'M12 3.4l1.5 4.6 4.6 1.5-4.6 1.5L12 15.6l-1.5-4.6L5.9 9.5l4.6-1.5z', s: 'M18.4 15.4l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z' },
};

/** Aliases, so call sites can use the word that reads best where they are. */
const ALIAS = {
  colour: 'paint', color: 'paint', delete: 'trash', clear: 'trash',
  parts: 'catalogue', drawer: 'catalogue',
  back: 'chevronLeft', forward: 'chevronRight', more: 'chevronDown',
  ok: 'check', good: 'check', profile: 'person', wallet2: 'coin',
  time: 'sun', night: 'moon', day: 'sun',
};

/**
 * One icon, as an <svg> element.
 *
 * @param name   key in ICONS (or ALIAS)
 * @param size   px; 22 suits a toolbar, 26 a primary action
 * @param opt.filled  draw the accent shape solid rather than outlined
 */
export function icon(name, size = 22, opt = {}) {
  const key = ICONS[name] ? name : (ALIAS[name] || 'help');
  const d = ICONS[key];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('ic');

  if (d.f) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d.f);
    p.setAttribute('fill', 'currentColor');
    p.setAttribute('opacity', opt.filled ? '1' : '0.24');
    svg.append(p);
  }
  for (const [cx, cy, r, filled] of d.c || []) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
    if (filled) c.setAttribute('fill', 'currentColor');
    else {
      c.setAttribute('stroke', 'currentColor');
      c.setAttribute('stroke-width', '1.8');
      c.setAttribute('fill', 'none');
    }
    svg.append(c);
  }
  if (d.s) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d.s);
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.8');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

/** The same icon as a markup string, for the few places that build HTML. */
export function iconHTML(name, size = 22) {
  const svg = icon(name, size);
  return svg.outerHTML;
}

/** Every name the set answers to — used by the test that proves none are missing. */
export function iconNames() {
  return [...Object.keys(ICONS), ...Object.keys(ALIAS)];
}
