// Run: node tests/engine.test.mjs   (from world-borders/)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  haversineKm, initialBearing, compassPoint, formatKm, decodeTopology,
  createGame, makeGuess, giveUp, referenceDistance, guessCount, cameraDistanceForSpan,
} from '../engine.js';

let n = 0;
function check(name, fn) { fn(); n++; console.log('  ok  ' + name); }
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

const data = JSON.parse(readFileSync(new URL('../data/countries.json', import.meta.url), 'utf8'));
const countries = data.countries;
const C = (code) => countries.find((c) => c.code === code);

check('haversine: London to Paris ≈ 344 km, antipodes ≈ 20,015 km, zero for same point', () => {
  close(haversineKm([51.5074, -0.1278], [48.8566, 2.3522]), 344, 2, 'London-Paris');
  close(haversineKm([0, 0], [0, 180]), 20015, 2, 'antipodes');
  assert.equal(haversineKm([10, 10], [10, 10]), 0);
});

check('bearing and compass: due east along the equator, due north up a meridian', () => {
  close(initialBearing([0, 0], [0, 10]), 90, 1e-9, 'east');
  close(initialBearing([0, 0], [10, 0]), 0, 1e-9, 'north');
  assert.equal(compassPoint(90), 'E'); assert.equal(compassPoint(359), 'N');
  assert.equal(compassPoint(210), 'SW'); assert.equal(compassPoint(-45), 'NW');
});

check('formatKm rounds and groups thousands', () => {
  assert.equal(formatKm(1234.6), '1,235 km');
  assert.equal(formatKm(0.2), '0 km');
});

check('decodeTopology: reverses negative arc indices and dequantizes', () => {
  // A unit square from two arcs; the second is used reversed.
  const topo = {
    transform: { scale: [0.5, 0.5], translate: [10, 20] },
    arcs: [
      [[0, 0], [2, 0], [0, 2]],   // (10,20) -> (11,20) -> (11,21)
      [[0, 0], [0, 2], [2, 0]],   // (10,20) -> (10,21) -> (11,21)
    ],
    objects: { u: { type: 'GeometryCollection', geometries: [
      { type: 'Polygon', properties: { c: 'XX' }, arcs: [[0, -2]] },
      { type: 'MultiPolygon', properties: { c: null }, arcs: [[[0, -2]], [[0, -2]]] },
    ] } },
  };
  const f = decodeTopology(topo);
  assert.equal(f.length, 2);
  assert.equal(f[0].code, 'XX');
  assert.deepEqual(f[0].polygons[0][0], [[10, 20], [11, 20], [11, 21], [10, 21], [10, 20]]);
  assert.equal(f[1].code, null); assert.equal(f[1].polygons.length, 2);
});

check('data: 250 countries, every one has latlng, facts, and a resolvable border list', () => {
  assert.equal(countries.length, 250);
  const codes = new Set(countries.map((c) => c.code));
  for (const c of countries) {
    assert.ok(Array.isArray(c.latlng) && c.latlng.length === 2, `${c.code} latlng`);
    assert.ok(c.facts.length >= 1, `${c.code} facts`);
    for (const b of c.borders) assert.ok(codes.has(b), `${c.code} border ${b}`);
    if (c.dependentOf) assert.ok(codes.has(c.dependentOf), `${c.code} dependentOf`);
  }
  // Dependents get their dependency as the first fact.
  assert.match(C('BMU').facts[0], /British Overseas Territory/);
  assert.match(C('GRL').facts[0], /Kingdom of Denmark/);
  assert.match(C('VAT').facts[0], /not a member of the United Nations/);
});

check('data: world.json decodes and covers every country except the three with no 50m shape', () => {
  const topo = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url), 'utf8'));
  const feats = decodeTopology(topo);
  const shaped = new Set(feats.map((f) => f.code).filter(Boolean));
  const missing = countries.filter((c) => !shaped.has(c.code)).map((c) => c.code).sort();
  assert.deepEqual(missing, ['BVT', 'GIB', 'UMI']);
  for (const c of countries) assert.equal(c.hasShape, shaped.has(c.code), `${c.code} hasShape`);
  for (const f of feats) for (const poly of f.polygons) for (const ring of poly) {
    assert.ok(ring.length >= 4, 'ring has at least 4 points');
    for (const [lon, lat] of ring) assert.ok(lon >= -180.01 && lon <= 180.01 && lat >= -90.01 && lat <= 90.01, 'coords in range');
  }
});

check('createGame: never picks the start as the target; honours the pool and rng', () => {
  const g = createGame(countries, 'GBR', { rng: () => 0, pool: ['GBR', 'FRA'] });
  assert.equal(g.targetCode, 'FRA'); assert.equal(g.status, 'playing');
  close(g.startDistanceKm, haversineKm(C('GBR').latlng, C('FRA').latlng), 1e-9, 'start distance');
  const g2 = createGame(countries, 'GBR', { rng: () => 0.999999 });
  assert.notEqual(g2.targetCode, 'GBR');
  assert.throws(() => createGame(countries, 'ZZZ'));
});

check('makeGuess: warmer/cooler relative to the previous guess, first guess relative to the start', () => {
  // Start UK, target Japan. Guess France (further from Japan than UK? no: closer) ...
  let g = createGame(countries, 'GBR', { rng: () => 0, pool: ['JPN'] });
  assert.equal(g.targetCode, 'JPN');
  const dUK = g.startDistanceKm;
  let r = makeGuess(g, countries, 'IND'); g = r.game;          // India: much closer to Japan than the UK
  assert.equal(r.result.verdict, 'warmer'); close(r.result.referenceKm, dUK, 1e-9, 'ref is start');
  r = makeGuess(g, countries, 'BRA'); g = r.game;              // Brazil: further than India
  assert.equal(r.result.verdict, 'cooler'); assert.ok(r.result.referenceKm < dUK);
  r = makeGuess(g, countries, 'KOR'); g = r.game;              // Korea: closer than Brazil
  assert.equal(r.result.verdict, 'warmer');
  assert.equal(guessCount(g), 3);
  close(referenceDistance(g), r.result.distanceKm, 1e-9, 'reference tracks last guess');
  r = makeGuess(g, countries, 'JPN'); g = r.game;
  assert.equal(r.result.verdict, 'correct'); assert.equal(g.status, 'won'); assert.equal(guessCount(g), 4);
  assert.throws(() => makeGuess(g, countries, 'FRA'), /over/);
});

check('makeGuess: repeats and the start country are flagged and not counted', () => {
  let g = createGame(countries, 'GBR', { rng: () => 0, pool: ['JPN'] });
  let r = makeGuess(g, countries, 'IND'); g = r.game;
  r = makeGuess(g, countries, 'IND');
  assert.equal(r.result.verdict, 'repeat'); assert.equal(guessCount(r.game), 1);
  r = makeGuess(g, countries, 'GBR');
  assert.equal(r.result.verdict, 'repeat');
  assert.throws(() => makeGuess(g, countries, 'ZZZ'));
});

check('giveUp ends the round without a win', () => {
  const g = giveUp(createGame(countries, 'GBR', { rng: () => 0 }));
  assert.equal(g.status, 'gaveup');
});

check('cameraDistanceForSpan: monotone, clamped, and tolerant of antimeridian spans', () => {
  assert.equal(cameraDistanceForSpan(0.01), 1.55);
  assert.ok(cameraDistanceForSpan(10) < cameraDistanceForSpan(40));
  assert.equal(cameraDistanceForSpan(360), cameraDistanceForSpan(90));
  assert.equal(cameraDistanceForSpan(1000), 3.4);
});

console.log(`\n${n} checks passed`);
