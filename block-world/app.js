// Block World — game loop, controls and UI. Rendering lives in render.js,
// all the rules in engine.js.
import * as THREE from 'three';
import {
  W, H, D, B, BLOCKS, CATEGORIES, ITEMS, CHEST_SLOTS, POCKET_SLOTS, World, raycast, rayBox, stepEntity, updateVillager,
  headInWater, moveItem, serialize, deserialize, makeRng, key, callVillager, nearestVillager, topView, facingDir,
} from './engine.js?v=dev';
import { makeAtlas, makeIcons, WorldRenderer, makeVillagerMesh, animateVillager, propDescription, animateClocks } from './render.js?v=dev';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'block-world/save-v1';
// furniture that should face the player when placed in front of them
const FACE_PLAYER = new Set([B.CHAIR, B.SOFA, B.FRIDGE, B.COOKER, B.TOILET, B.DESK]);
const WALL_HUNG = new Set([B.SHELF, B.PAINTING, B.CLOCK, B.CAMERA]);
const NUM_LIGHTS = 8;
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
if (!isTouch) document.body.classList.add('no-touch');

// ---------- three.js setup ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 300);
camera.rotation.order = 'YXZ';
const camCam = new THREE.PerspectiveCamera(70, 1, 0.1, 300);   // security camera feed
camCam.rotation.order = 'YXZ';
const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(60, 90, 30); scene.add(sun);
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a4a3a, 1.1); scene.add(hemi);
scene.fog = new THREE.Fog(0x87ceeb, 40, 115);
const VIEW_DIST = 122;   // chunks past the fog are not drawn at all
const lamps = []; for (let i = 0; i < NUM_LIGHTS; i++) { const l = new THREE.PointLight(0xffe0a0, 0, 12, 2); scene.add(l); lamps.push(l); }
const SKY = { day: new THREE.Color(0x87ceeb), night: new THREE.Color(0x0b1030) };
const atlas = makeAtlas();
const ICONS = makeIcons(atlas, BLOCKS.filter((b) => b.placeable).map((b) => b.id));
const highlight = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x111111 }));
scene.add(highlight);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  camCam.aspect = w / h; camCam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- game state ----------
let world, wr, villagers = [], vMeshes = [], rng = makeRng(Date.now() >>> 0);
const player = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, w: 0.6, h: 1.8, onGround: false };
let yaw = 0, pitch = -0.2, riding = -1, pocket = [], night = false, dayMix = 1;
let cat = +(localStorage.getItem('block-world/cat') || 0), selId = B.GRASS, sitting = null;
let target = null;      // { kind: 'block', hit } | { kind: 'villager', i, dist }
let camViewOpen = false, camIndex = 0;

function newWorld(seed = (Math.random() * 1e9) >>> 0) {
  const w = new World(seed).generate();
  useWorld(w, { villagers: w.makeVillagers(12, makeRng(seed ^ 0x9e3779b9)), pocket: ['apple'], night: false });
}
function useWorld(w, state) {
  if (wr) { scene.remove(wr.group); wr.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  for (const m of vMeshes) scene.remove(m);
  world = w; wr = new WorldRenderer(scene, world, atlas);
  villagers = state.villagers || world.makeVillagers(7);
  vMeshes = villagers.map((v, i) => { const m = makeVillagerMesh(v, i); scene.add(m); return m; });
  pocket = state.pocket || [];
  night = !!state.night; dayMix = night ? 0 : 1; $('btnNight').classList.toggle('on', night);
  selId = BLOCKS[state.selId] && BLOCKS[state.selId].placeable ? state.selId : B.GRASS; renderHotbar();
  riding = -1; sitting = null; $('btnDismount').hidden = true;
  lightTimer = 9; cullTimer = 9;
  const p = state.player || { ...world.spawn, yaw: 0, pitch: -0.2 };
  Object.assign(player, { x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, onGround: false });
  yaw = p.yaw || 0; pitch = p.pitch ?? -0.2;
  wr.update(999);
}
function stateForSave() {
  return { player: { x: player.x, y: player.y, z: player.z, yaw, pitch }, villagers, pocket, night, selId };
}
function save(quiet = true) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(world, stateForSave())));
    if (!quiet) toast('Saved 💾');
  } catch (e) { if (!quiet) toast('Could not save: ' + e.message); }
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const { world: w, state } = deserialize(JSON.parse(raw));
    useWorld(w, state);
    if (state.migrated) { save(); setTimeout(() => toast('Your world has grown! It is now 256 blocks wide, with new land all around. 🗺️', 5000), 1500); }
    return true;
  } catch (e) { console.warn('load failed', e); return false; }
}

