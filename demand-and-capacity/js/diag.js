import { runDiagnostics, ymDiff } from './engine.js?v=dev';
import { lineChart, fmt, provenanceHtml, S1, S2, S3 } from './charts.js?v=dev';

const $ = (id) => document.getElementById(id);
const setStatus = (t, k) => { const el = $('status'); el.textContent = t; el.className = `status status--${k}`; };

let dm01 = null;
let scenario = { levers: {} };
let result = null;
let selectedMod = null;

const MS_LABELS = [{ ym: '2027-04', label: '95%' }, { ym: '2029-04', label: '99%' }];

(async function init() {
  try {
    dm01 = await (await fetch('data/dm01.json?v=dev', { cache: 'no-cache' })).json();
    $('prov-body').innerHTML = provenanceHtml(dm01._provenance);
    buildLevers();
    recompute();
    wire();
    setStatus('Model ready', 'ready');
  } catch (e) {
    console.error(e);
    setStatus('Failed to load DM01 data.', 'error');
  }
})();

function recompute() {
  result = runDiagnostics(dm01, { levers: scenario.levers });
  if (!selectedMod) selectedMod = result.perMod[0].mod.name;
  renderCards();
  renderCharts();
  renderTable();
  renderModChart();
}

function renderCards() {
  const t = result.total, cal = result.cal;
  const i27 = ymDiff(cal[0], '2027-04');
  const uplift = 100 * (Math.max(...t.requiredTestsMo) / t.currentTestsMo[0] - 1);
  // the same extra tests as a share of the TOTAL activity envelope (all streams)
  const totalEnv = dm01.modalities.reduce((a, m) => a + (m.totalTestsMo ?? 0), 0);
  const envUplift = 100 * (Math.max(...t.requiredTestsMo) - t.currentTestsMo[0]) / totalEnv;
  const over13 = dm01.modalities.reduce((a, m) => a + m.over13, 0);
  $('cards').innerHTML = `
    <div class="stat"><div class="v">${fmt(t.list[0])}</div><div class="l">Diagnostic waiting list (published Apr-26)</div></div>
    <div class="stat stat--accent"><div class="v">${t.impliedPct[0].toFixed(1)}%</div><div class="l">Within 6 weeks (standard: 95% / 99%)</div></div>
    <div class="stat stat--bad"><div class="v">${fmt(over13)}</div><div class="l">Waiting 13+ weeks</div></div>
    <div class="stat"><div class="v">${fmt(t.demandMo[0])}</div><div class="l">Waiting-list demand / month</div></div>
    <div class="stat ${uplift > 15 ? 'stat--bad' : uplift > 5 ? 'stat--warn' : 'stat--good'}"><div class="v">+${uplift.toFixed(1)}%</div><div class="l">Peak uplift of WL tests (+${envUplift.toFixed(1)}% of ALL diagnostic activity)</div></div>
    <div class="stat"><div class="v">${fmt(t.list[i27])}</div><div class="l">List needed by Apr-27 (95%)</div></div>`;
}

function renderCharts() {
  const t = result.total, cal = result.cal;
  lineChart($('chart-perf'), cal, [
    { name: 'implied % <6wk', data: t.impliedPct, color: S1() },
  ], { milestones: MS_LABELS, ymin: 50, ymax: 100, yfmt: (v) => `${v.toFixed(0)}%` });
  lineChart($('chart-list'), cal, [
    { name: 'list (required path)', data: t.list, color: S1() },
    { name: 'sustainable target', data: t.targetList, color: S2(), dash: [5, 4] },
  ], { milestones: MS_LABELS, yfmt: (v) => `${(v / 1000).toFixed(1)}k` });
  lineChart($('chart-tests'), cal, [
    { name: 'required', data: t.requiredTestsMo, color: S1() },
    { name: 'held at Apr-26 rate', data: t.currentTestsMo, color: S2(), dash: [5, 4] },
  ], { milestones: MS_LABELS, yfmt: (v) => `${(v / 1000).toFixed(1)}k` });
}

const LEVERS = [
  { key: 'demandGrowthPctYr', label: 'Diagnostic demand growth (%/yr)', min: 0, max: 15, step: 0.5, pct: false, bench: 'calibrated +6.5%/yr: core modalities, working-day adjusted (capacity step-changes excluded — NUH CDC opens 2027, so those jumps are insourcing/moves/validation; raw was +12.6%)' },
];

function buildLevers() {
  $('levers').innerHTML = LEVERS.map((l) => {
    const v = dm01.levers[l.key] ?? 0;
    return `<div class="lever">
      <label>${l.label} — <span class="val" id="lv-${l.key}">${l.pct ? (v * 100).toFixed(1) + '%' : v}</span></label>
      <input type="range" data-lever="${l.key}" min="${l.min}" max="${l.max}" step="${l.step}" value="${v}" />
      <div class="bench">${l.bench}</div>
    </div>`;
  }).join('');
}

