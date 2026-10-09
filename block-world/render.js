// Block World rendering: procedural texture atlas, chunk meshing, props
// (doors, trapdoors, chests, computers, cameras) and villager models.
import * as THREE from 'three';
import { W, H, D, CHUNK, B, BLOCKS, key } from './engine.js?v=dev';

// ---------- texture atlas (16px tiles, drawn with a tiny seeded noise) ----------
const T = { GRASS_TOP: 0, GRASS_SIDE: 1, EARTH: 2, STONE: 3, SAND: 4, PLANKS: 5, LOG_SIDE: 6, LOG_TOP: 7, LEAVES: 8, METAL: 9, GLASS: 10, WATER: 11, BEDROCK: 12, BRICK: 13 };
const COLS = 8, ROWS = 2, TILE = 16;
export const TILES_FOR = {
  [B.GRASS]: [T.GRASS_TOP, T.GRASS_SIDE, T.EARTH],
  [B.EARTH]: [T.EARTH, T.EARTH, T.EARTH],
  [B.STONE]: [T.STONE, T.STONE, T.STONE],
  [B.SAND]: [T.SAND, T.SAND, T.SAND],
  [B.WOOD]: [T.PLANKS, T.PLANKS, T.PLANKS],
  [B.LOG]: [T.LOG_TOP, T.LOG_SIDE, T.LOG_TOP],
  [B.LEAVES]: [T.LEAVES, T.LEAVES, T.LEAVES],
  [B.METAL]: [T.METAL, T.METAL, T.METAL],
  [B.GLASS]: [T.GLASS, T.GLASS, T.GLASS],
  [B.WATER]: [T.WATER, T.WATER, T.WATER],
  [B.BEDROCK]: [T.BEDROCK, T.BEDROCK, T.BEDROCK],
  [B.BRICK]: [T.BRICK, T.BRICK, T.BRICK],
};

function rngFor(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
function drawTile(ctx, t, base, vary, fn) {
  const rnd = rngFor(t * 7919 + 13);
  const ox = (t % COLS) * TILE, oy = Math.floor(t / COLS) * TILE;
  const img = ctx.createImageData(TILE, TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    let [r, g, b, a] = base;
    const v = (rnd() - 0.5) * vary;
    r += v; g += v; b += v;
    const o = fn ? fn(x, y, rnd) : null;
    if (o) { r = o[0]; g = o[1]; b = o[2]; if (o[3] !== undefined) a = o[3]; }
    const i = (y * TILE + x) * 4;
    img.data[i] = Math.max(0, Math.min(255, r)); img.data[i + 1] = Math.max(0, Math.min(255, g));
    img.data[i + 2] = Math.max(0, Math.min(255, b)); img.data[i + 3] = a;
  }
  ctx.putImageData(img, ox, oy);
}
export function makeAtlas() {
  const c = document.createElement('canvas');
  c.width = COLS * TILE; c.height = ROWS * TILE;
  const ctx = c.getContext('2d');
  drawTile(ctx, T.GRASS_TOP, [92, 168, 62, 255], 40);
  drawTile(ctx, T.GRASS_SIDE, [134, 96, 60, 255], 30, (x, y, r) => (y < 3 || (y === 3 && r() < 0.5)) ? [92 + (r() - 0.5) * 40, 168 + (r() - 0.5) * 40, 62] : null);
  drawTile(ctx, T.EARTH, [134, 96, 60, 255], 34);
  drawTile(ctx, T.STONE, [128, 128, 132, 255], 28, (x, y, r) => r() < 0.06 ? [92, 92, 96] : null);
  drawTile(ctx, T.SAND, [222, 206, 150, 255], 20);
  drawTile(ctx, T.PLANKS, [186, 140, 84, 255], 18, (x, y) => (y % 4 === 3) ? [120, 86, 48] : (x === (y < 8 ? 7 : 15) ? [140, 100, 56] : null));
  drawTile(ctx, T.LOG_SIDE, [104, 76, 46, 255], 22, (x) => (x % 4 === 0) ? [80, 58, 34] : null);
  drawTile(ctx, T.LOG_TOP, [190, 150, 96, 255], 16, (x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return (Math.floor(d) % 2 === 0 && d < 7) ? [150, 112, 66] : (d >= 7 ? [104, 76, 46] : null); });
  drawTile(ctx, T.LEAVES, [60, 130, 48, 255], 44, (x, y, r) => r() < 0.1 ? [34, 90, 30] : null);
  drawTile(ctx, T.METAL, [176, 182, 190, 255], 10, (x, y) => ((x === 2 || x === 13) && (y === 2 || y === 13)) ? [90, 94, 100] : (x === 0 || y === 0) ? [210, 214, 220] : (x === 15 || y === 15) ? [120, 124, 130] : null);
  drawTile(ctx, T.GLASS, [220, 240, 255, 40], 0, (x, y) => (x === 0 || y === 0 || x === 15 || y === 15) ? [240, 250, 255, 200] : ((x + y) === 9 || (x + y) === 10) ? [255, 255, 255, 110] : null);
  drawTile(ctx, T.WATER, [40, 110, 210, 255], 18, (x, y, r) => r() < 0.08 ? [120, 180, 240] : null);
  drawTile(ctx, T.BEDROCK, [60, 60, 64, 255], 40);
  drawTile(ctx, T.BRICK, [178, 76, 60, 255], 18, (x, y) => (y % 4 === 3) ? [200, 190, 180] : (((y < 4 ? x : x + 4) % 8) === 7 ? [200, 190, 180] : null));
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { texture: tex, canvas: c };
}
// Small pixel-art icon for the hotbar.
export function tileIcon(atlasCanvas, blockId) {
  const t = TILES_FOR[blockId] ? TILES_FOR[blockId][blockId === B.GRASS || blockId === B.LOG ? 1 : 0] : T.STONE;
  const c = document.createElement('canvas'); c.width = TILE; c.height = TILE;
  c.getContext('2d').drawImage(atlasCanvas, (t % COLS) * TILE, Math.floor(t / COLS) * TILE, TILE, TILE, 0, 0, TILE, TILE);
  return c.toDataURL();
}
function uvRect(t) {
  // inset by half a texel so neighbouring tiles never bleed in at the edges
  const eu = 0.5 / (COLS * TILE), ev = 0.5 / (ROWS * TILE);
  const u0 = (t % COLS) / COLS + eu, u1 = u0 + 1 / COLS - 2 * eu;
  const v1 = 1 - Math.floor(t / COLS) / ROWS - ev, v0 = v1 - 1 / ROWS + 2 * ev;
  return [u0, v0, u1, v1];
}

// ---------- chunk meshing ----------
// faces: [normal, 4 corners (CCW from outside), shade, tile slot (0 top, 1 side, 2 bottom)]
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: 0.72, t: 1 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: 0.72, t: 1 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1.0, t: 0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.5, t: 2 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.84, t: 1 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.84, t: 1 },
];
const UVQ = [[0, 0], [1, 0], [1, 1], [0, 1]];

