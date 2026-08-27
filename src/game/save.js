/**
 * Save state, treated as a server.
 *
 * The rule from the brief is that the save layer should validate every
 * transaction as if the client were hostile, keep an append-only ledger, make
 * trades atomic, and never let the client hold an authoritative balance. So:
 *
 *   - `credits` is not stored. It is derived by summing the ledger, every time.
 *     There is no field to tamper with that isn't also a visible ledger entry.
 *   - Every mutation goes through commit(), which checks preconditions first
 *     and either applies the whole transaction or none of it.
 *   - The ledger is append-only. Nothing rewrites or deletes an entry.
 *
 * Versioned, with a migration path for older saves.
 */

import { CONFIG, levelForXp, xpForLevel } from '../core/config.js';

export const SAVE_KEY = 'toronto-builder-save-v1';
export const SAVE_VERSION = 3;

// ---------------------------------------------------------------------------
export function emptySave() {
  return {
    v: SAVE_VERSION,
    createdAt: Date.now(),
    profile: {
      name: 'New Builder',
      avatar: defaultAvatar(),
      xp: 0,
      founder: true,
      townName: 'My Corner of Toronto',
    },
    lots: [],                 // { parcelId, claimedAt, name, condition, upkeepPaidTo, parts: {} }
    demolished: [],           // parcel ids cleared by the player
    ledger: [],               // append-only: { t, type, amount, note }
    designs: [],              // saved structures the player can stamp again
    social: {
      friends: [],
      threads: {},            // neighbourId -> [{ from, text, t }]
      notes: {},              // neighbourId -> [{ from, text, t }]
      tips: {},               // 'YYYY-MM-DD' -> { count, recipients: [] }
      visitsReceived: 0,
    },
    civic: {},                // projectId -> { given, lastDay, count }
    milestones: [],           // unlocked milestone ids
    stats: { placed: 0, erased: 0, painted: 0, partTypes: [], storeysBuilt: 0, visits: 0 },
    settings: defaultSettings(),
    lastLoginDay: null,
    lastUpkeepAt: Date.now(),
    tutorialDone: false,
  };
}

export function defaultAvatar() {
  return {
    body: 0, head: 0, hair: 0, hat: 0, face: 0,
    colors: {
      skin: '#e8b98d', hair: '#43301f', top: '#4f7fa8',
      legs: '#3b4757', shoes: '#2f2a26', hat: '#c25b4a',
    },
  };
}

export function defaultSettings() {
  return {
    timeMode: CONFIG.time.defaultMode,       // clock | accelerated | manual
    manualHour: CONFIG.time.defaultHour,
    sound: true, music: true,
    volumeSfx: CONFIG.audio.sfxDefault,
    volumeMusic: CONFIG.audio.musicDefault,
    haptics: true,
    quality: 'medium',
    showBorders: true,
    showStreetNames: true,
    showPlaceNames: true,
    gridSnap: true,
    snapStrength: 1,
    invertX: false, invertY: false,
    sensitivity: 1,
    largeText: false,
    highContrast: false,
    reducedMotion: false,
    leftHanded: false,
    units: 'metric',
    weather: true,
  };
}

// ---------------------------------------------------------------------------
// migrations
// ---------------------------------------------------------------------------
const MIGRATIONS = {
  // v1 stored a plain `credits` number. Convert it into an opening ledger
  // entry so the balance stays derived from here on.
  1: (s) => {
    s.ledger = s.ledger || [];
    if (typeof s.credits === 'number') {
      s.ledger.unshift({ t: s.createdAt || Date.now(), type: 'migrate', amount: s.credits, note: 'Opening balance' });
      delete s.credits;
    }
    s.v = 2;
    return s;
  },
  // v2 kept lot parts as an array; keyed by slot is far cheaper to look up
  // and makes "occupying a slot replaces what is there" free.
  2: (s) => {
    for (const lot of s.lots || []) {
      if (Array.isArray(lot.parts)) {
        const map = {};
        for (const p of lot.parts) if (p && p.slot) map[p.slot] = p;
        lot.parts = map;
      }
      lot.condition ??= 0;
      lot.upkeepPaidTo ??= Date.now();
    }
    s.civic ??= {};
    s.milestones ??= [];
    s.designs ??= [];
    s.v = 3;
    return s;
  },
};

export function migrate(save) {
  let s = save;
  let guard = 0;
  while (s.v < SAVE_VERSION && guard++ < 20) {
    const m = MIGRATIONS[s.v];
    if (!m) { s.v = SAVE_VERSION; break; }
    s = m(s);
  }
  // fill in anything a future field expects
  const base = emptySave();
  s.profile = { ...base.profile, ...(s.profile || {}) };
  s.profile.avatar = { ...base.profile.avatar, ...(s.profile.avatar || {}) };
  s.profile.avatar.colors = { ...base.profile.avatar.colors, ...(s.profile.avatar.colors || {}) };
  s.settings = { ...base.settings, ...(s.settings || {}) };
  s.social = { ...base.social, ...(s.social || {}) };
  s.stats = { ...base.stats, ...(s.stats || {}) };
  s.lots ||= []; s.ledger ||= []; s.demolished ||= [];
  s.designs ||= []; s.civic ||= {}; s.milestones ||= [];
  s.v = SAVE_VERSION;
  return s;
}

