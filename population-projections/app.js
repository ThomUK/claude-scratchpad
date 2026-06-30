import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const yearLSel = $('yearL');
const yearRSel = $('yearR');
const summaryEl = $('summary');
const canvas = $('chart');
const ctx = canvas.getContext('2d');
const groupsEl = $('groups');
const chipsEl = $('chips');
const searchEl = $('search');
const selCountEl = $('sel-count');

const setStatus = (t, k) => { statusEl.textContent = t; statusEl.className = `status status--${k}`; };

const AGES = ['0-4','5-9','10-14','15-19','20-24','25-29','30-34','35-39','40-44',
  '45-49','50-54','55-59','60-64','65-69','70-74','75-79','80-84','85-89','90+'];

const LEVELS = {
  region: { file: 'region', geo: 'regions.geojson', one: 'region', many: 'regions' },
  subicb: { file: 'subicb', geo: 'subicb.geojson',  one: 'sub-ICB', many: 'sub-ICBs' },
  la:     { file: 'la',     geo: 'la.geojson',       one: 'local authority', many: 'local authorities' },
};

// --- small CSV parser (handles quoted fields with commas) ------------------
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// --- map constants ---------------------------------------------------------
const STYLE_OFF = { color: '#4cc2ff', weight: 1.6, fillColor: '#4cc2ff', fillOpacity: 0.05 };
const STYLE_ON  = { color: '#4cc2ff', weight: 2.4, fillColor: '#4cc2ff', fillOpacity: 0.45 };

// Each level's parent level, drawn as orange outlines to show the nesting boundary.
const PARENT = { la: 'subicb', subicb: 'region', region: null };
const PARENT_STYLE = { color: '#ff7f0e', weight: 1.2, fill: false, opacity: 0.95 };
const overlayCache = {};  // parent level -> non-interactive outline layer (cached after first load)
let overlay = null;       // the overlay layer currently on the map
let mapLayer = null;      // the active clickable GeoJSON layer

// --- state -----------------------------------------------------------------
// Per-level default selection (ONS codes), shown with their group(s) open.
const DEFAULTS = {
  region: ['E12000004'],                                                  // East Midlands
  subicb: ['E38000243'],                                                  // NHS Nottingham & Nottinghamshire ICB - 52R
  la: ['E06000018', 'E07000172', 'E07000176', 'E07000173', 'E07000170'],  // Nottingham, Broxtowe, Rushcliffe, Gedling, Ashfield
};
const cache = {};                 // level -> { areas, groups, labelOf, csvText, codeSet, layer, layerByCode }
const selections = {};            // level -> Set(code)
const expanded = {};              // level -> Set(open group names)
let currentLevel = 'subicb';
const loadedLevels = new Set();   // levels whose rows have been appended into webR's combined D
let years = [];

// --- Leaflet map -----------------------------------------------------------
// L is available as a global because the Leaflet <script> runs before this module.
// maxBounds locks panning to England; fitBounds() in showMapForLevel() will refine the view.
const ENGLAND_BOUNDS = [[49.8, -6.5], [55.9, 2.2]];
const map = L.map('map', {
  scrollWheelZoom: true,
  maxBounds: ENGLAND_BOUNDS,
  maxBoundsViscosity: 1.0,  // hard stop at the boundary rather than elastic bounce
}).setView([52.5, -1.5], 6);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19,
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
}).addTo(map);

const legend = L.control({ position: 'bottomleft' });
legend.onAdd = () => L.DomUtil.create('div', 'map-legend');
legend.addTo(map);

function setLegend(level) {
  const el = document.querySelector('.map-legend'); if (!el) return;
  const parent = PARENT[level];
  el.innerHTML = `<span class="k sel"></span>selected ${esc(LEVELS[level].many)}` +
    (parent ? `<br><span class="k par"></span>${esc(LEVELS[parent].many)} boundaries` : '');
}

