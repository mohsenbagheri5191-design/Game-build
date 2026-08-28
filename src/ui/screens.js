/**
 * Every screen in the game.
 *
 * All of them are sheets: dismissible by swipe and by an explicit close
 * button, safe-area aware, reachable from the main HUD in at most two taps.
 */

import { icon } from './icons.js';
import { el, clear, tap, toast, toggle, slider, selectRow, confirmDialog, promptDialog, fmtCredits, fmtRelative, fmtWhen, haptic } from './dom.js';
import { thumbImg, AvatarView, avatarChip } from './thumbs.js';
import { allParts, getPart } from '../kit/parts.js';
import { SWATCHES } from '../kit/colors.js';
import { CONFIG, lotUpkeep, lotPrice } from '../core/config.js';
import { fmtLength, fmtArea, headingToBearing, cardinal, formatLatLon } from '../core/geo.js';
import {
  CIVIC_PROJECTS, civicProgress, contributeCivic, civicContributors,
  MILESTONES, canTip, tip, receiveVisit, randomNote, payUpkeepNow,
} from '../game/sim.js';
import {
  BODY_NAMES, HEAD_NAMES, HAIR_NAMES, HAT_NAMES, FACE_NAMES, AVATAR_ZONES,
} from '../kit/avatar.js';

const CATS = [
  ['walls', 'Walls'], ['openings', 'Openings'], ['floors', 'Floors & roof'],
  ['stairs', 'Stairs'], ['posts', 'Posts & rails'], ['bits', 'Structural'],
  ['fences', 'Fences'], ['paths', 'Paths'], ['plants', 'Plants'],
  ['water', 'Water'], ['decor', 'Decor'], ['seasonal', 'Seasonal'], ['prestige', 'Earned'],
];

// ===========================================================================
// 1. MAIN MENU
// ===========================================================================
export function openMainMenu(app) {
  app.sheets.open('menu', {
    title: 'Menu',
    sub: `${app.state.s.profile.townName} · Level ${app.state.level}`,
    render: (body) => {
      const tile = (ico, lbl, fn, badge, tone) => {
        const t = el('button.menu-tile', tone ? { 'data-tone': tone } : {},
          el('div.ico', {}, icon(ico, 23)), el('div.lbl', { text: lbl }),
          badge ? el('span.badge', { text: String(badge) }) : null);
        return tap(t, fn);
      };
      body.append(el('div.menu-grid', {},
        tile('build', 'Build', () => { app.sheets.close('menu'); app.enterBuild(); }, null, 'terra'),
        tile('catalogue', 'Catalogue', () => openBuildDrawer(app)),
        tile('wallet', 'Wallet', () => openWallet(app)),
        tile('lots', 'My lots', () => openMyLots(app), null, 'terra'),
        tile('person', 'Profile', () => openProfile(app), null, 'plum'),
        tile('avatar', 'Avatar', () => openAvatarEditor(app), null, 'plum'),
        tile('discover', 'Discover', () => openDiscover(app), null, 'sage'),
        tile('friends', 'Friends', () => openFriends(app), null, 'sage'),
        tile('message', 'Messages', () => openMessages(app), app.unreadCount() || null, 'sage'),
        tile('shop', 'Shop', () => openShop(app)),
        tile('civic', 'Civic board', () => openCivic(app), null, 'sky'),
        tile('places', 'Map & places', () => openPlaces(app), null, 'sky'),
        tile('milestone', 'Milestones', () => openMilestones(app)),
        tile('settings', 'Settings', () => openSettings(app), null, 'sky'),
        tile('help', 'Help', () => openHelp(app), null, 'sky'),
        tile('about', 'About', () => openAbout(app), null, 'sky')));

      body.append(el('div.card', { style: { marginTop: '10px' } },
        el('div.row', {},
          el('div', {},
            el('div.tiny.dim', { text: 'BALANCE' }),
            el('div.big', { style: { color: 'var(--coin)' }, text: `${fmtCredits(app.state.credits)} cr` })),
          el('span.spacer'),
          el('div', { style: { textAlign: 'right' } },
            el('div.tiny.dim', { text: 'UPKEEP / DAY' }),
            el('div.big', { text: `${fmtCredits(app.world.totalUpkeep())} cr` })))));
    },
  });
}

// ===========================================================================
// 2. BUILD DRAWER — the catalogue
// ===========================================================================
export function openBuildDrawer(app) {
  app.ui.drawerCat ||= 'walls';
  app.ui.drawerSearch ||= '';

  app.sheets.open('drawer', {
    title: 'Catalogue',
    sub: 'Tap an item to hold it, then place it on your lot',
    // Deliberately not `full`. No category has more than fourteen parts, so a
    // full-height sheet left more than half of itself as blank cream below the
    // last row on every single tab. Letting it hug its content means the sheet
    // is as tall as there is something to look at, and no taller.
    render: (body) => {
      const search = el('input.search', {
        type: 'search', placeholder: 'Search parts…', value: app.ui.drawerSearch,
        oninput: (e) => { app.ui.drawerSearch = e.target.value; renderGrid(); },
      });
      body.append(search);

      const tabs = el('div.tabs', { style: { marginTop: '8px' } });
      for (const [id, label] of CATS) {
        const t = el(`button.tab${app.ui.drawerCat === id ? '.on' : ''}`, { text: label });
        tap(t, () => {
          app.ui.drawerCat = id;
          [...tabs.children].forEach((c) => c.classList.remove('on'));
          t.classList.add('on');
          renderGrid();
        });
        tabs.append(t);
      }
      body.append(tabs);

      // recently used
      const recentWrap = el('div');
      body.append(recentWrap);

      const grid = el('div.cat-grid');
      body.append(grid);

      const renderRecent = () => {
        clear(recentWrap);
        const recents = (app.ui.recent || []).map(getPart).filter(Boolean);
        const favs = (app.ui.favourites || []).map(getPart).filter(Boolean);
        if (favs.length) {
          recentWrap.append(el('div.tiny.dim', { style: { margin: '10px 0 5px' }, text: 'FAVOURITES' }));
          const row = el('div.recent-row');
          favs.forEach((p) => row.append(itemTile(app, p, true)));
          recentWrap.append(row);
        }
        if (recents.length) {
          recentWrap.append(el('div.tiny.dim', { style: { margin: '10px 0 5px' }, text: 'RECENTLY USED' }));
          const row = el('div.recent-row');
          recents.forEach((p) => row.append(itemTile(app, p, true)));
          recentWrap.append(row);
        }
      };

      const renderGrid = () => {
        clear(grid);
        const q = app.ui.drawerSearch.trim().toLowerCase();
        let list = allParts();
        if (q) list = list.filter((p) => (p.name + ' ' + p.tags + ' ' + p.cat).toLowerCase().includes(q));
        else list = list.filter((p) => p.cat === app.ui.drawerCat);
        if (!list.length) {
          grid.append(el('div.empty', { style: { gridColumn: '1 / -1' } },
            el('span.ico', {}, icon('search', 26)), 'Nothing matches that.'));
          return;
        }
        for (const p of list) grid.append(itemTile(app, p));
      };

      renderRecent();
      renderGrid();
    },
  });
}

