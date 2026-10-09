// Block World engine — DOM-free. World data, terrain, water, physics,
// raycasting, villagers, special blocks and save/load.
// Unit tests: node tests/engine.test.mjs

export const W = 256, H = 48, D = 256;   // world size in blocks (x, y, z)
export const LEGACY_W = 128;             // the first worlds were 128 wide; they load into the middle
export const SEA = 14;                   // lakes fill up to this level
export const SPRING_DEPTH = 3;           // dig this far under the ground and water appears
export const CHUNK = 16;

const names = [
  'AIR', 'GRASS', 'EARTH', 'STONE', 'SAND', 'WOOD', 'LOG', 'LEAVES', 'METAL', 'GLASS', 'WATER', 'DOOR', 'DOOR_TOP', 'TRAPDOOR',
  'CHEST', 'COMPUTER', 'CAMERA', 'BEDROCK', 'BRICK',
  // nature
  'SNOW', 'MUD', 'PEBBLES', 'MOSSY', 'ICE', 'HAY', 'CLOUD',
  // building
  'DARKWOOD', 'COPPER', 'RUSTY', 'SLATE', 'MARBLE', 'ROOF', 'COBBLES', 'CHECKER', 'BOOKCASE',
  // colours
  'PAINT_RED', 'PAINT_ORANGE', 'PAINT_YELLOW', 'PAINT_GREEN', 'PAINT_BLUE', 'PAINT_PURPLE', 'PAINT_PINK', 'PAINT_WHITE', 'PAINT_BLACK',
  'CANDY', 'CHOCOLATE', 'RAINBOW', 'HONEYCOMB',
  // magic
  'GLOW_RED', 'GLOW_GREEN', 'GLOW_BLUE', 'GLOW_YELLOW', 'GLOW_PURPLE', 'GLOW_WHITE', 'MOONSTONE', 'EMBER', 'STARRY', 'CRYSTAL', 'BOUNCY',
  // furniture
  'BED', 'BED_FOOT', 'LAMP', 'LANTERN', 'CEILING_LIGHT', 'SHELF', 'TABLE', 'DESK', 'CHAIR', 'SOFA',
  'CARPET_RED', 'CARPET_BLUE', 'CARPET_GREEN', 'CARPET_PURPLE', 'CARPET_RAINBOW', 'PLANT', 'PAINTING', 'CLOCK', 'TOILET', 'BATH', 'FRIDGE', 'COOKER',
];
export const B = Object.fromEntries(names.map((n, i) => [n, i]));

// solid: blocks movement (doors/trapdoors only when closed). opaque: hides
// neighbouring faces. special: rendered as a prop, not part of the chunk mesh.
// glow: lit up at night. light: casts a real light. bouncy: springs you up.
const cube = (name, extra = {}) => ({ name, solid: true, opaque: true, placeable: true, ...extra });
const prop = (name, extra = {}) => ({ name, solid: false, opaque: false, special: true, placeable: true, ...extra });
const DEFS = {
  AIR: { name: 'Air', solid: false, opaque: false },
  GRASS: cube('Grass'), EARTH: cube('Earth'), STONE: cube('Stone'), SAND: cube('Sand'), WOOD: cube('Wood'), LOG: cube('Log'),
  LEAVES: cube('Leaves'), METAL: cube('Metal'), GLASS: cube('Glass', { opaque: false, clear: true }),
  WATER: { name: 'Water', solid: false, opaque: false },
  DOOR: prop('Door', { solid: true }), DOOR_TOP: prop('Door (top)', { solid: true, placeable: false }),
  TRAPDOOR: prop('Passcode trapdoor', { solid: true }), CHEST: prop('Chest', { solid: true }), COMPUTER: prop('Computer', { solid: true }),
  CAMERA: prop('Security camera'), BEDROCK: cube('Bedrock', { placeable: false }), BRICK: cube('Brick'),
  SNOW: cube('Snow'), MUD: cube('Mud'), PEBBLES: cube('Pebbles'), MOSSY: cube('Mossy stone'), ICE: cube('Ice'), HAY: cube('Hay bale'), CLOUD: cube('Cloud'),
  DARKWOOD: cube('Dark wood'), COPPER: cube('Copper'), RUSTY: cube('Rusty metal'), SLATE: cube('Slate'), MARBLE: cube('Marble'), ROOF: cube('Roof tiles'),
  COBBLES: cube('Cobbles'), CHECKER: cube('Checkerboard'), BOOKCASE: cube('Bookcase'),
  PAINT_RED: cube('Red paint'), PAINT_ORANGE: cube('Orange paint'), PAINT_YELLOW: cube('Yellow paint'), PAINT_GREEN: cube('Green paint'),
  PAINT_BLUE: cube('Blue paint'), PAINT_PURPLE: cube('Purple paint'), PAINT_PINK: cube('Pink paint'), PAINT_WHITE: cube('White paint'), PAINT_BLACK: cube('Black paint'),
  CANDY: cube('Candy stripe'), CHOCOLATE: cube('Chocolate'), RAINBOW: cube('Rainbow'), HONEYCOMB: cube('Honeycomb'),
  GLOW_RED: cube('Red glow', { glow: true }), GLOW_GREEN: cube('Green glow', { glow: true }), GLOW_BLUE: cube('Blue glow', { glow: true }),
  GLOW_YELLOW: cube('Yellow glow', { glow: true }), GLOW_PURPLE: cube('Purple glow', { glow: true }), GLOW_WHITE: cube('White glow', { glow: true }),
  MOONSTONE: cube('Moonstone', { glow: true }), EMBER: cube('Ember rock', { glow: true }), STARRY: cube('Starry night', { glow: true }),
  CRYSTAL: cube('Crystal', { opaque: false, clear: true }), BOUNCY: cube('Bouncy block', { bouncy: true }),
  BED: prop('Bed', { solid: true }), BED_FOOT: prop('Bed (foot)', { solid: true, placeable: false }),
  LAMP: prop('Lamp', { light: true }), LANTERN: prop('Lantern', { light: true }), CEILING_LIGHT: prop('Ceiling light', { light: true }),
  SHELF: prop('Shelf'), TABLE: prop('Table', { solid: true }), DESK: prop('Desk', { solid: true }), CHAIR: prop('Chair', { seat: 0.5 }), SOFA: prop('Sofa', { solid: true, seat: 0.45 }),
  CARPET_RED: prop('Red carpet'), CARPET_BLUE: prop('Blue carpet'), CARPET_GREEN: prop('Green carpet'), CARPET_PURPLE: prop('Purple carpet'), CARPET_RAINBOW: prop('Rainbow carpet'),
  PLANT: prop('Pot plant'), PAINTING: prop('Painting'), CLOCK: prop('Clock'), TOILET: prop('Toilet'), BATH: prop('Bath'),
  FRIDGE: prop('Fridge', { solid: true }), COOKER: prop('Cooker', { solid: true }),
};
export const BLOCKS = names.map((n, i) => ({ id: i, ...DEFS[n] }));

