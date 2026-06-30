import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';

const $ = (id) => document.getElementById(id);
const statusEl   = $('status');
const yearLSel   = $('yearL');
const yearRSel   = $('yearR');
const summaryEl  = $('summary');
const canvas     = $('chart');
const ctx        = canvas.getContext('2d');
const groupsEl   = $('groups');
const chipsEl    = $('chips');
const searchEl   = $('search');
const selCountEl = $('sel-count');
const listTitleEl  = $('list-title');
// Controls that change shape between time mode (two years) and compare mode (one year + normalise)
const yearRFieldEl = $('yearR-field');
const normFieldEl  = $('normalise-field');
const yearLLabelEl = $('yearL-label');

const setStatus = (t, k) => { statusEl.textContent = t; statusEl.className = `status status--${k}`; };

const AGES = ['0-4','5-9','10-14','15-19','20-24','25-29','30-34','35-39','40-44',
  '45-49','50-54','55-59','60-64','65-69','70-74','75-79','80-84','85-89','90+'];

const LEVELS = {
  region: { file: 'region', geo: 'regions.geojson', one: 'region',    many: 'regions'           },
  subicb: { file: 'subicb', geo: 'subicb.geojson',  one: 'sub-ICB',   many: 'sub-ICBs'          },
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
// Unselected polygons use Positron's land colour so England reads as light against the dark sea background.
const STYLE_OFF  = { color: '#4cc2ff', weight: 1.6, fillColor: '#f0f0ea', fillOpacity: 0.92 };
// Separate ON styles for each comparison bucket so both can be visible simultaneously.
const STYLE_ON_A = { color: '#4cc2ff', weight: 2.8, fillColor: '#4cc2ff', fillOpacity: 0.55 };
const STYLE_ON_B = { color: '#d29922', weight: 2.8, fillColor: '#d29922', fillOpacity: 0.55 };
const STYLE_ON   = STYLE_ON_A; // alias used in single (non-compare) mode

// Each level's parent level, drawn as orange outlines to show the nesting boundary.
const PARENT = { la: 'subicb', subicb: 'region', region: null };
const PARENT_STYLE = { color: '#ff7f0e', weight: 1.2, fill: false, opacity: 0.95 };
const overlayCache = {};  // parent level -> non-interactive outline layer (cached after first load)
let overlay  = null;      // the overlay layer currently on the map
let mapLayer = null;      // the active clickable GeoJSON layer

// --- state -----------------------------------------------------------------
// Per-level default selection (ONS codes), shown with their group(s) open.
const DEFAULTS = {
  region: ['E12000004'],
  subicb: ['E38000243'],
  la: ['E06000018', 'E07000172', 'E07000176', 'E07000173', 'E07000170'],
};
const cache      = {};  // level -> { areas, groups, labelOf, csvText, codeSet, layer, layerByCode }
const selections = {};  // level -> Set(code) — used in single mode
const expanded   = {};  // level -> Set(open group names)
let currentLevel = 'subicb';
const loadedLevels = new Set();  // levels whose rows have been appended into webR's combined D
let years = [];

// --- compare mode state ----------------------------------------------------
let compareMode  = false;
let normalise    = 'percent';  // 'percent' (share of own total) | 'absolute'
let activeBucket = 'A';
// Each bucket is locked to one level; A.level and B.level may differ.
// Codes are initialised when compare mode is first entered; they're empty until then.
const buckets = {
  A: { level: 'subicb', codes: new Set(), rest: false },
  B: { level: 'subicb', codes: new Set(), rest: true  },
};

// Derive the correct style for a map polygon based on current mode and bucket membership.
function styleForCode(code) {
  if (!compareMode) return sel().has(code) ? STYLE_ON : STYLE_OFF;
  const inA = buckets.A.level === currentLevel && buckets.A.codes.has(code);
  // B's codes only shown on map when B is NOT in "rest" mode
  const inB = !buckets.B.rest && buckets.B.level === currentLevel && buckets.B.codes.has(code);
  // Active bucket takes visual priority when a code is in both
  if (activeBucket === 'A') {
    if (inA) return STYLE_ON_A;
    if (inB) return STYLE_ON_B;
  } else {
    if (inB) return STYLE_ON_B;
    if (inA) return STYLE_ON_A;
  }
  return STYLE_OFF;
}

// --- Leaflet map -----------------------------------------------------------
// L is available as a global because the Leaflet <script> runs before this module.
const ENGLAND_BOUNDS = [[49.8, -6.5], [55.9, 2.2]];
// No tile layer — polygons float on the page background colour for a cutout effect.
const map = L.map('map', {
  scrollWheelZoom: false,
  dragging: false,
  doubleClickZoom: false,
  touchZoom: false,
  zoomControl: false,
  attributionControl: false,
  maxBounds: ENGLAND_BOUNDS,
  maxBoundsViscosity: 1.0,
}).setView([52.0, -1.5], 6);

const legend = L.control({ position: 'bottomleft' });
legend.onAdd = () => L.DomUtil.create('div', 'map-legend');
legend.addTo(map);

function setLegend(level) {
  const el = document.querySelector('.map-legend'); if (!el) return;
  const parent = PARENT[level];
  let html = '';
  if (compareMode) {
    html += `<span class="k sel-a"></span>Bucket A &nbsp;<span class="k sel-b"></span>Bucket B`;
  } else {
    html += `<span class="k sel"></span>selected ${esc(LEVELS[level].many)}`;
  }
  if (parent) html += `<br><span class="k par"></span>${esc(LEVELS[parent].many)} boundaries`;
  el.innerHTML = html;
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
      lyr.on('click', () => {
        // When B is in rest-of-England mode, the picker is locked — user must uncheck "B = rest" first
        if (compareMode && activeBucket === 'B' && buckets.B.rest) return;
        sel().has(code) ? sel().delete(code) : sel().add(code);
        onSelectionChanged();
      });
      lyr.on('mouseover', () => hover(code, true));
      lyr.on('mouseout',  () => hover(code, false));
    },
  });
}

