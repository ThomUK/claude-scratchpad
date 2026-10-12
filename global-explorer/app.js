// Global Explorer: app shell (tabs, bottom sheet, atlas, settings). Game rules
// live in engine.js, rendering in globe.js.
import {
  decodeTopology, createGame, makeGuess, giveUp, formatDistance, guessCount, haversineKm, initialBearing,
  compassPoint, clueText, useClue, MAX_CLUES, DIFFICULTY, sortCountries, NUMERIC_KEYS, resolveRules, difficultyTier,
  score, recordRound, normalizeStats, stampsFor, clueMarksFor, remainingPool, STAMP_LEVELS,
} from './engine.js?v=daaeec81';
import { Globe, COLORS } from './globe.js?v=daaeec81';
import { isNative, initNative } from './native.js?v=daaeec81';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmtN = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-GB'));
const fmtDensity = (d) => (d == null ? '—' : d < 10 ? d.toLocaleString('en-GB', { maximumFractionDigits: d < 1 ? 2 : 1 }) : fmtN(d));
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const DIR = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };

// --------------------------------------------------------------- storage --
const KEYS = { settings: 'global-explorer.settings', stats: 'global-explorer.stats', visited: 'global-explorer.visited' };
// Earlier builds stored under the old app name; read those if the new keys are empty.
const load = (k, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? localStorage.getItem(k.replace('global-explorer.', 'world-borders.')));
    return v && typeof v === 'object' ? v : fallback;
  } catch { return fallback; }
};
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

const DEFAULT_SETTINGS = { preset: 'easy', units: 'km' };

const state = {
  countries: [], byCode: new Map(), features: [], pools: {}, globe: null,
  screen: 'play',
  phase: 'pick-start', // the game: pick-start | guessing | over
  game: null, clue: null, // clue: the clue texts given this round
  tapped: null, // Advanced: a country tapped during a round, ringed while you type its name
  // The globe screen shows exactly one view (see applyView): 'start' before a
  // round, 'round' during/after one, or 'explore' when the passport or atlas
  // takes the globe over. `explore` holds that view's context, or null.
  explore: null, // { source: 'passport'|'atlas', mode: 'easy'|'intermediate'|'hard'|'visited'|null, back: screen }
  selected: null, // country ringed on the globe with its card open (start and explore views)
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
    fetch('data/countries.json?v=daaeec81').then((r) => r.json()),
    fetch('data/world.json?v=daaeec81').then((r) => r.json()),
  ]);
  state.countries = cJson.countries;
  state.pools = cJson.pools || {};
  const easySet = new Set((state.pools.easy && state.pools.easy.codes) || []);
  for (const c of state.countries) { c.easy = easySet.has(c.code); c.tier = difficultyTier(c, state.pools); }
  state.byCode = new Map(state.countries.map((c) => [c.code, c]));
  state.features = decodeTopology(topo);
  // Old settings stored only a difficulty string; migrate it.
  const legacy = (() => { try { return localStorage.getItem('world-borders.difficulty'); } catch { return null; } })();
  state.settings = { ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) };
  if (legacy && DIFFICULTY[legacy] && !localStorage.getItem(KEYS.settings) && !localStorage.getItem('world-borders.settings')) state.settings.preset = legacy;
  if (!DIFFICULTY[state.settings.preset]) state.settings.preset = 'easy'; // earlier builds had a Custom level
  state.stats = normalizeStats(load(KEYS.stats, null));
  state.visited = new Set(Array.isArray(load(KEYS.visited, [])) ? load(KEYS.visited, []) : []);
  for (const c of state.countries) c.visited = state.visited.has(c.code);

  state.globe = new Globe($('globe'), state.features, state.countries);
  state.globe.onPick = (code) => {
    if (viewKind() !== 'round') { if (code) select(code); else deselect(); return; }
    const gr = state.game.rules; // the round plays by the rules it started with
    if (!code) { toast(gr.click ? 'No country there. Zoom in closer.' : 'No country there. Zoom in closer, or type its name.', 'warn'); return; }
    if (gr.click) choose(code); else tapShape(code);
  };
  $('loading').remove();
  $('compass').hidden = false;
  renderCredits(cJson);
  window.globalExplorer = { state, goBack }; // debug handle (used by the browser tests)

  wireTabs();
  wireSheet();
  wirePicker($('search-guess'), $('results-guess'));
  wireAtlas();
  wireSettings();
  $('btn-giveup').addEventListener('click', onGiveUp);
  $('btn-clue').addEventListener('click', onClue);
  $('start-close').addEventListener('click', deselect);
  $('start-here').addEventListener('click', () => { if (state.selected) startRound(state.selected); });
  $('start-info').addEventListener('click', () => { if (state.selected) showCountry(state.selected); });
  $('compass').addEventListener('click', recentre);
  render();
  applyView();
  // Inside the Android app the files are already on the phone: no service worker.
  if ('serviceWorker' in navigator && !isNative()) navigator.serviceWorker.register('sw.js?v=daaeec81').catch(() => {});
  initNative({ back: goBack }).catch(() => {});
}


// ------------------------------------------------------------------- view --
// The globe screen is always in exactly one view:
//   start   – no round yet: the title card floats over the globe; tap a country to begin
//   round   – a round is being played or has just finished: the sheet is open
//   explore – a full-screen look at the globe from the passport or the atlas, with
//             its own shading and bar; any round waits untouched underneath
// applyView() sets up everything on the globe screen from state.phase,
// state.explore and state.selected, so no view can leave stale pieces behind.
const viewKind = () => (state.explore ? 'explore' : state.phase === 'pick-start' ? 'start' : 'round');

