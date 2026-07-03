import { erlangCdf, censusCdf, runClearanceSim } from './explainmath.js?v=dev';
import { lineChart, fmt, S1, S2, S3 } from './charts.js?v=dev';

const $ = (id) => document.getElementById(id);

// --- panel 2: the standards, converted through the unifying model ------------
const STANDARDS = [
  { name: 'RTT interim (Apr-27)', camera: 'census', p: 0.65, T: 18, unit: 'wk' },
  { name: 'RTT constitutional', camera: 'census', p: 0.92, T: 18, unit: 'wk' },
  { name: 'DM01 constitutional', camera: 'census', p: 0.99, T: 6, unit: 'wk' },
  { name: 'Cancer FDS 28-day', camera: 'flow', p: 0.80, T: 4, unit: 'wk' },
  { name: 'Cancer 31-day', camera: 'flow', p: 0.96, T: 31 / 7, unit: 'wk' },
  { name: 'Cancer 62-day', camera: 'flow', p: 0.85, T: 62 / 7, unit: 'wk' },
];

function renderStandardsTable() {
  $('conv-standards').querySelector('tbody').innerHTML = STANDARDS.map((s) => {
    const W = -s.T / Math.log(1 - s.p);
    const L = 100 * W;
    return `<tr>
      <td>${s.name}</td>
      <td class="num">${s.camera}</td>
      <td class="num">${(100 * s.p).toFixed(0)}%</td>
      <td class="num">${s.T % 1 ? s.T.toFixed(1) : s.T} wk</td>
      <td class="num"><strong>${W.toFixed(1)} wk</strong></td>
      <td class="num">${fmt(L)}</td>
    </tr>`;
  }).join('');
}

// --- panel 3: shape explorer --------------------------------------------------
const shape = { W: 10, T: 18, k: 1 };
const SHAPE_LEVERS = [
  { key: 'W', label: 'Mean wait W (weeks)', min: 4, max: 20, step: 1 },
  { key: 'T', label: 'Standard window T (weeks)', min: 4, max: 30, step: 1 },
  { key: 'k', label: 'Booking discipline — 1 = random/memoryless → 8 = strict FIFO', min: 1, max: 8, step: 1 },
];

function buildShapeLevers() {
  $('shape-levers').innerHTML = SHAPE_LEVERS.map((l) => `<div class="lever">
    <label>${l.label} — <span class="val" id="sl-${l.key}">${shape[l.key]}</span></label>
    <input type="range" data-key="${l.key}" min="${l.min}" max="${l.max}" step="${l.step}" value="${shape[l.key]}" />
  </div>`).join('');
  $('shape-levers').addEventListener('input', (e) => {
    const key = e.target.dataset.key; if (!key) return;
    shape[key] = Number(e.target.value);
    $(`sl-${key}`).textContent = shape[key];
    renderShape();
  });
}

function renderShape() {
  const { W, T, k } = shape;
  const xmax = Math.max(Math.ceil(W * 3), T + 4);
  const xs = Array.from({ length: xmax + 1 }, (_, i) => `wk ${i}`);
  const flow = xs.map((_, i) => 100 * erlangCdf(i, k, W));
  const census = xs.map((_, i) => 100 * censusCdf(i, k, W));
  lineChart($('chart-shape'), xs, [
    { name: 'flow camera', data: flow, color: S3() },
    { name: 'census camera', data: census, color: S1() },
  ], {
    milestones: [{ i: T, label: `T = ${T}wk` }],
    xTickEvery: Math.ceil(xmax / 8), ymin: 0, ymax: 100, yfmt: (v) => `${v.toFixed(0)}%`,
  });
  const fT = 100 * erlangCdf(T, k, W), cT = 100 * censusCdf(T, k, W);
  const agree = Math.abs(fT - cT) < 1;
  $('shape-cards').innerHTML = `
    <div class="stat stat--good"><div class="v">${fT.toFixed(1)}%</div><div class="l">Flow camera reads (cohort within ${T} wk)</div></div>
    <div class="stat stat--accent"><div class="v">${cT.toFixed(1)}%</div><div class="l">Census camera reads (stock under ${T} wk)</div></div>
    <div class="stat"><div class="v">${(cT - fT) >= 0 ? '+' : ''}${(cT - fT).toFixed(1)}pp</div><div class="l">${agree ? 'Memoryless: the cameras agree — 1 − e^(−T/W)' : 'Census minus flow — the shape effect'}</div></div>
    <div class="stat"><div class="v">${fmt(100 * W)}</div><div class="l">Little’s Law: list at 100 referrals/wk (L = λ·W)</div></div>`;
}

// --- panel 4: clearance drive -------------------------------------------------
function renderDrive() {
  const sim = runClearanceSim();
  const xs = sim.censusPct.map((_, i) => `wk ${i}`);
  lineChart($('chart-drive'), xs, [
    { name: 'census camera', data: sim.censusPct, color: S1() },
    { name: 'flow camera', data: sim.flowPct, color: S3() },
  ], {
    milestones: [{ i: 26, label: 'drive starts' }, { i: 78, label: 'drive ends' }],
    xTickEvery: 13, ymin: 0, ymax: 100, yfmt: (v) => `${v.toFixed(0)}%`,
  });
}

renderStandardsTable();
buildShapeLevers();
renderShape();
renderDrive();
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { renderShape(); renderDrive(); }, 150); });