async function updateOverlay(level) {
  if (overlay) { map.removeLayer(overlay); overlay = null; }
  const parent = PARENT[level];
  if (!parent) return;
  if (!overlayCache[parent]) {
    try {
      const gj = JSON.parse(await fetchText(LEVELS[parent].geo));
      overlayCache[parent] = L.geoJSON(gj, { interactive: false, style: PARENT_STYLE });
    } catch (e) { console.error(e); return; }
  }
  overlay = overlayCache[parent].addTo(map);
  overlay.bringToFront();
}

// Look up the ONS code from a GeoJSON feature's properties by matching against the known codeSet.
// Codes are globally unique across levels, so we can match any property value.
const codeOf = (props, codeSet) => {
  for (const v of Object.values(props || {})) if (codeSet.has(String(v))) return String(v);
  return null;
};

async function loadGeo(level) {
  const c = cache[level];
  if (c.layer) return;  // already loaded
  const gj = JSON.parse(await fetchText(LEVELS[level].geo));
  c.layer = L.geoJSON(gj, {
    filter: (f) => codeOf(f.properties, c.codeSet) !== null,
    style: STYLE_OFF,
    onEachFeature: (f, lyr) => {
      const code = codeOf(f.properties, c.codeSet);
      c.layerByCode[code] = lyr;
      lyr.bindTooltip(c.labelOf.get(code) || code, { sticky: true, className: 'region-tooltip' });
      // Map click toggles selection exactly like a list checkbox would
      lyr.on('click', () => { sel().has(code) ? sel().delete(code) : sel().add(code); onSelectionChanged(); });
      lyr.on('mouseover', () => hover(code, true));
      lyr.on('mouseout',  () => hover(code, false));
    },
  });
}

async function showMapForLevel(level) {
  if (mapLayer) { map.removeLayer(mapLayer); mapLayer = null; }
  if (cache[level]?.layer) {
    mapLayer = cache[level].layer.addTo(map);
    // All three levels partition England, so reset to a fixed England view rather
    // than fitBounds — fitBounds picks zoom 6 which exposes Scotland/Ireland in margin.
    map.setView([52.5, -1.5], 7);
  }
  restyleMapForCurrentLevel();
  await updateOverlay(level);
  setLegend(level);
}

function restyleMapForCurrentLevel() {
  const byCode = cache[currentLevel]?.layerByCode;
  if (!byCode) return;
  const s = sel();
  for (const [code, lyr] of Object.entries(byCode)) lyr.setStyle(s.has(code) ? STYLE_ON : STYLE_OFF);
}

function hover(code, on) {
  // Keep the list row and map polygon in visual sync on hover
  const row = groupsEl.querySelector(`.area-row[data-code="${code}"]`);
  if (row) row.classList.toggle('is-hover', on);
  const lyr = cache[currentLevel]?.layerByCode?.[code];
  if (lyr) {
    if (on) { lyr.setStyle({ weight: 3, color: '#ffffff' }); lyr.bringToFront(); }
    else lyr.setStyle(sel().has(code) ? STYLE_ON : STYLE_OFF);
  }
}

// Single mutation sink: called whenever the selection changes (list or map click).
function onSelectionChanged() {
  renderPicker();
  restyleMapForCurrentLevel();
  scheduleRender();
}

// --- webR -----------------------------------------------------------------
const webR = new WebR();
let shelter;

(async function init() {
  try {
    await webR.init();
    shelter = await new webR.Shelter();
    await loadLevel(currentLevel);
    // Always pre-load region at boot: tiny (306 KB) and needed for "rest of England" in later phases
    if (currentLevel !== 'region') await loadLevel('region');
    // years are parsed once from the first level's data
    setStatus('R is ready', 'ready');
    wireEvents();
    // Load the current level's geo and put it on the map; region geo is loaded lazily on first switch
    await loadGeo(currentLevel);
    await showMapForLevel(currentLevel);
    onSelectionChanged();
  } catch (err) {
    console.error(err);
    setStatus('Failed to load. webR needs a network connection on first load.', 'error');
  }
})();

