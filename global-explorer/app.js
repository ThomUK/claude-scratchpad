// Global Explorer: app shell (tabs, bottom sheet, atlas, settings). Game rules
// live in engine.js, rendering in globe.js.
import {
  decodeTopology, createGame, makeGuess, giveUp, formatDistance, guessCount, haversineKm, initialBearing,
  compassPoint, directionClue, useClue, DIFFICULTY, sortCountries, NUMERIC_KEYS, countryAt, resolveRules,
  score, recordRound, normalizeStats, stampsFor, remainingPool, STAMP_LEVELS,
} from './engine.js?v=dev';
import { Globe, COLORS } from './globe.js?v=dev';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmtN = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-GB'));
const fmtDensity = (d) => (d == null ? '—' : d < 10 ? d.toLocaleString('en-GB', { maximumFractionDigits: d < 1 ? 2 : 1 }) : fmtN(d));
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const DIR = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };

// --------------------------------------------------------------- storage --
const KEYS = { settings: 'global-explorer.settings', stats: 'global-explorer.stats' };
// Earlier builds stored under the old app name; read those if the new keys are empty.
const load = (k, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? localStorage.getItem(k.replace('global-explorer.', 'world-borders.')));
    return v && typeof v === 'object' ? v : fallback;
  } catch { return fallback; }
};
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

const DEFAULT_SETTINGS = { preset: 'hard', names: false, click: false, distances: true, bearings: false, pool: 'all', units: 'km' };

const state = {
  countries: [], byCode: new Map(), features: [], pools: {}, globe: null,
  screen: 'play',
  phase: 'pick-start', // pick-start | guessing | over
  game: null, clue: null, browse: null, startMode: null,
  settings: { ...DEFAULT_SETTINGS },
  stats: null,
  atlas: { key: 'name', dir: 'asc', filter: '' },
  passportFilter: 'all',
  countryPage: null,
};
const rules = () => resolveRules(state.settings);
const km = (v) => formatDistance(v, state.settings.units);
const name = (code) => state.byCode.get(code).name;

// ------------------------------------------------------------------ boot --
async function main() {
  const [cJson, topo] = await Promise.all([
    fetch('data/countries.json?v=dev').then((r) => r.json()),
    fetch('data/world.json?v=dev').then((r) => r.json()),
  ]);
  state.countries = cJson.countries;
  state.pools = cJson.pools || {};
  const easySet = new Set((state.pools.easy && state.pools.easy.codes) || []);
  for (const c of state.countries) c.easy = easySet.has(c.code);
  state.byCode = new Map(state.countries.map((c) => [c.code, c]));
  state.features = decodeTopology(topo);
  // Old settings stored only a difficulty string; migrate it.
  const legacy = (() => { try { return localStorage.getItem('world-borders.difficulty'); } catch { return null; } })();
  state.settings = { ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) };
  if (legacy && DIFFICULTY[legacy] && !localStorage.getItem(KEYS.settings) && !localStorage.getItem('world-borders.settings')) state.settings.preset = legacy;
  state.stats = normalizeStats(load(KEYS.stats, null));

  state.globe = new Globe($('globe'), state.features, state.countries);
  state.globe.onPick = (code) => (code ? choose(code) : toast('No country there. Zoom in closer, or type its name.', 'warn'));
  $('loading').remove();
  $('data-note').textContent = `Data: ${cJson.sources.countries}; ${cJson.sources.geometry}. Built ${cJson.generated}.`;
  window.globalExplorer = { state }; // debug handle (used by the browser tests)

  wireTabs();
  wireSheet();
  wirePicker($('search'), $('results'));
  wirePicker($('search-guess'), $('results-guess'));
  wireAtlas();
  wireSettings();
  $('btn-giveup').addEventListener('click', onGiveUp);
  $('btn-clue').addEventListener('click', onClue);
  $('btn-newstart').addEventListener('click', () => resetToPickStart());
  $('btn-begin').addEventListener('click', () => { $('begin-menu').hidden = false; });
  $('begin-cancel').addEventListener('click', () => { $('begin-menu').hidden = true; });
  $('begin-menu').addEventListener('click', (e) => { if (e.target === $('begin-menu')) $('begin-menu').hidden = true; });
  $('btn-start-cancel').addEventListener('click', () => setStartMode(null));
  for (const b of document.querySelectorAll('#begin-menu .opt')) b.addEventListener('click', () => beginWith(b.dataset.mode));
  $('compass').addEventListener('click', recentre);
  applyRulesToGlobe();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js?v=dev').catch(() => {});
}