// ---------- UI helpers ----------
let toastTimer = 0;
function toast(msg, ms = 2200) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
const modal = $('modal'), modalBox = $('modalBox');
let modalOpen = false;
function openModal(html) { modalBox.innerHTML = html; modal.hidden = false; modalOpen = true; releaseInputs(); }
function closeModal() { modal.hidden = true; modalOpen = false; modalBox.innerHTML = ''; }
modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeModal(); });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const itemOf = (id) => ITEMS.find((i) => i.id === id) || { emoji: '❔', label: id };

function renderHotbar() {
  const hb = $('hotbar'), cb = $('catbar'); hb.innerHTML = ''; cb.innerHTML = '';
  CATEGORIES.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = i === cat ? 'sel' : ''; b.textContent = `${c.icon} ${c.name}`;
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', () => { cat = i; localStorage.setItem('block-world/cat', cat); if (!CATEGORIES[cat].ids.includes(selId)) selId = CATEGORIES[cat].ids[0]; renderHotbar(); });
    cb.appendChild(b);
  });
  for (const id of CATEGORIES[cat].ids) {
    const b = document.createElement('button');
    b.className = id === selId ? 'sel' : '';
    b.title = BLOCKS[id].name;
    const img = document.createElement('img'); img.src = ICONS.get(id); img.alt = ''; b.appendChild(img);
    const sm = document.createElement('small'); sm.textContent = BLOCKS[id].name.replace('Passcode t', 'T').replace('Security c', 'C'); b.appendChild(sm);
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', () => { selId = id; renderHotbar(); });
    hb.appendChild(b);
  }
  const selBtn = [...hb.children].find((b) => b.classList.contains('sel')); if (selBtn) selBtn.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}
function selectOffset(d) {
  const ids = CATEGORIES[cat].ids, i = Math.max(0, ids.indexOf(selId));
  selId = ids[(i + d + ids.length) % ids.length]; renderHotbar();
}

// ---------- keypad (passcode trapdoors) ----------
function keypad(title, sub, onCode) {
  let code = '';
  openModal(`<h2>${esc(title)}</h2><p>${esc(sub)}</p><div class="code" id="codeBox">&nbsp;</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
    <button data-k="del">⌫</button><button data-k="0">0</button><button data-k="ok" class="primary">OK</button></div>
    <div class="row"><button data-k="cancel">Cancel</button></div>`);
  const box = $('codeBox');
  const show = () => { box.textContent = code.replace(/\d/g, '●') || ' '; };
  modalBox.onclick = (e) => {
    const k = e.target.closest('button')?.dataset.k; if (!k) return;
    if (k === 'cancel') { closeModal(); return; }
    if (k === 'del') code = code.slice(0, -1);
    else if (k === 'ok') {
      if (code.length !== 4) { box.classList.remove('bad'); void box.offsetWidth; box.classList.add('bad'); return; }
      const res = onCode(code);
      if (res === false) { code = ''; box.classList.remove('bad'); void box.offsetWidth; box.classList.add('bad'); box.textContent = 'WRONG'; return; }
      closeModal(); return;
    } else if (code.length < 4) code += k;
    box.classList.remove('bad'); show();
  };
}

// ---------- chest & pocket ----------
function itemGrid(items, cap, action, mode) {
  let html = '<div class="grid">';
  for (let i = 0; i < cap; i++) {
    const it = items[i];
    html += it ? `<button data-a="${action}" data-i="${i}" title="${esc(itemOf(it).label)}">${itemOf(it).emoji}${mode === 'trash' ? '<span class="x">✕</span>' : ''}</button>` : '<button class="empty" disabled></button>';
  }
  return html + '</div>';
}
function openChest(x, y, z) {
  const items = world.chestItems(x, y, z); if (!items) return;
  const render = () => {
    openModal(`<h2>📦 Chest</h2><p>In the chest — tap an item to take it</p>${itemGrid(items, CHEST_SLOTS, 'take')}
      <p>Your pocket — tap an item to put it in the chest</p>${itemGrid(pocket, POCKET_SLOTS, 'put')}
      <div class="row"><button data-a="close" class="primary">Done</button></div>`);
    modalBox.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.a, i = +b.dataset.i;
      if (a === 'close') { closeModal(); save(); return; }
      if (a === 'take' && !moveItem(items, i, pocket, POCKET_SLOTS)) toast('Your pocket is full');
      if (a === 'put' && !moveItem(pocket, i, items, CHEST_SLOTS)) toast('The chest is full');
      render();
    };
  };
  render();
}
function openPocket() {
  const render = () => {
    openModal(`<h2>🎒 Pocket</h2><p>${pocket.length ? 'Tap an item to throw it away.' : 'Your pocket is empty. Find chests, or make items below.'}</p>
      ${itemGrid(pocket, POCKET_SLOTS, 'trash', 'trash')}
      <p>Make an item (there are always more)</p><div class="row make">${ITEMS.map((it) => `<button data-a="make" data-id="${it.id}" title="${esc(it.label)}">${it.emoji}</button>`).join('')}</div>
      <div class="row"><button data-a="close" class="primary">Done</button></div>`);
    modalBox.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'close') { closeModal(); return; }
      if (a === 'trash') { const [it] = pocket.splice(+b.dataset.i, 1); toast(`Threw away ${itemOf(it).label}`); }
      if (a === 'make') { if (pocket.length >= POCKET_SLOTS) toast('Your pocket is full'); else pocket.push(b.dataset.id); }
      render();
    };
  };
  render();
}

