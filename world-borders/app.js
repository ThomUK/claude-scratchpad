// World Borders: UI glue. Game rules live in engine.js, rendering in globe.js.
import { decodeTopology, createGame, makeGuess, giveUp, formatKm, guessCount, haversineKm, initialBearing, compassPoint } from './engine.js?v=dev';
import { Globe, COLORS } from './globe.js?v=dev';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmtN = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-GB'));
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const state = {
  countries: [], byCode: new Map(), globe: null,
  phase: 'pick-start', // pick-start | guessing | over
  startCode: null, game: null,
};

async function main() {
  const [cJson, topo] = await Promise.all([
    fetch('data/countries.json?v=dev').then((r) => r.json()),
    fetch('data/world.json?v=dev').then((r) => r.json()),
  ]);
  state.countries = cJson.countries;
  state.byCode = new Map(state.countries.map((c) => [c.code, c]));
  state.globe = new Globe($('globe'), decodeTopology(topo), state.countries);
  $('loading').remove();
  $('data-note').textContent = `Data: ${cJson.sources.countries}; ${cJson.sources.geometry}. Built ${cJson.generated}.`;
  wirePicker();
  $('btn-giveup').addEventListener('click', onGiveUp);
  $('btn-newstart').addEventListener('click', () => resetToPickStart());
  render();
}

// ------------------------------------------------------------------ picker --
function wirePicker() {
  const input = $('search'), list = $('results');
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
  $('search').value = '';
  $('results').hidden = true;
  if (state.phase === 'pick-start') startRound(code);
  else if (state.phase === 'guessing') onGuess(code);
  $('search').focus({ preventScroll: true });
}

// -------------------------------------------------------------------- game --
function startRound(startCode) {
  state.startCode = startCode;
  state.game = createGame(state.countries, startCode);
  state.phase = 'guessing';
  state.globe.flyTo(startCode);
  paintGlobe();
  render();
}

function onGuess(code) {
  const { game, result } = makeGuess(state.game, state.countries, code);
  state.game = game;
  state.globe.flyTo(code);
  if (result.verdict === 'repeat') { flash(`You have already used ${state.byCode.get(code).name}.`); return; }
  if (game.status === 'won') state.phase = 'over';
  paintGlobe();
  render(result);
}

function onGiveUp() {
  state.game = giveUp(state.game);
  state.phase = 'over';
  state.globe.flyTo(state.game.targetCode);
  paintGlobe();
  render();
}

function resetToPickStart() {
  state.phase = 'pick-start'; state.game = null; state.startCode = null;
  state.globe.setHighlights(new Map());
  state.globe.controls.autoRotate = true;
  render();
}

const verdictColor = (v) => (v === 'warmer' ? COLORS.warmer : v === 'cooler' ? COLORS.cooler : v === 'correct' ? COLORS.correct : COLORS.same);

function paintGlobe() {
  const g = state.game, hl = new Map(), ll = (code) => state.byCode.get(code).latlng;
  // Fills: only the anchor points carry colour; guessed countries get a neutral lift.
  for (const x of g.guesses) hl.set(x.code, COLORS.guessed);
  hl.set(g.startCode, COLORS.start);
  if (g.status === 'won') hl.set(g.targetCode, COLORS.correct);
  if (g.status === 'gaveup') hl.set(g.targetCode, COLORS.target);
  state.globe.setHighlights(hl);
  // The path: start -> guess 1 -> guess 2 ..., each hop coloured by its verdict.
  const segments = [], labels = [{ latlng: ll(g.startCode), text: 'S', color: COLORS.start }];
  let prev = g.startCode;
  g.guesses.forEach((x, i) => {
    segments.push({ from: ll(prev), to: ll(x.code), color: verdictColor(x.verdict) });
    labels.push({ latlng: ll(x.code), text: String(i + 1), color: x.verdict === 'correct' ? COLORS.correct : '#e6edf3' });
    prev = x.code;
  });
  if (g.status === 'gaveup') labels.push({ latlng: ll(g.targetCode), text: '?', color: COLORS.target });
  state.globe.setPath(segments, labels);
}

