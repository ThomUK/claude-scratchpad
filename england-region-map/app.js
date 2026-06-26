/* England Region Map — linked list/map selection. Plain JS + Leaflet (global L). */

// Region lookup (codes match ONS RGN22CD), in north→south-ish display order.
const REGIONS = [
  { code: 'E12000001', name: 'North East', pop2022: 2682069 },
  { code: 'E12000002', name: 'North West', pop2022: 7515718 },
  { code: 'E12000003', name: 'Yorkshire and The Humber', pop2022: 5538213 },
  { code: 'E12000004', name: 'East Midlands', pop2022: 4934832 },
  { code: 'E12000005', name: 'West Midlands', pop2022: 6017026 },
  { code: 'E12000006', name: 'East of England', pop2022: 6401418 },
  { code: 'E12000007', name: 'London', pop2022: 8869043 },
  { code: 'E12000008', name: 'South East', pop2022: 9387286 },
  { code: 'E12000009', name: 'South West', pop2022: 5766937 },
];
const NAME = Object.fromEntries(REGIONS.map((r) => [r.code, r.name]));
const POP = Object.fromEntries(REGIONS.map((r) => [r.code, r.pop2022]));

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const headlineEl = $('headline');
const listEl = $('region-list');
const setStatus = (t, k) => { statusEl.textContent = t; statusEl.className = `status status--${k}`; };

const selected = new Set();
const layerByCode = {};   // code -> Leaflet layer
const liByCode = {};      // code -> <li>

// styles
const STYLE_OFF = { color: '#5a6b7a', weight: 1, fillColor: '#9aa7b4', fillOpacity: 0.12 };
const STYLE_ON  = { color: '#4cc2ff', weight: 2, fillColor: '#4cc2ff', fillOpacity: 0.45 };

// --- build the list --------------------------------------------------------
for (const r of REGIONS) {
  const li = document.createElement('li');
  li.dataset.code = r.code;
  li.innerHTML = `<input type="checkbox" /><span class="swatch"></span>` +
    `<span class="name">${r.name}</span><span class="pop">${r.pop2022.toLocaleString()}</span>`;
  const cb = li.querySelector('input');
  cb.addEventListener('change', () => setSelected(r.code, cb.checked));
  li.addEventListener('click', (e) => { if (e.target !== cb) { e.preventDefault(); setSelected(r.code, !selected.has(r.code)); } });
  li.addEventListener('mouseenter', () => hoverRegion(r.code, true));
  li.addEventListener('mouseleave', () => hoverRegion(r.code, false));
  listEl.appendChild(li);
  liByCode[r.code] = li;
}

$('select-all').addEventListener('click', () => { REGIONS.forEach((r) => selected.add(r.code)); syncUI(); });
$('clear-all').addEventListener('click', () => { selected.clear(); syncUI(); });

// --- map -------------------------------------------------------------------
const map = L.map('map', { scrollWheelZoom: true }).setView([53, -1.6], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18, attribution: '© OpenStreetMap contributors',
}).addTo(map);

function codeOfFeature(props) {
  for (const v of Object.values(props || {})) {
    if (/^E12\d{6}$/.test(String(v))) return String(v);
  }
  return null;
}

(async function loadRegions() {
  try {
    const res = await fetch('data/regions.geojson?v=dev', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const gj = await res.json();

    const layer = L.geoJSON(gj, {
      style: STYLE_OFF,
      onEachFeature: (feature, lyr) => {
        const code = codeOfFeature(feature.properties);
        if (!code || !NAME[code]) return;
        layerByCode[code] = lyr;
        lyr.bindTooltip(NAME[code], { sticky: true, className: 'region-tooltip' });
        lyr.on('click', () => setSelected(code, !selected.has(code)));
        lyr.on('mouseover', () => hoverRegion(code, true));
        lyr.on('mouseout', () => hoverRegion(code, false));
      },
    }).addTo(map);

    const matched = Object.keys(layerByCode).length;
    if (matched) map.fitBounds(layer.getBounds(), { padding: [12, 12] });
    if (matched < REGIONS.length) {
      setStatus(`Map ready — matched ${matched}/${REGIONS.length} regions (check the GeoJSON codes).`, matched ? 'ready' : 'error');
    } else {
      setStatus('Map ready — select regions from the list or the map.', 'ready');
    }
    syncUI();
  } catch (err) {
    console.error(err);
    setStatus('Could not load data/regions.geojson — add the ONS regions GeoJSON to data/.', 'error');
  }
})();

// --- selection + sync ------------------------------------------------------
function setSelected(code, on) {
  if (on) selected.add(code); else selected.delete(code);
  syncUI();
}

function hoverRegion(code, on) {
  const li = liByCode[code]; if (li) li.classList.toggle('is-hover', on);
  const lyr = layerByCode[code];
  if (lyr) {
    if (on) { lyr.setStyle({ weight: 3, color: '#ffffff' }); lyr.bringToFront(); }
    else { lyr.setStyle(selected.has(code) ? STYLE_ON : STYLE_OFF); }
  }
}

function syncUI() {
  for (const r of REGIONS) {
    const on = selected.has(r.code);
    const li = liByCode[r.code];
    li.classList.toggle('sel', on);
    li.querySelector('input').checked = on;
    const lyr = layerByCode[r.code];
    if (lyr) lyr.setStyle(on ? STYLE_ON : STYLE_OFF);
  }
  const n = selected.size;
  if (!n) {
    headlineEl.textContent = 'No regions selected.';
  } else {
    const pop = [...selected].reduce((s, c) => s + (POP[c] || 0), 0);
    headlineEl.innerHTML = `<strong>${n}</strong> of ${REGIONS.length} regions selected · ` +
      `combined 2022 population <strong>${pop.toLocaleString()}</strong>` +
      (n === REGIONS.length ? ' (all England)' : '');
  }
}