// ---------- menu & help ----------
function openMenu() {
  openModal(`<h2>☰ Block World</h2>
    <p>World seed ${world.seed}. The game saves itself every few seconds in this browser.</p>
    <div class="row">
      <button data-a="save" class="primary">💾 Save now</button>
      <button data-a="export">⬇ Export world</button>
      <label class="file"><button data-a="importBtn">⬆ Import world</button><input type="file" id="importFile" accept=".json,application/json" /></label>
      <button data-a="home">🏠 Back to the start</button>
      <button data-a="new" class="danger">✨ New world</button>
    </div>
    <div class="row"><button data-a="close">Close</button></div>`);
  let confirmNew = false;
  modalBox.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'close') closeModal();
    if (a === 'save') { save(false); closeModal(); }
    if (a === 'export') exportWorld();
    if (a === 'importBtn') { $('importFile').click(); }
    if (a === 'home') { Object.assign(player, { ...world.spawn, vx: 0, vy: 0, vz: 0 }); riding = -1; $('btnDismount').hidden = true; closeModal(); }
    if (a === 'new') {
      if (!confirmNew) { confirmNew = true; b.textContent = 'Really start a new world? Tap again'; return; }
      newWorld(); save(); closeModal(); toast('A brand new world!');
    }
  };
  $('importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const { world: w, state } = deserialize(JSON.parse(await f.text()));
      useWorld(w, state); save(); closeModal(); toast('World loaded ✔');
    } catch (err) { toast('That file is not a Block World save'); }
  });
}
function exportWorld() {
  const blob = new Blob([JSON.stringify(serialize(world, stateForSave()))], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `block-world-${world.seed}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function openHelp() {
  openModal(`<h2>? How to play</h2>
    <ul>
      <li><b>Move:</b> ${isTouch ? 'left joystick. <b>Look:</b> drag on the right side of the screen.' : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows. <b>Look:</b> click the game, then move the mouse.'}</li>
      <li><b>Jump / swim up:</b> ${isTouch ? 'the ⬆ button.' : '<kbd>Space</kbd>.'} You hop up single steps automatically.</li>
      <li><b>Fly:</b> keep holding ${isTouch ? '⬆' : '<kbd>Space</kbd>'} and you rise straight up. Steer with ${isTouch ? 'the joystick' : '<kbd>WASD</kbd>'}; let go to float down. Handy when you are stuck in a hole!</li>
      <li><b>Map:</b> the round map shows the land around you, you as the white arrow, and villagers as coloured dots. Tap <b>📣 Call</b> and the nearest villager walks over to you.</li>
      <li><b>Dig:</b> ${isTouch ? 'hold ⛏, or press and hold on a block.' : 'left click (hold to keep digging).'}</li>
      <li><b>Place / use:</b> ${isTouch ? 'tap ✋, or tap a block.' : 'right click or <kbd>F</kbd>.'} Pick what to place from the bar at the bottom.</li>
      <li><b>Blocks</b> are sorted into tabs: Nature, Building, Colours, Magic (glowing blocks and the 🟪 bouncy block!), Furniture and Gadgets.</li>
      <li><b>Furniture:</b> sit on chairs and sofas, sleep in a bed to make it morning, raid the fridge, bake in the cooker. Lamps and lanterns light up the night.</li>
      <li><b>Water</b> is hiding under the ground. Dig down four blocks and it bubbles up and spreads along tunnels. You can swim in it.</li>
      <li><b>Doors</b> open when you tap them. <b>Passcode trapdoors</b> ask for a 4-digit code when you place them, and again before they open.</li>
      <li><b>Chests</b> hold items. Open your 🎒 pocket to make items and carry them about. There are treasure chests buried underground!</li>
      <li><b>Security cameras</b> watch where they point. Tap a <b>computer</b> to see what every camera can see.</li>
      <li><b>Villagers:</b> tap one to climb on and ride it. You steer. Tap <b>Get off</b> to hop down.</li>
      <li>🌙 switches night and day. ☰ saves, exports and starts new worlds.</li>
    </ul>
    <div class="row"><button data-a="close" class="primary">Let's go!</button></div>`);
  modalBox.onclick = (e) => { if (e.target.closest('button')) closeModal(); };
}

// ---------- security camera view ----------
function openCamView() {
  camViewOpen = true; camIndex = 0; $('camView').hidden = false; document.body.classList.add('camview'); releaseInputs(); updateCamLabel();
}
function closeCamView() { camViewOpen = false; $('camView').hidden = true; document.body.classList.remove('camview'); }
function updateCamLabel() {
  const cams = world.cameras();
  $('camEmpty').hidden = cams.length > 0;
  if (!cams.length) { $('camLabel').textContent = 'No cameras'; return; }
  camIndex = ((camIndex % cams.length) + cams.length) % cams.length;
  const c = cams[camIndex];
  $('camLabel').textContent = `Camera ${c.n} (${camIndex + 1} of ${cams.length})`;
  camCam.rotation.set(c.pitch || 0, c.yaw || 0, 0);
  const dir = new THREE.Vector3(); camCam.getWorldDirection(dir);
  camCam.position.set(c.x + 0.5, c.y + 0.5, c.z + 0.5).addScaledVector(dir, 0.45);   // start just in front of the lens
}
$('camPrev').addEventListener('click', () => { camIndex--; updateCamLabel(); });
$('camNext').addEventListener('click', () => { camIndex++; updateCamLabel(); });
$('camClose').addEventListener('click', closeCamView);

// ---------- input ----------
const keys = new Set();
const joy = { id: null, x: 0, y: 0, cx: 0, cy: 0 };
const look = { id: null, x: 0, y: 0, sx: 0, sy: 0, moved: false, t0: 0, timer: 0, digging: false };
let jumpHeld = false, digTimer = 0;
const joyBase = document.querySelector('#joystick .base'), joyKnob = document.querySelector('#joystick .knob');

function releaseInputs() {
  keys.clear(); jumpHeld = false; stopDigging();
  joy.id = null; joy.x = joy.y = 0; joyKnob.style.transform = ''; joyBase.style.cssText = '';
  look.id = null;
  if (document.pointerLockElement) document.exitPointerLock();
}
function startDigging() { if (digTimer) return; doDig(); digTimer = setInterval(doDig, 320); $('btnDig').classList.add('held'); }
function stopDigging() { clearInterval(digTimer); digTimer = 0; $('btnDig').classList.remove('held'); }

canvas.addEventListener('pointerdown', (e) => {
  if (modalOpen || camViewOpen) return;
  if (e.pointerType === 'mouse') {
    if (!document.pointerLockElement) { canvas.requestPointerLock?.(); return; }
    if (e.button === 0) startDigging();
    if (e.button === 2) doUse();
    return;
  }
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  if (e.clientX < innerWidth * 0.45 && joy.id === null) {
    joy.id = e.pointerId; joy.cx = e.clientX; joy.cy = e.clientY; joy.x = joy.y = 0;
    joyBase.style.cssText = `left:${e.clientX - 60}px; top:${e.clientY - 60}px; bottom:auto;`;
  } else if (look.id === null) {
    Object.assign(look, { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, t0: performance.now(), digging: false });
    look.timer = setTimeout(() => { if (look.id === e.pointerId && !look.moved) { look.digging = true; startDigging(); } }, 380);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    if (document.pointerLockElement && !modalOpen && !camViewOpen) { yaw -= e.movementX * 0.0025; pitch = clampPitch(pitch - e.movementY * 0.0025); }
    return;
  }
  if (e.pointerId === joy.id) {
    const dx = e.clientX - joy.cx, dy = e.clientY - joy.cy, r = 50;
    const len = Math.hypot(dx, dy), s = len > r ? r / len : 1;
    joy.x = dx * s / r; joy.y = dy * s / r;
    joyKnob.style.transform = `translate(${dx * s}px, ${dy * s}px)`;
  } else if (e.pointerId === look.id) {
    const dx = e.clientX - look.x, dy = e.clientY - look.y;
    if (!look.moved && Math.hypot(e.clientX - look.sx, e.clientY - look.sy) > 10) { look.moved = true; clearTimeout(look.timer); if (look.digging) { stopDigging(); } }
    if (look.moved && !look.digging) { yaw -= dx * 0.006; pitch = clampPitch(pitch - dy * 0.006); }
    look.x = e.clientX; look.y = e.clientY;
  }
});
function endPointer(e) {
  if (e.pointerType === 'mouse') { if (e.button === 0) stopDigging(); return; }
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyKnob.style.transform = ''; joyBase.style.cssText = ''; }
  else if (e.pointerId === look.id) {
    clearTimeout(look.timer);
    const quick = performance.now() - look.t0 < 350;
    if (look.digging) stopDigging();
    else if (!look.moved && quick && e.type === 'pointerup') doUse();
    look.id = null;
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) stopDigging(); });

