/**
 * Bottom-sheet manager.
 *
 * Every panel in the game is one of these: dismissible by swipe *and* by an
 * explicit close button, safe-area aware, and never able to trap the player —
 * the scrim, the grab handle, the close button and the hardware back gesture
 * all get you out.
 */

import { icon } from './icons.js';
import { el, clear, tap, haptic } from './dom.js';

export class SheetHost {
  constructor(root) {
    this.root = root;
    this.scrim = el('div.scrim');
    tap(this.scrim, () => this.close());
    root.append(this.scrim);
    this.stack = [];
    this.sheets = new Map();

    // Browser/system back closes the top sheet rather than leaving the game.
    window.addEventListener('popstate', () => {
      if (this.stack.length) { this.close(); history.pushState({ sheet: true }, ''); }
    });
    history.replaceState({ sheet: true }, '');
  }

  /**
   * @param id     stable id, so re-opening the same screen reuses its node
   * @param render (body, api) => void — fills the sheet
   */
  open(id, { title, sub, full = false, render, footer, onClose } = {}) {
    if (this.stack.includes(id)) { this.refresh(id); return this.sheets.get(id); }

    let rec = this.sheets.get(id);
    if (!rec) {
      const body = el('div.sheet-body');
      const head = el('div.sheet-head');
      const foot = el('div.sheet-foot');
      const node = el(`div.sheet${full ? '.full' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || id },
        el('div.sheet-grab', {}, el('i')), head, body, foot);
      rec = { id, node, head, body, foot };
      this.sheets.set(id, rec);
      this.root.append(node);
      this._bindSwipe(rec);
    }
    rec.node.classList.toggle('full', !!full);
    rec.render = render;
    rec.onClose = onClose;
    rec.title = title;

    clear(rec.head);
    rec.head.append(
      el('div', { style: { flex: '1 1 auto', minWidth: 0 } },
        el('h2', { text: title || '' }),
        sub ? el('div.sub', { text: sub }) : null),
      tap(el('button.icon-btn', { 'aria-label': 'Close' }, icon('close', 20)), () => this.close(id)));

    clear(rec.foot);
    if (footer) { rec.foot.style.display = ''; footer(rec.foot, this); }
    else rec.foot.style.display = 'none';

    clear(rec.body);
    render?.(rec.body, this);

    this.stack.push(id);
    this.scrim.classList.add('open');
    rec.node.style.zIndex = String(30 + this.stack.length);
    // Force a style flush so the closed transform is committed, then open in
    // the same task. Deferring to requestAnimationFrame reads better but ties
    // the panel to the render loop — under load the sheet can sit invisible
    // for several frames after the tap.
    rec.node.style.transform = '';
    void rec.node.offsetHeight;
    rec.node.classList.add('open');
    haptic('light');
    this.root.dispatchEvent(new CustomEvent('sheetopen', { detail: { id } }));
    return rec;
  }

  /** Re-run the render function of an open sheet in place. */
  refresh(id) {
    const rec = this.sheets.get(id);
    if (!rec || !this.stack.includes(id)) return;
    const scroll = rec.body.scrollTop;
    clear(rec.body);
    rec.render?.(rec.body, this);
    rec.body.scrollTop = scroll;
  }

  refreshAll() { for (const id of this.stack) this.refresh(id); }

  close(id) {
    const target = id || this.stack[this.stack.length - 1];
    const idx = this.stack.indexOf(target);
    if (idx < 0) return;
    this.stack.splice(idx, 1);
    const rec = this.sheets.get(target);
    if (rec) {
      rec.node.classList.remove('open');
      rec.onClose?.();
    }
    if (!this.stack.length) this.scrim.classList.remove('open');
    this.root.dispatchEvent(new CustomEvent('sheetclose', { detail: { id: target } }));
  }

  closeAll() { while (this.stack.length) this.close(); }

  isOpen(id) { return this.stack.includes(id); }
  get top() { return this.stack[this.stack.length - 1] || null; }
  get anyOpen() { return this.stack.length > 0; }

  /** Drag the grab handle (or the head) down to dismiss. */
  _bindSwipe(rec) {
    const grab = rec.node.querySelector('.sheet-grab');
    let startY = 0, dragging = false, height = 0;
    const areas = [grab, rec.head];
    for (const area of areas) {
      area.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.icon-btn')) return;
        dragging = true; startY = e.clientY;
        height = rec.node.getBoundingClientRect().height;
        rec.node.style.transition = 'none';
        area.setPointerCapture?.(e.pointerId);
      });
      area.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dy = Math.max(0, e.clientY - startY);
        rec.node.style.transform = `translateY(${dy}px)`;
      });
      const end = (e) => {
        if (!dragging) return;
        dragging = false;
        rec.node.style.transition = '';
        rec.node.style.transform = '';
        const dy = Math.max(0, (e.clientY || 0) - startY);
        if (dy > Math.min(140, height * 0.28)) this.close(rec.id);
      };
      area.addEventListener('pointerup', end);
      area.addEventListener('pointercancel', end);
    }

    // Swiping down from the very top of a scrolled-to-top body also dismisses.
    let bodyStart = null;
    rec.body.addEventListener('pointerdown', (e) => {
      bodyStart = rec.body.scrollTop <= 0 ? e.clientY : null;
    }, { passive: true });
    rec.body.addEventListener('pointerup', (e) => {
      if (bodyStart != null && e.clientY - bodyStart > 110 && rec.body.scrollTop <= 0) this.close(rec.id);
      bodyStart = null;
    }, { passive: true });
  }
}
