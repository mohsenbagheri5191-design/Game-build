/**
 * Covers the OpenStreetMap ingestion path in build/bake.mjs against a fixture,
 * since no Overpass endpoint is reachable from this sandbox.
 *
 *   node build/test-osm-ingest.mjs
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as T from './toronto-source.mjs';
import { loadOsm, latLonToGrid, ringBounds } from './bake.mjs';

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};

// --- round trip: grid -> lat/lon -> grid ---
for (const [u, v] of [[0, 0], [-1414, 810], [1220, 2910], [-2012, -330]]) {
  const ll = T.gridToLatLon(u, v);
  const back = latLonToGrid(ll.lat, ll.lon);
  const err = Math.hypot(back.u - u, back.v - v);
  check(`grid->latlon->grid at (${u}, ${v})`, err < 0.6, `${err.toFixed(3)} m error`);
}

// --- fixture with both height and building:levels ---
mkdirSync('data', { recursive: true });
const els = [];
let id = 1;
const box = (u, v, tags) => {
  const ring = [[u - 12, v - 16], [u + 12, v - 16], [u + 12, v + 16], [u - 12, v + 16], [u - 12, v - 16]]
    .map(([a, b]) => { const ll = T.gridToLatLon(a, b); return { lat: ll.lat, lon: ll.lon }; });
  els.push({ type: 'way', id: id++, tags, geometry: ring });
};
box(-1374, 850, { building: 'yes', height: '42' });
box(-1344, 880, { building: 'yes', height: '18' });
box(-1300, 900, { building: 'commercial', height: '96' });
box(-1360, 860, { building: 'residential', 'building:levels': '7' });
box(-1310, 830, { building: 'yes' });                 // no height at all
els.push({ type: 'way', id: id++, tags: { highway: 'residential' }, geometry: [] }); // not a building
writeFileSync('data/osm-fixture.json', JSON.stringify({ bbox: 'fixture', elements: els }));

const osm = loadOsm('data/osm-fixture.json');
check('only buildings are ingested', osm.count === 5, `${osm.count} of 6 elements`);
check('explicit height read', osm.buildings.some((b) => b.height === 42));
check('building:levels converted', osm.buildings.some((b) => Math.abs(b.height - 7 * 3.4) < 0.01));
check('untagged height left null', osm.buildings.some((b) => b.height === null));

const bb = ringBounds(osm.buildings[0].ring);
check('ring bounds land in the playable area',
  bb.u0 > T.BOUNDS.uMin && bb.u1 < T.BOUNDS.uMax && bb.v0 > T.BOUNDS.vMin && bb.v1 < T.BOUNDS.vMax,
  `u ${bb.u0.toFixed(0)}..${bb.u1.toFixed(0)}, v ${bb.v0.toFixed(0)}..${bb.v1.toFixed(0)}`);
check('footprint keeps its real size', Math.abs((bb.u1 - bb.u0) - 24) < 1 && Math.abs((bb.v1 - bb.v0) - 32) < 1,
  `${(bb.u1 - bb.u0).toFixed(1)} x ${(bb.v1 - bb.v0).toFixed(1)} m`);

// --- the bake actually uses them ---
const out = execFileSync('node', ['build/bake.mjs'], {
  env: { ...process.env, OSM_FILE: 'data/osm-fixture.json' }, encoding: 'utf8',
});
const stats = JSON.parse(out.slice(out.indexOf('{')));
check('bake picks up the extract', stats.osmBuildings === 5, `${stats.osmBuildings} buildings`);
check('bake applies real heights to parcels', stats.osmMatchedParcels >= 3, `${stats.osmMatchedParcels} parcels matched`);
check('bake reports its height source', stats.heightSource.includes('openstreetmap'), stats.heightSource);

// restore the shipping bake (no extract)
execFileSync('node', ['build/bake.mjs'], { encoding: 'utf8' });
console.log('\nrebaked without the fixture — shipping data restored');
console.log(failures ? `\n${failures} FAILURES` : '\nAll OSM ingestion checks passed.');
process.exit(failures ? 1 : 0);