const hold = (el, on, off) => {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { el.setPointerCapture(e.pointerId); } catch {} on(); });
  const end = (e) => { e.stopPropagation(); off(); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
};
hold($('btnJump'), () => { jumpHeld = true; }, () => { jumpHeld = false; });
hold($('btnDig'), startDigging, stopDigging);
$('btnUse').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); doUse(); });
$('btnDismount').addEventListener('click', dismount);
$('btnPocket').addEventListener('click', () => { if (modalOpen) closeModal(); else openPocket(); });
$('btnMenu').addEventListener('click', () => { if (modalOpen) closeModal(); else openMenu(); });
$('btnHelp').addEventListener('click', () => { if (modalOpen) closeModal(); else openHelp(); });
$('btnNight').addEventListener('click', () => { night = !night; $('btnNight').classList.toggle('on', night); toast(night ? 'Night time 🌙' : 'Day time ☀️'); });
for (const id of ['btnPocket', 'btnMenu', 'btnHelp', 'btnNight']) $(id).addEventListener('pointerdown', (e) => e.stopPropagation());

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (modalOpen) closeModal(); else if (camViewOpen) closeCamView(); return; }
  if (modalOpen || camViewOpen || e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code === 'Space') { jumpHeld = true; e.preventDefault(); }
  if (e.code === 'KeyF') doUse();
  if (e.code === 'KeyE') openPocket();
  if (e.code === 'KeyX' && riding >= 0) dismount();
  if (e.code === 'KeyC') callNearest();
  if (/^Digit[1-9]$/.test(e.code)) { const ids = CATEGORIES[cat].ids, i = +e.code.slice(5) - 1; if (ids[i]) { selId = ids[i]; renderHotbar(); } }
  if (e.code === 'KeyQ') selectOffset(-1);
  if (e.code === 'KeyR') selectOffset(1);
  if (e.code === 'Tab') { e.preventDefault(); cat = (cat + 1) % CATEGORIES.length; localStorage.setItem('block-world/cat', cat); if (!CATEGORIES[cat].ids.includes(selId)) selId = CATEGORIES[cat].ids[0]; renderHotbar(); }
});
addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'Space') jumpHeld = false; });
addEventListener('wheel', (e) => { if (modalOpen) return; selectOffset(e.deltaY > 0 ? 1 : -1); }, { passive: true });
addEventListener('blur', releaseInputs);
const clampPitch = (p) => Math.max(-1.5, Math.min(1.5, p));

