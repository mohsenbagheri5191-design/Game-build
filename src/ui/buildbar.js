/**
 * The modular build bar.
 *
 * Lives inside its own panel pinned to the bottom, never floating loose over
 * the world, and never covered by a sheet — opening any sheet closes it.
 * Every tool is one tap away.
 */

import { el, clear, tap, toast, haptic, fmtCredits, confirmDialog, promptDialog } from './dom.js';
import { thumbImg } from './thumbs.js';
import { icon } from './icons.js';
import { getPart } from '../kit/parts.js';
import { SWATCHES } from '../kit/colors.js';
import { CONFIG } from '../core/config.js';
import { openBuildDrawer } from './screens.js';
import { spanStyles, spanStyleNames } from '../kit/spans.js';

/*
 * Place, Paint and Erase are what you use minute to minute; the rest are
 * occasional. Giving all eight the same weight in one row is what made the
 * bar unreadable, so the three live in `PRIMARY` and get the big buttons.
 */
export const TOOLS = [
  { id: 'place', ico: 'place', label: 'Place' },
  { id: 'paint', ico: 'paint', label: 'Paint' },
  { id: 'erase', ico: 'erase', label: 'Erase' },
  { id: 'move', ico: 'move', label: 'Move' },
  { id: 'rotate', ico: 'rotate', label: 'Rotate' },
  { id: 'duplicate', ico: 'duplicate', label: 'Copy' },
  { id: 'eyedrop', ico: 'eyedrop', label: 'Pick' },
  { id: 'select', ico: 'select', label: 'Select' },
];
const PRIMARY = new Set(['place', 'paint', 'erase']);

export class BuildBar {
  constructor(app, root) {
    this.app = app;
    this.node = el('div#buildbar');
    root.append(this.node);
    this.tool = 'place';
    this.zone = 0;
    this.colors = ['#cfc9be', '#a89e8f', '#8f8779'];
    this.open = false;
    this.render();
  }

  show(v) {
    this.open = v;
    this.node.classList.toggle('open', v);
    if (v) this.render();
  }

  setTool(id) {
    this.tool = id;
    this.app.onToolChange?.(id);
    this.render();
    haptic('light');
  }