function itemTile(app, part, compact = false) {
  const locked = part.level > app.state.level;
  const earnedLocked = part.earned && !app.state.s.milestones.includes(part.earned);
  const held = app.ui.heldPart === part.id;
  const node = el(`div.cat-item${held ? '.on' : ''}${(locked || earnedLocked) ? '.locked' : ''}`);
  const thumb = el('div.thumb');
  thumb.append(thumbImg(part.id, part.name));
  node.append(thumb);
  if (!compact) {
    node.append(el('div.nm', { text: part.name }));
    if (earnedLocked) node.append(el('div.lk', {}, icon('milestone', 13), el('span', { text: 'Earned' })));
    else if (locked) node.append(el('div.lk', { text: `Level ${part.level}` }));
    else node.append(el('div.pr', { text: part.cost ? `${part.cost} cr` : 'Free' }));
  }
  const favOn = (app.ui.favourites || []).includes(part.id);
  const fav = el('div.fav', {}, icon(favOn ? 'star' : 'starOutline', 16));
  tap(fav, (e) => {
    e.stopPropagation();
    app.ui.favourites ||= [];
    const i = app.ui.favourites.indexOf(part.id);
    if (i >= 0) app.ui.favourites.splice(i, 1);
    else app.ui.favourites.unshift(part.id);
    app.saveUiPrefs();
    fav.replaceChildren(icon(app.ui.favourites.includes(part.id) ? 'star' : 'starOutline', 16));
  });
  node.append(fav);

  tap(node, () => {
    if (earnedLocked) { toast('That one has to be earned.', 'bad'); return; }
    if (locked) { toast(`${part.name} unlocks at level ${part.level}.`, 'bad'); return; }
    app.holdPart(part.id);
    app.sheets.close('drawer');
    app.enterBuild();
    toast(`Holding ${part.name}`);
  });
  return node;
}

// ===========================================================================
// 4. WALLET
// ===========================================================================
export function openWallet(app) {
  app.sheets.open('wallet', {
    title: 'Wallet',
    sub: 'Every credit in and out',
    full: true,
    render: (body) => {
      const st = app.state;
      body.append(el('div.card', {},
        el('div.tiny.dim', { text: 'BALANCE' }),
        el('div', { style: { fontSize: '34px', fontWeight: '900', color: 'var(--coin)' }, text: `${fmtCredits(st.credits)} cr` }),
        el('div.row', { style: { marginTop: '10px', gap: '6px' } },
          el('span.chip', {}, `${st.s.lots.length} lots held`),
          el('span.chip', {}, `${fmtCredits(app.world.totalUpkeep())} cr/day upkeep`))));

      // upkeep
      const nextCharge = (st.s.lastUpkeepAt || Date.now()) + CONFIG.economy.upkeepIntervalHours * 3600e3;
      body.append(el('div.card', {},
        el('div.row', {}, el('b', { text: 'Upkeep' }), el('span.spacer'),
          el('span.chip', { text: `next ${fmtWhen(nextCharge)}` })),
        ...st.s.lots.map((l, i) => el('div.kv', {},
          el('span', { text: l.name }),
          el('b', { text: `${lotUpkeep(i)} cr` })))));

      // income breakdown
      const since = Date.now() - 7 * 86400e3;
      const bd = st.incomeBreakdown(since);
      const rows = Object.entries(bd).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      body.append(el('div.card', {},
        el('b', { text: 'Last 7 days' }),
        rows.length
          ? el('div', {}, ...rows.map(([k, v]) => el('div.kv', {},
            el('span', { text: LEDGER_LABEL[k] || k }),
            el('b', { style: { color: v >= 0 ? 'var(--good)' : 'var(--bad)' }, text: `${v >= 0 ? '+' : ''}${fmtCredits(v)}` }))))
          : el('div.dim.small', { style: { marginTop: '6px' }, text: 'Nothing yet.' })));

      // ledger
      body.append(el('div.tiny.dim', { style: { margin: '12px 0 6px' }, text: 'TRANSACTION LEDGER' }));
      const page = st.ledgerPage(0, 120);
      if (!page.length) {
        body.append(el('div.empty', {}, el('span.ico', {}, icon('ledger', 26)), 'No transactions yet.'));
      } else {
        for (const e of page) {
          body.append(el('div.list-item', {},
            el('div.txt', {},
              el('div.t1', { text: e.note || LEDGER_LABEL[e.type] || e.type }),
              el('div.t2', { text: `${LEDGER_LABEL[e.type] || e.type} · ${fmtRelative(e.t)}` })),
            el('b', { style: { color: e.amount >= 0 ? 'var(--good)' : 'var(--bad)' }, text: `${e.amount >= 0 ? '+' : ''}${fmtCredits(e.amount)}` })));
        }
      }
    },
  });
}

const LEDGER_LABEL = {
  build: 'Building', reward: 'Placement reward', refund: 'Refund', lot: 'Land',
  upkeep: 'Upkeep', daily: 'Daily login', milestone: 'Milestone', tip: 'Tips',
  visit: 'Visits', civic: 'Civic', grant: 'Grant', migrate: 'Opening balance',
  cheat: 'Test grant', shop: 'Shop',
};

