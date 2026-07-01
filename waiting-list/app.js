import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const setStatus = (t, k) => { statusEl.textContent = t; statusEl.className = `status status--${k}`; };
const n0 = (x) => Math.round(x).toLocaleString();

// --- webR + serial render queue (one captureR at a time) -------------------
const webR = new WebR();
let shelter;
let chain = Promise.resolve();
const enqueue = (fn) => { chain = chain.then(fn).catch((e) => console.error(e)); return chain; };
const debounced = {};
function schedule(key, fn, ms = 250) {
  clearTimeout(debounced[key]);
  debounced[key] = setTimeout(() => enqueue(fn), ms);
}

async function capture(rCode, w, h) {
  const cap = await shelter.captureR(rCode, { captureGraphics: { width: w, height: h } });
  const out = {};
  try { const r = await cap.result.toJs(); r.names.forEach((nm, i) => { const v = r.values[i]; out[nm] = v.values.length === 1 ? v.values[0] : v.values; }); } catch (_) {}
  const img = cap.images[0] || null;
  await shelter.purge();
  return { out, img };
}
function draw(canvas, img) {
  if (!img) return;
  const ctx = canvas.getContext('2d');
  canvas.width = img.width; canvas.height = img.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
}

(async function init() {
  try {
    await webR.init();
    shelter = await new webR.Shelter();
    setStatus('R is ready', 'ready');
    wire();
    renderA(); renderB(); renderC();
  } catch (e) {
    console.error(e);
    setStatus('Failed to load. webR needs a network connection on first load.', 'error');
  }
})();

const num = (id) => Number($(id).value);

// ============ Section A: exponential + targets =============================
function targetW() { const p = num('a-p') / 100, y = num('a-y'); return -y / Math.log(1 - p); }

function renderA() {
  schedule('A', async () => {
    setStatus('Computing…', 'busy');
    const lam = num('a-lam'), p = num('a-p') / 100, y = num('a-y');
    const { out, img } = await capture(rA(lam, p, y), 960, 420);
    draw($('a-chart'), img);
    const W = out.W, unstable = !isFinite(W) || W <= 0;
    const cards = unstable
      ? `<div class="stat stat--bad"><div class="v">Unstable</div><div class="l">Load ≥ 1 (capacity ≤ demand) — list grows without bound</div></div>`
      : `
      <div class="stat stat--accent"><div class="v">${W.toFixed(1)} wk</div><div class="l">Mean wait (W)</div></div>
      <div class="stat"><div class="v">${n0(out.L)}</div><div class="l">Target queue size (λ·W)</div></div>
      <div class="stat"><div class="v">${out.mu.toFixed(1)}/wk</div><div class="l">Capacity μ (λ + 1/W)</div></div>
      <div class="stat ${out.rho < 1 ? 'stat--good' : 'stat--bad'}"><div class="v">${(out.rho * 100).toFixed(1)}%</div><div class="l">Load / utilisation (λ/μ)</div></div>
      <div class="stat ${out.pressure > 1 ? 'stat--warn' : 'stat--good'}"><div class="v">${out.pressure.toFixed(2)}</div><div class="l">Pressure = 2·W/target</div></div>
      <div class="stat"><div class="v">${(out.p6 * 100).toFixed(0)} / ${(out.p18 * 100).toFixed(0)} / ${(out.p52 * 100).toFixed(0)}%</div><div class="l">Seen within 6 / 18 / 52 wk</div></div>`;
    $('a-summary').innerHTML = `<div class="cards">${cards}</div>` + (unstable ? '' :
      `<div class="takeaway">To see <strong>${(p * 100).toFixed(0)}%</strong> within <strong>${y}</strong> weeks needs a mean wait of
       <strong>${W.toFixed(1)} wk</strong> and a steady-state list of <strong>${n0(out.L)}</strong> (Little's Law).
       Holding it needs capacity just above demand — utilisation <strong>${(out.rho * 100).toFixed(1)}%</strong>, never 100%.</div>`);
    setStatus('R is ready', 'ready');
  });
}

