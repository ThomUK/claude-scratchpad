import { runWorkforce, buildActivityIndex, ymDiff } from './engine.js?v=dev';
import { lineChart, fmt, S1, S2, S3 } from './charts.js?v=dev';

const $ = (id) => document.getElementById(id);
const setStatus = (t, k) => { const el = $('status'); el.textContent = t; el.className = `status status--${k}`; };

let wf = null;
let activityIdx = null; // monthly combined activity index, 1.0 at t0
let scenario = { levers: {} };
let result = null;

const MS_LABELS = [{ ym: '2027-04', label: 'Apr-27' }, { ym: '2028-04', label: 'Apr-28' }, { ym: '2029-04', label: 'Apr-29' }];
// how much of the clinical workforce each module's activity drives (assumption)
const WEIGHTS = { uec: 0.45, rtt: 0.35, dm01: 0.10, cancer: 0.10 };

(async function init() {
  try {
    const [w, baseline, dm01, cancer, uec] = await Promise.all([
      'data/workforce.json', 'data/baseline.json', 'data/dm01.json', 'data/cancer.json', 'data/uec.json',
    ].map(async (p) => (await fetch(`${p}?v=dev`, { cache: 'no-cache' })).json()));
    wf = w;
    activityIdx = buildActivityIndex(baseline, dm01, cancer, uec, WEIGHTS);
    buildLevers();
    recompute();
    renderStatic();
    wire();
    setStatus('Model ready', 'ready');
  } catch (e) {
    console.error(e);
    setStatus('Failed to load workforce data.', 'error');
  }
})();

function recompute() {
  result = runWorkforce(wf, activityIdx, { levers: scenario.levers });
  renderCards();
  renderGapChart();
  renderGroupTable();
}

function renderCards() {
  const g = wf.groups, t = result.totals;
  const i29 = ymDiff(result.cal[0], '2029-04');
  const peakGap = Math.max(...t.gapClinical);
  $('cards').innerHTML = `
    <div class="stat"><div class="v">${fmt(g.total.fte)}</div><div class="l">Total FTE (Apr-26)</div></div>
    <div class="stat"><div class="v">${fmt(g.nurses.fte)}</div><div class="l">Nurses &amp; health visitors</div></div>
    <div class="stat"><div class="v">${fmt(g.doctors.fte)}</div><div class="l">Doctors (${fmt(g.consultants.fte)} consultants)</div></div>
    <div class="stat ${g.total.growthPctYr < 0 ? 'stat--bad' : 'stat--good'}"><div class="v">${g.total.growthPctYr}%</div><div class="l">Total FTE growth, latest year (5-yr: +${g.total.cagr5PctYr}%/yr)</div></div>
    <div class="stat stat--accent"><div class="v">${fmt(t.gapClinical[i29])}</div><div class="l">Clinical FTE gap at Apr-29 (required − supply)</div></div>
    <div class="stat ${peakGap > 500 ? 'stat--bad' : 'stat--warn'}"><div class="v">${fmt(peakGap)}</div><div class="l">Peak clinical FTE gap</div></div>`;
}

function renderGapChart() {
  const t = result.totals;
  lineChart($('chart-gap'), result.cal, [
    { name: 'required', data: t.requiredClinical, color: S1() },
    { name: 'supply at trend', data: t.supplyClinical, color: S2(), dash: [5, 4] },
  ], { milestones: MS_LABELS, yfmt: (v) => `${(v / 1000).toFixed(1)}k` });
  const idxEnd = activityIdx[activityIdx.length - 1];
  $('gap-note').textContent = `The index is ANCHORED to required vs DELIVERED activity: it opens at ${activityIdx[0].toFixed(2)} (the recovery step-up — month-0 required work already exceeds what today's staffing delivers) and reaches ${activityIdx[activityIdx.length - 1].toFixed(2)} by Mar-30 (weights: emergency 45%, elective 35%, diagnostics 10%, cancer 10%). So the gap includes the step-up, not just growth after t0 — and it still UNDERSTATES pressure, because bank/agency staffing (outside the published FTE counts) is currently absorbing part of that step-up. Productivity lever ${result.levers.productivityPctYr}%/yr; growth adjustment ${result.levers.workforceGrowthAdjPctYr >= 0 ? '+' : ''}${result.levers.workforceGrowthAdjPctYr}%/yr.`;
}

