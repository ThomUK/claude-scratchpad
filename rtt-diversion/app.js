import { MAX_WEEKS, TARGET_WEEKS, simulateAll } from './engine.js?v=dev';

// ---------- constants ----------
const TARGET_DATE = new Date(2028, 3, 1); // 1 April 2028 (local)
const WEEKS_AFTER = 52;
const COLORS = { surplus: '#3987e5', balance: '#d95926', deficit: '#199e70' };
const SURFACE = '#0f1620', GRID = '#1e2936', INK = '#e6edf3', INK2 = '#9aa7b4', WARN = '#d29922';
const FONT = '12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// ---------- dates ----------
const START = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const weeksToTarget = Math.max(TARGET_WEEKS + 1, Math.round((TARGET_DATE - START) / (7 * 864e5)));
const dateAt = (t) => new Date(START.getTime() + t * 7 * 864e5);
const fmtDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtN = (v) => Math.round(v).toLocaleString('en-GB');
const fmtPct = (v) => v.toFixed(1) + '%';

// ---------- state ----------
const $ = (id) => document.getElementById(id);
const state = { params: null, scenarios: [], t: 0, playing: false, speed: 8, yMax: 1, cells: [], hoverX: null };
const totalWeeks = weeksToTarget + WEEKS_AFTER;

