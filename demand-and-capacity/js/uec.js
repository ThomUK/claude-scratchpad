import { runUec, runScenario, ymDiff } from './engine.js?v=dev';
import { lineChart, fmt, S1, S2, S3 } from './charts.js?v=dev';

const $ = (id) => document.getElementById(id);
const setStatus = (t, k) => { const el = $('status'); el.textContent = t; el.className = `status status--${k}`; };

let uec = null;
let electiveBeds = null; // monthly series from the RTT spine
let scenario = { levers: {} };
let result = null;

const MS_LABELS = [{ ym: '2027-04', label: '78%' }, { ym: '2028-04', label: '86%' }, { ym: '2029-04', label: '95%' }];

(async function init() {
  try {
    const [u, baseline] = await Promise.all([
      (await fetch('data/uec.json?v=dev', { cache: 'no-cache' })).json(),
      (await fetch('data/baseline.json?v=dev', { cache: 'no-cache' })).json(),
    ]);
    uec = u;
    electiveBeds = runScenario(baseline).trust.bedsRequired;
    buildLevers();
    recompute();
    renderWinters();
    renderDischarge();
    renderKh03();
    renderHandover();
    wire();
    setStatus('Model ready', 'ready');
  } catch (e) {
    console.error(e);
    setStatus('Failed to load UEC data.', 'error');
  }
})();

function recompute() {
  result = runUec(uec, { levers: scenario.levers });
  renderCards();
  renderCharts();
}

function renderCards() {
  const c = uec.current, s = result.series;
  const w = uec.beds.winters, latest = w[Object.keys(w).sort().pop()];
  const peakBeds = Math.max(...result.cal.map((_, i) => s.emergencyOpenBedsNeeded[i] + electiveBeds[i]));
  $('cards').innerHTML = `
    <div class="stat stat--bad"><div class="v">${c.pct4hT1}%</div><div class="l">Type-1 within 4h (Apr-26)</div></div>
    <div class="stat stat--warn"><div class="v">${c.pct4hAll}%</div><div class="l">All types within 4h (incl merged UTC)</div></div>
    <div class="stat stat--bad"><div class="v">${fmt(c.dta12plus)}</div><div class="l">12-hour DTA waits / month</div></div>
    <div class="stat"><div class="v">${fmt(c.admTotal)}</div><div class="l">Emergency admissions / month</div></div>
    <div class="stat stat--bad"><div class="v">${latest.adultGA.occupancyPct}%</div><div class="l">Winter adult G&amp;A occupancy (target ≤92%)</div></div>
    <div class="stat stat--accent"><div class="v">${fmt(peakBeds)}</div><div class="l">Peak beds needed (emergency + elective) vs ${fmt(latest.adultGA.open)} open</div></div>`;
}

function renderCharts() {
  const s = result.series, cal = result.cal;
  lineChart($('chart-glide'), cal, [
    { name: 'required % <4h', data: s.glidePct, color: S1() },
  ], { milestones: MS_LABELS, ymin: 40, ymax: 100, yfmt: (v) => `${v.toFixed(0)}%` });
  lineChart($('chart-timely'), cal, [
    { name: 'required', data: s.requiredTimelyMo, color: S1() },
    { name: `today's rate`, data: s.currentRateTimelyMo, color: S2(), dash: [5, 4] },
    { name: 'attendances', data: s.attMo, color: S3(), dash: [2, 3] },
  ], { milestones: MS_LABELS, yfmt: (v) => `${(v / 1000).toFixed(1)}k` });
  lineChart($('chart-dta'), cal, [
    { name: '12h+ DTA', data: s.dta12Mo, color: S1() },
  ], { milestones: [{ ym: '2028-04', label: 'zero' }], ymin: 0, yfmt: (v) => fmt(v) });
  const w = uec.beds.winters, latest = w[Object.keys(w).sort().pop()];
  const totalNeeded = cal.map((_, i) => s.emergencyOpenBedsNeeded[i] + electiveBeds[i]);
  lineChart($('chart-beds'), cal, [
    { name: 'emergency + elective', data: totalNeeded, color: S1() },
    { name: 'emergency only', data: s.emergencyOpenBedsNeeded, color: S2(), dash: [5, 4] },
    { name: `winter avg open (${fmt(latest.adultGA.open)})`, data: cal.map(() => latest.adultGA.open), color: S3(), dash: [2, 3] },
  ], { milestones: MS_LABELS, yfmt: (v) => fmt(v) });
}