// ===========================================================================
// 5. MY LOTS
// ===========================================================================
export function openMyLots(app) {
  app.sheets.open('lots', {
    title: 'My lots',
    sub: `${app.state.s.lots.length} of ${CONFIG.lots.maxHeld} held`,
    full: true,
    render: (body) => {
      const lots = app.world.ownedLots();
      if (!lots.length) {
        body.append(el('div.empty', {}, el('span.ico', {}, icon('pin', 26)),
          'You do not hold any lots yet. Tap a lot on the map to claim one.'));
        return;
      }
      lots.forEach((lot, i) => {
        const stage = CONFIG.economy.conditionStages[lot.condition || 0];
        const partCount = Object.keys(lot.parts || {}).length;
        const chipKind = (lot.condition || 0) === 0 ? 'good' : (lot.condition || 0) < 3 ? 'warn' : 'bad';
        const card = el('div.card', {},
          el('div.row', {},
            el('div', { style: { minWidth: 0 } },
              el('div', { style: { fontWeight: '800' }, text: lot.name }),
              el('div.tiny.dim', { text: app.city.addressOf(lot.parcel).full })),
            el('span.spacer'),
            el(`span.chip.${chipKind}`, { text: stage })),
          el('div.row.wrap', { style: { marginTop: '8px', gap: '6px' } },
            el('span.chip', { text: `${partCount} parts` }),
            el('span.chip', { text: `${lotUpkeep(i)} cr/day` }),
            el('span.chip', { text: fmtArea((lot.parcel.u1 - lot.parcel.u0) * (lot.parcel.v1 - lot.parcel.v0), app.state.settings.units === 'imperial') })),
          el('div.row', { style: { marginTop: '10px', gap: '6px' } },
            tap(el('button.btn.sm.primary', { text: 'Visit' }), () => {
              app.sheets.closeAll();
              app.focusLot(lot.parcelId);
            }),
            tap(el('button.btn.sm', { text: 'Rename' }), async () => {
              const n = await promptDialog('Rename lot', 'Lot name', lot.name);
              if (n) { lot.name = n; app.state.touch(); app.sheets.refresh('lots'); }
            }),
            (lot.condition || 0) > 0
              ? tap(el('button.btn.sm', { text: `Pay ${lotUpkeep(i)} cr` }), () => {
                const r = payUpkeepNow(app.state, i);
                if (!r.ok) toast(r.reason, 'bad');
                else { toast('Lot restored', 'good'); app.audio.coin(); app.sheets.refresh('lots'); }
              })
              : null,
            el('span.spacer'),
            tap(el('button.btn.sm.danger', { text: 'Release' }), async () => {
              const refund = Math.round(lotPrice(i) * CONFIG.economy.releaseRefund);
              const ok = await confirmDialog('Release this lot?',
                `Everything you built on ${lot.name} is removed and the original buildings come back. You get ${refund} credits.`,
                'Release');
              if (!ok) return;
              const r = app.world.release(lot.parcelId);
              if (!r.ok) toast(r.reason, 'bad');
              else { toast(`Released · +${refund} cr`, 'good'); app.afterLotChange(); app.sheets.refresh('lots'); }
            })));
        body.append(card);
      });

      // saved designs
      if (app.state.s.designs.length) {
        body.append(el('div.tiny.dim', { style: { margin: '14px 0 6px' }, text: 'SAVED DESIGNS' }));
        for (const d of app.state.s.designs) {
          body.append(el('div.list-item', {},
            el('div.txt', {},
              el('div.t1', { text: d.name }),
              el('div.t2', { text: `${d.count} parts · saved ${fmtRelative(d.savedAt)}` })),
            tap(el('button.btn.sm', { text: 'Stamp' }), () => {
              if (!app.activeLot) { toast('Open a lot first.', 'bad'); return; }
              const r = app.world.stampDesign(app.activeLot, d.id);
              if (!r.ok) toast(r.reason, 'bad');
              else {
                toast(`Stamped ${r.placed} parts${r.skipped ? `, ${r.skipped} did not fit` : ''}`, 'good');
                app.audio.place(); app.refreshLots(); app.sheets.close('lots');
              }
            })));
        }
      }
    },
  });
}

// ===========================================================================
// 6. SITE CARD
// ===========================================================================
export function openSiteCard(app, info) {
  const imperial = app.state.settings.units === 'imperial';
  app.sheets.open('site', {
    title: info.kind === 'parcel' ? 'Site' : titleCase(info.kind),
    sub: info.place || '',
    render: (body) => {
      if (info.kind !== 'parcel') {
        body.append(el('div.sitecard', {},
          el('div.addr', { text: info.name }),
          el('div.where', { text: info.kind === 'landmark' ? `${Math.round(info.height)} m tall · not buildable` : 'Not buildable' })));
        body.append(el('p.muted.small', { style: { lineHeight: '1.5' } },
          info.kind === 'park' ? 'Parks are public land. The buildable grid never falls across one.'
            : info.kind === 'water' ? 'Open water.'
              : info.kind === 'rail' ? 'The rail corridor into Union Station.'
                : info.kind === 'landmark' ? 'A real Toronto landmark. It stays as it is.'
                  : 'Streets and public land cannot be built on.'));
        return;
      }

      const owned = info.owned;
      body.append(el('div.sitecard', {},
        el('div.addr', { text: info.address }),
        el('div.where', { text: [info.place, info.nearest].filter(Boolean).join(' · ') }),
        el('div.facts', {},
          fact('Frontage', fmtLength(info.widthM, imperial)),
          fact('Depth', fmtLength(info.depthM, imperial)),
          fact('Area', fmtArea(info.areaM2, imperial)),
          fact('Standing', info.standing),
          fact('Price', owned ? 'Held by you' : `${fmtCredits(info.price)} cr`),
          fact('Upkeep', owned ? `${lotUpkeep(app.state.s.lots.findIndex((l) => l.parcelId === info.parcel.id))} cr/day` : `${info.upkeep} cr/day`))));

      body.append(el('div.tiny.dim', { style: { marginTop: '10px' }, text: formatLatLon(info.u, info.v) }));
    },
    footer: (foot) => {
      if (info.kind !== 'parcel') {
        foot.append(tap(el('button.btn', { text: 'Look at it' }), () => {
          app.sheets.close('site');
          app.cam.frame(info.u, info.v, 90, app.cam.tHeading, 0.5);
        }));
        return;
      }
      if (info.owned) {
        foot.append(
          tap(el('button.btn', { text: 'Frame lot' }), () => {
            app.sheets.close('site'); app.focusLot(info.parcel.id);
          }),
          tap(el('button.btn.primary', { text: 'Build here' }), () => {
            app.sheets.close('site'); app.focusLot(info.parcel.id); app.enterBuild();
          }));
      } else {
        const price = info.price;
        const canAfford = app.state.credits >= price;
        foot.append(
          tap(el('button.btn', { text: 'Close' }), () => app.sheets.close('site')),
          tap(el('button.btn.primary', {
            text: `Claim & demolish · ${fmtCredits(price)} cr`,
            disabled: !canAfford,
          }), async () => {
            const ok = await confirmDialog('Claim this lot?',
              `${info.address}. What stands there now (${info.standing}) is demolished and the ground is cleared for you to build on. This costs ${fmtCredits(price)} credits and ${info.upkeep} credits a day in upkeep.`,
              'Claim it');
            if (!ok) return;
            const r = app.world.claim(info.parcel);
            if (!r.ok) { toast(r.reason, 'bad'); return; }
            app.audio.claim();
            toast('Lot claimed and cleared', 'good');
            app.sheets.close('site');
            app.afterLotChange();
            app.focusLot(info.parcel.id);
            app.enterBuild();
          }));
        if (!canAfford) {
          foot.querySelector('.btn.primary').textContent = `Need ${fmtCredits(price - app.state.credits)} more`;
        }
      }
    },
  });
}

