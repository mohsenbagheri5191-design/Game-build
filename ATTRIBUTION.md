# Attribution and licences

## Code

**three.js** — MIT Licence. Copyright © 2010–2025 three.js authors.
<https://github.com/mrdoob/three.js>
Vendored from npm (`three@0.169.0`) and inlined into the built page.

Everything else in `src/` was written for this project.

## 3D models

**No third-party mesh ships in this page.** Every object the player can place
is generated in code at load time (`src/kit/`), which is why the whole kit of
100 items costs kilobytes rather than megabytes.

The *taxonomy* of the modular kit — which pieces a prototyping kit needs, and
how walls, floors, openings, stairs, posts and rails divide up — follows:

**Free 3D Modular Game Assets For Prototyping** by Raphael Gonçalves (Rgsdev).
Released under **CC0 1.0 Universal** (public domain dedication).
Credit is not required by the licence; it is given here anyway.
Instagram/Twitter: @rgs_dev · <https://www.patreon.com/rgsdev>

The pack's `Pieces/` directory (wall, wall door, wall window, wall corner,
floor/ground, ramp, stairs, stairs corner, ladder, pillar, railing, fence,
door, window, box, cube, cylinder, cone, sphere, torus, crate) is the source of
the part list in §10.1 of the brief and of the naming used in
`src/kit/parts.js`. The geometry itself is original: the pack's pieces are
untextured primitives, and the brief asks for parts that are detailed rather
than basic, so each one is modelled from scratch with chamfers, mouldings,
sills, slats, finials and real recessed openings.

## Geography

The Toronto data in `build/toronto-source.mjs` is compiled from public
knowledge of the city: the downtown survey grid, the real street names and
their real spacing, the block structure, the named parks and squares, the
transit stations, the neighbourhood names, and the named landmark buildings
with their real heights.

**This is not a survey, and it is not an OpenStreetMap extract.** See the
"What is weak" section of `REPORT.md` for exactly which parts are real
measurements and which are derived. In short:

| Real | Derived |
|---|---|
| Street names, classes and W/E splits | Individual parcel boundaries |
| Street-to-street distances and the grid's rotation | Infill building footprints |
| Block structure between real streets | Infill building heights (from district zones) |
| Park and square names and locations | Address numbers (computed from Toronto's own scheme) |
| Named landmarks: position by intersection, real heights | — |
| Toronto Islands, the harbour, the Don, the rail corridor | — |

`build/fetch-osm.mjs` exists to replace the derived half with a real
OpenStreetMap extract; it could not be run here because the sandbox's network
policy blocks every Overpass endpoint and every municipal open-data host. The
bake pipeline reads whatever GeoJSON it is given, so re-baking against real
footprints is a one-command change and does not touch the game.

OpenStreetMap data, if you do re-bake with it, is © OpenStreetMap contributors
and available under the Open Database Licence (ODbL).

## Fonts, images, audio

None are downloaded. The interface uses the system UI font stack. All sound is
synthesised with the Web Audio API at runtime (`src/audio/audio.js`). The only
image in the page is the favicon, an inline SVG data URI.

## Everything else

Every player, town, name, message, transaction, avatar, balance and tip in the
game is simulated on the device. There are no real accounts, no real payments,
no analytics, and no network requests of any kind after the page has loaded.