function renderWinters() {
  $('winter-table').querySelector('tbody').innerHTML = Object.entries(uec.beds.winters).map(([label, w]) => {
    const occCls = w.adultGA.occupancyPct > 94 ? 'bad' : w.adultGA.occupancyPct > 92 ? 'warn' : 'good';
    return `<tr>
      <td>${label.replace('W', 'Winter ')}</td>
      <td class="num">${fmt(w.adultGA.open)}</td><td class="num">${fmt(w.adultGA.occupied)}</td>
      <td class="num"><span class="pill pill--${occCls}">${w.adultGA.occupancyPct}%</span></td>
      <td class="num">${fmt(w.longStay.gt7)}</td><td class="num">${fmt(w.longStay.gt14)}</td><td class="num">${fmt(w.longStay.gt21)}</td>
      <td class="num">${w.longStay.gt21PctOfOccupied}%</td>
      <td class="num">${fmt(w.criticalCare.occupied)}/${fmt(w.criticalCare.open)}</td>
    </tr>`;
  }).join('');
}

function renderDischarge() {
  if (!uec.discharge) return;
  const months = uec.discharge.months;
  const labels = Object.keys(months);
  const latest = months[labels[labels.length - 1]];
  $('drd-cards').innerHTML = `
    <div class="stat stat--bad"><div class="v">${latest.pctDelayed}%</div><div class="l">Discharges delayed past ready date (Apr-26)</div></div>
    <div class="stat stat--bad"><div class="v">${fmt(latest.bedDaysLost)}</div><div class="l">Bed-days lost to delay / month</div></div>
    <div class="stat stat--accent"><div class="v">≈ ${fmt(latest.impliedBedsOccupiedByDelay)}</div><div class="l">Beds permanently occupied by discharge delay</div></div>
    <div class="stat"><div class="v">${fmt(latest.discharges)}</div><div class="l">Discharges / month</div></div>`;
  $('drd-table').querySelector('tbody').innerHTML = labels.map((l) => {
    const m = months[l], b = m.bands;
    const cls = m.pctDelayed > 20 ? 'bad' : m.pctDelayed > 10 ? 'warn' : 'good';
    return `<tr>
      <td>${l}</td><td class="num">${fmt(m.discharges)}</td>
      <td class="num"><span class="pill pill--${cls}">${m.pctDelayed}%</span></td>
      <td class="num">${fmt(m.bedDaysLost)}</td><td class="num">${fmt(m.impliedBedsOccupiedByDelay)}</td>
      <td class="num">${fmt(b.d1)}</td><td class="num">${fmt(b.d2to3)}</td><td class="num">${fmt(b.d4to6)}</td>
      <td class="num">${fmt(b.d7to13)}</td><td class="num">${fmt(b.d14to20)}</td><td class="num">${fmt(b.d21plus)}</td>
    </tr>`;
  }).join('');
  $('drd-note').textContent = uec.discharge.note;
}

