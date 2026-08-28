/**
 * Renderer, scene, sky and the day/night cycle.
 *
 * Time of day is expressed entirely as lighting: sun direction, light colour,
 * ambient, fog and one `uNight` uniform every material reads. No geometry
 * colour anywhere is touched by the clock, so the whole city changes together
 * and a chunk built at 3am matches one built at noon.
 */

import * as THREE from 'three';
import { SKY_U, makeSkyMaterial, makeSceneryMaterial, makeGroundMaterial, makeWaterMaterial, makePartMaterial } from './materials.js';

const DAY = new THREE.Color(0xfff3df);
const DUSK = new THREE.Color(0xff9457);
const NIGHT = new THREE.Color(0x8fa6d8);

const FOG_DAY = new THREE.Color(0xc3dcea);
const FOG_DUSK = new THREE.Color(0xdba585);
const FOG_NIGHT = new THREE.Color(0x141a2e);

const AMB_DAY = new THREE.Color(0xd3e3ec);
const AMB_NIGHT = new THREE.Color(0x4a5880);

// Overcast: the sun becomes one big grey softbox. Cooler and much flatter.
const OVERCAST_LIGHT = new THREE.Color(0xd6dde6);
const OVERCAST_SKY = new THREE.Color(0xa8b4bf);

export class Stage {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: opts.antialias !== false,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setClearColor(0x9fc6da, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(FOG_DAY.getHex(), 300, 1500);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.6, 9000);
    this.camera.position.set(0, 200, 300);

