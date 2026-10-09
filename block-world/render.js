// Block World rendering: procedural texture atlas, chunk meshing, props
// (doors, furniture, gadgets), villager models and block-bar icons.
import * as THREE from 'three';
import { W, H, D, CHUNK, B, BLOCKS, key, facingDir } from './engine.js?v=dev';

// ---------- texture atlas (16px tiles, drawn with a tiny seeded noise) ----------
const TN = ['GRASS_TOP', 'GRASS_SIDE', 'EARTH', 'STONE', 'SAND', 'PLANKS', 'LOG_SIDE', 'LOG_TOP', 'LEAVES', 'METAL', 'GLASS', 'WATER', 'BEDROCK', 'BRICK',
  'SNOW', 'MUD', 'PEBBLES', 'MOSSY', 'ICE', 'HAY_SIDE', 'HAY_TOP', 'CLOUD', 'DARKWOOD', 'COPPER', 'RUSTY', 'SLATE', 'MARBLE', 'ROOF', 'COBBLES', 'CHECKER', 'BOOKS',
  'P_RED', 'P_ORANGE', 'P_YELLOW', 'P_GREEN', 'P_BLUE', 'P_PURPLE', 'P_PINK', 'P_WHITE', 'P_BLACK', 'CANDY', 'CHOCOLATE', 'RAINBOW', 'HONEYCOMB',
  'G_RED', 'G_GREEN', 'G_BLUE', 'G_YELLOW', 'G_PURPLE', 'G_WHITE', 'MOONSTONE', 'EMBER', 'STARRY', 'CRYSTAL', 'BOUNCY_TOP', 'BOUNCY_SIDE'];
const T = Object.fromEntries(TN.map((n, i) => [n, i]));
const COLS = 8, ROWS = 8, TILE = 16;
const same = (t) => [t, t, t];
export const TILES_FOR = {
  [B.GRASS]: [T.GRASS_TOP, T.GRASS_SIDE, T.EARTH], [B.EARTH]: same(T.EARTH), [B.STONE]: same(T.STONE), [B.SAND]: same(T.SAND),
  [B.WOOD]: same(T.PLANKS), [B.LOG]: [T.LOG_TOP, T.LOG_SIDE, T.LOG_TOP], [B.LEAVES]: same(T.LEAVES), [B.METAL]: same(T.METAL),
  [B.GLASS]: same(T.GLASS), [B.WATER]: same(T.WATER), [B.BEDROCK]: same(T.BEDROCK), [B.BRICK]: same(T.BRICK),
  [B.SNOW]: same(T.SNOW), [B.MUD]: same(T.MUD), [B.PEBBLES]: same(T.PEBBLES), [B.MOSSY]: same(T.MOSSY), [B.ICE]: same(T.ICE),
  [B.HAY]: [T.HAY_TOP, T.HAY_SIDE, T.HAY_TOP], [B.CLOUD]: same(T.CLOUD), [B.DARKWOOD]: same(T.DARKWOOD), [B.COPPER]: same(T.COPPER),
  [B.RUSTY]: same(T.RUSTY), [B.SLATE]: same(T.SLATE), [B.MARBLE]: same(T.MARBLE), [B.ROOF]: same(T.ROOF), [B.COBBLES]: same(T.COBBLES),
  [B.CHECKER]: same(T.CHECKER), [B.BOOKCASE]: [T.DARKWOOD, T.BOOKS, T.DARKWOOD],
  [B.PAINT_RED]: same(T.P_RED), [B.PAINT_ORANGE]: same(T.P_ORANGE), [B.PAINT_YELLOW]: same(T.P_YELLOW), [B.PAINT_GREEN]: same(T.P_GREEN),
  [B.PAINT_BLUE]: same(T.P_BLUE), [B.PAINT_PURPLE]: same(T.P_PURPLE), [B.PAINT_PINK]: same(T.P_PINK), [B.PAINT_WHITE]: same(T.P_WHITE), [B.PAINT_BLACK]: same(T.P_BLACK),
  [B.CANDY]: same(T.CANDY), [B.CHOCOLATE]: same(T.CHOCOLATE), [B.RAINBOW]: same(T.RAINBOW), [B.HONEYCOMB]: same(T.HONEYCOMB),
  [B.GLOW_RED]: same(T.G_RED), [B.GLOW_GREEN]: same(T.G_GREEN), [B.GLOW_BLUE]: same(T.G_BLUE), [B.GLOW_YELLOW]: same(T.G_YELLOW),
  [B.GLOW_PURPLE]: same(T.G_PURPLE), [B.GLOW_WHITE]: same(T.G_WHITE), [B.MOONSTONE]: same(T.MOONSTONE), [B.EMBER]: same(T.EMBER),
  [B.STARRY]: same(T.STARRY), [B.CRYSTAL]: same(T.CRYSTAL), [B.BOUNCY]: [T.BOUNCY_TOP, T.BOUNCY_SIDE, T.BOUNCY_TOP],
};