const EXPLORE_INK = {
  easy: ['#2f7d4f', '#bfe0cc'], intermediate: ['#3b63a8', '#c5d5ee'], hard: ['#a3352f', '#efc9c4'], visited: ['#6b3fa0', null],
};
/** Shading, bar text and ring colour for an explore context, from live progress. */
function describeExplore(ex) {
  const hl = new Map();
  const mode = ex.mode;
  if (!mode) return { hl, title: 'Atlas', sub: 'Tap any country for its facts', ink: COLORS.browse };
  const [dark, light] = EXPLORE_INK[mode];
  if (mode === 'visited') {
    for (const code of state.visited) hl.set(code, dark);
    const n = state.visited.size;
    return { hl, title: 'Been here for real', sub: `${n} ${n === 1 ? 'country' : 'countries'} visited · tap any country`, ink: dark };
  }
  const pool = remainingPool(state.countries, state.pools, resolveRules({ preset: mode }), state.stats);
  const key = DIFFICULTY[mode].pool;
  const base = key && state.pools[key] ? state.pools[key].codes : state.countries.map((c) => c.code);
  for (const code of base) hl.set(code, stampsFor(state.stats, code)[mode] > 0 ? dark : light);
  return { hl, title: `${LEVEL_LABEL(mode)} stamps`, sub: `${pool.stamped} of ${pool.total} collected · tap any country`, ink: dark };
}

/** Put the globe screen in the view the state calls for. Idempotent; call after any state change. */
function applyView() {
  const view = viewKind(), sel = state.selected;
  const r = view === 'round' && state.game ? state.game.rules : rules(); // a round keeps the rules it started with
  const sp = $('screen-play');
  sp.classList.toggle('picking', view === 'start');
  sp.classList.toggle('exploring', view === 'explore');
  $('start-bar').hidden = view !== 'start';
  $('explore-bar').hidden = view !== 'explore';
  $('panel-game').hidden = state.phase !== 'guessing';
  $('panel-over').hidden = state.phase !== 'over';
  $('sheet-footer').hidden = state.phase !== 'over';
  // What the globe shows.
  let ink = COLORS.browse;
  if (view === 'explore') {
    const d = describeExplore(state.explore);
    ink = d.ink;
    $('explore-title').textContent = d.title; $('explore-sub').textContent = d.sub;
    state.globe.setHighlights(d.hl);
    state.globe.setPath([], []);
    state.globe.setNameExclusions([]);
    state.globe.setNamesVisible(true);
  } else {
    paintGlobe();
    state.globe.setNamesVisible(view !== 'round' || r.names); // Advanced hides names only during a round
  }
  if (view === 'round' && state.game) {
    // The start country wears the same teal ring as a selection, and keeps
    // its name just above the start dot. On Advanced a tapped country is
    // ringed in grey while you type its name.
    state.globe.setOutline(state.game.startCode, COLORS.browse);
    state.globe.setOutline(state.phase === 'guessing' ? state.tapped : null, COLORS.tapped, 1);
    state.globe.setNamePin(state.game.startCode, true);
  } else {
    state.globe.setOutline(sel, ink);
    state.globe.setOutline(null, null, 1);
    state.globe.setNamePin(sel);
  }
  const canClick = view !== 'round' || state.phase === 'guessing'; // on Advanced a tap rings the shape instead of guessing
  state.globe.pickEnabled = canClick;
  sp.classList.toggle('clickable', canClick);
  if (view === 'round' || sel) state.globe.controls.autoRotate = false; // the start and explore views may turn
  // The card for the selected country, if the view has one.
  $('start-pop').hidden = !(view === 'start' && sel);
  $('explore-pop').hidden = !(view === 'explore' && sel);
  if (view === 'start' && sel) fillStartCard(sel);
  if (view === 'explore' && sel) fillExploreCard(sel);
  fitGlobeToSheet();
  syncHint();
}

/** Ring a country and open the current view's card for it, flying it into the clear part of the globe. */
function select(code) {
  state.selected = code;
  applyView();
  state.globe.flyTo(code); // applyView has already set the card inset, so the fit centres it in the clear strip
}
function deselect() {
  state.selected = null;
  applyView();
}

/** Take the globe over for the passport or the atlas; `code` opens that country's card straight away. */
function enterExplore(ctx, code) {
  state.explore = ctx;
  state.selected = null;
  showScreen('play');
  if (code) select(code);
  else state.globe.spin(); // the whole globe, turning slowly until touched
}
/** Hand the globe back to the game and show `to`. */
function exitExplore(to) {
  state.explore = null;
  state.selected = null;
  showScreen(to || 'play');
}
/** "Show on globe" from a country page: pick it as a start before a round, otherwise look at it in the atlas explorer. */
function showOnGlobe(code) {
  if (state.explore) { showScreen('play'); select(code); return; } // came here from an explorer: stay in it
  if (state.phase === 'pick-start') { showScreen('play'); select(code); return; }
  enterExplore({ source: 'atlas', mode: null, back: 'country' }, code);
}

