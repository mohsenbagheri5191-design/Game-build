/**
 * Materials.
 *
 * Everything is flat-shaded Lambert with small shader injections. Using the
 * stock material rather than a bare ShaderMaterial keeps three's fog and
 * shadow plumbing, which a hand-rolled shader would have to reimplement.
 *
 * Two rules from the brief are enforced here rather than by convention:
 *   - Time of day is a *lighting* uniform. No object colour anywhere is
 *     modulated by the clock, so the whole city changes together.
 *   - Lit windows are emissive geometry driven by uNight. During the day the
 *     glass reads only as a faint recess; nothing paints lit panes onto a
 *     daytime facade.
 */

import * as THREE from 'three';

/** Shared across every material so one write updates the whole world. */
export const SKY_U = {
  uNight: { value: 0 },        // 0 = full day, 1 = full night
  uLampWarm: { value: new THREE.Color(0xffc773) },
  uWindowWarm: { value: new THREE.Color(0xffd9a0) },
  uWindowCool: { value: new THREE.Color(0xbfe0ff) },
  uTime: { value: 0 },
  uSelect: { value: new THREE.Color(0x64e6c8) },
  // Weather, as two numbers every surface reads. Falling particles on their
  // own read as confetti; what makes weather land is what it does to the
  // ground you are standing on and the light you are standing in.
  uWet: { value: 0 },          // rain has soaked the surfaces
  uSnowLay: { value: 0 },      // snow has settled on upward faces
};

const COMMON_ATTRS = /* glsl */`
  attribute float shade;
  varying float vShade;
  varying vec3 vWorld;
`;

const COMMON_VERT = /* glsl */`
  vShade = shade;
  vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

function injectVertex(shader, extraAttrs, extraBody) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${COMMON_ATTRS}\n${extraAttrs || ''}`)
    .replace('#include <fog_vertex>', `#include <fog_vertex>\n${COMMON_VERT}\n${extraBody || ''}`);
}

// ---------------------------------------------------------------------------
// SCENERY — the real Toronto buildings
// ---------------------------------------------------------------------------
/**
 * Deliberately uncoloured: the map ships neutral so the player can paint it.
 * The only variation is the baked shade term and a per-building tone jitter
 * broad enough to separate one massing from the next.
 */