// ---------- canvas helpers ----------
function setupCanvas(c, cssW, cssH) {
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr);
  c.style.width = '100%'; c.style.aspectRatio = `${cssW} / ${cssH}`;
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = FONT;
  return ctx;
}
function hatchPattern(ctx, color) {
  const p = document.createElement('canvas'); p.width = p.height = 6;
  const g = p.getContext('2d');
  g.strokeStyle = color; g.lineWidth = 1.6; g.globalAlpha = 0.9;
  g.beginPath(); g.moveTo(-1, 7); g.lineTo(7, -1); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(5, 7); g.lineTo(7, 5); g.stroke();
  return ctx.createPattern(p, 'repeat');
}
function niceStep(v) { return niceMax(v); }
function ticks(yMax, n = 4) {
  const step = niceStep(yMax / n);
  const out = [];
  for (let v = 0; v <= yMax + 1e-9; v += step) out.push(v);
  return out;
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
const tip = $('tip');
function showTip(x, y, html) {
  tip.innerHTML = html; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(x + 14, window.innerWidth - r.width - 8) + 'px';
  tip.style.top = Math.max(8, Math.min(y + 14, window.innerHeight - r.height - 8)) + 'px';
}
function hideTip() { tip.hidden = true; }

// ---------- inputs ----------
function readParams() {
  const rnd = +$('in-rnd').value;
  $('in-rnd-out').textContent = rnd === 100 ? '100% random' : `${rnd}% random · ${100 - rnd}% longest-waiting-first`;
  return {
    referrals: Math.max(1, +$('in-ref').value || 3500),
    pctUnder18: Math.min(99, Math.max(1, +$('in-p18').value || 60)),
    randomShare: rnd / 100,
    loads: { surplus: +$('in-sur').value || 0.9, balance: +$('in-bal').value || 1, deficit: +$('in-def').value || 1.1 },
    weeksToTarget, weeksAfter: WEEKS_AFTER,
  };
}

function compute() {
  state.params = readParams();
  state.scenarios = simulateAll(state.params);
  let m = 0;
  for (const s of state.scenarios) for (const f of s.frames) for (let i = 0; i <= MAX_WEEKS; i++) if (f.bins[i] > m) m = f.bins[i];
  state.yMax = niceMax(m * 1.02);
  renderDerived();
  buildCells();
  drawAll();
  renderTable();
}

function renderDerived() {
  const p = state.params;
  const s0 = state.scenarios[0].frames[0].metrics;
  const caps = state.scenarios.slice(0, 3);
  $('derived').innerHTML = [
    [fmtN(s0.total), 'starting list (λ·W)'],
    [s0.meanWait.toFixed(1) + ' wk', 'starting mean wait'],
    ...caps.map((s) => [fmtN(s.capacity) + '/wk', `capacity · ${s.label.replace('Capacity ', '')} (load ${s.load.toFixed(2)})`]),
    [weeksToTarget + ' wk', `from ${fmtDate(START)} to 1 Apr 2028`],
  ].map(([v, l]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
}

// ---------- six panels ----------
function buildCells() {
  const grid = $('grid6');
  if (state.cells.length) { return; }
  $('legend-hist').innerHTML = `
    <span class="k"><span class="sw" style="background:${COLORS.surplus}"></span>surplus</span>
    <span class="k"><span class="sw" style="background:${COLORS.balance}"></span>balance</span>
    <span class="k"><span class="sw" style="background:${COLORS.deficit}"></span>deficit</span>
    <span class="k"><span class="sw hatch" style="color:${INK2}"></span>protected cohort (will be under 18 wk on 1 April; not treated)</span>
    <span class="k"><span class="ln dash" style="border-color:${INK2}"></span>18-week line</span>`;
  grid.innerHTML = '';
  state.cells = state.scenarios.map((s, idx) => {
    const el = document.createElement('div'); el.className = 'cell';
    el.innerHTML = `
      <h3><span class="dot" style="background:${COLORS[s.key]}"></span><span class="ttl"></span></h3>
      <div class="sub"></div>
      <canvas width="380" height="200" aria-label="Waiting list census by weeks waited"></canvas>
      <div class="stats"></div>
      <div class="snapline"></div>`;
    grid.appendChild(el);
    const canvas = el.querySelector('canvas');
    const ctx = setupCanvas(canvas, 380, 200);
    const cell = { el, canvas, ctx, idx, hatch: hatchPattern(ctx, COLORS[s.key]),
      ttl: el.querySelector('.ttl'), sub: el.querySelector('.sub'), stats: el.querySelector('.stats'), snap: el.querySelector('.snapline') };
    canvas.addEventListener('mousemove', (e) => onHistHover(cell, e));
    canvas.addEventListener('mouseleave', hideTip);
    return cell;
  });
}

const H = { l: 40, r: 10, t: 10, b: 38, w: 380, h: 200 };
const xOfBin = (i) => H.l + (i / (MAX_WEEKS + 1)) * (H.w - H.l - H.r);

function drawCell(cell) {
  const s = state.scenarios[cell.idx];
  const f = s.frames[state.t];
  const { ctx } = cell;
  const pw = H.w - H.l - H.r, ph = H.h - H.t - H.b;
  const yOf = (v) => H.t + ph - (v / state.yMax) * ph;

  cell.ttl.textContent = `${s.label} · load ${s.load.toFixed(2)}`;
  cell.sub.textContent = s.divert ? (f.eligibleFrom > 0 ? `Diverted: treating only ≥ ${f.eligibleFrom} wk (will be 18+ on 1 April)` : 'Diverted in the last 18 weeks') : 'Ordinary removal throughout';
  if (s.divert && f.eligibleFrom > 0) cell.sub.style.color = WARN; else cell.sub.style.color = '';

  ctx.fillStyle = SURFACE; ctx.fillRect(0, 0, H.w, H.h);
  // gridlines
  ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.fillStyle = INK2; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of ticks(state.yMax)) {
    const y = Math.round(yOf(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(H.l, y); ctx.lineTo(H.w - H.r, y); ctx.stroke();
    ctx.fillText(v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : String(v), H.l - 5, y);
  }
  // x ticks
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const i of [0, 18, 26, 52, 65, 78, 104]) ctx.fillText(i === 104 ? '104+' : String(i), xOfBin(i + 0.5), H.h - H.b + 6);
  ctx.fillStyle = INK2; ctx.textAlign = 'center'; ctx.fillText('weeks waited', H.l + pw / 2, H.h - 15);

  // bars (step area, one bin per step; bins too thin for a surface gap)
  const bw = pw / (MAX_WEEKS + 1);
  const col = COLORS[s.key];
  for (let i = 0; i <= MAX_WEEKS; i++) {
    const v = f.bins[i]; if (v <= 0) continue;
    const x = xOfBin(i), y = yOf(v);
    const protectedBin = s.divert && f.eligibleFrom > 0 && i < f.eligibleFrom;
    ctx.fillStyle = protectedBin ? cell.hatch : col;
    ctx.globalAlpha = protectedBin ? 1 : 0.9;
    ctx.fillRect(x, y, Math.max(bw - 0.3, 0.5), H.t + ph - y);
  }
  ctx.globalAlpha = 1;
  // 18-week rule
  const x18 = Math.round(xOfBin(TARGET_WEEKS)) + 0.5;
  ctx.setLineDash([3, 3]); ctx.strokeStyle = INK2; ctx.beginPath(); ctx.moveTo(x18, H.t); ctx.lineTo(x18, H.t + ph); ctx.stroke(); ctx.setLineDash([]);

  const m = f.metrics;
  cell.stats.innerHTML = [
    ['%<18 wk', fmtPct(m.pctUnder18)], ['list', fmtN(m.total)], ['52+ wk', fmtN(m.over52)], ['65+ wk', fmtN(m.over65)],
  ].map(([l, v]) => `<div>${l}<b>${v}</b></div>`).join('');
  const sn = s.frames[weeksToTarget].metrics;
  cell.snap.innerHTML = state.t >= weeksToTarget
    ? `1 Apr 2028: <b>${fmtPct(sn.pctUnder18)}</b> under 18 wk${state.t > weeksToTarget ? ` · now <b>${fmtPct(m.pctUnder18)}</b>` : ''}`
    : `${weeksToTarget - state.t} weeks to 1 Apr 2028`;
}

function onHistHover(cell, e) {
  const r = cell.canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * H.w;
  const i = Math.floor(((x - H.l) / (H.w - H.l - H.r)) * (MAX_WEEKS + 1));
  if (i < 0 || i > MAX_WEEKS) { hideTip(); return; }
  const s = state.scenarios[cell.idx], f = s.frames[state.t];
  const prot = s.divert && f.eligibleFrom > 0 && i < f.eligibleFrom;
  showTip(e.clientX, e.clientY, `<div class="t">${s.label}${s.divert ? ' · diverted' : ''} · ${fmtDate(dateAt(state.t))}</div>
    <div class="row"><span class="k"><span class="sw" style="background:${COLORS[s.key]}"></span>waited ${i === MAX_WEEKS ? '104+' : i + '–' + (i + 1)} wk</span><span>${fmtN(f.bins[i])}</span></div>
    ${prot ? `<div class="row"><span class="k">protected (will be under 18 wk on 1 April)</span></div>` : ''}`);
}

// ---------- line charts ----------
const L = { l: 52, r: 14, t: 14, b: 30, w: 560, h: 300 };
const lineCharts = [];
function buildLines() {
  $('legend-lines').innerHTML = ['surplus', 'balance', 'deficit'].map((k) =>
    `<span class="k"><span class="ln" style="border-color:${COLORS[k]}"></span>${k} · ordinary</span>
     <span class="k"><span class="ln dash" style="border-color:${COLORS[k]}"></span>${k} · diverted</span>`).join('');
  for (const [id, metric, title, fmt, yfix] of [
    ['c-pct', 'pctUnder18', '% of list under 18 weeks', fmtPct, 100],
    ['c-size', 'total', 'Total waiting list', fmtN, null],
  ]) {
    const canvas = $(id), ctx = setupCanvas(canvas, L.w, L.h);
    const ch = { canvas, ctx, metric, title, fmt, yfix };
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * L.w;
      const t = Math.round(((x - L.l) / (L.w - L.l - L.r)) * totalWeeks);
      if (t < 0 || t > totalWeeks) { state.hoverX = null; hideTip(); drawLines(); return; }
      state.hoverX = t; drawLines();
      showTip(e.clientX, e.clientY, `<div class="t">${fmtDate(dateAt(t))} · week ${t}</div>` + state.scenarios.map((s) =>
        `<div class="row"><span class="k"><span class="sw" style="background:${COLORS[s.key]};${s.divert ? 'opacity:.55' : ''}"></span>${s.key}${s.divert ? ' · diverted' : ''}</span><span>${fmt(s.frames[t].metrics[metric])}</span></div>`).join(''));
    });
    canvas.addEventListener('mouseleave', () => { state.hoverX = null; hideTip(); drawLines(); });
    lineCharts.push(ch);
  }
}

function drawLines() {
  for (const ch of lineCharts) {
    const { ctx, metric } = ch;
    const pw = L.w - L.l - L.r, ph = L.h - L.t - L.b;
    let yMax = ch.yfix;
    if (yMax == null) { let m = 0; for (const s of state.scenarios) for (const f of s.frames) m = Math.max(m, f.metrics[metric]); yMax = niceMax(m * 1.05); }
    const xOf = (t) => L.l + (t / totalWeeks) * pw;
    const yOf = (v) => L.t + ph - (v / yMax) * ph;

    ctx.fillStyle = SURFACE; ctx.fillRect(0, 0, L.w, L.h);
    ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '600 ' + FONT; ctx.fillText(ch.title, L.l, 2); ctx.font = FONT;
    ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.fillStyle = INK2; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of ticks(yMax)) {
      const y = Math.round(yOf(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(L.l, y); ctx.lineTo(L.w - L.r, y); ctx.stroke();
      ctx.fillText(ch.yfix ? v + '%' : (v >= 1000 ? (v / 1000) + 'k' : v), L.l - 6, y);
    }
    // x ticks every ~13 weeks, labelled with month/year
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = 0; t <= totalWeeks; t += 13) ctx.fillText(dateAt(t).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), xOf(t), L.h - L.b + 8);

    // 1 April rule
    const xa = Math.round(xOf(weeksToTarget)) + 0.5;
    ctx.strokeStyle = WARN; ctx.beginPath(); ctx.moveTo(xa, L.t); ctx.lineTo(xa, L.t + ph); ctx.stroke();
    ctx.fillStyle = WARN; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('1 Apr 2028', xa - 4, L.t + ph - 3); ctx.textBaseline = 'top';

    // series
    ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const s of state.scenarios) {
      ctx.strokeStyle = COLORS[s.key]; ctx.setLineDash(s.divert ? [6, 4] : []);
      ctx.beginPath();
      s.frames.forEach((f, t) => { const x = xOf(t), y = yOf(f.metrics[metric]); t ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // cursor + hover
    for (const [t, color] of [[state.t, INK], [state.hoverX, INK2]]) {
      if (t == null) continue;
      const x = Math.round(xOf(t)) + 0.5;
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, L.t); ctx.lineTo(x, L.t + ph); ctx.stroke();
      for (const s of state.scenarios) {
        const y = yOf(s.frames[t].metrics[metric]);
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = COLORS[s.key]; ctx.fill();
        ctx.strokeStyle = SURFACE; ctx.lineWidth = 2; ctx.stroke();
      }
    }
  }
}

// ---------- table ----------
function renderTable() {
  const T = weeksToTarget, T10 = Math.min(T + 10, totalWeeks);
  const rows = state.scenarios.map((s) => {
    const a = s.frames[T].metrics, b = s.frames[T10].metrics;
    const spilled = s.frames.slice(T - TARGET_WEEKS + 1, T + 1).reduce((acc, f) => acc + f.spilled, 0);
    const ord = state.scenarios.find((o) => o.key === s.key && !o.divert).frames[T].metrics.pctUnder18;
    const d = a.pctUnder18 - ord;
    return `<tr>
      <td><span class="dot" style="background:${COLORS[s.key]}"></span>${s.label} · ${s.divert ? 'diverted' : 'ordinary'}</td>
      <td>${s.load.toFixed(2)}</td>
      <td><b>${fmtPct(a.pctUnder18)}</b></td>
      <td class="${s.divert ? (d > 0.05 ? 'up' : '') : ''}">${s.divert ? (d >= 0 ? '+' : '') + d.toFixed(1) + ' pts' : '—'}</td>
      <td>${fmtPct(b.pctUnder18)}</td>
      <td>${fmtN(a.total)}</td><td>${fmtN(a.over52)}</td><td>${fmtN(a.over65)}</td><td>${a.meanWait.toFixed(1)}</td>
      <td>${s.divert ? fmtN(spilled) : '—'}</td></tr>`;
  });
  $('snap').innerHTML = `<thead><tr><th>Scenario</th><th>Load</th><th>%&lt;18 wk on 1 Apr 2028</th><th>vs ordinary</th><th>%&lt;18 wk 10 wk later</th><th>List</th><th>52+ wk</th><th>65+ wk</th><th>Mean wait (wk)</th><th>Spilled</th></tr></thead><tbody>${rows.join('')}</tbody>`;
}

// ---------- animation ----------
function setT(t) {
  state.t = Math.max(0, Math.min(totalWeeks, Math.round(t)));
  $('in-t').value = state.t;
  const rel = weeksToTarget - state.t;
  $('when-date').textContent = fmtDate(dateAt(state.t));
  $('when-rel').innerHTML = rel > 0
    ? `${rel} wk to 1 Apr 2028${rel <= TARGET_WEEKS ? ' <span class="badge badge--div">diversion window</span>' : ''}`
    : rel === 0 ? '<span class="badge badge--day">1 April 2028</span>' : `${-rel} wk after 1 Apr 2028`;
  drawAll();
}
// Coalesce redraws: a fast scrub fires many input events per frame; draw once per frame.
let drawQueued = false;
function drawAll() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; for (const c of state.cells) drawCell(c); drawLines(); });
}

