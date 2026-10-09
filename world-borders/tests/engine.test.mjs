// Run: node tests/engine.test.mjs   (from world-borders/)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  haversineKm, initialBearing, compassPoint, formatKm, decodeTopology,
  createGame, makeGuess, giveUp, referenceDistance, guessCount, cameraDistanceForSpan,
  rhumbBearing, directionClue, useClue, countryAt, pickCountry, DIFFICULTY, targetPool, sortCountries,
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

check('rhumbBearing: map-intuitive directions, wraps the antimeridian', () => {
  close(rhumbBearing([0, 0], [0, 10]), 90, 1e-9, 'east');
  close(rhumbBearing([0, 0], [10, 0]), 0, 1e-9, 'north');
  assert.equal(compassPoint(rhumbBearing(C('GBR').latlng, C('AUS').latlng)), 'SE');   // great-circle would say E/NE
  assert.equal(compassPoint(rhumbBearing(C('GBR').latlng, C('IND').latlng)), 'SE');
  assert.equal(compassPoint(rhumbBearing(C('JPN').latlng, C('USA').latlng)), 'E');    // crosses the antimeridian
  assert.equal(compassPoint(rhumbBearing(C('USA').latlng, C('JPN').latlng)), 'W');
});

check('directionClue / useClue: from start and latest guess; clue count is recorded', () => {
  let g = createGame(countries, 'GBR', { rng: () => 0, pool: ['AUS'] });
  let c = directionClue(g, countries);
  assert.equal(c.fromStart.code, 'GBR'); assert.equal(c.fromStart.compass, 'SE'); assert.equal(c.fromLast, null);
  g = makeGuess(g, countries, 'JPN').game;
  c = directionClue(g, countries);
  assert.equal(c.fromLast.code, 'JPN'); assert.equal(c.fromLast.compass, 'S');
  assert.equal(g.cluesUsed, 0);
  g = useClue(useClue(g));
  assert.equal(g.cluesUsed, 2);
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

check('countryAt: finds countries by point, respects holes, falls back to shapeless specks', () => {
  const topo = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url), 'utf8'));
  const feats = decodeTopology(topo);
  assert.equal(countryAt(feats, countries, 51.5, -0.1), 'GBR');     // London
  assert.equal(countryAt(feats, countries, 48.86, 2.35), 'FRA');    // Paris
  assert.equal(countryAt(feats, countries, 45.3, 34.4), 'UKR');     // central Crimea
  assert.equal(countryAt(feats, countries, 43.07, 12.6), 'ITA');    // Umbria
  assert.equal(countryAt(feats, countries, -29.6, 28.2), 'LSO');    // Lesotho (hole in South Africa)
  assert.equal(countryAt(feats, countries, -29.5, 27.0), 'ZAF');    // Free State, just outside the hole
  assert.equal(countryAt(feats, countries, 36.14, -5.35), 'GIB');   // no polygon at 50m
  assert.equal(countryAt(feats, countries, 40, -40), null);         // mid-Atlantic
  // Synthetic hole check independent of the data.
  const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const f = [{ code: 'OUT', polygons: [[sq(0, 0, 10, 10), sq(4, 4, 6, 6)]] }, { code: 'IN', polygons: [[sq(4, 4, 6, 6)]] }];
  assert.equal(countryAt(f, [], 2, 2), 'OUT');
  assert.equal(countryAt(f, [], 5, 5), 'IN');
});

check('pickCountry: tolerant clicks snap to small countries and nearby coasts', () => {
  const topo = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url), 'utf8'));
  const feats = decodeTopology(topo);
  const lca = C('LCA'), mtq = C('MTQ');
  assert.ok(lca.span < 1.5 && mtq.span < 1.5, 'both are small');
  // Inside Saint Lucia: exact wins even with a generous tolerance and Martinique nearby.
  assert.equal(pickCountry(feats, countries, lca.latlng[0], lca.latlng[1], 1.0), 'LCA');
  // Just offshore of Saint Lucia (sea): snaps to it within tolerance, null without.
  assert.equal(pickCountry(feats, countries, lca.latlng[0], lca.latlng[1] - 0.6, 0), null);
  assert.equal(pickCountry(feats, countries, lca.latlng[0], lca.latlng[1] - 0.6, 0.6), 'LCA');
  // Near Vatican City but on Italian soil: the small country steals the click.
  const vat = C('VAT');
  assert.equal(countryAt(feats, countries, vat.latlng[0] + 0.05, vat.latlng[1] + 0.05), 'ITA');
  assert.equal(pickCountry(feats, countries, vat.latlng[0] + 0.05, vat.latlng[1] + 0.05, 0.15), 'VAT');
  // Deep inside France, far from any small country: France.
  assert.equal(pickCountry(feats, countries, 47.0, 2.5, 0.5), 'FRA');
  // Mid-Atlantic stays null even with tolerance.
  assert.equal(pickCountry(feats, countries, 40, -40, 1.0), null);
  // Shapeless speck by proximity.
  assert.equal(pickCountry(feats, countries, 36.3, -5.5, 0.4), 'GIB');
});

