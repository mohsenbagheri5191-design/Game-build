/**
 * Build-time fetch of real Toronto geometry from OpenStreetMap.
 *
 *   node build/fetch-osm.mjs [--out data/toronto-osm.json] [--endpoint URL]
 *
 * Writes a single JSON file that `build/bake.mjs` will pick up automatically
 * on its next run (see `loadOsm()` there). This never runs at play time — the
 * shipped page makes no network request at all.
 *
 * NOTE: this could not be run in the sandbox this project was built in; every
 * Overpass mirror and every municipal open-data host is blocked by the
 * environment's network policy (CONNECT returns 403). The script is written
 * against the documented Overpass API and the ingestion side of it is covered
 * by `build/test-osm-ingest.mjs`, which runs it against a fixture.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { BOUNDS, gridToLatLon } from './toronto-source.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = arg('--out', 'data/toronto-osm.json');
const ENDPOINT = arg('--endpoint', 'https://overpass-api.de/api/interpreter');

// The playable rectangle, in lat/lon, with a little margin.
const corners = [
  gridToLatLon(BOUNDS.uMin, BOUNDS.vMin), gridToLatLon(BOUNDS.uMax, BOUNDS.vMin),
  gridToLatLon(BOUNDS.uMin, BOUNDS.vMax), gridToLatLon(BOUNDS.uMax, BOUNDS.vMax),
];
const pad = 0.004;
const south = Math.min(...corners.map((c) => c.lat)) - pad;
const north = Math.max(...corners.map((c) => c.lat)) + pad;
const west = Math.min(...corners.map((c) => c.lon)) - pad;
const east = Math.max(...corners.map((c) => c.lon)) + pad;
const bbox = `${south.toFixed(5)},${west.toFixed(5)},${north.toFixed(5)},${east.toFixed(5)}`;

const QUERY = `
[out:json][timeout:600];
(
  way["building"](${bbox});
  relation["building"](${bbox});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service|pedestrian)$"](${bbox});
  way["railway"="rail"](${bbox});
  way["natural"="water"](${bbox});
  way["waterway"="riverbank"](${bbox});
  way["leisure"~"^(park|garden|pitch)$"](${bbox});
  way["landuse"~"^(grass|recreation_ground|cemetery)$"](${bbox});
  node["place"~"^(neighbourhood|suburb|quarter)$"](${bbox});
  node["railway"="station"](${bbox});
  node["amenity"~"^(school|university|hospital|townhall|theatre|library)$"](${bbox});
);
out geom;
`;

console.log(`Fetching OSM for bbox ${bbox}`);
console.log(`  endpoint: ${ENDPOINT}`);

let attempt = 0;
let json = null;
while (attempt < 4 && !json) {
  attempt++;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: QUERY }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    json = await res.json();
  } catch (e) {
    console.error(`  attempt ${attempt} failed: ${e.message}`);
    if (attempt >= 4) {
      console.error('\nCould not reach an Overpass endpoint.');
      console.error('Try a mirror, e.g.:');
      console.error('  node build/fetch-osm.mjs --endpoint https://overpass.kumi.systems/api/interpreter');
      console.error('\nThe bake falls back to the authored geography in');
      console.error('build/toronto-source.mjs, which is what currently ships.');
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

const elements = json.elements || [];
const counts = {};
for (const el of elements) {
  const k = el.tags?.building ? 'building'
    : el.tags?.highway ? 'highway'
      : el.tags?.railway ? 'railway'
        : el.tags?.natural || el.tags?.waterway ? 'water'
          : el.tags?.leisure || el.tags?.landuse ? 'green'
            : 'place';
  counts[k] = (counts[k] || 0) + 1;
}

mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true });
writeFileSync(OUT, JSON.stringify({ bbox, fetchedAt: Date.now(), elements }));
console.log(`Wrote ${OUT} — ${elements.length} elements`);
console.log(JSON.stringify(counts, null, 2));
console.log('\nNow run: node build/bake.mjs');