// ------------------------------------------------------------------ render --
function render(lastResult) {
  const g = state.game, name = (c) => state.byCode.get(c).name;
  const search = $('search');
  $('panel-start').hidden = state.phase !== 'pick-start';
  $('panel-game').hidden = state.phase === 'pick-start';
  $('reveal').hidden = state.phase !== 'over';
  $('picker').hidden = state.phase === 'over';
  search.placeholder = state.phase === 'pick-start' ? 'Type a country to start from…' : 'Type your guess…';

  if (state.phase === 'pick-start') { $('clue').textContent = ''; return; }

  const start = state.byCode.get(g.startCode);
  $('start-name').textContent = `${start.flag} ${start.name}`;
  $('guess-count').textContent = String(guessCount(g));
  $('clue').textContent = `The mystery country is ${formatKm(g.startDistanceKm)} from ${start.name}.`;

  const log = $('log');
  log.replaceChildren();
  g.guesses.forEach((x, i) => {
    const row = el('li', `guess ${x.verdict}`);
    const from = i === 0 ? start.name : name(g.guesses[i - 1].code);
    const num = el('span', 'gnum', String(i + 1));
    num.style.background = x.verdict === 'correct' ? COLORS.correct : '#e6edf3';
    const line = el('span', 'gline'); line.style.background = verdictColor(x.verdict);
    row.append(num, line, el('span', 'gname', name(x.code)), el('span', 'gdist', formatKm(x.distanceKm)));
    row.append(el('span', 'gverdict', x.verdict === 'correct' ? 'Found it!' : x.verdict === 'warmer' ? 'Warmer' : x.verdict === 'cooler' ? 'Cooler' : 'Same'));
    row.title = `${from} → ${name(x.code)}: ${formatKm(x.referenceKm)} → ${formatKm(x.distanceKm)} from the mystery country`;
    log.prepend(row);
  });
  $('log-empty').hidden = g.guesses.length > 0;
  $('btn-giveup').hidden = state.phase !== 'guessing';

  if (lastResult && state.phase === 'guessing') {
    const v = lastResult.verdict, i = g.guesses.length - 1;
    const prevName = i === 0 ? start.name : name(g.guesses[i - 1].code);
    const here = `${name(lastResult.code)} is ${formatKm(lastResult.distanceKm)} from the mystery country`;
    flash(v === 'warmer' ? `Warmer: ${here}, closer than ${prevName} was (${formatKm(lastResult.referenceKm)}).`
      : v === 'cooler' ? `Cooler: ${here}, further than ${prevName} was (${formatKm(lastResult.referenceKm)}).`
      : `Same: ${here}, the same as ${prevName}.`, v);
  }
  if (state.phase === 'over') { flash(''); renderReveal(); }
}

const DIR = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };
const times = (x) => (x >= 10 ? `${Math.round(x)}×` : x >= 1.05 ? `${x.toFixed(1)}×` : x > 0.95 ? 'about the same' : x >= 0.1 ? `${(1 / x).toFixed(1)}× smaller than` : `${Math.round(1 / x)}× smaller than`);
/** Facts that relate the found country to the player's starting country. */
function comparedToStart(c, start) {
  if (!start || c.code === start.code) return [];
  const km = haversineKm(start.latlng, c.latlng);
  // Beyond ~10,000 km the great-circle heading (often over a pole) stops matching intuition.
  const out = [km < 10000
    ? `It lies ${formatKm(km)} to the ${DIR[compassPoint(initialBearing(start.latlng, c.latlng))]} of ${start.name}.`
    : `It lies ${formatKm(km)} from ${start.name}, ${km > 15000 ? 'close to the far side of the world' : 'more than a quarter of the way around the world'}.`];
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

function flash(text, cls = '') {
  const f = $('flash'); f.textContent = text; f.className = `flash ${cls}`; f.hidden = !text;
}

function renderReveal() {
  const g = state.game, c = state.byCode.get(g.targetCode);
  const r = $('reveal');
  r.replaceChildren();
  const n = guessCount(g);
  r.append(el('p', 'outcome', g.status === 'won'
    ? `You found it in ${n} ${n === 1 ? 'guess' : 'guesses'}.`
    : `The mystery country was ${c.name}.`));
  const head = el('div', 'rhead');
  head.append(el('span', 'bigflag', c.flag));
  const t = el('div');
  t.append(el('h2', null, c.name), el('p', 'muted small', c.official));
  head.append(t);
  r.append(head);

  const dl = el('dl', 'facts-grid');
  const add = (k, v) => { dl.append(el('dt', null, k), el('dd', null, v)); };
  add('Capital', c.capital.length ? c.capital.join(', ') : '—');
  add('Population', c.population == null ? 'unknown' : fmtN(c.population));
  add('Area', `${fmtN(c.area)} km²`);
  add('Region', c.subregion || c.region);
  add('Languages', c.languages.length ? c.languages.join(', ') : '—');
  add('Currency', c.currencies.length ? c.currencies.join(', ') : '—');
  if (c.dependentOf) add('Administered by', state.byCode.get(c.dependentOf).name);
  r.append(dl);

  const bh = el('h3', null, 'Bordering countries');
  r.append(bh);
  if (c.borders.length) {
    const ul = el('ul', 'chips');
    for (const b of c.borders) ul.append(el('li', 'chip', `${state.byCode.get(b).flag} ${state.byCode.get(b).name}`));
    r.append(ul);
  } else r.append(el('p', 'muted', c.landlocked ? 'None.' : 'None: no land borders.'));

  r.append(el('h3', null, 'Did you know?'));
  const fl = el('ul', 'factlist');
  for (const f of [...c.facts, ...comparedToStart(c, state.byCode.get(g.startCode))]) fl.append(el('li', null, f));
  r.append(fl);

  const row = el('div', 'btnrow');
  const next = el('button', 'primary', `Next round: start from ${c.name}`);
  next.addEventListener('click', () => startRound(c.code));
  const same = el('button', null, `Again from ${state.byCode.get(g.startCode).name}`);
  same.addEventListener('click', () => startRound(g.startCode));
  const fresh = el('button', null, 'Pick a new start');
  fresh.addEventListener('click', () => resetToPickStart());
  row.append(next, same, fresh);
  r.append(row);
  r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

main().catch((err) => {
  console.error(err);
  const l = $('loading'); if (l) l.textContent = `Failed to load: ${err.message}`;
});