async function fetchText(name) {
  return (await fetch(`data/${name}?v=dev`, { cache: 'no-cache' })).text();
}

async function loadLevel(level) {
  const cfg = LEVELS[level];
  if (!cache[level]) {
    setStatus(`Loading ${cfg.many}…`, 'busy');
    const [areasText, dataText] = await Promise.all([
      fetchText(`${cfg.file}_areas.csv`),
      fetchText(`${cfg.file}.csv`),
    ]);
    // areas lookup -> ordered groups
    const rows = parseCSV(areasText).slice(1).filter((r) => r.length >= 3);
    const areas = rows.map(([code, label, group]) => ({ code, label, group }));
    const groupOrder = [];
    const byGroup = new Map();
    for (const a of areas) {
      if (!byGroup.has(a.group)) { byGroup.set(a.group, []); groupOrder.push(a.group); }
      byGroup.get(a.group).push(a);
    }
    const labelOf = new Map(areas.map((a) => [a.code, a.label]));
    cache[level] = {
      areas,
      groups: groupOrder.map((g) => ({ name: g, areas: byGroup.get(g) })),
      labelOf,
      csvText: dataText,
      codeSet: new Set(areas.map((a) => a.code)),  // used by codeOf() to match GeoJSON feature codes
      layer: null,       // Leaflet GeoJSON layer, populated by loadGeo()
      layerByCode: {},   // code -> Leaflet layer, populated by loadGeo()
    };

    if (!years.length) {
      const ys = new Set();
      for (const line of dataText.split('\n').slice(1)) { const c = line.indexOf(','); if (c > 0) ys.add(Number(line.slice(c + 1, line.indexOf(',', c + 1)))); }
      years = [...ys].filter(Boolean).sort((a, b) => a - b);
      populateYears();
    }
    // default selection (per level), with the group(s) containing it left open
    const def = (DEFAULTS[level] || cache[level].groups[0].areas.map((a) => a.code))
      .filter((c) => cache[level].labelOf.has(c));
    selections[level] = new Set(def);
    expanded[level] = new Set();
    for (const code of def) {
      const g = cache[level].groups.find((gr) => gr.areas.some((a) => a.code === code));
      if (g) expanded[level].add(g.name);
    }
  }
  if (!loadedLevels.has(level)) {
    // Each level gets its own named file so all levels can coexist in /tmp
    await webR.FS.writeFile(`/tmp/${level}.csv`, new TextEncoder().encode(cache[level].csvText));
    if (loadedLevels.size === 0) {
      // First level loaded: create D from scratch
      await webR.evalRVoid(`D <- read.csv("/tmp/${level}.csv", stringsAsFactors = FALSE, colClasses = c(code="character"))`);
    } else {
      // Subsequent levels: append to D so all levels' rows are always available
      await webR.evalRVoid(`D <- rbind(D, read.csv("/tmp/${level}.csv", stringsAsFactors = FALSE, colClasses = c(code="character")))`);
    }
    loadedLevels.add(level);
  }
}

function populateYears() {
  const opts = years.map((y) => `<option>${y}</option>`).join('');
  yearLSel.innerHTML = opts; yearRSel.innerHTML = opts;
  yearLSel.value = String(years.includes(2026) ? 2026 : years[0]);
  yearRSel.value = String(years.includes(2036) ? 2036 : years[years.length - 1]);
}

