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

const params = { width: 900, depth: 300, height: 1800, shelves: 4, thickness: 18, back: false };

// --- procedural birch textures -------------------------------------------------
// Face: pale birch with faint long grain streaks. Edge: the laminated stripe
// that makes ply read as ply — alternating veneer bands across the thickness.
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
scene.background = new THREE.Color('#141a21');

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 50);
camera.position.set(1.9, 1.6, 2.7);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.55;
controls.minDistance = 0.4;
controls.maxDistance = 10;

scene.add(new THREE.HemisphereLight(0xbfd4e5, 0x3a3228, 1.15));
const key = new THREE.DirectionalLight(0xfff2dd, 2.0);
key.position.set(2.4, 3.4, 1.9);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -2.2;
key.shadow.camera.right = key.shadow.camera.top = 2.6;
key.shadow.bias = -0.0004;
scene.add(key);
const fill = new THREE.DirectionalLight(0xdde8f5, 0.5);
fill.position.set(-2.2, 1.4, -1.6);
scene.add(fill);
// soft frontal light so bay interiors stay readable (no shadow: it is a fill)
const front = new THREE.DirectionalLight(0xf2ead9, 0.55);
front.position.set(0.4, 1.6, 3.2);
scene.add(front);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(4, 64),
  new THREE.MeshStandardMaterial({ color: '#1c2531', roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// --- parametric build -------------------------------------------------------------
// Every panel starts as a flat box with its THICKNESS along local Y, so the two
// big faces get the face material and the four rims get the laminated edge
// material; the mesh is then rotated into place.
let unit = null;

function panel(len_mm, dep_mm, t_mm) {
  const geo = new THREE.BoxGeometry(len_mm * MM, t_mm * MM, dep_mm * MM);
  const e = edgeMat(t_mm);
  const mesh = new THREE.Mesh(geo, [e, e, faceMat, faceMat, e, e]);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// Clamp shelf count so every bay keeps at least MIN_BAY of clear height.
function maxShelves(p) {
  const cavity = p.height - 2 * p.thickness;
  return Math.max(0, Math.floor((cavity - MIN_BAY) / (p.thickness + MIN_BAY)));
}

function buildUnit() {
  if (unit) {
    scene.remove(unit);
    unit.traverse((o) => o.geometry?.dispose());
  }
  unit = new THREE.Group();
  const p = params;
  const { width: W, depth: D, height: H, thickness: T } = p;
  const innerW = W - 2 * T;

  // sides (full height; thickness rotated onto world X)
  for (const sx of [-1, 1]) {
    const side = panel(H, D, T);
    side.rotation.z = Math.PI / 2;
    side.position.set(sx * (W - T) / 2 * MM, H / 2 * MM, 0);
    unit.add(side);
  }
  // top & bottom, housed between the sides
  for (const [y] of [[T / 2], [H - T / 2]]) {
    const tb = panel(innerW, D, T);
    tb.position.set(0, y * MM, 0);
    unit.add(tb);
  }
  // shelves: evenly spaced in the internal cavity, pulled forward of the back
  const n = p.shelves;
  const shelfD = D - (p.back ? BACK_T : 0);
  const zOff = p.back ? BACK_T / 2 : 0;
  const cavity = H - 2 * T;
  const bay = (cavity - n * T) / (n + 1);
  for (let i = 0; i < n; i++) {
    const s = panel(innerW, shelfD, T);
    s.position.set(0, (T + (i + 1) * bay + i * T + T / 2) * MM, zOff * MM);
    unit.add(s);
  }
  // optional thin back, inset within the frame
  if (p.back) {
    const b = panel(innerW, H - 2 * T, BACK_T);
    b.rotation.x = Math.PI / 2;
    b.position.set(0, H / 2 * MM, (-D / 2 + BACK_T / 2) * MM);
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

  renderReadout({ innerW, shelfD, bay, n });
}

function renderReadout({ innerW, shelfD, bay, n }) {
  const p = params, T = p.thickness;
  const m3 =
    2 * (p.height * p.depth * T) +            // sides
    2 * (innerW * p.depth * T) +              // top + bottom
    n * (innerW * shelfD * T) +               // shelves
    (p.back ? innerW * (p.height - 2 * T) * BACK_T : 0);
  const vol = m3 * 1e-9;                      // mm3 -> m3
  $('#readout').innerHTML = `
    <div class="stat"><div class="v">${p.width} × ${p.depth} × ${p.height}</div><div class="l">External W × D × H (mm)</div></div>
    <div class="stat"><div class="v">${Math.round(bay)} mm</div><div class="l">Clear height per bay (${n + 1} ${n ? 'bays' : 'bay'})</div></div>
    <div class="stat"><div class="v">${(vol * 1000).toFixed(1)} L</div><div class="l">Ply volume (${4 + n + (p.back ? 1 : 0)} panels)</div></div>
    <div class="stat"><div class="v">≈ ${(vol * DENSITY).toFixed(1)} kg</div><div class="l">Weight at 680 kg/m³</div></div>`;
  $('#note').textContent = p.shelves >= maxShelves(p)
    ? `Shelf count is capped at ${maxShelves(p)} for this height/thickness so each bay keeps ≥ ${MIN_BAY} mm clear.`
    : '';
}

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