function rA(lam, p, y) {
  return `
    lam <- ${lam}; p <- ${p}; y <- ${y}
    W <- -y/log(1-p); mu <- lam + 1/W; rho <- lam/mu
    perf <- function(t) 1-exp(-t/W)
    # auto-scale the x-axis to the data: cover the target and the tail of the
    # exponential (W*5.5 ≈ 99.6% of the area), with a small minimum.
    wmax <- max(ceiling(y*1.15), ceiling(W*5.5), 6)
    w <- 0:(wmax-1)
    # Waiting-list census by weeks waited: number still on the list who have
    # waited [w, w+1). Starts near lam (few removed in week 1) and decays;
    # the area is the list size lam*W (Little's Law).
    bins <- lam*W*(exp(-w/W) - exp(-(w+1)/W))
    cols <- ifelse(w < y, "#1f9bd6", "#cddbe6")
    op <- par(mar=c(4.4,4.8,2.6,1), cex=1.12)
    ymax <- max(bins, lam)*1.10
    plot(NA, xlim=c(0, wmax), ylim=c(0, ymax), xlab="Weeks waited",
         ylab="Referrals still waiting", main="Waiting list by weeks waited (exponential)")
    rect(w, 0, w+1, bins, col=cols, border="white", lwd=0.6)
    abline(h=lam, col="grey70", lty=3)
    abline(v=y, col="#d63a30", lwd=2, lty=2)
    abline(v=W, col="#2e9e3f", lwd=2)
    text(wmax, lam, sprintf("λ = %g ", lam), col="grey55", pos=2, cex=0.8)
    text(y, ymax*0.98, sprintf(" target %d wk", y), col="#d63a30", pos=4, cex=0.85)
    text(W, ymax*0.90, sprintf(" mean %.1f wk", W), col="#2e9e3f", pos=4, cex=0.85)
    legend("right", bty="n", fill=c("#1f9bd6","#cddbe6"), border="white",
           legend=c(sprintf("within target (%.0f%% of list)", p*100),
                    sprintf("beyond target (%.0f%% of list)", (1-p)*100)))
    par(op)
    list(W=W, L=lam*W, mu=mu, rho=rho, pressure=2*W/y, p6=perf(6), p18=perf(18), p52=perf(52))
  `;
}

// ============ Section B: shape morph ======================================
$('b-family').addEventListener('change', () => renderB());
$('b-k').addEventListener('input', () => { updateBLabel(); renderB(); });
function updateBLabel() {
  const c = num('b-k');
  const lab = c < 0.02 ? 'random / exponential' : c > 0.98 ? 'pure FIFO (flat until removed)' : `constrained ×${(1 + c * 3).toFixed(1)}`;
  $('b-k-out').textContent = lab;
}

function renderB() {
  schedule('B', async () => {
    const lam = num('a-lam'), W = targetW(), family = $('b-family').value, c = num('b-k');
    if (!isFinite(W) || W <= 0) { $('b-summary').innerHTML = '<p class="muted small">Set a valid target in section 1.</p>'; return; }
    const { out, img } = await capture(rB(lam, W, family, c), 960, 440);
    draw($('b-chart'), img);
    $('b-summary').innerHTML = `
      <div class="cards">
        <div class="stat stat--accent"><div class="v">${(out.w6 * 100).toFixed(0)} / ${(out.w18 * 100).toFixed(0)} / ${(out.w52 * 100).toFixed(0)}%</div><div class="l">This shape: within 6 / 18 / 52 wk</div></div>
        <div class="stat"><div class="v">${(out.e6 * 100).toFixed(0)} / ${(out.e18 * 100).toFixed(0)} / ${(out.e52 * 100).toFixed(0)}%</div><div class="l">Exponential: within 6 / 18 / 52 wk</div></div>
        <div class="stat"><div class="v">${n0(out.Lcur)}</div><div class="l">List size (≈ λ·W, same for all shapes)</div></div>
        <div class="stat"><div class="v">${out.maxwait.toFixed(0)} wk</div><div class="l">Longest wait present</div></div>
      </div>
      <div class="takeaway">Same λ and mean wait, but constraining long waiters pushes the shape from the exponential
        (blue matches the grey dashed) toward <strong>pure FIFO</strong> (orange dotted): a flat block at λ with
        <em>nobody</em> beyond ${out.maxwait.toFixed(0)} weeks — but also nobody seen very early. You cannot cut the
        tail without filling the middle; the area (the list) is conserved.</div>`;
  });
}