export function makeSceneryMaterial() {
  const m = new THREE.MeshLambertMaterial({
    color: 0xcdcec9,
    flatShading: true,
  });
  m.userData.uniforms = SKY_U;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SKY_U);
    injectVertex(shader,
      /* glsl */`
        attribute float bseed;
        attribute float btone;
        varying float vSeed;
        varying float vTone;
        varying vec3 vNrmW;
      `,
      /* glsl */`
        vSeed = bseed;
        vTone = btone;
        vNrmW = normalize(mat3(modelMatrix) * objectNormal);
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        varying float vShade;
        varying vec3 vWorld;
        varying float vSeed;
        varying float vTone;
        varying vec3 vNrmW;
        uniform float uNight;
        uniform float uWet;
        uniform float uSnowLay;
        uniform vec3 uWindowWarm;
        uniform vec3 uWindowCool;

        float h11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
        float h21(vec2 p){
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
      `)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>

        // per-building tone so neighbouring massings separate
        diffuseColor.rgb *= mix(0.86, 1.10, vTone);
        diffuseColor.rgb *= vShade;

        // ---- procedural facade ----
        float wallness = 1.0 - smoothstep(0.45, 0.62, abs(vNrmW.y));
        if (wallness > 0.01) {
          // storey grid; ground floor is taller (shopfronts)
          float baseY = vWorld.y;
          float storeyH = 3.6;
          float groundH = 4.6;
          float above = max(0.0, baseY - groundH);
          float storey = floor(above / storeyH);
          float fy = fract(above / storeyH);
          bool ground = baseY < groundH;
          if (ground) { storey = -1.0; fy = baseY / groundH; }

          // facade coordinate: whichever horizontal axis the wall faces
          float fx = abs(vNrmW.x) > 0.5 ? vWorld.z : vWorld.x;
          float pitch = 2.6;
          float col = floor(fx / pitch + vSeed * 3.17);
          float cx = fract(fx / pitch + vSeed * 3.17);

          float winW = ground ? 0.80 : 0.62;
          float loY = ground ? 0.16 : 0.26;
          float hiY = ground ? 0.86 : 0.74;
          float inWin = step(0.5 - winW * 0.5, cx) * step(cx, 0.5 + winW * 0.5)
                      * step(loY, fy) * step(fy, hiY) * wallness;

          /*
           * The window grid drops below a pixel once a building is a few
           * hundred metres out. Fading it away leaves a dead black skyline at
           * night; leaving it on turns the skyline into aliased static. So
           * instead it dissolves toward the *average* of the pattern — crisp
           * panes up close, an even glow from across the harbour.
           */
          float dcam = distance(vWorld, cameraPosition);
          float detail = 1.0 - smoothstep(260.0, 1100.0, dcam);

          // DAY: a faint recess only — never a lit pane
          float dayTerm = mix(0.36, inWin, detail);
          diffuseColor.rgb *= mix(1.0, 0.93, dayTerm * (1.0 - uNight * 0.85));

          // NIGHT: emissive panes, deterministic on/off per building+cell
          float lit = step(0.42, h21(vec2(col + vSeed * 91.7, storey + vSeed * 37.3)));
          float warm = h21(vec2(col * 1.7 + vSeed * 5.0, storey * 2.3));
          vec3 glow = mix(uWindowWarm, uWindowCool, step(0.72, warm));
          // The far-field average is jittered per building and per height band,
          // otherwise every tower glows identically and the skyline flattens
          // into one cream slab.
          float band = floor(vWorld.y / 14.0);
          float far = h21(vec2(vSeed * 231.0 + 7.0, band));
          float avg = (0.045 + 0.135 * far * far) * wallness;
          float nightTerm = mix(avg, inWin * lit, detail);
          totalEmissiveRadiance += glow * nightTerm * uNight * 1.25;
        }

        // Weather lands on the massing too. Rain darkens everything a little
        // and the walls more than the roofs, which is where it runs down;
        // snow does the opposite and settles on whatever points up.
        diffuseColor.rgb = mix(diffuseColor.rgb,
          diffuseColor.rgb * vec3(0.72, 0.75, 0.80), uWet * (0.35 + wallness * 0.35));
        float upFace = smoothstep(0.35, 0.80, vNrmW.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.96, 0.99), uSnowLay * upFace * 0.85);
      `);
  };
  m.customProgramCacheKey = () => 'scenery';
  return m;
}

// ---------------------------------------------------------------------------
// GROUND — roads, sidewalks, parks, plazas, rail
// ---------------------------------------------------------------------------
export function makeGroundMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SKY_U);
    injectVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        varying float vShade;
        varying vec3 vWorld;
        uniform float uNight;
        uniform float uTime;
        uniform float uWet;
        uniform float uSnowLay;
      `)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        diffuseColor.rgb *= vShade;
        // roads read slightly darker and cooler after dark
        diffuseColor.rgb *= mix(1.0, 0.74, uNight);

        // Rain. Wet ground goes darker and cooler, and asphalt more than
        // grass, because a road holds a film of water and a lawn drinks it.
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        float hard = 1.0 - smoothstep(0.30, 0.62, lum);
        float w = uWet * mix(0.35, 1.0, hard);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.56, 0.60, 0.68), w);
        // a broad wet sheen, broken up so it is not a mirror
        float sheen = sin(vWorld.x * 0.09 + uTime * 0.5) * sin(vWorld.z * 0.07 - uTime * 0.4);
        diffuseColor.rgb += w * 0.045 * (0.5 + sheen * 0.5) * vec3(0.7, 0.8, 1.0);

        // Snow. It lies on the flat and gets ploughed off the roads, so the
        // dark surfaces stay dark and everything else goes white.
        float lay = uSnowLay * mix(1.0, 0.22, hard);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.945, 0.98), lay * 0.88);
      `);
  };
  m.customProgramCacheKey = () => 'ground';
  return m;
}

// ---------------------------------------------------------------------------
// WATER — low-poly lake / river with a slow facet shimmer
// ---------------------------------------------------------------------------
export function makeWaterMaterial() {
  const m = new THREE.MeshLambertMaterial({
    color: 0x3f7fa6, flatShading: true, transparent: true, opacity: 0.94,
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SKY_U);
    injectVertex(shader);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      float w = sin(transformed.x * 0.055 + uTime * 0.7) * cos(transformed.z * 0.041 - uTime * 0.5);
      transformed.y += w * 0.30;
    `).replace('#include <common>', `#include <common>\nuniform float uTime;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        varying float vShade;
        varying vec3 vWorld;
        uniform float uNight;
        uniform float uTime;
      `)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        // Two independent waves, not a product of sines — multiplying them
        // lays a hard checkerboard over the whole lake.
        float g = sin(vWorld.x * 0.031 + uTime * 0.45) * 0.5
                + sin(vWorld.z * 0.024 - uTime * 0.37) * 0.5;
        diffuseColor.rgb *= 0.96 + g * 0.06;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.065, 0.125), uNight * 0.80);
      `);
  };
  m.customProgramCacheKey = () => 'water';
  return m;
}

// ---------------------------------------------------------------------------
// PARTS — the player's kit, instanced, three colour zones per instance
// ---------------------------------------------------------------------------
/**
 * Every placed part carries its own three zone colours as instanced
 * attributes, so a player can colour every wall of a building differently
 * without splitting the draw call.
 */
export function makePartMaterial(opt = {}) {
  const m = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    flatShading: true,
    transparent: !!opt.transparent,
    opacity: opt.opacity ?? 1,
    depthWrite: opt.depthWrite !== false,
    side: opt.side ?? THREE.FrontSide,
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SKY_U);
    shader.uniforms.uGhost = { value: opt.ghost ? 1 : 0 };
    shader.uniforms.uGhostColor = { value: new THREE.Color(0x7fffd8) };
    injectVertex(shader,
      /* glsl */`
        attribute float zone;
        attribute vec3 aC0;
        attribute vec3 aC1;
        attribute vec3 aC2;
        attribute float aFlags;
        varying vec3 vZoneColor;
        varying float vFlags;
        varying float vEmis;
        varying vec3 vNrmW;
      `,
      /* glsl */`
        vZoneColor = zone < 0.5 ? aC0 : (zone < 1.5 ? aC1 : aC2);
        vFlags = aFlags;
        // flag bit 1 = this zone glows at night (lamps, lanterns, string lights)
        vEmis = (zone > 1.5 && mod(floor(aFlags), 2.0) > 0.5) ? 1.0 : 0.0;
        // world normal, so weather knows which way this face is looking. Parts
        // are instanced, so the instance transform has to go in as well.
        #ifdef USE_INSTANCING
          vNrmW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vNrmW = normalize(mat3(modelMatrix) * objectNormal);
        #endif
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        varying float vShade;
        varying vec3 vWorld;
        varying vec3 vZoneColor;
        varying float vFlags;
        varying float vEmis;
        varying vec3 vNrmW;
        uniform float uNight;
        uniform float uGhost;
        uniform vec3 uGhostColor;
        uniform vec3 uLampWarm;
        uniform float uTime;
        uniform float uWet;
        uniform float uSnowLay;
      `)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        diffuseColor.rgb *= vZoneColor * vShade;

        // Weather settles on what the player built, not only on the city.
        // Rain darkens the whole piece; snow only lies where a face points up,
        // so a roof whitens and the walls under it do not.
        diffuseColor.rgb = mix(diffuseColor.rgb,
          diffuseColor.rgb * vec3(0.74, 0.77, 0.82), uWet * 0.55);
        float upFace = smoothstep(0.30, 0.78, vNrmW.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.96, 0.99),
          uSnowLay * upFace * 0.82);

        if (uGhost > 0.5) {
          diffuseColor.rgb = mix(diffuseColor.rgb, uGhostColor, 0.55);
        }
        totalEmissiveRadiance += uLampWarm * vEmis * uNight * 2.1;
      `);
  };
  m.customProgramCacheKey = () => 'part' + (opt.ghost ? 'G' : '') + (opt.transparent ? 'T' : '');
  return m;
}

