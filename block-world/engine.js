// Block World engine — DOM-free. World data, terrain, water, physics,
// raycasting, villagers, special blocks and save/load.
// Unit tests: node tests/engine.test.mjs

export const W = 128, H = 48, D = 128;   // world size in blocks (x, y, z)
export const SEA = 14;                   // lakes fill up to this level
export const SPRING_DEPTH = 3;           // dig this far under the ground and water appears
export const CHUNK = 16;

export const B = {
  AIR: 0, GRASS: 1, EARTH: 2, STONE: 3, SAND: 4, WOOD: 5, LOG: 6, LEAVES: 7,
  METAL: 8, GLASS: 9, WATER: 10, DOOR: 11, DOOR_TOP: 12, TRAPDOOR: 13,
  CHEST: 14, COMPUTER: 15, CAMERA: 16, BEDROCK: 17, BRICK: 18,
};

// solid: blocks movement (doors/trapdoors only when closed). opaque: hides
// neighbouring faces. special: rendered as a prop, not part of the chunk mesh.
export const BLOCKS = [
  { id: 0, name: 'Air', solid: false, opaque: false },
  { id: 1, name: 'Grass', solid: true, opaque: true, placeable: true },
  { id: 2, name: 'Earth', solid: true, opaque: true, placeable: true },
  { id: 3, name: 'Stone', solid: true, opaque: true, placeable: true },
  { id: 4, name: 'Sand', solid: true, opaque: true, placeable: true },
  { id: 5, name: 'Wood', solid: true, opaque: true, placeable: true },
  { id: 6, name: 'Log', solid: true, opaque: true, placeable: true },
  { id: 7, name: 'Leaves', solid: true, opaque: true, placeable: true },
  { id: 8, name: 'Metal', solid: true, opaque: true, placeable: true },
  { id: 9, name: 'Glass', solid: true, opaque: false, placeable: true },
  { id: 10, name: 'Water', solid: false, opaque: false },
  { id: 11, name: 'Door', solid: true, opaque: false, special: true, placeable: true },
  { id: 12, name: 'Door (top)', solid: true, opaque: false, special: true },
  { id: 13, name: 'Passcode trapdoor', solid: true, opaque: false, special: true, placeable: true },
  { id: 14, name: 'Chest', solid: true, opaque: false, special: true, placeable: true },
  { id: 15, name: 'Computer', solid: true, opaque: false, special: true, placeable: true },
  { id: 16, name: 'Security camera', solid: false, opaque: false, special: true, placeable: true },
  { id: 17, name: 'Bedrock', solid: true, opaque: true },
  { id: 18, name: 'Brick', solid: true, opaque: true, placeable: true },
];

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
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const n = fbm(x / 40, z / 40, s, 4);
      const ridge = fbm(x / 13, z / 13, s + 1000, 2);
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
        else id = beach ? B.SAND : B.GRASS;
        this.blocks[this.idx(x, y, z)] = id;
      }
      for (let y = h + 1; y <= SEA; y++) this.blocks[this.idx(x, y, z)] = B.WATER;
    }
    // trees
    for (let i = 0; i < 220; i++) {
      const x = 3 + Math.floor(rng() * (W - 6)), z = 3 + Math.floor(rng() * (D - 6));
      const h = this.surfaceAt(x, z);
      if (this.get(x, h, z) !== B.GRASS || h + 7 >= H) continue;
      if (fbm(x / 25, z / 25, s + 77, 2) < 0.5) continue;   // forests in patches
      if (Math.hypot(x - W / 2, z - D / 2) < 10) continue;   // keep the spawn clearing open
      let crowded = false;   // trees keep a little space between them
      for (let dx = -2; dx <= 2 && !crowded; dx++) for (let dz = -2; dz <= 2; dz++) if (this.get(x + dx, h + 1, z + dz) === B.LOG) { crowded = true; break; }
      if (crowded) continue;
      this.tree(x, h + 1, z, 4 + Math.floor(rng() * 3));
    }
    // hidden treasure chests underground, each in a little stone pocket
    for (let i = 0; i < 14; i++) {
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
    for (let i = 0; i < 6; i++) {
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
    const id = this.get(x, y, z);
    let spilled = [];
    if (id === B.DOOR_TOP) y -= 1;
    if (id === B.DOOR || id === B.DOOR_TOP) { this.set(x, y + 1, z, B.AIR); }
    const m = this.meta.get(key(x, y, z));
    if (m && m.items) spilled = m.items.slice();
    this.meta.delete(key(x, y, z));
    this.set(x, y, z, B.AIR);
    this.queueWater(x, y, z);
    if (id === B.DOOR || id === B.DOOR_TOP) this.queueWater(x, y + 1, z);
    return spilled;
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
    if (id === B.TRAPDOOR) {
      if (!/^\d{4}$/.test(opts.code || '')) return 'Trapdoors need a 4-digit code';
      this.meta.set(key(x, y, z), { code: opts.code, open: false, facing: opts.facing | 0 });
    } else if (id === B.CHEST) {
      this.meta.set(key(x, y, z), { items: [], facing: opts.facing | 0 });
    } else if (id === B.COMPUTER) {
      this.meta.set(key(x, y, z), { facing: opts.facing | 0 });
    } else if (id === B.CAMERA) {
      this.meta.set(key(x, y, z), { yaw: opts.yaw || 0, pitch: opts.pitch || 0, n: this.nextCameraNumber() });
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
export const GRAVITY = 28, JUMP = 9, SWIM = 4.5;

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
  const k = Math.min(1, dt * (e.onGround || water ? 12 : 4));
  e.vx += (tx - e.vx) * k; e.vz += (tz - e.vz) * k;

  if (water) {
    e.vy += (-1.5 - e.vy) * Math.min(1, dt * 3);
    if (ctrl.jump) e.vy = SWIM;
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
  if (hitY) e.vy = 0;
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
  return { water, head: headInWater(world, e) };
}

// Villager AI. ride = { mx, mz, yaw, jump } when a player is steering, else null.
export function updateVillager(world, v, dt, rng, ride = null) {
  let ctrl;
  if (ride) {
    ctrl = { mx: ride.mx, mz: ride.mz, yaw: ride.yaw, jump: ride.jump, speed: 5.5 };
    if (Math.hypot(ride.mx, ride.mz) > 0.1) {
      const fx = -Math.sin(ride.yaw), fz = -Math.cos(ride.yaw), rx = Math.cos(ride.yaw), rz = -Math.sin(ride.yaw);
      v.yaw = Math.atan2(-(fx * ride.mz + rx * ride.mx), -(fz * ride.mz + rz * ride.mx));
    }
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
  if (!ride && v.moving && moved < 0.002 * (dt / 0.016)) { v.heading += Math.PI / 2 + rng() * Math.PI; v.timer = 1 + rng() * 2; }
  v.phase += moved * 6;
  v.walking = moved > 0.001;
  return r;
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
  if (!data || data.v !== 1 || data.w !== W || data.h !== H || data.d !== D) throw new Error('Unknown save format');
  const world = new World(data.seed);
  world.blocks = unrle(data.blocks, W * H * D);
  world.surface = unrle(data.surface, W * D);
  world.meta = new Map(data.meta);
  for (let cz = 0; cz < D / CHUNK; cz++) for (let cx = 0; cx < W / CHUNK; cx++) world.dirty.add(`${cx},${cz}`);
  const { v, seed, w, h, d, blocks, surface, meta, ...state } = data;
  return { world, state };
}