// --- events ----------------------------------------------------------------
function wireEvents() {
  $('level').addEventListener('click', async (e) => {
    const btn = e.target.closest('.seg-btn'); if (!btn) return;
    const level = btn.dataset.level; if (level === currentLevel) return;
    document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
    currentLevel = level;
    searchEl.value = '';
    await loadLevel(level);
    // Lazy-load this level's geo on first switch; then swap the map layer
    await loadGeo(level);
    await showMapForLevel(level);
    onSelectionChanged();
  });

  [yearLSel, yearRSel].forEach((el) => el.addEventListener('change', scheduleRender));
  // Search only needs a picker re-render; it doesn't change the selection or need an R draw
  searchEl.addEventListener('input', renderPicker);
  $('clear-all').addEventListener('click', () => { sel().clear(); onSelectionChanged(); });

  groupsEl.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.code) { t.checked ? sel().add(t.dataset.code) : sel().delete(t.dataset.code); onSelectionChanged(); }
    else if (t.dataset.group) {
      const grp = cache[currentLevel].groups.find((g) => g.name === t.dataset.group);
      grp.areas.forEach((a) => (t.checked ? sel().add(a.code) : sel().delete(a.code)));
      onSelectionChanged();
    }
  });
  groupsEl.addEventListener('click', (e) => {
    if (e.target.matches('input')) return;
    const head = e.target.closest('.group-head'); if (!head) return;
    const name = head.querySelector('input[data-group]').dataset.group;
    const exp = expanded[currentLevel];
    exp.has(name) ? exp.delete(name) : exp.add(name);
    // Group expand/collapse only needs a DOM update; no selection change, no R draw
    renderPicker();
  });
  // Hover over a list row → highlight the matching polygon, and vice versa
  groupsEl.addEventListener('mouseover', (e) => { const r = e.target.closest('.area-row'); if (r) hover(r.dataset.code, true); });
  groupsEl.addEventListener('mouseout',  (e) => { const r = e.target.closest('.area-row'); if (r) hover(r.dataset.code, false); });
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-code]'); if (!b) return;
    sel().delete(b.dataset.code); onSelectionChanged();
  });
}

const sel = () => selections[currentLevel];

// --- picker rendering ------------------------------------------------------
function renderPicker() {
  const { groups, labelOf } = cache[currentLevel];
  const q = searchEl.value.trim().toLowerCase();
  const s = sel();

  // chips (cap displayed)
  const selCodes = [...s];
  const CAP = 14;
  chipsEl.innerHTML = selCodes.slice(0, CAP).map((code) =>
    `<span class="chip">${esc(labelOf.get(code) || code)}<button data-code="${code}" title="remove">×</button></span>`
  ).join('') + (selCodes.length > CAP ? `<span class="chip more">+${selCodes.length - CAP} more</span>` : '');
  selCountEl.textContent = selCodes.length ? `· ${selCodes.length} selected` : '· none selected';

  // groups
  let html = '';
  for (const g of groups) {
    const matched = q ? g.areas.filter((a) => a.label.toLowerCase().includes(q)) : g.areas;
    if (!matched.length) continue;
    const selN = g.areas.filter((a) => s.has(a.code)).length;
    const open = q ? true : expanded[currentLevel].has(g.name); // expand on search or if opened
    html += `<div class="group${open ? ' open' : ''}">
      <div class="group-head">
        <input type="checkbox" data-group="${esc(g.name)}" ${selN === g.areas.length ? 'checked' : ''} />
        <span class="chev">▸</span><span>${esc(g.name)}</span>
        <span class="count">${selN}/${g.areas.length}</span>
      </div>
      <div class="group-body">${matched.map((a) =>
        `<div class="area-row" data-code="${a.code}"><input type="checkbox" id="c_${a.code}" data-code="${a.code}" ${s.has(a.code) ? 'checked' : ''} /><label for="c_${a.code}">${esc(a.label)}</label></div>`
      ).join('')}</div>
    </div>`;
  }
  groupsEl.innerHTML = html || '<div class="empty">No areas match your search.</div>';

  // indeterminate state for partially-selected groups
  groupsEl.querySelectorAll('input[data-group]').forEach((cb) => {
    const g = groups.find((x) => x.name === cb.dataset.group);
    const n = g.areas.filter((a) => s.has(a.code)).length;
    cb.indeterminate = n > 0 && n < g.areas.length;
  });
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// CSS: open groups show their body
const style = document.createElement('style');
style.textContent = '.group-body{display:none}.group.open .group-body{display:block}.group.open .chev{transform:rotate(90deg);display:inline-block}';
document.head.appendChild(style);

// --- chart rendering -------------------------------------------------------
let renderTimer = null, rendering = false, pending = false;
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 350); }