function rngFor(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
function drawTile(ctx, t, base, vary, fn) {
  const rnd = rngFor(t * 7919 + 13);
  const ox = (t % COLS) * TILE, oy = Math.floor(t / COLS) * TILE;
  const img = ctx.createImageData(TILE, TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    let [r, g, b, a] = base; if (a === undefined) a = 255;
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
const edge = (x, y) => x === 0 || y === 0 || x === 15 || y === 15;
const lighter = (c, k) => [c[0] + k, c[1] + k, c[2] + k];
const PAINT = { P_RED: [220, 60, 60], P_ORANGE: [240, 140, 40], P_YELLOW: [245, 210, 60], P_GREEN: [70, 180, 90], P_BLUE: [60, 120, 220],
  P_PURPLE: [140, 80, 200], P_PINK: [245, 140, 190], P_WHITE: [240, 240, 240], P_BLACK: [40, 40, 45] };
const GLOW = { G_RED: [255, 80, 80], G_GREEN: [90, 255, 120], G_BLUE: [90, 170, 255], G_YELLOW: [255, 240, 90], G_PURPLE: [200, 110, 255], G_WHITE: [255, 255, 255] };
const RAINBOW = [[230, 60, 60], [240, 140, 40], [245, 220, 60], [70, 190, 90], [60, 130, 230], [120, 70, 200], [230, 90, 200]];
const BOOK_COLS = [[180, 50, 50], [50, 90, 170], [60, 140, 70], [200, 160, 50], [130, 70, 160], [200, 100, 60], [60, 160, 160]];
export function makeAtlas() {
  const c = document.createElement('canvas');
  c.width = COLS * TILE; c.height = ROWS * TILE;
  const ctx = c.getContext('2d');
  drawTile(ctx, T.GRASS_TOP, [92, 168, 62], 40);
  drawTile(ctx, T.GRASS_SIDE, [134, 96, 60], 30, (x, y, r) => (y < 3 || (y === 3 && r() < 0.5)) ? [92 + (r() - 0.5) * 40, 168 + (r() - 0.5) * 40, 62] : null);
  drawTile(ctx, T.EARTH, [134, 96, 60], 34);
  drawTile(ctx, T.STONE, [128, 128, 132], 28, (x, y, r) => r() < 0.06 ? [92, 92, 96] : null);
  drawTile(ctx, T.SAND, [222, 206, 150], 20);
  drawTile(ctx, T.PLANKS, [186, 140, 84], 18, (x, y) => (y % 4 === 3) ? [120, 86, 48] : (x === (y < 8 ? 7 : 15) ? [140, 100, 56] : null));
  drawTile(ctx, T.LOG_SIDE, [104, 76, 46], 22, (x) => (x % 4 === 0) ? [80, 58, 34] : null);
  drawTile(ctx, T.LOG_TOP, [190, 150, 96], 16, (x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return (Math.floor(d) % 2 === 0 && d < 7) ? [150, 112, 66] : (d >= 7 ? [104, 76, 46] : null); });
  drawTile(ctx, T.LEAVES, [60, 130, 48], 44, (x, y, r) => r() < 0.1 ? [34, 90, 30] : null);
  drawTile(ctx, T.METAL, [176, 182, 190], 10, (x, y) => ((x === 2 || x === 13) && (y === 2 || y === 13)) ? [90, 94, 100] : (x === 0 || y === 0) ? [210, 214, 220] : (x === 15 || y === 15) ? [120, 124, 130] : null);
  drawTile(ctx, T.GLASS, [220, 240, 255, 40], 0, (x, y) => edge(x, y) ? [240, 250, 255, 200] : ((x + y) === 9 || (x + y) === 10) ? [255, 255, 255, 110] : null);
  drawTile(ctx, T.WATER, [40, 110, 210], 18, (x, y, r) => r() < 0.08 ? [120, 180, 240] : null);
  drawTile(ctx, T.BEDROCK, [60, 60, 64], 40);
  drawTile(ctx, T.BRICK, [178, 76, 60], 18, (x, y) => (y % 4 === 3) ? [200, 190, 180] : (((y < 4 ? x : x + 4) % 8) === 7 ? [200, 190, 180] : null));
  drawTile(ctx, T.SNOW, [240, 245, 250], 10, (x, y, r) => r() < 0.05 ? [255, 255, 255] : null);
  drawTile(ctx, T.MUD, [92, 62, 40], 22, (x, y, r) => r() < 0.12 ? [70, 46, 30] : null);
  drawTile(ctx, T.PEBBLES, [150, 142, 132], 18, (x, y) => ((x * 7 + y * 13) % 17 < 3) ? [190, 184, 176] : ((x * 5 + y * 3) % 11 === 0) ? [110, 104, 98] : null);
  drawTile(ctx, T.MOSSY, [128, 128, 132], 24, (x, y, r) => r() < 0.3 ? [70, 130, 60] : null);
  drawTile(ctx, T.ICE, [190, 228, 255], 12, (x, y) => ((x + y) % 9 === 0) ? [240, 250, 255] : null);
  drawTile(ctx, T.HAY_SIDE, [214, 184, 82], 26, (x, y) => (y % 3 === 0) ? [170, 140, 50] : null);
  drawTile(ctx, T.HAY_TOP, [214, 184, 82], 26, (x, y) => (x % 4 === 0 || y % 4 === 0) ? [170, 140, 50] : null);
  drawTile(ctx, T.CLOUD, [246, 248, 255], 8, (x, y) => (Math.hypot(x - 5, y - 6) < 4 || Math.hypot(x - 11, y - 9) < 4) ? [255, 255, 255] : null);
  drawTile(ctx, T.DARKWOOD, [92, 62, 38], 14, (x, y) => (y % 4 === 3) ? [60, 40, 24] : (x === (y < 8 ? 7 : 15) ? [70, 46, 28] : null));
  drawTile(ctx, T.COPPER, [186, 116, 54], 18, (x, y, r) => r() < 0.08 ? [96, 170, 130] : edge(x, y) ? [150, 90, 40] : null);
  drawTile(ctx, T.RUSTY, [146, 92, 58], 30, (x, y, r) => r() < 0.18 ? [100, 100, 104] : null);
  drawTile(ctx, T.SLATE, [72, 78, 90], 14, (x, y) => (y % 8 === 7) ? [110, 116, 128] : (((y < 8 ? x : x + 4) % 8) === 7 ? [100, 106, 118] : null));
  drawTile(ctx, T.MARBLE, [236, 236, 242], 6, (x, y) => ((x * 2 + y) % 13 === 0 || (x + y * 3) % 17 === 0) ? [190, 192, 204] : null);
  drawTile(ctx, T.ROOF, [164, 72, 52], 16, (x, y) => (y % 4 === 3) ? [100, 44, 32] : (((y < 4 || (y >= 8 && y < 12) ? x : x + 4) % 8) === 0 ? [120, 54, 38] : null));
  drawTile(ctx, T.COBBLES, [122, 116, 110], 20, (x, y) => ((x % 5 === 0) || (y % 5 === 0)) ? [80, 76, 72] : null);
  drawTile(ctx, T.CHECKER, [240, 240, 240], 4, (x, y) => ((x < 8) !== (y < 8)) ? [30, 30, 34] : null);
  drawTile(ctx, T.BOOKS, [92, 62, 38], 10, (x, y) => {
    if (y < 2 || y > 13 || y === 7 || y === 8) return null;
    const col = BOOK_COLS[(Math.floor(x / 2) * 5 + (y < 7 ? 0 : 3)) % BOOK_COLS.length];
    return (x % 2 === 1) ? lighter(col, -30) : (y === 3 || y === 10) ? lighter(col, 40) : col;
  });
  for (const k of Object.keys(PAINT)) drawTile(ctx, T[k], PAINT[k], 10, (x, y) => edge(x, y) ? lighter(PAINT[k], -18) : null);
  drawTile(ctx, T.CANDY, [255, 255, 255], 4, (x, y) => ((x + y) % 8 < 4) ? [240, 90, 140] : null);
  drawTile(ctx, T.CHOCOLATE, [88, 50, 30], 10, (x, y) => (x % 8 === 0 || y % 8 === 0) ? [60, 34, 20] : (x % 8 === 1 || y % 8 === 1) ? [120, 76, 48] : null);
  drawTile(ctx, T.RAINBOW, [0, 0, 0], 0, (x, y) => RAINBOW[Math.min(6, Math.floor(y / 2.3))]);
  drawTile(ctx, T.HONEYCOMB, [232, 182, 46], 12, (x, y) => ((x + (Math.floor(y / 4) % 2) * 3) % 6 === 0 || y % 4 === 0) ? [160, 110, 20] : null);
  for (const k of Object.keys(GLOW)) drawTile(ctx, T[k], GLOW[k], 6, (x, y) => edge(x, y) ? lighter(GLOW[k], -60) : (x > 3 && x < 12 && y > 3 && y < 12) ? lighter(GLOW[k], 40) : null);
  drawTile(ctx, T.MOONSTONE, [196, 214, 250], 16, (x, y, r) => r() < 0.07 ? [255, 255, 255] : null);
  drawTile(ctx, T.EMBER, [44, 32, 30], 14, (x, y) => ((x * 3 + y * 5) % 11 === 0 || (x * 2 + y * 7) % 13 === 0) ? [255, 120, 30] : null);
  drawTile(ctx, T.STARRY, [16, 22, 60], 10, (x, y, r) => r() < 0.05 ? [255, 255, 230] : r() < 0.01 ? [255, 230, 120] : null);
  drawTile(ctx, T.CRYSTAL, [200, 140, 255, 150], 10, (x, y) => ((x + y) % 7 === 0) ? [255, 230, 255, 200] : edge(x, y) ? [150, 90, 220, 220] : null);
  drawTile(ctx, T.BOUNCY_TOP, [255, 120, 180], 8, (x, y) => ((x % 4 === 1) && (y % 4 === 1)) ? [255, 230, 240] : null);
  drawTile(ctx, T.BOUNCY_SIDE, [255, 120, 180], 8, (x, y) => (y % 5 === 2) ? [230, 80, 150] : null);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { texture: tex, canvas: c };
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
function makeMaterials(atlas) {
  return {
    opaque: new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true }),
    clear: new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    water: new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    glow: new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true }),   // unlit: shines at night
  };
}
const bufFor = (id, bufs) => id === B.WATER ? bufs.water : BLOCKS[id].clear ? bufs.clear : BLOCKS[id].glow ? bufs.glow : bufs.opaque;
function faceVisible(id, nid) {
  const ninfo = BLOCKS[nid];
  if (id === B.WATER) return nid !== B.WATER && !ninfo.opaque;
  if (BLOCKS[id].clear) return nid !== id && !ninfo.opaque;
  return !ninfo.opaque;
}

