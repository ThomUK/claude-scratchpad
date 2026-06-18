import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const updateBtn = $('update');
const currentSel = $('current');
const weeksInput = $('weeks');
const weeksOut = $('weeks-out');
const summaryEl = $('summary');
const canvas = $('chart');
const ctx = canvas.getContext('2d');

const setStatus = (text, kind) => { statusEl.textContent = text; statusEl.className = `status status--${kind}`; };

weeksInput.addEventListener('input', () => { weeksOut.textContent = weeksInput.value; });

// --- R program -------------------------------------------------------------
// currentSeason: season to track (bold, truncated to K weeks).
// K: weeks observed so far. Both are validated before interpolation.
function rProgram(currentSeason, K) {
  return `
    d <- read.csv("/tmp/flu.csv", stringsAsFactors = FALSE)
    seasons <- unique(d$season)
    cur <- ${JSON.stringify(currentSeason)}
    K   <- ${K}

    # Per-season summary over the *full* observed curve.
    summ <- function(s) {
      x <- d[d$season == s, ]
      x <- x[order(x$season_week), ]
      pk <- which.max(x$count)
      list(peak_pos = x$season_week[pk], peak_iso = x$iso_week[pk],
           peak_height = max(x$count), weeks = nrow(x))
    }
    info <- setNames(lapply(seasons, summ), seasons)

    # Heuristic archetype (tunable): a low peak is a "slow burn"; otherwise
    # classify by when the peak lands on the annual axis (pos 1 = ISO wk 14).
    # EARLY_CUT 38 ≈ ISO week 51 (mid-December).
    SLOW_HEIGHT <- 1000
    EARLY_CUT <- 38
    archetype <- function(s) {
      i <- info[[s]]
      if (i$peak_height < SLOW_HEIGHT) "slow"
      else if (i$peak_pos <= EARLY_CUT) "early"
      else "late"
    }
    arch <- setNames(vapply(seasons, archetype, ""), seasons)

    # --- plot ---------------------------------------------------------------
    # x axis is the annual ISO-week year: pos 1..52 = ISO weeks 14→52→1→13.
    isoOf <- function(p) ((14 + (p - 1) - 1) %% 52) + 1
    pal <- c(early = "#1f9bd6", late = "#d63a30", slow = "#2e9e3f")
    maxc <- max(d$count); maxw <- max(d$season_week)
    op <- par(mar = c(4.6, 4.8, 3, 1), cex = 1.12)
    plot(NA, xlim = c(1, maxw), ylim = c(0, maxc * 1.05), xaxt = "n",
         xlab = "ISO week  (year running wk 14 → wk 52 → wk 13)",
         ylab = "Flu patients", main = "Weekly flu patients by season (ISO-week year)")
    ticks <- seq(1, maxw, by = 4)
    axis(1, at = ticks, labels = isoOf(ticks))
    others <- setdiff(seasons, cur)
    for (s in others) {
      x <- d[d$season == s, ]; x <- x[order(x$season_week), ]
      col <- pal[[arch[[s]]]]
      lines(x$season_week, x$count, col = adjustcolor(col, alpha.f = 0.55), lwd = 2)
    }
    # tracked season, only first K weeks
    xc <- d[d$season == cur, ]; xc <- xc[order(xc$season_week), ]
    xc <- xc[xc$season_week <= K, ]
    lines(xc$season_week, xc$count, col = "black", lwd = 3.5)
    points(xc$season_week, xc$count, col = "black", pch = 19, cex = 0.9)
    abline(v = K, col = "grey60", lty = 3)
    legend("topright", bty = "n", inset = 0.02, lwd = c(2,2,2,3.5),
           col = c(pal[["early"]], pal[["late"]], pal[["slow"]], "black"),
           legend = c("early peak", "late peak", "slow burn", paste0(cur, " (tracked)")))
    par(op)

    # --- similarity of tracked season's first K weeks vs each other season --
    curv <- xc$count
    score_one <- function(s) {
      x <- d[d$season == s, ]; x <- x[order(x$season_week), ]
      hv <- x$count[x$season_week <= K]
      n <- min(length(curv), length(hv))
      if (n < 2) return(c(dist = NA, corr = NA))
      a <- curv[1:n]; b <- hv[1:n]
      sc <- max(a)                       # scale by tracked season's level
      if (sc <= 0) sc <- 1
      d_ <- sqrt(mean(((a - b) / sc)^2)) # scaled RMSE (lower = closer)
      r_ <- suppressWarnings(cor(a, b))
      c(dist = d_, corr = r_)
    }
    sc <- t(vapply(others, score_one, c(dist = 0, corr = 0)))
    ord <- order(sc[, "dist"])
    others_ranked <- others[ord]

    list(
      current     = cur,
      k           = K,
      cur_weeks   = nrow(d[d$season == cur, ]),
      season      = others_ranked,
      archetype   = unname(arch[others_ranked]),
      peak_iso    = vapply(others_ranked, function(s) info[[s]]$peak_iso, 0),
      peak_height = vapply(others_ranked, function(s) info[[s]]$peak_height, 0),
      dist        = unname(sc[ord, "dist"]),
      corr        = unname(sc[ord, "corr"])
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

    const text = await (await fetch('data/flu_weekly.csv?v=2', { cache: 'no-cache' })).text();
    await webR.FS.writeFile('/tmp/flu.csv', new TextEncoder().encode(text));
    populateControls(text);

    setStatus('R is ready', 'ready');
    updateBtn.disabled = false;
    render();
  } catch (err) {
    console.error(err);
    setStatus('Failed to load. webR needs a network connection on first load.', 'error');
  }
})();

// Parse just enough CSV in JS to set up the season dropdown + slider.
function populateControls(text) {
  const lines = text.trim().split('\n');
  const header = lines[0].split(',');
  const iSeason = header.indexOf('season');
  const iCurrent = header.indexOf('is_current');
  const iWeek = header.indexOf('season_week');

  const seasons = [];
  const weekCount = {};
  let currentSeason = null;
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    const s = f[iSeason];
    if (!seasons.includes(s)) seasons.push(s);
    weekCount[s] = Math.max(weekCount[s] || 0, Number(f[iWeek]));
    if (f[iCurrent] === '1') currentSeason = s;
  }
  currentSel.innerHTML = seasons
    .map((s) => `<option value="${s}"${s === currentSeason ? ' selected' : ''}>${s}</option>`)
    .join('');

  const def = currentSeason || seasons[seasons.length - 1];
  weeksInput.value = weekCount[def] || 7;
  weeksOut.textContent = weeksInput.value;
}

// --- render ----------------------------------------------------------------
async function render() {
  if (!shelter) return;
  updateBtn.disabled = true;
  setStatus('Computing in R…', 'busy');

  const currentSeason = currentSel.value;
  const K = Math.max(2, Math.min(30, Math.round(Number(weeksInput.value) || 2)));

  try {
    const cap = await shelter.captureR(rProgram(currentSeason, K), {
      captureGraphics: { width: 960, height: 540 },
    });
    const res = await cap.result.toJs();
    if (cap.images.length) drawImage(cap.images[0]);
    renderSummary(res);
    setStatus('R is ready', 'ready');
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + (err?.message || err), 'error');
  } finally {
    await shelter.purge();
    updateBtn.disabled = false;
  }
}

function drawImage(bitmap) {
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
}

// R list -> { name: vector }
function asObj(res) {
  const o = {};
  res.names.forEach((name, i) => {
    const v = res.values[i];
    o[name] = v && v.values !== undefined ? v.values : v;
  });
  return o;
}

const ARCH_LABEL = { early: 'early peak', late: 'late peak', slow: 'slow burn' };

function renderSummary(res) {
  const r = asObj(res);
  const current = Array.isArray(r.current) ? r.current[0] : r.current;
  const k = Array.isArray(r.k) ? r.k[0] : r.k;
  const fmt = (n) => Math.round(n).toLocaleString();

  const rows = r.season.map((s, i) => {
    const arch = r.archetype[i];
    const corr = r.corr[i];
    return `
      <tr class="${i === 0 ? 'best' : ''}">
        <td>${i + 1}</td>
        <td>${s}</td>
        <td><span class="pill pill--${arch}">${ARCH_LABEL[arch] || arch}</span></td>
        <td>ISO wk ${r.peak_iso[i]}, ~${fmt(r.peak_height[i])}</td>
        <td>${Number.isFinite(corr) ? corr.toFixed(2) : '—'}</td>
      </tr>`;
  }).join('');

  const bestSeason = r.season[0];
  const bestArch = ARCH_LABEL[r.archetype[0]] || r.archetype[0];
  const bestPeakWk = r.peak_iso[0];
  const bestPeakHt = fmt(r.peak_height[0]);

  summaryEl.innerHTML = `
    <table>
      <thead>
        <tr><th>#</th><th>Season</th><th>Shape</th><th>Its peak</th><th>Corr (first ${k} wks)</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="takeaway">
      Through <strong>${k} weeks</strong>, <strong>${current}</strong> most resembles
      <strong>${bestSeason}</strong> &mdash; a <strong>${bestArch}</strong> season.
      If it keeps tracking that one, expect the peak around <strong>ISO week ${bestPeakWk}</strong>
      (~${bestPeakHt} patients). Drag <em>weeks observed</em> to watch the closest match
      firm up as more of the season arrives.
    </div>`;
}

updateBtn.addEventListener('click', render);
currentSel.addEventListener('change', () => {
  // Reset the slider to that season's available weeks for convenience.
  render();
});