function moveInput() {
  let mx = joy.x, mz = -joy.y;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  return { mx, mz };
}

// ---------- actions ----------
function eye() {
  if (riding >= 0) { const v = villagers[riding]; return new THREE.Vector3(v.x, v.y + 2.45, v.z); }
  if (sitting) return new THREE.Vector3(sitting.x + 0.5, sitting.y + sitting.seat + 0.95, sitting.z + 0.5);
  return new THREE.Vector3(player.x, player.y + 1.62, player.z);
}
function findTarget() {
  const o = eye(), d = new THREE.Vector3(); camera.getWorldDirection(d);
  const hit = raycast(world, o.x, o.y, o.z, d.x, d.y, d.z, 6);
  let best = hit ? { kind: 'block', hit, dist: hit.dist } : null;
  villagers.forEach((v, i) => {
    if (i === riding) return;
    const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, v.x - 0.35, v.y, v.z - 0.35, v.x + 0.35, v.y + 2.0, v.z + 0.35);
    if (t !== null && t < 5 && (!best || t < best.dist)) best = { kind: 'villager', i, dist: t };
  });
  return best;
}
function cellOverlapsEntity(x, y, z, e) {
  return x + 1 > e.x - e.w / 2 && x < e.x + e.w / 2 && y + 1 > e.y && y < e.y + e.h && z + 1 > e.z - e.w / 2 && z < e.z + e.w / 2;
}
function doDig() {
  if (modalOpen || camViewOpen) return;
  const t = findTarget();
  if (!t || t.kind !== 'block') return;
  const { x, y, z } = t.hit;
  if (!world.canDig(x, y, z)) { toast('That cannot be dug'); return; }
  const spilled = world.dig(x, y, z);
  if (spilled && spilled.length) {
    let kept = 0;
    for (const it of spilled) if (pocket.length < POCKET_SLOTS) { pocket.push(it); kept++; }
    toast(kept === spilled.length ? `Picked up ${kept} item${kept > 1 ? 's' : ''} from the chest` : `Pocket full! ${spilled.length - kept} item(s) were lost`);
  }
  navigator.vibrate?.(15);
}
function facingFromYaw() { return ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4; }
function doUse() {
  if (modalOpen || camViewOpen) return;
  const t = findTarget();
  if (!t) return;
  if (t.kind === 'villager') { mount(t.i); return; }
  const { x, y, z, id, nx, ny, nz } = t.hit;
  if (id === B.DOOR || id === B.DOOR_TOP) { world.toggleDoor(x, y, z); return; }
  if (id === B.TRAPDOOR) {
    const m = world.meta.get(key(x, y, z));
    if (m.open) { world.tryTrapdoor(x, y, z, ''); toast('Trapdoor locked 🔒'); return; }
    keypad('🔒 Passcode trapdoor', 'Enter the 4-digit code to open it.', (code) => {
      const r = world.tryTrapdoor(x, y, z, code);
      if (r.ok) toast('Correct! The trapdoor is open 🔓');
      return r.ok;
    });
    return;
  }
  if (id === B.CHEST) { openChest(x, y, z); return; }
  if (id === B.COMPUTER) { openCamView(); return; }
  if (id === B.CAMERA) { toast(propDescription(id, world.meta.get(key(x, y, z)))); return; }
  if (id === B.BED || id === B.BED_FOOT) { night = false; $('btnNight').classList.remove('on'); toast('💤 Zzz… You slept till morning!'); return; }
  if (BLOCKS[id].seat) { sit(x, y, z, BLOCKS[id].seat); return; }
  if (id === B.FRIDGE || id === B.COOKER) {
    const it = id === B.FRIDGE ? (Math.random() < 0.5 ? 'apple' : 'fish') : 'cake';
    if (pocket.length >= POCKET_SLOTS) toast('Your pocket is full!');
    else { pocket.push(it); toast(id === B.FRIDGE ? `🧊 Brrr! You found ${itemOf(it).label.toLowerCase()} in the fridge` : '🍰 Ding! You baked a cake'); }
    return;
  }
  if (id === B.TOILET) { toast('🚽 Flusssh! 💦'); return; }
  if (id === B.BATH) { toast('🛁 Splash! Rubber duck time'); return; }
  // place the selected block on the face we are looking at
  let px = x + nx, py = y + ny, pz = z + nz;
  const pid = selId;
  if (pid === B.TRAPDOOR && ny === 1 && !BLOCKS[id].special && world.canDig(x, y, z)) {
    // tapping the top of the ground sinks the trapdoor into it, flush with the floor
    keypad('🔒 New passcode trapdoor', 'Choose a secret 4-digit code. Remember it!', (code) => {
      world.dig(x, y, z);
      const err = world.place(x, y, z, pid, { facing: facingFromYaw(), code });
      toast(err || `Trapdoor placed. The code is ${code}. Dig underneath it to make a secret room!`, 4000);
      return true;
    });
    return;
  }
  if (!world.inBounds(px, py, pz)) { toast('That is outside the world'); return; }
  let facing = facingFromYaw();
  if (WALL_HUNG.has(pid) && ny === 0) facing = ((Math.round(Math.atan2(-nx, -nz) / (Math.PI / 2)) % 4) + 4) % 4;   // back against the wall
  else if (FACE_PLAYER.has(pid)) facing = (facing + 2) % 4;
  if (BLOCKS[pid].solid) {
    const ents = riding >= 0 ? villagers : [player, ...villagers];
    const [fx, fz] = facingDir(facing);
    const cells = pid === B.DOOR ? [[px, py, pz], [px, py + 1, pz]] : pid === B.BED ? [[px, py, pz], [px + fx, py, pz + fz]] : [[px, py, pz]];
    for (const e of ents) for (const c of cells) if (cellOverlapsEntity(c[0], c[1], c[2], e)) { toast('Something is in the way'); return; }
  }
  const opts = { facing };
  if (pid === B.CAMERA) {
    if (ny === 0) { opts.yaw = Math.atan2(-nx, -nz); opts.pitch = -0.35; }
    else { opts.yaw = yaw; opts.pitch = ny > 0 ? -0.15 : -0.7; }
  }
  if (pid === B.TRAPDOOR) {
    keypad('🔒 New passcode trapdoor', 'Choose a secret 4-digit code. Remember it!', (code) => {
      const err = world.place(px, py, pz, pid, { ...opts, code });
      toast(err || `Trapdoor placed. The code is ${code}`, 3500);
      return true;
    });
    return;
  }
  const err = world.place(px, py, pz, pid, opts);
  if (err) toast(err);
  else if (pid === B.CAMERA) toast(`Camera ${world.meta.get(key(px, py, pz)).n} placed. Tap a computer to watch it.`, 3000);
  navigator.vibrate?.(10);
}
function sit(x, y, z, seat) {
  if (riding >= 0) dismount();
  sitting = { x, y, z, seat };
  Object.assign(player, { vx: 0, vy: 0, vz: 0 });
  toast('Comfy! Move to get up.');
}
function standUp() {
  if (!sitting) return;
  const { x, y, z } = sitting, solid = BLOCKS[world.get(x, y, z)].solid;
  Object.assign(player, { x: x + 0.5, y: y + (solid ? 1.01 : 0.01), z: z + 0.5, vx: 0, vy: 0, vz: 0, onGround: true });
  sitting = null;
}
function mount(i) {
  sitting = null;
  riding = i; $('btnDismount').hidden = false;
  toast(`You're riding ${villagers[i].name}! ${isTouch ? 'Steer with the joystick.' : 'Steer with WASD.'}`, 3000);
}
function dismount() {
  if (riding < 0) return;
  const v = villagers[riding];
  Object.assign(player, { x: v.x, y: v.y + 0.05, z: v.z, vx: v.vx, vy: 0, vz: v.vz, onGround: false });
  riding = -1; $('btnDismount').hidden = true;
}