function rB(lam, W, family, c) {
  return `
    lam <- ${lam}; W <- ${W}; c <- ${c}
    maxw <- max(60, ceiling(W*6)); w <- 0:maxw
    if ("${family}" == "weibull") {
      k <- 1 + c*19; eta <- W/gamma(1+1/k); S <- exp(-(w/eta)^k)
    } else {
      sig <- max(0.05, 1.4 - c*1.3); ml <- log(W) - sig^2/2; S <- 1 - plnorm(w, ml, sig)
    }
    cens <- lam*S
    Sexp <- exp(-w/W); censExp <- lam*Sexp
    censFifo <- ifelse(w <= W, lam, 0)
    op <- par(mar=c(4.4,4.8,2.6,1), cex=1.12)
    ymax <- max(cens, censExp, censFifo)*1.05
    plot(w, cens, type="n", ylim=c(0,ymax), xlab="Wait so far (weeks)",
         ylab="Patients waiting", main="Waiting-list census by wait-age (same list, different shape)")
    lines(w, censExp, col="grey60", lwd=2, lty=2)
    lines(w, censFifo, col="#c98a13", lwd=2, lty=3)
    lines(w, cens, col="#1f9bd6", lwd=3.5)
    abline(v=c(6,18,52), col="grey88", lty=3)
    legend("topright", bty="n", lwd=c(3.5,2,2), lty=c(1,2,3),
           col=c("#1f9bd6","grey60","#c98a13"),
           legend=c("current shape","exponential (random)","pure FIFO"))
    within <- function(t) if (t >= maxw) 1 else 1 - approx(w, S, t)$y
    wexp <- function(t) 1 - exp(-t/W)
    maxwait <- if (any(S > 0.005)) max(w[S > 0.005]) else 0
    list(w6=within(6), w18=within(18), w52=within(52), e6=wexp(6), e18=wexp(18), e52=wexp(52),
         Lcur=sum(cens), maxwait=maxwait)
  `;
}

// ============ Section C: simulator ========================================
function renderC() {
  schedule('C', async () => {
    const lam = num('c-lam'), mu = num('c-mu'), weeks = num('c-weeks'),
      init = num('c-init'), initw = num('c-initw');
    const disc = document.querySelector('#c-disc .is-active').dataset.disc;
    const { out, img } = await capture(rC(lam, mu, disc, weeks, init, initw), 960, 620);
    draw($('c-chart'), img);
    const trend = mu > lam ? 'shrinking' : mu < lam ? 'growing' : 'holding';
    $('c-summary').innerHTML = `
      <div class="cards">
        <div class="stat stat--accent"><div class="v">${n0(out.final)}</div><div class="l">Final list size</div></div>
        <div class="stat"><div class="v">${out.meanW.toFixed(1)} wk</div><div class="l">Mean wait on list</div></div>
        <div class="stat ${out.p6 > 0.9 ? 'stat--good' : ''}"><div class="v">${(out.p6 * 100).toFixed(0)}%</div><div class="l">Within 6 weeks</div></div>
        <div class="stat ${out.p18 > 0.9 ? 'stat--good' : out.p18 < 0.5 ? 'stat--bad' : 'stat--warn'}"><div class="v">${(out.p18 * 100).toFixed(0)}%</div><div class="l">Within 18 weeks</div></div>
        <div class="stat"><div class="v">${(out.p52 * 100).toFixed(0)}%</div><div class="l">Within 52 weeks</div></div>
        <div class="stat"><div class="v">${(lam / mu * 100).toFixed(0)}%</div><div class="l">Load (λ/μ) — list ${trend}</div></div>
      </div>
      <div class="takeaway">With λ=${lam}, μ=${mu} (${disc.toUpperCase()}), the list is <strong>${trend}</strong>.
        ${disc === 'fifo' ? 'FIFO caps the longest wait — the census tends to a flat block.'
        : disc === 'lifo' ? 'LIFO abandons the oldest — a long tail builds and target performance collapses.'
        : 'Random removal keeps the exponential-like shape.'}</div>`;
  });
}

