/* England Geography Map — linked list/map selection across three levels.
   Plain JS + Leaflet (global L). Region/sub-ICB/LA areas come from
   data/<level>_areas.csv (code,label,group,pop2022); shapes from
   data/<level>.geojson (or regions.geojson), matched on ONS code. */

const LEVELS = {
  region: { areas: 'region_areas.csv', geo: 'regions.geojson', one: 'region', many: 'regions' },
  subicb: { areas: 'subicb_areas.csv', geo: 'subicb.geojson', one: 'sub-ICB', many: 'sub-ICBs' },
  la:     { areas: 'la_areas.csv', geo: 'la.geojson', one: 'local authority', many: 'local authorities' },
};

const $ = (id) => document.getElementById(id);
const statusEl = $('status'), headlineEl = $('headline'), groupsEl = $('groups');
const chipsEl = $('chips'), searchEl = $('search'), selCountEl = $('sel-count');
const setStatus = (t, k) => { statusEl.textContent = t; statusEl.className = `status status--${k}`; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const STYLE_OFF = { color: '#4cc2ff', weight: 1.6, fillColor: '#4cc2ff', fillOpacity: 0.05 };
const STYLE_ON  = { color: '#4cc2ff', weight: 2.4, fillColor: '#4cc2ff', fillOpacity: 0.45 };

// Overlay of the next geography up, drawn as finer contrasting outlines.
const PARENT = { la: 'subicb', subicb: 'region', region: null };
const PARENT_STYLE = { color: '#ff7f0e', weight: 1.2, fill: false, opacity: 0.95 };
const overlayCache = {};   // parent level -> non-interactive outline layer
let overlay = null;

// --- CSV (handles quoted fields with commas) -------------------------------
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// --- state -----------------------------------------------------------------
// Per-level default selection (ONS codes), shown with their group(s) open.
const DEFAULTS = {
  region: ['E12000004'],                                                  // East Midlands
  subicb: ['E38000243'],                                                  // NHS Nottingham & Nottinghamshire ICB - 52R
  la: ['E06000018', 'E07000172', 'E07000176', 'E07000173', 'E07000170'],  // Nottingham, Broxtowe, Rushcliffe, Gedling, Ashfield
};
const cache = {};            // level -> { areas, groups, labelOf, popOf, codeSet, layer, layerByCode }
const selections = {};       // level -> Set(code)
const expanded = {};         // level -> Set(group)
let currentLevel = 'subicb';
let mapLayer = null;         // geojson layer currently on the map

const sel = () => selections[currentLevel];
const expandedSet = () => expanded[currentLevel];

// --- map -------------------------------------------------------------------
const map = L.map('map', { scrollWheelZoom: true }).setView([53, -1.6], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18, attribution: '© OpenStreetMap contributors',
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
    try { overlayCache[parent] = L.geoJSON(JSON.parse(await fetchText(LEVELS[parent].geo)), { interactive: false, style: PARENT_STYLE }); }
    catch (e) { console.error(e); return; }
  }
  overlay = overlayCache[parent].addTo(map);
  overlay.bringToFront();
}

// --- loading ---------------------------------------------------------------
const fetchText = (n) => fetch(`data/${n}?v=dev`, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); });

async function loadAreas(level) {
  if (cache[level]) return;
  const rows = parseCSV(await fetchText(LEVELS[level].areas)).slice(1).filter((r) => r.length >= 4);
  const areas = rows.map(([code, label, group, pop]) => ({ code, label, group, pop: +pop || 0 }));
  const order = [], byGroup = new Map();
  for (const a of areas) { if (!byGroup.has(a.group)) { byGroup.set(a.group, []); order.push(a.group); } byGroup.get(a.group).push(a); }
  cache[level] = {
    areas, groups: order.map((g) => ({ name: g, areas: byGroup.get(g) })),
    labelOf: new Map(areas.map((a) => [a.code, a.label])),
    popOf: new Map(areas.map((a) => [a.code, a.pop])),
    codeSet: new Set(areas.map((a) => a.code)),
    layer: null, layerByCode: {},
  };
  // default selection (per level), with the group(s) containing it left open
  const def = (DEFAULTS[level] || []).filter((c) => cache[level].labelOf.has(c));
  selections[level] = new Set(def);
  expanded[level] = new Set(order.length === 1 ? order : []);   // single group opens by default
  for (const code of def) {
    const g = cache[level].groups.find((gr) => gr.areas.some((a) => a.code === code));
    if (g) expanded[level].add(g.name);
  }
}