/** The new-round card: the tapped country's name and the ways to begin. */
function fillStartCard(code) {
  const c = state.byCode.get(code);
  $('start-flag').textContent = c.flag; $('start-pop-name').textContent = c.name; $('start-pop-status').textContent = `${c.continent} · ${c.designation}`;
}
/** Lightweight info card for a tapped country while exploring. */
function fillExploreCard(code) {
  const c = state.byCode.get(code);
  $('pop-flag').textContent = c.flag; $('pop-name').textContent = c.name; $('pop-status').textContent = `${c.continent} · ${c.designation}`;
  const dl = $('pop-facts'); dl.replaceChildren();
  const add = (k, v) => { dl.append(el('dt', null, k), el('dd', null, v)); };
  add('Area', `${fmtN(c.area)} km²`);
  add('Population', c.population == null ? 'unknown' : fmtN(c.population));
  add('Density', c.density == null ? '—' : `${fmtDensity(c.density)} people per km²`);
  add('Coastline', c.coastline == null ? 'unknown' : c.coastline === 0 ? 'none (landlocked)' : `${fmtN(c.coastline)} km`);
  const dd = el('dd'); dd.append(miniStamps(code)); dl.append(el('dt', null, 'Stamps'), dd);
}

// ------------------------------------------------------------ real travel --
/** Ask before adding or removing the "been here for real" stamp. */
function askVisited(code) {
  const c = state.byCode.get(code), on = state.visited.has(code);
  $('confirm-title').textContent = on ? `Remove your stamp for ${c.name}?` : `Stamp ${c.name}?`;
  $('confirm-text').textContent = on
    ? `This takes the "been here for real" stamp off ${c.name} in your passport.`
    : `Mark ${c.name} as somewhere you have really been. It gets a special stamp in your passport.`;
  const ok = $('confirm-ok');
  ok.textContent = on ? 'Remove stamp' : 'Stamp it';
  ok.onclick = () => { setVisited(code, !on); $('confirm').close(); };
  $('confirm').showModal();
}
function setVisited(code, on) {
  if (on) state.visited.add(code); else state.visited.delete(code);
  state.byCode.get(code).visited = on;
  save(KEYS.visited, [...state.visited]);
  if (state.screen === 'play') applyView(); // refresh explorer shading and an open card
  if (state.countryPage === code) showCountry(code);
}

/** Fly back to whatever the player is working from: latest guess, start, or browsed country. */
function recentre() {
  const g = state.game;
  const code = viewKind() === 'round'
    ? (g.status !== 'playing' ? g.targetCode : g.guesses.length ? g.guesses[g.guesses.length - 1].code : g.startCode)
    : state.selected || state.globe.openedAt;
  if (code) state.globe.flyTo(code);
}

// ------------------------------------------------------------- navigation --
function wireTabs() {
  for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => {
    state.explore = null; state.selected = null;
    const toGame = b.dataset.screen === 'play';
    // A finished round is done with: the Game tab goes back to the new-round screen.
    if (toGame && state.phase === 'over') resetToPickStart();
    showScreen(b.dataset.screen);
    // With no round in progress, the Game tab opens on the slowly turning globe, as at launch.
    if (toGame && state.phase === 'pick-start') state.globe.spin();
  });
  $('country-back').addEventListener('click', () => showScreen(state.countryFrom || 'atlas'));
  $('btn-show-globe').addEventListener('click', () => showOnGlobe(state.countryPage));
  $('btn-visited').addEventListener('click', () => askVisited(state.countryPage));
  $('explore-back').addEventListener('click', () => exitExplore(state.explore ? state.explore.back : 'passport'));
  $('explore-close').addEventListener('click', deselect);
  $('pop-more').addEventListener('click', () => { if (state.selected) showCountry(state.selected); });
  $('confirm-cancel').addEventListener('click', () => $('confirm').close());
  $('confirm').addEventListener('click', (e) => { if (e.target === $('confirm')) $('confirm').close(); });
}

/**
 * One step back, for the Android back button: closes whatever is on top
 * first, then works back towards the globe's new-round view. Returns false
 * when there is nothing left to go back from, so the caller can leave the app.
 */
function goBack() {
  if ($('confirm').open) { $('confirm').close(); return true; }
  if (!$('results-guess').hidden) { $('results-guess').hidden = true; $('search-guess').blur(); return true; }
  if (state.screen === 'country') { showScreen(state.countryFrom || 'atlas'); return true; }
  if (state.screen !== 'play') { showScreen('play'); return true; }
  if (state.selected) { deselect(); return true; }
  if (state.explore) { exitExplore(state.explore.back); return true; }
  if (state.phase === 'over') { resetToPickStart(); return true; }
  if ($('sheet').dataset.state === 'full') { setSheet('half'); return true; }
  return false;
}

function showScreen(which) {
  // Only the globe screen and a country page opened from it keep an explorer going.
  if (which !== 'play' && which !== 'country') { state.explore = null; state.selected = null; }
  state.screen = which;
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== `screen-${which}`;
  const src = state.explore ? state.explore.source : null;
  const tabFor = which === 'play' ? (src || 'play')
    : which === 'country' ? (state.countryFrom === 'play' ? (src || 'play') : state.countryFrom || 'atlas')
      : which;
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.screen === tabFor);
  if (which === 'atlas') renderAtlas();
  if (which === 'passport') renderPassport();
  if (which === 'settings') renderSettings();
  applyView(); // keep the globe screen consistent even while another screen covers it
}