function rC(lam, mu, disc, weeks, init, initw) {
  return `
    lam <- ${lam}; mu <- ${mu}; weeks <- ${weeks}; initList <- ${init}; initW <- ${initw}
    maxw <- 312; cen <- numeric(maxw+1)
    if (initList > 0 && initW > 0) { s <- exp(-(0:maxw)/initW); cen <- initList*s/sum(s) }
    Ls <- numeric(weeks)
    for (t in 1:weeks) {
      top <- cen[maxw+1]
      cen <- c(lam, cen[1:maxw]); cen[maxw+1] <- cen[maxw+1] + top
      total <- sum(cen); rem <- min(mu, total)
      if ("${disc}" == "random") { f <- if (total > 0) (total-rem)/total else 1; cen <- cen*f }
      else if ("${disc}" == "fifo") { i <- maxw+1; while (rem > 1e-9 && i >= 1) { tk <- min(cen[i], rem); cen[i] <- cen[i]-tk; rem <- rem-tk; i <- i-1 } }
      else { i <- 1; while (rem > 1e-9 && i <= maxw+1) { tk <- min(cen[i], rem); cen[i] <- cen[i]-tk; rem <- rem-tk; i <- i+1 } }
      Ls[t] <- sum(cen)
    }
    total <- sum(cen)
    wsum <- function(k) if (total > 0) sum(cen[1:min(k+1, maxw+1)])/total else 1
    meanW <- if (total > 0) sum(cen*(0:maxw))/total else 0
    op <- par(mfrow=c(2,1), mar=c(4,4.8,2.4,1), cex=1.05)
    plot(1:weeks, Ls, type="l", lwd=3, col="#1f9bd6", ylim=c(0, max(Ls)*1.05),
         xlab="Week", ylab="Waiting list size", main="Waiting list over time")
    abline(h=0, col="grey85")
    mx <- max(60, which(cen > max(cen)*1e-3))
    plot(0:(mx-1), cen[1:mx], type="h", col="#1f9bd6", lwd=2,
         xlab="Wait so far (weeks)", ylab="Patients", main="Final census by wait-age")
    abline(v=c(6,18,52), col="#d63a30", lty=3)
    par(op)
    list(final=Ls[weeks], meanW=meanW, p6=wsum(6), p18=wsum(18), p52=wsum(52))
  `;
}

// --- wiring ----------------------------------------------------------------
function wire() {
  // Section A
  ['a-lam', 'a-p', 'a-y'].forEach((id) => $(id).addEventListener('input', () => { renderA(); renderB(); }));
  // Section C
  ['c-lam', 'c-mu', 'c-init', 'c-initw', 'c-weeks'].forEach((id) => $(id).addEventListener('input', renderC));
  $('c-disc').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    document.querySelectorAll('#c-disc .seg-btn').forEach((x) => x.classList.toggle('is-active', x === b));
    renderC();
  });
  updateBLabel();
}
