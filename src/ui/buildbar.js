/**
 * The modular build bar.
 *
 * Lives inside its own panel pinned to the bottom, never floating loose over
 * the world, and never covered by a sheet — opening any sheet closes it.
 * Every tool is one tap away.
 */

import { el, clear, tap, toast, haptic, fmtCredits, confirmDialog, promptDialog } from './dom.js';
import { thumbImg } from './thumbs.js';
import { getPart } from '../kit/parts.js';
import { SWATCHES } from '../kit/colors.js';
import { CONFIG } from '../core/config.js';
import { openBuildDrawer } from './screens.js';

export const TOOLS = [
  { id: 'place', ico: '➕', label: 'Place' },
  { id: 'paint', ico: '🎨', label: 'Paint' },
  { id: 'erase', ico: '🧽', label: 'Erase' },
  { id: 'move', ico: '✋', label: 'Move' },
  { id: 'rotate', ico: '🔄', label: 'Rotate' },
  { id: 'duplicate', ico: '⧉', label: 'Copy' },
  { id: 'eyedrop', ico: '💧', label: 'Pick' },
  { id: 'select', ico: '▧', label: 'Select' },
];

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
        el('div.nm', { text: part ? part.name : 'Nothing held' }),
        el('div.pr', { text: part ? (part.cost ? `${part.cost} cr each` : 'Free') : 'Pick from the catalogue' })),
      this.runTotal = el('div.tiny.dim', { style: { textAlign: 'right' }, text: '' }),
      tap(el('button.btn.sm', { text: 'Catalogue' }), () => openBuildDrawer(app)));
    this.node.append(held);

    // --- tools ---------------------------------------------------------
    const row = el('div.tool-row');
    for (const t of TOOLS) {
      const b = el(`button.tool${this.tool === t.id ? '.on' : ''}`, { 'aria-label': t.label },
        el('span.ico', { text: t.ico }), el('span.lbl', { text: t.label }));
      tap(b, () => this.setTool(t.id));
      row.append(b);
    }
    // undo / redo / clear
    const undoBtn = el('button.tool', { 'aria-label': 'Undo', disabled: !app.world.canUndo },
      el('span.ico', { text: '↶' }), el('span.lbl', { text: 'Undo' }));
    tap(undoBtn, () => {
      const r = app.world.undo();
      if (!r.ok) { toast(r.reason, 'bad'); return; }
      app.audio.undo(); toast(`Undid ${r.label}`); app.refreshLots(); this.render();
    });
    const redoBtn = el('button.tool', { 'aria-label': 'Redo', disabled: !app.world.canRedo },
      el('span.ico', { text: '↷' }), el('span.lbl', { text: 'Redo' }));
    tap(redoBtn, () => {
      const r = app.world.redo();
      if (!r.ok) { toast(r.reason, 'bad'); return; }
      app.audio.undo(); toast(`Redid ${r.label}`); app.refreshLots(); this.render();
    });
    row.append(undoBtn, redoBtn);

    const gridBtn = el(`button.tool${app.ui.showGrid ? '.on' : ''}`, { 'aria-label': 'Grid' },
      el('span.ico', { text: '#' }), el('span.lbl', { text: 'Grid' }));
    tap(gridBtn, () => { app.ui.showGrid = !app.ui.showGrid; app.refreshOverlay(); this.render(); });

    const lockBtn = el(`button.tool${app.ui.cameraLock ? '.on' : ''}`, { 'aria-label': 'Camera lock' },
      el('span.ico', { text: app.ui.cameraLock ? '🔒' : '🔓' }), el('span.lbl', { text: 'Camera' }));
    tap(lockBtn, () => {
      app.ui.cameraLock = !app.ui.cameraLock;
      app.cam.locked = app.ui.cameraLock;
      toast(app.ui.cameraLock ? 'Camera locked — drags only build' : 'Camera unlocked');
      this.render();
    });

    const clearBtn = el('button.tool', { 'aria-label': 'Clear lot' },
      el('span.ico', { text: '🗑' }), el('span.lbl', { text: 'Clear' }));
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
      el('span.ico', { text: '💾' }), el('span.lbl', { text: 'Save' }));
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
    storeys.append(el('span.tiny.dim', { text: 'STOREY' }));
    const maxS = Math.min(CONFIG.grid.maxStoreys, (app.activeLot?.storeys || 1) + 1);
    for (let s = CONFIG.grid.minStorey; s < maxS; s++) {
      const b = el(`div.storey-pill${app.ui.storey === s ? '.on' : ''}`, { text: s < 0 ? 'B' : String(s + 1) });
      tap(b, () => { app.ui.storey = s; app.refreshOverlay(); this.render(); });
      storeys.append(b);
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
      storeys.append(add);
    }
    storeys.append(el('span.spacer'));
    storeys.append(tap(el('button.btn.sm', { text: '🎨 Colours' }), () => this.toggleColours()));
    this.node.append(storeys);

    // --- colour picker ---------------------------------------------------
    this.colourPanel = el('div', { style: { display: app.ui.showColours ? 'block' : 'none' } });
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