async function showMapForLevel(level) {
  if (mapLayer) { map.removeLayer(mapLayer); mapLayer = null; }
  if (cache[level]?.layer) {
    mapLayer = cache[level].layer.addTo(map);
    // Zoom 6 fits England in the 420px panel; shifted south to pull Cornwall into view
    map.setView([52.0, -1.5], 6);
  }
  restyleMapForCurrentLevel();
  await updateOverlay(level);
  setLegend(level);
}

function restyleMapForCurrentLevel() {
  const byCode = cache[currentLevel]?.layerByCode;
  if (!byCode) return;
  for (const [code, lyr] of Object.entries(byCode)) lyr.setStyle(styleForCode(code));
}

function hover(code, on) {
  // Keep the list row and map polygon in visual sync on hover
  const row = groupsEl.querySelector(`.area-row[data-code="${code}"]`);
  if (row) row.classList.toggle('is-hover', on);
  const lyr = cache[currentLevel]?.layerByCode?.[code];
  if (lyr) {
    if (on) { lyr.setStyle({ weight: 3, color: '#ffffff' }); lyr.bringToFront(); }
    else lyr.setStyle(styleForCode(code));
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
    // Pre-load region at boot: tiny (306 KB) and needed for "rest of England" in later phases
    if (currentLevel !== 'region') await loadLevel('region');
    setStatus('R is ready', 'ready');
    wireEvents();
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
      codeSet: new Set(areas.map((a) => a.code)),
      layer: null,
      layerByCode: {},
    };

    if (!years.length) {
      const ys = new Set();
      for (const line of dataText.split('\n').slice(1)) { const c = line.indexOf(','); if (c > 0) ys.add(Number(line.slice(c + 1, line.indexOf(',', c + 1)))); }
      years = [...ys].filter(Boolean).sort((a, b) => a - b);
      populateYears();
    }
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
    await webR.FS.writeFile(`/tmp/${level}.csv`, new TextEncoder().encode(cache[level].csvText));
    if (loadedLevels.size === 0) {
      await webR.evalRVoid(`D <- read.csv("/tmp/${level}.csv", stringsAsFactors = FALSE, colClasses = c(code="character"))`);
    } else {
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

// --- compare mode entry/exit -----------------------------------------------

function enterCompareMode() {
  compareMode  = true;
  activeBucket = 'A';
  // Seed bucket A from whatever is currently selected in single mode
  buckets.A.level = currentLevel;
  buckets.A.codes = new Set(selections[currentLevel]);
  buckets.A.rest  = false;
  // Bucket B starts at the same level in rest-of-England mode
  buckets.B.level = currentLevel;
  buckets.B.codes = new Set();
  buckets.B.rest  = true;
  // Reset the A|B toggle to A
  document.querySelectorAll('#bucket-seg [data-bucket]').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.bucket === 'A'));
  $('compare-bar').hidden = false;
  $('compare-toggle').classList.add('is-active');
  // Swap year controls: collapse to single-year picker and reveal the normalise toggle
  yearRFieldEl.hidden = true;
  normFieldEl.hidden  = false;
  yearLLabelEl.textContent = 'Year';
  // Always enter compare mode with Share as the default — reset both state and button
  normalise = 'percent';
  document.querySelectorAll('#normalise [data-norm]').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.norm === 'percent'));
  syncBRestCheckbox();
  setLegend(currentLevel);
  onSelectionChanged();
}

