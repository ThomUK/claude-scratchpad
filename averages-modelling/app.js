import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const runBtn = $('run');
const summaryEl = $('summary');
const canvas = $('chart');
const ctx = canvas.getContext('2d');

const inputs = {
  admits: $('admits'), los: $('los'), spread: $('spread'),
  arrival: $('arrival'), discharge: $('discharge'), weekend: $('weekend'),
};

$('spread').addEventListener('input', (e) => { $('spread-out').textContent = Number(e.target.value).toFixed(2); });
$('weekend').addEventListener('input', (e) => { $('weekend-out').textContent = Number(e.target.value).toFixed(2); });

const setStatus = (text, kind) => { statusEl.textContent = text; statusEl.className = `status status--${kind}`; };

// --- 24-hour profiles ------------------------------------------------------
// Arrival profiles: relative weights (normalised in R).
const ARRIVAL = {
  flat:      Array(24).fill(1),
  daytime:   [.3,.3,.3,.3,.3,.4,.6,.9,1.1,1.2,1.2,1.2,1.1,1.1,1.1,1,1,.9,.8,.7,.6,.5,.4,.3],
  evening:   [.4,.3,.3,.3,.3,.4,.5,.6,.7,.8,.9,1,1.1,1.2,1.3,1.4,1.4,1.4,1.3,1.2,1.1,.9,.7,.5],
  overnight: [.15,.12,.1,.1,.12,.2,.5,.9,1.2,1.3,1.3,1.3,1.2,1.2,1.1,1.1,1,.9,.8,.7,.5,.4,.3,.2],
};
// Discharge time profiles: relative hourly discharge propensity, 0..1.
const DISCHARGE = {
  afternoon: [0,0,0,0,0,0,0,0,.05,.1,.2,.35,.5,.7,.9,1,.95,.8,.55,.3,.15,.05,0,0],
  midday:    [0,0,0,0,0,0,0,.05,.2,.45,.75,.95,1,.95,.75,.5,.3,.15,.07,0,0,0,0,0],
  spread:    [0,0,0,0,0,0,0,.1,.4,.7,.85,.9,.9,.9,.9,.85,.8,.7,.55,.35,.2,.1,.05,0],
  early:     [0,0,0,0,0,0,.05,.25,.6,.9,1,.95,.75,.5,.3,.18,.1,.05,0,0,0,0,0,0],
};

// --- R program -------------------------------------------------------------
function rProgram(p) {
  return `
    adm_day  <- ${p.admits}
    mean_los <- ${p.los}        # days
    cv       <- ${p.spread}
    wf       <- ${p.weekend}
    arr <- c(${ARRIVAL[p.arrival].join(',')})
    dsh <- c(${DISCHARGE[p.discharge].join(',')})

    weeks <- max(8, ceiling((max(2, ceiling(mean_los * 4) + 3) + 7) / 7) + 3)
    H <- weeks * 24 * 7; ndays <- H %/% 24
    hour_of <- (0:(H-1)) %% 24

    arr  <- arr / sum(arr)
    admissions <- adm_day * arr[hour_of + 1]
    pdis <- dsh / sum(dsh)                      # discharge timing within a day

    # Length-of-stay distribution over whole days (deterministic mixture).
    Lmax <- max(2, ceiling(mean_los * 4) + 3)
    ks <- 1:Lmax
    if (cv < 0.02) {                           # ~fixed LOS: split to preserve mean
      lo <- floor(mean_los); hi <- ceiling(mean_los); w <- numeric(Lmax)
      if (lo == hi) { w[min(max(lo,1),Lmax)] <- 1 } else {
        fr <- mean_los - lo
        if (lo >= 1 && lo <= Lmax) w[lo] <- 1 - fr
        if (hi >= 1 && hi <= Lmax) w[hi] <- fr
      }
    } else {
      sdlog <- sqrt(log(1 + cv^2)); meanlog <- log(mean_los) - sdlog^2 / 2
      w <- plnorm(ks + 0.5, meanlog, sdlog) - plnorm(pmax(ks - 0.5, 0), meanlog, sdlog)
      w <- w / sum(w)
    }

    # Patients admitted on day a are due for discharge on day a + LOS. With a
    # constant daily admission total, the number due on day d settles to adm_day.
    cw <- cumsum(w)
    dayidx <- 0:(ndays - 1)
    kk <- pmin(Lmax, dayidx)
    ready_day <- ifelse(kk >= 1, adm_day * cw[pmax(kk, 1)], 0)

    # Spread each day's due discharges over the hours by the discharge profile,
    # deferring a fraction of weekend-due discharges to following days (carry).
    disch <- numeric(H); carry <- 0
    for (d in 0:(ndays - 1)) {
      pool <- ready_day[d + 1] + carry
      if ((d %% 7) >= 5) { today <- pool * wf; carry <- pool - today }
      else               { today <- pool;      carry <- 0 }
      base <- d * 24
      disch[(base + 1):(base + 24)] <- disch[(base + 1):(base + 24)] + today * pdis
    }

    occ <- numeric(H + 1)                       # start empty; burn-in fills it
    for (t in 1:H) occ[t + 1] <- occ[t] + admissions[t] - disch[t]

    # Report the final settled week.
    wk <- occ[(H - 167 + 1):(H + 1)]            # 168 hourly values, Mon..Sun
    avg_beds <- adm_day * mean_los              # average model (Little's Law)
    peak <- max(wk); meanocc <- mean(wk); trough <- min(wk)
    realised_los <- meanocc / adm_day           # days, via Little's Law

    # --- plot --------------------------------------------------------------
    op <- par(mar = c(4.2, 4.6, 3, 1), cex = 1.12)
    plot(0:167, wk, type = "n", xaxt = "n",
         xlim = c(0, 167), ylim = c(0, max(peak, avg_beds) * 1.08),
         xlab = "", ylab = "Beds occupied",
         main = "Bed occupancy across a week")
    days <- c("Mon","Tue","Wed","Thu","Fri","Sat","Sun")
    abline(v = seq(0, 168, by = 24), col = "grey88")
    rect(120, par("usr")[3], 168, par("usr")[4], col = "#f3f4f6", border = NA)  # weekend band
    axis(1, at = seq(12, 167, by = 24), labels = days, tick = FALSE)
    # average-model bed line
    abline(h = avg_beds, col = "#1f9bd6", lwd = 2.5, lty = 2)
    abline(h = meanocc, col = "grey55", lwd = 1.5, lty = 3)
    lines(0:167, wk, col = "#d63a30", lwd = 3)
    pk <- which.max(wk) - 1
    points(pk, peak, pch = 19, col = "#d63a30");
    legend("topleft", bty = "n", inset = 0.02,
           lwd = c(3, 2.5, 1.5), lty = c(1, 2, 3),
           col = c("#d63a30", "#1f9bd6", "grey55"),
           legend = c("intraday model", "average-model beds", "model mean"))
    par(op)

    list(
      avg_beds = avg_beds, peak = peak, meanocc = meanocc, trough = trough,
      hours_over = sum(wk > avg_beds), uplift = peak / avg_beds - 1,
      shortfall = ceiling(peak) - ceiling(avg_beds), realised_los = realised_los
    )
  `;
}