  render() {
    const app = this.app;
    clear(this.node);
    const part = app.ui.heldPart ? getPart(app.ui.heldPart) : null;

    // --- held part + running total -------------------------------------
    const held = el('div.held');
    const thumb = el('div.thumb');
    if (part) thumb.append(thumbImg(part.id, part.name));
    held.append(thumb,
      el('div', { style: { minWidth: 0, flex: '1 1 auto' } },
        el('div.nm', { text: part ? part.name : 'Nothing held yet' }),
        el(`div.pr${part && !part.cost ? '.free' : ''}`, {
          text: part ? (part.cost ? `${part.cost} cr each` : 'Free') : 'Tap Catalogue to choose one' })),
      this.runTotal = el('div.tiny.dim', { style: { textAlign: 'right' }, text: '' }),
      tap(el(`button.btn.sm${part ? '' : '.primary'}`, {}, icon('catalogue', 17), el('span', { text: 'Catalogue' })),
        () => openBuildDrawer(app)));
    this.node.append(held);

    // --- the three you actually use ------------------------------------
    const primary = el('div.tool-primary');
    for (const t of TOOLS.filter((x) => PRIMARY.has(x.id))) {
      const b = el(`button.tool${this.tool === t.id ? '.on' : ''}`, { 'aria-label': t.label },
        el('span.ico', {}, icon(t.ico, 24)), el('span.lbl', { text: t.label }));
      tap(b, () => this.setTool(t.id));
      primary.append(b);
    }
    this.node.append(primary);

    // --- everything else ------------------------------------------------
    const row = el('div.tool-row');
    for (const t of TOOLS.filter((x) => !PRIMARY.has(x.id))) {
      const b = el(`button.tool${this.tool === t.id ? '.on' : ''}`, { 'aria-label': t.label },
        el('span.ico', {}, icon(t.ico, 20)), el('span.lbl', { text: t.label }));
      tap(b, () => this.setTool(t.id));
      row.append(b);
    }
    // undo / redo / clear
    const undoBtn = el('button.tool', { 'aria-label': 'Undo', disabled: !app.world.canUndo },
      el('span.ico', {}, icon('undo', 20)), el('span.lbl', { text: 'Undo' }));
    tap(undoBtn, () => {
      const r = app.world.undo();
      if (!r.ok) { toast(r.reason, 'bad'); return; }
      app.audio.undo(); toast(`Undid ${r.label}`); app.refreshLots(); this.render();
    });
    const redoBtn = el('button.tool', { 'aria-label': 'Redo', disabled: !app.world.canRedo },
      el('span.ico', {}, icon('redo', 20)), el('span.lbl', { text: 'Redo' }));
    tap(redoBtn, () => {
      const r = app.world.redo();
      if (!r.ok) { toast(r.reason, 'bad'); return; }
      app.audio.undo(); toast(`Redid ${r.label}`); app.refreshLots(); this.render();
    });
    row.append(undoBtn, redoBtn);

    const gridBtn = el(`button.tool${app.ui.showGrid ? '.on' : ''}`, { 'aria-label': 'Grid' },
      el('span.ico', {}, icon('grid', 20)), el('span.lbl', { text: 'Grid' }));
    tap(gridBtn, () => { app.ui.showGrid = !app.ui.showGrid; app.refreshOverlay(); this.render(); });

    const lockBtn = el(`button.tool${app.ui.cameraLock ? '.on' : ''}`, { 'aria-label': 'Camera lock' },
      el('span.ico', {}, icon(app.ui.cameraLock ? 'lockClosed' : 'lockOpen', 20)),
      el('span.lbl', { text: 'Camera' }));
    tap(lockBtn, () => {
      app.ui.cameraLock = !app.ui.cameraLock;
      app.cam.locked = app.ui.cameraLock;
      toast(app.ui.cameraLock ? 'Camera locked — drags only build' : 'Camera unlocked');
      this.render();
    });

    const clearBtn = el('button.tool', { 'aria-label': 'Clear lot' },
      el('span.ico', {}, icon('trash', 20)), el('span.lbl', { text: 'Clear' }));
    tap(clearBtn, async () => {
      if (!app.activeLot) return;
      const n = Object.keys(app.activeLot.parts).length;
      if (!n) { toast('Already empty.'); return; }
      const ok = await confirmDialog('Clear this lot?', `All ${n} parts are removed. You can undo it afterwards.`, 'Clear it');
      if (!ok) return;
      const r = app.world.clearLot(app.activeLot);
      if (r.ok) { app.audio.erase(); toast(`Cleared ${r.count} parts`); app.refreshLots(); this.render(); }
    });

    const saveBtn = el('button.tool', { 'aria-label': 'Save design' },
      el('span.ico', {}, icon('save', 20)), el('span.lbl', { text: 'Save' }));
    tap(saveBtn, async () => {
      if (!app.activeLot) return;
      const name = await promptDialog('Name this design', 'e.g. Corner cottage');
      if (!name) return;
      const r = app.world.saveDesign(app.activeLot, name);
      if (!r.ok) toast(r.reason, 'bad'); else toast(`Saved "${name}"`, 'good');
    });

    row.append(gridBtn, lockBtn, clearBtn, saveBtn);
    this.node.append(row);

    // --- storey selector -----------------------------------------------
    const storeys = el('div.storey-row');
    // An icon, not the word "STOREY" — at 390px the word was truncated to
    // "STO…", which looks like a layout that gave up.
    storeys.append(el('span.storey-ico', { 'aria-label': 'Storey', title: 'Storey' },
      icon('layers', 19)));
    // The pills scroll in their own lane, so adding storeys can never push the
    // Colours button off the edge of the screen.
    const storeyScroll = el('div.storey-scroll');
    const maxS = Math.min(CONFIG.grid.maxStoreys, (app.activeLot?.storeys || 1) + 1);
    for (let s = CONFIG.grid.minStorey; s < maxS; s++) {
      const b = el(`div.storey-pill${app.ui.storey === s ? '.on' : ''}`, { text: s < 0 ? 'B' : String(s + 1) });
      tap(b, () => { app.ui.storey = s; app.refreshOverlay(); this.render(); });
      storeyScroll.append(b);
    }
    if (maxS < CONFIG.grid.maxStoreys) {
      const add = el('div.storey-pill', { text: '+' });
      tap(add, () => {
        if (!app.activeLot) return;
        app.activeLot.storeys = Math.min(CONFIG.grid.maxStoreys, (app.activeLot.storeys || 1) + 1);
        app.ui.storey = app.activeLot.storeys - 1;
        app.state.touch(); app.refreshOverlay(); this.render();
        toast(`Storey ${app.ui.storey + 1}`);
      });
      storeyScroll.append(add);
    }
    storeys.append(storeyScroll);
    storeys.append(tap(el('button.btn.sm', {}, icon('paint', 17), el('span', { text: 'Colours' })),
      () => this.toggleColours()));
    this.node.append(storeys);

    // --- span controls, shown only while a span part is selected ---
    const sel = app.ui.selectedSlot && app.activeLot ? app.activeLot.parts[app.ui.selectedSlot] : null;
    if (sel && sel.w) {
      const selPart = getPart(sel.part);
      const styles = spanStyles(sel.part);
      const names = spanStyleNames(sel.part);
      const spanRow = el('div.storey-row');
      spanRow.append(el('span.tiny.dim', {
        text: `${(selPart?.name || 'SPAN').toUpperCase()} ${sel.w}×${sel.d}` }));
      spanRow.append(tap(el('button.btn.sm.primary', {}, icon('fit', 17), el('span', { text: 'Fit to building' })), () => {
        const r = app.world.fitSpanToBuilding(app.activeLot, app.ui.selectedSlot);
        if (!r.ok) { toast(r.reason, 'bad'); return; }
        app.ui.selectedSlot = r.key;
        app.audio.place();
        toast(`Fitted — ${r.w} × ${r.d}`, 'good');
        app.refreshLots(); app.refreshOverlay(); this.render();
      }));
      for (const st of styles) {
        const b = el(`div.storey-pill${sel.style === st ? '.on' : ''}`, { text: names[st] });
        b.style.minWidth = '58px';
        tap(b, () => {
          app.world.setSpanStyle(app.activeLot, app.ui.selectedSlot, st);
          app.audio.snap();
          app.refreshLots(); this.render();
        });
        spanRow.append(b);
      }
      this.node.append(spanRow);
      this.node.append(el('div.tiny.dim', { style: { padding: '0 2px' },
        text: 'Drag any of the four handles to resize it.' }));
    }

    // --- colour picker ---------------------------------------------------
    this.colourPanel = el('div.colour-panel', { style: { display: app.ui.showColours ? 'block' : 'none' } });
    this.renderColours();
    this.node.append(this.colourPanel);
  }

