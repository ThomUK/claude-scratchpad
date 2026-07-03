import { runScenario, WKS_PER_MONTH } from './engine.js?v=dev';
import { runTandemSim } from './explainmath.js?v=dev';
import { lineChart, fmt, S1, S2, S3 } from './charts.js?v=dev';

const $ = (id) => document.getElementById(id);
const setStatus = (t, k) => { const el = $('status'); el.textContent = t; el.className = `status status--${k}`; };

let baseline = null;
let res = null;

(async function init() {
  try {
    baseline = await (await fetch('data/baseline.json?v=dev', { cache: 'no-cache' })).json();
    res = runScenario(baseline);
    renderAttribution();
    slotState = {
      ratio: weightedRatio(), dna: baseline.levers.dnaRate, util: baseline.levers.clinicUtilisation,
    };
    buildSlotLevers();
    renderSlots();
    buildSimLevers();
    renderSim();
    setStatus('Model ready', 'ready');
  } catch (e) {
    console.error(e);
    setStatus('Failed to load model data.', 'error');
  }
})();

// --- section 2: attribution ---------------------------------------------------
function slotsUnder(firstsOf) {
  // trust OP slots/mo with firsts attributed per `firstsOf(tfcSeries, tfc, i)`
  const { dnaRate, clinicUtilisation, otherRemovalsPct } = baseline.levers;
  const keep = 1 - otherRemovalsPct;
  return res.cal.map((_, i) => res.perTfc.reduce((a, { tfc, series: s }) => {
    const firsts = firstsOf === 'referrals' ? s.demandMo[i] / keep : s.requiredStopsMo[i];
    const fus = s.requiredStopsMo[i] * tfc.newToFuRatio;
    return a + (firsts + fus) / (1 - dnaRate) / clinicUtilisation;
  }, 0));
}

function renderAttribution() {
  const cal = res.cal;
  const keep = 1 - baseline.levers.otherRemovalsPct;
  const refsMo = cal.map((_, i) => res.trust.demandMo[i] / keep);
  const stopsMo = res.trust.requiredStopsMo;
  const correct = slotsUnder('referrals');
  const wrong = slotsUnder('stops');
  const diff = wrong.map((v, i) => v - correct[i]);   // + = over-books, − = under-books
  const over = Math.max(...diff);
  const under = Math.min(...diff);
  const iUnder = diff.indexOf(under);
  const overCard = over > 5
    ? `<div class="stat stat--bad"><div class="v">+${fmt(over)}</div><div class="l">Phantom slots / month at the worst clearance month (firsts ← treatments)</div></div>`
    : `<div class="stat stat--warn"><div class="v">−${fmt(-diff[0])}</div><div class="l">New appointments under-booked / month from day one (firsts ← treatments)</div></div>`;
  $('attr-cards').innerHTML = `
    <div class="stat"><div class="v">${fmt(refsMo[0])}</div><div class="l">Referrals / month (grows at trend)</div></div>
    <div class="stat stat--warn"><div class="v">${fmt(Math.max(...stopsMo))}</div><div class="l">Required treatments / month at peak (demand + clearance)</div></div>
    ${overCard}
    <div class="stat stat--bad"><div class="v">−${fmt(-under)}</div><div class="l">Under-booking / month by ${res.cal[iUnder]} — and still widening</div></div>`;
  lineChart($('chart-drivers'), cal, [
    { name: 'required treatments', data: stopsMo, color: S2() },
    { name: 'referrals', data: refsMo, color: S1() },
  ], { milestones: MS, yfmt: (v) => `${(v / 1000).toFixed(1)}k` });
  lineChart($('chart-attr'), cal, [
    { name: 'firsts ← treatments (wrong)', data: wrong, color: S2(), dash: [5, 4] },
    { name: 'firsts ← referrals', data: correct, color: S1() },
  ], { milestones: MS, yfmt: (v) => `${(v / 1000).toFixed(0)}k` });
  $('attr-note').textContent = `Under the current calibration the misattribution under-books first appointments THROUGHOUT — for two compounding reasons. First, the ~10.7% other-removals cohort attends a first appointment but never generates a clock stop, so stops-driven booking never provides for them (a ${fmt(-diff[0])}/month shortfall from day one). Second, after the clearance ends treatments settle back to effective demand while referrals keep growing at +2.3%/yr, widening the shortfall to ${fmt(-under)}/month by ${res.cal[iUnder]}. Under a deeper-clearance or lower-growth calibration the error would flip the other way during the surge (phantom over-booking) — the attribution is wrong in whichever direction the calibration happens to point it. Both lines share the same follow-up burden; only the firsts driver differs.`;
}

const MS = [
  { ym: '2027-04', label: '65%' }, { ym: '2028-04', label: '80%' }, { ym: '2029-04', label: '92%' },
];

// --- section 3: slot arithmetic ------------------------------------------------
let slotState = null;

function weightedRatio() {
  const stops = baseline.tfcs.reduce((a, t) => a + t.clockStopsWk, 0);
  return baseline.tfcs.reduce((a, t) => a + t.newToFuRatio * t.clockStopsWk, 0) / stops;
}

const SLOT_LEVERS = [
  { key: 'ratio', label: 'Follow-ups per treatment (N:FU ratio)', min: 0.5, max: 3.5, step: 0.05 },
  { key: 'dna', label: 'DNA rate', min: 0.02, max: 0.15, step: 0.005 },
  { key: 'util', label: 'Clinic utilisation', min: 0.7, max: 0.95, step: 0.01 },
];