function renderGroupTable() {
  const i29 = ymDiff(result.cal[0], '2029-04');
  const order = ['nurses', 'midwives', 'doctors', 'stt', 'supportClinical', 'infrastructure'];
  $('group-table').querySelector('tbody').innerHTML = order.map((key) => {
    const r = result.perGroup[key];
    if (!r) return '';
    const g = r.group;
    const req = r.required[i29], sup = r.supply[i29], gap = req - sup;
    const cls = !r.clinical ? 'good' : gap > g.fte * 0.05 ? 'bad' : gap > 0 ? 'warn' : 'good';
    return `<tr>
      <td>${g.name}${r.clinical ? '' : ' <span class="muted small">(activity-independent)</span>'}</td>
      <td class="num">${fmt(g.fte)}</td>
      <td class="num">${g.growthPctYr >= 0 ? '+' : ''}${g.growthPctYr}%</td>
      <td class="num">${g.cagr5PctYr >= 0 ? '+' : ''}${g.cagr5PctYr}%</td>
      <td class="num">${fmt(req)}</td><td class="num">${fmt(sup)}</td>
      <td class="num"><span class="pill pill--${cls}">${gap >= 0 ? '+' : ''}${fmt(gap)}</span></td>
    </tr>`;
  }).join('');
}

function renderStatic() {
  // long-run trend chart (September snapshots + monthly tail)
  const dates = wf.groups.nurses.series.map((p) => p.date);
  const xs = dates.map((d) => `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+d.slice(5, 7) - 1]}-${d.slice(2, 4)}`);
  lineChart($('chart-trend'), xs, [
    { name: 'nurses & HV', data: wf.groups.nurses.series.map((p) => p.fte), color: S1() },
    { name: 'doctors', data: wf.groups.doctors.series.map((p) => p.fte), color: S2() },
    { name: 'ST&T', data: wf.groups.stt.series.map((p) => p.fte), color: S3() },
  ], { xTickEvery: 4, yfmt: (v) => `${(v / 1000).toFixed(1)}k` });

  $('grade-table').querySelector('tbody').innerHTML = Object.entries(wf.doctorGrades)
    .map(([g, v]) => `<tr><td>${g}</td><td class="num">${fmt(v)}</td></tr>`).join('');

  const tot = wf.consultantsBySpecialty.reduce((a, s) => a + s.fte, 0);
  $('spec-table').querySelector('tbody').innerHTML = wf.consultantsBySpecialty.map((s) => `<tr>
    <td>${s.group}</td><td class="num">${fmt(s.fte)}</td>
    <td class="num">${(100 * s.fte / tot).toFixed(1)}%</td>
  </tr>`).join('');

  if (wf.turnover) {
    const all = wf.turnover.byGroup['All staff groups'];
    $('turnover-note').textContent = `Turnover context (${wf.turnover.region}, ${wf.turnover.period.replace(' to ', ' → ')}): all-staff leaver rate ${all?.leaverRatePct}% vs joiner rate ${all?.joinerRatePct}% — supply projections assume the trend already nets these off. Bank/agency are outside the published counts.`;
  }
}

const LEVERS = [
  { key: 'workforceGrowthAdjPctYr', label: 'Workforce growth adjustment (%/yr, all groups)', min: -2, max: 4, step: 0.25, bench: 'added to each group\'s calibrated trend (total −1.4%/yr latest year; +4.4%/yr over 5 years)' },
  { key: 'productivityPctYr', label: 'Productivity growth (%/yr, activity per FTE)', min: 0, max: 3, step: 0.25, bench: 'NHS planning ambitions typically 1–2%/yr; each 1% substitutes ≈1% workforce growth' },
];

function buildLevers() {
  $('levers').innerHTML = LEVERS.map((l) => {
    const v = wf.levers[l.key] ?? 0;
    return `<div class="lever">
      <label>${l.label} — <span class="val" id="lv-${l.key}">${v}</span></label>
      <input type="range" data-lever="${l.key}" min="${l.min}" max="${l.max}" step="${l.step}" value="${v}" />
      <div class="bench">${l.bench}</div>
    </div>`;
  }).join('');
}

function wire() {
  $('levers').addEventListener('input', (e) => {
    const key = e.target.dataset.lever; if (!key) return;
    const v = Number(e.target.value);
    scenario.levers[key] = v;
    $(`lv-${key}`).textContent = v;
    recompute();
  });
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { renderGapChart(); renderStatic(); }, 150); });
}
