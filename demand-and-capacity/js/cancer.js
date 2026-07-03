import { runCancer, ymDiff } from './engine.js?v=dev';
import { lineChart, fmt, S1, S2, S3 } from './charts.js?v=dev';

const $ = (id) => document.getElementById(id);
const setStatus = (t, k) => { const el = $('status'); el.textContent = t; el.className = `status status--${k}`; };

let cancer = null;
let scenario = { levers: {} };
let result = null;
let selectedStd = 'd62';

const MS_LABELS = [{ ym: '2027-04', label: 'Apr-27' }, { ym: '2029-04', label: 'Apr-29' }];
const pill = (pct, target) => {
  const cls = pct >= target ? 'good' : pct >= target - 10 ? 'warn' : 'bad';
  return `<span class="pill pill--${cls}">${pct.toFixed(1)}%</span>`;
};

(async function init() {
  try {
    cancer = await (await fetch('data/cancer.json?v=dev', { cache: 'no-cache' })).json();
    buildLevers();
    recompute();
    wire();
    renderSites();
    setStatus('Model ready', 'ready');
  } catch (e) {
    console.error(e);
    setStatus('Failed to load cancer data.', 'error');
  }
})();

function recompute() {
  result = runCancer(cancer, { levers: scenario.levers });
  renderCards();
  renderGlide();
  renderStdTable();
  renderStdChart();
}

function renderCards() {
  const s = cancer.standards;
  const d62 = result.perStd.d62.series;
  const extraPeak = Math.max(...Object.values(result.perStd).reduce(
    (acc, { series }) => acc.map((v, i) => v + series.extraTimelyMo[i]),
    result.cal.map(() => 0)));
  $('cards').innerHTML = `
    <div class="stat ${s.fds.current.pct >= s.fds.targetPct ? 'stat--good' : 'stat--bad'}"><div class="v">${s.fds.current.pct}%</div><div class="l">Faster Diagnosis 28-day (target ${s.fds.targetPct}%)</div></div>
    <div class="stat ${s.d31.current.pct >= s.d31.targetPct ? 'stat--good' : 'stat--warn'}"><div class="v">${s.d31.current.pct}%</div><div class="l">31-day decision-to-treat (target ${s.d31.targetPct}%)</div></div>
    <div class="stat ${s.d62.current.pct >= s.d62.interimPct ? 'stat--warn' : 'stat--bad'}"><div class="v">${s.d62.current.pct}%</div><div class="l">62-day (interim ${s.d62.interimPct}% Apr-27, ${s.d62.targetPct}% Apr-29)</div></div>
    <div class="stat"><div class="v">${fmt(s.fds.current.total)}</div><div class="l">FDS cohort / month (Apr-26)</div></div>
    <div class="stat stat--accent"><div class="v">${fmt(d62.volumeMo[0])}</div><div class="l">62-day treatments / month</div></div>
    <div class="stat stat--accent"><div class="v">+${fmt(extraPeak)}</div><div class="l">Extra timely diagnoses+treatments / month at peak</div></div>`;
}

function renderGlide() {
  lineChart($('chart-glide'), result.cal, [
    { name: 'FDS 28-day', data: result.perStd.fds.series.glidePct, color: S1() },
    { name: '31-day', data: result.perStd.d31.series.glidePct, color: S2() },
    { name: '62-day', data: result.perStd.d62.series.glidePct, color: S3() },
  ], { milestones: MS_LABELS, ymin: 55, ymax: 100, yfmt: (v) => `${v.toFixed(0)}%` });
}

