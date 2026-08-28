/**
 * Touch-first orbit camera.
 *
 *   one finger drag   orbit          (unless the camera is locked for building)
 *   two finger drag   pan
 *   pinch             zoom
 *   two finger twist  rotate heading
 *   tap               select
 *   tap and hold      context menu
 *
 * Everything the player touches moves a *target*; the live camera chases those
 * targets with a critically-damped spring, and a released drag keeps its
 * velocity. That is what separates "it responds" from "it feels good".
 *
 * Pointer Events are used rather than TouchEvents so a mouse and a trackpad
 * work identically during development. `touch-action: none` is set on the
 * canvas element itself — setting it only on <body> lets iOS Safari swallow
 * every gesture before it reaches us.
 */

import * as THREE from 'three';

const DEG = Math.PI / 180;
const TAP_MOVE = 11;      // px of travel still counted as a tap
const TAP_TIME = 320;     // ms
const HOLD_TIME = 460;    // ms to a context menu

export class TouchCamera {
  constructor(camera, canvas, city, opts = {}) {
    this.camera = camera;
    this.canvas = canvas;
    this.city = city;

    // --- targets the input writes to ---
    this.tFocus = new THREE.Vector3(0, 0, 0);
    this.tDist = 340;
    this.tHeading = 200 * DEG;
    this.tPitch = 46 * DEG;

    // --- the values actually used to place the camera ---
    this.focus = this.tFocus.clone();
    this.dist = this.tDist;
    this.heading = this.tHeading;
    this.pitch = this.tPitch;

    // --- fling velocities ---
    this.vHeading = 0;
    this.vPitch = 0;
    this.vFocus = new THREE.Vector3();
    this.vDist = 0;

    this.minDist = 11;
    this.maxDist = 3400;
    this.minPitch = 7 * DEG;
    this.maxPitch = 87 * DEG;
    this.margin = 260;

    this.locked = false;          // camera lock while building
    this.invertX = false;
    this.invertY = false;
    this.sensitivity = 1;
    this.reducedMotion = false;

    this.pointers = new Map();
    this.gesture = null;          // 'orbit' | 'pinch' | null
    this.enabled = true;
    this.suppressGesture = false; // build drag owns the pointer

    this.onTap = opts.onTap || (() => {});
    this.onHold = opts.onHold || (() => {});
    this.onDragStart = opts.onDragStart || (() => false);
    this.onDragMove = opts.onDragMove || (() => {});
    this.onDragEnd = opts.onDragEnd || (() => {});
    this.onChange = opts.onChange || (() => {});

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this._bind();
    this.update(0.016, true);
  }

  // -------------------------------------------------------------------------
  _bind() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.style.webkitUserSelect = 'none';
    c.style.userSelect = 'none';

