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
    renderConversion();
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

// --- referral → treated-cancer conversion (sankey) ---------------------------
function renderConversion() {
  const c = cancer.conversion;
  if (!c) return;
  const ruleOuts = c.referralsMo / c.treatedMo - 1;
  $('conv-cards').innerHTML = `
    <div class="stat"><div class="v">${fmt(c.referralsMo)}</div><div class="l">Urgent suspected cancer referrals / month</div></div>
    <div class="stat"><div class="v">${fmt(c.treatedMo)}</div><div class="l">First treatments on the USC 62-day pathway / month</div></div>
    <div class="stat stat--accent"><div class="v">${c.convPct}%</div><div class="l">Treated conversion (national benchmark ≈ 7%)</div></div>
    <div class="stat"><div class="v">≈ ${ruleOuts.toFixed(0)} : 1</div><div class="l">Rule-outs per treated cancer — the diagnostic workload behind each diagnosis</div></div>`;
  $('conv-table').querySelector('tbody').innerHTML = c.sites.map((s) => `<tr>
    <td>${s.name}</td>
    <td class="num">${fmt(s.referralsMo)}</td>
    <td class="num">${fmt(s.treatedMo)}</td>
    <td class="num"><strong>${s.convPct}%</strong></td>
  </tr>`).join('');
  $('conv-note').textContent = c.note;
  drawSankey($('chart-sankey'), c);
}

function drawSankey(canvas, c) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || canvas.width;
  const H = canvas.getAttribute('height') * Math.min(1.15, Math.max(0.85, W / canvas.getAttribute('width')));
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const INK = css('--text'), MUT = css('--muted'), GOOD = S3();
  const narrow = W < 560;
  const treatedTot = c.sites.reduce((a, s) => a + s.treatedMo, 0);
  const totalRefs = c.sites.reduce((a, s) => a + s.referralsMo, 0);
  const rLabels = [
    ['Cancer treated', `${fmt(treatedTot)} (${c.convPct}%)`],
    ['No cancer treated', `${fmt(totalRefs - treatedTot)} (${(100 - c.convPct).toFixed(1)}%)`],
  ];
  ctx.font = '11px system-ui';
  // right padding sized to the widest label so nothing clips at the edge
  const padR = Math.ceil(Math.max(...rLabels.flat().map((t) => ctx.measureText(t).width))) + 20;
  const padL = narrow ? 118 : 168, padT = 16, padB = 12;
  const nodeW = 10, gap = 6, minH = 12;
  const x0 = padL, x1 = W - padR - nodeW;

  // proportional node heights with a minimum so every label stays legible;
  // the excess is taken from nodes above the minimum (values are printed, so
  // honesty is kept by the labels and the table alongside)
  const avail = H - padT - padB - gap * (c.sites.length - 1);
  const total = c.sites.reduce((a, s) => a + s.referralsMo, 0);
  let hs = c.sites.map((s) => (s.referralsMo / total) * avail);
  const deficit = hs.reduce((a, h) => a + Math.max(0, minH - h), 0);
  const shrinkable = hs.reduce((a, h) => a + Math.max(0, h - minH), 0);
  hs = hs.map((h) => (h < minH ? minH : h - (deficit * (h - minH)) / shrinkable));

  const left = []; let y = padT;
  c.sites.forEach((s, i) => { left.push({ s, y, h: hs[i] }); y += hs[i] + gap; });

  // right column: treated on top, everything else below, same value scale
  const scale = (H - padT - padB - gap) / total;
  const treated = treatedTot;
  const rTreated = { y: padT, h: Math.max(minH, treated * scale) };
  const rRest = { y: rTreated.y + rTreated.h + gap, h: H - padB - (rTreated.y + rTreated.h + gap) };

  ctx.clearRect(0, 0, W, H);

  // ribbons (behind nodes): treated slice from the top of each left node
  const ribbon = (ya, hA, yb, hB, fill) => {
    const xa = x0 + nodeW, xb = x1, mx = (xa + xb) / 2;
    ctx.beginPath();
    ctx.moveTo(xa, ya);
    ctx.bezierCurveTo(mx, ya, mx, yb, xb, yb);
    ctx.lineTo(xb, yb + hB);
    ctx.bezierCurveTo(mx, yb + hB, mx, ya + hA, xa, ya + hA);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  };
  let tOff = 0, nOff = 0;
  left.forEach(({ s, y: ly, h }) => {
    const th = h * (s.treatedMo / s.referralsMo);
    const tH = (treated ? rTreated.h * (s.treatedMo / treated) : 0);
    const nH = rRest.h * ((s.referralsMo - s.treatedMo) / (total - treated));
    ribbon(ly, th, rTreated.y + tOff, tH, 'rgba(63, 174, 82, 0.55)');
    ribbon(ly + th, h - th, rRest.y + nOff, nH, 'rgba(85, 99, 122, 0.28)');
    tOff += tH; nOff += nH;
  });

  // nodes + labels (ink, outside the marks)
  ctx.font = '11px system-ui';
  left.forEach(({ s, y: ly, h }) => {
    ctx.fillStyle = '#3a4a5e'; ctx.fillRect(x0, ly, nodeW, h);
    ctx.fillStyle = INK; ctx.textAlign = 'right';
    const label = narrow ? s.name : `${s.name} · ${fmt(s.referralsMo)}`;
    ctx.fillText(label, x0 - 8, ly + h / 2 + 4);
  });
  ctx.fillStyle = GOOD; ctx.fillRect(x1, rTreated.y, nodeW, rTreated.h);
  ctx.fillStyle = '#3a4a5e'; ctx.fillRect(x1, rRest.y, nodeW, rRest.h);
  ctx.textAlign = 'left';
  const rl = (lines, yc) => {
    ctx.fillStyle = INK; ctx.fillText(lines[0], x1 + nodeW + 8, yc - 2);
    ctx.fillStyle = MUT; ctx.fillText(lines[1], x1 + nodeW + 8, yc + 12);
  };
  rl(rLabels[0], rTreated.y + rTreated.h / 2);
  rl(rLabels[1], rRest.y + rRest.h / 2);

  // hover: per-site tooltip over the left half
  let tip = canvas.parentElement.querySelector('.tooltip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'tooltip'; canvas.parentElement.appendChild(tip); }
  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect();
    const my = e.clientY - r.top;
    const hit = left.find(({ y: ly, h }) => my >= ly && my <= ly + h);
    if (!hit) { tip.style.display = 'none'; return; }
    tip.style.display = 'block';
    tip.style.left = `${Math.min(e.clientX - r.left + 14, r.width - 190)}px`;
    tip.style.top = `${my + 14}px`;
    tip.innerHTML = `<div class="t-ym">${hit.s.name}</div>
      <div>referrals: <strong>${fmt(hit.s.referralsMo)}</strong>/mo</div>
      <div>treated: <strong>${fmt(hit.s.treatedMo)}</strong>/mo</div>
      <div>conversion: <strong>${hit.s.convPct}%</strong></div>`;
  };
  canvas.onmouseleave = () => { tip.style.display = 'none'; };
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
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { renderGlide(); renderStdChart(); if (cancer.conversion) drawSankey($('chart-sankey'), cancer.conversion); }, 150); });
}