export class WorldRenderer {
  constructor(scene, world, atlas) {
    this.scene = scene; this.world = world;
    this.group = new THREE.Group(); scene.add(this.group);
    this.chunks = new Map();
    this.mats = makeMaterials(atlas);
    this.lightsByChunk = new Map();
    this.clocksByChunk = new Map();
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
    const bufs = { opaque: new GeomBuf(), clear: new GeomBuf(), water: new GeomBuf(), glow: new GeomBuf() };
    const g = new THREE.Group();
    const lights = [], clocks = [];
    for (let y = 0; y < H; y++) for (let z = z0; z < z0 + CHUNK; z++) for (let x = x0; x < x0 + CHUNK; x++) {
      const id = w.get(x, y, z);
      if (id === B.AIR) continue;
      const info = BLOCKS[id];
      if (info.special) {
        const p = buildProp(id, w.meta.get(key(x, y, z)) || {}, x, y, z);
        g.add(p);
        if (info.light) lights.push([x + 0.5, y + 0.7, z + 0.5]);
        if (p.userData.hands) clocks.push(p.userData.hands);
        continue;
      }
      const tiles = TILES_FOR[id] || TILES_FOR[B.STONE];
      const buf = bufFor(id, bufs);
      for (const f of FACES) {
        const nid = w.get(x + f.n[0], y + f.n[1], z + f.n[2]);
        if (!faceVisible(id, nid)) continue;
        const topY = (id === B.WATER && w.get(x, y + 1, z) !== B.WATER) ? 0.85 : 1;
        buf.quad(x, y, z, f, tiles[f.t], f.s, topY);
      }
    }
    for (const name of ['opaque', 'clear', 'water', 'glow']) { const geo = bufs[name].build(); if (geo) g.add(new THREE.Mesh(geo, this.mats[name])); }
    g.userData.centre = [x0 + CHUNK / 2, z0 + CHUNK / 2];
    this.group.add(g);
    this.chunks.set(k, g);
    this.lightsByChunk.set(k, lights);
    this.clocksByChunk.set(k, clocks);
  }
  // Hide chunks beyond the fog so the big world stays cheap to draw.
  cull(px, pz, maxDist) {
    for (const g of this.chunks.values()) {
      const [cx, cz] = g.userData.centre;
      g.visible = Math.hypot(cx - px, cz - pz) < maxDist;
    }
  }
  allLights() { return [].concat(...this.lightsByChunk.values()); }
  allClocks() { return [].concat(...this.clocksByChunk.values()); }
}

