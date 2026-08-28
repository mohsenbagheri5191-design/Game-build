/**
 * Toronto Builder — entry point.
 *
 * Loads the baked city, stands up the renderer, camera, save and interface,
 * and wires the touch gestures to the build system.
 */

import * as THREE from 'three';
import { City, SIZE_BYTES } from './core/city.js';
import { CONFIG } from './core/config.js';
import { NORTH_IN_GRID } from './core/geo.js';
import { Stage } from './render/stage.js';
import { ChunkManager } from './render/chunks.js';
import { buildChunk } from './render/scenery.js';
import { SKY_U } from './render/materials.js';
import { TouchCamera } from './camera/controls.js';
import { LotView, Ghost, LotOverlay, BorderOverlay } from './render/lotview.js';
import { GameState, migrate } from './game/save.js';
import { World, lotGrid, nearestSlot, slotKey, slotValid, slotTransform, slotsAlong, parseSlot, obbOverlap, spanValid, spanTransform } from './game/world.js';
import {
  generateNeighbours, processDailyLogin, processUpkeep, checkMilestones,
  receiveVisit, CIVIC_PROJECTS, civicProgress, randomNote,
  stageOf, GROWTH_NEWS, REPAINT_NEWS, rebuildNeighbours,
} from './game/sim.js';
import { getPart, partGeometry, allParts } from './kit/parts.js';
import { spanGeometry, spanStyles, spanStyleNames } from './kit/spans.js';
import './kit/decor.js';
import { hexToRgb01, defaultColorsFor } from './kit/colors.js';
import { makeInstanced, setInstanceColors, flushInstanceColors } from './render/props.js';
import { Audio } from './audio/audio.js';
import { SheetHost } from './ui/sheets.js';
import { Hud } from './ui/hud.js';
import { BuildBar } from './ui/buildbar.js';
import { el, clear, tap, toast, setHaptics, haptic, confirmDialog } from './ui/dom.js';
import {
  openMainMenu, openBuildDrawer, openWallet, openMyLots, openSiteCard, openProfile,
  openAvatarEditor, openDiscover, openVisit, openFriends, openMessages, openShop,
  openCivic, openPlaces, openSettings, openMilestones, openHelp, openAbout, openContextMenu,
} from './ui/screens.js';

const VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// SPLASH
// ---------------------------------------------------------------------------
function splashMarkup() {
  return el('div#splash', {},
    el('svg.skyline', { viewBox: '0 0 320 74', html: `
      <g fill="#8a6f57">
        <rect x="4" y="46" width="18" height="28"/><rect x="26" y="38" width="14" height="36"/>
        <rect x="44" y="52" width="20" height="22"/><rect x="68" y="30" width="16" height="44"/>
        <rect x="88" y="44" width="12" height="30"/>
        <rect x="152" y="34" width="18" height="40"/><rect x="174" y="20" width="16" height="54"/>
        <rect x="194" y="40" width="20" height="34"/><rect x="218" y="28" width="14" height="46"/>
        <rect x="236" y="48" width="22" height="26"/><rect x="262" y="36" width="16" height="38"/>
        <rect x="282" y="50" width="18" height="24"/>
      </g>
      <g fill="#d4694a">
        <rect x="118" y="8" width="4" height="66"/>
        <ellipse cx="120" cy="30" rx="9" ry="5"/>
        <rect x="117" y="0" width="1.6" height="10"/>
      </g>` }),
    el('div.title', { text: 'Toronto Builder' }),
    el('div.sub', { text: 'Real streets. Your buildings.' }),
    el('div.track', {}, el('i')),
    el('div.pct', { text: '0%' }));
}

// ---------------------------------------------------------------------------
class App {
  constructor() {
    this.version = VERSION;
    this.mode = 'browse';       // 'browse' | 'build' | 'visit'
    this.activeLot = null;
    this.ui = {
      heldPart: null, storey: 0, showGrid: true, cameraLock: false,
      showColours: false, selectedSlot: null, recent: [], favourites: [],
      drawerCat: 'walls', drawerSearch: '', placeQuery: '',
    };
    this.dragRun = null;
    this.frames = 0; this.fpsAccum = 0; this.fps = 0;
    const q = new URLSearchParams(location.search);
    this.showPerf = q.has('perf');
    this._forceHour = q.has('t') ? parseFloat(q.get('t')) : null;
    this._forceQuality = q.get('q');
    this._skipTutorial = q.has('notut');
  }