class GeomBuf {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  quad(x, y, z, face, tile, shade, topY = 1) {
    const [u0, v0, u1, v1] = uvRect(tile);
    for (let i = 0; i < 4; i++) {
      const c = face.c[i];
      this.pos.push(x + c[0], y + (c[1] ? topY : 0), z + c[2]);
      this.nor.push(face.n[0], face.n[1], face.n[2]);
      this.uv.push(UVQ[i][0] ? u1 : u0, UVQ[i][1] ? v1 : v0);
      this.col.push(shade, shade, shade);
    }
    const n = this.n;
    this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    this.n += 4;
  }
  build() {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

export class WorldRenderer {
  constructor(scene, world, atlas) {
    this.scene = scene; this.world = world;
    this.group = new THREE.Group(); scene.add(this.group);
    this.chunks = new Map();
    this.matOpaque = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true });
    this.matGlass = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    this.matWater = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  }
  // Rebuild up to `max` dirty chunks. Returns how many were rebuilt.
  update(max = 3) {
    let n = 0;
    for (const k of [...this.world.dirty]) {
      if (n >= max) break;
      this.world.dirty.delete(k);
      const [cx, cz] = k.split(',').map(Number);
      if (cx < 0 || cz < 0 || cx >= W / CHUNK || cz >= D / CHUNK) continue;
      this.buildChunk(cx, cz, k);
      n++;
    }
    return n;
  }
  buildChunk(cx, cz, k) {
    const old = this.chunks.get(k);
    if (old) { this.group.remove(old); old.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    const w = this.world, x0 = cx * CHUNK, z0 = cz * CHUNK;
    const op = new GeomBuf(), gl = new GeomBuf(), wa = new GeomBuf();
    const g = new THREE.Group();
    for (let y = 0; y < H; y++) for (let z = z0; z < z0 + CHUNK; z++) for (let x = x0; x < x0 + CHUNK; x++) {
      const id = w.get(x, y, z);
      if (id === B.AIR) continue;
      const info = BLOCKS[id];
      if (info.special) { g.add(buildProp(id, w.meta.get(key(x, y, z)) || {}, x, y, z, w)); continue; }
      const tiles = TILES_FOR[id];
      const buf = id === B.WATER ? wa : id === B.GLASS ? gl : op;
      for (const f of FACES) {
        const nid = w.get(x + f.n[0], y + f.n[1], z + f.n[2]);
        const ninfo = BLOCKS[nid];
        let show;
        if (id === B.WATER) show = nid !== B.WATER && !ninfo.opaque;
        else if (id === B.GLASS) show = nid !== B.GLASS && !ninfo.opaque;
        else show = !ninfo.opaque;
        if (!show) continue;
        const topY = (id === B.WATER && w.get(x, y + 1, z) !== B.WATER) ? 0.85 : 1;
        buf.quad(x, y, z, f, tiles[f.t], f.s, topY);
      }
    }
    const go = op.build(), gg = gl.build(), gw = wa.build();
    if (go) g.add(new THREE.Mesh(go, this.matOpaque));
    if (gg) g.add(new THREE.Mesh(gg, this.matGlass));
    if (gw) g.add(new THREE.Mesh(gw, this.matWater));
    this.group.add(g);
    this.chunks.set(k, g);
  }
}

// ---------- props ----------
const M = {
  wood: new THREE.MeshLambertMaterial({ color: 0xb98a4e }),
  woodDark: new THREE.MeshLambertMaterial({ color: 0x7a5630 }),
  metal: new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }),
  metalDark: new THREE.MeshLambertMaterial({ color: 0x3c4046 }),
  black: new THREE.MeshLambertMaterial({ color: 0x15171a }),
  screen: new THREE.MeshBasicMaterial({ color: 0x3fa9ff }),
  red: new THREE.MeshBasicMaterial({ color: 0xff3b3b }),
  green: new THREE.MeshBasicMaterial({ color: 0x3bff6a }),
  gold: new THREE.MeshLambertMaterial({ color: 0xe6b422 }),
  lens: new THREE.MeshBasicMaterial({ color: 0x1d3a6b }),
};
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
export function propDescription(id, meta, open) {
  switch (id) {
    case B.DOOR: case B.DOOR_TOP: return open ? 'Door (open) – tap to close' : 'Door – tap to open';
    case B.TRAPDOOR: return open ? 'Trapdoor (open) – tap to close' : 'Passcode trapdoor – tap to enter the code';
    case B.CHEST: return 'Chest – tap to open';
    case B.COMPUTER: return 'Computer – tap to watch the cameras';
    case B.CAMERA: return `Security camera ${meta && meta.n ? meta.n : ''}`;
  }
  return BLOCKS[id].name;
}
export function buildProp(id, meta, x, y, z, world) {
  const g = new THREE.Group();
  g.position.set(x + 0.5, y, z + 0.5);
  if (id === B.DOOR_TOP) return g;   // the bottom half draws the whole door
  g.rotation.y = (meta.facing || 0) * Math.PI / 2;
  if (id === B.DOOR) {
    const hinge = new THREE.Group(); hinge.position.set(-0.5, 0, 0.42);
    const panel = box(1, 2, 0.12, M.wood, 0.5, 1, 0);
    panel.add(box(0.12, 0.12, 0.16, M.gold, 0.32, 0, 0));
    panel.add(box(0.7, 0.7, 0.14, M.woodDark, 0, 0.5, 0), box(0.7, 0.7, 0.14, M.woodDark, 0, -0.5, 0));
    hinge.add(panel);
    hinge.rotation.y = meta.open ? -Math.PI / 2 : 0;
    g.add(hinge);
  } else if (id === B.TRAPDOOR) {
    // a metal hatch flush with the top of the cell; the rim is four thin bars
    g.add(box(0.08, 0.16, 1, M.metalDark, -0.46, 0.92, 0), box(0.08, 0.16, 1, M.metalDark, 0.46, 0.92, 0));
    g.add(box(1, 0.16, 0.08, M.metalDark, 0, 0.92, -0.46), box(1, 0.16, 0.08, M.metalDark, 0, 0.92, 0.46));
    const hinge = new THREE.Group(); hinge.position.set(0, 0.94, -0.42);
    const panel = box(0.84, 0.1, 0.84, M.metal, 0, 0, 0.42);
    panel.add(box(0.3, 0.06, 0.2, M.black, 0, 0.08, 0.1));
    panel.add(box(0.08, 0.04, 0.08, meta.open ? M.green : M.red, 0, 0.12, 0.1));
    hinge.add(panel);
    hinge.rotation.x = meta.open ? -Math.PI / 2 : 0;
    g.add(hinge);
  } else if (id === B.CHEST) {
    g.add(box(0.9, 0.6, 0.7, M.wood, 0, 0.3, 0));
    g.add(box(0.94, 0.26, 0.74, M.woodDark, 0, 0.73, 0));
    g.add(box(0.16, 0.22, 0.06, M.gold, 0, 0.62, 0.37));
  } else if (id === B.COMPUTER) {
    g.add(box(0.5, 0.06, 0.4, M.metalDark, 0, 0.03, -0.1));
    g.add(box(0.08, 0.3, 0.08, M.metalDark, 0, 0.2, -0.1));
    const mats = [M.black, M.black, M.black, M.black, M.screen, M.black];
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.56, 0.08), mats); screen.position.set(0, 0.6, -0.1); g.add(screen);
    g.add(box(0.6, 0.04, 0.22, M.metal, 0, 0.02, 0.28));
  } else if (id === B.CAMERA) {
    g.rotation.y = 0;
    g.add(box(0.2, 0.2, 0.2, M.metalDark, 0, 0.4, 0));
    const head = new THREE.Group(); head.position.set(0, 0.5, 0);
    head.rotation.order = 'YXZ'; head.rotation.y = meta.yaw || 0; head.rotation.x = meta.pitch || 0;
    head.add(box(0.26, 0.26, 0.5, M.metal, 0, 0, 0));
    head.add(box(0.18, 0.18, 0.1, M.lens, 0, 0, -0.3));
    head.add(box(0.05, 0.05, 0.05, M.red, 0.09, 0.09, -0.27));
    g.add(head);
    if (meta.n) g.add(makeLabel(`📷 ${meta.n}`, 0.8, 0.45));
  }
  g.userData.cell = [x, y, z];
  return g;
}

