import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';

// --- DOM ---------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const runBtn = $('run');
const summaryEl = $('summary');
const canvas = $('chart');
const ctx = canvas.getContext('2d');

const inputs = {
  population: $('population'),
  rate: $('rate'),
  variability: $('variability'),
  sims: $('sims'),
  seed: $('seed'),
};

$('variability').addEventListener('input', (e) => {
  $('variability-out').textContent = Number(e.target.value).toFixed(2);
});
$('randomize').addEventListener('click', () => {
  inputs.seed.value = Math.floor(Math.random() * 1e6);
});

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = `status status--${kind}`;
}

// --- R program ---------------------------------------------------------
// Builds the simulation. All values are validated numerics, interpolated inline.
function rProgram({ population, rate, variability, sims, seed }) {
  return `
    set.seed(${seed})
    N      <- ${population}
    p      <- ${rate}
    spread <- ${variability}
    S      <- ${sims}

    # Concentration of the Beta rate-of-the-day: high => steady, low => volatile.
    conc <- 2 + 600 * (1 - spread)^3
    rates <- rbeta(S, p * conc, (1 - p) * conc)
    occ   <- rbinom(S, N, rates)

    probs <- c(0.50, 0.85, 0.95, 0.99)
    qs    <- quantile(occ, probs, type = 7)

    op <- par(mar = c(4.6, 4.6, 3, 1), cex = 1.15)
    hist(occ, breaks = 40, col = "#cfe8ff", border = "#8fc1ea",
         main = "Distribution of simulated daily occupancy",
         xlab = "Occupants on a given day", ylab = "Number of days")
    cols <- c("#1f9bd6", "#2e9e3f", "#c98a13", "#d63a30")
    labs <- c("p50", "p85", "p95", "p99")
    for (i in seq_along(qs)) abline(v = qs[i], col = cols[i], lwd = 3, lty = 2)
    legend("topright", legend = sprintf("%s = %d", labs, round(qs)),
           col = cols, lwd = 3, lty = 2, bty = "n", inset = 0.02)
    par(op)

    res <- c(qs[[1]], qs[[2]], qs[[3]], qs[[4]],
             mean(occ), min(occ), max(occ), N)
    names(res) <- c("p50", "p85", "p95", "p99", "mean", "min", "max", "N")
    res
  `;
}

// --- webR boot ---------------------------------------------------------
const webR = new WebR();
let shelter;

(async function init() {
  try {
    await webR.init();
    shelter = await new webR.Shelter();
    setStatus('R is ready — run a simulation', 'ready');
    runBtn.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus('Failed to load webR. A network connection is required on first load.', 'error');
  }
})();

// --- run ---------------------------------------------------------------
function readParams() {
  const population = Math.max(1, Math.round(Number(inputs.population.value) || 0));
  const rate = Math.min(0.99, Math.max(0.01, Number(inputs.rate.value) || 0));
  const variability = Math.min(0.95, Math.max(0, Number(inputs.variability.value) || 0));
  const sims = Math.max(100, Math.round(Number(inputs.sims.value) || 0));
  const seed = Math.max(0, Math.round(Number(inputs.seed.value) || 0));
  return { population, rate, variability, sims, seed };
}

async function run() {
  if (!shelter) return;
  runBtn.disabled = true;
  setStatus('Simulating in R…', 'busy');

  const params = readParams();
  try {
    const cap = await shelter.captureR(rProgram(params), {
      captureGraphics: { width: 900, height: 500 },
    });

    const jsRes = await cap.result.toJs(); // { names, values }
    const v = {};
    jsRes.names.forEach((name, i) => { v[name] = jsRes.values[i]; });

    if (cap.images.length) drawImage(cap.images[0]);
    renderSummary(v, params);

    setStatus('Done — R is ready', 'ready');
  } catch (err) {
    console.error(err);
    setStatus('Simulation error: ' + (err?.message || err), 'error');
  } finally {
    await shelter.purge(); // free R objects + captured graphics
    runBtn.disabled = false;
  }
}

function drawImage(bitmap) {
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
}

function renderSummary(v, params) {
  const fmt = (n) => Math.round(n).toLocaleString();
  const pct = (n) => ((n / params.population) * 100).toFixed(1) + '%';

  // Express the exceedance (fraction of days above the percentile) as a typical
  // count over a ~30.4-day month; spell out rarer-than-monthly cases.
  const DAYS_PER_MONTH = 30.4;
  const busiestDays = (exceedFrac) => {
    const perMonth = exceedFrac * DAYS_PER_MONTH;
    if (perMonth >= 3) return `~${Math.round(perMonth)} days a month`;
    if (perMonth >= 1) return `~${perMonth.toFixed(1)} days a month`;
    return `~${perMonth.toFixed(1)} days a month (about 1 day every ${Math.round(1 / perMonth)} months)`;
  };

  const rows = [
    ['p50', 'p50', v.p50, `Median day — busier than this ${busiestDays(0.50)}`],
    ['p85', 'p85', v.p85, `Covers all but the busiest ${busiestDays(0.15)}`],
    ['p95', 'p95', v.p95, `Covers all but the busiest ${busiestDays(0.05)}`],
    ['p99', 'p99', v.p99, `Covers all but the busiest ${busiestDays(0.01)}`],
  ].map(([cls, label, val, note]) => `
    <tr>
      <td><span class="swatch swatch--${cls}"></span>${label}</td>
      <td>${fmt(val)}</td>
      <td>${pct(val)}</td>
      <td class="muted" style="text-align:left">${note}</td>
    </tr>`).join('');

  const extraAbs = Math.round(v.p99 - v.p50);
  const extraPct = (((v.p99 - v.p50) / v.p50) * 100).toFixed(0);

  summaryEl.innerHTML = `
    <table>
      <thead>
        <tr><th>Percentile</th><th>Occupants</th><th>% of pool</th><th style="text-align:left">Meaning</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="takeaway">
      Same simulation, four answers. Sizing for <strong>p99 (${fmt(v.p99)})</strong> rather than
      <strong>p50 (${fmt(v.p50)})</strong> means provisioning for
      <strong>${fmt(extraAbs)} more occupants</strong> (${extraPct}% more) &mdash; the cost of
      covering the rare busy days. Mean was ${fmt(v.mean)}; observed range ${fmt(v.min)}&ndash;${fmt(v.max)}.
    </div>`;
}

runBtn.addEventListener('click', run);