function renderStdTable() {
  const rows = Object.entries(result.perStd).map(([key, { std, series }]) => {
    const hist = ['Apr-24', 'Apr-25', 'Apr-26'].map((p) => {
      const h = std.history?.[p];
      return h ? pill(h.pct, key === 'd62' ? std.interimPct ?? std.targetPct : std.targetPct) : '—';
    });
    const extraPeak = Math.max(...series.extraTimelyMo);
    return `<tr data-std="${key}" class="${key === selectedStd ? 'sel' : ''}">
      <td>${std.name}</td>
      <td class="num">${std.interimPct ? `${std.interimPct}% → ${std.targetPct}%` : `${std.targetPct}%`}</td>
      <td class="num">${hist[0]}</td><td class="num">${hist[1]}</td><td class="num">${hist[2]}</td>
      <td class="num">${fmt(std.current.total)}</td>
      <td class="num">${fmt(std.current.within)}</td>
      <td class="num">+${fmt(extraPeak)}</td>
    </tr>`;
  }).join('');
  $('std-table').querySelector('tbody').innerHTML = rows;
}

function renderStdChart() {
  const { std, series } = result.perStd[selectedStd];
  $('std-chart-title').textContent = `${std.name} — timely activity per month (required vs at today's rate)`;
  lineChart($('chart-std'), result.cal, [
    { name: 'required', data: series.requiredTimelyMo, color: S1() },
    { name: `today's rate`, data: series.currentRateTimelyMo, color: S2(), dash: [5, 4] },
    { name: 'cohort', data: series.volumeMo, color: S3(), dash: [2, 3] },
  ], { milestones: MS_LABELS, yfmt: (v) => fmt(v) });
}

const LEVERS = [
  { key: 'demandGrowthPctYr', label: 'Cancer demand growth (%/yr)', min: -3, max: 15, step: 0.5, bench: 'calibrated −0.7%/yr (pre-EPR pair Apr-24→Apr-25); Apr-25→Apr-26 was +13.4% (EPR-affected)' },
];

function buildLevers() {
  $('levers').innerHTML = LEVERS.map((l) => {
    const v = cancer.levers[l.key] ?? 0;
    return `<div class="lever">
      <label>${l.label} — <span class="val" id="lv-${l.key}">${v}</span></label>
      <input type="range" data-lever="${l.key}" min="${l.min}" max="${l.max}" step="${l.step}" value="${v}" />
      <div class="bench">${l.bench}</div>
    </div>`;
  }).join('');
}

function renderSites() {
  const sites = Object.entries(cancer.sites);
  const fds = sites.filter(([, v]) => v.fds).sort((a, b) => b[1].fds.total - a[1].fds.total);
  $('fds-table').querySelector('tbody').innerHTML = fds.map(([name, v]) => `<tr>
    <td>${name.replace('Suspected ', '').replace(/^(.)/, (c) => c.toUpperCase())}</td>
    <td class="num">${fmt(v.fds.total)}</td>
    <td class="num">${pill(v.fds.pct ?? 0, cancer.standards.fds.targetPct)}</td>
  </tr>`).join('');

  const treat = sites.filter(([, v]) => v.d31 || v.d62).sort((a, b) => (b[1].d62?.total ?? 0) - (a[1].d62?.total ?? 0));
  $('treat-table').querySelector('tbody').innerHTML = treat.map(([name, v]) => `<tr>
    <td>${name}</td>
    <td class="num">${v.d31 ? pill(v.d31.pct ?? 0, cancer.standards.d31.targetPct) : '—'}</td>
    <td class="num">${v.d62 ? pill(v.d62.pct ?? 0, cancer.standards.d62.interimPct) : '—'}</td>
    <td class="num">${v.d62 ? fmt(v.d62.total) : '—'}</td>
  </tr>`).join('');
}

function wire() {
  $('levers').addEventListener('input', (e) => {
    const key = e.target.dataset.lever; if (!key) return;
    const v = Number(e.target.value);
    scenario.levers[key] = v;
    $(`lv-${key}`).textContent = v;
    recompute();
  });
  $('std-table').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-std]'); if (!tr) return;
    selectedStd = tr.dataset.std;
    renderStdTable(); renderStdChart();
  });
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { renderGlide(); renderStdChart(); }, 150); });
}