// ------------------------------------------------------------ bottom sheet --
function setSheet(stateName) {
  $('sheet').dataset.state = stateName;
  $('screen-play').dataset.sheet = stateName;
  fitGlobeToSheet();
}
/** The sheet is as tall as its content (up to its state's limit); the globe fills whatever is left above it. */
function fitGlobeToSheet() {
  if (!state.globe) return;
  // Centre the globe below the card that floats over the top of the full-screen views.
  const view = viewKind();
  const bar = view === 'explore' ? $('explore-bar') : view === 'start' ? $('start-bar') : null;
  state.globe.topInset = bar && !bar.hidden ? bar.offsetTop + bar.offsetHeight : 0;
  // On a phone the compass sits level with the floating card's centreline, just to
  // its right, when there is one; on the desktop it stays in the top right corner.
  const comp = $('compass');
  const desktop = window.matchMedia('(min-width: 900px)').matches;
  if (bar && !bar.hidden && !desktop) {
    comp.style.top = `${bar.offsetTop + (bar.offsetHeight - comp.offsetHeight) / 2}px`;
    comp.style.left = `${bar.offsetLeft + bar.offsetWidth + 10}px`;
    comp.style.right = 'auto';
  } else { comp.style.top = ''; comp.style.left = ''; comp.style.right = ''; }
  // The start and explorer views always reserve their card's space at the
  // bottom, open or not, so the globe sits in the same place from first load.
  state.globe.bottomInset = view === 'start' ? cardInset('start-pop') : view === 'explore' ? cardInset('explore-pop') : 0;
  state.globe.refHeight = $('screen-play').clientHeight; // the full-height canvas the zoom fit is tuned for
  if (window.matchMedia('(min-width: 900px)').matches) { $('globe-wrap').style.bottom = ''; state.globe.resize(); return; }
  $('globe-wrap').style.bottom = `${$('sheet').offsetHeight}px`;
  state.globe.resize();
}
/**
 * How much of the canvas a card covers from the bottom, measured once per
 * card from a typical filling (and cached), so the figure is the same whether
 * the card is open, closed, or showing a long name.
 */
const cardInsets = {};
function cardInset(id) {
  if (cardInsets[id]) return cardInsets[id];
  const pop = $(id), wasHidden = pop.hidden;
  if (wasHidden) { pop.style.visibility = 'hidden'; pop.hidden = false; }
  const sample = state.byCode.get('FRA') || state.countries[0];
  const nameEl = id === 'start-pop' ? $('start-pop-name') : $('pop-name');
  const wasEmpty = !nameEl.textContent;
  if (wasEmpty && sample) (id === 'start-pop' ? fillStartCard : fillExploreCard)(sample.code);
  const h = $('globe').clientHeight;
  const inset = h ? h - pop.offsetTop : 0;
  if (wasHidden) { pop.hidden = true; pop.style.visibility = ''; }
  if (inset > 0) cardInsets[id] = inset;
  return inset;
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
  $('search-guess').value = '';
  $('results-guess').hidden = true;
  if (state.phase !== 'guessing') return;
  onGuess(code);
  if (state.game.rules.type && state.phase === 'guessing') $('search-guess').focus({ preventScroll: true });
}


// -------------------------------------------------------------------- game --
function startRound(startCode) {
  state.explore = null; state.selected = null; state.clue = null; state.tapped = null;
  flash('');
  const r = rules();
  const pool = remainingPool(state.countries, state.pools, r, state.stats);
  // Only the start country left to stamp? Draw from the whole pool rather than fail.
  const codes = pool.codes.filter((c) => c !== startCode).length ? pool.codes : state.countries.map((c) => c.code);
  state.game = createGame(state.countries, startCode, { rules: r, pool: codes });
  state.phase = 'guessing';
  setSheet('half');
  render();
  applyView();
  state.globe.flyTo(startCode); // after the sheet is laid out, so the fit knows the canvas shape
  // The sheet already says where you start and how far the mystery country is; only a full passport needs a word.
  if (pool.complete) flash(`Your ${r.label} passport is complete, so any of its countries can come up.`);
}

function onGuess(code) {
  const { game, result } = makeGuess(state.game, state.countries, code);
  state.game = game;
  state.tapped = null;
  $('search-guess').placeholder = "Type the country's name…";
  state.globe.flyTo(code);
  if (result.verdict === 'repeat') { toast(`You have already used ${name(code)}.`, 'warn'); return; }
  if (game.status === 'won') finishRound();
  render(result);
  applyView();
}

/** Each clue climbs the ladder (continent, first letter, a neighbour, the flag) and costs a point. */
function onClue() {
  const g = state.game;
  const text = clueText(g, state.countries, (g.cluesUsed || 0) + 1);
  if (!text) return;
  state.game = useClue(g);
  state.clue = [...(state.clue || []), text];
  render();
}

/** Advanced: a tap rings the country without naming it, and invites you to type its name. */
function tapShape(code) {
  state.tapped = code;
  applyView();
  $('search-guess').placeholder = 'What is this country called?';
  $('search-guess').focus({ preventScroll: true });
  toast('Type its name to guess.');
}

function onGiveUp() {
  state.game = giveUp(state.game);
  finishRound();
  state.globe.flyTo(state.game.targetCode);
  render();
  applyView();
}

function finishRound() {
  state.phase = 'over';
  state.stats = recordRound(state.stats, state.game);
  save(KEYS.stats, state.stats);
  setSheet('full');
}

function resetToPickStart() {
  state.phase = 'pick-start'; state.game = null; state.clue = null; state.tapped = null; state.explore = null; state.selected = null;
  flash('');
  state.globe.spin();
  setSheet('half');
  render();
  applyView();
}

const verdictColor = (v) => (v === 'warmer' ? COLORS.warmer : v === 'cooler' ? COLORS.cooler : v === 'correct' ? COLORS.correct : COLORS.same);