/** One of the four ways to begin a round, chosen from the Begin menu. */
function beginWith(mode) {
  $('begin-menu').hidden = true;
  if (mode === 'locate') { setStartMode(null); onLocate(); return; }
  if (mode === 'random') { setStartMode(null); startRound(state.countries[Math.floor(Math.random() * state.countries.length)].code); return; }
  setStartMode(mode);
  if (mode === 'map') { setSheet('collapsed'); toast('Tap any country on the globe to start there.'); }
  if (mode === 'search') { setSheet('half'); setTimeout(() => $('search').focus({ preventScroll: true }), 50); }
}

/** How the start country is being chosen on the new-round screen: null | 'map' | 'search'. */
function setStartMode(mode) {
  state.startMode = mode;
  applyRulesToGlobe();
  render();
}

/** Fly back to whatever the player is working from: latest guess, start, or browsed country. */
function recentre() {
  const g = state.game;
  const code = g ? (g.status !== 'playing' ? g.targetCode : g.guesses.length ? g.guesses[g.guesses.length - 1].code : g.startCode) : state.browse || state.globe.openedAt;
  if (code) state.globe.flyTo(code);
}

// ------------------------------------------------------------- navigation --
function wireTabs() {
  for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => showScreen(b.dataset.screen));
  $('country-back').addEventListener('click', () => showScreen(state.countryFrom || 'atlas'));
  $('btn-show-globe').addEventListener('click', () => { browseCountry(state.countryPage); showScreen('play'); });
  $('btn-start-here').addEventListener('click', () => { startRound(state.countryPage); showScreen('play'); });
}

function showScreen(which) {
  state.screen = which;
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== `screen-${which}`;
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.screen === (which === 'country' ? (state.countryFrom || 'atlas') : which));
  if (which === 'atlas') renderAtlas();
  if (which === 'passport') renderPassport();
  if (which === 'settings') renderSettings();
  if (which === 'play') state.globe.resize();
}

// ------------------------------------------------------------ bottom sheet --
function setSheet(stateName) {
  $('sheet').dataset.state = stateName;
  $('screen-play').dataset.sheet = stateName;
  fitGlobeToSheet();
}
/** The sheet is as tall as its content (up to its state's limit); the globe fills whatever is left above it. */
function fitGlobeToSheet() {
  if (window.matchMedia('(min-width: 900px)').matches) { $('globe-wrap').style.bottom = ''; state.globe && state.globe.resize(); return; }
  $('globe-wrap').style.bottom = `${$('sheet').offsetHeight}px`;
  state.globe && state.globe.resize();
}
function wireSheet() {
  const grip = $('grip');
  let start = null;
  grip.addEventListener('pointerdown', (e) => { start = { y: e.clientY, t: performance.now() }; grip.setPointerCapture(e.pointerId); });
  grip.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dy = e.clientY - start.y, cur = $('sheet').dataset.state;
    start = null;
    const order = ['collapsed', 'half', 'full'];
    let i = order.indexOf(cur);
    if (dy < -30) i = Math.min(2, i + 1);
    else if (dy > 30) i = Math.max(0, i - 1);
    else i = cur === 'collapsed' ? 1 : cur === 'half' ? 0 : 1; // tap toggles
    setSheet(order[i]);
  });
  setSheet('half');
  new ResizeObserver(() => fitGlobeToSheet()).observe($('sheet'));
  window.addEventListener('resize', fitGlobeToSheet);
}

// ------------------------------------------------------------------ picker --
function wirePicker(input, list) {
  let items = [];
  const refresh = () => {
    const q = fold(input.value.trim());
    list.replaceChildren();
    items = [];
    if (!q) { list.hidden = true; return; }
    const starts = [], contains = [];
    for (const c of state.countries) {
      const n = fold(c.name);
      if (n.startsWith(q)) starts.push(c); else if (n.includes(q)) contains.push(c);
    }
    items = [...starts, ...contains].slice(0, 12);
    for (const c of items) {
      const b = el('button', 'result', null);
      b.type = 'button';
      b.append(el('span', 'flag', c.flag), el('span', 'name', c.name));
      const tag = tagFor(c.code);
      if (tag) { b.append(el('span', 'tag', tag)); b.disabled = true; }
      b.addEventListener('click', () => choose(c.code));
      list.append(b);
    }
    if (!items.length) list.append(el('div', 'empty', 'No country matches that.'));
    list.hidden = false;
  };
  input.addEventListener('input', refresh);
  input.addEventListener('focus', refresh);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = items.find((c) => !tagFor(c.code)); if (first) { e.preventDefault(); choose(first.code); } }
    if (e.key === 'Escape') { list.hidden = true; input.blur(); }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.picker')) list.hidden = true; });
}

function tagFor(code) {
  if (state.phase !== 'guessing') return null;
  if (code === state.game.startCode) return 'start';
  if (state.game.guesses.some((g) => g.code === code)) return 'guessed';
  return null;
}

