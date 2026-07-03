import { ymDiff } from './engine.js?v=dev';

export const fmt = (x, d = 0) => Number(x).toLocaleString(undefined, { maximumFractionDigits: d });
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const S1 = () => css('--s1'), S2 = () => css('--s2'), S3 = () => css('--s3');
const INK = () => css('--text'), MUT = () => css('--muted'), GRID = '#242e3a';

// --- chart helper -------------------------------------------------------------
// Multi-series line chart on the panel surface: recessive grid, milestone
// vlines, 2px lines, legend + direct end labels, crosshair hover tooltip.
export function lineChart(canvas, cal, series, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const wCss = canvas.clientWidth || canvas.width, hCss = canvas.getAttribute('height') * (wCss / canvas.getAttribute('width'));
  canvas.width = wCss * dpr; canvas.height = hCss * dpr;
  canvas.style.height = `${hCss}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = wCss, H = hCss;
  // right padding sized to the widest series label so end labels never clip
  ctx.font = '11px system-ui';
  const maxLabel = Math.max(...series.map((s) => ctx.measureText(s.name).width));
  // x labels are drawn angled; bottom padding sized to the widest one
  const xLabelFor = (ym) => (opts.xTickEvery ? ym : ym.replace('-04', ' Apr').replace('-07', ' Jul'));
  const showX = (ym, i) => (opts.xTickEvery ? i % opts.xTickEvery === 0 : ym.endsWith('-04') || i === 0);
  const ANGLE = -Math.PI / 5; // ≈ −36°
  const maxXLabel = Math.max(...cal.filter(showX).map((ym) => ctx.measureText(xLabelFor(ym)).width), 0);
  const padL = 58, padR = Math.min(Math.ceil(maxLabel) + 24, W * 0.35), padT = 14;
  const padB = 16 + Math.ceil(maxXLabel * Math.abs(Math.sin(ANGLE))) + 6;
  const iw = W - padL - padR, ih = H - padT - padB;

  const all = series.flatMap((s) => s.data)
    .concat(opts.band ? [...opts.band.upper, ...opts.band.lower] : []);
  let ymin = opts.ymin ?? Math.min(...all), ymax = opts.ymax ?? Math.max(...all);
  if (ymin === ymax) { ymin -= 1; ymax += 1; }
  const yr = ymax - ymin; ymin -= yr * 0.06; ymax += yr * 0.08;
  const x = (i) => padL + (iw * i) / (cal.length - 1);
  const y = (v) => padT + ih - ((v - ymin) / (ymax - ymin)) * ih;

  ctx.clearRect(0, 0, W, H);
  // grid + y labels
  ctx.font = '11px system-ui'; ctx.fillStyle = MUT(); ctx.strokeStyle = GRID; ctx.lineWidth = 1;
  const ticks = 4;
  for (let k = 0; k <= ticks; k++) {
    const v = ymin + ((ymax - ymin) * k) / ticks, yy = y(v);
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(opts.yfmt ? opts.yfmt(v) : fmt(v), padL - 8, yy + 4);
  }
  // x labels — Aprils for calendar axes, every n-th tick otherwise; drawn at an
  // angle so adjacent labels never overlap
  cal.forEach((ym, i) => {
    if (!showX(ym, i)) return;
    ctx.save();
    ctx.translate(x(i), padT + ih + 8);
    ctx.rotate(ANGLE);
    ctx.textAlign = 'right';
    ctx.fillText(xLabelFor(ym), 0, 8);
    ctx.restore();
  });
  // milestone vlines (m.ym for calendar axes, m.i for index axes)
  (opts.milestones || []).forEach((m) => {
    const i = m.i ?? ymDiff(cal[0], m.ym); if (i < 0 || i >= cal.length) return;
    ctx.strokeStyle = '#37465a'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x(i), padT); ctx.lineTo(x(i), padT + ih); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = MUT(); ctx.textAlign = 'center'; ctx.fillText(m.label, x(i), padT + 2);
  });
  // uncertainty band (drawn behind the series)
  if (opts.band) {
    ctx.beginPath();
    opts.band.upper.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    for (let i = cal.length - 1; i >= 0; i--) ctx.lineTo(x(i), y(opts.band.lower[i]));
    ctx.closePath();
    ctx.fillStyle = opts.band.color || 'rgba(43, 151, 214, 0.14)';
    ctx.fill();
  }
  // series
  series.forEach((s) => {
    ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    s.data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.stroke(); ctx.setLineDash([]);
  });
  // direct end labels (text ink, colored chip), nudged apart where series converge
  const MINGAP = 14;
  const labels = series
    .map((s) => ({ s, ly: y(s.data[s.data.length - 1]) }))
    .sort((a, b) => a.ly - b.ly);
  labels.forEach((l, i) => { if (i) l.ly = Math.max(l.ly, labels[i - 1].ly + MINGAP); });
  const over = labels.length ? labels[labels.length - 1].ly - (padT + ih) : 0;
  if (over > 0) {
    labels[labels.length - 1].ly -= over;
    for (let i = labels.length - 2; i >= 0; i--) labels[i].ly = Math.min(labels[i].ly, labels[i + 1].ly - MINGAP);
  }
  const ex = x(cal.length - 1);
  labels.forEach(({ s, ly }) => {
    ctx.fillStyle = s.color; ctx.fillRect(ex + 6, ly - 4, 8, 8);
    ctx.fillStyle = INK(); ctx.textAlign = 'left'; ctx.font = '11px system-ui';
    ctx.fillText(s.name, ex + 18, ly + 4);
  });

  // hover layer
  attachHover(canvas, cal, series, { x, y, padL, padT, ih, iw, yfmt: opts.yfmt });
}

function attachHover(canvas, cal, series, g) {
  let tip = canvas.parentElement.querySelector('.tooltip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'tooltip'; canvas.parentElement.appendChild(tip); }
  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const i = Math.max(0, Math.min(cal.length - 1, Math.round(((mx - g.padL) / g.iw) * (cal.length - 1))));
    tip.style.display = 'block';
    tip.style.left = `${Math.min(mx + 14, r.width - 170)}px`;
    tip.style.top = `${e.clientY - r.top + 14}px`;
    tip.innerHTML = `<div class="t-ym">${cal[i]}</div>` + series.map((s) =>
      `<div><span class="k" style="background:${s.color}"></span>${s.name}: <strong>${g.yfmt ? g.yfmt(s.data[i]) : fmt(s.data[i])}</strong></div>`).join('');
  };
  canvas.onmouseleave = () => { tip.style.display = 'none'; };
}


