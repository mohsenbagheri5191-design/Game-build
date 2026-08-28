/**
 * Screenshots of every interface screen, for looking at.
 *
 * This exists because the interface shipped looking like a developer tool and
 * no test caught it — tests check behaviour, and "it looks unfinished" is not
 * a behaviour. Every visual defect fixed in this pass was found by opening
 * these images: three identical little house icons, part thumbnails on
 * near-black tiles, unreadable selected text, a truncated label, a button that
 * fell off the screen. All of it invisible in the code.
 *
 *   node build/shots-ui.mjs        -> dist/ui/
 */

import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
mkdirSync('dist/ui', { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome','/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
const b = await chromium.launch({ executablePath: exe, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:1.5, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+resolve('dist/index.html')+'?notut=1&t=10&q=medium',{waitUntil:'load',timeout:120000});
await p.waitForFunction('window.__ready===true',{timeout:240000});
await p.waitForTimeout(3000);
await p.evaluate(()=>{ const a=window.__app; a.state.commit({entries:[{type:'cheat',amount:400000,note:'shots'}],apply:st=>{st.s.profile.xp=200000;}});
  for(const m of ['founder','master-builder','civic-patron','lakeside']) if(!a.state.s.milestones.includes(m)) a.state.s.milestones.push(m); });
const screens = [
  ['wallet','openWallet'], ['lots','openMyLots'], ['profile','openProfile'],
  ['avatar','openAvatarEditor'], ['discover','openDiscover'], ['friends','openFriends'],
  ['messages','openMessages'], ['shop','openShop'], ['civic','openCivic'],
  ['places','openPlaces'], ['settings','openSettings'], ['milestones','openMilestones'],
  ['help','openHelp'], ['about','openAbout'],
];
for (const [name, fn] of screens) {
  await p.evaluate((f)=>{ window.__app.sheets.closeAll(); window.__screens[f](window.__app); }, fn);
  await p.waitForTimeout(650);
  await p.screenshot({ path:`dist/ui/s-${name}.png` });
}
await p.evaluate(()=>{ window.__app.sheets.closeAll(); const a=window.__app;
  window.__screens.openVisit(a, a.neighbours[0]); });
await p.waitForTimeout(800);
await p.screenshot({ path:'dist/ui/s-visit.png' });
console.log('errors:', errs.length?errs.slice(0,3):'none');
await b.close();