function choose(code) {
  for (const id of ['search', 'search-guess']) $(id).value = '';
  for (const id of ['results', 'results-guess']) $(id).hidden = true;
  if (state.phase === 'pick-start') startRound(code);
  else if (state.phase === 'guessing') onGuess(code);
  else return;
  if (!rules().click && state.phase === 'guessing') $('search-guess').focus({ preventScroll: true });
}

function onLocate() {
  if (!navigator.geolocation) { toast('Location is not available on this device.', 'warn'); return; }
  toast('Finding where you are…');
  navigator.geolocation.getCurrentPosition((pos) => {
    const code = countryAt(state.features, state.countries, pos.coords.latitude, pos.coords.longitude);
    if (code) startRound(code); else toast('Could not match your location to a country.', 'warn');
  }, () => toast('Location was not available.', 'warn'), { timeout: 10000, maximumAge: 600000 });
}

// -------------------------------------------------------------------- game --
function applyRulesToGlobe() {
  const r = rules();
  state.globe.setNamesVisible(r.names);
  const canClick = state.phase === 'pick-start' ? state.startMode === 'map' : r.click && state.phase === 'guessing';
  state.globe.pickEnabled = canClick;
  $('screen-play').classList.toggle('clickable', canClick);
}

function startRound(startCode) {
  state.clue = null; state.browse = null; state.startMode = null;
  $('begin-menu').hidden = true;
  flash('');
  const r = rules();
  const pool = remainingPool(state.countries, state.pools, r, state.stats);
  // Only the start country left to stamp? Draw from the whole pool rather than fail.
  const codes = pool.codes.filter((c) => c !== startCode).length ? pool.codes : state.countries.map((c) => c.code);
  state.game = createGame(state.countries, startCode, { rules: r, pool: codes });
  state.phase = 'guessing';
  applyRulesToGlobe();
  state.globe.flyTo(startCode);
  paintGlobe();
  setSheet('half');
  render();
  const left = pool.complete ? `Your ${r.label} passport is complete, so any of them can come up.` : '';
  toast(`Starting from ${name(startCode)}. ${r.distances ? `The mystery country is ${km(state.game.startDistanceKm)} away.` : ''} ${left}`.replace(/\s+/g, ' ').trim());
}

function onGuess(code) {
  const { game, result } = makeGuess(state.game, state.countries, code);
  state.game = game;
  state.globe.flyTo(code);
  if (result.verdict === 'repeat') { toast(`You have already used ${name(code)}.`, 'warn'); return; }
  if (game.status === 'won') finishRound();
  paintGlobe();
  render(result);
}

function onClue() {
  const g = state.game;
  const c = directionClue(g, state.countries);
  state.game = useClue(g);
  const r = g.rules;
  const where = (x) => (r.distances ? `to the ${DIR[x.compass]}` : `${km(x.distanceKm)} away to the ${DIR[x.compass]}`);
  const parts = [`From ${name(c.fromStart.code)} (your start) the mystery country lies ${where(c.fromStart)}.`];
  if (c.fromLast && c.fromLast.code !== c.fromStart.code) parts.push(`From ${name(c.fromLast.code)} (your latest guess) it lies ${where(c.fromLast)}.`);
  state.clue = parts.join(' ');
  render();
}

function onGiveUp() {
  state.game = giveUp(state.game);
  finishRound();
  state.globe.flyTo(state.game.targetCode);
  paintGlobe();
  render();
}

function finishRound() {
  state.phase = 'over';
  state.stats = recordRound(state.stats, state.game);
  save(KEYS.stats, state.stats);
  applyRulesToGlobe();
  setSheet('full');
}

function resetToPickStart() {
  state.phase = 'pick-start'; state.game = null; state.clue = null; state.startMode = null;
  flash('');
  paintGlobe();
  state.globe.controls.autoRotate = true;
  applyRulesToGlobe();
  setSheet('half');
  render();
}

const verdictColor = (v) => (v === 'warmer' ? COLORS.warmer : v === 'cooler' ? COLORS.cooler : v === 'correct' ? COLORS.correct : COLORS.same);

function paintGlobe() {
  const g = state.game, hl = new Map(), ll = (code) => state.byCode.get(code).latlng;
  if (state.browse) hl.set(state.browse, COLORS.browse);
  if (!g) { state.globe.setHighlights(hl); state.globe.setPath([], []); state.globe.setNameExclusions([]); return; }
  for (const x of g.guesses) hl.set(x.code, COLORS.guessed);
  hl.set(g.startCode, COLORS.start);
  if (g.status === 'won') hl.set(g.targetCode, COLORS.correct);
  if (g.status === 'gaveup') hl.set(g.targetCode, COLORS.target);
  state.globe.setHighlights(hl);
  const segments = [], labels = [{ latlng: ll(g.startCode), text: 'S', color: COLORS.start }];
  let prev = g.startCode;
  g.guesses.forEach((x, i) => {
    segments.push({ from: ll(prev), to: ll(x.code), color: verdictColor(x.verdict) });
    labels.push({ latlng: ll(x.code), text: String(i + 1), color: x.verdict === 'correct' ? COLORS.correct : '#ffffff' });
    prev = x.code;
  });
  if (g.status === 'gaveup') labels.push({ latlng: ll(g.targetCode), text: '?', color: COLORS.target });
  state.globe.setPath(segments, labels);
  state.globe.setNameExclusions([g.startCode, ...g.guesses.map((x) => x.code)]);
}

