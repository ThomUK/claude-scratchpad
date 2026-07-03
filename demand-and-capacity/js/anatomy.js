import { runScenario } from './engine.js?v=dev';
import { fmt } from './charts.js?v=dev';

const $ = (id) => document.getElementById(id);
const setStatus = (t, k) => { const el = $('status'); el.textContent = t; el.className = `status status--${k}`; };
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

let baseline = null;
let scenario = { levers: {} };
let result = null;
let mi = 0; // selected month index

(async function init() {
  try {
    baseline = await (await fetch('data/baseline.json?v=dev', { cache: 'no-cache' })).json();
    result = runScenario(baseline, { levers: scenario.levers });
    mi = result.trust.requiredStopsMo.indexOf(Math.max(...result.trust.requiredStopsMo));
    buildControls();
    render();
    renderProvenance();
    wire();
    setStatus('Live — every number below is computed from the model, none are typed in', 'ready');
  } catch (e) {
    console.error(e);
    setStatus('Failed to load model data.', 'error');
  }
})();

function recompute() {
  result = runScenario(baseline, { levers: scenario.levers });
  render();
}

// numbers for the selected month, reconstructed with the SAME arithmetic the engine uses
function monthNumbers() {
  const t = result.trust;
  const p = scenario.levers.otherRemovalsPct ?? baseline.levers.otherRemovalsPct ?? 0;
  const eff = t.demandMo[mi];
  const raw = eff / (1 - p);
  const rem = raw - eff;
  const stops = t.requiredStopsMo[mi];
  const clearance = stops - eff; // negative once the backlog is cleared
  const firsts = raw;            // first attendances follow raw referrals (see engine)
  const fus = t.opAttendancesMo[mi] - firsts;
  return {
    raw, rem, eff, stops, clearance, firsts, fus,
    today: t.currentStopsMo[0],
    slots: t.opSlotsMo[mi], sessions: t.theatreSessionsMo[mi],
    beds: t.bedsRequired[mi], diags: t.diagnosticsMo[mi],
    ym: result.cal[mi],
  };
}

function render() {
  const n = monthNumbers();
  $('month-label').textContent = n.ym;
  $('month-slider').value = mi;
  $('cards').innerHTML = `
    <div class="stat"><div class="v">${fmt(n.raw)}</div><div class="l">Referrals in ${n.ym}</div></div>
    <div class="stat stat--accent"><div class="v">${fmt(n.stops)}</div><div class="l">Clock stops the model requires in ${n.ym}</div></div>
    <div class="stat"><div class="v">${fmt(n.today)}</div><div class="l">Clock stops we deliver today (Apr-26 rate)</div></div>
    <div class="stat ${n.stops > n.today ? 'stat--warn' : 'stat--good'}"><div class="v">${n.stops > n.today ? '+' : ''}${fmt(n.stops - n.today)}</div><div class="l">The gap — this is the capacity ask</div></div>`;
  drawFlow($('chart-flow'), n);
  fillProse(n);
}