function renderTable() {
  const rows = result.perMod.map(({ mod, series: s }) => {
    const peak = Math.max(...s.requiredTestsMo);
    const uplift = 100 * (peak / Math.max(1, s.currentTestsMo[0]) - 1);
    const cls = uplift > 15 ? 'bad' : uplift > 5 ? 'warn' : 'good';
    // same extra tests, expressed against the modality's TOTAL activity
    // envelope (WL + planned + unscheduled) — the ask on the actual asset
    const total = mod.totalTestsMo ?? ((mod.testsWk * 52 / 12) + mod.plannedMo + mod.unschedMo);
    const envUp = total > 0 ? 100 * (peak - s.currentTestsMo[0]) / total : null;
    const envCls = envUp > 15 ? 'bad' : envUp > 5 ? 'warn' : 'good';
    const flag = mod.anomalies?.length
      ? ` <span class="flag" title="Seed reliability warning: ${mod.anomalies.map((a) => a.title).join('; ')} — details below the table">!</span>`
      : '';
    return `<tr data-mod="${mod.name}" class="${mod.name === selectedMod ? 'sel' : ''}">
      <td>${mod.name}${flag}</td>
      <td class="num">${fmt(mod.list)}</td><td class="num">${mod.pct6}%</td>
      <td class="num">${fmt(mod.over13)}</td>
      <td class="num">${fmt(mod.demandWk)}</td>
      <td class="num">${mod.censusRefsWk != null ? fmt(mod.censusRefsWk) : '—'}</td>
      <td class="num">${fmt(s.currentTestsMo[0])}</td>
      <td class="num">${fmt(peak)}</td>
      <td class="num"><span class="pill pill--${cls}">+${uplift.toFixed(0)}%</span></td>
      <td class="num">${envUp == null ? '—' : `<span class="pill pill--${envCls}">+${envUp.toFixed(0)}%</span>`}</td>
      <td class="num">${fmt(mod.plannedMo)}</td><td class="num">${fmt(mod.unschedMo)}</td>
    </tr>`;
  }).join('');
  $('mod-table').querySelector('tbody').innerHTML = rows;
  renderAnomalies();
  renderStreamsNote();
}

// the three delivery streams share one asset: express the ask against all of it
function renderStreamsNote() {
  const s = dm01.streams;
  if (!s) { $('streams-note').textContent = ''; return; }
  const labs = Object.keys(s);
  const cur = s[labs.find((l) => l.includes('2026') && l.includes('April')) ?? labs[labs.length - 1]];
  const pre = s[labs.find((l) => l.includes('2025'))] ?? cur;
  const tot = (x) => x.wl + x.planned + x.unsched;
  $('streams-note').textContent = `The capacity envelope: DM01 counts three delivery streams from the same scanners and staff — waiting-list tests (governed by the 6-week standard), planned/surveillance tests (clinically timed) and unscheduled tests (emergency and inpatient, must-serve). Trust-wide the WL stream is only ${(100 * cur.wl / tot(cur)).toFixed(0)}% of total activity (${fmt(cur.wl)} of ${fmt(tot(cur))}/mo), which is why the table now shows the uplift both ways: 'of WL tests' is the growth of the governed stream; 'of ALL activity' is the same extra tests as a share of everything the asset delivers — the honest ask on the fleet and workforce, to the extent streams are fungible (unscheduled demand cannot be displaced; planned can flex timing but not volume). The stream MIX is itself a witness: between ${labs.find((l) => l.includes('2025')) ?? 'the prior year'} and ${labs.find((l) => l.includes('April') && l.includes('2026'))}, WL tests fell ${(100 * (1 - cur.wl / pre.wl)).toFixed(0)}% (${fmt(pre.wl)} → ${fmt(cur.wl)}/mo) while planned rose ${(100 * (cur.planned / pre.planned - 1)).toFixed(0)}% (${fmt(pre.planned)} → ${fmt(cur.planned)}/mo) and unscheduled held (${fmt(pre.unsched)} → ${fmt(cur.unsched)}/mo) — consistent with post-EPR reclassification between streams rather than a change in what the machines actually did, and one more reason to read WL-only figures with care.`;
}

// modality-level seed reliability warnings, mirroring the RTT specialty table
function renderAnomalies() {
  const flagged = dm01.modalities.filter((m) => m.anomalies?.length);
  $('anomaly-notes').innerHTML = !flagged.length ? '' : `
    <p class="small" style="margin-top:10px"><span class="flag">!</span> <strong>Demand likely
    understated on ${flagged.length} modalities</strong> — their census referral floor exceeds the
    flow-formula demand by more than 20%, meaning patients are leaving these lists without a
    waiting-list test (served via the parallel unscheduled/planned streams, duplicates, or
    validation) at a rate the flow formula cannot see. Their Required /mo columns inherit the
    understatement.</p>` +
    flagged.map((m) => `<details class="prov">
      <summary>${m.name} — ${m.anomalies.map((a) => a.title).join(' · ')} (census ${fmt(m.censusRefsWk)}/wk vs flow ${fmt(m.demandWk)}/wk)</summary>
      <div class="small">${m.anomalies.map((a) => `<p>${a.detail}</p>`).join('')}</div>
    </details>`).join('');
}

function renderModChart() {
  const row = result.perMod.find((r) => r.mod.name === selectedMod);
  if (!row) return;
  $('mod-chart-title').textContent = `${row.mod.name} — required vs current waiting-list tests per month`;
  lineChart($('chart-mod'), result.cal, [
    { name: 'required', data: row.series.requiredTestsMo, color: S1() },
    { name: 'held at Apr-26 rate', data: row.series.currentTestsMo, color: S2(), dash: [5, 4] },
    { name: 'demand', data: row.series.demandMo, color: S3(), dash: [2, 3] },
  ], { milestones: MS_LABELS, yfmt: (v) => fmt(v) });
}

function wire() {
  $('levers').addEventListener('input', (e) => {
    const key = e.target.dataset.lever; if (!key) return;
    const v = Number(e.target.value);
    scenario.levers[key] = v;
    const meta = LEVERS.find((l) => l.key === key);
    $(`lv-${key}`).textContent = meta.pct ? (v * 100).toFixed(1) + '%' : v;
    recompute();
  });
  $('mod-table').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-mod]'); if (!tr) return;
    selectedMod = tr.dataset.mod;
    renderTable(); renderModChart();
  });
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { renderCharts(); renderModChart(); }, 150); });
}
