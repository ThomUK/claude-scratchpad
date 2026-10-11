// Global Explorer: DOM-free game engine + TopoJSON decoding. Unit-tested with
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

const KM_PER_MILE = 1.609344;
/** Distance in the player's units: 'km' or 'mi'. */
export function formatDistance(km, units = 'km') {
  if (units === 'mi') return `${Math.round(km / KM_PER_MILE).toLocaleString('en-GB')} mi`;
  return formatKm(km);
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
  for (const [objName, obj] of Object.entries(topo.objects)) {
    const geoms = obj.type === 'GeometryCollection' ? obj.geometries : [obj];
    for (const g of geoms) {
      const code = g.properties ? g.properties.c : null;
      const hatch = objName === 'hatched' || !!(g.properties && g.properties.h);
      let polygons = [];
      if (g.type === 'Polygon') polygons = [g.arcs.map(ring)];
      else if (g.type === 'MultiPolygon') polygons = g.arcs.map((p) => p.map(ring));
      else continue;
      // Quantization can collapse a speck of an island to <4 points; drop those rings.
      polygons = polygons.map((p) => p.filter((r) => r.length >= 4)).filter((p) => p.length);
      if (polygons.length) features.push(hatch ? { code: code ?? null, polygons, hatch: true, name: g.properties.n || '' } : { code: code ?? null, polygons });
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
    if (!f.code || f.hatch) continue; // hatched overlays sit inside a country's own polygon
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

/**
 * Forgiving pick for map clicks. Exact containment wins for small countries;
 * otherwise a small country (span < 1.5°) whose outline lies within `tolDeg`
 * of the click beats the big country underneath (Vatican inside Rome, Monaco,
 * Gibraltar), and a click in the sea snaps to the nearest outline within
 * `tolDeg`. Returns a code or null.
 */
export function pickCountry(features, countries, lat, lon, tolDeg = 0) {
  const exact = countryAt(features, countries, lat, lon);
  if (tolDeg <= 0) return exact;
  const cosLat = Math.cos(rad(lat));
  // A shapeless speck (drawn as a dot) under the pointer wins outright: it has no area to hit.
  for (const c of countries) {
    if (c.hasShape) continue;
    if (Math.hypot((c.latlng[1] - lon) * cosLat, c.latlng[0] - lat) < tolDeg) return c.code;
  }
  const spanOf = new Map(countries.map((c) => [c.code, c.hasShape ? c.span : 0]));
  const isSmall = (code) => (spanOf.get(code) ?? 0) < 1.5;
  if (exact && isSmall(exact)) return exact;
  let best = null, bestD = tolDeg;
  for (const f of features) {
    if (!f.code || f.hatch || f.code === exact) continue;
    if (exact && !isSmall(f.code)) continue; // over land, only a small neighbour can steal the click
    for (const poly of f.polygons) for (const ring of poly) for (const [x, y] of ring) {
      const d = Math.hypot((x - lon) * cosLat, y - lat);
      if (d < bestD) { bestD = d; best = f.code; }
    }
  }
  return best ?? exact;
}

/**
 * Sort countries for the reference table. Numeric keys sort numbers with
 * nulls last; other keys sort as text. `dir` is 'asc' or 'desc'. Ties and
 * equal values fall back to name order so the result is stable.
 */
export const NUMERIC_KEYS = new Set(['population', 'area', 'density', 'coastline', 'neighbours', 'difficulty', 'visited']);
/** The lowest level a country can be the mystery country on: 1 Easy, 2 Intermediate, 3 Advanced. */
export function difficultyTier(c, pools) {
  if (pools && pools.easy && pools.easy.codes.includes(c.code)) return 1;
  if (pools && pools.un ? pools.un.codes.includes(c.code) : c.unMember) return 2;
  return 3;
}
export function sortCountries(countries, key, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  const val = (c) => (key === 'neighbours' ? c.borders.length : key === 'difficulty' ? c.tier : key === 'visited' ? (c.visited ? 1 : 0) : c[key]);
  return [...countries].sort((a, b) => {
    const x = val(a), y = val(b);
    let r;
    if (NUMERIC_KEYS.has(key)) {
      if (x == null && y == null) r = 0;
      else if (x == null) return 1;
      else if (y == null) return -1;
      else r = x - y;
    } else r = String(x).localeCompare(String(y), 'en');
    return r !== 0 ? r * sign : a.name.localeCompare(b.name, 'en');
  });
}

// -------------------------------------------------------------------- game --
/**
 * The three levels. Every level shows distance and direction for every guess;
 * what changes is the pool, whether names are on the map, and how you guess:
 *   names    – country names on the globe during a round (Advanced reveals
 *              each one as it is guessed)
 *   click    – tap the globe to guess (Advanced taps only ring the shape)
 *   type     – type the name to guess
 *   clueMark – clues used are marked on the stamp earned
 */
export const DIFFICULTY = {
  easy: {
    label: 'Easy', names: true, click: true, type: false, clueMark: false, pool: 'easy',
    blurb: 'Names on the map; tap a country to guess. The mystery country is one of the 80 commonly visited countries. Clues are free.',
  },
  intermediate: {
    label: 'Intermediate', names: true, click: true, type: false, clueMark: true, pool: 'un',
    blurb: 'Names on the map; tap a country to guess. The mystery country is one of the 193 United Nations countries. Clues you use are marked on your stamp.',
  },
  hard: {
    label: 'Advanced', names: false, click: false, type: true, clueMark: true, pool: null,
    blurb: 'No names on the map; type your guesses, and each name appears as you guess it. The mystery country can be any of the 250 countries and territories. Clues you use are marked on your stamp.',
  },
};

/**
 * Start a round. `countries` is the full list from data/countries.json;
 * `pool` (optional) restricts which codes may be the hidden target.
 */
/** The codes a difficulty may pick its target from (null = every country). `pools` is data/countries.json's `pools`. */
export function targetPool(difficulty, pools) {
  const key = DIFFICULTY[difficulty]?.pool;
  if (!key) return null;
  const p = pools && pools[key];
  if (!p || !p.codes || !p.codes.length) throw new Error(`pool "${key}" missing from data`);
  return p.codes;
}

/** The rules a round plays by, from saved settings: the chosen level, or Easy when the setting is missing or unknown. */
export function resolveRules(settings = {}) {
  const preset = DIFFICULTY[settings.preset] ? settings.preset : 'easy';
  const { blurb, ...rules } = DIFFICULTY[preset];
  return { ...rules, preset };
}

/** How many clues a round can give: one per rung of the clue ladder. */
export const MAX_CLUES = 4;

/**
 * The n-th clue (1-based) about the mystery country, as text: its continent,
 * the first letter of its name, a neighbour (or that it has none), then its
 * flag. Null once the ladder is used up.
 */
export function clueText(game, countries, n) {
  const byCode = new Map(countries.map((c) => [c.code, c]));
  const t = byCode.get(game.targetCode);
  if (!t) return null;
  switch (n) {
    case 1: return `The mystery country is in ${t.continent}.`;
    case 2: return `Its name starts with "${t.name[0]}".`;
    case 3: {
      const others = (t.borders || []).map((b) => byCode.get(b)).filter(Boolean);
      if (!others.length) return t.landlocked ? 'It has no land borders.' : 'It has no land borders: it is an island, or a group of them.';
      const pick = others[Math.floor(((game.startDistanceKm || 0) * 7) % others.length)]; // fixed per round, different between rounds
      return `It shares a border with ${pick.name}.`;
    }
    case 4: return `Its flag is ${t.flag}.`;
    default: return null;
  }
}

export function createGame(countries, startCode, { rng = Math.random, pool = null, difficulty = 'easy', pools = null, rules = null } = {}) {
  if (!rules && !DIFFICULTY[difficulty]) throw new Error(`unknown difficulty ${difficulty}`);
  if (rules) difficulty = rules.preset;
  if (pool == null && pools) {
    if (rules) { const p = rules.pool && pools[rules.pool]; pool = p ? p.codes : null; }
    else pool = targetPool(difficulty, pools);
  }
  const byCode = new Map(countries.map((c) => [c.code, c]));
  const start = byCode.get(startCode);
  if (!start) throw new Error(`unknown start country ${startCode}`);
  const candidates = (pool ? pool.map((c) => byCode.get(c)).filter(Boolean) : countries).filter((c) => c.code !== startCode);
  if (!candidates.length) throw new Error('no candidate targets');
  const target = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
  return {
    startCode, targetCode: target.code, difficulty, rules: rules || resolveRules({ preset: difficulty }),
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
  if ((game.cluesUsed || 0) >= MAX_CLUES) return game;
  return { ...game, cluesUsed: (game.cluesUsed || 0) + 1 };
}

export function giveUp(game) {
  return { ...game, status: 'gaveup' };
}

/** Guesses that count (everything recorded; repeats are never recorded). */
export function guessCount(game) {
  return game.guesses.length;
}

/** Score for a finished round: lower is better; a clue costs as much as a guess. */
export function score(game) {
  return guessCount(game) + (game.cluesUsed || 0);
}

/** The difficulties that award passport stamps. */
export const STAMP_LEVELS = ['easy', 'intermediate', 'hard'];

/** Bring stored stats up to the current shape (old builds kept found[code] as a plain count). */
export function normalizeStats(stats) {
  const s = { rounds: 0, wins: 0, streak: 0, bestStreak: 0, best: {}, found: {}, ...(stats || {}) };
  s.best = { ...s.best };
  s.found = Object.fromEntries(Object.entries(s.found || {}).map(([code, v]) => [code, typeof v === 'number' ? { hard: v } : { ...v, clues: { ...(v.clues || {}) } }]));
  return s;
}

/** Stamps a country holds: { easy: n, intermediate: n, hard: n } (missing = 0). */
export function stampsFor(stats, code) {
  const f = (stats && stats.found && stats.found[code]) || {};
  return Object.fromEntries(STAMP_LEVELS.map((l) => [l, f[l] || 0]));
}

/**
 * Clue marks on a country's stamps: the fewest clues used on any winning
 * round at that level, for levels that mark clues (Intermediate, Advanced).
 * Null where there is no stamp or the level does not mark clues.
 */
export function clueMarksFor(stats, code) {
  const f = (stats && stats.found && stats.found[code]) || {};
  const clues = f.clues || {};
  return Object.fromEntries(STAMP_LEVELS.map((l) => [l, DIFFICULTY[l].clueMark && f[l] > 0 && clues[l] != null ? clues[l] : null]));
}

/**
 * Fold a finished round into persistent stats. `stats` shape:
 * { rounds, wins, streak, bestStreak, best: { [level]: score },
 *   found: { [code]: { easy: n, intermediate: n, hard: n, clues: { intermediate: fewest, hard: fewest } } } }.
 * A win stamps the passport at the round's level; on levels that mark clues
 * the stamp remembers the fewest clues used to earn it.
 */
export function recordRound(stats, game) {
  const s = normalizeStats(stats);
  s.rounds += 1;
  if (game.status === 'won') {
    s.wins += 1;
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    const sc = score(game), key = STAMP_LEVELS.includes(game.difficulty) ? game.difficulty : 'easy';
    if (s.best[key] == null || sc < s.best[key]) s.best[key] = sc;
    const f = { ...(s.found[game.targetCode] || {}), clues: { ...((s.found[game.targetCode] || {}).clues || {}) } };
    f[key] = (f[key] || 0) + 1;
    if (DIFFICULTY[key].clueMark) {
      const used = game.cluesUsed || 0;
      f.clues[key] = f.clues[key] == null ? used : Math.min(f.clues[key], used);
    }
    s.found[game.targetCode] = f;
  } else {
    s.streak = 0;
  }
  return s;
}

/**
 * Which countries a level can still stamp: the level's base pool minus those
 * already stamped at that level. When the whole pool is stamped the base pool
 * is returned with `complete: true`.
 */
export function remainingPool(countries, pools, rules, stats) {
  const base = rules.pool && pools && pools[rules.pool] ? pools[rules.pool].codes : countries.map((c) => c.code);
  if (!STAMP_LEVELS.includes(rules.preset)) return { codes: base, complete: false, total: base.length, stamped: 0 };
  const stamped = base.filter((code) => stampsFor(stats, code)[rules.preset] > 0);
  const codes = base.filter((code) => stampsFor(stats, code)[rules.preset] === 0);
  return codes.length ? { codes, complete: false, total: base.length, stamped: stamped.length } : { codes: base, complete: true, total: base.length, stamped: stamped.length };
}

/**
 * Camera distance (sphere radius = 1) that frames a country whose bounding
 * box spans `spanDeg` degrees. Clamped so tiny places still show context and
 * huge ones still fit on screen.
 */
export function cameraDistanceForSpan(spanDeg) {
  const s = Math.min(spanDeg > 180 ? 90 : spanDeg, 120);
  return Math.min(3.4, Math.max(1.12, 1 + s * 0.06));
}