// --- the one picture ----------------------------------------------------------
// A volume-true flow (pathways/month) from referrals to clock stops, then a
// conversion fan-out to resources (different units, so arrows carry the formula
// rather than pretending the flow is conserved).
function drawFlow(canvas, n) {
  if (!canvas.dataset.baseW) { canvas.dataset.baseW = canvas.getAttribute('width'); canvas.dataset.baseH = canvas.getAttribute('height'); }
  const W = +canvas.dataset.baseW, H = +canvas.dataset.baseH;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  ctx.font = '12px system-ui';
  const INK = css('--text'), MUT = css('--muted');

  const clr = Math.max(0, n.clearance);
  const maxV = Math.max(n.raw, n.stops);
  const px = 190 / maxV; // pathways -> pixels
  const NW = 16;         // node width

  // node positions (design coords)
  const yMid = 235;
  const A = { x: 70,  h: n.raw * px };   A.y = yMid - A.h / 2;                 // referrals
  const B = { x: 400, h: n.eff * px };   B.y = yMid - B.h / 2 + 30;           // effective demand
  const R = { x: 400, h: Math.max(4, n.rem * px) }; R.y = 52;                 // removals (exit)
  const K = { x: 70,  h: Math.max(2, clr * px) };   K.y = 430 - K.h;          // backlog source
  const C = { x: 660, h: n.stops * px }; C.y = yMid - C.h / 2 + 42;           // clock stops

  const band = (x1, y1, x2, y2, h1, h2, color) => {
    const cx1 = x1 + (x2 - x1) * 0.45, cx2 = x1 + (x2 - x1) * 0.55;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(cx1, y1, cx2, y2, x2, y2);
    ctx.lineTo(x2, y2 + h2);
    ctx.bezierCurveTo(cx2, y2 + h2, cx1, y1 + h1, x1, y1 + h1);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  };
  const node = (nd, color) => { ctx.fillStyle = color; ctx.fillRect(nd.x, nd.y, NW, nd.h); };
  const label = (x, y, lines, align = 'center', color = INK, bold = false) => {
    ctx.textAlign = align; ctx.fillStyle = color;
    lines.forEach((l, i) => {
      ctx.font = (i === 0 && bold) ? 'bold 12px system-ui' : `${i === 0 ? 12 : 11.5}px system-ui`;
      ctx.fillText(l, x, y + i * 15);
    });
    ctx.font = '12px system-ui';
  };

  // bands: A -> R (removals), A -> B (effective), then B -> C and K -> C
  const remH = Math.max(2, n.rem * px), effH = n.eff * px;
  band(A.x + NW, A.y, R.x, R.y, remH, R.h, 'rgba(154, 164, 178, 0.30)');
  band(A.x + NW, A.y + remH, B.x, B.y, effH, B.h, 'rgba(43, 151, 214, 0.42)');
  const clrH = Math.max(0, clr * px);
  band(B.x + NW, B.y, C.x, C.y, B.h, effH, 'rgba(43, 151, 214, 0.42)');
  if (clr > 0) band(K.x + NW, K.y, C.x, C.y + effH, clrH, clrH, 'rgba(192, 138, 30, 0.45)');

  node(A, '#2b97d6'); node(B, '#2b97d6'); node(C, '#3fae52');
  node(R, '#9aa4b2'); if (clr > 0) node(K, '#c08a1e');

  // node labels with live values
  label(A.x + NW / 2, A.y - 24, [`Referrals`, `${fmt(n.raw)}/mo`], 'center', INK, true);
  label(R.x + NW / 2, R.y - 22, [`leave without treatment`, `${fmt(n.rem)}/mo (${(100 * (scenario.levers.otherRemovalsPct ?? baseline.levers.otherRemovalsPct)).toFixed(1)}%)`], 'center', MUT);
  label(B.x + NW / 2, B.y - 24, [`Effective demand`, `${fmt(n.eff)}/mo`], 'center', INK, true);
  label(K.x, K.y - 28, [`from the backlog (clearance)`, clr > 0 ? `${fmt(clr)}/mo` : `0/mo — backlog cleared`], 'left', '#c08a1e');
  label(C.x + NW / 2, C.y - 24, [`Clock stops required`, `${fmt(n.stops)}/mo`], 'center', INK, true);

  // today's delivery tick on the stops node
  const todayH = n.today * px;
  const ty = C.y + C.h - todayH;
  ctx.strokeStyle = '#f85149'; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(C.x - 6, ty); ctx.lineTo(C.x + NW + 6, ty); ctx.stroke();
  ctx.setLineDash([]);
  label(C.x - 12, ty - 3, [`today ${fmt(n.today)}/mo —`], 'right', '#f85149');

  // conversion fan-out: schematic arrows carrying the formula (units change here)
  const boxes = [
    { y: 46,  title: 'Outpatient slots', v: `${fmt(n.slots)}/mo`, f: ['firsts follow referrals; follow-ups follow', 'clock stops; ÷ (1−DNA) ÷ clinic utilisation'], from: 'both' },
    { y: 156, title: 'Theatre sessions', v: `${fmt(n.sessions)}/mo`, f: ['× admitted share ÷ cases per', 'session ÷ theatre utilisation'], from: 'C' },
    { y: 266, title: 'Beds (elective)', v: `${fmt(n.beds)} open`, f: ['inpatient stays × length of stay', '÷ 30.4 ÷ occupancy norm'], from: 'C' },
    { y: 376, title: 'Diagnostic tests', v: `${fmt(n.diags)}/mo`, f: ['referrals × tests', 'per referral'], from: 'A' },
  ];
  const BX = 800, BW = 225, BH = 88;
  boxes.forEach((b) => {
    // arrow
    const srcY = b.from === 'A' ? A.y + A.h / 2 : C.y + C.h / 2;
    const srcX = b.from === 'A' ? A.x + NW : C.x + NW;
    ctx.strokeStyle = b.from === 'A' ? 'rgba(43,151,214,0.8)' : 'rgba(63,174,82,0.8)';
    ctx.lineWidth = 1.4; ctx.setLineDash(b.from === 'A' ? [3, 3] : []);
    ctx.beginPath();
    ctx.moveTo(b.from === 'A' ? srcX : srcX, srcY);
    ctx.bezierCurveTo(srcX + 60, srcY, BX - 60, b.y + BH / 2, BX - 6, b.y + BH / 2);
    ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    if (b.from === 'both') { // extra dashed arrow from referrals for the firsts
      ctx.strokeStyle = 'rgba(43,151,214,0.7)'; ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(A.x + NW, A.y + A.h / 2);
      ctx.bezierCurveTo(A.x + 200, A.y - 30, BX - 80, b.y + BH / 2 - 8, BX - 6, b.y + BH / 2 - 8);
      ctx.stroke(); ctx.setLineDash([]);
    }
    // box
    ctx.fillStyle = '#0f1620'; ctx.strokeStyle = '#2a3646';
    ctx.beginPath(); ctx.roundRect(BX, b.y, BW, BH, 9); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = INK; ctx.font = 'bold 12.5px system-ui';
    ctx.fillText(b.title, BX + 12, b.y + 21);
    ctx.fillStyle = css('--accent') || '#5bb0ff'; ctx.font = 'bold 15px system-ui';
    ctx.fillText(b.v, BX + 12, b.y + 42);
    ctx.fillStyle = MUT; ctx.font = '10.5px system-ui';
    b.f.forEach((l, i) => ctx.fillText(l, BX + 12, b.y + 60 + i * 13));
    ctx.font = '12px system-ui';
  });
}

