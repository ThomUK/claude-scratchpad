import { shapeFactor } from './engine.js?v=dev';
import { censusCdf } from './explainmath.js?v=dev';
import { fmt } from './charts.js?v=dev';

const $ = (id) => document.getElementById(id);
const setStatus = (t, k) => { const el = $('status'); el.textContent = t; el.className = `status status--${k}`; };
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

let baseline = null;
const T = 18;               // the RTT window, weeks
const LAMBDA = 100;         // per-100-referrals/wk basis, matching the census-vs-flow explainer
let W = 20;                 // mean wait (weeks) for the discipline demo
let M = 1;                  // booking-discipline parameter (Erlang m): 1 = memoryless, large = FIFO

(async function init() {
  try {
    baseline = await (await fetch('data/baseline.json?v=dev', { cache: 'no-cache' })).json();
    buildLevers();
    renderWorked();
    renderDiscipline();
    renderTfcBars();
    setStatus('Live — the NUH values below are computed from the model seed, not typed in', 'ready');
  } catch (e) {
    console.error(e);
    setStatus('Failed to load model data.', 'error');
  }
})();

// --- worked example from a real TFC (anti-drift: real seed numbers) -----------
function tfcK(t) {
  const keep = 1 - (baseline.levers.otherRemovalsPct ?? 0);
  return shapeFactor(t.list, t.pct18 / 100, t.referralsWk * keep);
}

function renderWorked() {
  // largest list among named specialties (skip the "Other" grab-bags — poor teaching examples)
  const t = [...baseline.tfcs].filter((x) => !/^other/i.test(x.name)).sort((a, b) => b.list - a.list)[0];
  const keep = 1 - (baseline.levers.otherRemovalsPct ?? 0);
  const lam = t.referralsWk * keep;
  const k = tfcK(t);
  $('worked').innerHTML = `
    <div class="stat"><div class="v">${fmt(t.list)}</div><div class="l">${t.name} — list size L</div></div>
    <div class="stat"><div class="v">${t.pct18}%</div><div class="l">published %&lt;18wk (p)</div></div>
    <div class="stat"><div class="v">${fmt(lam)}</div><div class="l">effective referrals/wk (λ)</div></div>
    <div class="stat stat--accent"><div class="v">${k.toFixed(2)}</div><div class="l">k = −ln(1−p) × L ÷ (18 × λ)</div></div>`;
  $('worked-note').textContent = `Reading it: the textbook shape predicts what ${t.name}'s %<18wk SHOULD be for a list of ${fmt(t.list)} fed by ${fmt(lam)} effective referrals a week. Its published ${t.pct18}% implies the list behaves like a textbook list ${k > 1 ? `only 1/${k.toFixed(2)} as large — a younger age mix than its size suggests` : `${(1 / k).toFixed(2)}× larger — an older age mix than its size suggests`}. That ratio is k.`;
}

// --- booking discipline -> k (the bridge from the census-vs-flow explainer) ----
const LEVERS = [
  { key: 'W', label: 'Mean wait W (weeks)', min: 10, max: 40, step: 1, get: () => W, set: (v) => { W = v; } },
  { key: 'M', label: 'Booking discipline (1 = random selection … 40 ≈ strict FIFO)', min: 1, max: 40, step: 1, get: () => M, set: (v) => { M = v; } },
];

function buildLevers() {
  $('levers').innerHTML = LEVERS.map((l) => `<div class="lever">
    <label>${l.label} — <span class="val" id="lv-${l.key}">${l.get()}</span></label>
    <input type="range" data-lever="${l.key}" min="${l.min}" max="${l.max}" step="${l.step}" value="${l.get()}" />
  </div>`).join('');
  $('levers').addEventListener('input', (e) => {
    const l = LEVERS.find((x) => x.key === e.target.dataset.lever); if (!l) return;
    l.set(+e.target.value);
    $(`lv-${l.key}`).textContent = e.target.value;
    renderDiscipline();
  });
}

function renderDiscipline() {
  const L = LAMBDA * W;                       // Little's Law: stock = λ × mean wait
  const p = censusCdf(T, M, W);               // share of the stock under 18 weeks
  const k = shapeFactor(L, p, LAMBDA, T);     // THE SAME FUNCTION THE MODEL CALIBRATES WITH
  const pTarget = 0.92;
  const sustainable = (-T * k * LAMBDA) / Math.log(1 - pTarget);
  const sustainableTextbook = (-T * 1 * LAMBDA) / Math.log(1 - pTarget);
  $('disc-cards').innerHTML = `
    <div class="stat"><div class="v">${fmt(L)}</div><div class="l">List size (λ=${LAMBDA}/wk × W=${W}wk)</div></div>
    <div class="stat"><div class="v">${(100 * p).toFixed(1)}%</div><div class="l">%&lt;18wk the census camera reads</div></div>
    <div class="stat stat--accent"><div class="v">${k.toFixed(2)}</div><div class="l">implied shape factor k</div></div>
    <div class="stat ${k >= 1 ? 'stat--good' : 'stat--bad'}"><div class="v">${fmt(sustainable)}</div><div class="l">sustainable list at 92% (textbook: ${fmt(sustainableTextbook)})</div></div>`;
  drawAges($('chart-ages'), k, p);
}