function fact(k, v) {
  return el('div.fact', {}, el('div.k', { text: k }), el('div.v', { text: String(v) }));
}
function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ===========================================================================
// 7. PROFILE
// ===========================================================================
export function openProfile(app) {
  app.sheets.open('profile', {
    title: 'Profile',
    full: true,
    render: (body) => {
      const st = app.state;
      const p = st.s.profile;
      const xp = st.xpIntoLevel();

      const av = el('div', { style: { width: '84px', height: '84px', flex: '0 0 auto' } });
      av.append(avatarChip(p.avatar, 84));

      body.append(el('div.card', {},
        el('div.row', { style: { gap: '12px' } }, av,
          el('div', { style: { minWidth: 0 } },
            el('div', { style: { fontSize: 'var(--fs-xl)', fontWeight: '900' }, text: p.name }),
            el('div.small.muted', { text: p.townName }),
            el('div.row', { style: { marginTop: '6px', gap: '5px' } },
              el('span.chip', { text: `Level ${st.level}` }),
              p.founder ? el('span.chip.good', {}, icon('star', 13), el('span', { text: 'Founder' })) : null))),
        el('div', { style: { marginTop: '12px' } },
          el('div.row.tiny.dim', {}, el('span', { text: 'XP' }), el('span.spacer'),
            el('span', { text: xp.atMax ? 'Max level' : `${xp.into} / ${xp.need}` })),
          el('div.bar', { style: { marginTop: '4px' } }, el('i', { style: { width: `${Math.round((xp.into / xp.need) * 100)}%` } }))),
        el('div.tiny.dim', { style: { marginTop: '6px' }, text: 'XP comes only from building.' })));

      body.append(el('div.card', {},
        el('b', { text: 'Record' }),
        el('div.kv', {}, el('span', { text: 'Parts placed' }), el('b', { text: String(st.s.stats.placed) })),
        el('div.kv', {}, el('span', { text: 'Parts removed' }), el('b', { text: String(st.s.stats.erased) })),
        el('div.kv', {}, el('span', { text: 'Part types used' }), el('b', { text: `${st.s.stats.partTypes.length} / ${allParts().length}` })),
        el('div.kv', {}, el('span', { text: 'Lots held' }), el('b', { text: String(st.s.lots.length) })),
        el('div.kv', {}, el('span', { text: 'Visits received' }), el('b', { text: String(st.s.social.visitsReceived) })),
        el('div.kv', {}, el('span', { text: 'Milestones' }), el('b', { text: `${st.s.milestones.filter((m) => MILESTONES.some((x) => x.id === m)).length} / ${MILESTONES.length}` })),
        el('div.kv', {}, el('span', { text: 'Playing since' }), el('b', { text: new Date(st.s.createdAt).toLocaleDateString('en-CA') }))));

      body.append(el('div.row', { style: { gap: '6px', marginTop: '10px' } },
        tap(el('button.btn', { text: 'Rename' }), async () => {
          const n = await promptDialog('Your name', 'Builder name', p.name);
          if (n) { p.name = n; st.touch(); app.sheets.refresh('profile'); }
        }),
        tap(el('button.btn', { text: 'Rename town' }), async () => {
          const n = await promptDialog('Town name', 'Town name', p.townName);
          if (n) { p.townName = n; st.touch(); app.sheets.refresh('profile'); }
        }),
        tap(el('button.btn', { text: 'Avatar' }), () => openAvatarEditor(app))));
    },
  });
}

// ===========================================================================
// 8. AVATAR EDITOR
// ===========================================================================
export function openAvatarEditor(app) {
  let view = null;
  app.sheets.open('avatar', {
    title: 'Avatar',
    sub: 'Every part is yours to colour',
    full: true,
    onClose: () => { view?.dispose(); view = null; },
    render: (body) => {
      const av = app.state.s.profile.avatar;
      const canvas = el('canvas');
      const stage = el('div.avatar-stage', {}, canvas);
      body.append(stage);
      view?.dispose();
      view = new AvatarView(canvas);
      view.set(av);
      view.start();

      const rerender = () => { view.set(av); app.state.touch(); };

      const pickRow = (label, key, names) => {
        const row = el('div.part-pick');
        names.forEach((nm, i) => {
          const b = el(`div.p${av[key] === i ? '.on' : ''}`, { text: nm });
          tap(b, () => {
            av[key] = i;
            [...row.children].forEach((c) => c.classList.remove('on'));
            b.classList.add('on');
            rerender();
          });
          row.append(b);
        });
        return el('div', { style: { marginTop: '10px' } },
          el('div.tiny.dim', { style: { marginBottom: '4px' }, text: label.toUpperCase() }), row);
      };

      body.append(
        pickRow('Body', 'body', BODY_NAMES),
        pickRow('Head', 'head', HEAD_NAMES),
        pickRow('Hair', 'hair', HAIR_NAMES),
        pickRow('Hat', 'hat', HAT_NAMES),
        pickRow('Face', 'face', FACE_NAMES));

      body.append(el('div.tiny.dim', { style: { margin: '14px 0 6px' }, text: 'COLOURS' }));
      for (const zone of AVATAR_ZONES) {
        const swatch = el('input', {
          type: 'color', value: av.colors[zone] || '#cccccc',
          oninput: (e) => { av.colors[zone] = e.target.value; rerender(); },
        });
        body.append(el('div.setting', {},
          el('div.lbl', { text: titleCase(zone) }), swatch));
      }
    },
  });
}

// ===========================================================================
// 9. DISCOVER  +  10. VISIT
// ===========================================================================
export function openDiscover(app) {
  app.sheets.open('discover', {
    title: 'Discover',
    sub: 'Towns worth a look',
    full: true,
    render: (body) => {
      const list = [...app.neighbours].sort((a, b) => b.partCount - a.partCount);
      for (const nb of list) {
        const av = el('div.av'); av.append(avatarChip(nb.avatar, 40));
        const item = el('div.list-item', {}, av,
          el('div.txt', {},
            el('div.t1', { text: nb.town }),
            el('div.t2', { text: `${nb.name} · Level ${nb.level} · ${nb.partCount} parts` }),
            el('div.t2.dim', { text: nb.blurb })),
          tap(el('button.btn.sm.primary', { text: 'Visit' }), () => openVisit(app, nb)));
        body.append(item);
      }
    },
  });
}