  toggleColours() {
    this.app.ui.showColours = !this.app.ui.showColours;
    this.colourPanel.style.display = this.app.ui.showColours ? 'block' : 'none';
    if (this.app.ui.showColours) this.renderColours();
  }

  /** Per-part colour: one swatch row per material zone, plus a free picker. */
  renderColours() {
    const app = this.app;
    clear(this.colourPanel);
    const part = app.ui.heldPart ? getPart(app.ui.heldPart) : null;
    const target = app.ui.selectedSlot && app.activeLot ? app.activeLot.parts[app.ui.selectedSlot] : null;
    const zones = target ? (getPart(target.part)?.zones || []) : (part?.zones || ['Body', 'Trim', 'Detail']);
    const colors = target ? target.colors : this.colors;

    this.colourPanel.append(el('div.tiny.dim', { style: { margin: '8px 0 5px' },
      text: target ? `COLOURING THE SELECTED PART` : 'COLOURS FOR THE HELD PART' }));

    const zoneRow = el('div.zone-row');
    zones.slice(0, 3).forEach((zname, i) => {
      const b = el(`button.zone-btn${this.zone === i ? '.on' : ''}`, {},
        el('span.sw', { style: { background: colors[i] || '#888' } }),
        el('span', { text: zname }));
      tap(b, () => { this.zone = i; this.renderColours(); });
      zoneRow.append(b);
    });
    this.colourPanel.append(zoneRow);

    const applyColor = (hex) => {
      colors[this.zone] = hex;
      if (target) {
        app.world.paint(app.activeLot, app.ui.selectedSlot, colors);
        app.audio.paint();
        app.refreshLots();
      }
      this.renderColours();
      this.render();
    };

    const grid = el('div.swatches');
    for (const hex of SWATCHES) {
      const sw = el(`div.swatch${colors[this.zone] === hex ? '.on' : ''}`, { style: { background: hex } });
      tap(sw, () => applyColor(hex));
      grid.append(sw);
    }
    this.colourPanel.append(grid);

    const free = el('input', {
      type: 'color', value: colors[this.zone] || '#cccccc',
      oninput: (e) => applyColor(e.target.value),
    });
    this.colourPanel.append(el('div.picker-row', {},
      free,
      el('div.tiny.dim', { style: { flex: '1 1 auto' }, text: 'Any colour you like. Changing a colour is instant and free.' }),
      target ? tap(el('button.btn.sm', { text: 'Apply to held' }), () => {
        this.colors = colors.slice();
        toast('Copied to the held part');
      }) : null));
  }

  /** Live running total shown while a continuous drag is in progress. */
  setRunTotal(count, cost) {
    if (!this.runTotal) return;
    this.runTotal.textContent = count ? `${count} × = ${fmtCredits(cost)} cr` : '';
    this.runTotal.style.color = count ? 'var(--coin)' : '';
  }
}
