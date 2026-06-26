import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const updateBtn = $('update');
const regionSel = $('region');
const yearLSel = $('yearL');
const yearRSel = $('yearR');
const summaryEl = $('summary');
const canvas = $('chart');
const ctx = canvas.getContext('2d');

const setStatus = (t, k) => { statusEl.textContent = t; statusEl.className = `status status--${k}`; };

const AGES = ['0-4','5-9','10-14','15-19','20-24','25-29','30-34','35-39','40-44',
  '45-49','50-54','55-59','60-64','65-69','70-74','75-79','80-84','85-89','90+'];

// --- R program -------------------------------------------------------------
// D (the full tidy data frame) is loaded once into the global env at init.
function rProgram(region, yearL, yearR) {
  return `
    region <- ${JSON.stringify(region)}; yL <- ${yearL}; yR <- ${yearR}
    ages <- c(${AGES.map((a) => JSON.stringify(a)).join(',')})
    male_col <- "#3182bd"; female_col <- "#dd3497"

    sub <- D[D$region == region, ]
    getv <- function(yr, sx) {
      x <- sub[sub$year == yr & sub$sex == sx, ]
      v <- x$population[match(ages, x$age_group)]; v[is.na(v)] <- 0; v
    }
    mL <- getv(yL,"male"); fL <- getv(yL,"female")
    mR <- getv(yR,"male"); fR <- getv(yR,"female")
    xmax <- max(mL, fL, mR, fR)

    # axis formatting (k / m)
    fmt <- function(z) if (xmax >= 1e6) paste0(round(z/1e6, 1), "m") else paste0(round(z/1e3), "k")

    pyramid <- function(m, f, title, show_ages, cm = NULL, cf = NULL) {
      nm <- if (show_ages) ages else rep("", length(ages))
      par(mar = c(3.6, if (show_ages) 4.2 else 1.2, 2.6, 1))
      xl <- c(-xmax, xmax) * 1.2                     # headroom for outside labels
      b <- barplot(-m, horiz = TRUE, names.arg = nm, las = 1, xlim = xl,
                   col = male_col, border = NA, xaxt = "n", cex.names = 0.8)
      barplot(f, horiz = TRUE, add = TRUE, col = female_col, border = NA, xaxt = "n")
      # dotted outline of the comparison (other) year, if supplied
      if (!is.null(cm)) {
        barplot(-cm, horiz = TRUE, add = TRUE, col = NA, border = "grey25", lwd = 1.2, lty = 3, xaxt = "n")
        barplot(cf,  horiz = TRUE, add = TRUE, col = NA, border = "grey25", lwd = 1.2, lty = 3, xaxt = "n")
      }
      at <- pretty(c(0, xmax), 4); at <- at[at <= xmax]
      ticks <- c(-rev(at), at)
      axis(1, at = ticks, labels = fmt(abs(ticks)), cex.axis = 0.8)
      title(main = title, line = 1)
      abline(v = 0, col = "white", lwd = 1.5)
      # percentage-of-total label outside each bar
      tot <- sum(m) + sum(f)
      if (tot > 0) {
        text(-m, b, labels = sprintf("%.1f%%", 100 * m / tot), pos = 2, offset = 0.2, cex = 0.56, col = "grey25")
        text( f, b, labels = sprintf("%.1f%%", 100 * f / tot), pos = 4, offset = 0.2, cex = 0.56, col = "grey25")
      }
    }

    changeplot <- function(vM, vR_minus, title, pct, show_ages) {
      nm <- if (show_ages) ages else rep("", length(ages))
      par(mar = c(3.6, if (show_ages) 4.2 else 1.2, 2.6, 1))
      M <- rbind(female = vR_minus$f, male = vR_minus$m)   # drawn bottom-up
      rng <- max(abs(M)) * 1.04; if (rng == 0) rng <- 1
      barplot(M, beside = TRUE, horiz = TRUE, names.arg = nm, las = 1,
              col = c(female_col, male_col), border = NA, xlim = c(-rng, rng),
              xaxt = "n", cex.names = 0.8)
      at <- pretty(c(-rng, rng), 5)
      lab <- if (pct) paste0(round(at), "%") else fmt(at)
      axis(1, at = at, labels = lab, cex.axis = 0.8)
      title(main = title, line = 1)
      abline(v = 0, col = "grey40")
    }

    layout(matrix(c(1,2,3,4), nrow = 2, byrow = TRUE), heights = c(1.18, 1))
    pyramid(mL, fL, paste0(region, " — ", yL), TRUE)
    pyramid(mR, fR, paste0(region, " — ", yR), FALSE, cm = mL, cf = fL)   # outline = left year
    legend("topright", bty = "n", inset = 0.01,
           legend = c("male", "female", paste0(yL, " (outline)")),
           pch = c(15, 15, NA), lty = c(NA, NA, 3), lwd = c(NA, NA, 1.2),
           col = c(male_col, female_col, "grey25"), pt.cex = 1.2, cex = 0.82)

    absM <- mR - mL; absF <- fR - fL
    pctM <- ifelse(mL > 0, 100 * (mR - mL) / mL, 0)
    pctF <- ifelse(fL > 0, 100 * (fR - fL) / fL, 0)
    changeplot(NULL, list(m = absM, f = absF), paste0("Absolute change, ", yL, " → ", yR), FALSE, TRUE)
    changeplot(NULL, list(m = pctM, f = pctF), paste0("% change, ", yL, " → ", yR), TRUE, FALSE)

    totL <- sum(mL, fL); totR <- sum(mR, fR)
    old <- ages %in% c("65-69","70-74","75-79","80-84","85-89","90+")
    young <- ages %in% c("0-4","5-9","10-14")
    share_old <- function(m,f) 100 * sum((m+f)[old]) / sum(m+f)
    share_young <- function(m,f) 100 * sum((m+f)[young]) / sum(m+f)
    biggest <- ages[which.max(absM + absF)]
    fastest <- ages[which.max((pctM*mL + pctF*fL) / pmax(mL+fL,1))]

    list(
      totL = totL, totR = totR, growth = 100 * (totR/totL - 1),
      old_L = share_old(mL,fL), old_R = share_old(mR,fR),
      young_L = share_young(mL,fL), young_R = share_young(mR,fR),
      biggest = biggest, fastest = fastest
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

    const text = await (await fetch('data/population.csv?v=1', { cache: 'no-cache' })).text();
    await webR.FS.writeFile('/tmp/pop.csv', new TextEncoder().encode(text));
    await webR.evalRVoid('D <- read.csv("/tmp/pop.csv", stringsAsFactors = FALSE)');
    populateControls(text);

    setStatus('R is ready', 'ready');
    updateBtn.disabled = false;
    render();
  } catch (err) {
    console.error(err);
    setStatus('Failed to load. webR needs a network connection on first load.', 'error');
  }
})();

function populateControls(text) {
  const lines = text.trim().split('\n');
  const h = lines[0].split(',');
  const iR = h.indexOf('region'), iY = h.indexOf('year');
  const regions = [], years = new Set();
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    if (!regions.includes(f[iR])) regions.push(f[iR]);
    years.add(Number(f[iY]));
  }
  const yearList = [...years].sort((a, b) => a - b);
  regionSel.innerHTML = regions.map((r) => `<option${r === 'England' ? ' selected' : ''}>${r}</option>`).join('');
  const opt = (sel) => yearList.map((y) => `<option>${y}</option>`).join('');
  yearLSel.innerHTML = opt(); yearRSel.innerHTML = opt();
  yearLSel.value = String(yearList.includes(2026) ? 2026 : yearList[0]);
  yearRSel.value = String(yearList.includes(2036) ? 2036 : yearList[yearList.length - 1]);
}

async function render() {
  if (!shelter) return;
  updateBtn.disabled = true;
  setStatus('Rendering in R…', 'busy');
  const region = regionSel.value;
  const yL = Number(yearLSel.value), yR = Number(yearRSel.value);
  try {
    const cap = await shelter.captureR(rProgram(region, yL, yR), {
      captureGraphics: { width: 1000, height: 800 },
    });
    const res = await cap.result.toJs();
    const v = {};
    res.names.forEach((name, i) => {
      const x = res.values[i];
      v[name] = x.values.length === 1 ? x.values[0] : x.values;
    });
    if (cap.images.length) drawImage(cap.images[0]);
    renderSummary(v, region, yL, yR);
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

function renderSummary(v, region, yL, yR) {
  const n = (x) => Math.round(x).toLocaleString();
  const sign = (x) => (x >= 0 ? '+' : '');
  const growthCls = v.growth >= 0 ? 'stat--growth' : 'stat--shrink';

  summaryEl.innerHTML = `
    <div class="cards">
      <div class="stat"><div class="v">${n(v.totL)}</div><div class="l">Total population, ${yL}</div></div>
      <div class="stat"><div class="v">${n(v.totR)}</div><div class="l">Total population, ${yR}</div></div>
      <div class="stat ${growthCls}"><div class="v">${sign(v.growth)}${v.growth.toFixed(1)}%</div><div class="l">Overall change</div></div>
      <div class="stat"><div class="v">${v.old_L.toFixed(1)}% → ${v.old_R.toFixed(1)}%</div><div class="l">Aged 65+ share</div></div>
    </div>
    <div class="takeaway">
      <strong>${region}</strong> is projected to go from <strong>${n(v.totL)}</strong> people in ${yL}
      to <strong>${n(v.totR)}</strong> in ${yR} (<strong>${sign(v.growth)}${v.growth.toFixed(1)}%</strong>).
      The share aged 65+ moves from <strong>${v.old_L.toFixed(1)}%</strong> to
      <strong>${v.old_R.toFixed(1)}%</strong>, while the under-15 share goes
      ${v.young_L.toFixed(1)}% → ${v.young_R.toFixed(1)}%. The biggest absolute change is in the
      <strong>${v.biggest}</strong> band. The pyramids show the shape; the panels below show where
      the people are gained and lost, by age and sex.
    </div>`;
}

updateBtn.addEventListener('click', render);
[regionSel, yearLSel, yearRSel].forEach((el) => el.addEventListener('change', render));