check('DIFFICULTY: three levels; createGame records it and rejects unknown ones', () => {
  assert.deepEqual(Object.keys(DIFFICULTY), ['easy', 'intermediate', 'hard']);
  assert.equal(DIFFICULTY.easy.names && DIFFICULTY.easy.click && DIFFICULTY.easy.distances && DIFFICULTY.easy.bearings, true);
  assert.equal(DIFFICULTY.intermediate.names && DIFFICULTY.intermediate.distances && !DIFFICULTY.intermediate.bearings && DIFFICULTY.intermediate.clueButton, true);
  assert.equal(!DIFFICULTY.hard.names && DIFFICULTY.hard.distances && !DIFFICULTY.hard.bearings, true);
  const g = createGame(countries, 'GBR', { rng: () => 0, pool: ['AUS'], difficulty: 'easy' });
  assert.equal(g.difficulty, 'easy'); assert.equal(g.startCompass, 'SE');
  assert.equal(createGame(countries, 'GBR', { rng: () => 0 }).difficulty, 'hard');
  assert.throws(() => createGame(countries, 'GBR', { difficulty: 'brutal' }));
  const r = makeGuess(g, countries, 'JPN').result;
  assert.equal(r.compass, 'S');
  const c = directionClue(g, countries);
  close(c.fromStart.distanceKm, g.startDistanceKm, 1e-9, 'clue carries distance');
});

check('easy pool: 50 distinct, valid codes; Easy targets come only from it, other levels from everywhere', () => {
  const pool = data.pools.easy.codes;
  assert.equal(pool.length, 50); assert.equal(new Set(pool).size, 50);
  for (const code of pool) assert.ok(C(code), `pool code ${code}`);
  assert.deepEqual(pool.slice(0, 10), ['ESP', 'FRA', 'ITA', 'TUR', 'USA', 'GRC', 'PRT', 'IRL', 'DEU', 'POL']);
  assert.equal(targetPool('easy', data.pools), pool);
  assert.equal(targetPool('hard', data.pools), null);
  assert.throws(() => targetPool('easy', {}), /missing/);
  const poolSet = new Set(pool);
  for (let i = 0; i < 200; i++) {
    const g = createGame(countries, 'GBR', { rng: () => i / 200, difficulty: 'easy', pools: data.pools });
    assert.ok(poolSet.has(g.targetCode), `easy target ${g.targetCode} in pool`);
  }
  // Starting from a pool member never yields itself; the pool still has 49 options.
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(createGame(countries, 'ESP', { rng: () => i / 200, difficulty: 'easy', pools: data.pools }).targetCode);
  assert.equal(seen.size, 49); assert.ok(!seen.has('ESP'));
  // Hard can land outside the pool.
  const hardSeen = new Set();
  for (let i = 0; i < 250; i++) hardSeen.add(createGame(countries, 'GBR', { rng: () => i / 250, difficulty: 'hard', pools: data.pools }).targetCode);
  assert.ok([...hardSeen].some((c) => !poolSet.has(c)));
});

check('data: every country has a continent and a designation', () => {
  const continents = new Set(countries.map((c) => c.continent));
  assert.deepEqual([...continents].sort(), ['Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'Oceania', 'South America']);
  assert.equal(C('BRA').continent, 'South America'); assert.equal(C('JAM').continent, 'North America');
  assert.equal(C('GBR').designation, 'UN member'); assert.equal(C('BMU').designation, 'Territory of United Kingdom');
  assert.equal(C('VAT').designation, 'UN observer'); assert.equal(C('UNK').designation, 'Partially recognised');
  assert.equal(C('ATA').designation, 'Antarctic Treaty'); assert.equal(C('ESH').designation, 'Disputed');
  for (const c of countries) assert.ok(c.designation && c.continent, `${c.code} designation/continent`);
});

check('sortCountries: numeric keys with nulls last, text keys by locale, stable by name', () => {
  const byPop = sortCountries(countries, 'population', 'desc');
  assert.equal(byPop[0].code, 'CHN'); assert.equal(byPop[1].code, 'IND');
  assert.equal(byPop[byPop.length - 1].population == null || byPop[byPop.length - 1].population === 0, true);
  const byPopAsc = sortCountries(countries, 'population', 'asc');
  assert.ok(byPopAsc.every((c, i) => i === 0 || c.population == null || byPopAsc[i - 1].population == null || byPopAsc[i - 1].population <= c.population));
  const firstNull = byPopAsc.findIndex((c) => c.population == null);
  assert.ok(firstNull === -1 || byPopAsc.slice(firstNull).every((c) => c.population == null), 'nulls at the end even ascending');
  assert.ok(sortCountries([{ name: 'a', population: null, borders: [] }, { name: 'b', population: 5, borders: [] }], 'population', 'asc')[0].name === 'b');
  assert.equal(sortCountries(countries, 'area', 'desc')[0].code, 'RUS');
  const byN = sortCountries(countries, 'neighbours', 'desc');
  assert.equal(byN[0].code, 'CHN'); assert.equal(byN[1].code, 'RUS');
  const byName = sortCountries(countries, 'name', 'asc');
  assert.equal(byName[0].code, 'AFG');
  const byCont = sortCountries(countries, 'continent', 'asc');
  assert.equal(byCont[0].continent, 'Africa'); assert.equal(byCont[0].code, 'DZA'); // ties broken by name
  assert.equal(sortCountries(countries, 'name', 'desc')[0].code, 'ZWE');
  assert.equal(countries.length, 250, 'input not mutated');
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
  assert.equal(cameraDistanceForSpan(0.01), 1.12);
  assert.ok(cameraDistanceForSpan(10) < cameraDistanceForSpan(40));
  assert.equal(cameraDistanceForSpan(360), cameraDistanceForSpan(90));
  assert.equal(cameraDistanceForSpan(1000), 3.4);
});

console.log(`\n${n} checks passed`);