// ---------- props ----------
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
const unlit = (c) => new THREE.MeshBasicMaterial({ color: c });
const M = {
  wood: lam(0xb98a4e), woodDark: lam(0x7a5630), metal: lam(0x9aa0a8), metalDark: lam(0x3c4046), black: lam(0x15171a),
  screen: unlit(0x3fa9ff), red: unlit(0xff3b3b), green: unlit(0x3bff6a), gold: lam(0xe6b422), lens: unlit(0x1d3a6b),
  white: lam(0xf4f4f6), cream: lam(0xf1e7d0), blue: lam(0x3b6fd6), fabricRed: lam(0xc0392b), terracotta: lam(0xc0623a), leaf: lam(0x3d9a40),
  glowWarm: unlit(0xffe6a0), glowCool: unlit(0xf4f8ff), glass: new THREE.MeshLambertMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.5 }),
  waterBlue: new THREE.MeshLambertMaterial({ color: 0x3f8fe0, transparent: true, opacity: 0.8 }), clockFace: lam(0xffffff), grey: lam(0x8a8f96),
};
const CARPETS = { [B.CARPET_RED]: [0xc0392b], [B.CARPET_BLUE]: [0x2e6fd6], [B.CARPET_GREEN]: [0x3f9f4f], [B.CARPET_PURPLE]: [0x8a4fc9],
  [B.CARPET_RAINBOW]: [0xe64545, 0xf29b2c, 0xf3d93c, 0x47be5a, 0x3c82e6, 0x7a46c8, 0xe65ac8] };
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
export function propDescription(id, meta, open) {
  switch (id) {
    case B.DOOR: case B.DOOR_TOP: return open ? 'Door (open) – tap to close' : 'Door – tap to open';
    case B.TRAPDOOR: return open ? 'Trapdoor (open) – tap to close' : 'Passcode trapdoor – tap to enter the code';
    case B.CHEST: return 'Chest – tap to open';
    case B.COMPUTER: return 'Computer – tap to watch the cameras';
    case B.CAMERA: return `Security camera ${meta && meta.n ? meta.n : ''}`;
    case B.BED: case B.BED_FOOT: return 'Bed – tap to sleep till morning';
    case B.CHAIR: case B.SOFA: return `${BLOCKS[id].name} – tap to sit`;
    case B.FRIDGE: return 'Fridge – tap for a snack';
    case B.COOKER: return 'Cooker – tap to bake';
    case B.TOILET: return 'Toilet – tap to flush';
    case B.BATH: return 'Bath – tap for a splash';
  }
  return BLOCKS[id].name;
}
function hashPos(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
export function buildProp(id, meta, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x + 0.5, y, z + 0.5);
  if (id === B.DOOR_TOP || id === B.BED_FOOT) return g;   // the first cell draws the whole thing
  g.rotation.y = (meta.facing || 0) * Math.PI / 2;
  const legs = (h, mat, inset = 0.4) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.08, h, 0.08, mat, sx * inset, h / 2, sz * inset)); };
  switch (id) {
    case B.DOOR: {
      const hinge = new THREE.Group(); hinge.position.set(-0.5, 0, 0.42);
      const panel = box(1, 2, 0.12, M.wood, 0.5, 1, 0);
      panel.add(box(0.12, 0.12, 0.16, M.gold, 0.32, 0, 0));
      panel.add(box(0.7, 0.7, 0.14, M.woodDark, 0, 0.5, 0), box(0.7, 0.7, 0.14, M.woodDark, 0, -0.5, 0));
      hinge.add(panel);
      hinge.rotation.y = meta.open ? -Math.PI / 2 : 0;
      g.add(hinge); break;
    }
    case B.TRAPDOOR: {
      g.add(box(0.08, 0.16, 1, M.metalDark, -0.46, 0.92, 0), box(0.08, 0.16, 1, M.metalDark, 0.46, 0.92, 0));
      g.add(box(1, 0.16, 0.08, M.metalDark, 0, 0.92, -0.46), box(1, 0.16, 0.08, M.metalDark, 0, 0.92, 0.46));
      const hinge = new THREE.Group(); hinge.position.set(0, 0.94, -0.42);
      const panel = box(0.84, 0.1, 0.84, M.metal, 0, 0, 0.42);
      panel.add(box(0.3, 0.06, 0.2, M.black, 0, 0.08, 0.1));
      panel.add(box(0.08, 0.04, 0.08, meta.open ? M.green : M.red, 0, 0.12, 0.1));
      hinge.add(panel);
      hinge.rotation.x = meta.open ? -Math.PI / 2 : 0;
      g.add(hinge); break;
    }
    case B.CHEST:
      g.add(box(0.9, 0.6, 0.7, M.wood, 0, 0.3, 0), box(0.94, 0.26, 0.74, M.woodDark, 0, 0.73, 0), box(0.16, 0.22, 0.06, M.gold, 0, 0.62, 0.37)); break;
    case B.COMPUTER: {
      g.add(box(0.5, 0.06, 0.4, M.metalDark, 0, 0.03, -0.1), box(0.08, 0.3, 0.08, M.metalDark, 0, 0.2, -0.1));
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.56, 0.08), [M.black, M.black, M.black, M.black, M.screen, M.black]);
      screen.position.set(0, 0.6, -0.1); g.add(screen);
      g.add(box(0.6, 0.04, 0.22, M.metal, 0, 0.02, 0.28)); break;
    }
    case B.CAMERA: {
      g.rotation.y = 0;
      g.add(box(0.2, 0.2, 0.2, M.metalDark, 0, 0.4, 0));
      const head = new THREE.Group(); head.position.set(0, 0.5, 0);
      head.rotation.order = 'YXZ'; head.rotation.y = meta.yaw || 0; head.rotation.x = meta.pitch || 0;
      head.add(box(0.26, 0.26, 0.5, M.metal, 0, 0, 0), box(0.18, 0.18, 0.1, M.lens, 0, 0, -0.3), box(0.05, 0.05, 0.05, M.red, 0.09, 0.09, -0.27));
      g.add(head);
      if (meta.n) g.add(makeLabel(`📷 ${meta.n}`, 0.8, 0.45));
      break;
    }
    case B.BED:   // head here, foot in the cell in front (local -z)
      g.add(box(0.96, 0.3, 1.96, M.woodDark, 0, 0.15, -0.5), box(0.9, 0.2, 1.86, M.cream, 0, 0.35, -0.5));
      g.add(box(0.9, 0.12, 1.2, M.blue, 0, 0.47, -0.85), box(0.7, 0.14, 0.4, M.white, 0, 0.5, 0.15), box(1, 0.9, 0.1, M.woodDark, 0, 0.45, 0.45));
      break;
    case B.LAMP:
      g.add(box(0.4, 0.06, 0.4, M.metalDark, 0, 0.03, 0), box(0.08, 1.0, 0.08, M.metalDark, 0, 0.5, 0), box(0.5, 0.36, 0.5, M.glowWarm, 0, 1.15, 0));
      break;
    case B.LANTERN:
      g.add(box(0.04, 0.3, 0.04, M.metalDark, 0, 0.85, 0), box(0.34, 0.06, 0.34, M.metalDark, 0, 0.7, 0), box(0.28, 0.36, 0.28, M.glowWarm, 0, 0.5, 0), box(0.34, 0.06, 0.34, M.metalDark, 0, 0.3, 0));
      break;
    case B.CEILING_LIGHT:
      g.add(box(0.8, 0.08, 0.8, M.glowCool, 0, 0.96, 0), box(0.9, 0.04, 0.9, M.metal, 0, 1.0, 0));
      break;
    case B.SHELF:   // against the wall behind it (local +z)
      g.add(box(0.9, 0.06, 0.4, M.wood, 0, 0.6, 0.3), box(0.06, 0.3, 0.3, M.woodDark, -0.4, 0.42, 0.35), box(0.06, 0.3, 0.3, M.woodDark, 0.4, 0.42, 0.35));
      g.add(box(0.12, 0.3, 0.26, lam(0xc0392b), -0.28, 0.78, 0.3), box(0.12, 0.26, 0.26, lam(0x2e6fd6), -0.14, 0.76, 0.3), box(0.2, 0.2, 0.2, M.terracotta, 0.2, 0.73, 0.3));
      break;
    case B.TABLE:
      g.add(box(0.96, 0.08, 0.96, M.wood, 0, 0.78, 0)); legs(0.74, M.woodDark); break;
    case B.DESK:
      g.add(box(0.98, 0.08, 0.9, M.wood, 0, 0.78, 0), box(0.4, 0.74, 0.8, M.woodDark, 0.27, 0.37, 0));
      for (const yy of [0.2, 0.42, 0.64]) g.add(box(0.14, 0.04, 0.04, M.gold, 0.27, yy, 0.41));
      g.add(box(0.08, 0.74, 0.08, M.woodDark, -0.42, 0.37, -0.38), box(0.08, 0.74, 0.08, M.woodDark, -0.42, 0.37, 0.38));
      break;
    case B.CHAIR:
      g.add(box(0.5, 0.06, 0.5, M.wood, 0, 0.48, 0), box(0.5, 0.5, 0.06, M.wood, 0, 0.76, 0.22)); legs(0.45, M.woodDark, 0.2); break;
    case B.SOFA:
      g.add(box(0.96, 0.4, 0.8, M.fabricRed, 0, 0.2, 0), box(0.96, 0.5, 0.2, M.fabricRed, 0, 0.6, 0.3), box(0.12, 0.3, 0.8, M.fabricRed, -0.42, 0.55, 0), box(0.12, 0.3, 0.8, M.fabricRed, 0.42, 0.55, 0));
      break;
    case B.CARPET_RED: case B.CARPET_BLUE: case B.CARPET_GREEN: case B.CARPET_PURPLE: case B.CARPET_RAINBOW: {
      const cols = CARPETS[id], n = cols.length;
      cols.forEach((c, i) => g.add(box(1, 0.06, 1 / n, lam(c), 0, 0.03, -0.5 + (i + 0.5) / n)));
      break;
    }
    case B.PLANT:
      g.add(box(0.3, 0.3, 0.3, M.terracotta, 0, 0.15, 0), box(0.1, 0.5, 0.1, M.woodDark, 0, 0.5, 0));
      g.add(box(0.5, 0.3, 0.5, M.leaf, 0, 0.75, 0), box(0.3, 0.25, 0.3, M.leaf, 0, 0.98, 0)); break;
    case B.PAINTING: {   // abstract art, different for every spot
      const h = hashPos(x, y, z);
      g.add(box(0.84, 0.64, 0.06, M.gold, 0, 0.6, 0.46));
      for (let i = 0; i < 4; i++) {
        const c = RAINBOW[(h >> (i * 3)) % 7];
        g.add(box(0.2 + ((h >> (i * 2)) % 3) * 0.1, 0.15 + ((h >> (i * 5)) % 3) * 0.1, 0.02, lam((c[0] << 16) | (c[1] << 8) | c[2]), -0.25 + i * 0.17, 0.5 + ((h >> (i * 4)) % 3) * 0.1, 0.42));
      }
      break;
    }
    case B.CLOCK: {
      g.add(box(0.5, 0.5, 0.08, M.woodDark, 0, 0.6, 0.45), box(0.42, 0.42, 0.04, M.clockFace, 0, 0.6, 0.4));
      const hour = box(0.04, 0.14, 0.02, M.black, 0, 0.07, 0), minute = box(0.03, 0.19, 0.02, M.black, 0, 0.095, 0);
      const hg = new THREE.Group(), mg = new THREE.Group(); hg.add(hour); mg.add(minute);
      hg.position.set(0, 0.6, 0.38); mg.position.set(0, 0.6, 0.375); g.add(hg, mg);
      g.userData.hands = { hour: hg, minute: mg };
      break;
    }
    case B.TOILET:
      g.add(box(0.4, 0.4, 0.5, M.white, 0, 0.2, -0.05), box(0.5, 0.1, 0.56, M.white, 0, 0.45, -0.05), box(0.46, 0.5, 0.2, M.white, 0, 0.65, 0.35), box(0.1, 0.05, 0.05, M.metal, 0.12, 0.92, 0.35));
      break;
    case B.BATH:
      g.add(box(0.96, 0.5, 0.96, M.white, 0, 0.25, 0), box(0.8, 0.1, 0.8, M.waterBlue, 0, 0.47, 0), box(0.06, 0.2, 0.06, M.metal, -0.2, 0.6, -0.4), box(0.06, 0.2, 0.06, M.metal, 0.2, 0.6, -0.4));
      break;
    case B.FRIDGE:
      g.add(box(0.8, 0.98, 0.8, M.white, 0, 0.49, 0), box(0.04, 0.5, 0.04, M.metal, 0.3, 0.55, -0.42), box(0.78, 0.02, 0.82, M.metal, 0, 0.7, 0));
      break;
    case B.COOKER:
      g.add(box(0.9, 0.9, 0.9, M.white, 0, 0.45, 0), box(0.7, 0.4, 0.04, M.black, 0, 0.35, -0.46), box(0.7, 0.04, 0.02, M.metal, 0, 0.62, -0.47));
      for (const sx of [-0.22, 0.22]) for (const sz of [-0.22, 0.22]) g.add(box(0.26, 0.03, 0.26, M.black, sx, 0.91, sz));
      break;
  }
  g.userData.cell = [x, y, z];
  return g;
}
export function animateClocks(hands, date = new Date()) {
  const h = date.getHours() % 12 + date.getMinutes() / 60, m = date.getMinutes() + date.getSeconds() / 60;
  for (const c of hands) { c.hour.rotation.z = -h / 12 * Math.PI * 2; c.minute.rotation.z = -m / 60 * Math.PI * 2; }
}