const codeOf = (props, codeSet) => { for (const v of Object.values(props || {})) if (codeSet.has(String(v))) return String(v); return null; };

async function loadGeo(level) {
  const c = cache[level];
  if (c.layer) return;
  const gj = JSON.parse(await fetchText(LEVELS[level].geo));
  c.layer = L.geoJSON(gj, {
    filter: (f) => codeOf(f.properties, c.codeSet) !== null,
    style: STYLE_OFF,
    onEachFeature: (f, lyr) => {
      const code = codeOf(f.properties, c.codeSet);
      c.layerByCode[code] = lyr;
      lyr.bindTooltip(c.labelOf.get(code) || code, { sticky: true, className: 'region-tooltip' });
      lyr.on('click', () => setSelected(code, !sel().has(code)));
      lyr.on('mouseover', () => hover(code, true));
      lyr.on('mouseout', () => hover(code, false));
    },
  });
}

async function showLevel(level) {
  currentLevel = level;
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.level === level));
  searchEl.value = '';
  searchEl.placeholder = `Search ${LEVELS[level].many}…`;
  try {
    setStatus(`Loading ${LEVELS[level].many}…`, 'loading');
    await loadAreas(level);
    if (mapLayer) { map.removeLayer(mapLayer); mapLayer = null; }
    await loadGeo(level);
    mapLayer = cache[level].layer.addTo(map);
    const b = mapLayer.getBounds(); if (b.isValid()) map.fitBounds(b, { padding: [12, 12] });
    setStatus('Ready — select areas from the list or the map.', 'ready');
  } catch (err) {
    console.error(err);
    setStatus(`Boundaries for ${LEVELS[level].many} not available yet (data/${LEVELS[level].geo}). List still works.`, 'error');
  }
  await updateOverlay(level);
  setLegend(level);
  buildGroupsDOM();
  syncUI();
}

// --- picker DOM ------------------------------------------------------------
function buildGroupsDOM() {
  const { groups } = cache[currentLevel];
  const q = searchEl.value.trim().toLowerCase();
  const exp = expandedSet();
  let html = '';
  for (const g of groups) {
    const matched = q ? g.areas.filter((a) => a.label.toLowerCase().includes(q)) : g.areas;
    if (!matched.length) continue;
    const open = q ? true : exp.has(g.name);
    html += `<div class="group${open ? ' open' : ''}" data-group="${esc(g.name)}">
      <div class="group-head"><input type="checkbox" data-grpcb="${esc(g.name)}" />
        <span class="chev">▸</span><span>${esc(g.name)}</span><span class="count"></span></div>
      <div class="group-body">${matched.map((a) =>
        `<div class="area-row" data-code="${a.code}"><input type="checkbox" data-code="${a.code}" id="c_${a.code}" /><label for="c_${a.code}">${esc(a.label)}</label></div>`
      ).join('')}</div></div>`;
  }
  groupsEl.innerHTML = html || '<div class="empty">No areas match your search.</div>';
}

