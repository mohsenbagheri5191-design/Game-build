/**
 * Catalogue thumbnails and the avatar preview.
 *
 * One small offscreen renderer draws every part once, and the result is cached
 * as a data URL. Spinning up a WebGL context per catalogue tile would cost far
 * more than the whole rest of the interface.
 */

import * as THREE from 'three';
import { partGeometry, getPart } from '../kit/parts.js';
import { defaultColorsFor, hexToRgb01 } from '../kit/colors.js';
import { buildAvatarGeometry, avatarMaterial } from '../kit/avatar.js';

const SIZE = 128;
let renderer = null;
let scene = null;
let camera = null;
let mesh = null;
const cache = new Map();

function ensure() {
  if (renderer) return;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xfff4e2, 2.0);
  key.position.set(2.4, 3.4, 2.6);
  scene.add(key);
  const fill = new THREE.HemisphereLight(0xdfeaf2, 0x6a6255, 1.9);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xbcd8ea, 0.7);
  rim.position.set(-2.4, 1.4, -2.0);
  scene.add(rim);

  camera = new THREE.PerspectiveCamera(34, 1, 0.05, 120);
}

/** Data URL for one part, at its default colours. Cached forever. */
export function partThumb(partId) {
  if (cache.has(partId)) return cache.get(partId);
  ensure();
  const part = getPart(partId);
  const geom = partGeometry(partId);
  if (!part || !geom) return null;

  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }

  // bake the zone colours into vertex colours for the preview
  const g = geom.clone();
  const zone = g.getAttribute('zone');
  const shade = g.getAttribute('shade');
  const cols = defaultColorsFor(part).map(hexToRgb01);
  const arr = new Float32Array(zone.count * 3);
  for (let i = 0; i < zone.count; i++) {
    const c = cols[Math.min(2, Math.round(zone.getX(i)))] || cols[0];
    const s = shade ? shade.getX(i) : 1;
    arr[i * 3] = c[0] * s; arr[i * 3 + 1] = c[1] * s; arr[i * 3 + 2] = c[2] * s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));

  mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  scene.add(mesh);

  g.computeBoundingBox();
  const bb = g.boundingBox;
  const c = new THREE.Vector3(); bb.getCenter(c);
  const size = new THREE.Vector3(); bb.getSize(size);
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
  mesh.position.set(-c.x, -c.y, -c.z);

  const d = radius / Math.tan((camera.fov * Math.PI) / 360) * 1.62;
  camera.position.set(d * 0.62, d * 0.56, d * 0.72);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  cache.set(partId, url);
  return url;
}

/** An <img> that fills in lazily so opening the drawer never blocks. */
export function thumbImg(partId, alt = '') {
  const img = document.createElement('img');
  img.alt = alt;
  img.decoding = 'async';
  img.loading = 'lazy';
  const url = cache.get(partId);
  if (url) img.src = url;
  else {
    // stagger so a 90-item grid doesn't render 90 frames in one go
    const delay = 1 + cache.size % 6;
    setTimeout(() => {
      try { img.src = partThumb(partId) || ''; } catch { /* keep the empty tile */ }
    }, delay * 8);
  }
  return img;
}

// ---------------------------------------------------------------------------
// AVATAR PREVIEW
// ---------------------------------------------------------------------------
export class AvatarView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    const key = new THREE.DirectionalLight(0xfff4e2, 2.0);
    key.position.set(1.8, 3.0, 2.6);
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xdfeaf2, 0x5a5348, 1.8));
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);
    this.material = avatarMaterial();
    this.mesh = null;
    this.spin = opts.spin !== false;
    this.angle = 0.5;
    this._raf = null;
  }

  set(avatar) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
    const g = buildAvatarGeometry(avatar);
    this.mesh = new THREE.Mesh(g, this.material);
    this.scene.add(this.mesh);
    const h = g.userData.height || 1.8;
    this.camera.position.set(0, h * 0.62, h * 2.1);
    this.camera.lookAt(0, h * 0.50, 0);
  }

  start() {
    if (this._raf) return;
    const loop = () => {
      const w = this.canvas.clientWidth || 200, ht = this.canvas.clientHeight || 200;
      if (this.canvas.width !== w * this.renderer.getPixelRatio()) {
        this.renderer.setSize(w, ht, false);
        this.camera.aspect = w / ht;
        this.camera.updateProjectionMatrix();
      }
      if (this.mesh) {
        if (this.spin) this.angle += 0.008;
        this.mesh.rotation.y = this.angle;
      }
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }

  dispose() {
    this.stop();
    if (this.mesh) this.mesh.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}

/** Tiny static avatar chip for lists — drawn once into a 2D canvas. */
const avatarChipCache = new Map();
export function avatarChip(avatar, size = 40) {
  const key = JSON.stringify(avatar);
  if (avatarChipCache.has(key)) {
    const img = document.createElement('img');
    img.src = avatarChipCache.get(key);
    img.width = size; img.height = size;
    return img;
  }
  ensure();
  if (mesh) { scene.remove(mesh); }
  const g = buildAvatarGeometry(avatar);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  scene.add(m);
  const h = g.userData.height || 1.8;
  camera.position.set(0, h * 0.78, h * 1.30);
  camera.lookAt(0, h * 0.72, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(m); g.dispose(); m.material.dispose();
  avatarChipCache.set(key, url);
  const img = document.createElement('img');
  img.src = url; img.width = size; img.height = size;
  return img;
}