  // -------------------------------------------------------------------------
  async boot() {
    const app = document.getElementById('app');
    const canvas = el('canvas#c');
    const hudRoot = el('div#hud');
    const splash = splashMarkup();
    app.append(canvas, hudRoot, splash);
    this.hudRoot = hudRoot;

    const track = splash.querySelector('.track > i');
    const pct = splash.querySelector('.pct');
    const setProgress = (p, msg) => {
      track.style.width = `${Math.round(p * 100)}%`;
      pct.textContent = `${Math.round(p * 100)}% · ${msg}`;
    };

    // --- state first, so settings apply before anything renders ---
    this.state = GameState.load();
    this.applyAllSettings();

    // --- city ---
    setProgress(0.02, 'Starting');
    this.city = new City();
    await this.city.load((p, msg) => setProgress(p * 0.72, msg));

    // --- render ---
    setProgress(0.76, 'Building the world');
    this.stage = new Stage(canvas);
    if (this._forceQuality) this.state.settings.quality = this._forceQuality;
    this.stage.setQuality(this.state.settings.quality);
    this.world = new World(this.city, this.state);
    // Rebuild the height field now that we know what the player has cleared,
    // so a reload does not resurrect demolished buildings inside it.
    if (this.world.demolishedSet.size) this.city.buildHeightField(this.world.demolishedSet);
    this.chunks = new ChunkManager(this.city, this.stage.scene, this.stage.materials, this.world.demolishedSet);
    this.chunks.setQuality(this.state.settings.quality);

    this.lotView = new LotView(this.stage.scene, this.stage.materials.part, this.city);
    this.guestView = new LotView(this.stage.scene, this.stage.materials.part, this.city);
    this.civicView = new LotView(this.stage.scene, this.stage.materials.part, this.city);
    this.ghost = new Ghost(this.stage.scene, this.stage.materials.ghost);
    this.overlay = new LotOverlay(this.stage.scene);
    this.borders = new BorderOverlay(this.stage.scene, this.city);
    this.borders.setVisible(this.state.settings.showBorders);

    // --- camera ---
    await new Promise((r) => requestAnimationFrame(r));
    this.stage.resize();
    this.cam = new TouchCamera(this.stage.camera, canvas, this.city, {
      onTap: (p, e) => this.onTap(p, e),
      onHold: (p, e) => this.onHold(p, e),
      onDragStart: (p, e) => this.onDragStart(p, e),
      onDragMove: (p, e) => this.onDragMove(p, e),
      onDragEnd: (p, cancelled) => this.onDragEnd(p, cancelled),
    });
    this.cam.minDist = CONFIG.camera.minDist;
    this.cam.maxDist = CONFIG.camera.maxDist;
    this.cam.margin = CONFIG.camera.boundsMargin;
    this.applyCameraSettings();

    // --- audio + ui ---
    setProgress(0.86, 'Waking the neighbours');
    this.audio = new Audio(this.state.settings);
    // Neighbours build against the clock this save started on, so they are
    // further along every time the player comes back.
    this.neighbours = generateNeighbours(
      this.city, CONFIG.social.neighbourCount, undefined, this.state.s.createdAt);
    this.sheets = new SheetHost(hudRoot);
    this.hud = new Hud(this, hudRoot);
    this.bar = new BuildBar(this, hudRoot);

    hudRoot.addEventListener('sheetopen', () => { this.bar.show(false); this.audio.sheetOpen(); });
    hudRoot.addEventListener('sheetclose', () => {
      this.audio.sheetClose();
      if (this.mode === 'build' && !this.sheets.anyOpen) this.bar.show(true);
    });

    // --- first run ---
    setProgress(0.94, 'Finding you a site');
    if (this.state.lotCount === 0) {
      const r = this.world.grantStarterSite();
      if (r.ok && r.parcel) this.starterParcel = r.parcel;
    }
    this.loadUiPrefs();

    const daily = processDailyLogin(this.state);
    const upkeep = processUpkeep(this.state);

    this.state.addEventListener('reload', () => location.reload());
    this.state.addEventListener('levelup', (e) => {
      this.audio.levelUp();
      toast(`Level ${e.detail.to}! New items unlocked.`, 'good');
    });
    this.world.addEventListener('build', () => {
      this.afterBuild();
    });

    this.refreshLots();
    this.refreshCivic();

    const first = this.world.ownedLots()[0];
    if (first) {
      this.activeLot = this.state.lot(first.parcelId);
      this.ui.storey = 0;
      this.cam.frameRect(first.parcel, {
        minDist: CONFIG.camera.homeDist, pitch: CONFIG.camera.homePitch,
        autoHeading: true, instant: true,
      });
    } else {
      this.cam.frame(-240, 350, 700, 2.4, 0.5, true);
    }
    this.refreshOverlay();

    // --- go ---
    setProgress(1, 'Ready');
    this.startLoop();
    setTimeout(() => {
      splash.classList.add('gone');
      setTimeout(() => splash.remove(), 500);
      if (!this.state.s.tutorialDone && !this._skipTutorial) this.startTutorial();
      else if (daily.ok) toast(`Daily login · +${daily.amount} cr`, 'good');
      if (upkeep.charged > 0) toast(`Upkeep charged · −${upkeep.charged} cr`);
      if (upkeep.degraded?.length) toast(`${upkeep.degraded.length} lot(s) fell into disrepair`, 'bad');
    }, 260);

    // first gesture unlocks audio
    const unlock = () => {
      this.audio.unlock();
      this.audio.resume();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });

    addEventListener('resize', () => this.stage.resize());
    addEventListener('visibilitychange', () => {
      if (document.hidden) this.state.save();
      else this.audio.resume();
    });

    this.scheduleNeighbourActivity();