    // --- lights ---
    // Sun and sky are balanced so that a north-facing wall still reads as a
    // surface. A physically-honest ratio here crushes half of every building
    // to black, which at low-poly scale just looks broken.
    this.sun = new THREE.DirectionalLight(0xfff3df, 1.25);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 900;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.6;
    const sc = this.sun.shadow.camera;
    sc.left = -180; sc.right = 180; sc.top = 180; sc.bottom = -180;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xd3e3ec, 0x9a9284, 0.78);
    this.scene.add(this.hemi);

    // --- sky dome ---
    this.skyMat = makeSkyMaterial();
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    this.scene.add(this.sky);

    // --- materials shared by the world ---
    this.materials = {
      scenery: makeSceneryMaterial(),
      ground: makeGroundMaterial(),
      water: makeWaterMaterial(),
      part: makePartMaterial(),
      ghost: makePartMaterial({ ghost: true, transparent: true, opacity: 0.62, depthWrite: false }),
    };

    this.timeOfDay = 10.5;
    this.setQuality('medium');
    this.resize();
  }

  setQuality(name) {
    this.quality = name;
    const r = this.renderer;
    const dpr = Math.min(window.devicePixelRatio || 1, name === 'low' ? 1 : name === 'medium' ? 1.75 : 2.4);
    r.setPixelRatio(dpr);
    r.shadowMap.enabled = name !== 'low';
    this.sun.castShadow = name !== 'low';
    this.sun.shadow.mapSize.set(name === 'high' ? 2048 : 1024, name === 'high' ? 2048 : 1024);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    const far = name === 'low' ? 4000 : name === 'medium' ? 7000 : 11000;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
    this.baseFog = name === 'low' ? 900 : name === 'medium' ? 1500 : 2400;
    this.fogFar = this.baseFog;
  }

  /**
   * Fog has to follow the zoom. Held at street-level range it swallows the
   * whole skyline the moment you pull back to look at the city.
   */
  setViewDistance(d) {
    const target = Math.max(this.baseFog, d * 2.6 + 600);
    this.fogFar = Math.min(target, this.camera.far * 0.94);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    return { w, h };
  }

  /**
   * Sun elevation/azimuth for an hour of the day. Not an ephemeris — it is
   * tuned so that noon is high, the golden hours land where they should, and
   * the sun rises roughly east and sets roughly west in the grid frame.
   */
  sunVector(hour, seasonT = 0.5) {
    const dayFrac = (hour - 6) / 12;                 // 0 at 06:00, 1 at 18:00
    const elev = Math.sin(dayFrac * Math.PI) * (0.62 + seasonT * 0.30) - 0.06;
    const az = (dayFrac - 0.5) * Math.PI * 1.06;     // east -> west
    const c = Math.cos(elev * Math.PI * 0.5);
    return new THREE.Vector3(Math.sin(az) * c, Math.sin(elev * Math.PI * 0.5), -Math.cos(az) * c).normalize();
  }

  setTimeOfDay(hour, seasonT = 0.5) {
    this.timeOfDay = ((hour % 24) + 24) % 24;
    const h = this.timeOfDay;
    const dir = this.sunVector(h, seasonT);
    const elev = dir.y;

    // night 0..1 — fully night below the horizon, fully day well above it
    const night = 1 - smoothstep(-0.10, 0.16, elev);
    const dusk = Math.max(0, 1 - Math.abs(elev - 0.045) / 0.20) * (1 - night * 0.35);

    SKY_U.uNight.value = night;
    this.skyMat.uniforms.uDuskAmt.value = dusk;
    // keep the sun disc above the horizon when it is technically below, so the
    // moon has somewhere to be
    this.skyMat.uniforms.uSunDir.value.copy(
      night > 0.85 ? dir.clone().negate().setY(Math.abs(dir.y) + 0.25).normalize() : dir);

    // sun light
    const col = new THREE.Color().copy(DAY).lerp(DUSK, dusk).lerp(NIGHT, night);
    this.sun.color.copy(col);
    this.sun.intensity = 1.30 * (1 - night) + 0.30 * night;
    const d = 260;
    this.sunDir = dir;
    this.sun.position.copy(dir).multiplyScalar(d).add(this.sunTargetPos || new THREE.Vector3());

    // ambient
    this.hemi.color.copy(AMB_DAY).lerp(AMB_NIGHT, night);
    this.hemi.groundColor.set(night > 0.5 ? 0x262b3a : 0x9a9284);
    this.hemi.intensity = 0.78 * (1 - night) + 0.62 * night;

    // fog follows the horizon so the city dissolves into the sky, not into grey
    const fog = new THREE.Color().copy(FOG_DAY).lerp(FOG_DUSK, dusk).lerp(FOG_NIGHT, night);
    this.scene.fog.color.copy(fog);
    this.renderer.setClearColor(fog, 1);
    this.scene.fog.near = this.fogFar * 0.34;
    this.scene.fog.far = this.fogFar;

    // Remember the clear-sky answer. Overcast is applied on top of it, so a
    // shower at dusk is still dusk rather than a flat grey override.
    this.clearSky = {
      sun: this.sun.intensity, sunColor: this.sun.color.clone(),
      hemi: this.hemi.intensity, hemiColor: this.hemi.color.clone(),
      fog, fogFar: this.fogFar,
    };
    this.applyOvercast();
  }

  /** Keep the shadow frustum tight around wherever the camera is looking. */
  updateShadowFocus(target) {
    this.sunTargetPos = target;
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
    if (this.sunDir) this.sun.position.copy(this.sunDir).multiplyScalar(260).add(target);
  }

  // -------------------------------------------------------------------------
  // WEATHER
  // -------------------------------------------------------------------------
  /**
   * Rain or snow as a single Points cloud that follows the camera. Snow in the
   * winter months, rain otherwise, and only some of the time — driven by a
   * hash of the day so it is stable within a session rather than flickering.
   */
  initWeather() {
    if (this.weather) return;
    const N = 1400;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 60;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: {
        uTime: SKY_U.uTime,
        uNight: SKY_U.uNight,
        uSnow: { value: 0 },       // 0 = rain, 1 = snow
        uAmount: { value: 0 },
        uOrigin: { value: new THREE.Vector3() },
      },
      vertexShader: /* glsl */`
        attribute float seed;
        uniform float uTime, uSnow;
        uniform vec3 uOrigin;
        varying float vSeed;
        void main() {
          vSeed = seed;
          vec3 p = position;
          float fall = mix(26.0, 3.2, uSnow) * (0.6 + seed * 0.8);
          p.y = mod(p.y - uTime * fall, 60.0);
          // snow drifts sideways, rain does not
          p.x += sin(uTime * 0.6 + seed * 41.0) * 3.4 * uSnow;
          p.z += cos(uTime * 0.5 + seed * 27.0) * 3.4 * uSnow;
          p += uOrigin;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = mix(1.6, 4.2, uSnow) * (300.0 / max(1.0, -mv.z));
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uSnow, uAmount, uNight;
        varying float vSeed;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          // round flakes, elongated raindrops
          float shape = mix(step(r * vec2(1.0, 0.34).x, 0.5), 1.0 - smoothstep(0.2, 0.5, r), uSnow);
          if (shape < 0.05) discard;
          float a = uAmount * shape * mix(0.34, 0.85, uSnow) * (0.5 + vSeed * 0.5);
          vec3 col = mix(vec3(0.68, 0.76, 0.86), vec3(1.0), uSnow);
          gl_FragColor = vec4(col * mix(1.0, 0.55, uNight), a);
        }
      `,
    });
    this.weather = new THREE.Points(g, m);
    this.weather.frustumCulled = false;
    this.weather.renderOrder = 900;
    this.weather.visible = false;
    this.scene.add(this.weather);
  }

  /**
   * @param enabled  the player's setting
   * @param seasonT  0 at midwinter, 1 at midsummer
   */
  updateWeather(enabled, seasonT, hour) {
    // How much weather there is, whether or not the player draws the particles.
    // A stable per-day roll, so it is not raining every time you look.
    const day = Math.floor(Date.now() / 86400000);
    const roll = ((Math.imul(day, 0x9e3779b1) >>> 8) & 1023) / 1023;
    const snow = seasonT < 0.34 ? 1 : 0;
    const chance = snow ? 0.45 : 0.28;
    const amount = enabled && roll < chance ? Math.min(1, 0.35 + roll * 1.4) : 0;

    /*
     * Weather is not the particles. Particles are the least of it — what makes
     * rain read as rain is that the light goes flat, the distance closes in and
     * the road turns dark and shiny. So the amount drives the whole scene, and
     * the surfaces keep their state a good while after the shower passes:
     * ground stays wet for a bit, and snow lies until it is drawn down.
     */
    const wetTarget = amount * (1 - snow);
    const layTarget = amount * snow;

    /*
     * The first frame lands on the answer rather than ramping up to it.
     *
     * How wet the ground is has no business being a function of how long the
     * page has been open. Ramping from zero every load meant coming back
     * during a downpour to dry roads that slowly darkened over the next half
     * minute, which reads as a bug even though every individual frame is
     * right. The roll is deterministic, so the correct state on load is simply
     * the target.
     */
    if (!this._weatherPrimed) {
      this._weatherPrimed = true;
      SKY_U.uWet.value = wetTarget;
      SKY_U.uSnowLay.value = layTarget;
    }
    // wetting is quick, drying is slow; snow settles slowly and melts slower
    const wet = SKY_U.uWet.value;
    SKY_U.uWet.value = wet + (wetTarget - wet) * (wetTarget > wet ? 0.020 : 0.004);
    const lay = SKY_U.uSnowLay.value;
    SKY_U.uSnowLay.value = lay + (layTarget - lay) * (layTarget > lay ? 0.006 : 0.002);
    this.overcast = Math.max(SKY_U.uWet.value, SKY_U.uSnowLay.value * 0.8);
    this.applyOvercast();

    if (!enabled) { if (this.weather) this.weather.visible = false; return; }
    this.initWeather();
    const u = this.weather.material.uniforms;
    u.uSnow.value += (snow - u.uSnow.value) * 0.05;
    u.uAmount.value += (amount - u.uAmount.value) * 0.02;
    u.uOrigin.value.set(
      Math.round(this.camera.position.x / 10) * 10,
      Math.max(0, this.camera.position.y - 30),
      Math.round(this.camera.position.z / 10) * 10);
    this.weather.visible = u.uAmount.value > 0.01;
  }

  /**
   * Overcast: the sun goes down and diffuse, and the fog closes in.
   *
   * Applied on top of whatever the clock already decided rather than instead
   * of it, so dusk in the rain is still dusk. setTimeOfDay stashes the clear-
   * sky values and this scales them.
   */
  applyOvercast() {
    const o = this.overcast || 0;
    if (!this.clearSky) return;
    const c = this.clearSky;
    this.sun.intensity = c.sun * (1 - o * 0.62);
    this.sun.color.copy(c.sunColor).lerp(OVERCAST_LIGHT, o * 0.7);
    // the sky bounces more light down when it is one big grey softbox
    this.hemi.intensity = c.hemi * (1 + o * 0.30);
    this.hemi.color.copy(c.hemiColor).lerp(OVERCAST_SKY, o * 0.75);
    const fog = c.fog.clone().lerp(OVERCAST_SKY, o * 0.62);
    this.scene.fog.color.copy(fog);
    this.renderer.setClearColor(fog, 1);
    // visibility drops sharply in rain and further in snow
    const close = 1 - o * 0.46;
    this.scene.fog.far = c.fogFar * close;
    this.scene.fog.near = c.fogFar * 0.34 * close * (1 - o * 0.25);
    if (this.skyMat) this.skyMat.uniforms.uOvercast.value = o;
  }

  render(dt) {
    SKY_U.uTime.value += dt;
    this.sky.position.copy(this.camera.position);
    this.sky.scale.setScalar(this.camera.far * 0.92);
    this.renderer.render(this.scene, this.camera);
  }
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
