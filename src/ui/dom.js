/** Small DOM helpers. No framework — the whole UI is a few thousand lines. */

export function el(tag, attrs = {}, ...kids) {
  const parts = tag.split(/([.#])/);
  const node = document.createElement(parts[0] || 'div');
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i] === '.') node.classList.add(parts[i + 1]);
    else node.id = parts[i + 1];
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className += (node.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(4)) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

/** A tap that doesn't fire on scroll and gives haptic feedback. */
export function tap(node, fn, opts = {}) {
  let sx = 0, sy = 0, moved = false;
  node.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; moved = false; }, { passive: true });
  node.addEventListener('pointermove', (e) => {
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > 12) moved = true;
  }, { passive: true });
  node.addEventListener('click', (e) => {
    if (moved && !opts.allowMoved) return;
    haptic(opts.haptic ?? 'light');
    fn(e);
  });
  return node;
}

let hapticsOn = true;
export function setHaptics(v) { hapticsOn = v; }
export function haptic(kind = 'light') {
  if (!hapticsOn || !navigator.vibrate) return;
  const ms = kind === 'heavy' ? 22 : kind === 'medium' ? 14 : kind === 'error' ? [16, 40, 16] : 8;
  try { navigator.vibrate(ms); } catch { /* not supported */ }
}

export function fmtCredits(n) {
  const v = Math.round(n);
  return v.toLocaleString('en-CA');
}

export function fmtRelative(t) {
  const d = Date.now() - t;
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

export function fmtWhen(t) {
  const d = new Date(t);
  return d.toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** A switch control that also carries a label, so state is never colour-only. */
export function toggle(labelText, value, onChange, hint) {
  const sw = el('button.switch', { role: 'switch', 'aria-checked': String(!!value), 'aria-label': labelText });
  if (value) sw.classList.add('on');
  const state = el('span.tiny.dim', { text: value ? 'On' : 'Off' });
  tap(sw, () => {
    const next = !sw.classList.contains('on');
    sw.classList.toggle('on', next);
    sw.setAttribute('aria-checked', String(next));
    state.textContent = next ? 'On' : 'Off';
    onChange(next);
  });
  return el('div.setting', {},
    el('div.lbl', {}, labelText, hint ? el('div.tiny.dim', { text: hint }) : null),
    state, sw);
}

export function slider(labelText, value, min, max, step, onChange, format) {
  const out = el('span.tiny.dim', { text: format ? format(value) : String(value) });
  const input = el('input', {
    type: 'range', min, max, step, value,
    'aria-label': labelText,
    oninput: (e) => {
      const v = parseFloat(e.target.value);
      out.textContent = format ? format(v) : String(v);
      onChange(v);
    },
  });
  return el('div', {},
    el('div.row', {}, el('div.lbl.small', { text: labelText }), el('span.spacer'), out),
    input);
}

export function selectRow(labelText, value, options, onChange) {
  const sel = el('select.sel', {
    'aria-label': labelText,
    onchange: (e) => onChange(e.target.value),
  }, ...options.map(([v, l]) => el('option', { value: v, selected: v === value }, l)));
  return el('div.setting', {}, el('div.lbl', { text: labelText }), sel);
}

/** Confirm step for anything destructive. */
export function confirmDialog(title, body, confirmLabel = 'Confirm') {
  return new Promise((resolve) => {
    const scrim = el('div.scrim.open', { style: { zIndex: 60 } });
    const card = el('div.sheet.open', {
      style: { zIndex: 61, maxHeight: '70%' },
    },
      el('div.sheet-grab', {}, el('i')),
      el('div.sheet-head', {}, el('h2', { text: title })),
      el('div.sheet-body', {}, el('p.muted.small', { style: { lineHeight: '1.5', margin: '0' }, text: body })),
      el('div.sheet-foot', {},
        tap(el('button.btn.ghost', { text: 'Cancel' }), () => close(false)),
        tap(el('button.btn.danger', { text: confirmLabel }), () => close(true), { haptic: 'heavy' })));
    document.getElementById('hud').append(scrim, card);
    tap(scrim, () => close(false));
    function close(v) {
      scrim.remove(); card.remove();
      resolve(v);
    }
  });
}

export function promptDialog(title, placeholder, initial = '') {
  return new Promise((resolve) => {
    const input = el('input.search', { value: initial, placeholder, maxlength: 42 });
    const scrim = el('div.scrim.open', { style: { zIndex: 60 } });
    const card = el('div.sheet.open', { style: { zIndex: 61, maxHeight: '70%' } },
      el('div.sheet-grab', {}, el('i')),
      el('div.sheet-head', {}, el('h2', { text: title })),
      el('div.sheet-body', {}, input),
      el('div.sheet-foot', {},
        tap(el('button.btn.ghost', { text: 'Cancel' }), () => close(null)),
        tap(el('button.btn.primary', { text: 'Save' }), () => close(input.value.trim() || null))));
    document.getElementById('hud').append(scrim, card);
    setTimeout(() => input.focus(), 60);
    tap(scrim, () => close(null));
    function close(v) { scrim.remove(); card.remove(); resolve(v); }
  });
}

// ---------------------------------------------------------------------------
let toastHost = null;
export function toast(message, kind = '') {
  if (!toastHost) {
    toastHost = el('div#toasts');
    document.getElementById('hud').append(toastHost);
  }
  const node = el(`div.toast${kind ? '.' + kind : ''}`, { text: message });
  toastHost.append(node);
  if (kind === 'bad') haptic('error');
  setTimeout(() => {
    node.style.transition = 'opacity 260ms, transform 260ms';
    node.style.opacity = '0';
    node.style.transform = 'translateY(-6px)';
    setTimeout(() => node.remove(), 280);
  }, kind === 'bad' ? 2600 : 1900);
  // keep at most four on screen
  while (toastHost.children.length > 4) toastHost.firstChild.remove();
}