    // Exposed so the acceptance harness can drive the real systems rather than
    // re-implementing them. Reading these does nothing a player cannot do.
    window.__app = this;
    window.__screens = {
      openMainMenu, openBuildDrawer, openWallet, openMyLots, openSiteCard, openProfile,
      openAvatarEditor, openDiscover, openVisit, openFriends, openMessages, openShop,
      openCivic, openPlaces, openSettings, openMilestones, openHelp, openAbout, openContextMenu,
    };
    window.__kit = { allParts, getPart, partGeometry };
    window.__spans = { spanGeometry, spanStyles, spanStyleNames };
    window.__world = { lotGrid, nearestSlot, slotKey, slotValid, slotTransform, slotsAlong, parseSlot, obbOverlap, spanValid, spanTransform };
    window.__save = { migrate };
    window.__scenery = { buildChunk };
    window.__sky = SKY_U;
    window.__sim = { stageOf, rebuildNeighbours, generateNeighbours, GROWTH_NEWS, REPAINT_NEWS };
    window.__ready = true;
  }

  // =========================================================================
  // INTERACTION
  // =========================================================================
  /** Where a screen point lands on the plane of the storey being edited. */
  pointAtStorey(p, storey = this.ui.storey) {
    const y = storey * CONFIG.grid.storeyHeight;
    this.cam.raycaster.setFromCamera(this.cam.ndc(p), this.stage.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const hit = new THREE.Vector3();
    if (!this.cam.raycaster.ray.intersectPlane(plane, hit)) return null;
    return { u: hit.x, v: -hit.z, y };
  }

  /** Is this grid point inside the active lot (with a little slack)? */
  inActiveLot(u, v, slack = 1.5) {
    if (!this.activeLot) return false;
    const p = this.city.parcelById(this.activeLot.parcelId);
    if (!p) return false;
    return u >= p.u0 - slack && u <= p.u1 + slack && v >= p.v0 - slack && v <= p.v1 + slack;
  }

  onTap(p) {
    if (this.mode === 'build' && this.activeLot) {
      const hit = this.pointAtStorey(p);
      if (hit && this.inActiveLot(hit.u, hit.v)) { this.applyToolAt(hit, true); return; }
    }
    // browse: what did they tap?
    const pick = this.cam.pick(p, this.chunks.pickTargets());
    if (!pick) return;
    this.audio.tapCue();

    // a placed part of theirs?
    const near = this.lotView.pickNearest(pick.u, pick.v, 0, 2.0);
    if (near && this.mode !== 'visit') {
      const lot = this.state.lot(near.lotId);
      if (lot) {
        this.activeLot = lot;
        this.ui.selectedSlot = near.key;
        this.overlay.select(this.city.parcelById(lot.parcelId), near.key);
        const part = getPart(near.partId);
        this.hud.setHint(`${part?.name || near.partId} selected`);
        this.bar.renderColours();
        return;
      }
    }

    const info = this.world.siteInfo(pick.u, pick.v);
    if (info.kind === 'parcel' && info.owned) {
      this.activeLot = info.owned;
      this.ui.selectedSlot = null;
      this.refreshOverlay();
    }
    openSiteCard(this, info);
  }

  onHold(p) {
    const hit = this.pointAtStorey(p);
    const pick = this.cam.pick(p, this.chunks.pickTargets());
    if (!pick) return;
    haptic('medium');

    const near = hit ? this.lotView.pickNearest(hit.u, hit.v, hit.y, 2.0) : null;
    if (near && this.mode !== 'visit') {
      const lot = this.state.lot(near.lotId);
      const part = getPart(near.partId);
      const rec = lot?.parts?.[near.key];
      if (rec && rec.w) {
        // spans get their own menu: fit, shape, colour, erase
        const names = spanStyleNames(rec.part);
        const styleActions = spanStyles(rec.part).filter((st) => st !== rec.style).map((st) => ({
          ico: 'build', label: `Shape: ${names[st]}`,
          run: () => {
            this.world.setSpanStyle(lot, near.key, st);
            this.audio.snap(); this.refreshLots();
          },
        }));
        openContextMenu(this, {
          title: `${part?.name || 'Span'} ${rec.w} × ${rec.d}`,
          sub: `${names[rec.style] || ''} · ${lot.name}`.replace(/^ · /, ''),
          actions: [
            { ico: '⤢', label: 'Fit to the building below', hint: 'Snap it to the walls underneath',
              run: () => {
                const res = this.world.fitSpanToBuilding(lot, near.key);
                if (!res.ok) { toast(res.reason, 'bad'); return; }
                this.ui.selectedSlot = res.key;
                this.activeLot = lot;
                toast(`Fitted — ${res.w} × ${res.d}`, 'good');
                this.audio.place();
                this.refreshLots(); this.refreshOverlay();
              } },
            { ico: 'resize', label: 'Resize by dragging a side', hint: 'Selects it and shows the handles',
              run: () => {
                this.activeLot = lot;
                this.ui.selectedSlot = near.key;
                this.enterBuild();
                this.bar.setTool('select');
                this.refreshOverlay();
                toast('Drag any of the four handles');
              } },
            ...styleActions,
            { ico: 'paint', label: `Colour this ${(part?.name || 'part').toLowerCase()}`,
              run: () => { this.activeLot = lot; this.ui.selectedSlot = near.key; this.ui.showColours = true; this.enterBuild(); this.bar.render(); } },
            { ico: 'erase', label: 'Erase',
              run: () => { const e = this.world.erase(lot, near.key); if (e.ok) { this.audio.erase(); toast(`Removed · +${e.refund} cr`); this.ui.selectedSlot = null; this.refreshLots(); this.refreshOverlay(); } } },
          ],
        });
        return;
      }
      openContextMenu(this, {
        title: part?.name || 'Part',
        sub: lot?.name,
        actions: [
          { ico: 'rotate', label: 'Rotate 90°', run: () => { this.world.rotate(lot, near.key, 1); this.audio.snap(); this.refreshLots(); } },
          { ico: 'paint', label: 'Colour this part', run: () => { this.ui.selectedSlot = near.key; this.ui.showColours = true; this.enterBuild(); this.bar.render(); } },
          { ico: '⧉', label: 'Duplicate', hint: 'Hold a copy, colour and all',
            run: () => { this.holdPart(near.partId, lot.parts[near.key].colors); this.bar.setTool('place'); this.enterBuild(); } },
          { ico: 'eyedrop', label: 'Pick up colour and type', run: () => { this.eyedrop(lot, near.key); this.enterBuild(); } },
          { ico: 'move', label: 'Move', run: () => { this.ui.moveFrom = near.key; this.bar.setTool('move'); this.enterBuild(); toast('Now tap where it should go'); } },
          { ico: 'erase', label: 'Erase', run: () => { const r = this.world.erase(lot, near.key); if (r.ok) { this.audio.erase(); toast(`Removed · +${r.refund} cr`); this.refreshLots(); } } },
        ],
      });
      return;
    }

    const info = this.world.siteInfo(pick.u, pick.v);
    const actions = [];
    if (info.kind === 'parcel' && info.owned) {
      actions.push(
        { ico: 'build', label: 'Build here', run: () => { this.focusLot(info.parcel.id); this.enterBuild(); } },
        { ico: 'save', label: 'Save this lot as a design', run: async () => {
          const { promptDialog } = await import('./ui/dom.js');
          const n = await promptDialog('Name this design', 'e.g. Corner cottage');
          if (n) { const r = this.world.saveDesign(info.owned, n); toast(r.ok ? `Saved "${n}"` : r.reason, r.ok ? 'good' : 'bad'); }
        } },
        { ico: 'trash', label: 'Clear the lot', run: async () => {
          const ok = await confirmDialog('Clear this lot?', 'All parts are removed. You can undo it.', 'Clear it');
          if (ok) { this.world.clearLot(info.owned); this.refreshLots(); }
        } });
    } else if (info.kind === 'parcel') {
      actions.push({ ico: 'pin', label: `Claim for ${info.price} cr`, run: () => openSiteCard(this, info) });
    }
    actions.push({ ico: 'search', label: 'Look at this', run: () => this.cam.frame(info.u, info.v, 70, this.cam.tHeading, 0.42) });
    actions.push({ ico: 'about', label: 'Site details', run: () => openSiteCard(this, info) });
    openContextMenu(this, { title: info.address || info.name || 'Here', sub: info.place, actions });
  }

  /**
   * A one-finger drag in build mode lays a continuous run of the held part.
   * Returning true takes the pointer away from the camera for this gesture.
   */
  onDragStart(p) {
    if (this.mode !== 'build' || !this.activeLot) return false;

    // A resize handle takes priority over everything else: dragging one side
    // of a roof is how it is sized to the building.
    const handle = this.handleAt(p);
    if (handle) {
      const slot = parseSlot(this.ui.selectedSlot);
      const rec = this.activeLot.parts[this.ui.selectedSlot];
      const start = this.pointAtStorey(p, slot.storey);
      if (rec && rec.w && start) {
        this.resizeDrag = {
          origKey: this.ui.selectedSlot,
          orig: { storey: slot.storey, i: slot.i, j: slot.j, w: rec.w, d: rec.d },
          origRec: { ...rec },
          side: handle.side,
          start,
          applied: 0,
        };
        haptic('medium');
        this.hud.setHint('Drag to resize');
        return true;
      }
    }

    if (!['place', 'paint', 'erase'].includes(this.bar.tool)) return false;
    if (this.bar.tool === 'place' && !this.ui.heldPart) return false;
    const hit = this.pointAtStorey(p);
    if (!hit || !this.inActiveLot(hit.u, hit.v)) return false;
    this.dragRun = { last: hit, filled: new Set(), count: 0, cost: 0 };
    this.applyToolAt(hit, false);
    return true;
  }

  onDragMove(p) {
    if (this.resizeDrag) {
      const r = this.resizeDrag;
      const now = this.pointAtStorey(p, r.orig.storey);
      if (!now) return;
      // how far the dragged edge has travelled along its own outward normal
      const du = now.u - r.start.u, dv = now.v - r.start.v;
      const along = r.side === 0 ? -dv : r.side === 1 ? dv : r.side === 2 ? -du : du;
      const want = Math.round(along / CONFIG.grid.unit);
      if (want !== r.applied) {
        if (this.previewResize(r.orig, r.side, want)) {
          r.applied = want;
          this.audio.snap();
          const rec = this.activeLot.parts[this.ui.selectedSlot];
          this.hud.setHint(`${getPart(rec.part)?.name || 'Span'} ${rec.w} × ${rec.d}`);
          this.bar.setRunTotal(rec.w * rec.d, getPart(rec.part).cost * rec.w * rec.d);
        }
      }
      return;
    }
    if (!this.dragRun) return;
    const hit = this.pointAtStorey(p);
    if (!hit) return;
    const part = this.ui.heldPart ? getPart(this.ui.heldPart) : null;
    const kind = this.bar.tool === 'place' && part ? part.slot : this.slotKindForTool();
    const g = lotGrid(this.city.parcelById(this.activeLot.parcelId));
    const spans = slotsAlong(g, kind, this.dragRun.last, hit, this.ui.storey);
    for (const s of spans) {
      // each slot is filled once per drag; dragging back does nothing
      if (this.dragRun.filled.has(s.key)) continue;
      this.dragRun.filled.add(s.key);
      this.applyToolToSlot(s.key, s.slot, false);
    }
    this.dragRun.last = hit;
    this.updateGhost(hit);
    this.bar.setRunTotal(this.dragRun.count, this.dragRun.cost);
  }

  onDragEnd(p, cancelled) {
    if (this.resizeDrag) {
      const r = this.resizeDrag;
      this.resizeDrag = null;
      this.bar.setRunTotal(0, 0);
      // Undo the live preview, then apply the whole change as one transaction
      // so it costs the right amount and is a single step in the history.
      const previewKey = this.ui.selectedSlot;
      if (previewKey !== r.origKey) delete this.activeLot.parts[previewKey];
      this.activeLot.parts[r.origKey] = r.origRec;
      this.ui.selectedSlot = r.origKey;
      if (r.applied && !cancelled) {
        const res = this.world.resizeSpan(this.activeLot, r.origKey, r.side, r.applied);
        if (!res.ok) toast(res.reason, 'bad');
        else this.ui.selectedSlot = res.key;
      }
      this.refreshLots();
      this.refreshOverlay();
      this.hud.setHint('');
      return;
    }
    if (!this.dragRun) return;
    const { count, cost } = this.dragRun;
    this.dragRun = null;
    this.bar.setRunTotal(0, 0);
    if (count > 1 && !cancelled) {
      toast(`${count} placed · ${cost >= 0 ? '−' : '+'}${Math.abs(cost)} cr`);
    }
    this.afterBuild();
  }

  slotKindForTool() {
    // paint and erase work on whatever is under the finger; default to cell
    const part = this.ui.heldPart ? getPart(this.ui.heldPart) : null;
    return part ? part.slot : 'c';
  }

  applyToolAt(hit, single) {
    const g = lotGrid(this.city.parcelById(this.activeLot.parcelId));
    const tool = this.bar.tool;
    const part = this.ui.heldPart ? getPart(this.ui.heldPart) : null;

    if (tool === 'place') {
      if (!part) { toast('Pick a part from the catalogue first.', 'bad'); return; }
      const slot = nearestSlot(g, part.slot, hit.u, hit.v, this.ui.storey);
      this.applyToolToSlot(slotKey(slot.kind, slot.storey, slot.i, slot.j, slot.axis), slot, single);
      return;
    }
    // the rest act on the nearest placed part
    const near = this.lotView.pickNearest(hit.u, hit.v, hit.y, 2.2);
    if (!near || near.lotId !== this.activeLot.parcelId) {
      if (single && tool !== 'select') toast('Nothing there.', 'bad');
      return;
    }
    this.applyToolToSlot(near.key, parseSlot(near.key), single);
  }

  applyToolToSlot(key, slot, single) {
    const lot = this.activeLot;
    const tool = this.bar.tool;
    const run = this.dragRun;

    switch (tool) {
      case 'place': {
        const part = getPart(this.ui.heldPart);
        if (!part) return;
        if (part.span) {
          // A roof or a floor arrives already covering the building below it,
          // which is what people expect and saves a resize they should not
          // have to do. An awning is a canopy over one doorway, so it does not
          // — it lands where you tapped, at its own size.
          const g2 = lotGrid(this.city.parcelById(lot.parcelId));
          let i = slot.i, j = slot.j, w = part.spanDefault[0], d = part.spanDefault[1];
          const fit = part.autoFit ? this.world.buildingFootprint(lot, slot.storey) : null;
          if (fit && spanValid(g2, { ...slot, i: fit.i, j: fit.j }, fit.w, fit.d)) {
            i = fit.i; j = fit.j; w = fit.w; d = fit.d;
          } else {
            w = Math.max(1, Math.min(w, g2.cols - i)); d = Math.max(1, Math.min(d, g2.rows - j));
          }
          const sk = slotKey('c', slot.storey, i, j);
          const rs = this.world.placeSpan(lot, sk, part.id, w, d, {
            colors: this.bar.colors, style: this.ui.spanStyle?.[part.id] || part.style,
          });
          if (!rs.ok) { toast(rs.reason, 'bad'); this.audio.error(); return; }
          this.audio.place();
          this.noteRecent(part.id);
          this.ui.selectedSlot = sk;
          this.refreshLots();
          this.refreshOverlay();
          toast(`${part.name} ${w}×${d} — drag a side to resize`);
          return;
        }
        const r = this.world.place(lot, key, part.id, { colors: this.bar.colors, rot: this.ui.rot || 0 });
        if (!r.ok) { if (single || !run) { toast(r.reason, 'bad'); this.audio.error(); } return; }
        this.audio.place();
        this.noteRecent(part.id);
        if (run) { run.count++; run.cost += part.cost; }
        break;
      }
      case 'erase': {
        const r = this.world.erase(lot, key);
        if (!r.ok) { if (single) toast(r.reason, 'bad'); return; }
        this.audio.erase();
        if (run) { run.count++; run.cost -= r.refund; }
        break;
      }
      case 'paint': {
        const r = this.world.paint(lot, key, this.bar.colors);
        if (!r.ok) { if (single) toast(r.reason, 'bad'); return; }
        if (!r.unchanged) this.audio.paint();
        if (run) run.count++;
        break;
      }
      case 'rotate': {
        const r = this.world.rotate(lot, key, 1);
        if (r.ok) this.audio.snap();
        break;
      }
      case 'duplicate': {
        const rec = lot.parts[key];
        if (rec) { this.holdPart(rec.part, rec.colors); this.bar.setTool('place'); toast('Copied — now place it'); }
        break;
      }
      case 'eyedrop':
        this.eyedrop(lot, key);
        break;
      case 'move': {
        if (this.ui.moveFrom && this.ui.moveFrom !== key) {
          const r = this.world.move(lot, this.ui.moveFrom, key);
          if (!r.ok) toast(r.reason, 'bad');
          else { this.audio.snap(); toast('Moved'); }
          this.ui.moveFrom = null;
        } else if (lot.parts[key]) {
          this.ui.moveFrom = key;
          toast('Now tap where it should go');
        }
        break;
      }
      case 'select': {
        this.ui.selectedSlot = key;
        this.refreshOverlay();
        this.bar.renderColours();
        break;
      }
      default: break;
    }
    this.refreshLots();
  }

  eyedrop(lot, key) {
    const rec = lot.parts[key];
    if (!rec) { toast('Nothing there.', 'bad'); return; }
    this.holdPart(rec.part, rec.colors);
    this.bar.colors = rec.colors.slice();
    this.bar.setTool('place');
    const part = getPart(rec.part);
    toast(`Picked up ${part?.name || rec.part}`);
    this.audio.snap();
  }

  updateGhost(hit) {
    if (this.mode !== 'build' || !this.activeLot || !this.ui.heldPart) { this.ghost.hide(); return; }
    const part = getPart(this.ui.heldPart);
    if (!part) { this.ghost.hide(); return; }
    const g = lotGrid(this.city.parcelById(this.activeLot.parcelId));
    const slot = nearestSlot(g, part.slot, hit.u, hit.v, this.ui.storey);
    const valid = slotValid(g, slot) && this.inActiveLot(hit.u, hit.v, 0.5) &&
      this.state.credits >= part.cost && part.level <= this.state.level;
    const t = slotTransform(g, slot);
    this.ghost.set(part.id, t, valid, this.ui.rot || 0);
    this.hud.setHint(valid ? `${part.name} · ${part.cost} cr` : 'Cannot place here');
  }

  // =========================================================================
  // MODES + FOCUS
  // =========================================================================
  enterBuild() {
    if (!this.activeLot) {
      const first = this.world.ownedLots()[0];
      if (!first) { toast('Claim a lot first.', 'bad'); return; }
      this.activeLot = this.state.lot(first.parcelId);
    }
    this.mode = 'build';
    this.bar.show(true);
    this.refreshOverlay();
    this.hud.setHint('Drag to lay a run');
  }

  exitBuild() {
    this.mode = 'browse';
    this.bar.show(false);
    this.ghost.hide();
    this.overlay.clear();
    this.hud.setHint('');
    this.cam.locked = false;
  }

  toggleBuild() { this.mode === 'build' ? this.exitBuild() : this.enterBuild(); }

  focusLot(parcelId) {
    const lot = this.state.lot(parcelId);
    const parcel = this.city.parcelById(parcelId);
    if (!parcel) return;
    if (lot) this.activeLot = lot;
    this.ui.storey = 0;
    this.cam.frameRect(parcel, {
      minDist: CONFIG.camera.homeDist, pitch: CONFIG.camera.homePitch, autoHeading: true,
    });
    this.refreshOverlay();
  }

  goHome() {
    const lots = this.world.ownedLots();
    if (!lots.length) { toast('You do not hold a lot yet.', 'bad'); return; }
    const lot = this.activeLot ? lots.find((l) => l.parcelId === this.activeLot.parcelId) || lots[0] : lots[0];
    this.activeLot = this.state.lot(lot.parcelId);
    // frame it from an angle that shows the build, not the roof
    this.cam.frameRect(lot.parcel, {
      minDist: CONFIG.camera.homeDist, pitch: CONFIG.camera.homePitch, autoHeading: true,
    });
    this.refreshOverlay();
    haptic('medium');
  }

  snapNorth() { this.cam.snapNorth(NORTH_IN_GRID); haptic('light'); }

  visitNeighbour(nb) {
    this.mode = 'visit';
    this.bar.show(false);
    this.ghost.hide();
    this.overlay.clear();
    const parcel = this.city.parcelById(nb.parcelId);
    if (!parcel) return;
    this.guestView.sync([{ parcelId: nb.parcelId, parts: nb.parts, parcel }]);
    this.cam.frameRect(parcel, { minDist: 42, pitch: 0.6, autoHeading: true });
  }

  endVisit() {
    if (this.mode !== 'visit') return;
    this.guestView.clear();
    this.mode = 'browse';
    this.goHome();
  }

  // =========================================================================
  // REFRESH
  // =========================================================================
  refreshLots() {
    this.lotView.sync(this.world.ownedLots());
    this.hud.update();
  }

  refreshOverlay() {
    const parcel = this.activeLot ? this.city.parcelById(this.activeLot.parcelId) : null;
    this.overlay.set(this.mode === 'build' ? parcel : null, this.ui.storey, this.ui.showGrid);
    this.spanHandles = [];
    if (this.ui.selectedSlot && parcel) {
      const rec = this.activeLot?.parts?.[this.ui.selectedSlot] || null;
      this.overlay.select(parcel, this.ui.selectedSlot, rec);
      if (rec && rec.w && this.mode === 'build') {
        this.spanHandles = this.overlay.spanHandles(parcel, this.ui.selectedSlot, rec);
      } else {
        this.overlay.clearHandles();
      }
    } else {
      this.overlay.clearHandles();
    }
  }

  /** Screen position of a world point, for hit-testing the drag handles. */
  toScreen(u, v, y) {
    const p = new THREE.Vector3(u, y, -v).project(this.stage.camera);
    return {
      x: (p.x * 0.5 + 0.5) * this.stage.canvas.clientWidth,
      y: (-p.y * 0.5 + 0.5) * this.stage.canvas.clientHeight,
      behind: p.z > 1,
    };
  }

  /** Which resize handle, if any, a touch landed on. */
  handleAt(p) {
    for (const h of this.spanHandles || []) {
      const s = this.toScreen(h.u, h.v, h.y);
      if (s.behind) continue;
      if (Math.hypot(s.x - p.x, s.y - p.y) < 44) return h;
    }
    return null;
  }

  /** Live preview while a side is being dragged; no ledger entry until drop. */
  previewResize(orig, side, delta) {
    const lot = this.activeLot;
    const g = lotGrid(this.city.parcelById(lot.parcelId));
    let { i, j, w, d } = orig;
    if (side === 0) { j -= delta; d += delta; }
    else if (side === 1) { d += delta; }
    else if (side === 2) { i -= delta; w += delta; }
    else { w += delta; }
    if (!spanValid(g, { storey: orig.storey, i, j }, w, d)) return false;
    const newKey = slotKey('c', orig.storey, i, j);
    const rec = lot.parts[this.ui.selectedSlot];
    if (!rec) return false;
    delete lot.parts[this.ui.selectedSlot];
    lot.parts[newKey] = { ...rec, w, d };
    this.ui.selectedSlot = newKey;
    this.refreshLots();
    this.refreshOverlay();
    return true;
  }

  afterLotChange() {
    this.chunks.setQuality(this.state.settings.quality);
    for (const lot of this.world.ownedLots()) this.chunks.invalidateAround(lot.parcel);
    this.refreshLots();
    this.refreshOverlay();
  }

  afterBuild() {
    this.refreshLots();
    const newly = checkMilestones(this.state, this.world);
    for (const m of newly) {
      this.audio.levelUp();
      toast(`${m.name} · +${m.reward} cr`, 'good');
    }
    this.bar.render();
  }

  /** Completed civic contributions appear physically on the real streets. */
  refreshCivic() {
    const lots = [];
    for (const proj of CIVIC_PROJECTS) {
      const pr = civicProgress(this.state, proj);
      if (!pr.given) continue;
      const parts = {};
      const part = getPart(proj.item);
      if (!part) continue;
      // lay them along the project's stretch of street
      const n = Math.min(pr.given, proj.target);
      const fake = {
        u0: proj.where.u - proj.span / 2, u1: proj.where.u + proj.span / 2,
        v0: proj.where.v - 3, v1: proj.where.v + 3,
      };
      if (proj.axis === 'ns') {
        fake.u0 = proj.where.u - 3; fake.u1 = proj.where.u + 3;
        fake.v0 = proj.where.v - proj.span / 2; fake.v1 = proj.where.v + proj.span / 2;
      }
      const g = lotGrid(fake);
      let placed = 0;
      for (let i = 0; i < g.cols && placed < n; i++) {
        for (let j = 0; j < g.rows && placed < n; j++) {
          parts[slotKey(part.slot === 'k' ? 'k' : 'c', 0, i, j)] = {
            part: proj.item, rot: 0, free: 0, colors: defaultColorsFor(part), t: 0,
          };
          placed++;
        }
      }
      lots.push({ parcelId: `civic-${proj.id}`, parts, parcel: fake });
    }
    this.civicView.sync(lots);
  }

  // =========================================================================
  // SETTINGS
  // =========================================================================
  applySetting(key, value) {
    this.state.set(key, value);
    this.applyAllSettings();
    if (key === 'quality') {
      this.stage.setQuality(value);
      this.chunks.setQuality(value);
    }
    if (key === 'showBorders') this.borders.setVisible(value);
    if (['sound', 'music', 'volumeSfx', 'volumeMusic'].includes(key)) {
      this.audio.unlock();
      this.audio.applySettings();
    }
    if (['invertX', 'invertY', 'sensitivity', 'reducedMotion'].includes(key)) this.applyCameraSettings();
  }

  applyAllSettings() {
    const s = this.state.settings;
    document.body.classList.toggle('large-text', s.largeText);
    document.body.classList.toggle('high-contrast', s.highContrast);
    document.body.classList.toggle('reduced-motion', s.reducedMotion);
    document.body.classList.toggle('left-handed', s.leftHanded);
    setHaptics(s.haptics);
  }

  applyCameraSettings() {
    if (!this.cam) return;
    const s = this.state.settings;
    this.cam.invertX = s.invertX;
    this.cam.invertY = s.invertY;
    this.cam.sensitivity = s.sensitivity;
    this.cam.reducedMotion = s.reducedMotion;
  }

  // =========================================================================
  // TIME + SEASON
  // =========================================================================
  currentHour() {
    // ?t=<hour> pins the clock — used by the screenshot harness so a shot of
    // the same view is comparable between runs.
    if (this._forceHour != null) return this._forceHour;
    const s = this.state.settings;
    if (s.timeMode === 'manual') return s.manualHour;
    if (s.timeMode === 'accelerated') {
      const ms = CONFIG.time.minutesPerGameDay * 60000;
      return ((Date.now() % ms) / ms) * 24;
    }
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  }

  /** Seasons come from the real calendar. */
  seasonT() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const day = Math.floor((now - start) / 86400000);
    // 0 at the winter solstice, 1 at the summer solstice
    return 0.5 - 0.5 * Math.cos(((day - 355) / 365) * Math.PI * 2);
  }

  seasonName() {
    const m = new Date().getMonth();
    return ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer',
      'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'][m];
  }

  cycleTime() {
    const s = this.state.settings;
    const order = ['clock', 'accelerated', 'manual'];
    const next = order[(order.indexOf(s.timeMode) + 1) % order.length];
    this.applySetting('timeMode', next);
    if (next === 'manual') {
      // step through the day so the button is useful on its own
      this.applySetting('manualHour', (s.manualHour + 6) % 24);
    }
    toast(next === 'clock' ? 'Following the real clock'
      : next === 'accelerated' ? 'Accelerated day' : `Manual · ${Math.floor(s.manualHour)}:00`);
  }

  // =========================================================================
  // NEIGHBOUR ACTIVITY (simulated)
  // =========================================================================
  scheduleNeighbourActivity() {
    const tick = () => {
      const delay = 55000 + Math.random() * 90000;
      this._nbTimer = setTimeout(() => {
        this.checkNeighbourGrowth();
        if (!document.hidden && this.state.s.stats.placed >= 5) {
          const nb = this.neighbours[Math.floor(Math.random() * this.neighbours.length)];
          if (nb) {
            const r = receiveVisit(this.state, nb.name);
            if (r.ok) {
              toast(`${nb.name} visited your town · +${CONFIG.economy.visitReward} cr`, 'good');
              this.audio.coin();
              if (Math.random() < 0.4) {
                (this.state.s.social.notes[nb.id] ||= []).push({
                  from: nb.name, text: randomNote(Date.now()), t: Date.now(),
                });
                this.state.touch();
              }
            }
          }
        }
        tick();
      }, delay);
    };
    tick();
  }

  /**
   * Has anybody's town moved on since we last looked?
   *
   * Growth is a pure function of elapsed time, so nothing needs to be stored
   * to make it happen — but the player should be *told*, and the geometry has
   * to be rebuilt for the ones that changed. Only the towns that actually
   * stepped up are rebuilt; the rest are left alone.
   */
  checkNeighbourGrowth() {
    const grown = rebuildNeighbours(this.city, this.neighbours, this.state.s.createdAt);
    if (!grown.length) return;
    const says = (nb) => (nb.lastChange === 'repaint'
      ? REPAINT_NEWS[nb.coat % REPAINT_NEWS.length]
      : GROWTH_NEWS[nb.stage] || 'has been busy');
    for (const nb of grown) {
      (this.state.s.social.notes[nb.id] ||= []).push({
        from: nb.name, text: `${nb.name} ${says(nb)} at ${nb.town}.`, t: Date.now(), growth: true,
      });
    }
    this.state.touch();
    const first = grown[0];
    toast(`${first.name} ${says(first)}`, 'good');
    // any of their lots on screen need redrawing
    this.refreshLots();
  }

  // =========================================================================
  // TUTORIAL
  // =========================================================================
  /**
   * The first-run walkthrough.
   *
   * Six steps, and each one lights up the control it is talking about rather
   * than describing it and hoping. "Open the catalogue" is a sentence you have
   * to go and act on; a ring around the Catalogue button is the answer itself.
   * The spotlight never covers the thing it points at and never intercepts a
   * tap, so you can follow the step while it is on screen.
   *
   * It is replayable from Help, and `?notut` skips it.
   */
  startTutorial(replay = false) {
    this.endTutorial();
    const steps = [
      { t: 'Welcome to Toronto',
        b: 'This is the real downtown — real streets, real names, real block structure. Drag with one finger to look around, pinch to zoom.' },
      { t: 'This is your site',
        b: 'You have been given an open lot to start on. This button always brings you back to it.',
        at: '[aria-label="Go to my site"]' },
      { t: 'Turn on build mode',
        b: 'This is the switch between looking around and building. The build bar appears along the bottom.',
        at: '[aria-label="Build mode"]',
        before: () => { if (this.mode !== 'build' && this.activeLot) this.enterBuild(); } },
      // Deliberately no `before` here. Opening the catalogue for them covers
      // the button being pointed at — the whole point is that they see where
      // it is and reach for it themselves.
      { t: 'Pick something to build with',
        b: 'Tap Catalogue and choose any part to hold it. Walls go on edges, floors and objects go in cells, posts on corners.',
        at: '#buildbar .held .btn' },
      { t: 'Drag to lay a run',
        b: 'With Place selected, drag one finger across your lot to lay a whole wall or path in a single gesture. The running cost shows as you go.',
        at: '#buildbar [aria-label="Place"]' },
      { t: 'Make it yours',
        b: 'Every part has its own colours — nothing is pre-themed. Paint, erase, move and rotate are all one tap away, and undo is always free.',
        at: '#buildbar .storey-row .btn' },
      { t: 'Want more room?',
        b: 'Tap any other lot on the map to see its address and price. Claiming it demolishes what stands there and clears the ground.' },
    ];

    let i = 0;
    const finish = () => {
      steps[i - 1]?.after?.();
      this.endTutorial();
      this.state.s.tutorialDone = true;
      this.state.touch();
      if (!replay) toast('Have fun. Everything is in the menu, top right.', 'good');
    };

    const show = () => {
      if (this._coach) this._coach.remove();
      this._clearSpot();
      if (i >= steps.length) { finish(); return; }
      const s = steps[i];
      s.before?.();

      this._coach = el('div.coach', {},
        el('h3', { text: s.t }),
        el('p', { text: s.b }),
        el('div.row', {},
          el('span.tiny.dim', { text: `${i + 1} / ${steps.length}` }),
          el('span.spacer'),
          tap(el('button.btn.sm.ghost', { text: 'Skip' }), () => { steps[i].after?.(); i = steps.length; show(); }),
          tap(el('button.btn.sm.primary', { text: i === steps.length - 1 ? 'Start building' : 'Next' }), () => {
            steps[i].after?.();
            i++;
            show();
          })));
      this.hudRoot.append(this._coach);

      // The control may only exist once `before` has run and the bar has
      // re-rendered, so look for it on the next frame rather than now.
      requestAnimationFrame(() => this._spotlight(s.at));
    };
    this._coachStep = () => show();
    show();
  }

  /** Ring the element a step is pointing at, and sit the card clear of it. */
  _spotlight(selector) {
    this._clearSpot();
    if (!selector || !this._coach) return;
    const target = this.hudRoot.querySelector(selector);
    if (!target) return;                       // step still reads fine without it
    const host = this.hudRoot.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;   // hidden or not laid out

    const pad = 7;
    const top = r.top - host.top - pad;
    const left = r.left - host.left - pad;
    const w = r.width + pad * 2;
    const h = r.height + pad * 2;

    this._spotTarget = target;
    this._spot = el('div.coach-spot', { style: {
      top: `${top}px`, left: `${left}px`, width: `${w}px`, height: `${h}px`,
    } });
    this.hudRoot.append(this._spot);

    // Put the card on whichever side of the target has more room, so the
    // spotlight is never behind the words describing it.
    const card = this._coach;
    const ch = card.getBoundingClientRect().height || 150;
    const above = top;
    const below = host.height - (top + h);
    card.classList.add('pinned');
    if (below >= ch + 24 || below >= above) {
      card.style.top = `${Math.min(top + h + 14, host.height - ch - 12)}px`;
      card.style.bottom = 'auto';
    } else {
      card.style.top = `${Math.max(12, top - ch - 14)}px`;
      card.style.bottom = 'auto';
    }

    // a nib on the card pointing back at the ring
    const cardTop = parseFloat(card.style.top);
    const pointsDown = cardTop > top;
    this._nib = el(`div.coach-nib.${pointsDown ? 'up' : 'down'}`, { style: {
      left: `${Math.max(20, Math.min(host.width - 30, left + w / 2 - 9))}px`,
      top: pointsDown ? `${cardTop - 18}px` : `${cardTop + ch}px`,
    } });
    this.hudRoot.append(this._nib);
  }

  _clearSpot() {
    this._spot?.remove(); this._spot = null;
    this._spotTarget = null;
    this._nib?.remove(); this._nib = null;
    if (this._coach) {
      this._coach.classList.remove('pinned');
      this._coach.style.top = '';
      this._coach.style.bottom = '';
    }
  }

  endTutorial() {
    this._clearSpot();
    this._coach?.remove();
    this._coach = null;
    this._coachStep = null;
  }

  // =========================================================================
  // HELPERS the UI calls
  // =========================================================================
  holdPart(id, colors) {
    this.ui.heldPart = id;
    const part = getPart(id);
    if (colors) this.bar.colors = colors.slice();
    else if (part) this.bar.colors = defaultColorsFor(part);
    this.noteRecent(id);
    this.bar.render();
  }

  noteRecent(id) {
    this.ui.recent = [id, ...(this.ui.recent || []).filter((x) => x !== id)].slice(0, 12);
    this.saveUiPrefs();
  }

  saveUiPrefs() {
    try {
      localStorage.setItem('tb-ui', JSON.stringify({
        recent: this.ui.recent, favourites: this.ui.favourites,
      }));
    } catch { /* storage full or blocked; prefs are not important enough to fail on */ }
  }

  loadUiPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem('tb-ui') || '{}');
      this.ui.recent = raw.recent || [];
      this.ui.favourites = raw.favourites || [];
    } catch { /* ignore */ }
  }

  unreadCount() {
    let n = 0;
    for (const msgs of Object.values(this.state.s.social.threads)) {
      n += msgs.filter((m) => m.unread).length;
    }
    return n;
  }

  stats() {
    return {
      'Playable area': `${((this.city.uSpan * this.city.vSpan) / 1e6).toFixed(1)} km²`,
      'Lots': this.city.parcelCount.toLocaleString('en-CA'),
      'Named streets': this.city.streets.length,
      'Named places': this.city.places.length,
      'Landmarks': this.city.landmarks.length,
      'Parks & squares': this.city.parks.length,
      'Kit parts': allParts().length,
      'City data': `${(SIZE_BYTES.gz / 1024).toFixed(0)} KB compressed`,
      'Your save': `${(this.state.saveSize / 1024).toFixed(1)} KB`,
    };
  }

  // sheet openers used by the HUD
  openMenu() { openMainMenu(this); }
  openWallet() { openWallet(this); }
  openProfile() { openProfile(this); }

  // =========================================================================
  // LOOP
  // =========================================================================
  startLoop() {
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      this.cam.update(dt);
      this.chunks.update(this.stage.camera.position, dt, this.cam.dist);
      this.stage.setViewDistance(this.cam.dist);
      this.stage.updateShadowFocus(this.cam.focus);
      const hour = this.currentHour(), season = this.seasonT();
      this.stage.setTimeOfDay(hour, season);
      this.stage.updateWeather(this.state.settings.weather, season, hour);
      this.audio.setNight(this.stage.materials.scenery.userData.uniforms.uNight.value);
      this.borders.update(this.cam.focus.x, -this.cam.focus.z);
      this.stage.render(dt);
      this.hud.update();

      this.frames++; this.fpsAccum += dt;
      if (this.fpsAccum >= 0.5) {
        this.fps = Math.round(this.frames / this.fpsAccum);
        this.frames = 0; this.fpsAccum = 0;
        if (this.showPerf) {
          const info = this.stage.renderer.info.render;
          this.hud.setPerf(
            `${this.fps} fps  chunks ${this.chunks.loadedCount}/${this.chunks.wantCount || 0}\n` +
            `draws ${info.calls}  tris ${(info.triangles / 1000).toFixed(0)}k  d ${Math.round(this.cam.dist)}m`);
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// ---------------------------------------------------------------------------
const app = new App();
app.boot().catch((e) => {
  console.error(e);
  const splash = document.getElementById('splash');
  if (splash) {
    splash.querySelector('.sub').textContent = `Something went wrong: ${e.message}`;
    splash.querySelector('.pct').textContent = 'Please reload.';
  }
});