function fillProse(n) {
  const set = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
  const pPct = 100 * (scenario.levers.otherRemovalsPct ?? baseline.levers.otherRemovalsPct);
  set('p-raw', fmt(n.raw));
  set('p-rem', fmt(n.rem)); set('p-rempct', pPct.toFixed(1) + '%');
  set('p-eff', fmt(n.eff));
  set('p-clr', n.clearance > 0 ? fmt(n.clearance) : '0');
  set('p-stops', fmt(n.stops));
  set('p-today', fmt(n.today));
  set('p-gap', fmt(Math.max(0, n.stops - n.today)));
  set('p-ym', n.ym);
  set('p-slots', fmt(n.slots)); set('p-sessions', fmt(n.sessions));
  set('p-beds', fmt(n.beds)); set('p-diags', fmt(n.diags));
}

// --- controls -------------------------------------------------------------------
const LEVERS = [
  { key: 'demandGrowthAdjPctYr', label: 'Demand growth adjustment (±%/yr)', min: -3, max: 5, step: 0.5, pct: false, bench: 'how fast referrals grow, on top of the calibrated +2.3%/yr' },
  { key: 'otherRemovalsPct', label: 'Leave without treatment', min: 0, max: 0.4, step: 0.01, pct: true, bench: 'share of referrals that never need a clock stop (calibrated 10.7%)' },
  { key: 'kEndScale', label: 'Booking-discipline drift (× k by 2029)', min: 0.6, max: 1.5, step: 0.05, pct: false, bench: 'changes the sustainable list size, so it changes the clearance workload' },
  { key: 'dnaRate', label: 'Outpatient DNA rate', min: 0.03, max: 0.12, step: 0.005, pct: true, bench: 'missed appointments — more DNAs means more slots per attendance' },
  { key: 'clinicUtilisation', label: 'Clinic utilisation', min: 0.7, max: 0.95, step: 0.01, pct: true, bench: 'share of planned clinic slots actually usable' },
  { key: 'theatreUtilisation', label: 'Theatre utilisation', min: 0.6, max: 0.95, step: 0.01, pct: true, bench: 'share of planned session time actually used for cases' },
  { key: 'bedOccupancy', label: 'Bed occupancy planning norm', min: 0.85, max: 0.98, step: 0.01, pct: true, bench: 'planning at 92% keeps flow safe; higher looks cheaper but gridlocks' },
];

function buildControls() {
  const cal = result.cal;
  $('month-slider').max = cal.length - 1;
  $('levers').innerHTML = LEVERS.map((l) => {
    const v = baseline.levers[l.key] ?? 0;
    return `<div class="lever">
      <label>${l.label} — <span class="val" id="lv-${l.key}">${l.pct ? (v * 100).toFixed(1) + '%' : v}</span></label>
      <input type="range" data-lever="${l.key}" min="${l.min}" max="${l.max}" step="${l.step}" value="${v}" />
      <div class="bench">${l.bench}</div>
    </div>`;
  }).join('');
}

function wire() {
  $('month-slider').addEventListener('input', (e) => { mi = +e.target.value; render(); });
  $('levers').addEventListener('input', (e) => {
    const key = e.target.dataset.lever; if (!key) return;
    const v = +e.target.value;
    scenario.levers[key] = v;
    const l = LEVERS.find((x) => x.key === key);
    $(`lv-${key}`).textContent = l.pct ? (v * 100).toFixed(1) + '%' : v;
    recompute();
  });
  $('reset').addEventListener('click', () => {
    scenario.levers = {};
    buildControls();
    recompute();
  });
}

// --- provenance ------------------------------------------------------------------
function renderProvenance() {
  const p = baseline._provenance || {};
  $('prov-body').innerHTML = `
    <p><strong>${p.trust ?? ''}</strong> — model start ${p.modelStart ?? ''}.</p>
    <p>${p.dataQuality ?? ''}</p>
    <p>${baseline.levers.sourceNote ?? ''}</p>
    <p>Raw source files are committed under <code>source/</code>; the ingest scripts under
    <code>ingest/</code> turn them into <code>data/baseline.json</code>, which this page reads.
    Nothing on this page is typed in by hand — if the seed changes, this page changes.</p>`;
}