async function exitCompareMode() {
  compareMode = false;
  $('compare-bar').hidden = true;
  $('compare-toggle').classList.remove('is-active');
  // Restore two-year layout for time mode
  yearRFieldEl.hidden = false;
  normFieldEl.hidden  = true;
  yearLLabelEl.textContent = 'Left pyramid year';
  // If B was active at a different level, snap back to A's level
  const targetLevel = buckets.A.level;
  if (targetLevel !== currentLevel) {
    currentLevel = targetLevel;
    document.querySelectorAll('#level [data-level]').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.level === currentLevel));
    await showMapForLevel(currentLevel);
  }
  setLegend(currentLevel);
  onSelectionChanged();
}

async function setActiveBucket(b) {
  if (activeBucket === b) return;
  activeBucket = b;
  searchEl.value = '';
  const targetLevel = buckets[b].level;
  if (targetLevel !== currentLevel) {
    currentLevel = targetLevel;
    // Keep the geography segmented control in sync with the newly active bucket's level
    document.querySelectorAll('#level [data-level]').forEach((btn) =>
      btn.classList.toggle('is-active', btn.dataset.level === currentLevel));
    await loadLevel(currentLevel);
    await loadGeo(currentLevel);
    await showMapForLevel(currentLevel);
  } else {
    restyleMapForCurrentLevel();
  }
  syncBRestCheckbox();
  onSelectionChanged();
}

// Grey out the groups list when B is active and locked to "rest of England".
function syncBRestCheckbox() {
  const cb = $('b-rest');
  if (!cb) return;
  cb.checked = buckets.B.rest;
  const locked = compareMode && activeBucket === 'B' && buckets.B.rest;
  groupsEl.style.opacity       = locked ? '0.35' : '';
  groupsEl.style.pointerEvents = locked ? 'none'  : '';
}

// --- events ----------------------------------------------------------------
function wireEvents() {
  // Geography level switcher — in compare mode this changes the active bucket's level
  $('level').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-level]'); if (!btn) return;
    const level = btn.dataset.level; if (level === currentLevel) return;
    // Only update the geography control buttons (not the bucket-seg buttons)
    document.querySelectorAll('#level [data-level]').forEach((b) =>
      b.classList.toggle('is-active', b === btn));
    if (compareMode) {
      // Lock the active bucket to the new level and clear its codes
      buckets[activeBucket].level = level;
      buckets[activeBucket].codes.clear();
      // Changing level explicitly means "pick manually", so clear rest if B
      if (activeBucket === 'B') { buckets.B.rest = false; syncBRestCheckbox(); }
    }
    currentLevel = level;
    searchEl.value = '';
    await loadLevel(level);
    await loadGeo(level);
    await showMapForLevel(level);
    onSelectionChanged();
  });

  // Compare mode toggle
  $('compare-toggle').addEventListener('click', async () => {
    if (compareMode) await exitCompareMode(); else enterCompareMode();
  });

  // A / B bucket switcher
  $('bucket-seg').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-bucket]'); if (!btn) return;
    document.querySelectorAll('#bucket-seg [data-bucket]').forEach((x) =>
      x.classList.toggle('is-active', x === btn));
    await setActiveBucket(btn.dataset.bucket);
  });

  // "B = rest of England" checkbox
  $('b-rest').addEventListener('change', (e) => {
    buckets.B.rest = e.target.checked;
    syncBRestCheckbox();
    setLegend(currentLevel);
    onSelectionChanged();
  });

  // Share/Absolute toggle — mirrors the #level segmented control pattern
  $('normalise').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-norm]'); if (!btn) return;
    document.querySelectorAll('#normalise [data-norm]').forEach((b) =>
      b.classList.toggle('is-active', b === btn));
    normalise = btn.dataset.norm;
    scheduleRender();
  });

  [yearLSel, yearRSel].forEach((el) => el.addEventListener('change', scheduleRender));
  searchEl.addEventListener('input', renderPicker);
  $('clear-all').addEventListener('click', () => { sel().clear(); onSelectionChanged(); });

  groupsEl.addEventListener('change', (e) => {
    // Lock the picker when B is active in rest-of-England mode
    if (compareMode && activeBucket === 'B' && buckets.B.rest) return;
    const t = e.target;
    if (t.dataset.code) {
      t.checked ? sel().add(t.dataset.code) : sel().delete(t.dataset.code);
      onSelectionChanged();
    } else if (t.dataset.group) {
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
    renderPicker();
  });
  groupsEl.addEventListener('mouseover', (e) => { const r = e.target.closest('.area-row'); if (r) hover(r.dataset.code, true); });
  groupsEl.addEventListener('mouseout',  (e) => { const r = e.target.closest('.area-row'); if (r) hover(r.dataset.code, false); });

  chipsEl.addEventListener('click', (e) => {
    // Clicking the × on a "B = rest of England" chip unsets rest mode
    if (e.target.closest('button[data-rest]')) {
      buckets.B.rest = false;
      syncBRestCheckbox();
      setLegend(currentLevel);
      onSelectionChanged();
      return;
    }
    const b = e.target.closest('button[data-code]'); if (!b) return;
    if (compareMode) {
      // Each chip carries its bucket so removing from chips always hits the right Set
      const bkt = b.dataset.bucket || activeBucket;
      buckets[bkt].codes.delete(b.dataset.code);
    } else {
      sel().delete(b.dataset.code);
    }
    onSelectionChanged();
  });
}

