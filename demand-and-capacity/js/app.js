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

let resultRaw = null; // same scenario under the RAW (unadjusted) growth calibration

function recompute() {
  result = runScenario(baseline, { levers: scenario.levers, tfcOverrides: scenario.tfcOverrides });
  const rawShift = (baseline.levers.demandGrowthRawPctYr ?? baseline.levers.demandGrowthPctYr)
    - baseline.levers.demandGrowthPctYr;
  resultRaw = runScenario(baseline, {
    levers: { ...scenario.levers, demandGrowthAdjPctYr: (scenario.levers.demandGrowthAdjPctYr ?? 0) + rawShift },
    tfcOverrides: scenario.tfcOverrides,
  });
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
    <div class="stat"><div class="v">${fmt(rawRefMo)}</div><div class="l">Referrals / month (New RTT Periods)</div></div>
    <div class="stat"><div class="v">−${fmt(rawRefMo - t.demandMo[0])}</div><div class="l">Other removals / month (${(100 * result.levers.otherRemovalsPct).toFixed(1)}% leave without a counted clock stop)</div></div>
    <div class="stat"><div class="v">${fmt(t.demandMo[0])}</div><div class="l">Effective demand / month (needs a clock stop)</div></div>
    <div class="stat ${upliftPct > 15 ? 'stat--bad' : upliftPct > 5 ? 'stat--warn' : 'stat--good'}"><div class="v">+${upliftPct.toFixed(1)}%</div><div class="l">Peak capacity uplift required vs current</div></div>
    <div class="stat"><div class="v">${fmt(t.list[i27])}</div><div class="l">List at Apr-27 on the required path (≠ sustainable target)</div></div>
    <div class="stat"><div class="v">${fmt(t.list[i29])}</div><div class="l">List at Apr-29 on the required path</div></div>`;
  $('level-note').textContent = `Flow levels are working-day-normalised means over Feb–Apr 2026 (a standard 21-working-day month): per working day, April referrals were actually the HIGHEST of the four observed months (956/wd vs 902–928) — the apparent April dip was entirely working-day count. January is excluded (EPR catch-up tail: 615 stops/wd vs 656–688 later). The census (list, bands) is April's, post the Feb→Mar validation purge of ~8,500 migrated pathways.`;
}

const MS_LABELS = [
  { ym: '2027-04', label: '65%' }, { ym: '2028-04', label: '80%' }, { ym: '2029-04', label: '92%' },
];

function renderCharts() {
  const t = result.trust, cal = result.cal;
  lineChart($('chart-perf'), cal, [
    { name: 'implied % <18wk', data: t.impliedPct, color: S1() },
  ], { milestones: MS_LABELS, ymin: 55, ymax: 100, yfmt: (v) => `${v.toFixed(0)}%` });
  const i27 = ymDiff(cal[0], '2027-04'), i28 = ymDiff(cal[0], '2028-04');
  $('ms-note').textContent = `Why the line sits above the milestones: the 65/80/92 milestones are applied to every TFC individually, never below its start position (an equity stance — no specialty is traded off to hit the trust number). The aggregate therefore overshoots: ${t.impliedPct[i27].toFixed(1)}% at Apr-27 vs the 65% trust milestone, ${t.impliedPct[i28].toFixed(1)}% vs 80% at Apr-28. A trust-optimal plan hitting the aggregate exactly would need less capacity — the gap between the line and the milestone is the price of specialty equity.`;
  const band = (a, b) => ({
    upper: a.map((v, i) => Math.max(v, b[i])),
    lower: a.map((v, i) => Math.min(v, b[i])),
  });
  lineChart($('chart-list'), cal, [
    { name: 'list (required path)', data: t.list, color: S1() },
    { name: 'sustainable target', data: t.targetList, color: S2(), dash: [5, 4] },
  ], { milestones: MS_LABELS, yfmt: (v) => `${(v / 1000).toFixed(0)}k`,
       band: band(t.targetList, resultRaw.trust.targetList) });
  lineChart($('chart-stops'), cal, [
    { name: 'required', data: t.requiredStopsMo, color: S1() },
    { name: 'held at Apr-26 rate', data: t.currentStopsMo, color: S2(), dash: [5, 4] },
  ], { milestones: MS_LABELS, yfmt: (v) => `${(v / 1000).toFixed(1)}k`,
       band: band(t.requiredStopsMo, resultRaw.trust.requiredStopsMo) });
  $('band-note').textContent = `Shaded band: the demand-growth calibration question — the lower edge uses the raw Apr→Apr pair (${baseline.levers.demandGrowthRawPctYr}%/yr, which reads low because April 2024 had 21 working days vs 20 in 2025), the line uses the working-day-adjusted ${baseline.levers.demandGrowthPctYr}%/yr. Demand is most likely growing, not falling.`;
}

// --- levers -------------------------------------------------------------------
const LEVERS = [
  { key: 'demandGrowthAdjPctYr', label: 'Demand growth adjustment (±%/yr)', min: -3, max: 5, step: 0.5, pct: false, bench: 'on calibrated baselines: trust +2.3%/yr working-day adjusted (raw Apr/Apr −2.5%), per-TFC where clean (pre-EPR pair)' },
  { key: 'otherRemovalsPct', label: 'Referrals leaving without treatment', min: 0, max: 0.4, step: 0.01, pct: true, bench: 'calibrated 10.7% (pre-EPR pair; DNA discharge, duplicates, validation — the EPR year\'s 20.3% is excluded as contaminated)' },
  { key: 'dnaRate', label: 'Outpatient DNA rate', min: 0.03, max: 0.12, step: 0.005, pct: true, bench: 'best practice 5% (NHS Elect)' },
  { key: 'clinicUtilisation', label: 'Clinic utilisation', min: 0.75, max: 0.95, step: 0.01, pct: true, bench: 'target 90% (NHS Elect)' },
  { key: 'theatreUtilisation', label: 'Theatre utilisation (capped)', min: 0.65, max: 0.9, step: 0.01, pct: true, bench: 'GIRFT standard 85%. casesPerSession is defined at FULL utilisation (a planning norm, not achieved throughput), so this divides once — no double-discount' },
  { key: 'kEndScale', label: 'Booking-discipline drift (× shape factor k by 2029)', min: 0.6, max: 1.5, step: 0.05, bench: 'k today 0.93–1.81 per TFC (census-calibrated, anchored to published %<18wk); FIFO-like discipline raises k and the sustainable list scales linearly with it — memoryless selection → ×1. See the explainer.' },
  { key: 'bedOccupancy', label: 'G&A bed occupancy', min: 0.85, max: 0.98, step: 0.01, pct: true, bench: 'planning norm 92%, aligned with the UEC module so bed totals add consistently (NUH winter actual 95.4%)' },
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