// --- webR boot -------------------------------------------------------------
const webR = new WebR();
let shelter;

(async function init() {
  try {
    await webR.init();
    shelter = await new webR.Shelter();
    setStatus('R is ready', 'ready');
    runBtn.disabled = false;
    run();
  } catch (err) {
    console.error(err);
    setStatus('Failed to load. webR needs a network connection on first load.', 'error');
  }
})();

function readParams() {
  return {
    admits: Math.max(1, Math.round(Number(inputs.admits.value) || 1)),
    los: Math.max(0.5, Number(inputs.los.value) || 0.5),
    spread: Math.min(1, Math.max(0, Number(inputs.spread.value) || 0)),
    weekend: Math.min(1, Math.max(0.2, Number(inputs.weekend.value) || 0.2)),
    arrival: inputs.arrival.value,
    discharge: inputs.discharge.value,
  };
}

async function run() {
  if (!shelter) return;
  runBtn.disabled = true;
  setStatus('Modelling in R…', 'busy');
  try {
    const cap = await shelter.captureR(rProgram(readParams()), {
      captureGraphics: { width: 980, height: 540 },
    });
    const res = await cap.result.toJs();
    const v = {};
    res.names.forEach((name, i) => { v[name] = res.values[i].values[0]; });
    if (cap.images.length) drawImage(cap.images[0]);
    renderSummary(v);
    setStatus('R is ready', 'ready');
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + (err?.message || err), 'error');
  } finally {
    await shelter.purge();
    runBtn.disabled = false;
  }
}

function drawImage(bitmap) {
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
}

function renderSummary(v) {
  const n = (x) => Math.round(x).toLocaleString();
  const avgBeds = Math.ceil(v.avg_beds);
  const peakBeds = Math.ceil(v.peak);
  const pctOver = (v.hours_over / 168 * 100).toFixed(0);
  const uplift = (v.uplift * 100).toFixed(0);

  summaryEl.innerHTML = `
    <div class="cards">
      <div class="stat stat--avg"><div class="v">${n(v.avg_beds)}</div><div class="l">Average-model beds (admissions × LOS)</div></div>
      <div class="stat stat--peak"><div class="v">${n(v.peak)}</div><div class="l">Peak occupancy (intraday model)</div></div>
      <div class="stat"><div class="v">+${uplift}%</div><div class="l">Peak above the average</div></div>
      <div class="stat"><div class="v">${pctOver}%</div><div class="l">Of the week above the average line</div></div>
    </div>
    <div class="takeaway">
      Planning to the average gives <strong>${avgBeds} beds</strong>, but the hour-by-hour model
      peaks at <strong>${n(v.peak)}</strong> &mdash; <strong>${uplift}% higher</strong>. Occupancy sits
      above the average line for <strong>${pctOver}% of the week</strong>, so ${avgBeds} beds would be
      breached repeatedly; covering the peak needs about
      <strong>${peakBeds} beds (${v.shortfall >= 0 ? '+' : ''}${v.shortfall})</strong>.
      Discharge timing and reduced weekend discharges create the daily swings and the weekend build-up;
      realised mean length of stay is ~<strong>${v.realised_los.toFixed(1)} days</strong>
      (discharge delay nudges it above the ${Number(inputs.los.value).toFixed(1)}-day input the average uses).
    </div>`;
}

runBtn.addEventListener('click', run);