// In single mode: the active selection. In compare mode: the active bucket's codes.
const sel = () => compareMode ? buckets[activeBucket].codes : selections[currentLevel];

// --- picker rendering ------------------------------------------------------
function renderPicker() {
  const { groups, labelOf } = cache[currentLevel];
  const q = searchEl.value.trim().toLowerCase();
  const s = sel();

  // Update the list-panel heading to reflect mode / active bucket
  if (listTitleEl) {
    if (compareMode) {
      const col = activeBucket === 'A' ? 'var(--accent)' : 'var(--warn)';
      listTitleEl.innerHTML = `Bucket <span style="color:${col};font-weight:700">${activeBucket}</span>`;
    } else {
      listTitleEl.textContent = 'Areas';
    }
  }

  // Chips — two separate bucket rows in compare mode, single row in single mode
  if (compareMode) {
    chipsEl.classList.add('chips--compare');
    const CAP = 7;

    const bucketRow = (bkt, tag) => {
      const b      = buckets[bkt];
      const bCache = cache[b.level];
      let html = `<div class="bucket-chips"><span class="bucket-tag bucket-tag--${tag}">${bkt}</span>`;
      if (bkt === 'B' && b.rest) {
        html += `<span class="chip chip--b">Rest of England<button data-rest="true" title="clear">×</button></span>`;
      } else {
        const codes  = [...b.codes];
        const lOf    = bCache?.labelOf;
        const lvlTag = b.level !== buckets[bkt === 'A' ? 'B' : 'A'].level
          ? `<span class="chip chip--muted">${esc(LEVELS[b.level].many)}</span>` : '';
        if (!lOf || codes.length === 0) {
          html += `<span class="chip chip--muted">none selected</span>`;
        } else {
          html += codes.slice(0, CAP).map((code) =>
            `<span class="chip chip--${tag}">${esc(lOf.get(code) || code)}<button data-code="${code}" data-bucket="${bkt}" title="remove">×</button></span>`
          ).join('');
          if (codes.length > CAP) html += `<span class="chip more">+${codes.length - CAP} more</span>`;
          html += lvlTag;
        }
      }
      return html + '</div>';
    };

    chipsEl.innerHTML = bucketRow('A', 'a') + bucketRow('B', 'b');
    const bDesc = buckets.B.rest ? 'rest' : String(buckets.B.codes.size);
    selCountEl.textContent = `· A: ${buckets.A.codes.size}, B: ${bDesc}`;
  } else {
    chipsEl.classList.remove('chips--compare');
    const selCodes = [...s];
    const CAP = 14;
    chipsEl.innerHTML = selCodes.slice(0, CAP).map((code) =>
      `<span class="chip">${esc(labelOf.get(code) || code)}<button data-code="${code}" title="remove">×</button></span>`
    ).join('') + (selCodes.length > CAP ? `<span class="chip more">+${selCodes.length - CAP} more</span>` : '');
    selCountEl.textContent = selCodes.length ? `· ${selCodes.length} selected` : '· none selected';
  }

  // Groups list (always shows the active bucket's level in compare mode)
  let html = '';
  for (const g of groups) {
    const matched = q ? g.areas.filter((a) => a.label.toLowerCase().includes(q)) : g.areas;
    if (!matched.length) continue;
    const selN = g.areas.filter((a) => s.has(a.code)).length;
    const open = q ? true : expanded[currentLevel].has(g.name);
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

  groupsEl.querySelectorAll('input[data-group]').forEach((cb) => {
    const g = groups.find((x) => x.name === cb.dataset.group);
    const n = g.areas.filter((a) => s.has(a.code)).length;
    cb.indeterminate = n > 0 && n < g.areas.length;
  });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const style = document.createElement('style');
style.textContent = '.group-body{display:none}.group.open .group-body{display:block}.group.open .chev{transform:rotate(90deg);display:inline-block}';
document.head.appendChild(style);

// --- chart rendering -------------------------------------------------------
let renderTimer = null, rendering = false, pending = false;
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 350); }