// ---------- villagers ----------
const skinMat = new THREE.MeshLambertMaterial({ color: 0xf1c27d });
const legMat = new THREE.MeshLambertMaterial({ color: 0x33415c });
const hairMats = [0x2b1b0e, 0xd9a441, 0x5a2b0c, 0x1a1a1a, 0xb5651d].map((c) => new THREE.MeshLambertMaterial({ color: c }));
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
export function makeLabel(text, height = 1.0, yOff = 2.2) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.roundRect(8, 8, 240, 48, 12); ctx.fill();
  ctx.font = 'bold 30px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(height * 4, height, 1); s.position.y = yOff;
  return s;
}
export function makeVillagerMesh(v, i) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: new THREE.Color(v.shirt) });
  const body = box(0.5, 0.75, 0.28, shirt, 0, 1.1, 0);
  const head = box(0.5, 0.5, 0.5, skinMat, 0, 1.75, 0);
  head.add(box(0.52, 0.16, 0.52, hairMats[i % hairMats.length], 0, 0.2, 0));
  head.add(box(0.08, 0.08, 0.04, eyeMat, -0.12, 0.05, -0.26), box(0.08, 0.08, 0.04, eyeMat, 0.12, 0.05, -0.26));
  const armL = new THREE.Group(), armR = new THREE.Group(), legL = new THREE.Group(), legR = new THREE.Group();
  armL.position.set(-0.36, 1.45, 0); armR.position.set(0.36, 1.45, 0);
  armL.add(box(0.2, 0.7, 0.2, shirt, 0, -0.3, 0)); armR.add(box(0.2, 0.7, 0.2, shirt, 0, -0.3, 0));
  legL.position.set(-0.13, 0.75, 0); legR.position.set(0.13, 0.75, 0);
  legL.add(box(0.24, 0.75, 0.24, legMat, 0, -0.37, 0)); legR.add(box(0.24, 0.75, 0.24, legMat, 0, -0.37, 0));
  g.add(body, head, armL, armR, legL, legR);
  const label = makeLabel(v.name, 0.45, 2.3); g.add(label);
  g.userData = { armL, armR, legL, legR, label };
  return g;
}
export function animateVillager(g, v, ridden) {
  g.position.set(v.x, v.y, v.z);
  g.rotation.y = v.yaw + Math.PI;
  const a = v.walking ? Math.sin(v.phase) * 0.7 : 0;
  const { armL, armR, legL, legR, label } = g.userData;
  legL.rotation.x = a; legR.rotation.x = -a;
  armL.rotation.x = ridden ? -0.5 : -a; armR.rotation.x = ridden ? -0.5 : a;
  label.visible = !ridden;
}