export function openVisit(app, nb) {
  const parcel = app.city.parcelById(nb.parcelId);
  app.sheets.closeAll();
  app.visitNeighbour(nb);

  app.sheets.open('visit', {
    title: nb.town,
    sub: `${nb.name} · read only`,
    render: (body) => {
      body.append(el('div.card', {},
        el('div.small.muted', { text: nb.blurb }),
        el('div.row.wrap', { style: { marginTop: '8px', gap: '6px' } },
          el('span.chip', { text: `Level ${nb.level}` }),
          el('span.chip', { text: `${nb.partCount} parts` }),
          el('span.chip', { text: parcel ? app.city.addressOf(parcel).full : '' }))));

      const notes = app.state.s.social.notes[nb.id] || [];
      if (notes.length) {
        body.append(el('div.tiny.dim', { style: { margin: '12px 0 5px' }, text: 'NOTES ON THIS TOWN' }));
        for (const n of notes.slice(-5)) {
          body.append(el('div.card', {},
            el('div.small', { text: n.text }),
            el('div.tiny.dim', { style: { marginTop: '4px' }, text: `${n.from} · ${fmtRelative(n.t)}` })));
        }
      }
      body.append(el('p.tiny.dim', { style: { marginTop: '14px', lineHeight: '1.5' },
        text: 'You are a guest here. Nothing you do can change this lot.' }));
    },
    footer: (foot) => {
      foot.append(
        tap(el('button.btn', {}, icon('message', 18), el('span', { text: 'Note' })), async () => {
          const t = await promptDialog('Leave a note', 'Say something kind');
          if (!t) return;
          (app.state.s.social.notes[nb.id] ||= []).push({ from: app.state.s.profile.name, text: t, t: Date.now() });
          app.state.touch();
          toast('Note left', 'good');
          app.sheets.refresh('visit');
        }),
        tap(el('button.btn.primary', {}, icon('coin', 18), el('span', { text: `Tip ${CONFIG.economy.tipGiven}` })), () => {
          const r = tip(app.state, nb);
          if (!r.ok) { toast(r.reason, 'bad'); return; }
          app.audio.coin();
          toast(`Tipped ${nb.name} · +${CONFIG.economy.tipGiven} cr to you`, 'good');
          // they come back and visit you
          setTimeout(() => {
            const v = receiveVisit(app.state, nb.name);
            if (v.ok) toast(`${nb.name} visited your town · +${CONFIG.economy.visitReward} cr`, 'good');
          }, 2600);
        }),
        tap(el('button.btn', { text: 'Return' }), () => {
          app.sheets.close('visit');
          app.endVisit();
        }));
    },
    onClose: () => app.endVisit(),
  });
}

// ===========================================================================
// 11. FRIENDS
// ===========================================================================
export function openFriends(app) {
  app.sheets.open('friends', {
    title: 'Friends',
    full: true,
    render: (body) => {
      const friends = app.state.s.social.friends;
      const friendSet = new Set(friends);

      body.append(el('div.tiny.dim', { style: { marginBottom: '6px' }, text: `YOUR FRIENDS (${friends.length})` }));
      if (!friends.length) {
        body.append(el('div.empty', {}, el('span.ico', {}, icon('friends', 26)), 'No friends yet. Add someone below.'));
      }
      for (const id of friends) {
        const nb = app.neighbours.find((n) => n.id === id);
        if (!nb) continue;
        const av = el('div.av'); av.append(avatarChip(nb.avatar, 40));
        body.append(el('div.list-item', {}, av,
          el('div.txt', {},
            el('div.t1', { text: nb.name }),
            el('div.t2', { text: `${nb.town} · currently in ${app.city.neighbourhoodAt(...neighbourPos(app, nb))}` })),
          tap(el('button.btn.sm', { text: 'Visit' }), () => openVisit(app, nb)),
          tap(el('button.btn.sm.danger', { 'aria-label': 'Remove' }, icon('close', 16)), () => {
            app.state.s.social.friends = friends.filter((f) => f !== id);
            app.state.touch(); app.sheets.refresh('friends');
          })));
      }

      body.append(el('div.tiny.dim', { style: { margin: '16px 0 6px' }, text: 'SUGGESTIONS' }));
      const suggestions = app.neighbours.filter((n) => !friendSet.has(n.id)).slice(0, CONFIG.social.friendSuggestions);
      for (const nb of suggestions) {
        const av = el('div.av'); av.append(avatarChip(nb.avatar, 40));
        body.append(el('div.list-item', {}, av,
          el('div.txt', {},
            el('div.t1', { text: nb.name }),
            el('div.t2', { text: `${nb.town} · Level ${nb.level}` })),
          tap(el('button.btn.sm.primary', { text: 'Add' }), () => {
            friends.push(nb.id); app.state.touch();
            toast(`${nb.name} added`, 'good');
            app.sheets.refresh('friends');
          })));
      }
    },
  });
}

