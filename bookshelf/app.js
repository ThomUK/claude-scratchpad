// Parametric birch-ply bookshelf, rendered live with three.js (pinned r186,
// vendored — see index.html's import map). All dimensions are millimetres in
// the UI and metres in the scene.
import * as THREE from 'three';
import { OrbitControls } from './vendor/three/OrbitControls.js?v=dev';

const $ = (sel) => document.querySelector(sel);
const MM = 1 / 1000;
const BACK_T = 6;          // mm, fixed thin-ply back
const MIN_BAY = 30;        // mm, smallest sensible clear bay height
const DENSITY = 680;       // kg/m3, birch ply

const params = {
  width: 900, depth: 300, height: 1800, shelves: 4,
  plinth: 120,             // mm, floor to UNDERSIDE of the bottom shelf
  cutout: 25,              // mm, skirting cutout depth (notch height = plinth)
  setback: 20,             // mm, shelf fronts + plinth rail behind the side fronts
  thickness: 18, back: false,
};

// --- procedural textures --------------------------------------------------------
// Birch face: pale with faint long grain streaks. Birch edge: the laminated
// stripe that makes ply read as ply. Concrete: multi-scale grey noise, used as
// both colour and bump.
function faceTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#e8d6ac';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 160; i++) {
    const y = Math.random() * 512;
    const w = 40 + Math.random() * 470;
    const x = Math.random() * (512 - w);
    g.fillStyle = Math.random() < 0.5 ? 'rgba(197,166,112,0.10)' : 'rgba(248,236,205,0.12)';
    g.fillRect(x, y, w, 1 + Math.random() * 2);
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(160,130,80,${0.02 + Math.random() * 0.04})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function edgeTexture(plies) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const band = 256 / plies;
  for (let i = 0; i < plies; i++) {
    g.fillStyle = i % 2 === 0 ? '#e3cfa2' : '#c6a26c';
    g.fillRect(0, i * band, 64, band);
    g.fillStyle = 'rgba(110,84,50,0.55)';   // glue line
    g.fillRect(0, i * band, 64, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function concreteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#c3c7cc';
  g.fillRect(0, 0, 1024, 1024);
  // broad tonal blotches
  for (let i = 0; i < 70; i++) {
    const r = 60 + Math.random() * 220;
    const x = Math.random() * 1024, y = Math.random() * 1024;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const tone = Math.random() < 0.5 ? '176,180,186' : '204,208,213';
    grad.addColorStop(0, `rgba(${tone},${0.10 + Math.random() * 0.12})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // fine aggregate speckle
  for (let i = 0; i < 14000; i++) {
    const v = 150 + Math.floor(Math.random() * 80);
    g.fillStyle = `rgba(${v},${v},${v + 4},${0.12 + Math.random() * 0.25})`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 1 + Math.random(), 1 + Math.random());
  }
  // a few hairline marks
  g.strokeStyle = 'rgba(120,124,130,0.18)';
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    let x = Math.random() * 1024, y = Math.random() * 1024;
    g.moveTo(x, y);
    for (let s = 0; s < 8; s++) { x += (Math.random() - 0.5) * 160; y += (Math.random() - 0.5) * 160; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.72, metalness: 0 });
// Baltic birch ply counts: ~1.4mm veneers, always an odd number
const PLIES = { 12: 9, 18: 13, 24: 17, [BACK_T]: 5 };
const edgeMats = {};
function edgeMat(t_mm) {
  if (!edgeMats[t_mm]) {
    edgeMats[t_mm] = new THREE.MeshStandardMaterial({ map: edgeTexture(PLIES[t_mm] ?? 13), roughness: 0.8, metalness: 0 });
  }
  return edgeMats[t_mm];
}

// --- scene ----------------------------------------------------------------------
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9eef6');   // slightly blue white

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 50);
camera.position.set(1.9, 1.6, 2.7);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.55;
controls.minDistance = 0.4;
controls.maxDistance = 10;

scene.add(new THREE.HemisphereLight(0xdfe9f3, 0x8a8378, 1.0));
const key = new THREE.DirectionalLight(0xfff2dd, 2.0);
key.position.set(2.4, 3.4, 1.9);
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
key.shadow.camera.left = key.shadow.camera.bottom = -2.2;
key.shadow.camera.right = key.shadow.camera.top = 2.6;
// Keep the depth range tight: bias is applied in normalized depth, so with
// the default far=500 even a tiny value displaces shadows ~20 cm (detached
// contact shadows, light leaking onto the inside of the sides). normalBias
// (metres, < panel thickness) handles acne without shifting the shadow.
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 12;
key.shadow.bias = -0.00005;
key.shadow.normalBias = 0.008;
scene.add(key);
const fill = new THREE.DirectionalLight(0xdde8f5, 0.45);
fill.position.set(-2.2, 1.4, -1.6);
scene.add(fill);
// soft frontal light so bay interiors stay readable (no shadow: it is a fill)
const front = new THREE.DirectionalLight(0xf2ead9, 0.5);
front.position.set(0.4, 1.6, 3.2);
scene.add(front);

// rough concrete hexagon slab
const concrete = concreteTexture();
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(2.6, 6),
  new THREE.MeshStandardMaterial({ map: concrete, bumpMap: concrete, bumpScale: 2.5, roughness: 0.95, metalness: 0 })
);
floor.rotation.x = -Math.PI / 2;
floor.rotation.z = Math.PI / 6;   // flat edge facing the camera
floor.receiveShadow = true;
scene.add(floor);

// --- parametric build -------------------------------------------------------------
// Flat panels are boxes with their THICKNESS along local Y: big faces take the
// face material, the four rims take the laminated edge material. The two side
// panels are EXTRUDED L-profiles instead, so the skirting cutout is a real
// notch; a custom UV generator keeps the lamination stripes correct across
// the extrusion (v runs 0..1 through the thickness, as on the boxes).
let unit = null;

function panel(len_mm, dep_mm, t_mm) {
  const geo = new THREE.BoxGeometry(len_mm * MM, t_mm * MM, dep_mm * MM);
  const e = edgeMat(t_mm);
  const mesh = new THREE.Mesh(geo, [e, e, faceMat, faceMat, e, e]);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function sideUVGenerator(depthM) {
  return {
    generateTopUV(geometry, vertices, iA, iB, iC) {
      // caps: metres -> texture tiles (constant texel scale across the L-shape)
      const p = (i) => new THREE.Vector2(vertices[i * 3] * 1.5, vertices[i * 3 + 1] * 1.5);
      return [p(iA), p(iB), p(iC)];
    },
    generateSideWallUV(geometry, vertices, iA, iB, iC, iD) {
      // rims: u along the contour (scale irrelevant — stripes are uniform in u),
      // v normalised 0..1 through the extrusion = across the ply thickness
      const uv = (i) => new THREE.Vector2(
        (vertices[i * 3] + vertices[i * 3 + 1]) * 4,
        vertices[i * 3 + 2] / depthM
      );
      return [uv(iA), uv(iB), uv(iC), uv(iD)];
    },
  };
}

// Side panel: full height, full depth, with an optional notch (cutout deep,
// plinth tall) out of the back-bottom corner. Local shape plane: x = depth
// (0 = back, D = front), y = height; extruded along z by the thickness.
function sidePanel(D, H, T, plinth, cutout) {
  const s = new THREE.Shape();
  const notch = plinth > 0 && cutout > 0;
  if (notch) {
    s.moveTo(0, plinth * MM);
    s.lineTo(cutout * MM, plinth * MM);
    s.lineTo(cutout * MM, 0);
    s.lineTo(D * MM, 0);
  } else {
    s.moveTo(0, 0);
    s.lineTo(D * MM, 0);
  }
  s.lineTo(D * MM, H * MM);
  s.lineTo(0, H * MM);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: T * MM, bevelEnabled: false, UVGenerator: sideUVGenerator(T * MM),
  });
  const mesh = new THREE.Mesh(geo, [faceMat, edgeMat(T)]);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// Clamp shelf count so every bay keeps at least MIN_BAY of clear height.
function maxShelves(p) {
  const cavity = p.height - p.plinth - 2 * p.thickness;
  return Math.max(0, Math.floor((cavity - MIN_BAY) / (p.thickness + MIN_BAY)));
}

// --- cut list ----------------------------------------------------------------------
// Single source of truth for what the unit is made of: the 3D build, the
// readout (volume, weight, panel count) and the CSV download all derive from
// these rows, so they can never disagree. len × wid are the rectangular blank
// to cut; notchArea (mm²) is material removed afterwards (the skirting notch).
function cutList(p) {
  const T = p.thickness;
  const innerW = p.width - 2 * T;
  const shelfD = p.depth - p.setback - (p.back ? BACK_T : 0);
  const notch = p.plinth > 0 && p.cutout > 0;
  const rows = [{
    part: 'Side', qty: 2, len: p.height, wid: p.depth, t: T,
    notchArea: notch ? p.plinth * p.cutout : 0,
    note: notch
      ? `full height and depth; notch ${p.cutout} × ${p.plinth} mm out of the back-bottom corner to clear skirting`
      : 'full height and depth',
  }, {
    part: 'Bottom', qty: 1, len: innerW, wid: p.depth, t: T,
    note: 'sits on top of the plinth zone, flush with the side fronts',
  }, {
    part: 'Top', qty: 1, len: innerW, wid: p.depth, t: T,
    note: 'flush with the side fronts',
  }];
  if (p.plinth > 0) rows.push({
    part: 'Plinth rail', qty: 1, len: innerW, wid: p.plinth, t: T,
    note: `kick board: stands on edge under the bottom, front face set back ${p.setback} mm`,
  });
  if (p.shelves > 0) rows.push({
    part: 'Shelf', qty: p.shelves, len: innerW, wid: shelfD, t: T,
    note: `front set back ${p.setback} mm${p.back ? '; 6 mm shallower to clear the back' : ''}`,
  });
  if (p.back) rows.push({
    part: 'Back', qty: 1, len: innerW, wid: p.height - p.plinth - 2 * T, t: BACK_T,
    note: 'thin ply, inset within the frame between bottom and top',
  });
  return rows;
}

function buildUnit() {
  if (unit) {
    scene.remove(unit);
    unit.traverse((o) => o.geometry?.dispose());
  }
  unit = new THREE.Group();
  const p = params;
  const { width: W, depth: D, height: H, thickness: T, plinth, cutout, setback } = p;
  const innerW = W - 2 * T;

  // sides: full height + depth, notched for the skirting; shape x runs
  // back->front so rotate local +x onto world +z and extrude inward
  for (const sx of [-1, 1]) {
    const side = sidePanel(D, H, T, plinth, cutout);
    side.rotation.y = -Math.PI / 2;
    side.position.set((sx === 1 ? W / 2 : -W / 2 + T) * MM, 0, -D / 2 * MM);
    unit.add(side);
  }
  // bottom shelf sits on top of the plinth zone; top closes the carcass — both
  // flush with the side fronts
  const bottom = panel(innerW, D, T);
  bottom.position.set(0, (plinth + T / 2) * MM, 0);
  unit.add(bottom);
  const top = panel(innerW, D, T);
  top.position.set(0, (H - T / 2) * MM, 0);
  unit.add(top);
  // plinth front rail, set back behind the side fronts
  if (plinth > 0) {
    const rail = panel(innerW, plinth, T);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(0, plinth / 2 * MM, (D / 2 - setback - T / 2) * MM);
    unit.add(rail);
  }
  // internal shelves: evenly spaced in the cavity, set back at the front and
  // clear of the back panel when fitted
  const n = p.shelves;
  const shelfD = D - setback - (p.back ? BACK_T : 0);
  const zC = ((p.back ? BACK_T : 0) - setback) / 2;
  const cavity = H - plinth - 2 * T;
  const bay = (cavity - n * T) / (n + 1);
  for (let i = 0; i < n; i++) {
    const s = panel(innerW, shelfD, T);
    s.position.set(0, (plinth + T + (i + 1) * bay + i * T + T / 2) * MM, zC * MM);
    unit.add(s);
  }
  // optional thin back, inset within the frame between bottom and top
  if (p.back) {
    const bH = H - plinth - 2 * T;
    const b = panel(innerW, bH, BACK_T);
    b.rotation.x = Math.PI / 2;
    b.position.set(0, (plinth + T + bH / 2) * MM, (-D / 2 + BACK_T / 2) * MM);
    unit.add(b);
  }
  scene.add(unit);
  controls.target.set(0, H / 2 * MM, 0);
  // if the unit outgrew the frame, dolly the camera back along its current
  // direction (never pull in — the user owns the camera otherwise)
  const minDist = Math.hypot(W, H, D) * MM * 1.25;
  const v = camera.position.clone().sub(controls.target);
  if (v.length() < minDist) {
    v.setLength(minDist);
    camera.position.copy(controls.target).add(v);
  }

  renderReadout();
}

// Everything the readout, the CSV and the PDF report derives from the same
// cutList() rows + these shared figures, so no two outputs can disagree.
function derived(p) {
  const rows = cutList(p);
  const n = p.shelves;
  const bay = (p.height - p.plinth - 2 * p.thickness - n * p.thickness) / (n + 1);
  const vol = rows.reduce((a, r) => a + r.qty * (r.len * r.wid - (r.notchArea ?? 0)) * r.t, 0) * 1e-9; // mm3 -> m3
  const panels = rows.reduce((a, r) => a + r.qty, 0);
  return { rows, n, bay, vol, panels };
}

function statsFor({ bay, n, vol, panels }) {
  const p = params;
  return [
    [`${p.width} × ${p.depth} × ${p.height}`, 'External W × D × H (mm)'],
    [`${Math.round(bay)} mm`, `Clear height per bay (${n + 1} ${n ? 'bays' : 'bay'})`],
    [`${(vol * 1000).toFixed(1)} L`, `Ply volume (${panels} panels)`],
    [`≈ ${(vol * DENSITY).toFixed(1)} kg`, 'Weight at 680 kg/m³'],
  ];
}

function renderReadout() {
  const p = params;
  const d = derived(p);
  renderCutList(d.rows);
  $('#readout').innerHTML = statsFor(d)
    .map(([v, l]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`)
    .join('');
  $('#note').textContent = p.shelves >= maxShelves(p)
    ? `Shelf count is capped at ${maxShelves(p)} for this height/plinth/thickness so each bay keeps ≥ ${MIN_BAY} mm clear.`
    : '';
}

function renderCutList(rows) {
  $('#cutlist').innerHTML = `
    <thead><tr><th>Part</th><th>Qty</th><th>L × W (mm)</th><th>T</th></tr></thead>
    <tbody>${rows.map((r) => `
      <tr>
        <td><div>${r.part}</div><div class="muted note">${r.note}</div></td>
        <td>${r.qty}</td>
        <td class="num">${r.len} × ${r.wid}</td>
        <td class="num">${r.t}</td>
      </tr>`).join('')}</tbody>`;
}

// --- CSV download ------------------------------------------------------------------
const csvEscape = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function cutListCsv(p) {
  const spec = `Bookshelf ${p.width} × ${p.depth} × ${p.height} mm — plinth ${p.plinth}, ` +
    `skirting cutout ${p.cutout}, front setback ${p.setback}, ply ${p.thickness} mm, ` +
    `${p.shelves} shelves, back ${p.back ? 'yes (6 mm)' : 'no'}`;
  const lines = [
    [spec], [],
    ['Part', 'Qty', 'Length (mm)', 'Width (mm)', 'Thickness (mm)', 'Notes'],
    ...cutList(p).map((r) => [r.part, r.qty, r.len, r.wid, r.t, r.note]),
  ];
  // Excel guesses Windows-1252 for CSVs without a BOM, mangling × and — into
  // "Ã—"/"â€”". Emit plain ASCII and prepend a BOM (at the Blob) so every
  // opener agrees.
  return lines.map((cols) => cols.map((c) => csvEscape(String(c))).join(',')).join('\r\n')
    .replace(/×/g, 'x').replace(/—/g, '-') + '\r\n';
}

$('#downloadCsv').addEventListener('click', () => {
  const blob = new Blob(['﻿' + cutListCsv(params)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bookshelf-cutlist-${params.width}x${params.depth}x${params.height}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// --- PDF download ------------------------------------------------------------------
// Renders the live scene once at a canonical three-quarter view (white sky,
// print-friendly), independent of wherever the user has orbited.
function captureCamera(aspect) {
  const cam = new THREE.PerspectiveCamera(42, aspect, 0.05, 50);
  const p = params;
  const target = new THREE.Vector3(0, p.height / 2 * MM, 0);
  const dir = new THREE.Vector3(0.72, 0.5, 1).normalize();
  cam.position.copy(target).addScaledVector(dir, Math.hypot(p.width, p.height, p.depth) * MM * 1.45);
  cam.lookAt(target);
  return cam;
}

// JPEG: the white-sky capture has no alpha, and PNG would be ~10× larger.
function captureView(w, h) {
  const prevBg = scene.background;
  scene.background = new THREE.Color('#ffffff');
  try {
    // preferred: a throwaway offscreen renderer at a fixed 4:3 size
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    try {
      r.setSize(w, h);
      r.setPixelRatio(1);
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.render(scene, captureCamera(w / h));
      return { data: r.domElement.toDataURL('image/jpeg', 0.88), w, h };
    } finally {
      r.dispose();
      r.forceContextLoss?.();
    }
  } catch (err) {
    // Many phones refuse a second WebGL context. Reuse the live canvas
    // instead: draw one frame with the brochure camera, read it back
    // synchronously (valid before the browser composites, even without
    // preserveDrawingBuffer), then put the interactive view straight back.
    console.warn('offscreen capture failed, reusing the main canvas', err);
    const el = renderer.domElement;
    renderer.render(scene, captureCamera(el.width / el.height));
    const data = el.toDataURL('image/jpeg', 0.88);
    renderer.render(scene, camera);
    return { data, w: el.width, h: el.height };
  } finally {
    scene.background = prevBg;
  }
}

$('#downloadPdf').addEventListener('click', async () => {
  const btn = $('#downloadPdf');
  btn.disabled = true;
  btn.textContent = 'Building PDF…';
  try {
    const { downloadPdf } = await import('./pdf.js?v=dev');
    const d = derived(params);
    await downloadPdf({
      p: { ...params, backT: BACK_T },
      rows: d.rows,
      stats: statsFor(d),
      totals: `${d.panels} panels  ·  ${(d.vol * 1000).toFixed(1)} L of ply  ·  ≈ ${(d.vol * DENSITY).toFixed(1)} kg`,
      image: captureView(1296, 972),
    });
  } catch (err) {
    console.error(err);
    // phones have no reachable console: put the actual error on the page
    $('#note').textContent = `PDF failed: ${err?.message || err}`;
  } finally {
    btn.textContent = 'Download PDF';
    btn.disabled = false;
  }
});

// --- controls wiring ---------------------------------------------------------------
function clampShelves() {
  const cap = maxShelves(params);
  if (params.shelves > cap) params.shelves = cap;
  const ctl = document.querySelector('[data-param="shelves"]');
  for (const input of ctl.querySelectorAll('input')) input.value = params.shelves;
}

for (const ctl of document.querySelectorAll('.ctl[data-param]')) {
  const name = ctl.dataset.param;
  const [slider, num] = ctl.querySelectorAll('input');
  const apply = (raw) => {
    const v = Math.min(+slider.max, Math.max(+slider.min, Math.round(+raw) || +slider.min));
    params[name] = v;
    slider.value = v; num.value = v;
    clampShelves();
    buildUnit();
  };
  slider.addEventListener('input', () => apply(slider.value));
  // while typing, only apply once the value is in range; clamp fully on commit
  num.addEventListener('input', () => {
    const v = +num.value;
    if (num.value !== '' && v >= +slider.min && v <= +slider.max) apply(v);
  });
  num.addEventListener('change', () => apply(num.value));
}
$('#thickness').addEventListener('input', (e) => { params.thickness = +e.target.value; clampShelves(); buildUnit(); });
$('#back').addEventListener('input', (e) => { params.back = e.target.checked; buildUnit(); });

// --- render loop -------------------------------------------------------------------
function resize() {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement;
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

buildUnit();
resize();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