function syncUI() {
  const c = cache[currentLevel], s = sel();
  // checkboxes + rows
  groupsEl.querySelectorAll('input[data-code]').forEach((cb) => {
    const on = s.has(cb.dataset.code); cb.checked = on;
    cb.closest('.area-row').classList.toggle('sel', on);
  });
  // group header state
  groupsEl.querySelectorAll('input[data-grpcb]').forEach((cb) => {
    const g = c.groups.find((x) => x.name === cb.dataset.grpcb);
    const n = g.areas.filter((a) => s.has(a.code)).length;
    cb.checked = n === g.areas.length; cb.indeterminate = n > 0 && n < g.areas.length;
    cb.closest('.group-head').querySelector('.count').textContent = `${n}/${g.areas.length}`;
  });
  // map styles
  for (const [code, lyr] of Object.entries(c.layerByCode)) lyr.setStyle(s.has(code) ? STYLE_ON : STYLE_OFF);
  // chips
  const codes = [...s], CAP = 16;
  chipsEl.innerHTML = codes.slice(0, CAP).map((code) =>
    `<span class="chip">${esc(c.labelOf.get(code) || code)}<button data-code="${code}" title="remove">×</button></span>`
  ).join('') + (codes.length > CAP ? `<span class="chip more">+${codes.length - CAP} more</span>` : '');
  selCountEl.textContent = codes.length ? `· ${codes.length} selected` : '';
  // headline
  if (!codes.length) headlineEl.textContent = 'No areas selected.';
  else {
    const pop = codes.reduce((t, code) => t + (c.popOf.get(code) || 0), 0);
    const all = codes.length === c.areas.length;
    headlineEl.innerHTML = `<strong>${codes.length}</strong> ${codes.length === 1 ? LEVELS[currentLevel].one : LEVELS[currentLevel].many} selected · ` +
      `combined 2022 population <strong>${pop.toLocaleString()}</strong>` +
      (all && currentLevel === 'region' ? ' (all England)' : '');
  }
}

function setSelected(code, on) { on ? sel().add(code) : sel().delete(code); syncUI(); }
function hover(code, on) {
  const row = groupsEl.querySelector(`.area-row[data-code="${code}"]`); if (row) row.classList.toggle('is-hover', on);
  const lyr = cache[currentLevel].layerByCode[code];
  if (lyr) { if (on) { lyr.setStyle({ weight: 3, color: '#ffffff' }); lyr.bringToFront(); } else lyr.setStyle(sel().has(code) ? STYLE_ON : STYLE_OFF); }
}

// --- events ----------------------------------------------------------------
$('level').addEventListener('click', (e) => { const b = e.target.closest('.seg-btn'); if (b && b.dataset.level !== currentLevel) showLevel(b.dataset.level); });
searchEl.addEventListener('input', () => { buildGroupsDOM(); syncUI(); });
$('select-all').addEventListener('click', () => { cache[currentLevel].areas.forEach((a) => sel().add(a.code)); syncUI(); });
$('clear-all').addEventListener('click', () => { sel().clear(); syncUI(); });

groupsEl.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.code) setSelected(t.dataset.code, t.checked);
  else if (t.dataset.grpcb) {
    const g = cache[currentLevel].groups.find((x) => x.name === t.dataset.grpcb);
    g.areas.forEach((a) => (t.checked ? sel().add(a.code) : sel().delete(a.code)));
    syncUI();
  }
});
groupsEl.addEventListener('click', (e) => {
  if (e.target.matches('input')) return;
  const head = e.target.closest('.group-head'); if (!head) return;
  const name = head.parentElement.dataset.group;
  const exp = expandedSet(); exp.has(name) ? exp.delete(name) : exp.add(name);
  head.parentElement.classList.toggle('open');
});
groupsEl.addEventListener('mouseover', (e) => { const r = e.target.closest('.area-row'); if (r) hover(r.dataset.code, true); });
groupsEl.addEventListener('mouseout', (e) => { const r = e.target.closest('.area-row'); if (r) hover(r.dataset.code, false); });
chipsEl.addEventListener('click', (e) => { const b = e.target.closest('button[data-code]'); if (b) setSelected(b.dataset.code, false); });

// --- go --------------------------------------------------------------------
showLevel(currentLevel);