function titleArea() {
  const s = sel(); const { labelOf, areas } = cache[currentLevel]; const cfg = LEVELS[currentLevel];
  if (s.size === 0) return '—';
  if (s.size === 1) return labelOf.get([...s][0]);
  if (currentLevel === 'region' && s.size === areas.length) return 'England';
  return `${s.size} ${cfg.many}`;
}

async function render() {
  if (!shelter) return;
  if (rendering) { pending = true; return; }
  const s = sel();
  if (s.size === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    summaryEl.innerHTML = '<p class="hint">Select one or more areas to draw the pyramids.</p>';
    return;
  }
  rendering = true;
  setStatus('Rendering in R…', 'busy');
  const yL = Number(yearLSel.value), yR = Number(yearRSel.value);
  try {
    const cap = await shelter.captureR(rProgram([...s], yL, yR, titleArea()), {
      captureGraphics: { width: 1000, height: 800 },
    });
    const res = await cap.result.toJs();
    const v = {};
    res.names.forEach((name, i) => { const x = res.values[i]; v[name] = x.values.length === 1 ? x.values[0] : x.values; });
    if (cap.images.length) drawImage(cap.images[0]);
    renderSummary(v, titleArea(), yL, yR);
    setStatus('R is ready', 'ready');
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + (err?.message || err), 'error');
  } finally {
    await shelter.purge();
    rendering = false;
    if (pending) { pending = false; render(); }
  }
}

function drawImage(bitmap) {
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
}

