// World Borders: DOM-free game engine + TopoJSON decoding. Unit-tested with
// `node tests/engine.test.mjs`; the browser app (app.js, globe.js) only renders.

// ---------------------------------------------------------------- geometry --
const R_EARTH_KM = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Great-circle distance in km between two [lat, lon] pairs (haversine). */
export function haversineKm(a, b) {
  const [lat1, lon1] = a.map(rad), [lat2, lon2] = b.map(rad);
  const dLat = lat2 - lat1, dLon = lon2 - lon1;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing in degrees (0 = north, clockwise) from a to b. */
export function initialBearing(a, b) {
  const [lat1, lon1] = a.map(rad), [lat2, lon2] = b.map(rad);
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** Eight-point compass name for a bearing in degrees. */
export function compassPoint(bearing) {
  return POINTS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

/** "1,234 km" style formatting. */
export function formatKm(km) {
  return `${Math.round(km).toLocaleString('en-GB')} km`;
}

// ----------------------------------------------------------------- TopoJSON --
/**
 * Decode a quantized TopoJSON topology into a flat list of
 * { code, polygons: [ [outerRing, hole, ...], ... ] } with [lon, lat] rings.
 * Only what the globe needs; no dependency on topojson-client.
 */
export function decodeTopology(topo) {
  const { scale, translate } = topo.transform || { scale: [1, 1], translate: [0, 0] };
  const arcs = topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => {
      x += dx; y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
  const ring = (idx) => {
    const out = [];
    for (const i of idx) {
      const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      // Consecutive arcs share their end/start point; drop the duplicate.
      for (let k = out.length ? 1 : 0; k < a.length; k++) out.push(a[k]);
    }
    return out;
  };
  const features = [];
  for (const obj of Object.values(topo.objects)) {
    const geoms = obj.type === 'GeometryCollection' ? obj.geometries : [obj];
    for (const g of geoms) {
      const code = g.properties ? g.properties.c : null;
      let polygons = [];
      if (g.type === 'Polygon') polygons = [g.arcs.map(ring)];
      else if (g.type === 'MultiPolygon') polygons = g.arcs.map((p) => p.map(ring));
      else continue;
      // Quantization can collapse a speck of an island to <4 points; drop those rings.
      polygons = polygons.map((p) => p.filter((r) => r.length >= 4)).filter((p) => p.length);
      if (polygons.length) features.push({ code: code ?? null, polygons });
    }
  }
  return features;
}

// -------------------------------------------------------------------- game --
/**
 * Start a round. `countries` is the full list from data/countries.json;
 * `pool` (optional) restricts which codes may be the hidden target.
 */
export function createGame(countries, startCode, { rng = Math.random, pool = null } = {}) {
  const byCode = new Map(countries.map((c) => [c.code, c]));
  const start = byCode.get(startCode);
  if (!start) throw new Error(`unknown start country ${startCode}`);
  const candidates = (pool ? pool.map((c) => byCode.get(c)).filter(Boolean) : countries).filter((c) => c.code !== startCode);
  if (!candidates.length) throw new Error('no candidate targets');
  const target = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
  return {
    startCode, targetCode: target.code,
    startDistanceKm: haversineKm(start.latlng, target.latlng),
    guesses: [], status: 'playing',
  };
}

/** Distance from the last non-repeat guess to the target, or from the start if none yet. */
export function referenceDistance(game) {
  const last = [...game.guesses].reverse().find((g) => g.verdict !== 'repeat');
  return last ? last.distanceKm : game.startDistanceKm;
}

/**
 * Register a guess. Returns { game, result }. Verdicts:
 *  correct | warmer | cooler | same | repeat (already guessed, not counted).
 */
export function makeGuess(game, countries, code) {
  if (game.status !== 'playing') throw new Error('round is over');
  const byCode = new Map(countries.map((c) => [c.code, c]));
  const guessed = byCode.get(code);
  if (!guessed) throw new Error(`unknown country ${code}`);
  const target = byCode.get(game.targetCode);
  const distanceKm = haversineKm(guessed.latlng, target.latlng);
  const ref = referenceDistance(game);
  let verdict;
  if (code === game.targetCode) verdict = 'correct';
  else if (code === game.startCode || game.guesses.some((g) => g.code === code)) verdict = 'repeat';
  else if (Math.abs(distanceKm - ref) < 0.5) verdict = 'same';
  else verdict = distanceKm < ref ? 'warmer' : 'cooler';
  const result = { code, distanceKm, referenceKm: ref, verdict, bearing: initialBearing(guessed.latlng, target.latlng) };
  const guesses = verdict === 'repeat' ? game.guesses : [...game.guesses, result];
  return { game: { ...game, guesses, status: verdict === 'correct' ? 'won' : 'playing' }, result };
}

export function giveUp(game) {
  return { ...game, status: 'gaveup' };
}

/** Guesses that count (everything recorded; repeats are never recorded). */
export function guessCount(game) {
  return game.guesses.length;
}

/**
 * Camera distance (sphere radius = 1) that frames a country whose bounding
 * box spans `spanDeg` degrees. Clamped so tiny places still show context and
 * huge ones still fit on screen.
 */
export function cameraDistanceForSpan(spanDeg) {
  const s = Math.min(spanDeg > 180 ? 90 : spanDeg, 120);
  return Math.min(3.4, Math.max(1.55, 1 + s * 0.06));
}