// Human-readable title for the active selection in single mode.
function titleArea() {
  const s = sel(); const { labelOf, areas } = cache[currentLevel]; const cfg = LEVELS[currentLevel];
  if (s.size === 0) return '—';
  if (s.size === 1) return labelOf.get([...s][0]);
  if (currentLevel === 'region' && s.size === areas.length) return 'England';
  return `${s.size} ${cfg.many}`;
}

// Human-readable title for a comparison bucket.
function titleBucket(bkt) {
  const b = buckets[bkt];
  if (b.rest) return 'Rest of England';
  const c = cache[b.level];
  if (!c) return `Bucket ${bkt}`;
  if (b.codes.size === 0) return `Bucket ${bkt} (empty)`;
  if (b.codes.size === 1) return c.labelOf.get([...b.codes][0]) || `Bucket ${bkt}`;
  if (b.level === 'region' && b.codes.size === c.areas.length) return 'England';
  return `${b.codes.size} ${LEVELS[b.level].many}`;
}

async function render() {
  if (!shelter) return;
  if (rendering) { pending = true; return; }

  // --- early-return guards (before setting rendering=true so finally doesn't run) ---
  if (compareMode) {
    const codesA = [...buckets.A.codes];
    const bRest  = buckets.B.rest;
    const codesB = bRest ? null : [...buckets.B.codes];
    if (codesA.length === 0 || (!bRest && codesB.length === 0)) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const missing = codesA.length === 0 ? 'A' : 'B';
      summaryEl.innerHTML = `<p class="hint">Select areas for Bucket ${missing} to compare.</p>`;
      return;
    }
  } else {
    if (sel().size === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      summaryEl.innerHTML = '<p class="hint">Select one or more areas to draw the pyramids.</p>';
      return;
    }
  }

  rendering = true;
  setStatus('Rendering in R…', 'busy');
  try {
    if (compareMode) {
      // --- area compare path ---
      const codesA = [...buckets.A.codes];
      const bRest  = buckets.B.rest;
      const codesB = bRest ? null : [...buckets.B.codes];
      const year   = Number(yearLSel.value);
      const titleA = titleBucket('A');
      const titleB = titleBucket('B');
      const cap = await shelter.captureR(
        rProgramArea(codesA, codesB, bRest, year, normalise, titleA, titleB),
        { captureGraphics: { width: 1000, height: 800 } }
      );
      const res = await cap.result.toJs();
      const v = {};
      res.names.forEach((name, i) => { const x = res.values[i]; v[name] = x.values.length === 1 ? x.values[0] : x.values; });
      if (cap.images.length) drawImage(cap.images[0]);
      renderSummaryArea(v, titleA, titleB, year);
    } else {
      // --- time mode path (unchanged) ---
      const codes = [...sel()];
      const yL = Number(yearLSel.value), yR = Number(yearRSel.value);
      const title = titleArea();
      const cap = await shelter.captureR(rProgram(codes, yL, yR, title), {
        captureGraphics: { width: 1000, height: 800 },
      });
      const res = await cap.result.toJs();
      const v = {};
      res.names.forEach((name, i) => { const x = res.values[i]; v[name] = x.values.length === 1 ? x.values[0] : x.values; });
      if (cap.images.length) drawImage(cap.images[0]);
      renderSummary(v, title, yL, yR);
    }
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

// --- R program — area comparison -------------------------------------------
// Draws pyramid A | pyramid B at a single year on a shared count axis,
// with A − B divergence full-width below. normalise wiring added in Commit 3.
function rProgramArea(codesA, codesB, bRest, year, normalise, titleA, titleB) {
  const jsonA = codesA.map((c) => JSON.stringify(c)).join(',');
  // codesB is null when bRest=true; the R code derives B as England − A
  const jsonB = bRest ? '' : codesB.map((c) => JSON.stringify(c)).join(',');
  return `
    codesA <- c(${jsonA})
    ${bRest ? '' : `codesB <- c(${jsonB})`}
    bRest  <- ${bRest ? 'TRUE' : 'FALSE'}
    yr <- ${year}; normalise <- ${JSON.stringify(normalise)}
    titleA <- ${JSON.stringify(titleA)}; titleB <- ${JSON.stringify(titleB)}
    ages <- c(${AGES.map((a) => JSON.stringify(a)).join(',')})
    male_col <- "#3182bd"; female_col <- "#dd3497"

    # Age-banded population for a set of ONS codes at yr, for one sex
    vec <- function(codes, sx) {
      x <- D[D$code %in% codes & D$year == yr & D$sex == sx, ]
      v <- tapply(x$population, factor(x$age_group, levels = ages), sum)
      v <- as.numeric(v); v[is.na(v)] <- 0; v
    }

    mA <- vec(codesA, "male"); fA <- vec(codesA, "female")

    if (bRest) {
      # England = sum of the 9 E12 region rows (region always loaded at boot)
      eng <- function(sx) {
        x <- D[substr(D$code, 1, 3) == "E12" & D$year == yr & D$sex == sx, ]
        v <- tapply(x$population, factor(x$age_group, levels = ages), sum)
        v <- as.numeric(v); v[is.na(v)] <- 0; v
      }
      mB <- eng("male") - mA; fB <- eng("female") - fA
      # Clamp tiny floating-point negatives that can appear near zero
      mB[mB < 0] <- 0; fB[fB < 0] <- 0
    } else {
      mB <- vec(codesB, "male"); fB <- vec(codesB, "female")
    }

    totA <- sum(mA) + sum(fA); totB <- sum(mB) + sum(fB)

    # Share mode: each bar = that sex/band as % of its own bucket's grand total,
    # so a 1M area and a 56M area become shape-comparable.
    # Absolute mode: raw counts — shared xmax makes size mismatches visible honestly.
    if (normalise == "percent") {
      pmA <- 100 * mA / totA; pfA <- 100 * fA / totA
      pmB <- 100 * mB / totB; pfB <- 100 * fB / totB
    } else {
      pmA <- mA; pfA <- fA; pmB <- mB; pfB <- fB
    }
    xmax <- max(pmA, pfA, pmB, pfB, 1)   # shared scale across BOTH pyramids; closure var for fmt() and pyramid()

    # In share mode xmax ≈ 5–10 (each age band is ~5% of total), so k/m thresholds never
    # trigger and we fall through to as.character() — which would give bare "5", not "5%".
    # The normalise branch here ensures the axis reads "5.0%" in share mode.
    fmt <- function(z) {
      if (normalise == "percent") paste0(round(z, 1), "%")
      else if (xmax >= 1e6) paste0(round(z / 1e6, 1), "m")
      else if (xmax >= 1e4) paste0(round(z / 1e3), "k")
      else as.character(round(z))
    }

    # pyramid() is copied from rProgram so both charts share the same implementation.
    # xmax is a closure variable — both A and B calls use the same binding (shared scale).
    pyramid <- function(m, f, title, show_ages, cm = NULL, cf = NULL) {
      nm <- if (show_ages) ages else rep("", length(ages))
      par(mar = c(3.6, if (show_ages) 4.2 else 1.2, 2.6, 1))
      xl <- c(-xmax, xmax) * 1.2
      b <- barplot(-m, horiz = TRUE, names.arg = nm, las = 1, xlim = xl,
                   col = male_col, border = NA, xaxt = "n", cex.names = 0.8)
      barplot(f, horiz = TRUE, add = TRUE, col = female_col, border = NA, xaxt = "n")
      if (!is.null(cm)) {
        hh <- 0.42
        rect(0, b - hh, -cm, b + hh, col = NA, border = "grey20", lty = 3, lwd = 1.6)
        rect(0, b - hh,  cf, b + hh, col = NA, border = "grey20", lty = 3, lwd = 1.6)
      }
      at <- pretty(c(0, xmax), 4); at <- at[at <= xmax]
      axis(1, at = c(-rev(at), at), labels = fmt(abs(c(-rev(at), at))), cex.axis = 0.8)
      title(main = title, line = 1); abline(v = 0, col = "white", lwd = 1.5)
      # Per-bar labels: compute 100*m/tot regardless of mode.
      # In absolute mode: m=raw, tot=totA → gives share %.
      # In share mode (Commit 3): m=pmA, tot≈100 → 100*pmA/100 = pmA (also share %).
      # Either way the label shows the share %, no double-percenting.
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

    # 2-row layout: pyramids side by side on top, divergence panel full-width below
    layout(matrix(c(1, 2, 3, 3), nrow = 2, byrow = TRUE), heights = c(1.15, 1))

    pyramid(pmA, pfA, titleA, TRUE, cm = pmB, cf = pfB)
    legend("topright", bty = "n", inset = 0.01,
           legend = c("male", "female", paste0(titleB, " (outline)")),
           pch = c(15, 15, NA), lty = c(NA, NA, 3), lwd = c(NA, NA, 1.2),
           col = c(male_col, female_col, "grey20"), pt.cex = 1.2, cex = 0.82)
    pyramid(pmB, pfB, titleB, FALSE, cm = pmA, cf = pfA)

    # Divergence panel: A − B. Units follow the toggle: pp in share mode, head-count in absolute.
    divTitle <- paste0(titleA, " − ", titleB, if (normalise == "percent") " (pp)" else "")
    changeplot(list(m = pmA - pmB, f = pfA - pfB), divTitle, normalise == "percent", TRUE)

    # Structural stats always in share terms so they are mode-independent
    old   <- ages %in% c("65-69", "70-74", "75-79", "80-84", "85-89", "90+")
    young <- ages %in% c("0-4", "5-9", "10-14")
    sh    <- function(m, f, idx) 100 * sum((m + f)[idx]) / sum(m + f)
    # Share divergence regardless of toggle — prevents "biggest" from just being the most populous band
    divS <- abs(100 * mA / totA - 100 * mB / totB) + abs(100 * fA / totA - 100 * fB / totB)
    list(
      totA = totA, totB = totB, growthAvsB = 100 * (totA / totB - 1),
      old_A   = sh(mA, fA, old),   old_B   = sh(mB, fB, old),
      young_A = sh(mA, fA, young), young_B = sh(mB, fB, young),
      biggest = ages[which.max(divS)]
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

function renderSummaryArea(v, titleA, titleB, year) {
  const n    = (x) => Math.round(x).toLocaleString();
  const sign = (x) => (x >= 0 ? '+' : '');
  const sizeCls = v.growthAvsB >= 0 ? 'stat--growth' : 'stat--shrink';
  summaryEl.innerHTML = `
    <div class="cards">
      <div class="stat"><div class="v">${n(v.totA)}</div><div class="l">Total — ${esc(titleA)}</div></div>
      <div class="stat"><div class="v">${n(v.totB)}</div><div class="l">Total — ${esc(titleB)}</div></div>
      <div class="stat ${sizeCls}"><div class="v">${sign(v.growthAvsB)}${v.growthAvsB.toFixed(1)}%</div><div class="l">A vs B size</div></div>
      <div class="stat"><div class="v">${v.old_A.toFixed(1)}% vs ${v.old_B.toFixed(1)}%</div><div class="l">Aged 65+ share (A vs B)</div></div>
    </div>
    <div class="takeaway">
      <strong>${esc(titleA)}</strong> has <strong>${n(v.totA)}</strong> people vs
      <strong>${esc(titleB)}</strong>'s <strong>${n(v.totB)}</strong> in ${year}.
      Its 65+ share is <strong>${v.old_A.toFixed(1)}%</strong> against
      <strong>${v.old_B.toFixed(1)}%</strong>, and under-15s
      <strong>${v.young_A.toFixed(1)}%</strong> vs <strong>${v.young_B.toFixed(1)}%</strong>.
      The biggest structural divergence is in the <strong>${esc(v.biggest)}</strong> band.
    </div>`;
}
