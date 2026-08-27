// Development harness: lay every part in the kit out on a grid and look at it.
// Not part of the shipped page.
import * as THREE from 'three';
import { Stage } from './render/stage.js';
import { allParts, partGeometry } from './kit/parts.js';
import './kit/decor.js';
import { makeInstanced, setInstanceColors, flushInstanceColors } from './render/props.js';

const app = document.getElementById('app');
app.innerHTML = `<canvas id="c"></canvas><div id="hud"></div>`;
const canvas = document.getElementById('c');
const hud = document.getElementById('hud');

const stage = new Stage(canvas);
stage.setQuality('high');
stage.setTimeOfDay(11);
stage.baseFog = 4000; // push fog off rather than removing it

const q = new URLSearchParams(location.search);
const filter = q.get('cat');
let parts = allParts();
if (filter) parts = parts.filter((p) => p.cat === filter);
const page = parseInt(q.get('page') || '0', 10);
const perPage = parseInt(q.get('per') || '16', 10);
parts = parts.slice(page * perPage, page * perPage + perPage);

// neutral display palette — the game lets the player pick, this is just so the
// zones are distinguishable while checking the models
const ZONES = [[0.86, 0.83, 0.78], [0.55, 0.45, 0.36], [0.62, 0.78, 0.72]];

const SPACING = 4.2;
const cols = Math.ceil(Math.sqrt(parts.length));
let maxTris = 0, totalTris = 0;

// ground
const g = new THREE.Mesh(
  new THREE.PlaneGeometry(cols * SPACING + 8, cols * SPACING + 8),
  new THREE.MeshLambertMaterial({ color: 0x8fa08a }));
g.rotation.x = -Math.PI / 2;
g.receiveShadow = true;
stage.scene.add(g);

const errors = [];
parts.forEach((p, i) => {
  const cx = (i % cols - (cols - 1) / 2) * SPACING;
  const cz = (Math.floor(i / cols) - (cols - 1) / 2) * SPACING;
  let geom;
  try {
    geom = partGeometry(p.id);
  } catch (e) {
    errors.push(`${p.id}: ${e.message}`);
    return;
  }
  if (!geom || geom.userData.tris === 0) { errors.push(`${p.id}: empty geometry`); return; }
  totalTris += geom.userData.tris;
  maxTris = Math.max(maxTris, geom.userData.tris);

  const mesh = makeInstanced(geom, stage.materials.part, 1);
  const m4 = new THREE.Matrix4();
  m4.compose(new THREE.Vector3(cx, 0, cz), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  mesh.setMatrixAt(0, m4);
  setInstanceColors(mesh, 0, ZONES, p.glows ? 1 : 0);
  mesh.instanceMatrix.needsUpdate = true;
  flushInstanceColors(mesh);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  stage.scene.add(mesh);

  // a small tile under each so the footprint is readable
  const tile = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 2.5),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.10 }));
  tile.rotation.x = -Math.PI / 2;
  tile.position.set(cx, 0.012, cz);
  stage.scene.add(tile);
});

const cam = stage.camera;
const span = cols * SPACING;
cam.position.set(span * 0.62, span * 0.60, span * 0.78);
cam.lookAt(0, 1.0, 0);
stage.updateShadowFocus(new THREE.Vector3(0, 0, 0));

let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000; last = now;
  stage.setViewDistance(span * 1.2);
  stage.setTimeOfDay(parseFloat(q.get('t') || '11'));
  stage.render(dt);
  hud.textContent = `${parts.length} parts · ${totalTris} tris (max ${maxTris}) · ` +
    parts.map((p) => p.name).join(', ');
  window.__ready = true;
  window.__stats = () => ({ parts: parts.length, totalTris, maxTris, errors });
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
if (errors.length) console.error('PART ERRORS', errors);
addEventListener('resize', () => stage.resize());
