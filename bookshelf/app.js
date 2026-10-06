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
  setback: 20,             // mm, shelf fronts + toe rail behind the side fronts
  thickness: 18, back: false,
  qty: 1,                  // bookcases to build: cut list totals + combined nesting
  nest: 'strip',           // 'strip' (straight cuts) or 'maxrects' (CNC freeform)
  trim: 10,                // mm shaved off every sheet edge before nesting
  kerf: 4,                 // mm the saw blade eats between cuts
  grain: {},               // per part name: 'long' | 'short' | 'any' (default 'long')
};

// --- procedural textures --------------------------------------------------------
// Birch face: pale with faint long grain streaks. Birch edge: the laminated
// stripe that makes ply read as ply. Concrete: multi-scale grey noise, used as
// both colour and bump.
// Birch face, drawn rather than downloaded (zero network cost): warm tonal
// drift, long wavy grain in loose clusters, the short dark lens-shaped
// flecks characteristic of birch, and fine pore speckle.
function faceTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#ecdcb6';
  g.fillRect(0, 0, S, S);
  // broad warm/pale drift so large faces do not read as one flat colour
  for (let i = 0; i < 26; i++) {
    const r = 120 + Math.random() * 420;
    const x = Math.random() * S, y = Math.random() * S;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, Math.random() < 0.5
      ? `rgba(213,185,134,${0.04 + Math.random() * 0.07})`
      : `rgba(250,243,224,${0.05 + Math.random() * 0.08})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // grain: long wavy streaks running along x, in loose clusters
  let gy = -10;
  while (gy < S + 10) {
    const cluster = 1 + Math.floor(Math.random() * 4);
    for (let k = 0; k < cluster; k++) {
      const y0 = gy + k * (2 + Math.random() * 5);
      const amp = 1.5 + Math.random() * 5;
      const wl = 260 + Math.random() * 640;
      const ph = Math.random() * Math.PI * 2;
      const a = 0.08 + Math.random() * 0.13;
      g.strokeStyle = Math.random() < 0.72
        ? `rgba(180,144,90,${a})` : `rgba(250,241,218,${a + 0.03})`;
      g.lineWidth = 0.7 + Math.random() * 1.5;
      g.beginPath();
      for (let x = -8; x <= S + 8; x += 7) {
        const yy = y0 + amp * Math.sin((x / wl) * Math.PI * 2 + ph) + Math.sin(x * 0.05 + ph) * 0.6;
        if (x === -8) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.stroke();
    }
    gy += 6 + Math.random() * 26;
  }
  // birch flecks: small dark lenses lying along the grain
  for (let i = 0; i < 130; i++) {
    g.fillStyle = `rgba(146,108,62,${0.08 + Math.random() * 0.12})`;
    g.beginPath();
    g.ellipse(Math.random() * S, Math.random() * S, 4 + Math.random() * 14,
      0.8 + Math.random() * 1.1, (Math.random() - 0.5) * 0.06, 0, Math.PI * 2);
    g.fill();
  }
  // fine pore speckle
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(160,130,80,${0.015 + Math.random() * 0.035})`;
    g.fillRect(Math.random() * S, Math.random() * S, 1.3, 1.3);
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

// One un-tiled 2048px canvas covering the whole slab — the old version tiled
// a 1024px texture 2×2, and the tile boundaries read as straight join lines
// in the concrete. Trowel sweeps, aggregate, pinholes and stains for interest.
function concreteTexture() {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#c5c9ce';
  g.fillRect(0, 0, S, S);
  // broad tonal patches
  for (let i = 0; i < 90; i++) {
    const r = 140 + Math.random() * 560;
    const x = Math.random() * S, y = Math.random() * S;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const tone = ['174,178,185', '204,208,214', '189,195,202'][Math.floor(Math.random() * 3)];
    grad.addColorStop(0, `rgba(${tone},${0.07 + Math.random() * 0.10})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // faint circular trowel sweeps
  for (let i = 0; i < 12; i++) {
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '160,164,171' : '214,218,224'},${0.025 + Math.random() * 0.035})`;
    g.lineWidth = 26 + Math.random() * 70;
    const a0 = Math.random() * Math.PI * 2;
    g.beginPath();
    g.arc(Math.random() * S, Math.random() * S, 240 + Math.random() * 720, a0, a0 + 0.5 + Math.random() * 1.3);
    g.stroke();
  }
  // watery stains
  for (let i = 0; i < 7; i++) {
    const r = 80 + Math.random() * 240;
    const x = Math.random() * S, y = Math.random() * S;
    const grad = g.createRadialGradient(x, y, r * 0.55, x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.85, `rgba(120,124,132,${0.05 + Math.random() * 0.06})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // aggregate speckle
  for (let i = 0; i < 42000; i++) {
    const v = 148 + Math.floor(Math.random() * 84);
    g.fillStyle = `rgba(${v},${v},${v + 4},${0.10 + Math.random() * 0.22})`;
    g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6);
  }
  // pinholes (dark air pockets)
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(92,96,104,${0.10 + Math.random() * 0.18})`;
    g.beginPath();
    g.arc(Math.random() * S, Math.random() * S, 0.6 + Math.random() * 1.8, 0, Math.PI * 2);
    g.fill();
  }
  // a few hairline cracks
  g.strokeStyle = 'rgba(116,120,127,0.20)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    let x = Math.random() * S, y = Math.random() * S;
    g.moveTo(x, y);
    for (let s = 0; s < 10; s++) { x += (Math.random() - 0.5) * 260; y += (Math.random() - 0.5) * 260; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;   // drawn once, never tiled: no seams
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
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
key.shadow.camera.left = key.shadow.camera.bottom = -2.6;
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

// The key light is fixed RELATIVE TO THE CAMERA — raised and rotated ~30° to
// the left of the view direction — so orbiting sweeps light and shadows
// across the unit instead of the lighting staying glued to the model.
const UPV = new THREE.Vector3(0, 1, 0);
const keyVec = new THREE.Vector3();
function aimKeyLight(camPos, target) {
  keyVec.copy(camPos).sub(target);
  keyVec.applyAxisAngle(UPV, 0.55);
  keyVec.y = Math.max(keyVec.y, keyVec.length() * 0.45);
  key.position.copy(target).add(keyVec.setLength(5));
}

const fill = new THREE.DirectionalLight(0xdde8f5, 0.45);
fill.position.set(-2.2, 1.4, -1.6);
scene.add(fill);
// soft frontal light so bay interiors stay readable (no shadow: it is a fill)
const front = new THREE.DirectionalLight(0xf2ead9, 0.5);
front.position.set(0.4, 1.6, 3.2);
scene.add(front);

// sharper oblique sampling for the big face + floor textures
const maxAniso = renderer.capabilities.getMaxAnisotropy();
faceMat.map.anisotropy = maxAniso;
faceMat.map.needsUpdate = true;

// rough concrete hexagon slab
const concrete = concreteTexture();
concrete.anisotropy = maxAniso;
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
// The back is rebated into the sides, top and bottom: the rebate laps 3/4 of
// the main ply thickness into each panel, and is cut 1 mm deeper than the
// back ply so the back sits 1 mm below flush with the rear edges.
function backJoint(p) {
  return { lap: 0.75 * p.thickness, reb: BACK_T + 1 };
}

function cutList(p) {
  const T = p.thickness;
  const innerW = p.width - 2 * T;
  const { lap, reb } = backJoint(p);
  const shelfD = p.depth - p.setback - (p.back ? reb : 0);
  const notch = p.plinth > 0 && p.cutout > 0;
  // material a rear rebate removes, per mm of rebate length (mm3/mm)
  const rebCut = p.back ? lap * reb : 0;
  const rebNote = p.back ? `; ${lap} × ${reb} mm rebate along the rear inside edge for the back` : '';
  const rows = [{
    part: 'Side', qty: 2, len: p.height, wid: p.depth, t: T,
    notchArea: notch ? p.plinth * p.cutout : 0,
    cutVol: rebCut * p.height,
    note: (notch
      ? `full height and depth; notch ${p.cutout} × ${p.plinth} mm out of the back-bottom corner to clear skirting`
      : 'full height and depth') + rebNote,
  }, {
    part: 'Bottom', qty: 1, len: innerW, wid: p.depth, t: T,
    cutVol: rebCut * innerW,
    note: 'sits on top of the plinth zone, flush with the side fronts' + rebNote,
  }, {
    part: 'Top', qty: 1, len: innerW, wid: p.depth, t: T,
    cutVol: rebCut * innerW,
    note: 'flush with the side fronts' + rebNote,
  }];
  if (p.plinth > 0) rows.push({
    part: 'Toe rail', qty: 1, len: innerW, wid: p.plinth, t: T,
    note: `kick board: stands on edge under the bottom, front face set back ${p.setback} mm`,
  });
  if (p.shelves > 0) rows.push({
    part: 'Shelf', qty: p.shelves, len: innerW, wid: shelfD, t: T,
    note: `front set back ${p.setback} mm${p.back ? `; ${reb} mm shallower to clear the rebated back` : ''}`,
  });
  if (p.back) rows.push({
    part: 'Back', qty: 1, len: innerW + 2 * lap, wid: p.height - p.plinth - 2 * T + 2 * lap, t: BACK_T,
    note: `thin ply, rebated in on all four edges: ${lap} mm lap, rebate ${reb} mm deep seats it 1 mm below flush`,
  });
  return rows;
}

// --- sheet nesting -----------------------------------------------------------------
// Sheets of 2440 × 1220 per thickness. Two packers share one search driver:
// 'strip' keeps every layout cuttable with straight through-cuts (panel/track
// saw); 'maxrects' nests freeform rectangles (tighter, suits a CNC). Each
// nest tries a portfolio of part orderings — five deterministic sorts plus
// seeded shuffles — and keeps the best result: fewest sheets, then the
// emptiest final sheet (biggest reusable offcut). Everything is seeded, so
// the same inputs always produce the same layout.
const SHEET_L = 2440, SHEET_W = 1220;

// mulberry32: tiny deterministic PRNG for the shuffled orderings
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function orderings(parts) {
  const by = (cmp) => parts.slice().sort(cmp);
  const list = [
    by((a, b) => b.W - a.W || b.L - a.L),
    by((a, b) => b.L - a.L || b.W - a.W),
    by((a, b) => b.L * b.W - a.L * a.W),
    by((a, b) => (b.L + b.W) - (a.L + a.W)),
    by((a, b) => Math.max(b.L, b.W) - Math.max(a.L, a.W)),
  ];
  const shuffles = parts.length > 60 ? 60 : 200;   // keep big jobs responsive
  for (let s = 1; s <= shuffles; s++) {
    const rnd = mulberry32(s);
    const arr = parts.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    list.push(arr);
  }
  return list;
}

// Sheet grain runs along the 2440 length, so a part's grain policy fixes its
// placement: 'long' = grain along the part's long edge (long edge along the
// sheet, the default), 'short' = grain along its short edge (forced rotated),
// 'any' = maximise nest — the packer orients each instance independently.
function orientationsOf(pt) {
  const long = { l: pt.L, w: pt.W, rot: false };
  const short = { l: pt.W, w: pt.L, rot: true };
  if (pt.grain === 'short') return [short];
  if (pt.grain === 'any') return pt.L === pt.W ? [long] : [long, short];
  return [long];
}

// Strip nest: strips run the sheet length, so every edge is a straight
// through-cut. Kerf is handled by inflating footprints against an inflated
// sheet, so a part may finish flush with a sheet edge.
function packStrip(parts, SL, SW, K) {
  const sheets = [];   // { usedW, strips: [{ y, W, usedL }], placed: [] }
  for (const pt of parts) {
    const os = orientationsOf(pt);
    let sh = null, st = null, o = null;
    outer:
    for (const cand of sheets) {
      for (const strip of cand.strips) {
        for (const ori of os) {
          if (ori.w <= strip.W && strip.usedL + ori.l <= SL) { sh = cand; st = strip; o = ori; break outer; }
        }
      }
      for (const ori of os) {
        if (cand.usedW + ori.w <= SW && ori.l <= SL) { sh = cand; o = ori; break outer; }
      }
    }
    if (!sh) {
      sh = { usedW: 0, strips: [], placed: [] };
      sheets.push(sh);
      o = os.find((ori) => ori.l <= SL && ori.w <= SW);
      if (!o) continue;   // unfittable parts are filtered out before packing
    }
    if (!st) {
      st = { y: sh.usedW, W: o.w, usedL: 0 };
      sh.strips.push(st);
      sh.usedW += o.w + K;
    }
    sh.placed.push({ x: st.usedL, y: st.y, L: o.l, W: o.w, rotated: o.rot, label: pt.label, unit: pt.unit });
    st.usedL += o.l + K;
  }
  return sheets;
}

// MaxRects (best-short-side-fit): classic freeform rectangle nesting. The
// stepped layouts pack tighter but need a CNC or a patient tracksaw.
function packMaxRects(parts, SL, SW, K) {
  const sheets = [];   // { free: [{x,y,w,h}], placed: [] }
  const place = (sh, fr, o, pt) => {
    const used = { x: fr.x, y: fr.y, w: o.l + K, h: o.w + K };
    sh.placed.push({ x: used.x, y: used.y, L: o.l, W: o.w, rotated: o.rot, label: pt.label, unit: pt.unit });
    const next = [];
    for (const r of sh.free) {
      if (used.x >= r.x + r.w || used.x + used.w <= r.x || used.y >= r.y + r.h || used.y + used.h <= r.y) {
        next.push(r);
        continue;
      }
      if (used.x > r.x) next.push({ x: r.x, y: r.y, w: used.x - r.x, h: r.h });
      if (used.x + used.w < r.x + r.w) next.push({ x: used.x + used.w, y: r.y, w: r.x + r.w - used.x - used.w, h: r.h });
      if (used.y > r.y) next.push({ x: r.x, y: r.y, w: r.w, h: used.y - r.y });
      if (used.y + used.h < r.y + r.h) next.push({ x: r.x, y: used.y + used.h, w: r.w, h: r.y + r.h - used.y - used.h });
    }
    // drop free rects contained in another (ties keep the first)
    sh.free = next.filter((a, i) => !next.some((b, j) => j !== i &&
      (b.w * b.h > a.w * a.h || (b.w * b.h === a.w * a.h && j < i)) &&
      b.x <= a.x && b.y <= a.y && b.x + b.w >= a.x + a.w && b.y + b.h >= a.y + a.h));
  };
  for (const pt of parts) {
    const os = orientationsOf(pt);
    let best = null;
    for (const sh of sheets) {
      for (const fr of sh.free) {
        for (const o of os) {
          if (o.l + K <= fr.w && o.w + K <= fr.h) {
            const score = Math.min(fr.w - o.l - K, fr.h - o.w - K);
            if (!best || score < best.score) best = { sh, fr, o, score };
          }
        }
      }
    }
    if (!best) {
      const sh = { free: [{ x: 0, y: 0, w: SL + K, h: SW + K }], placed: [] };
      sheets.push(sh);
      const fr = sh.free[0];
      const o = os.find((ori) => ori.l + K <= fr.w && ori.w + K <= fr.h);
      if (!o) continue;
      best = { sh, fr, o };
    }
    place(best.sh, best.fr, best.o, pt);
  }
  return sheets;
}

// All bookcases' parts are nested together (one combined pool per thickness),
// which packs sheets tighter than nesting each bookcase separately. Each part
// remembers which bookcase it belongs to when more than one is being built.
// opts: { mode: 'strip'|'maxrects', trim: mm off every sheet edge,
//         grain: { partName: 'long'|'short'|'any' } }
function nestSheets(rows, units = 1, opts = {}) {
  const mode = opts.mode ?? 'strip';
  const trim = Math.max(0, opts.trim ?? 0);
  const kerf = Math.min(25, Math.max(0, opts.kerf ?? 4));
  const grain = opts.grain ?? {};
  const SL = SHEET_L - 2 * trim, SW = SHEET_W - 2 * trim;
  const byT = {};
  for (let u = 1; u <= units; u++) {
    for (const r of rows) {
      for (let i = 0; i < r.qty; i++) {
        (byT[r.t] ??= []).push({
          L: Math.max(r.len, r.wid), W: Math.min(r.len, r.wid), label: r.part,
          unit: units > 1 ? u : undefined, grain: grain[r.part] ?? 'long',
        });
      }
    }
  }
  const pack = mode === 'maxrects' ? packMaxRects : packStrip;
  return Object.keys(byT).map(Number).sort((a, b) => b - a).map((t) => {
    const all = byT[t];
    const fits = (pt) => orientationsOf(pt).some((o) => o.l <= SL && o.w <= SW);
    const oversize = all.filter((pt) => !fits(pt)).length;
    const pool = all.filter(fits);
    let best = null, runs = 0;
    for (const order of orderings(pool)) {
      const sheets = pack(order, SL, SW, kerf);
      runs++;
      const lastUsed = sheets.length
        ? sheets[sheets.length - 1].placed.reduce((a, q) => a + q.L * q.W, 0) : 0;
      if (!best || sheets.length < best.sheets.length ||
          (sheets.length === best.sheets.length && lastUsed < best.lastUsed)) {
        best = { sheets, lastUsed };
      }
    }
    const sheets = best ? best.sheets : [];
    const area = pool.reduce((a, pt) => a + pt.L * pt.W, 0);
    const used = sheets.length ? Math.round(100 * area / (sheets.length * SHEET_L * SHEET_W)) : 0;
    // per-sheet usage (of a full sheet): the distribution is what separates a
    // consolidating nest (fuller early sheets, one nearly-empty last sheet =
    // big reusable offcut) from an evenly-smeared one at the same overall %
    const usage = sheets.map((sh) =>
      Math.round(100 * sh.placed.reduce((a, q) => a + q.L * q.W, 0) / (SHEET_L * SHEET_W)));
    return { t, n: sheets.length, parts: all.length, used, usage, oversize,
             sheets: sheets.map((sh) => sh.placed), runs, mode, trim, kerf };
  });
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
  // clear of the rebated back when fitted
  const n = p.shelves;
  const { lap, reb } = backJoint(p);
  const backClear = p.back ? reb : 0;
  const shelfD = D - setback - backClear;
  const zC = (backClear - setback) / 2;
  const cavity = H - plinth - 2 * T;
  const bay = (cavity - n * T) / (n + 1);
  for (let i = 0; i < n; i++) {
    const s = panel(innerW, shelfD, T);
    s.position.set(0, (plinth + T + (i + 1) * bay + i * T + T / 2) * MM, zC * MM);
    unit.add(s);
  }
  // optional thin back, rebated into sides, top and bottom: oversized by the
  // lap on each edge, rear face 1 mm inside the carcass rear. (The grooves
  // themselves are not modelled — the back's edges sit inside the solid
  // panels, which renders identically from any normal viewpoint.)
  if (p.back) {
    const bW = innerW + 2 * lap;
    const bH = H - plinth - 2 * T + 2 * lap;
    const b = panel(bW, bH, BACK_T);
    b.rotation.x = Math.PI / 2;
    b.position.set(0, (plinth + T - lap + bH / 2) * MM, (-D / 2 + 1 + BACK_T / 2) * MM);
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
  const vol = rows.reduce((a, r) =>
    a + r.qty * ((r.len * r.wid - (r.notchArea ?? 0)) * r.t - (r.cutVol ?? 0)), 0) * 1e-9; // mm3 -> m3
  const panels = rows.reduce((a, r) => a + r.qty, 0);
  return { rows, n, bay, vol, panels };
}

function statsFor({ bay, n, vol, panels }) {
  const p = params, q = p.qty;
  return [
    [`${p.width} × ${p.depth} × ${p.height}`, 'External W × D × H (mm)'],
    [`${Math.round(bay)} mm`, `Clear height per bay (${n + 1} ${n ? 'bays' : 'bay'})`],
    [`${(vol * q * 1000).toFixed(1)} L`,
      q > 1 ? `Ply volume (${panels * q} panels, ${q} bookcases)` : `Ply volume (${panels} panels)`],
    [`≈ ${(vol * q * DENSITY).toFixed(1)} kg`,
      q > 1 ? `Weight of all ${q} at 680 kg/m³` : 'Weight at 680 kg/m³'],
  ];
}

const nestOpts = () => ({ mode: params.nest, trim: params.trim, kerf: params.kerf, grain: params.grain });

const median = (arr) => {
  const s2 = [...arr].sort((a, b) => a - b);
  const m = s2.length >> 1;
  return s2.length % 2 ? s2[m] : Math.round((s2[m - 1] + s2[m]) / 2);
};

function renderSheets(nest) {
  $('#sheets').innerHTML = nest.map((s) => {
    const last = s.usage[s.n - 1];
    const dist = s.n > 1
      ? `min ${Math.min(...s.usage)}% · median ${median(s.usage)}% · last ${last}%`
      : s.n === 1 ? `${last}% used` : '';
    return `
    <div class="stat">
      <div class="v">${s.n} ${s.n === 1 ? 'sheet' : 'sheets'}</div>
      <div class="l">${s.t} mm ply — ${s.parts} ${s.parts === 1 ? 'part' : 'parts'}, ${s.used}% used overall${s.oversize
        ? ` (+${s.oversize} too big for a sheet)` : ''}</div>
      <div class="sbars">${s.usage.map((u, i) =>
        `<div class="sbar" title="sheet ${i + 1}: ${u}% used"><i style="width:${u}%"></i></div>`).join('')}</div>
      ${s.n ? `<div class="l">${dist} — ≈${100 - last}% of the last sheet spare</div>` : ''}
    </div>`;
  }).join('');
  const g = nest[0];
  $('#nestnote').textContent = g
    ? `${g.mode === 'maxrects' ? 'CNC freeform nest (MaxRects)' : 'Straight-cut strip nest (guillotine)'} — ` +
      `best of ${g.runs} part orderings · ${g.kerf} mm kerf${g.trim ? ` · ${g.trim} mm edge trim` : ''} · ` +
      'grain per part as set in the cut list.'
    : '';
}

function renderReadout() {
  const p = params;
  const d = derived(p);
  renderCutList(d.rows);
  renderSheets(nestSheets(d.rows, p.qty, nestOpts()));
  $('#readout').innerHTML = statsFor(d)
    .map(([v, l]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`)
    .join('');
  $('#note').textContent = p.shelves >= maxShelves(p)
    ? `Shelf count is capped at ${maxShelves(p)} for this height/plinth/thickness so each bay keeps ≥ ${MIN_BAY} mm clear.`
    : '';
}

function renderCutList(rows) {
  const q = params.qty;
  const grainRow = (part) => {
    const g = params.grain[part] ?? 'long';
    const opt = (v, label, title) => `
      <label title="${title}"><input type="radio" name="grain-${part}" value="${v}"
        data-grain="${part}"${g === v ? ' checked' : ''}>${label}</label>`;
    return `<div class="grain"><span class="muted">grain:</span>
      ${opt('long', 'long edge', 'grain along the long edge — long edge along the sheet')}
      ${opt('short', 'short edge', 'grain along the short edge — part always rotated 90°')}
      ${opt('any', 'max nest', 'either direction — the nest may orient each piece differently')}
    </div>`;
  };
  $('#cutlist').innerHTML = `
    <thead><tr><th>Part</th><th title="per bookcase">Qty</th><th title="all ${q} bookcases">Total</th><th>L × W (mm)</th><th>T</th></tr></thead>
    <tbody>${rows.map((r) => `
      <tr>
        <td><div>${r.part}</div><div class="muted note">${r.note}</div>${grainRow(r.part)}</td>
        <td>${r.qty}</td>
        <td>${r.qty * q}</td>
        <td class="num">${r.len} × ${r.wid}</td>
        <td class="num">${r.t}</td>
      </tr>`).join('')}</tbody>`;
}

// --- CSV download ------------------------------------------------------------------
const csvEscape = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function cutListCsv(p) {
  const spec = `Bookshelf ${p.width} × ${p.depth} × ${p.height} mm — plinth ${p.plinth}, ` +
    `skirting cutout ${p.cutout}, front setback ${p.setback}, ply ${p.thickness} mm, ` +
    `${p.shelves} shelves, back ${p.back ? 'yes (6 mm)' : 'no'}, quantity ${p.qty}`;
  const lines = [
    [spec], [],
    ['Part', 'Qty per bookcase', 'Total qty', 'Length (mm)', 'Width (mm)', 'Thickness (mm)', 'Grain', 'Notes'],
    ...cutList(p).map((r) => [r.part, r.qty, r.qty * p.qty, r.len, r.wid, r.t,
      { long: 'along long edge', short: 'along short edge', any: 'either (max nest)' }[p.grain[r.part] ?? 'long'], r.note]),
  ];
  // Excel guesses Windows-1252 for CSVs without a BOM, mangling × and — into
  // "Ã—"/"â€”". Emit plain ASCII and prepend a BOM (at the Blob) so every
  // opener agrees.
  return lines.map((cols) => cols.map((c) => csvEscape(String(c))).join(',')).join('\r\n')
    .replace(/×/g, 'x').replace(/—/g, '-') + '\r\n';
}

// local-time yyyymmdd_hhmmss, so repeat downloads sort chronologically
function stamp() {
  const d = new Date(), z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

const nameCore = () =>
  `${params.width}x${params.depth}x${params.height}${params.qty > 1 ? `-q${params.qty}` : ''}`;

$('#downloadCsv').addEventListener('click', () => {
  const blob = new Blob(['﻿' + cutListCsv(params)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bookshelf-cutlist-${nameCore()}-${stamp()}.csv`;
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
  // aim the camera-locked key light for the brochure viewpoint; the
  // animation loop re-aims it for the interactive camera on the next frame
  const capTarget = new THREE.Vector3(0, params.height / 2 * MM, 0);
  try {
    // preferred: a throwaway offscreen renderer at a fixed 4:3 size
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    try {
      r.setSize(w, h);
      r.setPixelRatio(1);
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      const cam = captureCamera(w / h);
      aimKeyLight(cam.position, capTarget);
      r.render(scene, cam);
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
    const cam = captureCamera(el.width / el.height);
    aimKeyLight(cam.position, capTarget);
    renderer.render(scene, cam);
    const data = el.toDataURL('image/jpeg', 0.88);
    aimKeyLight(camera.position, controls.target);
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
    const q = params.qty;
    await downloadPdf({
      p: { ...params, backT: BACK_T },
      rows: d.rows,
      stats: statsFor(d),
      totals: (q > 1 ? `${q} bookcases  ·  ` : '') +
        `${d.panels * q} panels  ·  ${(d.vol * q * 1000).toFixed(1)} L of ply  ·  ≈ ${(d.vol * q * DENSITY).toFixed(1)} kg`,
      sheets: nestSheets(d.rows, q, nestOpts()),
      image: captureView(1296, 972),
      filename: `bookshelf-${nameCore()}-${stamp()}.pdf`,
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

// nesting options: none of these touch the 3D model, only the paperwork
$('#nestmode').addEventListener('input', (e) => { params.nest = e.target.value; renderReadout(); });
for (const [id, key] of [['#trim', 'trim'], ['#kerf', 'kerf']]) {
  $(id).addEventListener('input', (e) => {
    const v = Math.min(25, Math.max(0, Math.round(+e.target.value) || 0));
    params[key] = v;
    if (e.target.value !== '' && +e.target.value !== v) e.target.value = v;
    renderReadout();
  });
}
// per-part grain policy lives in the cut-list rows (delegated: the table is
// re-rendered wholesale, the listener survives on the table itself)
$('#cutlist').addEventListener('input', (e) => {
  const name = e.target.dataset?.grain;
  if (name === undefined) return;
  params.grain[name] = e.target.value;
  renderSheets(nestSheets(cutList(params), params.qty, nestOpts()));
});

// --- render loop -------------------------------------------------------------------
function resize() {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement;
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// The module (plus three.js) takes a moment to fetch and parse, and the
// controls are live before any listener exists. Anything the user touched in
// that window — a ticked back box, a dragged slider, a typed number — sits in
// the DOM but not in params. So boot by reading the real control state back
// out of the DOM, never by trusting the defaults above.
function syncFromDom() {
  for (const ctl of document.querySelectorAll('.ctl[data-param]')) {
    const [slider, num] = ctl.querySelectorAll('input');
    // early typing changes only the number box, early dragging only the
    // slider: trust whichever one moved away from its markup default
    const raw = num.value !== num.defaultValue ? +num.value : +slider.value;
    params[ctl.dataset.param] = Math.min(+slider.max, Math.max(+slider.min, Math.round(raw) || +slider.min));
  }
  params.thickness = +$('#thickness').value;
  params.back = $('#back').checked;
  params.nest = $('#nestmode').value;
  params.trim = Math.min(25, Math.max(0, Math.round(+$('#trim').value) || 0));
  params.kerf = Math.min(25, Math.max(0, Math.round(+$('#kerf').value) || 0));
  clampShelves();
}

syncFromDom();
buildUnit();
resize();
$('#loading')?.remove();
renderer.setAnimationLoop(() => {
  controls.update();
  aimKeyLight(camera.position, controls.target);
  renderer.render(scene, camera);
});
