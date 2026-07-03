import { runScenario, ymDiff } from './engine.js?v=dev';
import { lineChart, fmt, S1, S2, S3 } from './charts.js?v=dev';

const $ = (id) => document.getElementById(id);
const setStatus = (t, k) => { const el = $('status'); el.textContent = t; el.className = `status status--${k}`; };


let baseline = null;
let scenario = { levers: {}, tfcOverrides: {} };   // user deltas over the baseline
let result = null;
let selectedTfc = null;

// --- boot -------------------------------------------------------------------
(async function init() {
  try {
    baseline = await (await fetch('data/baseline.json?v=dev', { cache: 'no-cache' })).json();
    buildLevers();
    recompute();
    wire();
    setStatus('Model ready — every figure is editable', 'ready');
  } catch (e) {
    console.error(e);
    setStatus('Failed to load model data.', 'error');
  }
})();

function recompute() {
  result = runScenario(baseline, { levers: scenario.levers, tfcOverrides: scenario.tfcOverrides });
  if (!selectedTfc) selectedTfc = result.perTfc[0].tfc.code;
  renderCards();
  renderCharts();
  renderTable();
  renderTfcChart();
}

// --- overview cards -----------------------------------------------------------
function renderCards() {
  const t = result.trust, cal = result.cal;
  const i27 = ymDiff(cal[0], '2027-04'), i29 = ymDiff(cal[0], '2029-04');
  const upliftPct = 100 * (Math.max(...t.requiredStopsMo) / t.currentStopsMo[0] - 1);
  const rawRefMo = baseline.tfcs.reduce((a, x) => a + x.referralsWk, 0) * (52 / 12);
  $('cards').innerHTML = `
    <div class="stat"><div class="v">${fmt(t.list[0])}</div><div class="l">Waiting list (published Apr-26)</div></div>
    <div class="stat stat--accent"><div class="v">${t.impliedPct[0].toFixed(1)}%</div><div class="l">Within 18 weeks (published Apr-26)</div></div>
    <div class="stat"><div class="v">${fmt(t.demandMo[0])}</div><div class="l">Effective demand / month (${fmt(rawRefMo)} referrals less ${(100 * result.levers.otherRemovalsPct).toFixed(1)}% other removals)</div></div>
    <div class="stat ${upliftPct > 15 ? 'stat--bad' : upliftPct > 5 ? 'stat--warn' : 'stat--good'}"><div class="v">+${upliftPct.toFixed(1)}%</div><div class="l">Peak capacity uplift required vs current</div></div>
    <div class="stat"><div class="v">${fmt(t.list[i27])}</div><div class="l">List needed by Apr-27 (65%)</div></div>
    <div class="stat"><div class="v">${fmt(t.list[i29])}</div><div class="l">List needed by Apr-29 (92%)</div></div>`;
}

const MS_LABELS = [
  { ym: '2027-04', label: '65%' }, { ym: '2028-04', label: '80%' }, { ym: '2029-04', label: '92%' },
];

function renderCharts() {
  const t = result.trust, cal = result.cal;
  lineChart($('chart-perf'), cal, [
    { name: 'implied % <18wk', data: t.impliedPct, color: S1() },
  ], { milestones: MS_LABELS, ymin: 55, ymax: 100, yfmt: (v) => `${v.toFixed(0)}%` });
  lineChart($('chart-list'), cal, [
    { name: 'list (required path)', data: t.list, color: S1() },
    { name: 'sustainable target', data: t.targetList, color: S2(), dash: [5, 4] },
  ], { milestones: MS_LABELS, yfmt: (v) => `${(v / 1000).toFixed(0)}k` });
  lineChart($('chart-stops'), cal, [
    { name: 'required', data: t.requiredStopsMo, color: S1() },
    { name: 'current', data: t.currentStopsMo, color: S2(), dash: [5, 4] },
  ], { milestones: MS_LABELS, yfmt: (v) => `${(v / 1000).toFixed(1)}k` });
}

// --- levers -------------------------------------------------------------------
const LEVERS = [
  { key: 'demandGrowthAdjPctYr', label: 'Demand growth adjustment (±%/yr)', min: -3, max: 5, step: 0.5, pct: false, bench: 'on calibrated baselines: trust −2.5%/yr, per-TFC where clean (pre-EPR pair Apr-24→Apr-25)' },
  { key: 'otherRemovalsPct', label: 'Referrals leaving without treatment', min: 0, max: 0.4, step: 0.01, pct: true, bench: 'calibrated 10.7% (pre-EPR pair; DNA discharge, duplicates, validation — the EPR year\'s 20.3% is excluded as contaminated)' },
  { key: 'dnaRate', label: 'Outpatient DNA rate', min: 0.03, max: 0.12, step: 0.005, pct: true, bench: 'best practice 5% (NHS Elect)' },
  { key: 'clinicUtilisation', label: 'Clinic utilisation', min: 0.75, max: 0.95, step: 0.01, pct: true, bench: 'target 90% (NHS Elect)' },
  { key: 'theatreUtilisation', label: 'Theatre utilisation (capped)', min: 0.65, max: 0.9, step: 0.01, pct: true, bench: 'GIRFT standard 85%' },
  { key: 'bedOccupancy', label: 'G&A bed occupancy', min: 0.85, max: 0.98, step: 0.01, pct: true, bench: 'planning ambition 92%' },
];