/** Highlight a country from the atlas and fly to it. */
function browseCountry(code) {
  state.browse = code;
  state.globe.flyTo(code);
  paintGlobe();
  setSheet('collapsed');
}

// ------------------------------------------------------------------ render --
function render(lastResult) {
  const g = state.game, r = rules();
  $('panel-start').hidden = state.phase !== 'pick-start';
  $('panel-game').hidden = state.phase !== 'guessing';
  $('panel-over').hidden = state.phase !== 'over';
  $('sheet-footer').hidden = state.phase !== 'over';
  const click = r.click ? ' or tap the map' : '';
  $('search-guess').placeholder = `Type your guess${click}…`;

  if (state.phase === 'pick-start') {
    const m = state.startMode;
    $('picker-start').hidden = m !== 'search';
    $('start-map-hint').hidden = m !== 'map';
    $('btn-begin').hidden = !!m;
    $('btn-start-cancel').hidden = !m;
    return;
  }

  const start = state.byCode.get(g.startCode), gr = g.rules;
  $('difficulty-tag').textContent = gr.label;
  $('start-name').textContent = `${start.flag} ${start.name}`;
  $('guess-count').textContent = String(guessCount(g));
  $('clue').textContent = gr.distances
    ? `The mystery country is ${km(g.startDistanceKm)} from ${start.name}${gr.bearings ? `, to the ${DIR[g.startCompass]}` : ''}.`
    : 'The mystery country is hidden somewhere. Guess, and each hop tells you warmer or cooler.';
  $('clue-text').textContent = state.clue || '';
  $('clue-box').hidden = !state.clue;
  $('clues-used').textContent = g.cluesUsed ? `· ${g.cluesUsed} ${g.cluesUsed === 1 ? 'clue' : 'clues'}` : '';
  $('btn-clue').hidden = state.phase !== 'guessing' || !gr.clueButton;

  const log = $('log');
  log.replaceChildren();
  g.guesses.forEach((x, i) => {
    const row = el('li', `guess ${x.verdict}`);
    const from = i === 0 ? start.name : name(g.guesses[i - 1].code);
    const num = el('span', 'gnum', String(i + 1));
    num.style.background = x.verdict === 'correct' ? COLORS.correct : '#ffffff';
    const line = el('span', 'gline'); line.style.background = verdictColor(x.verdict);
    const dist = gr.distances ? `${km(x.distanceKm)}${gr.bearings && x.verdict !== 'correct' ? ` ${x.compass}` : ''}` : '';
    row.append(num, line, el('span', 'gname', name(x.code)), el('span', 'gdist', dist));
    row.append(el('span', 'gverdict', x.verdict === 'correct' ? 'Found it!' : x.verdict === 'warmer' ? 'Warmer' : x.verdict === 'cooler' ? 'Cooler' : 'Same'));
    row.title = gr.distances ? `${from} → ${name(x.code)}: ${km(x.referenceKm)} → ${km(x.distanceKm)} from the mystery country` : `${from} → ${name(x.code)}`;
    log.prepend(row);
  });
  $('log-empty').hidden = g.guesses.length > 0;

  if (lastResult && state.phase === 'guessing') {
    const v = lastResult.verdict, i = g.guesses.length - 1;
    const prevName = i === 0 ? start.name : name(g.guesses[i - 1].code);
    const dir = gr.bearings ? `, which lies to the ${DIR[lastResult.compass]}` : '';
    let msg;
    if (gr.distances) {
      const here = `${name(lastResult.code)} is ${km(lastResult.distanceKm)} from the mystery country`;
      msg = v === 'warmer' ? `Warmer: ${here}${dir}, closer than ${prevName} was (${km(lastResult.referenceKm)}).`
        : v === 'cooler' ? `Cooler: ${here}${dir}, further than ${prevName} was (${km(lastResult.referenceKm)}).`
        : `Same: ${here}, the same as ${prevName}.`;
    } else {
      msg = v === 'warmer' ? `Warmer: ${name(lastResult.code)} is closer to the mystery country than ${prevName} was.`
        : v === 'cooler' ? `Cooler: ${name(lastResult.code)} is further from the mystery country than ${prevName} was.`
        : `Same: ${name(lastResult.code)} is exactly as far from the mystery country as ${prevName} was.`;
    }
    flash(msg, v);
    toast(v === 'warmer' ? `🔥 Warmer · ${name(lastResult.code)}` : v === 'cooler' ? `❄️ Cooler · ${name(lastResult.code)}` : `Same distance · ${name(lastResult.code)}`, v);
  }
  if (state.phase === 'over') { flash(''); renderOver(); }
}