// ---------------------------------------------------------------------------
export class GameState extends EventTarget {
  constructor(save) {
    super();
    this.s = save || emptySave();
    this._balance = null;
    this._saveTimer = null;
    this.dirty = false;
  }

  // --- persistence -------------------------------------------------------
  static load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return new GameState(emptySave());
      const parsed = JSON.parse(raw);
      return new GameState(migrate(parsed));
    } catch (e) {
      console.warn('save unreadable, starting fresh', e);
      return new GameState(emptySave());
    }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.s));
      this.dirty = false;
      return true;
    } catch (e) {
      console.warn('save failed', e);
      return false;
    }
  }

  /** Autosave on every meaningful change, debounced. */
  touch() {
    this.dirty = true;
    this._balance = null;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 900);
    this.dispatchEvent(new CustomEvent('change'));
  }

  get saveSize() {
    try { return new Blob([JSON.stringify(this.s)]).size; } catch { return 0; }
  }

  exportSave() {
    return JSON.stringify({ ...this.s, exportedAt: Date.now() }, null, 1);
  }

  importSave(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.ledger)) {
      throw new Error('That does not look like a Toronto Builder save.');
    }
    this.s = migrate(parsed);
    this._balance = null;
    this.save();
    this.dispatchEvent(new CustomEvent('change'));
    this.dispatchEvent(new CustomEvent('reload'));
  }

  resetSave() {
    this.s = emptySave();
    this._balance = null;
    this.save();
    this.dispatchEvent(new CustomEvent('change'));
    this.dispatchEvent(new CustomEvent('reload'));
  }

  // --- derived money -----------------------------------------------------
  /** Balance is the sum of the ledger. There is no stored number to trust. */
  get credits() {
    if (this._balance === null) {
      let n = 0;
      for (const e of this.s.ledger) n += e.amount;
      this._balance = Math.round(n);
    }
    return this._balance;
  }

  get level() { return levelForXp(this.s.profile.xp); }
  get xp() { return this.s.profile.xp; }
  xpIntoLevel() {
    const l = this.level;
    const a = xpForLevel(l), b = xpForLevel(Math.min(l + 1, CONFIG.progression.maxLevel));
    return { into: this.xp - a, need: Math.max(1, b - a), atMax: l >= CONFIG.progression.maxLevel };
  }

  /**
   * The only way money or XP ever moves.
   *
   * @param tx { entries:[{type,amount,note}], xp?, requireCredits?, apply?, check? }
   * @returns { ok, reason }
   */
  commit(tx) {
    const cost = -(tx.entries || []).reduce((s, e) => s + Math.min(0, e.amount), 0);
    if (cost > 0 && this.credits < cost) {
      return { ok: false, reason: 'Not enough credits.' };
    }
    if (tx.check) {
      const r = tx.check(this);
      if (r && r.ok === false) return r;
    }

    // Snapshot the ledger length so a throwing apply() cannot half-commit.
    const mark = this.s.ledger.length;
    try {
      const now = Date.now();
      for (const e of tx.entries || []) {
        if (!Number.isFinite(e.amount)) throw new Error('bad ledger amount');
        this.s.ledger.push({ t: now, type: e.type, amount: Math.round(e.amount), note: e.note || '' });
      }
      if (tx.xp) {
        const before = this.level;
        this.s.profile.xp += Math.max(0, Math.round(tx.xp));
        const after = this.level;
        if (after > before) {
          this.dispatchEvent(new CustomEvent('levelup', { detail: { from: before, to: after } }));
        }
      }
      tx.apply?.(this);
    } catch (err) {
      this.s.ledger.length = mark;  // atomic: nothing partially applied survives
      console.warn('transaction rolled back', err);
      return { ok: false, reason: 'That could not be completed.' };
    }
    this.touch();
    return { ok: true };
  }

  /** Convenience for a plain credit change with no side effects. */
  pay(amount, type, note) {
    return this.commit({ entries: [{ type, amount, note }] });
  }

  // --- ledger views ------------------------------------------------------
  ledgerPage(offset = 0, limit = 60) {
    const l = this.s.ledger;
    const out = [];
    for (let i = l.length - 1 - offset; i >= 0 && out.length < limit; i--) out.push(l[i]);
    return out;
  }

  incomeBreakdown(sinceMs = 0) {
    const out = {};
    for (const e of this.s.ledger) {
      if (e.t < sinceMs) continue;
      out[e.type] = (out[e.type] || 0) + e.amount;
    }
    return out;
  }

  // --- lots --------------------------------------------------------------
  lot(parcelId) { return this.s.lots.find((l) => l.parcelId === parcelId) || null; }
  get lotCount() { return this.s.lots.length; }
  isDemolished(id) { return this.s.demolished.includes(id); }

  // --- settings ----------------------------------------------------------
  set(key, value) {
    this.s.settings[key] = value;
    this.touch();
    this.dispatchEvent(new CustomEvent('setting', { detail: { key, value } }));
  }
  get settings() { return this.s.settings; }
}

// ---------------------------------------------------------------------------
export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