function buildLevers() {
  $('levers').innerHTML = LEVERS.map((l) => {
    const v = baseline.levers[l.key] ?? 0;
    return `<div class="lever">
      <label>${l.label} — <span class="val" id="lv-${l.key}">${l.pct ? (v * 100).toFixed(1) + '%' : v}</span></label>
      <input type="range" data-lever="${l.key}" min="${l.min}" max="${l.max}" step="${l.step}" value="${v}" />
      <div class="bench">${l.bench}</div>
    </div>`;
  }).join('');
}

// --- specialty table ------------------------------------------------------------
function renderTable() {
  const rows = result.perTfc.map(({ tfc, series: s }) => {
    const peak = Math.max(...s.requiredStopsMo);
    const uplift = 100 * (peak / s.currentStopsMo[0] - 1);
    const cls = uplift > 15 ? 'bad' : uplift > 5 ? 'warn' : 'good';
    const iPk = s.requiredStopsMo.indexOf(peak);
    return `<tr data-code="${tfc.code}" class="${tfc.code === selectedTfc ? 'sel' : ''}">
      <td>${tfc.code}</td><td>${tfc.name}</td>
      <td class="num">${fmt(tfc.list)}</td><td class="num">${tfc.pct18}%</td>
      <td class="num">${fmt(tfc.referralsWk)}</td>
      <td class="num">${fmt(s.currentStopsMo[0])}</td>
      <td class="num">${fmt(peak)}</td>
      <td class="num"><span class="pill pill--${cls}">+${uplift.toFixed(0)}%</span></td>
      <td class="num">${fmt(s.opSlotsMo[iPk])}</td>
      <td class="num">${fmt(s.theatreSessionsMo[iPk], 0)}</td>
      <td class="num">${fmt(s.bedsRequired[iPk], 1)}</td>
      <td class="num">${fmt(s.diagnosticsMo[iPk])}</td>
    </tr>`;
  }).join('');
  $('tfc-table').querySelector('tbody').innerHTML = rows;
}

function renderTfcChart() {
  const row = result.perTfc.find((r) => r.tfc.code === selectedTfc);
  if (!row) return;
  $('tfc-chart-title').textContent = `${row.tfc.name} (${row.tfc.code}) — required vs current clock stops per month`;
  lineChart($('chart-tfc'), result.cal, [
    { name: 'required', data: row.series.requiredStopsMo, color: S1() },
    { name: 'current', data: row.series.currentStopsMo, color: S2(), dash: [5, 4] },
    { name: 'demand', data: row.series.demandMo, color: S3(), dash: [2, 3] },
  ], { milestones: MS_LABELS, yfmt: (v) => fmt(v) });
}

// --- wiring -------------------------------------------------------------------
function wire() {
  $('levers').addEventListener('input', (e) => {
    const key = e.target.dataset.lever; if (!key) return;
    const v = Number(e.target.value);
    scenario.levers[key] = v;
    const meta = LEVERS.find((l) => l.key === key);
    $(`lv-${key}`).textContent = meta.pct ? (v * 100).toFixed(1) + '%' : v;
    recompute();
  });

  $('tfc-table').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-code]'); if (!tr) return;
    selectedTfc = tr.dataset.code;
    renderTable(); renderTfcChart();
  });

  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ savedAt: new Date().toISOString(), scenario }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'demand-capacity-scenario.json';
    a.click(); URL.revokeObjectURL(a.href);
  });
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      scenario = j.scenario || j;
      buildLevers();
      Object.entries(scenario.levers || {}).forEach(([k, v]) => {
        const input = document.querySelector(`input[data-lever="${k}"]`); if (input) input.value = v;
        const meta = LEVERS.find((l) => l.key === k);
        if (meta) $(`lv-${k}`).textContent = meta.pct ? (v * 100).toFixed(1) + '%' : v;
      });
      recompute();
    } catch (err) { console.error(err); setStatus('Could not read scenario file.', 'error'); }
    e.target.value = '';
  });

  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { renderCharts(); renderTfcChart(); }, 150); });
}