// Groups for the block bar.
export const CATEGORIES = [
  { name: 'Nature', icon: '🌳', ids: ['GRASS', 'EARTH', 'STONE', 'SAND', 'LOG', 'LEAVES', 'SNOW', 'MUD', 'PEBBLES', 'MOSSY', 'ICE', 'HAY', 'CLOUD'] },
  { name: 'Building', icon: '🧱', ids: ['WOOD', 'DARKWOOD', 'BRICK', 'METAL', 'GLASS', 'COPPER', 'RUSTY', 'SLATE', 'MARBLE', 'ROOF', 'COBBLES', 'CHECKER', 'BOOKCASE'] },
  { name: 'Colours', icon: '🎨', ids: ['PAINT_RED', 'PAINT_ORANGE', 'PAINT_YELLOW', 'PAINT_GREEN', 'PAINT_BLUE', 'PAINT_PURPLE', 'PAINT_PINK', 'PAINT_WHITE', 'PAINT_BLACK', 'CANDY', 'CHOCOLATE', 'RAINBOW', 'HONEYCOMB'] },
  { name: 'Magic', icon: '✨', ids: ['GLOW_RED', 'GLOW_GREEN', 'GLOW_BLUE', 'GLOW_YELLOW', 'GLOW_PURPLE', 'GLOW_WHITE', 'MOONSTONE', 'EMBER', 'STARRY', 'CRYSTAL', 'BOUNCY'] },
  { name: 'Furniture', icon: '🛋️', ids: ['BED', 'LAMP', 'LANTERN', 'CEILING_LIGHT', 'SHELF', 'TABLE', 'DESK', 'CHAIR', 'SOFA', 'CARPET_RED', 'CARPET_BLUE', 'CARPET_GREEN', 'CARPET_PURPLE', 'CARPET_RAINBOW', 'PLANT', 'PAINTING', 'CLOCK', 'TOILET', 'BATH', 'FRIDGE', 'COOKER'] },
  { name: 'Gadgets', icon: '🔧', ids: ['DOOR', 'TRAPDOOR', 'CHEST', 'COMPUTER', 'CAMERA'] },
].map((c) => ({ ...c, ids: c.ids.map((n) => B[n]) }));

export const ITEMS = [
  { id: 'apple', label: 'Apple', emoji: '🍎' },
  { id: 'gem', label: 'Gem', emoji: '💎' },
  { id: 'coin', label: 'Gold coin', emoji: '🪙' },
  { id: 'key', label: 'Key', emoji: '🗝️' },
  { id: 'flower', label: 'Flower', emoji: '🌻' },
  { id: 'fish', label: 'Fish', emoji: '🐟' },
  { id: 'book', label: 'Book', emoji: '📕' },
  { id: 'star', label: 'Star', emoji: '⭐' },
  { id: 'cake', label: 'Cake', emoji: '🍰' },
  { id: 'robot', label: 'Toy robot', emoji: '🤖' },
];
export const CHEST_SLOTS = 9;
export const POCKET_SLOTS = 9;

export const VILLAGER_NAMES = ['Pip', 'Zara', 'Bob', 'Luna', 'Max', 'Ollie', 'Mia', 'Ted', 'Nia', 'Gus'];
export const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ff6fb5'];

// ---------- random + noise ----------
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
export function valueNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smooth(x - x0), fy = smooth(y - y0);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
export function fbm(x, y, seed, octaves = 4) {
  let v = 0, amp = 1, f = 1, tot = 0;
  for (let i = 0; i < octaves; i++) { v += valueNoise(x * f, y * f, seed + i * 97) * amp; tot += amp; amp *= 0.5; f *= 2; }
  return v / tot;
}

