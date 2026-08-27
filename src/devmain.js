// Development harness: city + stage + camera only, so the map can be looked
// at on its own before the game layers on top. Not part of the shipped page.
import * as THREE from 'three';
import { City } from './core/city.js';
import { Stage } from './render/stage.js';
import { ChunkManager } from './render/chunks.js';
import { TouchCamera } from './camera/controls.js';
import { NORTH_IN_GRID } from './core/geo.js';

const app = document.getElementById('app');
app.innerHTML = `<canvas id="c"></canvas><div id="hud"></div>`;
const canvas = document.getElementById('c');
const hud = document.getElementById('hud');

const city = new City();
await city.load((p, msg) => { hud.textContent = `${Math.round(p * 100)}% ${msg}`; });

const stage = new Stage(canvas);
const demolished = new Set();
const chunks = new ChunkManager(city, stage.scene, stage.materials, demolished);
const cam = new TouchCamera(stage.camera, canvas, city);

const q = new URLSearchParams(location.search);
stage.setQuality(q.get('q') || 'high');
chunks.setQuality(q.get('q') || 'high');
stage.setTimeOfDay(parseFloat(q.get('t') || '10.5'));

const view = q.get('view') || 'skyline';
const VIEWS = {
  // looking north from over the lake — the postcard skyline
  skyline:  [-700, -1900, 2400, 0.0, 0.13],
  downtown: [-240, 350, 900, 2.5, 0.40],
  street:   [-240, 500, 42, 2.5, 0.12],
  cntower:  [-811, -300, 620, 0.15, 0.22],
  city:     [-300, 900, 3200, 0.35, 0.42],
  block:    [-1000, 1300, 300, 0.9, 0.55],
  harbour:  [-600, -450, 500, 0.4, 0.22],
  yonge:    [0, 1400, 320, 3.1, 0.20],
};
const [u, v, d, h, p] = VIEWS[view] || VIEWS.skyline;
cam.frame(u, v, d, h, p, true);

let last = performance.now(), frames = 0, fpsT = 0, fps = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  cam.update(dt);
  chunks.update(stage.camera.position, dt, cam.dist);
  stage.setViewDistance(cam.dist);
  stage.updateShadowFocus(cam.focus);
  stage.setTimeOfDay(stage.timeOfDay);
  stage.render(dt);
  frames++; fpsT += dt;
  if (fpsT > 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
  hud.textContent = `${fps} fps · chunks ${chunks.loadedCount} (${chunks.pendingCount} queued) · ` +
    `dist ${Math.round(cam.dist)}m · ${city.parcelCount} lots · ${city.landmarks.length} landmarks · ` +
    `draws ${stage.renderer.info.render.calls} · tris ${(stage.renderer.info.render.triangles / 1000).toFixed(0)}k`;
  window.__ready = chunks.pendingCount === 0 && chunks.loadedCount > 0;
  window.__stats = () => ({
    fps, chunks: chunks.loadedCount, pending: chunks.pendingCount,
    want: chunks.wantCount, radius: Math.round(chunks.radius || 0),
    draws: stage.renderer.info.render.calls,
    tris: stage.renderer.info.render.triangles,
    avgChunkMs: +((chunks.stats.totalMs || 0) / Math.max(1, chunks.stats.built)).toFixed(1),
    maxChunkMs: +(chunks.stats.maxMs || 0).toFixed(1),
    built: chunks.stats.built,
  });
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

addEventListener('resize', () => stage.resize());
Object.assign(window, { city, stage, chunks, cam, THREE, NORTH_IN_GRID });
