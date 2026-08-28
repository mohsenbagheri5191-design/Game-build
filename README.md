# Toronto Builder

A low-poly city builder on the real streets of downtown Toronto. One
self-contained HTML file, portrait phone first, no network at play time.

## Playing it on a phone

Turn on GitHub Pages once — repository **Settings → Pages**, set *Source* to
**Deploy from a branch**, pick branch `claude/toronto-3d-map-rebuild-xp28b0`
and folder `/ (root)`, **Save**. A minute later the game is live at:

**https://mohsenbagheri5191-design.github.io/Game-build/**

Open that on the phone. On iOS, Share → **Add to Home Screen** and it runs
full screen with no browser chrome, like an app. It works offline after the
first load — the whole game is that one file, and it makes no network requests
once it is open.

Locally: just open `dist/index.html` in a browser. There is nothing to serve.

```
node build/bake.mjs                                  # geography -> compressed binary
node build/bundle.mjs --entry src/main.js --out dist/index.html
```

## What it is

You pan a real map of downtown Toronto, tap a lot, buy it, demolish whatever
stands there, and build your own thing on the cleared ground out of a kit of
101 modular parts. The streets, their names, the block structure and the named
landmarks are real. Everything social or economic is simulated on your device.

The one art direction is **low poly**. The map ships deliberately uncoloured;
every colour in the world is one you chose.

**Roofs are one piece.** Place one and it sizes itself to the building below.
Four handles appear, one per side; drag a handle to grow or shrink the roof from
that side, or tap `⤢ Fit to building` to re-fit it. It is generated as a single
watertight mesh at whatever size you choose — gable, hipped, single slope or
flat — so there are no tiles to line up and no seams to leave a gap. Awnings,
terraces and floor plates work the same way.

**The weather does something.** Rain dims the sun, closes the fog in, darkens
the roads and beads on what you built. Snow lies on whatever points up and gets
ploughed off the streets.

**The neighbours are building too.** Their towns start at different stages and
grow — roof, fence, garden, a second storey, an awning over the door — so the
street is different when you come back. Once a place is finished its owner
starts repainting instead.

**The walkthrough points at things.** Each step lights up the control it is
talking about rather than describing it and hoping.

**Nothing in the interface is an emoji.** All 79 icons were drawn for this
game on one grid at one stroke weight, and every one takes the colour of the
control it sits on.

## Layout

```
build/
  toronto-source.mjs   the real geography: streets, parks, landmarks, water
  bake.mjs             blocks -> parcels -> quantised binary -> gzip -> base64
  fetch-osm.mjs        optional: pull real OSM footprints to bake against
  bundle.mjs           esbuild -> one self-contained HTML file
  acceptance.mjs       the brief's Definition of Done, run against the build
  showcase.mjs         builds a structure with the kit, then screenshots it
  test-normals.mjs     proves every face points outward, offline and exactly
  test-icons.mjs       no emoji, no cold greys, every icon accounted for
  shots-ui.mjs         renders every screen to dist/ui/ for looking at
  test-osm-ingest.mjs  covers the OSM path against a fixture
  shot.mjs / probe.mjs small harnesses for looking at the thing

src/
  core/    config (every tunable number), city decode, geo, inflate
  render/  materials, scenery generation, chunk streaming, stage, lot view
  camera/  the touch camera
  kit/     mesh builder, the 101 parts, spans (roof/awning/terrace/floor), decor
  game/    save (ledger-derived), world (lots + slots + tools), simulation
  ui/      sheets, screens, build bar, HUD, thumbnails, the drawn icon set
  audio/   synthesised cues and an ambient bed
```

## Commands

| | |
|---|---|
| `npm run bake` | Rebuild the city binary from `build/toronto-source.mjs` |
| `npm run build` | Bake, then bundle to `dist/index.html` (minified) |
| `npm run dev` | Same, unminified |
| `npm run test` | All three suites: geometry, icons, then the checklist |
| `npm run test:normals` | Face winding across every primitive, part and span |
| `npm run test:icons` | No emoji, no cold greys, every icon exists |
| `npm run shots:ui` | Render every screen to `dist/ui/` for looking at |
| `npm run test:osm` | The OpenStreetMap ingestion path, against a fixture |
| `npm run shots` | Build a structure with the kit and screenshot it |
| `npm run fetch-osm` | Pull a real OSM extract (needs network) |

## Debug URL parameters

| | |
|---|---|
| `?perf` | Frame rate, chunk and draw-call overlay |
| `?t=21.5` | Pin the clock to an hour |
| `?q=low\|medium\|high` | Force a graphics quality |
| `?notut` | Skip the first-run walkthrough |

## Numbers

| | |
|---|---|
| Page | 966 KB (354 KB gzipped), one file, no external requests |
| Playable area | 14.5 km² of downtown Toronto |
| Lots | 22,331 |
| Named streets | 96 |
| Named places | 78 |
| Named landmarks | 65, with real heights (CN Tower 553 m) |
| Parks and squares | 35 |
| Kit parts | 101, all generated in code |
| City data | 130 KB compressed, 191 KB raw (8.8 bytes per lot) |
| Save | ~31 KB with a built lot |

See `REPORT.md` for the full test results and an honest account of what is
weak, and `ATTRIBUTION.md` for licences and for exactly which parts of the
geography are surveyed and which are derived.