function neighbourPos(app, nb) {
  const p = app.city.parcelById(nb.parcelId);
  return p ? [(p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2] : [0, 0];
}

// ===========================================================================
// 12. MESSAGES
// ===========================================================================
export function openMessages(app, focusId = null) {
  let open = focusId;
  app.sheets.open('messages', {
    title: 'Messages',
    full: true,
    render: (body) => {
      const threads = app.state.s.social.threads;
      if (open) {
        const nb = app.neighbours.find((n) => n.id === open);
        const msgs = threads[open] || [];
        body.append(el('div.row', { style: { marginBottom: '10px' } },
          tap(el('button.btn.sm', { text: '‹ All' }), () => { open = null; app.sheets.refresh('messages'); }),
          el('b', { style: { marginLeft: '6px' }, text: nb?.name || 'Thread' })));
        const thread = el('div.thread');
        for (const m of msgs) {
          thread.append(el(`div.msg.${m.from === 'me' ? 'me' : 'them'}`, {},
            m.from === 'me' ? null : el('div.who', { text: nb?.name || '' }),
            m.text));
        }
        body.append(thread);
        const input = el('input', { placeholder: 'Message…', maxlength: 200 });
        const send = () => {
          const t = input.value.trim();
          if (!t) return;
          (threads[open] ||= []).push({ from: 'me', text: t, t: Date.now() });
          input.value = '';
          app.state.touch();
          app.sheets.refresh('messages');
          // a simulated reply
          setTimeout(() => {
            (threads[open] ||= []).push({ from: open, text: randomNote(t.length * 977 + open.length), t: Date.now(), unread: true });
            app.state.touch();
            if (app.sheets.isOpen('messages')) app.sheets.refresh('messages');
            else toast(`${nb?.name} replied`);
          }, 1500 + Math.random() * 1800);
        };
        body.append(el('div.composer', { style: { marginTop: '12px' } },
          input, tap(el('button.btn.primary', { text: 'Send' }), send)));
        setTimeout(() => { body.scrollTop = body.scrollHeight; }, 30);
        // mark read
        for (const m of msgs) delete m.unread;
        return;
      }

      const ids = Object.keys(threads);
      const others = app.neighbours.filter((n) => !ids.includes(n.id)).slice(0, 8);
      if (!ids.length) body.append(el('div.empty', {}, el('span.ico', {}, icon('message', 26)), 'No threads yet. Start one below.'));
      for (const id of ids) {
        const nb = app.neighbours.find((n) => n.id === id);
        if (!nb) continue;
        const msgs = threads[id];
        const last = msgs[msgs.length - 1];
        const unread = msgs.some((m) => m.unread);
        const av = el('div.av'); av.append(avatarChip(nb.avatar, 40));
        body.append(tap(el('div.list-item', {}, av,
          el('div.txt', {},
            el('div.t1', { text: nb.name }),
            el('div.t2', { text: last ? `${last.from === 'me' ? 'You: ' : ''}${last.text}` : '' })),
          unread ? el('span.chip.good', { text: 'New' }) : el('span.tiny.dim', { text: last ? fmtRelative(last.t) : '' })),
        () => { open = id; app.sheets.refresh('messages'); }));
      }
      if (others.length) {
        body.append(el('div.tiny.dim', { style: { margin: '14px 0 6px' }, text: 'START A THREAD' }));
        for (const nb of others) {
          const av = el('div.av'); av.append(avatarChip(nb.avatar, 40));
          body.append(tap(el('div.list-item', {}, av,
            el('div.txt', {}, el('div.t1', { text: nb.name }), el('div.t2', { text: nb.town })),
            el('span.chip', { text: 'Message' })),
          () => { threads[nb.id] ||= []; open = nb.id; app.state.touch(); app.sheets.refresh('messages'); }));
        }
      }
    },
  });
}

// ===========================================================================
// 13. SHOP  (cosmetics only)
// ===========================================================================
const SHOP_ITEMS = [
  { id: 'hat-hard', name: 'Hard hat', desc: 'An avatar hat.', price: 250, kind: 'Avatar hat' },
  { id: 'hat-brim', name: 'Wide-brim hat', desc: 'An avatar hat.', price: 250, kind: 'Avatar hat' },
  { id: 'hair-curls', name: 'Curls', desc: 'An avatar hairstyle.', price: 200, kind: 'Avatar hair' },
  { id: 'title-founder', name: '"Founding Resident" title', desc: 'Shown on your profile.', price: 600, kind: 'Title' },
  { id: 'title-lakeside', name: '"Lakeside" title', desc: 'Shown on your profile.', price: 600, kind: 'Title' },
  { id: 'plaque-brass', name: 'Brass town plaque', desc: 'Decorates your town name.', price: 480, kind: 'Plaque' },
  { id: 'swatch-deep', name: 'Deep colour pack', desc: 'Extra swatches in the colour picker.', price: 340, kind: 'Colours' },
  { id: 'swatch-pastel', name: 'Pastel colour pack', desc: 'Extra swatches in the colour picker.', price: 340, kind: 'Colours' },
];

export function openShop(app) {
  app.sheets.open('shop', {
    title: 'Shop',
    sub: 'Cosmetics only — nothing here affects gameplay',
    full: true,
    render: (body) => {
      const owned = (app.state.s.shopOwned ||= []);
      body.append(el('div.card', {},
        el('div.small.muted', { style: { lineHeight: '1.5' },
          text: 'Everything in the shop is cosmetic and priced in credits you earn by building. There are no real-money purchases, no loot boxes, and nothing here confers any advantage.' })));
      for (const it of SHOP_ITEMS) {
        const has = owned.includes(it.id);
        body.append(el('div.list-item', {},
          el('div.txt', {},
            el('div.t1', { text: it.name }),
            el('div.t2', { text: `${it.kind} · ${it.desc}` })),
          el('span.chip', { text: 'Cosmetic' }),
          has
            ? el('span.chip.good', { text: 'Owned' })
            : tap(el('button.btn.sm.primary', { text: `${it.price} cr` }), () => {
              const r = app.state.commit({
                entries: [{ type: 'shop', amount: -it.price, note: it.name }],
                apply: (st) => { (st.s.shopOwned ||= []).push(it.id); },
              });
              if (!r.ok) { toast(r.reason, 'bad'); return; }
              app.audio.coin();
              toast(`${it.name} unlocked`, 'good');
              app.sheets.refresh('shop');
            })));
      }
    },
  });
}

// ===========================================================================
// 14. CIVIC BOARD
// ===========================================================================
export function openCivic(app) {
  app.sheets.open('civic', {
    title: 'Civic board',
    sub: 'Shared projects on real Toronto streets',
    full: true,
    render: (body) => {
      const locked = app.state.level < CONFIG.economy.civicUnlockLevel;
      if (locked) {
        body.append(el('div.card', {},
          el('b', { text: `Unlocks at level ${CONFIG.economy.civicUnlockLevel}` }),
          el('div.small.muted', { style: { marginTop: '4px' }, text: `You are level ${app.state.level}. Keep building.` })));
      }
      for (const proj of CIVIC_PROJECTS) {
        const pr = civicProgress(app.state, proj);
        const part = getPart(proj.item);
        const contributors = civicContributors(app.state, proj, app.neighbours);
        const card = el('div.card', {},
          el('div.row', {},
            el('div', { style: { minWidth: 0 } },
              el('div', { style: { fontWeight: '800' }, text: proj.name }),
              el('div.tiny.dim', { text: proj.desc })),
            el('span.spacer'),
            pr.complete ? el('span.chip.good', {}, icon('check', 13), el('span', { text: 'Done' })) : el('span.chip', { text: `${pr.given}/${pr.target}` })),
          el('div.bar', { style: { marginTop: '9px' } }, el('i', { style: { width: `${Math.round(pr.pct * 100)}%` } })),
          el('div.row', { style: { marginTop: '9px', gap: '6px' } },
            el('span.chip', { text: `Needs ${part?.name || proj.item}` }),
            el('span.chip', { text: `${part?.cost || 0} cr each` }),
            el('span.spacer'),
            pr.complete ? null : tap(el('button.btn.sm.primary', { text: 'Contribute', disabled: locked }), () => {
              const r = contributeCivic(app.state, proj, 1);
              if (!r.ok) { toast(r.reason, 'bad'); return; }
              app.audio.coin();
              toast(`Contributed to ${proj.name}`, 'good');
              app.refreshCivic();
              app.sheets.refresh('civic');
            })),
          contributors.length
            ? el('div.row.wrap', { style: { marginTop: '9px', gap: '5px' } },
              el('span.tiny.dim', { text: 'Contributors:' }),
              ...contributors.map((c) => el(`span.chip${c.you ? '.good' : ''}`, { text: `${c.name} ×${c.count}` })))
            : null,
          tap(el('button.btn.sm', { style: { marginTop: '9px' }, text: 'Show me where' }), () => {
            app.sheets.close('civic');
            app.cam.frame(proj.where.u, proj.where.v, 170, app.cam.tHeading, 0.55);
          }));
        body.append(card);
      }
    },
  });
}

// ===========================================================================
// 15. MAP / PLACES
// ===========================================================================
export function openPlaces(app) {
  app.ui.placeQuery ||= '';
  app.sheets.open('places', {
    title: 'Map & places',
    sub: 'Search every street and named place',
    full: true,
    render: (body) => {
      const results = el('div');
      const search = el('input.search', {
        type: 'search', placeholder: 'Street or place name…', value: app.ui.placeQuery,
        oninput: (e) => { app.ui.placeQuery = e.target.value; draw(); },
      });
      body.append(search, el('div', { style: { height: '10px' } }), results);

      const draw = () => {
        clear(results);
        const q = app.ui.placeQuery.trim();
        const list = q ? app.city.searchPlaces(q, 60) : defaultPlaces(app);
        if (!list.length) {
          results.append(el('div.empty', {}, el('span.ico', {}, icon('places', 26)), 'Nothing found.'));
          return;
        }
        for (const r of list) {
          results.append(tap(el('div.list-item', {},
            el('div', { style: { fontSize: '19px', width: '26px', textAlign: 'center' },
              }, icon(r.kind === 'street' ? 'road' : r.kind === 'landmark' ? 'skyline' : 'pin', 20)),
            el('div.txt', {},
              el('div.t1', { text: r.name }),
              el('div.t2', { text: `${titleCase(r.sub || r.kind)}` })),
            el('span.chip', { text: 'Jump to' })),
          () => {
            app.sheets.close('places');
            app.cam.frame(r.u, r.v, r.kind === 'street' ? 420 : 220, app.cam.tHeading, 0.52);
            toast(r.name);
          }));
        }
      };
      draw();
    },
  });
}

function defaultPlaces(app) {
  return app.city.places
    .filter((p) => ['landmark', 'square', 'neighbourhood', 'park'].includes(p.kind))
    .slice(0, 40)
    .map((p) => ({ kind: 'place', name: p.name, sub: p.kind, u: p.u, v: p.v }));
}

// ===========================================================================
// 16. SETTINGS
// ===========================================================================
export function openSettings(app) {
  app.sheets.open('settings', {
    title: 'Settings',
    full: true,
    render: (body) => {
      const s = app.state.settings;
      const set = (k) => (v) => app.applySetting(k, v);

      body.append(el('div.tiny.dim', { text: 'TIME OF DAY' }));
      body.append(el('div.card', {},
        selectRow('Mode', s.timeMode, [
          ['clock', 'Follow the real clock'],
          ['accelerated', 'Accelerated in-game day'],
          ['manual', 'Manual override'],
        ], set('timeMode')),
        slider('Hour', s.manualHour, 0, 23.9, 0.1, set('manualHour'),
          (v) => `${String(Math.floor(v)).padStart(2, '0')}:${String(Math.floor((v % 1) * 60)).padStart(2, '0')}`),
        el('div.tiny.dim', { text: `Season: ${app.seasonName()} (from the real calendar)` })));

      body.append(el('div.tiny.dim', { style: { marginTop: '14px' }, text: 'SOUND' }));
      body.append(el('div.card', {},
        toggle('Sound effects', s.sound, set('sound')),
        slider('Effects volume', s.volumeSfx, 0, 1, 0.05, set('volumeSfx'), (v) => `${Math.round(v * 100)}%`),
        toggle('Music', s.music, set('music')),
        slider('Music volume', s.volumeMusic, 0, 1, 0.05, set('volumeMusic'), (v) => `${Math.round(v * 100)}%`),
        toggle('Haptics', s.haptics, set('haptics'))));

      body.append(el('div.tiny.dim', { style: { marginTop: '14px' }, text: 'GRAPHICS' }));
      body.append(el('div.card', {},
        selectRow('Quality', s.quality, [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], set('quality')),
        toggle('Weather', s.weather, set('weather'), 'Light rain and snow with the season'),
        toggle('Property borders', s.showBorders, set('showBorders')),
        toggle('Street names', s.showStreetNames, set('showStreetNames')),
        toggle('Place names', s.showPlaceNames, set('showPlaceNames'))));

      body.append(el('div.tiny.dim', { style: { marginTop: '14px' }, text: 'BUILDING' }));
      body.append(el('div.card', {},
        toggle('Grid snap', s.gridSnap, set('gridSnap')),
        slider('Snap strength', s.snapStrength, 0.2, 1, 0.05, set('snapStrength'), (v) => `${Math.round(v * 100)}%`)));

      body.append(el('div.tiny.dim', { style: { marginTop: '14px' }, text: 'CAMERA' }));
      body.append(el('div.card', {},
        toggle('Invert horizontal', s.invertX, set('invertX')),
        toggle('Invert vertical', s.invertY, set('invertY')),
        slider('Sensitivity', s.sensitivity, 0.4, 2, 0.05, set('sensitivity'), (v) => `${v.toFixed(2)}×`)));

      body.append(el('div.tiny.dim', { style: { marginTop: '14px' }, text: 'ACCESSIBILITY' }));
      body.append(el('div.card', {},
        toggle('Large text', s.largeText, set('largeText')),
        toggle('High contrast', s.highContrast, set('highContrast')),
        toggle('Reduced motion', s.reducedMotion, set('reducedMotion'), 'Turns off camera easing and transitions'),
        toggle('Left-handed layout', s.leftHanded, set('leftHanded'), 'Mirrors the HUD'),
        selectRow('Units', s.units, [['metric', 'Metric'], ['imperial', 'Imperial']], set('units'))));

      body.append(el('div.tiny.dim', { style: { marginTop: '14px' }, text: 'SAVE' }));
      body.append(el('div.card', {},
        el('div.kv', {}, el('span', { text: 'Save size' }), el('b', { text: `${(app.state.saveSize / 1024).toFixed(1)} KB` })),
        el('div.row', { style: { marginTop: '10px', gap: '6px', flexWrap: 'wrap' } },
          tap(el('button.btn.sm', {}, icon('down', 17), el('span', { text: 'Export' })), () => exportSave(app)),
          tap(el('button.btn.sm', {}, icon('up', 17), el('span', { text: 'Import' })), () => importSave(app)),
          tap(el('button.btn.sm.danger', { text: 'Reset save' }), async () => {
            const ok = await confirmDialog('Reset everything?',
              'Your lots, your builds, your credits and your progress are all erased. This cannot be undone.', 'Erase it all');
            if (!ok) return;
            app.state.resetSave();
            toast('Save reset');
          }))));

      body.append(el('div.tiny.dim', { style: { marginTop: '14px' }, text: 'TESTING' }));
      body.append(el('div.card', {},
        el('div.small.muted', { style: { lineHeight: '1.5' },
          text: 'So the whole kit can be tested end to end, this jumps you to maximum level with a large balance. It is a testing convenience, not a purchase.' }),
        tap(el('button.btn.sm', { style: { marginTop: '9px' } }, icon('lockOpen', 17), el('span', { text: 'Max level + 500,000 cr' })), () => {
          app.state.commit({
            entries: [{ type: 'cheat', amount: 500000, note: 'Testing grant' }],
            apply: (st) => {
              const need = Math.max(0, xpForMax() - st.s.profile.xp);
              st.s.profile.xp += need;
            },
          });
          app.audio.levelUp();
          toast('Max level, 500,000 credits', 'good');
          app.sheets.refreshAll();
        })));
    },
  });
}

function xpForMax() {
  let total = 0;
  for (let i = 2; i <= CONFIG.progression.maxLevel; i++) {
    total += Math.round(CONFIG.progression.xpBase * Math.pow(i - 1, CONFIG.progression.xpExp));
  }
  return total;
}

function exportSave(app) {
  const text = app.state.exportSave();
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `toronto-builder-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Save exported', 'good');
}

function importSave(app) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      app.state.importSave(text);
      toast('Save imported', 'good');
    } catch (e) {
      toast(`Import failed: ${e.message}`, 'bad');
    }
  };
  input.click();
}

// ===========================================================================
// 17. MILESTONES
// ===========================================================================
export function openMilestones(app) {
  app.sheets.open('milestones', {
    title: 'Milestones',
    sub: `${app.state.s.milestones.filter((m) => MILESTONES.some((x) => x.id === m)).length} of ${MILESTONES.length} unlocked`,
    full: true,
    render: (body) => {
      for (const m of MILESTONES) {
        const done = app.state.s.milestones.includes(m.id);
        body.append(el('div.list-item', {},
          el('div', { style: { width: '30px', display: 'flex', justifyContent: 'center', color: done ? 'var(--accent-deep)' : 'var(--ink-3)' } }, icon(done ? 'milestone' : 'lockClosed', 21)),
          el('div.txt', {},
            el('div.t1', { text: m.name }),
            el('div.t2', { text: m.desc })),
          el(`span.chip${done ? '.good' : ''}`, { text: done ? 'Unlocked' : `${m.reward} cr` })));
      }
      body.append(el('p.tiny.dim', { style: { marginTop: '14px', lineHeight: '1.5' },
        text: 'Every payout is flat and known in advance. There is no randomness in any reward.' }));
    },
  });
}

// ===========================================================================
// 18. HELP / TUTORIAL
// ===========================================================================
export function openHelp(app) {
  app.sheets.open('help', {
    title: 'Help',
    full: true,
    render: (body) => {
      body.append(el('div.card', {},
        el('b', { text: 'Getting around' }),
        el('div.kv', {}, el('span', { text: 'One finger drag' }), el('b', { text: 'Orbit' })),
        el('div.kv', {}, el('span', { text: 'Two finger drag' }), el('b', { text: 'Pan' })),
        el('div.kv', {}, el('span', { text: 'Pinch' }), el('b', { text: 'Zoom' })),
        el('div.kv', {}, el('span', { text: 'Two finger twist' }), el('b', { text: 'Rotate' })),
        el('div.kv', {}, el('span', { text: 'Tap' }), el('b', { text: 'Select' })),
        el('div.kv', {}, el('span', { text: 'Tap and hold' }), el('b', { text: 'Context menu' })),
        el('div.kv', {}, el('span', { text: 'Drag in build mode' }), el('b', { text: 'Lay a run' }))));

      body.append(el('div.card', {},
        el('b', { text: 'Building' }),
        el('p.small.muted', { style: { lineHeight: '1.5' },
          text: 'Pick a part from the catalogue, then drag across your lot to lay a whole run of it in one gesture. Paint and erase work the same way. Walls go on edges, floors and objects go in cells, posts go on corners — the ghost shows you where it will land, and whether it is valid.' })));

      body.append(el('div.card', {},
        el('b', { text: 'Money' }),
        el('p.small.muted', { style: { lineHeight: '1.5' },
          text: 'Placing things is the biggest earner — you are paid to build. Lots cost credits up front and upkeep every day, and each extra lot costs more than the last. Undo is always free.' })));

      body.append(tap(el('button.btn.primary', { style: { width: '100%', marginTop: '12px' } }, icon('play', 18), el('span', { text: 'Replay the walkthrough' })),
        () => { app.sheets.closeAll(); app.startTutorial(true); }));
    },
  });
}

// ===========================================================================
// 19. ABOUT
// ===========================================================================
export function openAbout(app) {
  app.sheets.open('about', {
    title: 'About',
    full: true,
    render: (body) => {
      const st = app.stats();
      body.append(el('div.card', {},
        el('div.big', { text: 'Toronto Builder' }),
        el('div.small.muted', { text: `Version ${app.version}` }),
        el('p.small.muted', { style: { lineHeight: '1.55', marginTop: '10px' },
          text: 'A city builder on the real geography of downtown Toronto. The streets, the street names, the place names, the block structure and the named landmarks with their real heights are real. Everything else — every player, town, message, transaction, avatar and balance — is simulated on this device.' })));

      body.append(el('div.card', {},
        el('b', { text: 'By the numbers' }),
        ...Object.entries(st).map(([k, v]) => el('div.kv', {}, el('span', { text: k }), el('b', { text: String(v) })))));

      body.append(el('div.card', {},
        el('b', { text: 'Attribution' }),
        el('p.small.muted', { style: { lineHeight: '1.55' },
          text: 'Modular kit shapes are modelled in code for this project, informed by the structure of "Free 3D Modular Game Assets For Prototyping" by Raphael Gonçalves (Rgsdev), released under CC0 (public domain). No mesh from that pack ships in this page.' }),
        el('p.small.muted', { style: { lineHeight: '1.55' },
          text: '3D rendering by three.js, MIT licence, Copyright © 2010-2025 three.js authors.' }),
        el('p.small.muted', { style: { lineHeight: '1.55' },
          text: 'Toronto geography compiled from public knowledge of the city\'s street grid, block structure and landmarks. See the ATTRIBUTION file in the repository for the full account, including where this data falls short of a survey.' })));

      body.append(el('div.card', {},
        el('b', { text: 'Privacy' }),
        el('p.small.muted', { style: { lineHeight: '1.55' },
          text: 'This page makes no network requests once it has loaded. Your save lives in this browser\'s local storage and never leaves the device unless you export it yourself.' })));
    },
  });
}

// ===========================================================================
// CONTEXT MENU (tap and hold)
// ===========================================================================
export function openContextMenu(app, ctx) {
  app.sheets.open('context', {
    title: ctx.title,
    sub: ctx.sub,
    render: (body) => {
      for (const a of ctx.actions) {
        body.append(tap(el('div.list-item', {},
          el('div', { style: { width: '30px', display: 'flex', justifyContent: 'center', color: 'var(--accent-deep)' } }, icon(a.ico, 21)),
          el('div.txt', {}, el('div.t1', { text: a.label }),
            a.hint ? el('div.t2', { text: a.hint }) : null)),
        () => { app.sheets.close('context'); a.run(); }));
      }
    },
  });
}