/** Shade and draw the current round (or clear the globe when there is none). */
function paintGlobe() {
  const g = state.game, hl = new Map(), ll = (code) => state.byCode.get(code).latlng;
  if (!g) { state.globe.setHighlights(hl); state.globe.setPath([], []); state.globe.setNameExclusions([]); state.globe.setNameReveals([]); return; }
  for (const x of g.guesses) hl.set(x.code, COLORS.guessed);
  if (g.status === 'won') hl.set(g.targetCode, COLORS.correct);
  if (g.status === 'gaveup') hl.set(g.targetCode, COLORS.target);
  state.globe.setHighlights(hl);
  const segments = [], labels = [{ latlng: ll(g.startCode), dot: true, color: COLORS.startDot }];
  let prev = g.startCode;
  g.guesses.forEach((x, i) => {
    segments.push({ from: ll(prev), to: ll(x.code), color: verdictColor(x.verdict) });
    labels.push({ latlng: ll(x.code), text: String(i + 1), color: x.verdict === 'correct' ? COLORS.correct : '#ffffff' });
    prev = x.code;
  });
  if (g.status === 'gaveup') labels.push({ latlng: ll(g.targetCode), text: '?', color: COLORS.target });
  state.globe.setPath(segments, labels);
  const guessed = g.guesses.map((x) => x.code);
  if (g.rules.names) { state.globe.setNameExclusions(guessed); state.globe.setNameReveals([]); } // numbered markers stand in for names
  else { state.globe.setNameExclusions([]); state.globe.setNameReveals(guessed); } // Advanced: names appear as you guess them
}

// ------------------------------------------------------------------ render --
/** Fill the sheet for the current round. Which panels show, and the globe itself, are applyView's job. */
function render(lastResult) {
  const g = state.game;
  if (state.phase === 'pick-start') return;

  const start = state.byCode.get(g.startCode), gr = g.rules;
  $('start-name').textContent = `${start.flag} ${start.name}`;
  $('guess-count').textContent = String(guessCount(g));
  $('clue').textContent = `The mystery country is ${km(g.startDistanceKm)} to the ${DIR[g.startCompass]} of ${start.name}.`;
  $('clue-text').textContent = (state.clue || []).join(' ');
  $('clue-box').hidden = !(state.clue && state.clue.length);
  $('clues-used').textContent = g.cluesUsed ? `· ${g.cluesUsed} ${g.cluesUsed === 1 ? 'clue' : 'clues'}` : '';
  $('picker-guess').hidden = !gr.type; // Easy and Intermediate guess by tapping the globe
  const bc = $('btn-clue');
  bc.hidden = state.phase !== 'guessing';
  bc.disabled = (g.cluesUsed || 0) >= MAX_CLUES;
  bc.textContent = bc.disabled ? 'No more clues' : `💡 Give me a clue${g.cluesUsed ? ` (${MAX_CLUES - g.cluesUsed} left)` : ''}`;

  const log = $('log');
  log.replaceChildren();
  g.guesses.forEach((x, i) => {
    const row = el('li', `guess ${x.verdict}`);
    const from = i === 0 ? start.name : name(g.guesses[i - 1].code);
    const num = el('span', 'gnum', String(i + 1));
    num.style.background = x.verdict === 'correct' ? COLORS.correct : '#ffffff';
    const line = el('span', 'gline'); line.style.background = verdictColor(x.verdict);
    const dist = `${km(x.distanceKm)}${x.verdict !== 'correct' ? ` ${x.compass}` : ''}`;
    row.append(num, line, el('span', 'gname', name(x.code)), el('span', 'gdist', dist));
    row.append(el('span', 'gverdict', x.verdict === 'correct' ? 'Found it!' : x.verdict === 'warmer' ? 'Closer' : x.verdict === 'cooler' ? 'Further' : 'Same'));
    row.title = `${from} → ${name(x.code)}: ${km(x.referenceKm)} → ${km(x.distanceKm)} from the mystery country`;
    log.prepend(row);
  });
  $('log-empty').hidden = g.guesses.length > 0;

  if (lastResult && state.phase === 'guessing') {
    const v = lastResult.verdict, who = name(lastResult.code);
    const lead = v === 'warmer' ? 'You got closer!' : v === 'cooler' ? 'Further away.' : 'Same distance as before.';
    const where = `The mystery country is ${km(lastResult.distanceKm)} to the ${DIR[lastResult.compass]} of ${who}.`;
    flash(`${lead} ${where}`, v);
  }
  if (state.phase === 'over') { flash(''); renderOver(); }
}

function flash(text, cls = '') {
  const f = $('flash'); f.textContent = text; f.className = `flash ${cls}`; f.hidden = !text;
}

let toastTimer = null;
function toast(text, cls = '') {
  const t = $('toast');
  clearTimeout(toastTimer); toastTimer = null;
  if (!text) { syncHint(); return; }
  t.textContent = text; t.className = `toast ${cls}`; t.hidden = false;
  toastTimer = setTimeout(() => { toastTimer = null; syncHint(); }, 2800);
}