// ---------- block-bar icons: tiny 3D renders of every block ----------
export function makeIcons(atlas, ids) {
  const size = 72;
  const r = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), alpha: true, antialias: true });
  r.setSize(size, size); r.setClearColor(0x000000, 0);
  const sc = new THREE.Scene();
  sc.add(new THREE.DirectionalLight(0xffffff, 2.2).translateX(1).translateY(3).translateZ(2), new THREE.HemisphereLight(0xffffff, 0x777777, 1.3));
  const cam = new THREE.OrthographicCamera(-0.95, 0.95, 0.95, -0.95, 0.1, 20);
  cam.position.set(3, 2.6, 3); cam.lookAt(0.5, 0.5, 0.5);
  const mats = makeMaterials(atlas), out = new Map();
  for (const id of ids) {
    let obj;
    if (BLOCKS[id].special) {
      obj = buildProp(id, { facing: 0, n: 0 }, 0, 0, 0);
      if (id === B.BED) obj.position.z += 0.5;
    } else {
      const buf = new GeomBuf(), tiles = TILES_FOR[id] || TILES_FOR[B.STONE];
      for (const f of FACES) buf.quad(0, 0, 0, f, tiles[f.t], f.s);
      obj = new THREE.Mesh(buf.build(), mats[id === B.WATER ? 'water' : BLOCKS[id].clear ? 'clear' : BLOCKS[id].glow ? 'glow' : 'opaque']);
    }
    sc.add(obj); r.render(sc, cam); out.set(id, r.domElement.toDataURL()); sc.remove(obj);
    obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  r.dispose(); r.forceContextLoss();
  return out;
}

// ---------- villagers ----------
const skinMat = lam(0xf1c27d), legMat = lam(0x33415c), eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
const hairMats = [0x2b1b0e, 0xd9a441, 0x5a2b0c, 0x1a1a1a, 0xb5651d].map(lam);
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
  const shirt = lam(new THREE.Color(v.shirt));
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