    const opt = { passive: false };
    c.addEventListener('pointerdown', (e) => this._down(e), opt);
    c.addEventListener('pointermove', (e) => this._move(e), opt);
    c.addEventListener('pointerup', (e) => this._up(e), opt);
    c.addEventListener('pointercancel', (e) => this._up(e), opt);
    c.addEventListener('lostpointercapture', (e) => this._up(e), opt);
    c.addEventListener('wheel', (e) => this._wheel(e), opt);
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    // Safari fires these alongside touch events; without preventDefault the
    // whole page pinch-zooms behind the canvas.
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
      c.addEventListener(t, (e) => e.preventDefault(), opt);
    }
  }

  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /**
   * Pointer capture is a nicety, not a requirement.
   *
   * setPointerCapture throws NotFoundError whenever the pointer is not active
   * any more — a touch released between the event firing and the handler
   * running, an element detached mid-gesture, a replayed or synthesised event.
   * It used to be called before the pointer was recorded, so when it threw it
   * took the rest of the handler with it and the touch was never registered at
   * all: no orbit, no pinch, no tap. The gesture system simply stopped, with
   * nothing on screen to say why. Capture is now attempted after the pointer
   * is safely on the books, and its failure costs nothing.
   */
  _capture(id) {
    try { this.canvas.setPointerCapture?.(id); } catch { /* not fatal */ }
  }

  _release(id) {
    try { this.canvas.releasePointerCapture?.(id); } catch { /* not fatal */ }
  }

  _down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const p = this._pt(e);
    this.pointers.set(e.pointerId, {
      id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y,
      t: performance.now(), moved: 0,
    });
    this._capture(e.pointerId);

    if (this.pointers.size === 1) {
      this.vHeading = 0; this.vPitch = 0; this.vDist = 0; this.vFocus.set(0, 0, 0);
      this.gesture = 'orbit';
      // give the build system first refusal on a one-finger drag
      this.suppressGesture = !!this.onDragStart(p, e);
      this._holdTimer = setTimeout(() => {
        const ptr = this.pointers.get(e.pointerId);
        if (ptr && ptr.moved < TAP_MOVE && this.pointers.size === 1) {
          this._held = true;
          this.onHold(p, e);
        }
      }, HOLD_TIME);
    } else if (this.pointers.size === 2) {
      clearTimeout(this._holdTimer);
      this.suppressGesture = false;
      this.onDragEnd(null, true);
      this.gesture = 'pinch';
      const [a, b] = [...this.pointers.values()];
      this._pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
        startDist: this.tDist,
      };
    }
  }

  _move(e) {
    if (!this.enabled) return;
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    e.preventDefault();
    const p = this._pt(e);
    const dx = p.x - ptr.x, dy = p.y - ptr.y;
    ptr.moved += Math.hypot(dx, dy);
    ptr.x = p.x; ptr.y = p.y;
    if (ptr.moved > TAP_MOVE) clearTimeout(this._holdTimer);

    if (this.pointers.size === 1) {
      if (this.suppressGesture) { this.onDragMove(p, e); return; }
      if (this.locked) return;
      /*
       * Nothing moves until the finger has travelled far enough to mean it.
       *
       * No tap is perfectly still — a few pixels of wobble is normal — and the
       * orbit used to apply from the very first pixel, before anyone could
       * know whether this was a tap or a drag. So every tap turned the view a
       * degree or two, and the fling velocity carried it on turning after the
       * finger left. Tapping a building nudged the whole city. Waiting for the
       * same threshold that decides tap-versus-drag costs eleven pixels at the
       * start of a real drag, which nobody can feel, and makes a tap a tap.
       */
      if (ptr.moved <= TAP_MOVE) return;
      const s = this.sensitivity;
      const dh = (this.invertX ? dx : -dx) * 0.0052 * s;
      const dp = (this.invertY ? -dy : dy) * 0.0042 * s;
      this.tHeading += dh;
      this.tPitch = clamp(this.tPitch + dp, this.minPitch, this.maxPitch);
      this.vHeading = dh * 6;
      this.vPitch = dp * 6;
      this.onChange();
    } else if (this.pointers.size >= 2 && this._pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;

      // pinch -> zoom
      if (this._pinch.dist > 1) {
        const k = this._pinch.dist / Math.max(1, d);
        this.tDist = clamp(this._pinch.startDist * k, this.minDist, this.maxDist);
      }
      // twist -> heading
      let dAng = ang - this._pinch.angle;
      while (dAng > Math.PI) dAng -= Math.PI * 2;
      while (dAng < -Math.PI) dAng += Math.PI * 2;
      if (!this.locked) this.tHeading += dAng;

      // centroid travel -> pan
      this._panBy(cx - this._pinch.cx, cy - this._pinch.cy);

      this._pinch.dist = d;
      this._pinch.angle = ang;
      this._pinch.cx = cx; this._pinch.cy = cy;
      this._pinch.startDist = this.tDist;
      this.onChange();
    }
  }

  _up(e) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    this._release(e.pointerId);
    this.pointers.delete(e.pointerId);
    clearTimeout(this._holdTimer);

    const dt = performance.now() - ptr.t;
    const wasTap = ptr.moved < TAP_MOVE && dt < TAP_TIME && !this._held;

    if (this.suppressGesture) {
      this.onDragEnd({ x: ptr.x, y: ptr.y }, false);
      this.suppressGesture = false;
    } else if (wasTap && this.pointers.size === 0) {
      this.onTap({ x: ptr.x, y: ptr.y }, e);
    }

    if (this.pointers.size < 2) this._pinch = null;
    if (this.pointers.size === 0) { this.gesture = null; this._held = false; }
  }

  _wheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const k = Math.exp(e.deltaY * 0.0016);
    this.tDist = clamp(this.tDist * k, this.minDist, this.maxDist);
    this.onChange();
  }

  /** Screen-space pan converted into ground-plane movement. */
  _panBy(dxPx, dyPx) {
    const h = this.canvas.clientHeight || 800;
    // metres per pixel at the focus distance, for the current fov
    const scale = (2 * this.dist * Math.tan((this.camera.fov * DEG) / 2)) / h;
    const right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    // dragging the world with the finger: content follows the thumb
    const move = right.multiplyScalar(-dxPx * scale)
      .add(fwd.multiplyScalar(-dyPx * scale / Math.max(0.30, Math.sin(this.pitch))));
    this.tFocus.add(move);
    this.vFocus.copy(move).multiplyScalar(5);
    this._clampFocus();
  }

  _clampFocus() {
    const c = this.city;
    if (!c) return;
    this.tFocus.x = clamp(this.tFocus.x, c.uMin - this.margin, c.uMax + this.margin);
    this.tFocus.z = clamp(this.tFocus.z, -(c.vMax + this.margin), -(c.vMin - this.margin));
  }

  // -------------------------------------------------------------------------
  // public moves
  // -------------------------------------------------------------------------
  frame(u, v, dist, heading, pitch, instant = false) {
    this.tFocus.set(u, 0, -v);
    if (dist != null) this.tDist = clamp(dist, this.minDist, this.maxDist);
    if (heading != null) this.tHeading = heading;
    if (pitch != null) this.tPitch = clamp(pitch, this.minPitch, this.maxPitch);
    this._clampFocus();
    this.vFocus.set(0, 0, 0); this.vDist = 0; this.vHeading = 0; this.vPitch = 0;
    if (instant) {
      this.focus.copy(this.tFocus);
      this.dist = this.tDist; this.heading = this.tHeading; this.pitch = this.tPitch;
      this.update(0.016, true);
    }
    this.onChange();
  }

  /**
   * Frame a rectangle so the whole thing is comfortably on screen.
   *
   * A phone in portrait is much narrower than it is tall, so the width has to
   * be fitted against the *horizontal* field of view — and the depth, seen at
   * a pitch, is foreshortened rather than needing its full extent. Fitting the
   * raw larger dimension against the vertical FOV pushes the camera roughly
   * twice as far back as it needs to be.
   */
  /**
   * The heading with the clearest line to a point — the direction with the
   * least building between the camera and what you asked to look at.
   *
   * This is what makes "go home" frame the site at a *useful* angle instead of
   * a technically-correct one pointing into the back of the neighbour's wall.
   */
  bestHeading(u, v, dist, pitch) {
    if (!this.city) return this.tHeading;
    const sp = Math.sin(pitch), cp = Math.cos(pitch);
    let best = this.tHeading, bestScore = -Infinity;
    for (let i = 0; i < 16; i++) {
      const h = (i / 16) * Math.PI * 2;
      let score = 0;
      for (let s = 2; s <= 7; s++) {
        const t = (s / 7) * dist;
        const px = u + Math.sin(h) * cp * t;
        const pv = v - Math.cos(h) * cp * t;
        score -= Math.max(0, this.city.heightAt(px, pv) + 2 - sp * t);
      }
      // all else equal, prefer staying near where the player already is
      score -= Math.abs(angleDelta(this.tHeading, h)) * 0.35;
      if (score > bestScore) { bestScore = score; best = h; }
    }
    return best;
  }

  /**
   * `opts.bottomInset` is the fraction of the screen the interface covers along
   * the bottom — the build bar, mostly. Without it a lot is centred in the
   * *window* and therefore sits half behind the bar, which is the one part of
   * it you most want to reach. With it the lot is centred in the part you can
   * actually see.
   *
   * Two things follow from an inset: the usable height shrinks, so the camera
   * has to pull back; and the subject has to ride up the screen. Raising it is
   * done by sliding the focus point horizontally *toward* the camera by `s`,
   * which lifts the subject by `s·sin(pitch)/(dist + s·cos(pitch))` in units of
   * tan(fov/2) — solve that for `s` and the framing is exact rather than tuned.
   */
  frameRect(rect, opts = {}) {
    const cu = (rect.u0 + rect.u1) / 2, cv = (rect.v0 + rect.v1) / 2;
    const w = rect.u1 - rect.u0, d = rect.v1 - rect.v0;
    const pitch = opts.pitch ?? 42 * DEG;
    const aspect = Math.max(0.35, this.camera.aspect);
    const tanV = Math.tan((this.camera.fov * DEG) / 2);
    const tanH = tanV * aspect;
    // Only ever shift by part of the bar's height. Clearing it completely means
    // pulling the camera back far enough that on a downtown lot the neighbour's
    // building ends up between you and your own ground — a lot fully clear of
    // the bar and fully behind a wall is worse than one whose bottom edge is
    // tucked under it.
    const inset = clamp((opts.bottomInset ?? 0) * 0.55, 0, 0.2);
    const sp = Math.sin(pitch), cp = Math.cos(pitch);
    const lift = inset * tanV;                // half-heights to raise it by
    const denom = sp - lift * cp;
    // Sliding the focus by s adds s·cos(pitch) of depth on its own, so the
    // distance has to be solved for the total rather than added to afterwards.
    const slide = denom > 0.05 ? lift / denom : 0;
    const needH = w / 2 / tanH;
    const needV = (d * sp) / 2 / tanV / (1 - inset);
    const need = (Math.max(needH, needV) * 1.22 + 8) / (1 + slide * cp);
    const dist = clamp(Math.max(need, opts.minDist ?? 28), this.minDist, this.maxDist);
    const heading = opts.heading ?? (opts.autoHeading ? this.bestHeading(cu, cv, dist, pitch) : this.tHeading);
    const s = clamp(slide * dist, 0, dist * 0.5);
    this.frame(cu + Math.sin(heading) * s, cv - Math.cos(heading) * s,
      dist, heading, pitch, opts.instant);
  }

  snapNorth(northInGrid) {
    this.tHeading = northInGrid;
    this.onChange();
  }

  zoomBy(factor) {
    this.tDist = clamp(this.tDist * factor, this.minDist, this.maxDist);
    this.onChange();
  }

  // -------------------------------------------------------------------------
  update(dt, instant = false) {
    const d = Math.min(dt, 0.1);

    // inertia — skipped entirely in reduced-motion mode
    if (!this.reducedMotion && this.pointers.size === 0) {
      const decay = Math.pow(0.0022, d);
      this.tHeading += this.vHeading * d;
      this.tPitch = clamp(this.tPitch + this.vPitch * d, this.minPitch, this.maxPitch);
      this.tFocus.addScaledVector(this.vFocus, d);
      this._clampFocus();
      this.vHeading *= decay; this.vPitch *= decay;
      this.vFocus.multiplyScalar(decay);
      if (Math.abs(this.vHeading) < 1e-4) this.vHeading = 0;
      if (Math.abs(this.vPitch) < 1e-4) this.vPitch = 0;
      if (this.vFocus.lengthSq() < 1e-5) this.vFocus.set(0, 0, 0);
    }

    // A gentle pitch floor that rises with zoom. It exists to stop the camera
    // grazing the ground plane at altitude, not to forbid a low skyline shot —
    // looking at the horizon from far out is the view, not "pointing at
    // nothing", so the floor stays small.
    const t = clamp((this.dist - 80) / 1400, 0, 1);
    const dynMin = this.minPitch + t * 5 * DEG;
    this.tPitch = clamp(this.tPitch, dynMin, this.maxPitch);

    // critically damped chase
    const k = instant || this.reducedMotion ? 1 : 1 - Math.pow(0.0016, d);
    this.focus.lerp(this.tFocus, k);
    this.dist += (this.tDist - this.dist) * k;
    this.heading += angleDelta(this.heading, this.tHeading) * k;
    this.pitch += (this.tPitch - this.pitch) * k;

    // --- place the camera ---
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dirX = Math.sin(this.heading) * cp;
    const dirZ = Math.cos(this.heading) * cp;

    /*
     * Camera collision.
     *
     * The boom is marched out from the focus, and where a building would be in
     * the way the camera *rises over it* rather than being pulled in. Pulling
     * in is the obvious implementation and it is wrong: on a downtown lot the
     * very first step is already inside the neighbour, so the boom collapses to
     * nothing and you end up standing in a wall. Lifting keeps the lot framed.
     *
     * Only when lifting would need an absurd angle does distance give way.
     */
    const dist = this.dist;
    let sinP = sp;
    let x = this.focus.x + dirX * dist;
    let z = this.focus.z + dirZ * dist;
    let y = this.focus.y + sp * dist;

    if (this.city) {
      const MARGIN = 2.0;
      // Lifting is capped relative to the pitch the player actually asked for.
      // Without a cap, a close-up in a dense block walks the camera all the way
      // to vertical and you end up staring at your own roof.
      const maxSin = Math.min(Math.sin(this.maxPitch), Math.sin(Math.min(this.maxPitch, this.pitch + 0.5)));
      /*
       * Only the camera's own position is solved for, plus the far half of the
       * boom. Testing the whole boom sounds more correct but is unusable: the
       * step nearest the focus is always inside the lot's own neighbour, which
       * demands a near-vertical angle and pins the camera straight overhead.
       * Standing beside a tall building is fine — standing *inside* one is not.
       */
      for (let pass = 0; pass < 3; pass++) {
        let need = sinP;
        const hCam = this.city.heightAt(x, -z);
        if (hCam > 0.5 && y < hCam + MARGIN) {
          need = Math.max(need, Math.min(maxSin, (hCam + MARGIN) / dist));
        }
        // and don't stare straight through a tower sitting mid-boom
        for (const f of [0.6, 0.82]) {
          const t = dist * f;
          const h = this.city.heightAt(this.focus.x + dirX * t, -(this.focus.z + dirZ * t));
          if (h > 0.5 && this.focus.y + sinP * t < h + MARGIN) {
            need = Math.max(need, Math.min(maxSin, (h + MARGIN) / t));
          }
        }
        if (need <= sinP + 1e-4) break;
        // if the cap stops us clearing it, close in rather than climb
        if (need >= maxSin - 1e-4 && sinP >= maxSin - 1e-4) break;
        sinP = need;
        const c = Math.sqrt(Math.max(0, 1 - sinP * sinP));
        x = this.focus.x + Math.sin(this.heading) * c * dist;
        z = this.focus.z + Math.cos(this.heading) * c * dist;
        y = this.focus.y + sinP * dist;
      }
    }
    // and never below the pavement
    if (y < 1.7) y = 1.7;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.focus.x, this.focus.y + this.dist * 0.055, this.focus.z);
    this.camera.updateMatrixWorld();
  }

  // -------------------------------------------------------------------------
  // picking
  // -------------------------------------------------------------------------
  ndc(p) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return new THREE.Vector2((p.x / w) * 2 - 1, -(p.y / h) * 2 + 1);
  }

  /** Where a screen point lands on the ground plane, in grid coordinates. */
  groundAt(p) {
    this.raycaster.setFromCamera(this.ndc(p), this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return { u: hit.x, v: -hit.z, point: hit };
  }

  /** Ray against real meshes; falls back to the ground plane. */
  pick(p, targets) {
    this.raycaster.setFromCamera(this.ndc(p), this.camera);
    if (targets && targets.length) {
      const hits = this.raycaster.intersectObjects(targets, false);
      if (hits.length) {
        const h = hits[0];
        return { u: h.point.x, v: -h.point.z, point: h.point, object: h.object, distance: h.distance, normal: h.face?.normal };
      }
    }
    const g = this.groundAt(p);
    return g ? { ...g, object: null } : null;
  }

  get state() {
    return { u: this.focus.x, v: -this.focus.z, dist: this.dist, heading: this.heading, pitch: this.pitch };
  }
}

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