/** The standing prompt for a round with no guesses yet, or null. */
function roundHint() {
  const g = state.game;
  if (state.screen !== 'play' || viewKind() !== 'round' || state.phase !== 'guessing' || !g || guessCount(g) || state.tapped) return null;
  if (g.rules.type) return "Move the map, then type a country's name to guess.";
  const tap = window.matchMedia('(hover: hover)').matches ? 'click' : 'tap';
  return `Move the map and ${tap} a country to guess.`;
}
/** Show the round hint whenever no passing message has the toast. */
function syncHint() {
  if (toastTimer) return;
  const t = $('toast'), text = roundHint();
  t.hidden = !text;
  if (text) { t.textContent = text; t.className = 'toast'; }
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
    st.append(stampEl(g.difficulty, true, 'lg', 0, c.code, clueMarksFor(state.stats, c.code)[g.difficulty]));
    const t = el('div'); t.append(el('div', 't', n === 1 ? `${g.rules.label} stamp earned!` : `${g.rules.label} stamp again (${n} times)`));
    const pool = remainingPool(state.countries, state.pools, g.rules, state.stats);
    t.append(el('div', 's', pool.complete ? `Your ${g.rules.label} passport is complete: all ${pool.total} stamps!` : `${pool.stamped} of ${pool.total} ${g.rules.label} stamps collected.`));
    st.append(t);
    st.hidden = false;
  } else st.hidden = true;
  $('reveal-card').replaceChildren(countryCard(c, g.startCode));
  const row = $('over-actions');
  row.replaceChildren();
  const next = el('button', 'primary', 'Next round'); // chains on from the country just found; the Game tab offers a fresh start
  next.addEventListener('click', () => startRound(c.code));
  row.append(next);
  $('sheet-body').scrollTop = 0;
}