function buildSlotLevers() {
  $('slot-levers').innerHTML = SLOT_LEVERS.map((l) => `<div class="lever">
    <label>${l.label} — <span class="val" id="sl-${l.key}">${Number(slotState[l.key]).toFixed(2)}</span></label>
    <input type="range" data-key="${l.key}" min="${l.min}" max="${l.max}" step="${l.step}" value="${slotState[l.key]}" />
  </div>`).join('');
  $('slot-levers').addEventListener('input', (e) => {
    const key = e.target.dataset.key; if (!key) return;
    slotState[key] = Number(e.target.value);
    $(`sl-${key}`).textContent = slotState[key].toFixed(2);
    renderSlots();
  });
}

function renderSlots() {
  const keep = 1 - baseline.levers.otherRemovalsPct;
  const firstsMo = (res.trust.demandMo[0] / keep);
  const stopsMo = res.trust.requiredStopsMo[0];
  const fusMo = stopsMo * slotState.ratio;
  const slots = (firstsMo + fusMo) / (1 - slotState.dna) / slotState.util;
  const slotsPifu = (firstsMo + stopsMo * Math.max(0.5, slotState.ratio - 0.2)) / (1 - slotState.dna) / slotState.util;
  $('slot-cards').innerHTML = `
    <div class="stat"><div class="v">${fmt(firstsMo)}</div><div class="l">First attendances / month (from referrals)</div></div>
    <div class="stat"><div class="v">${fmt(fusMo)}</div><div class="l">Follow-ups / month (treatments × ${slotState.ratio.toFixed(2)})</div></div>
    <div class="stat stat--accent"><div class="v">${fmt(slots)}</div><div class="l">Slots required / month (÷ ${(1 - slotState.dna).toFixed(2)} DNA ÷ ${slotState.util.toFixed(2)} utilisation)</div></div>
    <div class="stat stat--good"><div class="v">−${fmt(slots - slotsPifu)}</div><div class="l">Slots saved / month by PIFU cutting N:FU by 0.2</div></div>`;
  $('slot-note').textContent = `Follow-ups are ${(100 * fusMo / (firstsMo + fusMo)).toFixed(0)}% of all attendances at the current ratio — the N:FU lever moves more slots than DNA and utilisation combined over their plausible ranges, which is why PIFU and discharge-to-primary-care policies target it.`;
}

// --- section 4: tandem queue ----------------------------------------------------
let simState = { referralsWk: 100, newSlotsWk: 100, treatSlotsWk: 62, conversionPct: 60 };

const SIM_LEVERS = [
  { key: 'newSlotsWk', label: 'New-appointment slots / week (queue 1 capacity)', min: 60, max: 160, step: 2 },
  { key: 'treatSlotsWk', label: 'Treatment capacity / week (queue 2 capacity)', min: 40, max: 120, step: 2 },
  { key: 'conversionPct', label: 'Conversion at first attendance (% onward)', min: 30, max: 90, step: 5 },
];

function buildSimLevers() {
  $('sim-levers').innerHTML = SIM_LEVERS.map((l) => `<div class="lever">
    <label>${l.label} — <span class="val" id="sim-${l.key}">${simState[l.key]}</span></label>
    <input type="range" data-key="${l.key}" min="${l.min}" max="${l.max}" step="${l.step}" value="${simState[l.key]}" />
    <div class="bench">${l.key === 'newSlotsWk' ? 'referrals fixed at 100/week' : ''}</div>
  </div>`).join('');
  $('sim-levers').addEventListener('input', (e) => {
    const key = e.target.dataset.key; if (!key) return;
    simState[key] = Number(e.target.value);
    $(`sim-${key}`).textContent = simState[key];
    renderSim();
  });
}

function renderSim() {
  const s = runTandemSim(simState);
  const xs = s.q1.map((_, i) => `wk ${i}`);
  lineChart($('chart-sim'), xs, [
    { name: 'total (the RTT list)', data: s.total, color: S3(), dash: [2, 3] },
    { name: 'queue 1: awaiting first OP', data: s.q1, color: S1() },
    { name: 'queue 2: awaiting treatment', data: s.q2, color: S2() },
  ], { xTickEvery: 13, ymin: 0, yfmt: (v) => fmt(v) });
  const end = s.q1.length - 1;
  const balanced = simState.newSlotsWk >= simState.referralsWk
    && simState.treatSlotsWk >= simState.newSlotsWk * simState.conversionPct / 100 * 0.999;
  $('sim-cards').innerHTML = `
    <div class="stat"><div class="v">${fmt(s.q1[end])}</div><div class="l">Queue 1 after 2 years (awaiting first OP)</div></div>
    <div class="stat"><div class="v">${fmt(s.q2[end])}</div><div class="l">Queue 2 after 2 years (awaiting treatment)</div></div>
    <div class="stat ${s.total[end] < s.total[0] ? 'stat--good' : 'stat--bad'}"><div class="v">${fmt(s.total[end])}</div><div class="l">Total list (started at ${fmt(s.total[0] - 0)})</div></div>
    <div class="stat ${balanced ? 'stat--good' : 'stat--warn'}"><div class="v">${balanced ? 'balanced' : 'unbalanced'}</div><div class="l">Stage capacities vs flows (need new ≥ referrals AND treat ≥ new × conversion)</div></div>`;
}

let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { renderAttribution(); renderSim(); }, 150); });