export const key = (x, y, z) => `${x},${y},${z}`;
export const facingDir = (f) => [[0, -1], [-1, 0], [0, 1], [1, 0]][((f % 4) + 4) % 4];
export const chunkKey = (x, z) => `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;

// ---------- world ----------
export class World {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.blocks = new Uint8Array(W * H * D);
    this.surface = new Uint8Array(W * D);   // original ground height per column
    this.meta = new Map();                  // "x,y,z" -> data for special blocks
    this.dirty = new Set();                 // chunk keys needing a remesh
    this.waterQueue = [];
    this.spawn = { x: W / 2 + 0.5, y: 30, z: D / 2 + 0.5 };
  }
  inBounds(x, y, z) { return x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D; }
  idx(x, y, z) { return x + W * (z + D * y); }
  get(x, y, z) {
    if (y >= H) return B.AIR;
    if (y < 0 || x < 0 || x >= W || z < 0 || z >= D) return B.BEDROCK;
    return this.blocks[x + W * (z + D * y)];
  }
  set(x, y, z, id) {
    if (!this.inBounds(x, y, z)) return;
    const i = x + W * (z + D * y);
    if (this.blocks[i] === id) return;
    this.blocks[i] = id;
    this.markDirty(x, z);
  }
  markDirty(x, z) {
    this.dirty.add(chunkKey(x, z));
    const lx = x % CHUNK, lz = z % CHUNK;  // neighbouring chunk faces may change too
    if (lx === 0) this.dirty.add(chunkKey(x - 1, z));
    if (lx === CHUNK - 1) this.dirty.add(chunkKey(x + 1, z));
    if (lz === 0) this.dirty.add(chunkKey(x, z - 1));
    if (lz === CHUNK - 1) this.dirty.add(chunkKey(x, z + 1));
  }
  info(x, y, z) { return BLOCKS[this.get(x, y, z)]; }
  isWater(x, y, z) { return this.get(x, y, z) === B.WATER; }
  isSolid(x, y, z) {
    const id = this.get(x, y, z);
    if (id === B.DOOR || id === B.DOOR_TOP || id === B.TRAPDOOR) {
      const m = this.meta.get(key(x, id === B.DOOR_TOP ? y - 1 : y, z));
      return !(m && m.open);
    }
    return BLOCKS[id].solid;
  }
  surfaceAt(x, z) { return this.surface[x + W * z]; }
  // top solid block right now (used for spawning things)
  groundAt(x, z) {
    for (let y = H - 1; y >= 0; y--) { const id = this.get(x, y, z); if (BLOCKS[id].solid) return y; }
    return 0;
  }

  // ----- terrain -----
  generate() {
    const s = this.seed, rng = makeRng(s);
    this.blocks.fill(0);
    const OFF = (W - LEGACY_W) / 2;   // noise coordinates match the original 128-wide worlds in the middle
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const n = fbm((x - OFF) / 40, (z - OFF) / 40, s, 4);
      const ridge = fbm((x - OFF) / 13, (z - OFF) / 13, s + 1000, 2);
      const t = Math.max(-1, Math.min(1, (n - 0.5) * 2.6));   // spread the noise out: valleys become lakes
      let h = Math.round(SEA + 5 + t * 16 + (ridge - 0.5) * 3);
      h = Math.max(4, Math.min(H - 10, h));
      this.surface[x + W * z] = h;
      const beach = h <= SEA + 1;
      for (let y = 0; y <= h; y++) {
        let id;
        if (y === 0) id = B.BEDROCK;
        else if (y < h - 3) id = B.STONE;
        else if (y < h) id = beach ? B.SAND : B.EARTH;
        else id = beach ? B.SAND : h >= SEA + 15 ? B.SNOW : B.GRASS;
        this.blocks[this.idx(x, y, z)] = id;
      }
      for (let y = h + 1; y <= SEA; y++) this.blocks[this.idx(x, y, z)] = B.WATER;
    }
    // trees
    for (let i = 0; i < (W * D) / 75; i++) {
      const x = 3 + Math.floor(rng() * (W - 6)), z = 3 + Math.floor(rng() * (D - 6));
      const h = this.surfaceAt(x, z);
      if (this.get(x, h, z) !== B.GRASS || h + 7 >= H) continue;
      if (fbm((x - OFF) / 25, (z - OFF) / 25, s + 77, 2) < 0.5) continue;   // forests in patches
      if (Math.hypot(x - W / 2, z - D / 2) < 10) continue;   // keep the spawn clearing open
      let crowded = false;   // trees keep a little space between them
      for (let dx = -2; dx <= 2 && !crowded; dx++) for (let dz = -2; dz <= 2; dz++) if (this.get(x + dx, h + 1, z + dz) === B.LOG) { crowded = true; break; }
      if (crowded) continue;
      this.tree(x, h + 1, z, 4 + Math.floor(rng() * 3));
    }
    // hidden treasure chests underground, each in a little stone pocket
    for (let i = 0; i < (W * D) / 1200; i++) {
      const x = 4 + Math.floor(rng() * (W - 8)), z = 4 + Math.floor(rng() * (D - 8));
      const h = this.surfaceAt(x, z);
      const y = 2 + Math.floor(rng() * Math.max(1, h - 7));
      if (y + 1 >= h - 3) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) this.blocks[this.idx(x + dx, y + dy, z + dz)] = B.AIR;
      this.blocks[this.idx(x, y, z)] = B.CHEST;
      const items = [];
      const n = 2 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) items.push(ITEMS[Math.floor(rng() * ITEMS.length)].id);
      this.meta.set(key(x, y, z), { items });
    }
    // a few chests on the surface too, so there is something to find straight away
    for (let i = 0; i < (W * D) / 2700; i++) {
      const x = 4 + Math.floor(rng() * (W - 8)), z = 4 + Math.floor(rng() * (D - 8));
      const h = this.surfaceAt(x, z);
      if (this.get(x, h + 1, z) !== B.AIR || h <= SEA) continue;
      this.blocks[this.idx(x, h + 1, z)] = B.CHEST;
      this.meta.set(key(x, h + 1, z), { items: [ITEMS[Math.floor(rng() * ITEMS.length)].id, ITEMS[Math.floor(rng() * ITEMS.length)].id] });
    }
    // spawn on dry land near the middle
    let best = null;
    for (let r = 0; r < 60 && !best; r++) {
      for (let a = 0; a < 16 && !best; a++) {
        const x = Math.floor(W / 2 + Math.cos(a / 16 * Math.PI * 2) * r), z = Math.floor(D / 2 + Math.sin(a / 16 * Math.PI * 2) * r);
        if (this.get(x, this.surfaceAt(x, z), z) === B.GRASS && this.get(x, this.surfaceAt(x, z) + 1, z) === B.AIR) best = { x, z };
      }
    }
    if (!best) best = { x: W / 2, z: D / 2 };
    this.spawn = { x: best.x + 0.5, y: this.groundAt(best.x, best.z) + 1.01, z: best.z + 0.5 };
    for (let cz = 0; cz < D / CHUNK; cz++) for (let cx = 0; cx < W / CHUNK; cx++) this.dirty.add(`${cx},${cz}`);
    return this;
  }
  tree(x, y, z, trunk) {
    for (let i = 0; i < trunk; i++) this.blocks[this.idx(x, y + i, z)] = B.LOG;
    const top = y + trunk;
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy === 1 ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && dy !== 0 && r === 2) continue;
        const xx = x + dx, yy = top + dy, zz = z + dz;
        if (this.inBounds(xx, yy, zz) && this.get(xx, yy, zz) === B.AIR) this.blocks[this.idx(xx, yy, zz)] = B.LEAVES;
      }
    }
    if (top + 2 < H) this.blocks[this.idx(x, top + 2, z)] = B.LEAVES;
  }

  // ----- villagers -----
  makeVillagers(n, rng = makeRng(this.seed ^ 0x5bd1e995)) {
    const out = [];
    for (let i = 0; i < n; i++) {
      let x, z, tries = 0;
      do { x = 8 + Math.floor(rng() * (W - 16)); z = 8 + Math.floor(rng() * (D - 16)); tries++; }
      while (tries < 50 && (this.surfaceAt(x, z) <= SEA || this.get(x, this.surfaceAt(x, z) + 1, z) !== B.AIR));
      out.push({
        x: x + 0.5, y: this.groundAt(x, z) + 1.01, z: z + 0.5, vx: 0, vy: 0, vz: 0, yaw: rng() * Math.PI * 2,
        name: VILLAGER_NAMES[i % VILLAGER_NAMES.length], shirt: SHIRTS[i % SHIRTS.length],
        w: 0.6, h: 1.8, onGround: false, timer: 2 + rng() * 3, moving: true, heading: rng() * Math.PI * 2, phase: 0,
      });
    }
    return out;
  }

  // ----- editing -----
  canDig(x, y, z) {
    if (!this.inBounds(x, y, z)) return false;
    const id = this.get(x, y, z);
    return id !== B.AIR && id !== B.WATER && id !== B.BEDROCK;
  }
  // Returns the items a chest held (so the caller can hand them to the player), or null.
  dig(x, y, z) {
    if (!this.canDig(x, y, z)) return null;
    let id = this.get(x, y, z);
    let spilled = [];
    if (id === B.DOOR_TOP) { y -= 1; id = B.DOOR; }
    if (id === B.BED_FOOT) {
      const m = this.meta.get(key(x, y, z));
      if (m && m.head) { [x, y, z] = m.head; id = B.BED; }
    }
    const other = this.otherHalf(x, y, z, id);
    if (other) { this.meta.delete(key(...other)); this.set(other[0], other[1], other[2], B.AIR); this.queueWater(...other); }
    const m = this.meta.get(key(x, y, z));
    if (m && m.items) spilled = m.items.slice();
    this.meta.delete(key(x, y, z));
    this.set(x, y, z, B.AIR);
    this.queueWater(x, y, z);
    return spilled;
  }
  // The second cell of a two-cell prop (door top, bed foot), or null.
  otherHalf(x, y, z, id) {
    if (id === B.DOOR) return [x, y + 1, z];
    if (id === B.BED) { const m = this.meta.get(key(x, y, z)); const [fx, fz] = facingDir(m ? m.facing : 0); return [x + fx, y, z + fz]; }
    return null;
  }
  // opts: { facing (0-3), code, yaw, pitch }. Returns '' on success or an error message.
  place(x, y, z, id, opts = {}) {
    if (!this.inBounds(x, y, z)) return 'Out of the world';
    const info = BLOCKS[id];
    if (!info || !info.placeable) return 'Cannot place that';
    const here = this.get(x, y, z);
    if (here !== B.AIR && here !== B.WATER) return 'Something is already there';
    if (id === B.DOOR) {
      const above = this.get(x, y + 1, z);
      if (!(above === B.AIR || above === B.WATER) || y + 1 >= H) return 'Doors need two blocks of room';
      this.set(x, y, z, B.DOOR); this.set(x, y + 1, z, B.DOOR_TOP);
      this.meta.set(key(x, y, z), { facing: opts.facing | 0, open: false });
      return '';
    }
    if (id === B.BED) {
      const [fx, fz] = facingDir(opts.facing | 0);
      const foot = this.get(x + fx, y, z + fz);
      if (!this.inBounds(x + fx, y, z + fz) || !(foot === B.AIR || foot === B.WATER)) return 'Beds need two blocks of room';
      this.set(x, y, z, B.BED); this.set(x + fx, y, z + fz, B.BED_FOOT);
      this.meta.set(key(x, y, z), { facing: opts.facing | 0 });
      this.meta.set(key(x + fx, y, z + fz), { head: [x, y, z] });
      return '';
    }
    if (id === B.TRAPDOOR) {
      if (!/^\d{4}$/.test(opts.code || '')) return 'Trapdoors need a 4-digit code';
      this.meta.set(key(x, y, z), { code: opts.code, open: false, facing: opts.facing | 0 });
    } else if (id === B.CHEST) {
      this.meta.set(key(x, y, z), { items: [], facing: opts.facing | 0 });
    } else if (id === B.COMPUTER) {
      this.meta.set(key(x, y, z), { facing: opts.facing | 0 });
    } else if (id === B.CAMERA) {
      this.meta.set(key(x, y, z), { yaw: opts.yaw || 0, pitch: opts.pitch || 0, n: this.nextCameraNumber() });
    } else if (info.special) {
      this.meta.set(key(x, y, z), { facing: opts.facing | 0 });
    }
    this.set(x, y, z, id);
    return '';
  }
  nextCameraNumber() {
    let n = 0;
    for (const m of this.meta.values()) if (m.n) n = Math.max(n, m.n);
    return n + 1;
  }
  cameras() {
    const out = [];
    for (const [k, m] of this.meta) {
      const [x, y, z] = k.split(',').map(Number);
      if (this.get(x, y, z) === B.CAMERA) out.push({ x, y, z, ...m });
    }
    return out.sort((a, b) => a.n - b.n);
  }
  lights() {
    const out = [];
    for (const k of this.meta.keys()) {
      const [x, y, z] = k.split(',').map(Number);
      if (BLOCKS[this.get(x, y, z)].light) out.push([x, y, z]);
    }
    return out;
  }
  toggleDoor(x, y, z) {
    let id = this.get(x, y, z);
    if (id === B.DOOR_TOP) { y -= 1; id = this.get(x, y, z); }
    if (id !== B.DOOR) return false;
    const m = this.meta.get(key(x, y, z));
    m.open = !m.open;
    this.markDirty(x, z);
    this.queueWater(x, y, z); this.queueWater(x, y + 1, z);
    return m.open;
  }
  // Passcode trapdoor: the right code toggles it; closing never needs a code.
  // Returns { ok, open }.
  tryTrapdoor(x, y, z, code) {
    if (this.get(x, y, z) !== B.TRAPDOOR) return { ok: false, open: false };
    const m = this.meta.get(key(x, y, z));
    if (m.open) { m.open = false; this.markDirty(x, z); return { ok: true, open: false }; }
    if (code !== m.code) return { ok: false, open: false };
    m.open = true; this.markDirty(x, z); this.queueWater(x, y, z);
    return { ok: true, open: true };
  }

  // ----- water -----
  // Water is allowed in a cell when it is at or under the lake level, or at
  // least SPRING_DEPTH under the original ground (that is where digging finds it).
  waterAllowed(x, y, z) {
    return y <= SEA || y <= this.surfaceAt(x, z) - SPRING_DEPTH;
  }
  isSpring(x, y, z) { return y <= this.surfaceAt(x, z) - SPRING_DEPTH; }
  queueWater(x, y, z) {
    this.waterQueue.push([x, y, z], [x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1], [x, y + 1, z], [x, y - 1, z]);
  }
  // Fills a cell with water if a spring or neighbouring water reaches it.
  // Flow: down freely; sideways only from water that is resting on something.
  fillCheck(x, y, z) {
    if (!this.inBounds(x, y, z) || this.get(x, y, z) !== B.AIR) return false;
    let fill = this.isSpring(x, y, z);
    if (!fill && this.waterAllowed(x, y, z)) {
      if (this.isWater(x, y + 1, z)) fill = true;
      else {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (this.isWater(x + dx, y, z + dz)) {
            const under = this.get(x + dx, y - 1, z + dz);
            if (under !== B.AIR) { fill = true; break; }
          }
        }
      }
    }
    if (!fill) return false;
    this.set(x, y, z, B.WATER);
    this.queueWater(x, y, z);
    return true;
  }
  tickWater(limit = 400) {
    let n = 0, filled = 0;
    while (this.waterQueue.length && n < limit) {
      const [x, y, z] = this.waterQueue.shift();
      if (this.fillCheck(x, y, z)) filled++;
      n++;
    }
    return filled;
  }

  // ----- chests -----
  chestItems(x, y, z) { const m = this.meta.get(key(x, y, z)); return m && m.items ? m.items : null; }
}

// Move item i from one list to another, respecting the capacity. Returns true if moved.
export function moveItem(from, i, to, cap) {
  if (i < 0 || i >= from.length || to.length >= cap) return false;
  to.push(from.splice(i, 1)[0]);
  return true;
}

// ---------- raycast (Amanatides & Woo voxel traversal) ----------
export function raycast(world, ox, oy, oz, dx, dy, dz, maxDist = 6, hits = (id) => id !== B.AIR && id !== B.WATER) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDX = Math.abs(1 / (dx || 1e-9)), tDY = Math.abs(1 / (dy || 1e-9)), tDZ = Math.abs(1 / (dz || 1e-9));
  let tX = (dx > 0 ? x + 1 - ox : ox - x) * tDX, tY = (dy > 0 ? y + 1 - oy : oy - y) * tDY, tZ = (dz > 0 ? z + 1 - oz : oz - z) * tDZ;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 200; i++) {
    if (world.inBounds(x, y, z) || y >= H) {
      const id = world.get(x, y, z);
      if (hits(id) && i > 0) return { x, y, z, id, nx, ny, nz, dist: t };
      if (hits(id) && i === 0) return { x, y, z, id, nx: 0, ny: 1, nz: 0, dist: 0 };
    }
    if (tX < tY && tX < tZ) { x += stepX; t = tX; tX += tDX; nx = -stepX; ny = 0; nz = 0; }
    else if (tY < tZ) { y += stepY; t = tY; tY += tDY; nx = 0; ny = -stepY; nz = 0; }
    else { z += stepZ; t = tZ; tZ += tDZ; nx = 0; ny = 0; nz = -stepZ; }
    if (t > maxDist) return null;
    if (y < 0 || y >= H + 2) return null;
  }
  return null;
}

// Ray vs axis-aligned box. Returns distance or null.
export function rayBox(ox, oy, oz, dx, dy, dz, minx, miny, minz, maxx, maxy, maxz) {
  let tmin = -Infinity, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [minx, miny, minz], mx = [maxx, maxy, maxz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return null; continue; }
    let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmax < 0 ? null : Math.max(tmin, 0);
}

// ---------- physics ----------
export const GRAVITY = 28, JUMP = 9, SWIM = 4.5, FLY_SPEED = 7, FLY_HOLD = 0.3, BOUNCE = 16;

function boxSolid(world, x, y, z, w, h) {
  const x0 = Math.floor(x - w / 2), x1 = Math.floor(x + w / 2 - 1e-6);
  const z0 = Math.floor(z - w / 2), z1 = Math.floor(z + w / 2 - 1e-6);
  const y0 = Math.floor(y), y1 = Math.floor(y + h - 1e-6);
  for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) if (world.isSolid(xx, yy, zz)) return true;
  return false;
}
export function entityBlocked(world, e, x, y, z) { return boxSolid(world, x, y, z, e.w, e.h); }

function moveAxis(world, e, axis, delta) {
  if (delta === 0) return false;
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.25));
  const d = delta / steps;
  for (let s = 0; s < steps; s++) {
    const nx = e.x + (axis === 'x' ? d : 0), ny = e.y + (axis === 'y' ? d : 0), nz = e.z + (axis === 'z' ? d : 0);
    if (boxSolid(world, nx, ny, nz, e.w, e.h)) {
      // snap to the face we hit
      if (axis === 'x') e.x = d > 0 ? Math.floor(nx + e.w / 2) - e.w / 2 - 1e-4 : Math.ceil(nx - e.w / 2) + e.w / 2 + 1e-4;
      if (axis === 'y') e.y = d > 0 ? Math.floor(ny + e.h) - e.h - 1e-4 : Math.ceil(ny) + 1e-4;
      if (axis === 'z') e.z = d > 0 ? Math.floor(nz + e.w / 2) - e.w / 2 - 1e-4 : Math.ceil(nz - e.w / 2) + e.w / 2 + 1e-4;
      return true;
    }
    e.x = nx; e.y = ny; e.z = nz;
  }
  return false;
}

export function inWater(world, e) { return world.isWater(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z)); }
export function headInWater(world, e) { return world.isWater(Math.floor(e.x), Math.floor(e.y + e.h - 0.2), Math.floor(e.z)); }

// ctrl: { mx (strafe, -1..1), mz (forward, -1..1), yaw, jump, speed }
export function stepEntity(world, e, ctrl, dt) {
  dt = Math.min(dt, 0.05);
  const water = inWater(world, e);
  const speed = (ctrl.speed || 4.3) * (water ? 0.55 : 1);
  const fx = -Math.sin(ctrl.yaw), fz = -Math.cos(ctrl.yaw), rx = Math.cos(ctrl.yaw), rz = -Math.sin(ctrl.yaw);
  let mx = ctrl.mx || 0, mz = ctrl.mz || 0;
  const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
  const tx = (fx * mz + rx * mx) * speed, tz = (fz * mz + rz * mx) * speed;
  // holding jump for a moment switches to flying straight up (steer with the pad)
  e.holdT = ctrl.jump ? (e.holdT || 0) + dt : 0;
  const flying = !water && ctrl.jump && e.holdT > FLY_HOLD;
  const k = Math.min(1, dt * (e.onGround || water || flying ? 12 : 4));
  e.vx += (tx - e.vx) * k; e.vz += (tz - e.vz) * k;

  if (water) {
    e.vy += (-1.5 - e.vy) * Math.min(1, dt * 3);
    if (ctrl.jump) e.vy = SWIM;
  } else if (flying) {
    e.vy = Math.min(FLY_SPEED, Math.max(e.vy, 0) + GRAVITY * dt);
  } else {
    e.vy -= GRAVITY * dt;
    if (ctrl.jump && e.onGround) e.vy = JUMP;
  }
  if (e.vy < -40) e.vy = -40;

  const wantMove = len > 0.1;
  const hitX = moveAxis(world, e, 'x', e.vx * dt);
  const hitZ = moveAxis(world, e, 'z', e.vz * dt);
  const hitY = moveAxis(world, e, 'y', e.vy * dt);
  const wasGround = e.onGround;
  e.onGround = hitY && e.vy < 0;
  let bounced = false;
  if (hitY && e.vy < 0 && !ctrl.noBounce) {
    const under = world.get(Math.floor(e.x), Math.floor(e.y - 0.05), Math.floor(e.z));
    if (BLOCKS[under].bouncy) { e.vy = BOUNCE; e.onGround = false; bounced = true; }
  }
  if (hitY && !bounced) e.vy = 0;
  if (e.y + e.h > H + 4) { e.y = H + 4 - e.h; e.vy = Math.min(e.vy, 0); }   // the sky has a ceiling
  // auto-jump: walked into a one-block step
  if ((hitX || hitZ) && wantMove && (wasGround || e.onGround || water)) {
    const aheadX = e.x + Math.sign(tx) * (e.w / 2 + 0.05), aheadZ = e.z + Math.sign(tz) * (e.w / 2 + 0.05);
    const px = hitX ? aheadX : e.x, pz = hitZ ? aheadZ : e.z;
    if (!boxSolid(world, px, e.y + 1.05, pz, e.w, e.h) && !boxSolid(world, e.x, e.y + 1.05, e.z, e.w, e.h)) {
      e.vy = water ? SWIM : JUMP; e.onGround = false;
    }
  }
  if (hitX) e.vx = 0; if (hitZ) e.vz = 0;
  if (e.y < 1) { e.y = 1; e.vy = 0; e.onGround = true; }
  return { water, head: headInWater(world, e), flying, bounced };
}

export function nearestVillager(villagers, x, z, exclude = -1) {
  let best = -1, bestD = Infinity;
  villagers.forEach((v, i) => { if (i === exclude) return; const d = Math.hypot(v.x - x, v.z - z); if (d < bestD) { bestD = d; best = i; } });
  return { index: best, dist: bestD };
}
// Ask the nearest villager to walk over to (x, z). Returns its index or -1.
export function callVillager(villagers, x, z, exclude = -1) {
  const { index } = nearestVillager(villagers, x, z, exclude);
  if (index >= 0) { const v = villagers[index]; v.call = { x, z, t: 0, stuck: 0, detour: 0 }; v.arrived = false; }
  return index;
}
export const CALL_RADIUS = 2.2, CALL_TIMEOUT = 45;

// Villager AI. ride = { mx, mz, yaw, jump } when a player is steering, else null.
export function updateVillager(world, v, dt, rng, ride = null) {
  let ctrl;
  if (ride) {
    v.call = null;
    ctrl = { mx: ride.mx, mz: ride.mz, yaw: ride.yaw, jump: ride.jump, speed: 5.5 };
    if (Math.hypot(ride.mx, ride.mz) > 0.1) {
      const fx = -Math.sin(ride.yaw), fz = -Math.cos(ride.yaw), rx = Math.cos(ride.yaw), rz = -Math.sin(ride.yaw);
      v.yaw = Math.atan2(-(fx * ride.mz + rx * ride.mx), -(fz * ride.mz + rz * ride.mx));
    }
  } else if (v.call) {
    // walking to whoever called: head straight there, sidestep for a moment when stuck
    const c = v.call; c.t += dt;
    const dx = c.x - v.x, dz = c.z - v.z, dist = Math.hypot(dx, dz);
    if (dist < CALL_RADIUS) { v.call = null; v.arrived = true; v.moving = false; v.timer = 2; }
    else if (c.t > CALL_TIMEOUT) { v.call = null; v.timer = 0; }
    else {
      if (c.detour > 0) c.detour -= dt;
      else v.yaw = Math.atan2(-dx, -dz);
      v.moving = true;
    }
    ctrl = { mx: 0, mz: v.call ? 1 : 0, yaw: v.yaw, jump: false, speed: 4 };
    if (inWater(world, v)) ctrl.jump = true;
  } else {
    v.timer -= dt;
    if (v.timer <= 0) {
      if (rng() < 0.35) { v.moving = false; v.timer = 1 + rng() * 2.5; }
      else { v.moving = true; v.heading = rng() * Math.PI * 2; v.timer = 2 + rng() * 4; }
    }
    // stay away from the edges and out of deep water
    if (v.x < 6 || v.x > W - 6 || v.z < 6 || v.z > D - 6) { v.heading = Math.atan2(-(W / 2 - v.x), -(D / 2 - v.z)); v.moving = true; }
    if (v.moving) v.yaw = v.heading;
    ctrl = { mx: 0, mz: v.moving ? 1 : 0, yaw: v.yaw, jump: false, speed: 2.2 };
    if (inWater(world, v)) ctrl.jump = true;
  }
  const before = { x: v.x, z: v.z };
  const r = stepEntity(world, v, ctrl, dt);
  const moved = Math.hypot(v.x - before.x, v.z - before.z);
  const slow = moved < 0.002 * (dt / 0.016);
  if (!ride && v.call && v.moving) {
    v.call.stuck = slow ? v.call.stuck + dt : 0;
    if (v.call.stuck > 0.6) { v.call.stuck = 0; v.call.detour = 0.8; v.yaw += (rng() < 0.5 ? 1 : -1) * Math.PI / 2; }
  } else if (!ride && v.moving && slow) { v.heading += Math.PI / 2 + rng() * Math.PI; v.timer = 1 + rng() * 2; }
  v.phase += moved * 6;
  v.walking = moved > 0.001;
  return r;
}

// Top-down view for a mini-map: for each column in the window, the block you
// would see from above (ignoring special props) and its height.
export function topView(world, cx, cz, r) {
  const size = 2 * r + 1, ids = new Uint8Array(size * size), hs = new Uint8Array(size * size);
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = cx + dx, z = cz + dz, i = (dz + r) * size + (dx + r);
    if (x < 0 || x >= W || z < 0 || z >= D) continue;
    for (let y = H - 1; y >= 0; y--) {
      const id = world.get(x, y, z);
      if (id !== B.AIR && !BLOCKS[id].special) { ids[i] = id; hs[i] = y; break; }
    }
  }
  return { size, ids, hs };
}

// ---------- save / load ----------
export function rle(arr) {
  const out = [];
  let run = 1, val = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === val) run++;
    else { out.push(run, val); run = 1; val = arr[i]; }
  }
  if (arr.length) out.push(run, val);
  return out;
}
export function unrle(runs, len) {
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < runs.length; i += 2) { out.fill(runs[i + 1], p, p + runs[i]); p += runs[i]; }
  return out;
}
export function serialize(world, state = {}) {
  return {
    v: 1, seed: world.seed, w: W, h: H, d: D,
    blocks: rle(world.blocks), surface: rle(world.surface),
    meta: [...world.meta.entries()],
    ...state,
  };
}
export function deserialize(data) {
  if (!data || data.v !== 1 || data.h !== H) throw new Error('Unknown save format');
  const { v, seed, w, h, d, blocks, surface, meta, ...state } = data;
  if (w === W && d === D) {
    const world = new World(seed);
    world.blocks = unrle(blocks, W * H * D);
    world.surface = unrle(surface, W * D);
    world.meta = new Map(meta);
    for (let cz = 0; cz < D / CHUNK; cz++) for (let cx = 0; cx < W / CHUNK; cx++) world.dirty.add(`${cx},${cz}`);
    return { world, state };
  }
  if (w === LEGACY_W && d === LEGACY_W) return migrateLegacy(data, state);
  throw new Error('Unknown save format');
}
// A 128-wide world is dropped into the middle of a freshly generated 256-wide
// one with the same seed; the terrain noise lines up, so the join is seamless.
export function migrateLegacy(data, state) {
  const OFF = (W - LEGACY_W) / 2, LW = LEGACY_W;
  const world = new World(data.seed).generate();
  const old = unrle(data.blocks, LW * H * LW), oldSurf = unrle(data.surface, LW * LW);
  for (let y = 0; y < H; y++) for (let z = 0; z < LW; z++) for (let x = 0; x < LW; x++) world.blocks[world.idx(x + OFF, y, z + OFF)] = old[x + LW * (z + LW * y)];
  for (let z = 0; z < LW; z++) for (let x = 0; x < LW; x++) world.surface[x + OFF + W * (z + OFF)] = oldSurf[x + LW * z];
  world.meta = new Map();
  for (const [k, m] of data.meta) {
    const [x, y, z] = k.split(',').map(Number);
    if (m.head) m.head = [m.head[0] + OFF, m.head[1], m.head[2] + OFF];
    world.meta.set(key(x + OFF, y, z + OFF), m);
  }
  // anything the new generation put inside the old area is gone, so drop stale meta there
  for (const [k] of [...world.meta]) { const [x, y, z] = k.split(',').map(Number); if (!BLOCKS[world.get(x, y, z)].special) world.meta.delete(k); }
  if (state.player) { state.player.x += OFF; state.player.z += OFF; }
  if (state.villagers) for (const v of state.villagers) { v.x += OFF; v.z += OFF; }
  world.spawn = { x: world.spawn.x, y: world.spawn.y, z: world.spawn.z };
  state.migrated = true;
  return { world, state };
}