// ---------- mini-map & calling villagers ----------
const MAP_COLORS = { [B.GRASS]: '#5aa83e', [B.EARTH]: '#86603c', [B.STONE]: '#808084', [B.SAND]: '#decf96', [B.WOOD]: '#ba8c54', [B.LOG]: '#684c2e',
  [B.LEAVES]: '#2f7a28', [B.METAL]: '#b0b6be', [B.GLASS]: '#cfe8ff', [B.WATER]: '#2a6ed2', [B.BEDROCK]: '#3c3c40', [B.BRICK]: '#b24c3c' };
const mapCanvas = $('minimap'), mapCtx = mapCanvas.getContext('2d');
const MAP_R = 24;   // blocks shown either side of you
let mapTimer = 0;
function drawMap() {
  const e = eye(), cx = Math.floor(e.x), cz = Math.floor(e.z);
  const { size, ids, hs } = topView(world, cx, cz, MAP_R);
  const S = mapCanvas.width, px = S / size;
  mapCtx.clearRect(0, 0, S, S);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const id = ids[j * size + i];
    if (!id) continue;
    mapCtx.fillStyle = MAP_COLORS[id] || '#888';
    mapCtx.globalAlpha = 0.55 + 0.45 * Math.min(1, hs[j * size + i] / 34);   // higher ground is brighter
    mapCtx.fillRect(i * px, j * px, px + 0.5, px + 0.5);
  }
  mapCtx.globalAlpha = 1;
  const toMap = (x, z) => [(x - cx - 0.5 + MAP_R + 0.5) * px, (z - cz - 0.5 + MAP_R + 0.5) * px];
  const near = nearestVillager(villagers, e.x, e.z, riding);
  villagers.forEach((v, i) => {
    if (i === riding) return;
    let [mx, mz] = toMap(v.x, v.z);
    const dx = mx - S / 2, dz = mz - S / 2, d = Math.hypot(dx, dz), lim = S / 2 - 8;
    if (d > lim) { mx = S / 2 + dx / d * lim; mz = S / 2 + dz / d * lim; }   // off the map: pin to the edge
    mapCtx.beginPath(); mapCtx.arc(mx, mz, i === near.index ? 7 : 5, 0, Math.PI * 2);
    mapCtx.fillStyle = v.shirt; mapCtx.fill();
    mapCtx.lineWidth = 2; mapCtx.strokeStyle = v.call ? '#ffd166' : '#fff'; mapCtx.stroke();
  });
  // you: a white arrow pointing the way you look (north is up)
  mapCtx.save(); mapCtx.translate(S / 2, S / 2); mapCtx.rotate(-yaw);
  mapCtx.beginPath(); mapCtx.moveTo(0, -12); mapCtx.lineTo(8, 8); mapCtx.lineTo(0, 4); mapCtx.lineTo(-8, 8); mapCtx.closePath();
  mapCtx.fillStyle = '#fff'; mapCtx.fill(); mapCtx.strokeStyle = '#000'; mapCtx.lineWidth = 1.5; mapCtx.stroke();
  mapCtx.restore();
  if (near.index >= 0) {
    const v = villagers[near.index];
    $('mapLabel').textContent = `${v.name} ${Math.round(near.dist)} m${v.call ? ' – coming!' : ''}`;
  } else $('mapLabel').textContent = riding >= 0 ? `Riding ${villagers[riding].name}` : '—';
}
function callNearest() {
  const e = eye();
  const i = callVillager(villagers, e.x, e.z, riding);
  if (i < 0) { toast('Nobody can hear you'); return; }
  const v = villagers[i];
  toast(`📣 ${v.name} is coming! (${Math.round(Math.hypot(v.x - e.x, v.z - e.z))} m away)`);
}
$('btnCall').addEventListener('click', callNearest);
$('btnCall').addEventListener('pointerdown', (e) => e.stopPropagation());