/** The country card: header, key facts, neighbours and "Did you know?". Shared by the reveal, the country page and the atlas. */
function countryCard(c, startCode, { head = true } = {}) {
  const frag = document.createDocumentFragment();
  if (head) { // the country page carries the name and flag in its banner instead
    const h = el('div', 'rhead');
    h.append(el('span', 'bigflag', c.flag));
    const t = el('div');
    t.append(el('h2', null, c.name), el('p', 'muted small', c.official));
    h.append(t);
    frag.append(h);
  }

  const dl = el('dl', 'facts-grid');
  const add = (k, v) => { dl.append(el('dt', null, k), el('dd', null, v)); };
  add('Capital', c.capital.length ? c.capital.join(', ') : '—');
  add('Continent', c.continent);
  add('Status', c.designation);
  add('Population', c.population == null ? 'unknown' : fmtN(c.population));
  add('Area', `${fmtN(c.area)} km²`);
  add('Density', c.density == null ? '—' : `${fmtDensity(c.density)} people per km²`);
  add('Coastline', c.coastline == null ? 'unknown' : c.coastline === 0 ? 'none (landlocked)' : `${fmtN(c.coastline)} km`);
  add('Region', c.subregion || c.region);
  add('Languages', c.languages.length ? c.languages.join(', ') : '—');
  add('Currency', c.currencies.length ? c.currencies.join(', ') : '—');
  if (c.dependentOf) add('Administered by', name(c.dependentOf));
  frag.append(dl);
  const ps = el('div', 'stamps-wide'); // one column per stamp across the full width
  const sf = stampsFor(state.stats, c.code), cm = clueMarksFor(state.stats, c.code);
  ps.append(stampEl('visited', state.visited.has(c.code), '', 0, c.code)); // been here first
  for (const l of STAMP_LEVELS) ps.append(stampEl(l, sf[l] > 0, '', sf[l], c.code, cm[l]));
  frag.append(el('h3', null, 'Passport stamps'), ps);

  frag.append(el('h3', null, 'Bordering countries'));
  if (c.borders.length) {
    const ul = el('ul', 'chips');
    for (const b of c.borders) {
      const li = el('li');
      const btn = el('button', 'chip-item', `${state.byCode.get(b).flag} ${name(b)}`);
      btn.type = 'button'; btn.title = `About ${name(b)}`;
      btn.addEventListener('click', () => showCountry(b));
      li.append(btn); ul.append(li);
    }
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
/** Small deterministic pseudo-random in [-1, 1) from a string, so each stamp keeps its own tilt. */
function jitter(seed) {
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return ((h % 2000) / 1000) - 1;
}

/** A rubber-stamp element for a level; `got` renders it inked, otherwise a faint outline. */
function stampEl(level, got, size = '', count = 0, seed = '', clues = null) {
  const s = el('span', `stamp ${level} ${got ? 'got inked' : 'missing'} ${size}`.trim());
  s.style.setProperty('--rot', `${(jitter(seed + level) * 12).toFixed(1)}deg`);
  s.textContent = level === 'visited' ? (size === 'sm' ? 'Been here' : 'Been\nhere') : size === 'sm' ? LEVEL_LABEL(level)[0] : level === 'intermediate' ? 'Inter\nmediate' : LEVEL_LABEL(level);
  if (level === 'visited') s.title = got ? 'Been here for real' : 'Not visited for real yet';
  if (got && count > 1) s.append(el('small', null, `×${count}`));
  s.title = got ? `${LEVEL_LABEL(level)} stamp${count > 1 ? ` ×${count}` : ''}` : `No ${LEVEL_LABEL(level)} stamp yet`;
  if (got && clues) { // the fewest clues a winning round at this level needed
    const m = el('i', 'cm', String(clues)); m.title = `${clues} ${clues === 1 ? 'clue' : 'clues'} used on your best ${LEVEL_LABEL(level)} round`;
    s.append(m); s.classList.add('has-cm'); s.title += ` · ${clues} ${clues === 1 ? 'clue' : 'clues'}`;
  }
  return s;
}
function miniStamps(code) {
  const sf = stampsFor(state.stats, code);
  const w = el('span', 'ministamps');
  w.append(el('i', `visited ${state.visited.has(code) ? 'got' : ''}`, '✈')); // been here first
  for (const l of STAMP_LEVELS) w.append(el('i', `${l} ${sf[l] > 0 ? 'got' : ''}`, LEVEL_LABEL(l)[0]));
  return w;
}
/** Can this country earn a stamp at this level? (Easy and Intermediate draw from smaller pools.) */
function inPool(level, code) {
  const key = DIFFICULTY[level].pool;
  const pool = key && state.pools[key];
  if (!pool) return true;
  if (!pool.set) pool.set = new Set(pool.codes);
  return pool.set.has(code);
}
function totalStamps() {
  const f = (state.stats && state.stats.found) || {};
  let n = 0; for (const v of Object.values(f)) for (const l of STAMP_LEVELS) if (v[l] > 0) n++;
  return n;
}
function poolSize(level) { const key = DIFFICULTY[level].pool; return key && state.pools[key] ? state.pools[key].codes.length : state.countries.length; }
function poolLabel(level) { const key = DIFFICULTY[level].pool; return key && state.pools[key] ? state.pools[key].label : `all ${state.countries.length} countries and territories`; }
const allStamps = () => STAMP_LEVELS.reduce((n, l) => n + poolSize(l), 0);

function renderPassport() {
  $('passport-count').textContent = `${totalStamps()} of ${allStamps()} stamps`;
  const levels = $('levels');
  levels.replaceChildren();
  const GLOBE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10.5c3 .5 5 2 6 4.5s3 3 5.5 3M12 3c-1.5 2.5-1 5 .5 6.5s3.5 1.5 5 .5M9 4c-.5 2 .5 3.5 2 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  // One tile per level: stamp, name, count, progress, and an explicit "Explore globe" action.
  const tile = (level, label, count, total, ink, open, title) => {
    const d = el('div', 'tile'); d.style.setProperty('--ink', ink);
    d.title = title; d.tabIndex = 0; d.setAttribute('role', 'button');
    d.addEventListener('click', open); d.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    const head = el('div', 'thead'); head.append(stampEl(level, true, 'sm', 0, 'summary'), el('div', 'tname', label));
    const count_ = el('div', 'tcount', total == null ? String(count) : `${count} / ${total}`);
    d.append(head, count_);
    if (total != null) { const bar = el('div', 'bar'); const fill = el('i'); fill.style.width = `${(100 * count) / total}%`; bar.append(fill); d.append(bar); }
    const go = el('div', 'tgo'); go.innerHTML = GLOBE_ICON; go.append(el('span', null, 'Explore globe')); d.append(go);
    return d;
  };
  levels.append(tile('visited', 'Been here', state.visited.size, null, '#6b3fa0', () => enterExplore({ source: 'passport', mode: 'visited', back: 'passport' }), 'Explore the globe shaded by where you have really been'));
  for (const l of STAMP_LEVELS) {
    const pool = remainingPool(state.countries, state.pools, resolveRules({ preset: l }), state.stats);
    const ink = l === 'easy' ? '#2f7d4f' : l === 'intermediate' ? '#3b63a8' : '#a3352f';
    levels.append(tile(l, LEVEL_LABEL(l), pool.stamped, pool.total, ink, () => enterExplore({ source: 'passport', mode: l, back: 'passport' }), `Explore the globe shaded by your ${LEVEL_LABEL(l)} stamps`));
  }
  const chips = $('passport-filter');
  if (!chips.children.length) {
    for (const [k, label] of [['all', 'All'], ['visited', 'Been here'], ...STAMP_LEVELS.map((l) => [l, LEVEL_LABEL(l)])]) {
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
    const sf = stampsFor(state.stats, c.code), v = state.visited.has(c.code);
    return f === 'all' ? v || STAMP_LEVELS.some((l) => sf[l] > 0) : f === 'visited' ? v : sf[f] > 0;
  });
  for (const c of cards) {
    const card = el('div', 'entry'); card.tabIndex = 0;
    card.style.setProperty('--rot', `${(jitter(c.code) * 1.5).toFixed(2)}deg`);
    const flag = el('span', 'eflag', c.flag);
    const row = el('div', 'erow'); row.append(flag);
    const sf = stampsFor(state.stats, c.code), cm = clueMarksFor(state.stats, c.code);
    // One slot per level, spread across the box; a level this country cannot earn leaves its slot empty.
    row.append(stampEl('visited', state.visited.has(c.code), 'sm', 0, c.code)); // been here first
    for (const l of STAMP_LEVELS) row.append(inPool(l, c.code) ? stampEl(l, sf[l] > 0, 'sm', sf[l], c.code, cm[l]) : el('span', 'slot-empty'));
    card.append(el('div', 'ename', c.name), row);
    const open = () => showCountry(c.code);
    card.addEventListener('click', open); card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    book.append(card);
  }
  $('book-empty').hidden = cards.length > 0;
}

// ------------------------------------------------------------------- atlas --
const SORTS = [
  { key: 'name', label: 'Name' }, { key: 'population', label: 'Population' }, { key: 'area', label: 'Area' },
  { key: 'density', label: 'Density' }, { key: 'coastline', label: 'Coastline' }, { key: 'neighbours', label: 'Neighbours' }, { key: 'continent', label: 'Continent' },
  { key: 'designation', label: 'Status' }, { key: 'difficulty', label: 'Difficulty' }, { key: 'visited', label: 'Been here' },
];
const TIER_LABEL = ['', 'Easy', 'Intermediate', 'Advanced'];
const TIER_NOTE = ['', '80 commonly visited countries', 'all UN countries', 'all countries'];
function wireAtlas() {
  const chips = $('sort-chips');
  chips.classList.add('sort');
  for (const s of SORTS) {
    const b = el('button', 'sortchip', s.label); b.type = 'button'; b.dataset.key = s.key;
    b.addEventListener('click', () => {
      if (state.atlas.key === s.key) state.atlas.dir = state.atlas.dir === 'asc' ? 'desc' : 'asc';
      else { state.atlas.key = s.key; state.atlas.dir = NUMERIC_KEYS.has(s.key) && s.key !== 'difficulty' ? 'desc' : 'asc'; }
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
    case 'density': return [fmtDensity(c.density), 'people per km²'];
    case 'coastline': return [c.coastline == null ? '—' : fmtN(c.coastline), 'km of coastline'];
    case 'neighbours': return [String(c.borders.length), c.borders.length === 1 ? 'neighbour' : 'neighbours'];
    case 'continent': return [c.continent, ''];
    case 'designation': return [c.designation, ''];
    case 'difficulty': return [TIER_LABEL[c.tier], TIER_NOTE[c.tier]];
    case 'visited': return [c.visited ? '' : '–', ''];
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
    li.classList.toggle('selected', state.selected === c.code);
    const nm = el('div');
    const n = el('div', 'name', c.name);
    nm.append(n, el('div', 'sub', `${c.continent} · ${c.designation}`));
    const [v, l] = valueFor(c, key);
    const val = el('div', 'val', v); if (l) val.append(el('span', 'l', l));
    if (key === 'visited' && c.visited) val.append(stampEl('visited', true, 'sm', 0, c.code)); // the passport's own stamp
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
  $('country-flag').textContent = c.flag;
  $('country-official').textContent = c.official;
  $('country-body').replaceChildren(countryCard(c, state.game ? state.game.startCode : null, { head: false }));
  const vb = $('btn-visited'), on = state.visited.has(code);
  vb.textContent = on ? 'Been here for real · remove stamp' : "I've been here for real";
  vb.classList.toggle('on', on);
  showScreen('country');
  $('screen-country').scrollTop = 0;
}

// ---------------------------------------------------------------- settings --
function wireSettings() {
  const box = $('difficulty');
  for (const [key, d] of Object.entries(DIFFICULTY)) {
    const lab = el('label', 'diff');
    const inp = el('input'); inp.type = 'radio'; inp.name = 'difficulty'; inp.value = key;
    inp.addEventListener('change', () => {
      if (state.settings.preset === key) return;
      state.settings.preset = key;
      // A round plays by the level it started on, so a new level means a new start.
      const midRound = state.phase === 'guessing';
      if (state.game) resetToPickStart();
      saveSettings();
      if (midRound) toast(`Level changed to ${d.label}. Choose where to start your next round.`);
    });
    lab.append(inp, el('span', 'dname', d.label), el('span', 'dblurb', d.blurb));
    box.append(lab);
  }
  for (const inp of document.querySelectorAll('#units input')) inp.addEventListener('change', () => { state.settings.units = inp.value; saveSettings(); });
  $('btn-reset-stats').addEventListener('click', () => { if (confirm('Reset all passport stamps and progress?')) { state.stats = normalizeStats(null); save(KEYS.stats, null); renderPassport(); } });
}

function saveSettings() {
  save(KEYS.settings, state.settings);
  renderSettings();
  render();
  if (state.screen === 'play') applyView();
}

/** The Credits list on the Settings page: item, source (linked), licence. */
function renderCredits(cJson) {
  const dl = $('credits'); dl.replaceChildren();
  const add = (item, source, url, licence) => {
    const dd = el('dd');
    if (url) { const a = el('a', null, source); a.href = url; a.target = '_blank'; a.rel = 'noopener'; dd.append(a); } else dd.append(source);
    if (licence) dd.append(el('span', 'lic', licence));
    dl.append(el('dt', null, item), dd);
  };
  add('Country facts', 'mledoze/countries (the REST Countries dataset)', 'https://github.com/mledoze/countries', 'Open Database License (ODbL)');
  add('Borders', 'Natural Earth, 1:50m map units', 'https://www.naturalearthdata.com/', 'Public domain');
  add('Population', 'Natural Earth estimates', 'https://www.naturalearthdata.com/', 'Public domain');
  add('Coastlines', 'CIA World Factbook, via the factbook.json mirror', 'https://github.com/factbook/factbook.json', 'Public domain');
  add('Flags', 'Twemoji flag graphics', 'https://github.com/jdecked/twemoji', 'CC BY 4.0');
  add('Flag font', 'country-flag-emoji-polyfill by TalkJS', 'https://github.com/talkjs/country-flag-emoji-polyfill', 'MIT');
  add('3D globe', 'three.js', 'https://threejs.org/', 'MIT');
  add('Data built', cJson.generated, null, null);
}

function renderSettings() {
  const r = rules();
  for (const inp of document.querySelectorAll('#difficulty input')) inp.checked = inp.value === r.preset;
  for (const inp of document.querySelectorAll('#units input')) inp.checked = inp.value === state.settings.units;
}

main().catch((err) => {
  console.error(err);
  const l = $('loading'); if (l) l.textContent = `Failed to load: ${err.message}`;
});
