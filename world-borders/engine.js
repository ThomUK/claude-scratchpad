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

/**
 * Rhumb-line bearing in degrees from a to b: the constant compass heading, which
 * matches what "north-east of" means on an ordinary map, unlike the great-circle
 * heading that can point over a pole for distant places.
 */
export function rhumbBearing(a, b) {
  const [lat1, lon1] = a.map(rad), [lat2, lon2] = b.map(rad);
  let dLon = lon2 - lon1;
  if (Math.abs(dLon) > Math.PI) dLon -= Math.sign(dLon) * 2 * Math.PI;
  const dPsi = Math.log(Math.tan(Math.PI / 4 + lat2 / 2) / Math.tan(Math.PI / 4 + lat1 / 2));
  return (deg(Math.atan2(dLon, dPsi)) + 360) % 360;
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

/** Is [lon, lat] inside a ring? Even-odd ray cast in plain lon/lat. */
function inRing(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Which country is at [lat, lon]? Checks decoded polygons (outer ring minus
 * holes); falls back to the nearest shapeless territory within ~1.5°.
 * Returns a code or null.
 */
export function countryAt(features, countries, lat, lon) {
  for (const f of features) {
    if (!f.code) continue;
    for (const poly of f.polygons) {
      if (!inRing(poly[0], lon, lat)) continue;
      if (poly.slice(1).some((hole) => inRing(hole, lon, lat))) continue;
      return f.code;
    }
  }
  let best = null, bestD = 1.5;
  for (const c of countries) {
    if (c.hasShape) continue;
    const d = Math.hypot(c.latlng[0] - lat, (c.latlng[1] - lon) * Math.cos(rad(lat)));
    if (d < bestD) { bestD = d; best = c.code; }
  }
  return best;
}

// -------------------------------------------------------------------- game --
/** What each difficulty reveals. */
export const DIFFICULTY = {
  easy: {
    label: 'Easy', names: true, click: true, distances: true, bearings: true, clueButton: false,
    blurb: 'Country names on the map, click the map to guess, and every guess shows its distance and compass direction.',
  },
  intermediate: {
    label: 'Intermediate', names: true, click: false, distances: true, bearings: false, clueButton: true,
    blurb: 'Country names on the map. Guesses show distance; a clue reveals the compass direction.',
  },
  hard: {
    label: 'Hard', names: false, click: false, distances: true, bearings: false, clueButton: true,
    blurb: 'No names on the map. Guesses show distance; a clue reveals the compass direction.',
  },
};

/**
 * Start a round. `countries` is the full list from data/countries.json;
 * `pool` (optional) restricts which codes may be the hidden target.
 */
export function createGame(countries, startCode, { rng = Math.random, pool = null, difficulty = 'hard' } = {}) {
  if (!DIFFICULTY[difficulty]) throw new Error(`unknown difficulty ${difficulty}`);
  const byCode = new Map(countries.map((c) => [c.code, c]));
  const start = byCode.get(startCode);
  if (!start) throw new Error(`unknown start country ${startCode}`);
  const candidates = (pool ? pool.map((c) => byCode.get(c)).filter(Boolean) : countries).filter((c) => c.code !== startCode);
  if (!candidates.length) throw new Error('no candidate targets');
  const target = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
  return {
    startCode, targetCode: target.code, difficulty,
    startDistanceKm: haversineKm(start.latlng, target.latlng),
    startCompass: compassPoint(rhumbBearing(start.latlng, target.latlng)),
    guesses: [], status: 'playing', cluesUsed: 0,
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
  const result = {
    code, distanceKm, referenceKm: ref, verdict,
    bearing: initialBearing(guessed.latlng, target.latlng),
    compass: compassPoint(rhumbBearing(guessed.latlng, target.latlng)),
  };
  const guesses = verdict === 'repeat' ? game.guesses : [...game.guesses, result];
  return { game: { ...game, guesses, status: verdict === 'correct' ? 'won' : 'playing' }, result };
}

/**
 * A clue: compass direction to the target from the start and from the latest
 * guess (null when there is none yet). Does not change the game; call useClue
 * to record that one was taken.
 */
export function directionClue(game, countries) {
  const byCode = new Map(countries.map((c) => [c.code, c]));
  const target = byCode.get(game.targetCode);
  const from = (code) => {
    const b = rhumbBearing(byCode.get(code).latlng, target.latlng);
    return { code, bearing: b, compass: compassPoint(b), distanceKm: haversineKm(byCode.get(code).latlng, target.latlng) };
  };
  const last = game.guesses.length ? game.guesses[game.guesses.length - 1].code : null;
  return { fromStart: from(game.startCode), fromLast: last ? from(last) : null };
}

export function useClue(game) {
  return { ...game, cluesUsed: (game.cluesUsed || 0) + 1 };
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
