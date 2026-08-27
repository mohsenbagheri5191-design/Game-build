# Toronto Builder

A low-poly city builder on the real streets of downtown Toronto. One
self-contained HTML file, portrait phone first, no network at play time.

Open `dist/index.html`. On iOS, Share → **Add to Home Screen** for the
standalone app.

```
node build/bake.mjs                                  # geography -> compressed binary
node build/bundle.mjs --entry src/main.js --out dist/index.html
```

## What it is

You pan a real map of downtown Toronto, tap a lot, buy it, demolish whatever
stands there, and build your own thing on the cleared ground out of a kit of
98 modular parts. The streets, their names, the block structure and the named
landmarks are real. Everything social or economic is simulated on your device.

The one art direction is **low poly**. The map ships deliberately uncoloured;
every colour in the world is one you chose.

**Roofs are one piece.** Place one and it sizes itself to the building below.
Four handles appear, one per side; drag a handle to grow or shrink the roof from
that side, or tap `⤢ Fit to building` to re-fit it. It is generated as a single
watertight mesh at whatever size you choose — gable, hipped, single slope or
flat — so there are no tiles to line up and no seams to leave a gap.

## Layout

```
build/
  toronto-source.mjs   the real geography: streets, parks, landmarks, water
  bake.mjs             blocks -> parcels -> quantised binary -> gzip -> base64
  fetch-osm.mjs        optional: pull real OSM footprints to bake against
  bundle.mjs           esbuild -> one self-contained HTML file
  acceptance.mjs       the brief's Definition of Done, run against the build
  showcase.mjs         builds a structure with the kit, then screenshots it
  test-osm-ingest.mjs  covers the OSM path against a fixture
  shot.mjs / probe.mjs small harnesses for looking at the thing

src/
  core/    config (every tunable number), city decode, geo, inflate
  render/  materials, scenery generation, chunk streaming, stage, lot view
  camera/  the touch camera
  kit/     mesh builder, the 98 parts, roofs, decor, avatar, colour
  game/    save (ledger-derived), world (lots + slots + tools), simulation
  ui/      sheets, screens, build bar, HUD, thumbnails
  audio/   synthesised cues and an ambient bed
```

## Commands

| | |
|---|---|
| `npm run bake` | Rebuild the city binary from `build/toronto-source.mjs` |
| `npm run build` | Bake, then bundle to `dist/index.html` (minified) |
| `npm run dev` | Same, unminified |
| `npm run test` | The Definition of Done checklist against the build |
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
| Page | 926 KB (341 KB gzipped), one file, no external requests |
| Playable area | 14.5 km² of downtown Toronto |
| Lots | 22,331 |
| Named streets | 96 |
| Named places | 78 |
| Named landmarks | 65, with real heights (CN Tower 553 m) |
| Parks and squares | 35 |
| Kit parts | 98, all generated in code |
| City data | 130 KB compressed, 191 KB raw (8.8 bytes per lot) |
| Save | ~30 KB with a built lot |

See `REPORT.md` for the full test results and an honest account of what is
weak, and `ATTRIBUTION.md` for licences and for exactly which parts of the
geography are surveyed and which are derived.
