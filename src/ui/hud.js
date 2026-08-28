/**
 * The persistent HUD: balance and level, the compass, and the handful of
 * controls that must always be one tap away.
 *
 * It sits above the world but never over the build bar, and mirrors itself
 * for a left-handed layout.
 */

import { el, tap, fmtCredits } from './dom.js';
import { icon } from './icons.js';
import { headingToBearing, cardinal, NORTH_IN_GRID } from '../core/geo.js';

export class Hud {
  constructor(app, root) {
    this.app = app;
    this.root = root;

    this.credits = el('span', { text: '0' });
    this.level = el('span.lvl', { text: 'Lv 1' });
    this.xpBar = el('i', { style: { width: '0%' } });
    this.townPill = el('div.hud-pill', { style: { minWidth: 0 } },
      el('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: '' }));

    const top = el('div.hud-top', {},
      tap(el('div.hud-pill', { role: 'button', 'aria-label': 'Wallet' },
        el('span.coin', {}, icon('coin', 19)), this.credits), () => app.openWallet()),
      tap(el('div.hud-pill', { role: 'button', 'aria-label': 'Profile' },
        this.level,
        el('span.bar', { style: { width: '38px' } }, this.xpBar)), () => app.openProfile()),
      el('span.spacer'),
      tap(el('button.icon-btn', { 'aria-label': 'Menu' }, icon('menu', 22)), () => app.openMenu()));
    root.append(top);

    // --- right column ---
    this.needle = el('div.needle', {}, icon('compass', 26));
    this.cardinal = el('div.cardinal', { text: 'N' });
    const compass = tap(el('button.icon-btn.compass', { 'aria-label': 'Snap to north' },
      this.needle, this.cardinal), () => app.snapNorth());

    this.buildBtn = tap(el('button.icon-btn', { 'aria-label': 'Build mode' }, icon('build', 23)), () => app.toggleBuild());
    this.timeBtn = tap(el('button.icon-btn', { 'aria-label': 'Time of day' }, icon('sun', 22)), () => app.cycleTime());

    root.append(el('div.hud-right', {},
      compass,
      tap(el('button.icon-btn', { 'aria-label': 'Go to my site' }, icon('home', 22)), () => app.goHome()),
      this.buildBtn,
      tap(el('button.icon-btn', { 'aria-label': 'Zoom in' }, icon('zoomIn', 21)), () => app.cam.zoomBy(0.62)),
      tap(el('button.icon-btn', { 'aria-label': 'Zoom out' }, icon('zoomOut', 21)), () => app.cam.zoomBy(1.62)),
      this.timeBtn));

    // --- bottom left ---
    this.hint = el('div.hud-pill', { style: { display: 'none', fontWeight: '600' } });
    root.append(el('div.hud-bottom-left', {}, this.hint));

    this.perf = el('div#perf', { style: { display: 'none' } });
    root.append(this.perf);
  }

  setHint(text) {
    this.hint.style.display = text ? '' : 'none';
    if (text) this.hint.textContent = text;
  }

  setPerf(text) {
    this.perf.style.display = text ? '' : 'none';
    if (text) this.perf.textContent = text;
  }

  update() {
    const app = this.app;
    this.credits.textContent = fmtCredits(app.state.credits);
    this.level.textContent = `Lv ${app.state.level}`;
    const xp = app.state.xpIntoLevel();
    this.xpBar.style.width = `${Math.round((xp.into / xp.need) * 100)}%`;

    const bearing = headingToBearing(app.cam.heading);
    this.needle.style.transform = `rotate(${-bearing}deg)`;
    this.cardinal.textContent = cardinal(bearing);

    this.buildBtn.classList.toggle('on', app.mode === 'build');
    const night = app.stage ? app.stage.materials.scenery.userData.uniforms.uNight.value : 0;
    const want = night > 0.6 ? 'moon' : night > 0.2 ? 'dusk' : 'sun';
    if (this.timeBtn.dataset.phase !== want) {
      this.timeBtn.dataset.phase = want;
      this.timeBtn.replaceChildren(icon(want, 22));
    }
  }
}