function renderKh03() {
  if (!uec.kh03) return;
  const k = uec.kh03;
  const tot = k.totalOccupiedOvernight;
  $('kh03-table').querySelector('tbody').innerHTML = k.specialties.map((s) => `<tr>
    <td>${s.name}</td><td class="num">${fmt(s.occupied)}</td>
    <td class="num">${(100 * s.occupied / tot).toFixed(1)}%</td>
  </tr>`).join('') + `<tr><td><strong>Total</strong></td><td class="num"><strong>${fmt(tot)}</strong></td><td class="num">100%</td></tr>`;
  const xs = k.trend.map((t) => `Jun-${t.date.slice(2, 4)}`);
  lineChart($('chart-kh03'), xs, [
    { name: 'occupied', data: k.trend.map((t) => t.occupied), color: S1() },
  ], { xTickEvery: 2, yfmt: (v) => fmt(v) });
  $('kh03-note').textContent = `Latest provider snapshot ${k.latestSnapshot} (plus ${fmt(k.totalOccupiedDay)} day-only beds). England G&A occupancy latest quarter: ${k.england[k.england.length - 1].occPct}%.`;
}

function renderHandover() {
  if (!uec.handover) return;
  const months = uec.handover.months, ts = uec.handover.timeseries;
  const labels = Object.keys(months);
  const latest = months[labels[labels.length - 1]];
  const hoursPerDay = latest.hoursLostOver30 / 30.4;
  $('ho-cards').innerHTML = `
    <div class="stat stat--bad"><div class="v">${latest.meanMin} min</div><div class="l">Mean handover, Apr-26 (standard: 15 min)</div></div>
    <div class="stat stat--bad"><div class="v">${latest.over30Pct}%</div><div class="l">Handovers over 30 minutes</div></div>
    <div class="stat stat--warn"><div class="v">${latest.over60Pct}%</div><div class="l">Handovers over 60 minutes (Apr-24: ${months[labels[0]].over60Pct}%)</div></div>
    <div class="stat stat--accent"><div class="v">${fmt(latest.hoursLostOver30)} h</div><div class="l">Crew hours lost / month ≈ ${hoursPerDay.toFixed(0)} h/day queued outside ED</div></div>`;
  const xs = ts.map((r) => {
    const [y, m] = r.ym.split('-');
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]}-${y.slice(2)}`;
  });
  lineChart($('chart-handover'), xs, [
    { name: 'mean handover', data: ts.map((r) => r.meanMin), color: S1() },
    { name: '30-min threshold', data: ts.map(() => 30), color: S2(), dash: [5, 4] },
    { name: '15-min standard', data: ts.map(() => 15), color: S3(), dash: [2, 3] },
  ], { xTickEvery: 6, ymin: 0, yfmt: (v) => `${v.toFixed(0)}m` });
  $('ho-table').querySelector('tbody').innerHTML = labels.map((l) => {
    const m = months[l];
    const cls = m.over30Pct > 40 ? 'bad' : m.over30Pct > 20 ? 'warn' : 'good';
    return `<tr>
      <td>${l}</td><td class="num">${fmt(m.handovers)}</td><td class="num">${m.meanMin} min</td>
      <td class="num">${m.over15Pct}%</td>
      <td class="num"><span class="pill pill--${cls}">${m.over30Pct}%</span></td>
      <td class="num">${m.over60Pct}%</td>
      <td class="num">${fmt(m.hoursLostOver30)}</td>
    </tr>`;
  }).join('');
}

const LEVERS = [
  { key: 'attGrowthPctYr', label: 'Attendance growth (%/yr)', min: -2, max: 8, step: 0.5, bench: 'calibrated +1.5%/yr (latest pair; earliest contaminated by UTC split)' },
  { key: 'admGrowthPctYr', label: 'Emergency admission growth (%/yr)', min: -2, max: 8, step: 0.5, bench: 'calibrated +1.1%/yr (latest pair)' },
  { key: 'emergencyLOSDays', label: 'Emergency length of stay (days)', min: 3, max: 8, step: 0.1, bench: 'implied 5.2d from (winter occupied − elective share) ÷ admissions; long-stay release moves this' },
  { key: 'bedOccupancyTarget', label: 'Bed occupancy target', min: 0.85, max: 0.98, step: 0.01, bench: '92% planning norm; NUH winter 2025-26 ran at 95.4%' },
];

function buildLevers() {
  $('levers').innerHTML = LEVERS.map((l) => {
    const v = uec.levers[l.key] ?? 0;
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
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderCharts, 150); });
}