let last = null, acc = 0;
function tick(now) {
  if (!state.playing) return;
  if (last != null) { acc += ((now - last) / 1000) * state.speed; }
  last = now;
  if (acc >= 1) { const n = Math.floor(acc); acc -= n; setT(state.t + n); }
  if (state.t >= totalWeeks) { stop(); return; }
  requestAnimationFrame(tick);
}
function play() {
  if (state.t >= totalWeeks) setT(0);
  state.playing = true; last = null; acc = 0;
  $('btn-play').textContent = '❚❚ Pause';
  requestAnimationFrame(tick);
}
function stop() { state.playing = false; $('btn-play').textContent = state.t >= totalWeeks ? '↻ Replay' : '▶ Play'; }

// ---------- wiring ----------
$('in-t').max = totalWeeks;
for (const id of ['in-ref', 'in-p18', 'in-sur', 'in-bal', 'in-def', 'in-rnd']) $(id).addEventListener('input', () => { compute(); setT(state.t); });
$('in-speed').addEventListener('change', (e) => { state.speed = +e.target.value; });
$('in-t').addEventListener('input', (e) => { stop(); setT(+e.target.value); });
$('btn-play').addEventListener('click', () => (state.playing ? stop() : play()));
$('btn-april').addEventListener('click', () => { stop(); setT(weeksToTarget); });

buildLines();
compute();
setT(0);