// age-mix curves: how old are the people on the list?
function drawAges(canvas, k, p) {
  if (!canvas.dataset.baseW) { canvas.dataset.baseW = canvas.getAttribute('width'); canvas.dataset.baseH = canvas.getAttribute('height'); }
  const DW = +canvas.dataset.baseW, H = +canvas.dataset.baseH;
  const dpr = window.devicePixelRatio || 1;
  const Wc = canvas.clientWidth || DW;
  canvas.width = Wc * dpr; canvas.height = H * dpr; canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, Wc, H);
  const padL = 50, padR = 16, padT = 16, padB = 34;
  const iw = Wc - padL - padR, ih = H - padT - padB;
  const xmax = 60; // weeks of age shown
  const x = (a) => padL + (a / xmax) * iw;

  // census age density g(a) = S(a)/W for the chosen discipline, vs the textbook (m=1)
  const density = (m, a) => {
    const h = 0.5;
    const cdf1 = censusCdf(a, m, W), cdf2 = censusCdf(a + h, m, W);
    return (cdf2 - cdf1) / h;
  };
  const curves = [
    { m: 1, color: '#9aa4b2', dash: [5, 4], name: 'textbook shape (random selection)' },
    { m: M, color: '#2b97d6', dash: [], name: `this booking discipline` },
  ];
  let ymax = 0;
  const pts = curves.map((c) => {
    const ys = [];
    for (let a = 0; a <= xmax; a += 1) { const d = density(c.m, a); ys.push(d); ymax = Math.max(ymax, d); }
    return { ...c, ys };
  });
  ymax *= 1.12;
  const y = (d) => padT + ih - (d / ymax) * ih;

  // axes + 18-week line
  ctx.strokeStyle = '#242e3a';
  ctx.beginPath(); ctx.moveTo(padL, padT + ih); ctx.lineTo(Wc - padR, padT + ih); ctx.stroke();
  ctx.strokeStyle = '#c08a1e'; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(x(T), padT); ctx.lineTo(x(T), padT + ih); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#c08a1e'; ctx.font = '11.5px system-ui'; ctx.textAlign = 'left';
  ctx.fillText(`18-week line — ${(100 * p).toFixed(0)}% of the list is left of it`, x(T) + 8, padT + 12);

  pts.forEach((c) => {
    ctx.strokeStyle = c.color; ctx.lineWidth = 2; ctx.setLineDash(c.dash);
    ctx.beginPath();
    c.ys.forEach((d, a) => (a ? ctx.lineTo(x(a), y(d)) : ctx.moveTo(x(a), y(d))));
    ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
  });
  // legend + x labels
  ctx.textAlign = 'left'; ctx.font = '11.5px system-ui';
  pts.forEach((c, i) => {
    ctx.fillStyle = c.color; ctx.fillRect(padL + 8, padT + 6 + i * 17, 10, 3);
    ctx.fillStyle = css('--text'); ctx.fillText(c.name, padL + 24, padT + 11 + i * 17);
  });
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  for (let a = 0; a <= xmax; a += 12) ctx.fillText(`${a}wk`, x(a), padT + ih + 16);
  ctx.fillText('how long people on the list have been waiting →', padL + iw / 2, padT + ih + 31);
}

// --- the real NUH values, computed live from the seed ---------------------------
function renderTfcBars() {
  const rows = baseline.tfcs
    .map((t) => ({ code: t.code, name: t.name, k: tfcK(t), list: t.list }))
    .sort((a, b) => b.k - a.k);
  const canvas = $('chart-tfck');
  const rowH = 26, padT = 30, padB = 8;
  canvas.setAttribute('height', padT + padB + rows.length * rowH);
  if (!canvas.dataset.baseW) { canvas.dataset.baseW = canvas.getAttribute('width'); }
  canvas.dataset.baseH = canvas.getAttribute('height'); // height depends on row count, set before scaling
  const DW = +canvas.dataset.baseW, H = +canvas.dataset.baseH;
  const dpr = window.devicePixelRatio || 1;
  const Wc = canvas.clientWidth || DW;
  canvas.width = Wc * dpr; canvas.height = H * dpr; canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, Wc, H);
  const narrow = Wc < 640;
  const padL = narrow ? 120 : 300, padR = 56;
  const kmax = Math.max(...rows.map((r) => r.k)) * 1.08;
  const x = (k) => padL + (k / kmax) * (Wc - padL - padR);

  // k = 1 reference line
  ctx.strokeStyle = '#37465a'; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(x(1), padT - 14); ctx.lineTo(x(1), H - padB); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = css('--muted'); ctx.font = '11px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('k = 1 (textbook shape)', x(1), padT - 18);

  rows.forEach((r, i) => {
    const yy = padT + i * rowH;
    ctx.fillStyle = r.k >= 1 ? 'rgba(63, 174, 82, 0.5)' : 'rgba(248, 81, 73, 0.5)';
    ctx.fillRect(x(0), yy + 4, Math.max(2, x(r.k) - x(0)), rowH - 10);
    ctx.fillStyle = css('--text'); ctx.textAlign = 'right'; ctx.font = '11.5px system-ui';
    const label = narrow ? r.code : `${r.name} (${r.code})`;
    ctx.fillText(label, padL - 8, yy + rowH / 2 + 3);
    ctx.textAlign = 'left';
    ctx.fillText(r.k.toFixed(2), x(r.k) + 6, yy + rowH / 2 + 3);
  });

  const hi = rows[0], lo = rows[rows.length - 1];
  $('tfck-note').textContent = `Computed live from data/baseline.json with the same shapeFactor() the model calibrates with — this chart cannot disagree with the model. Highest: ${hi.name} at ${hi.k.toFixed(2)} — its list reads much younger than its size suggests; note the Feb–Mar 2026 EPR migration purge removed thousands of stale pathways, so a very high k can reflect a recent data cleanse as much as disciplined booking. Lowest: ${lo.name} at ${lo.k.toFixed(2)} — a slightly fatter long-wait tail than textbook. The trust range is ${lo.k.toFixed(2)}–${hi.k.toFixed(2)}; the RTT page quotes exactly this range in its data note.`;
}