// ---------- water tint overlay ----------
const tint = document.createElement('div');
tint.style.cssText = 'position:absolute;inset:0;background:rgba(30,90,200,0.35);pointer-events:none;display:none;';
$('game').insertBefore(tint, $('hud'));

// ---------- main loop ----------
let last = performance.now(), saveTimer = 0, lightTimer = 9, cullTimer = 9;
// The nearest lamps get real point lights (there are only a few to go round).
function updateLamps(e) {
  const all = wr.allLights().map((p) => ({ p, d: Math.hypot(p[0] - e.x, p[1] - e.y, p[2] - e.z) })).filter((l) => l.d < 40).sort((a, b) => a.d - b.d);
  lamps.forEach((l, i) => {
    if (all[i]) { l.position.set(...all[i].p); l.intensity = 14 * (1 - 0.6 * dayMix); l.visible = true; }
    else l.intensity = 0;
  });
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const active = !modalOpen && !camViewOpen;
  const { mx, mz } = active ? moveInput() : { mx: 0, mz: 0 };
  const jump = active && jumpHeld;

  const here = eye();
  villagers.forEach((v, i) => {
    const ride = i === riding ? { mx, mz, yaw, jump } : null;
    if (v.call) { v.call.x = here.x; v.call.z = here.z; }   // follow the caller as they move
    updateVillager(world, v, dt, rng, ride);
    if (v.arrived) { v.arrived = false; toast(`${v.name} is here! 👋`); }
    animateVillager(vMeshes[i], v, i === riding);
  });
  let head = false;
  if (sitting && (Math.hypot(mx, mz) > 0.2 || jump)) standUp();
  if (riding >= 0) { const v = villagers[riding]; head = headInWater(world, { x: v.x, y: v.y + 0.7, z: v.z, h: 1.8 }); }
  else if (!sitting) { const r = stepEntity(world, player, { mx, mz, yaw, jump }, dt); head = r.head; if (r.bounced) toast('Boing! 🟪'); }
  world.tickWater(300);
  wr.update(4);

  // camera
  const e = eye();
  camera.position.copy(e); camera.rotation.set(pitch, yaw, 0);
  tint.style.display = head ? 'block' : 'none';

  // day / night
  dayMix += ((night ? 0 : 1) - dayMix) * Math.min(1, dt * 1.5);
  const sky = SKY.night.clone().lerp(SKY.day, dayMix);
  scene.background = sky; scene.fog.color.copy(sky);
  sun.intensity = 0.3 + 2.1 * dayMix; hemi.intensity = 0.3 + 0.8 * dayMix;
  for (const l of lamps) if (l.intensity > 0) l.intensity = 14 * (1 - 0.6 * dayMix);

  // target highlight + label
  if (active) {
    target = findTarget();
    if (target && target.kind === 'block') {
      highlight.visible = true; highlight.position.set(target.hit.x + 0.5, target.hit.y + 0.5, target.hit.z + 0.5);
      const id = target.hit.id, m = world.meta.get(key(target.hit.x, id === B.DOOR_TOP ? target.hit.y - 1 : target.hit.y, target.hit.z));
      $('targetName').textContent = BLOCKS[id].special ? propDescription(id, m, m && m.open) : BLOCKS[id].name;
    } else if (target && target.kind === 'villager') {
      highlight.visible = false; $('targetName').textContent = `${villagers[target.i].name} – tap to ride`;
    } else { highlight.visible = false; $('targetName').textContent = ''; }
  } else highlight.visible = false;

  if (camViewOpen) {
    if (world.cameras().length) renderer.render(scene, camCam);
    else renderer.render(scene, camera);
  } else renderer.render(scene, camera);

  mapTimer += dt;
  if (mapTimer > 0.2) { mapTimer = 0; drawMap(); }
  lightTimer += dt;
  if (lightTimer > 0.5) { lightTimer = 0; updateLamps(e); animateClocks(wr.allClocks()); }
  cullTimer += dt;
  if (cullTimer > 0.5 || wr.world.dirty.size) { cullTimer = 0; wr.cull(e.x, e.z, VIEW_DIST); }
  saveTimer += dt;
  if (saveTimer > 15) { saveTimer = 0; save(); }
}

// ---------- boot ----------
if (!load()) newWorld();
$('loading').hidden = true;
addEventListener('pagehide', () => save());
addEventListener('visibilitychange', () => { if (document.hidden) save(); });
requestAnimationFrame(frame);
if (!localStorage.getItem('block-world/seen-help')) { openHelp(); localStorage.setItem('block-world/seen-help', '1'); }

// Small hook for scripted smoke tests (not used by the game itself).
window.blockWorld = {
  get world() { return world; }, get player() { return player; }, get villagers() { return villagers; }, get pocket() { return pocket; },
  look(y, p) { yaw = y; pitch = p; }, select(id) { selId = id; renderHotbar(); }, dig: doDig, use: doUse, mount, dismount, findTarget, save, callNearest,
  get sitting() { return sitting; }, get night() { return night; }, icons: ICONS,
  stats() { const i = renderer.info.render; return { triangles: i.triangles, calls: i.calls, chunksVisible: [...wr.chunks.values()].filter((g) => g.visible).length }; },
};