/** Flat unlit material for overlays: lot outlines, grid, selection rings. */
export function makeOverlayMaterial(color, opacity = 0.8) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
}

// ---------------------------------------------------------------------------
// SKY
// ---------------------------------------------------------------------------
export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uNight: SKY_U.uNight,
      uTime: SKY_U.uTime,
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.2) },
      uHorizonDay: { value: new THREE.Color(0xbfe4f2) },
      uZenithDay: { value: new THREE.Color(0x4f9fd4) },
      uHorizonNight: { value: new THREE.Color(0x1b2340) },
      uZenithNight: { value: new THREE.Color(0x060a18) },
      uDusk: { value: new THREE.Color(0xff9d5c) },
      uDuskAmt: { value: 0 },
      uOvercast: { value: 0 },
      uOvercastCol: { value: new THREE.Color(0xa8b4bf) },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w; // always on the far plane
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform float uNight, uTime, uDuskAmt, uOvercast;
      uniform vec3 uOvercastCol;
      uniform vec3 uSunDir, uHorizonDay, uZenithDay, uHorizonNight, uZenithNight, uDusk;

      float h21(vec2 p){
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        float t = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 day = mix(uHorizonDay, uZenithDay, pow(t, 0.62));
        vec3 night = mix(uHorizonNight, uZenithNight, pow(t, 0.5));
        vec3 col = mix(day, night, uNight);

        // dusk / dawn warmth banked around the sun's azimuth
        float sunAlign = max(0.0, dot(normalize(vDir), normalize(uSunDir)));
        float band = pow(1.0 - abs(vDir.y), 3.0);
        col = mix(col, uDusk, uDuskAmt * band * (0.35 + 0.65 * pow(sunAlign, 2.0)));

        // sun / moon disc + bloom, hidden behind cloud
        float clear = 1.0 - uOvercast;
        float disc = smoothstep(0.9985, 0.9995, sunAlign);
        float bloom = pow(sunAlign, 220.0);
        col += mix(vec3(1.0, 0.94, 0.78), vec3(0.8, 0.86, 1.0), uNight)
             * (disc * 1.6 + bloom * 0.5) * clear;

        /*
         * Cloud cover. Not a texture — a soft ramp toward one grey that is
         * heaviest overhead and lifts a little at the horizon, which is how an
         * overcast sky actually reads: brightest where it is thinnest. A couple
         * of very broad sine bands keep it from being a flat wash.
         */
        if (uOvercast > 0.001) {
          float lump = sin(vDir.x * 2.7 + uTime * 0.02) * sin(vDir.z * 2.1 - uTime * 0.015);
          vec3 cloud = uOvercastCol * (0.94 + lump * 0.06);
          cloud = mix(cloud * 1.06, cloud * 0.86, pow(t, 0.8));
          cloud *= mix(1.0, 0.16, uNight);
          col = mix(col, cloud, uOvercast * (0.55 + 0.35 * pow(t, 0.7)));
        }

        // stars — cloud puts them out
        if (uNight > 0.02 && vDir.y > 0.0 && uOvercast < 0.85) {
          vec2 sp = vDir.xz / max(0.08, vDir.y + 0.35) * 90.0;
          vec2 cell = floor(sp);
          float r = h21(cell);
          if (r > 0.955) {
            vec2 f = fract(sp) - 0.5;
            float d = 1.0 - smoothstep(0.0, 0.13, length(f));
            float tw = 0.55 + 0.45 * sin(uTime * 1.7 + r * 62.0);
            col += vec3(0.88, 0.92, 1.0) * d * tw * uNight * (0.5 + r * 1.4) * clear;
          }
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}