function flash(text, cls = '') {
  const f = $('flash'); f.textContent = text; f.className = `flash ${cls}`; f.hidden = !text;
}

let toastTimer = null;
function toast(text, cls = '') {
  const t = $('toast'); t.textContent = text; t.className = `toast ${cls}`; t.hidden = !text;
  clearTimeout(toastTimer);
  if (text) toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

function renderOver() {
  const g = state.game, c = state.byCode.get(g.targetCode), n = guessCount(g);
  const clues = g.cluesUsed ? ` with ${g.cluesUsed} ${g.cluesUsed === 1 ? 'clue' : 'clues'}` : '';
  $('outcome').textContent = g.status === 'won'
    ? `You found it in ${n} ${n === 1 ? 'guess' : 'guesses'}${clues} on ${g.rules.label}. Score ${score(g)}.`
    : `The mystery country was ${c.name}.`;
  $('outcome').style.color = g.status === 'won' ? COLORS.correct : COLORS.target;
  const st = $('stamped');
  st.replaceChildren();
  if (g.status === 'won' && STAMP_LEVELS.includes(g.difficulty)) {
    const n = stampsFor(state.stats, c.code)[g.difficulty];
    st.append(stampEl(g.difficulty, true, 'lg'));
    const t = el('div'); t.append(el('div', 't', n === 1 ? `${g.rules.label} stamp earned!` : `${g.rules.label} stamp again (${n} times)`));
    const pool = remainingPool(state.countries, state.pools, g.rules, state.stats);
    t.append(el('div', 's', pool.complete ? `Your ${g.rules.label} passport is complete: all ${pool.total} stamps!` : `${pool.stamped} of ${pool.total} ${g.rules.label} stamps collected.`));
    st.append(t);
    st.hidden = false;
  } else st.hidden = true;
  $('reveal-card').replaceChildren(countryCard(c, g.startCode));
  const row = $('over-actions');
  row.replaceChildren();
  const next = el('button', 'primary', `Next round: start from ${c.name}`);
  next.addEventListener('click', () => startRound(c.code));
  const same = el('button', null, `Again from ${name(g.startCode)}`);
  same.addEventListener('click', () => startRound(g.startCode));
  const fresh = el('button', 'ghost', 'New start');
  fresh.addEventListener('click', () => resetToPickStart());
  row.append(next, same, fresh);
  $('sheet-body').scrollTop = 0;
}

/** The country card: header, key facts, neighbours and "Did you know?". Shared by the reveal, the country page and the atlas. */
function countryCard(c, startCode) {
  const frag = document.createDocumentFragment();
  const head = el('div', 'rhead');
  head.append(el('span', 'bigflag', c.flag));
  const t = el('div');
  t.append(el('h2', null, c.name), el('p', 'muted small', c.official));
  head.append(t);
  frag.append(head);

  const dl = el('dl', 'facts-grid');
  const add = (k, v) => { dl.append(el('dt', null, k), el('dd', null, v)); };
  add('Capital', c.capital.length ? c.capital.join(', ') : '—');
  add('Continent', c.continent);
  add('Status', c.designation);
  add('Population', c.population == null ? 'unknown' : fmtN(c.population));
  add('Area', `${fmtN(c.area)} km²`);
  add('Density', c.density == null ? '—' : `${fmtDensity(c.density)} people per km²`);
  add('Region', c.subregion || c.region);
  add('Languages', c.languages.length ? c.languages.join(', ') : '—');
  add('Currency', c.currencies.length ? c.currencies.join(', ') : '—');
  if (c.dependentOf) add('Administered by', name(c.dependentOf));
  frag.append(dl);
  const ps = el('div', 'ps'); ps.style.margin = '12px 0 0'; ps.style.justifyContent = 'flex-start'; ps.style.gap = '10px';
  const sf = stampsFor(state.stats, c.code);
  for (const l of STAMP_LEVELS) ps.append(stampEl(l, sf[l] > 0, '', sf[l]));
  frag.append(el('h3', null, 'Passport stamps'), ps);

  frag.append(el('h3', null, 'Bordering countries'));
  if (c.borders.length) {
    const ul = el('ul', 'chips');
    for (const b of c.borders) ul.append(el('li', 'chip-item', `${state.byCode.get(b).flag} ${name(b)}`));
    frag.append(ul);
  } else frag.append(el('p', 'muted', c.landlocked ? 'None.' : 'None: no land borders.'));

  frag.append(el('h3', null, 'Did you know?'));
  const fl = el('ul', 'factlist');
  const start = startCode ? state.byCode.get(startCode) : null;
  for (const f of [...c.facts, ...comparedToStart(c, start)]) fl.append(el('li', null, f));
  frag.append(fl);
  return frag;
}

const times = (x) => (x >= 10 ? `${Math.round(x)}×` : x >= 1.05 ? `${x.toFixed(1)}×` : x > 0.95 ? 'about the same' : x >= 0.1 ? `${(1 / x).toFixed(1)}× smaller than` : `${Math.round(1 / x)}× smaller than`);
/** Facts that relate the found country to the player's starting country. */
function comparedToStart(c, start) {
  if (!start || c.code === start.code) return [];
  const d = haversineKm(start.latlng, c.latlng);
  const out = [d < 10000
    ? `It lies ${km(d)} to the ${DIR[compassPoint(initialBearing(start.latlng, c.latlng))]} of ${start.name}.`
    : `It lies ${km(d)} from ${start.name}, ${d > 15000 ? 'close to the far side of the world' : 'more than a quarter of the way around the world'}.`];
  if (c.area > 0 && start.area > 0) {
    const a = times(c.area / start.area);
    out.push(a === 'about the same' ? `Its area is about the same as ${start.name}'s.` : a.endsWith('smaller than') ? `Its area is ${a} ${start.name}'s.` : `Its area is ${a} that of ${start.name}.`);
  }
  if (c.population > 0 && start.population > 0) {
    const p = times(c.population / start.population);
    out.push(p === 'about the same' ? `It has about the same population as ${start.name}.` : p.endsWith('smaller than') ? `Its population is ${p} ${start.name}'s.` : `It has ${p} the population of ${start.name}.`);
  }
  return out;
}

// ---------------------------------------------------------------- passport --
const LEVEL_LABEL = (l) => (DIFFICULTY[l] || { label: l }).label;
/** A rubber-stamp element for a level; `got` renders it inked, otherwise a faint outline. */
function stampEl(level, got, size = '', count = 0) {
  const s = el('span', `stamp ${level} ${got ? 'got' : 'missing'} ${size}`.trim());
  s.textContent = size === 'sm' ? LEVEL_LABEL(level)[0] : level === 'intermediate' ? 'Inter\nmediate' : LEVEL_LABEL(level);
  if (got && count > 1) s.append(el('small', null, `×${count}`));
  s.title = got ? `${LEVEL_LABEL(level)} stamp${count > 1 ? ` ×${count}` : ''}` : `No ${LEVEL_LABEL(level)} stamp yet`;
  return s;
}
function miniStamps(code) {
  const sf = stampsFor(state.stats, code);
  const w = el('span', 'ministamps');
  for (const l of STAMP_LEVELS) w.append(el('i', `${l} ${sf[l] > 0 ? 'got' : ''}`, LEVEL_LABEL(l)[0]));
  return w;
}
function totalStamps() {
  const f = (state.stats && state.stats.found) || {};
  let n = 0; for (const v of Object.values(f)) for (const l of STAMP_LEVELS) if (v[l] > 0) n++;
  return n;
}
function poolSize(level) { const key = DIFFICULTY[level].pool; return key && state.pools[key] ? state.pools[key].codes.length : state.countries.length; }
function poolLabel(level) { const key = DIFFICULTY[level].pool; return key && state.pools[key] ? state.pools[key].label : `all ${state.countries.length} countries and territories`; }
const allStamps = () => STAMP_LEVELS.reduce((n, l) => n + poolSize(l), 0);

function renderStats(container, compact) {
  const s = state.stats || normalizeStats(null);
  const stamps = totalStamps();
  const tiles = compact
    ? [[s.rounds, 'rounds'], [stamps, `stamps of ${allStamps()}`], [s.streak, 'streak']] // (unused since the game screen dropped its strip)
    : [[s.rounds, 'rounds played'], [s.wins, 'countries found'], [stamps, `stamps of ${allStamps()}`], [s.streak, 'current streak'], [s.bestStreak, 'best streak'],
      ...Object.entries(s.best || {}).map(([k, v]) => [v, `best score · ${LEVEL_LABEL(k)}`])];
  container.replaceChildren();
  for (const [v, l] of tiles) { const d = el('div', 'stat'); d.append(el('div', 'v', String(v)), el('div', 'l', l)); container.append(d); }
}

function renderPassport() {
  renderStats($('stats-full'), false);
  $('passport-count').textContent = `${totalStamps()} stamps`;
  const levels = $('levels');
  levels.replaceChildren();
  for (const l of STAMP_LEVELS) {
    const pool = remainingPool(state.countries, state.pools, resolveRules({ preset: l }), state.stats);
    const d = el('div', 'level'); d.style.setProperty('--ink', l === 'easy' ? '#1f8a4c' : l === 'intermediate' ? '#2f6fcf' : '#b3261e');
    const txt = el('div'); txt.append(el('div', 'ln', LEVEL_LABEL(l)), el('div', 'lh', poolLabel(l)));
    const bar = el('div', 'bar'); const fill = el('i'); fill.style.width = `${(100 * pool.stamped) / pool.total}%`; bar.append(fill);
    d.append(stampEl(l, pool.stamped > 0), txt, el('div', 'lc', `${pool.stamped} / ${pool.total}`), bar);
    levels.append(d);
  }
  const chips = $('passport-filter');
  if (!chips.children.length) {
    for (const [k, label] of [['all', 'All'], ...STAMP_LEVELS.map((l) => [l, LEVEL_LABEL(l)])]) {
      const b = el('button', 'sortchip', label); b.type = 'button'; b.dataset.key = k;
      b.addEventListener('click', () => { state.passportFilter = k; renderPassport(); });
      chips.append(b);
    }
  }
  for (const b of chips.children) b.classList.toggle('on', b.dataset.key === state.passportFilter);
  const book = $('book');
  book.replaceChildren();
  const f = state.passportFilter;
  const cards = sortCountries(state.countries, 'name', 'asc').filter((c) => {
    const sf = stampsFor(state.stats, c.code);
    return f === 'all' ? STAMP_LEVELS.some((l) => sf[l] > 0) : sf[f] > 0;
  });
  for (const c of cards) {
    const card = el('div', 'pcard'); card.tabIndex = 0;
    const h = el('div', 'ph'); h.append(el('span', 'flag', c.flag), el('span', null, c.name));
    const ps = el('div', 'ps'); const sf = stampsFor(state.stats, c.code);
    for (const l of STAMP_LEVELS) ps.append(stampEl(l, sf[l] > 0, 'sm', sf[l]));
    card.append(h, ps);
    const open = () => showCountry(c.code);
    card.addEventListener('click', open); card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    book.append(card);
  }
  $('book-empty').hidden = cards.length > 0;
}

// ------------------------------------------------------------------- atlas --
const SORTS = [
  { key: 'name', label: 'Name' }, { key: 'population', label: 'Population' }, { key: 'area', label: 'Area' },
  { key: 'density', label: 'Density' }, { key: 'neighbours', label: 'Neighbours' }, { key: 'continent', label: 'Continent' },
  { key: 'designation', label: 'Status' }, { key: 'easy', label: 'Easy mode' },
];
function wireAtlas() {
  const chips = $('sort-chips');
  chips.classList.add('sort');
  for (const s of SORTS) {
    const b = el('button', 'sortchip', s.label); b.type = 'button'; b.dataset.key = s.key;
    b.addEventListener('click', () => {
      if (state.atlas.key === s.key) state.atlas.dir = state.atlas.dir === 'asc' ? 'desc' : 'asc';
      else { state.atlas.key = s.key; state.atlas.dir = NUMERIC_KEYS.has(s.key) ? 'desc' : 'asc'; }
      renderAtlas();
    });
    chips.append(b);
  }
  $('ref-filter').addEventListener('input', () => { state.atlas.filter = $('ref-filter').value; renderAtlas(); });
}

function valueFor(c, key) {
  switch (key) {
    case 'population': return [fmtN(c.population), 'people'];
    case 'area': return [fmtN(c.area), 'km²'];
    case 'density': return [fmtDensity(c.density), 'per km²'];
    case 'neighbours': return [String(c.borders.length), c.borders.length === 1 ? 'neighbour' : 'neighbours'];
    case 'continent': return [c.continent, ''];
    case 'designation': return [c.designation, ''];
    case 'easy': return [c.easy ? '✓' : '–', 'easy mode'];
    default: return [fmtN(c.population), 'people'];
  }
}

function renderAtlas() {
  const { key, dir } = state.atlas;
  const q = fold(state.atlas.filter.trim());
  for (const b of document.querySelectorAll('#sort-chips .sortchip')) {
    const on = b.dataset.key === key;
    b.classList.toggle('on', on);
    b.textContent = SORTS.find((s) => s.key === b.dataset.key).label + (on ? (dir === 'asc' ? ' ▲' : ' ▼') : '');
  }
  const rows = sortCountries(state.countries, key, dir).filter((c) => !q || fold(c.name).includes(q) || fold(c.continent).includes(q) || fold(c.designation).includes(q));
  const list = $('atlas-list');
  list.replaceChildren();
  for (const c of rows) {
    const li = el('li', 'row'); li.tabIndex = 0; li.dataset.code = c.code;
    li.classList.toggle('selected', state.browse === c.code);
    const nm = el('div');
    const n = el('div', 'name', c.name);
    if (c.easy) n.append(el('span', 'badge easy', 'Easy'));
    n.append(miniStamps(c.code));
    nm.append(n, el('div', 'sub', `${c.continent} · ${c.designation}`));
    const [v, l] = valueFor(c, key);
    const val = el('div', 'val', v); if (l) val.append(el('span', 'l', l));
    li.append(el('span', 'flag', c.flag), nm, val);
    const open = () => showCountry(c.code);
    li.addEventListener('click', open);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    list.append(li);
  }
  $('ref-count').textContent = `${rows.length} of ${state.countries.length}`;
}

function showCountry(code) {
  state.countryPage = code;
  state.countryFrom = state.screen === 'country' ? state.countryFrom : state.screen;
  const c = state.byCode.get(code);
  $('country-title').textContent = c.name;
  $('country-body').replaceChildren(countryCard(c, state.game ? state.game.startCode : null));
  $('btn-start-here').hidden = state.phase === 'guessing';
  showScreen('country');
  $('screen-country').scrollTop = 0;
}

// ---------------------------------------------------------------- settings --
const SWITCHES = [
  { key: 'names', label: 'Country names on the map', hint: 'Labels appear as you zoom in.' },
  { key: 'click', label: 'Tap the map to guess', hint: 'Otherwise type the name.' },
  { key: 'distances', label: 'Show distance for each guess', hint: 'How far each guess is from the mystery country.' },
  { key: 'bearings', label: 'Show compass direction', hint: 'Which way the mystery country lies from each guess.' },
];
const POOLS = [
  { key: 'easy', label: '80 most visited', hint: 'Easy' },
  { key: 'un', label: '193 UN members', hint: 'Intermediate' },
  { key: 'all', label: 'All 250', hint: 'Advanced' },
];

function wireSettings() {
  const box = $('difficulty');
  for (const [key, d] of [...Object.entries(DIFFICULTY), ['custom', { label: 'Custom', blurb: 'Your own mix of the rules below.' }]]) {
    const lab = el('label', 'diff');
    const inp = el('input'); inp.type = 'radio'; inp.name = 'difficulty'; inp.value = key;
    inp.addEventListener('change', () => applyPreset(key));
    lab.append(inp, el('span', 'dname', d.label), el('span', 'dblurb', d.blurb));
    box.append(lab);
  }
  const sw = $('switches');
  for (const s of SWITCHES) {
    const lab = el('label', 'switch');
    const txt = el('span', 'sl', s.label); txt.append(el('span', 'sh', s.hint));
    const inp = el('input'); inp.type = 'checkbox'; inp.dataset.key = s.key;
    inp.addEventListener('change', () => {
      // Editing a switch makes the preset Custom, seeded from the current rules.
      const r = rules();
      state.settings = { ...state.settings, preset: 'custom', names: r.names, click: r.click, distances: r.distances, bearings: r.bearings, pool: r.pool || 'all' };
      state.settings[s.key] = inp.checked;
      saveSettings();
    });
    lab.append(txt, inp);
    sw.append(lab);
  }
  const pb = $('pool');
  for (const p of POOLS) {
    const lab = el('label'); const inp = el('input'); inp.type = 'radio'; inp.name = 'pool'; inp.value = p.key;
    inp.addEventListener('change', () => {
      const r = rules();
      state.settings = { ...state.settings, preset: 'custom', names: r.names, click: r.click, distances: r.distances, bearings: r.bearings, pool: p.key };
      saveSettings();
    });
    lab.append(inp, ` ${p.label}`);
    pb.append(lab);
  }
  for (const inp of document.querySelectorAll('#units input')) inp.addEventListener('change', () => { state.settings.units = inp.value; saveSettings(); });
  $('btn-reset-stats').addEventListener('click', () => { if (confirm('Reset rounds, streaks and all passport stamps?')) { state.stats = normalizeStats(null); save(KEYS.stats, null); renderPassport(); } });
}

function applyPreset(key) {
  if (key === 'custom') { const r = rules(); state.settings = { ...state.settings, preset: 'custom', names: r.names, click: r.click, distances: r.distances, bearings: r.bearings, pool: r.pool || 'all' }; }
  else state.settings.preset = key;
  saveSettings();
}

function saveSettings() {
  save(KEYS.settings, state.settings);
  applyRulesToGlobe();
  renderSettings();
  render();
}

function renderSettings() {
  const r = rules();
  for (const inp of document.querySelectorAll('#difficulty input')) inp.checked = inp.value === r.preset;
  for (const inp of document.querySelectorAll('#switches input')) inp.checked = !!r[inp.dataset.key];
  for (const inp of document.querySelectorAll('#pool input')) inp.checked = inp.value === (r.pool || 'all');
  for (const inp of document.querySelectorAll('#units input')) inp.checked = inp.value === state.settings.units;
}

main().catch((err) => {
  console.error(err);
  const l = $('loading'); if (l) l.textContent = `Failed to load: ${err.message}`;
});