// --- R program -------------------------------------------------------------
function rProgram(codes, yearL, yearR, areaTitle) {
  return `
    sel <- c(${codes.map((c) => JSON.stringify(c)).join(',')})
    yL <- ${yearL}; yR <- ${yearR}; areaTitle <- ${JSON.stringify(areaTitle)}
    ages <- c(${AGES.map((a) => JSON.stringify(a)).join(',')})
    male_col <- "#3182bd"; female_col <- "#dd3497"

    sub <- D[D$code %in% sel, ]
    getv <- function(yr, sx) {
      x <- sub[sub$year == yr & sub$sex == sx, ]
      v <- tapply(x$population, factor(x$age_group, levels = ages), sum)
      v <- as.numeric(v); v[is.na(v)] <- 0; v
    }
    mL <- getv(yL,"male"); fL <- getv(yL,"female")
    mR <- getv(yR,"male"); fR <- getv(yR,"female")
    xmax <- max(mL, fL, mR, fR, 1)
    fmt <- function(z) if (xmax >= 1e6) paste0(round(z/1e6, 1), "m") else if (xmax >= 1e4) paste0(round(z/1e3), "k") else as.character(round(z))

    pyramid <- function(m, f, title, show_ages, cm = NULL, cf = NULL) {
      nm <- if (show_ages) ages else rep("", length(ages))
      par(mar = c(3.6, if (show_ages) 4.2 else 1.2, 2.6, 1))
      xl <- c(-xmax, xmax) * 1.2
      b <- barplot(-m, horiz = TRUE, names.arg = nm, las = 1, xlim = xl,
                   col = male_col, border = NA, xaxt = "n", cex.names = 0.8)
      barplot(f, horiz = TRUE, add = TRUE, col = female_col, border = NA, xaxt = "n")
      if (!is.null(cm)) {
        # draw the comparison-year outline with rect() so the dotted lty renders
        # (barplot ignores lty for its bars, which is why it looked solid)
        hh <- 0.42
        rect(0, b - hh, -cm, b + hh, col = NA, border = "grey20", lty = 3, lwd = 1.6)
        rect(0, b - hh, cf,  b + hh, col = NA, border = "grey20", lty = 3, lwd = 1.6)
      }
      at <- pretty(c(0, xmax), 4); at <- at[at <= xmax]
      axis(1, at = c(-rev(at), at), labels = fmt(abs(c(-rev(at), at))), cex.axis = 0.8)
      title(main = title, line = 1); abline(v = 0, col = "white", lwd = 1.5)
      tot <- sum(m) + sum(f)
      if (tot > 0) {
        text(-m, b, labels = sprintf("%.1f%%", 100 * m / tot), pos = 2, offset = 0.2, cex = 0.56, col = "grey25")
        text( f, b, labels = sprintf("%.1f%%", 100 * f / tot), pos = 4, offset = 0.2, cex = 0.56, col = "grey25")
      }
    }

    changeplot <- function(v, title, pct, show_ages) {
      nm <- if (show_ages) ages else rep("", length(ages))
      par(mar = c(3.6, if (show_ages) 4.2 else 1.2, 2.6, 1))
      M <- rbind(female = v$f, male = v$m)
      rng <- max(abs(M)) * 1.04; if (!is.finite(rng) || rng == 0) rng <- 1
      barplot(M, beside = TRUE, horiz = TRUE, names.arg = nm, las = 1,
              col = c(female_col, male_col), border = NA, xlim = c(-rng, rng), xaxt = "n", cex.names = 0.8)
      at <- pretty(c(-rng, rng), 5)
      axis(1, at = at, labels = if (pct) paste0(round(at), "%") else fmt(at), cex.axis = 0.8)
      title(main = title, line = 1); abline(v = 0, col = "grey40")
    }

    layout(matrix(c(1,2,3,4), nrow = 2, byrow = TRUE), heights = c(1.18, 1))
    pyramid(mL, fL, paste0(areaTitle, " — ", yL), TRUE)
    pyramid(mR, fR, paste0(areaTitle, " — ", yR), FALSE, cm = mL, cf = fL)
    legend("topright", bty = "n", inset = 0.01,
           legend = c("male", "female", paste0(yL, " (outline)")),
           pch = c(15, 15, NA), lty = c(NA, NA, 3), lwd = c(NA, NA, 1.2),
           col = c(male_col, female_col, "grey25"), pt.cex = 1.2, cex = 0.82)

    absM <- mR - mL; absF <- fR - fL
    pctM <- ifelse(mL > 0, 100 * (mR - mL) / mL, 0); pctF <- ifelse(fL > 0, 100 * (fR - fL) / fL, 0)
    changeplot(list(m = absM, f = absF), paste0("Absolute change, ", yL, " → ", yR), FALSE, TRUE)
    changeplot(list(m = pctM, f = pctF), paste0("% change, ", yL, " → ", yR), TRUE, FALSE)

    totL <- sum(mL, fL); totR <- sum(mR, fR)
    old <- ages %in% c("65-69","70-74","75-79","80-84","85-89","90+")
    young <- ages %in% c("0-4","5-9","10-14")
    sh <- function(m,f,idx) 100 * sum((m+f)[idx]) / sum(m+f)
    list(
      totL = totL, totR = totR, growth = 100 * (totR/totL - 1),
      old_L = sh(mL,fL,old), old_R = sh(mR,fR,old),
      young_L = sh(mL,fL,young), young_R = sh(mR,fR,young),
      biggest = ages[which.max(absM + absF)]
    )
  `;
}

function renderSummary(v, area, yL, yR) {
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
      <strong>${esc(area)}</strong> is projected to go from <strong>${n(v.totL)}</strong> people in ${yL}
      to <strong>${n(v.totR)}</strong> in ${yR} (<strong>${sign(v.growth)}${v.growth.toFixed(1)}%</strong>).
      The share aged 65+ moves from <strong>${v.old_L.toFixed(1)}%</strong> to
      <strong>${v.old_R.toFixed(1)}%</strong>; under-15s go ${v.young_L.toFixed(1)}% → ${v.young_R.toFixed(1)}%.
      The biggest absolute change is in the <strong>${v.biggest}</strong> band. The right pyramid's dotted
      outline is ${yL}, so the gap to the filled bars shows the shift.
    </div>`;
}
