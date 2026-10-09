// Engine validation — run with: node tests/engine.test.mjs
import {
  W, H, D, SEA, SPRING_DEPTH, B, BLOCKS, ITEMS, World, raycast, rayBox, stepEntity, updateVillager,
  moveItem, rle, unrle, serialize, deserialize, makeRng, key, CHEST_SLOTS,
} from '../engine.js';

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${msg}`); if (!cond) fails++; };

console.log('— terrain —');
const w = new World(42).generate();
const w2 = new World(42).generate();
ok(w.blocks.every((v, i) => v === w2.blocks[i]), 'generation is deterministic for a seed');
ok(BLOCKS.every((b, i) => b.id === i), 'BLOCKS table ids match their index');
let grass = 0, water = 0, bedrock = 0, chests = 0;
for (let i = 0; i < w.blocks.length; i++) { const v = w.blocks[i]; if (v === B.GRASS) grass++; if (v === B.WATER) water++; if (v === B.BEDROCK) bedrock++; if (v === B.CHEST) chests++; }
ok(grass > 2000, `grass on the surface (${grass} blocks)`);
ok(water > 500, `lakes exist (${water} water blocks)`);
ok(bedrock === W * D, 'bedrock floor is complete');
ok(chests >= 10 && w.meta.size === chests, `treasure chests with meta (${chests})`);
let surfaceOk = true;
for (let z = 0; z < D && surfaceOk; z++) for (let x = 0; x < W; x++) {
  const h = w.surfaceAt(x, z);
  if (!BLOCKS[w.get(x, h, z)].solid) { surfaceOk = false; break; }
}
ok(surfaceOk, 'surface[] points at a solid block in every column');
ok(w.get(-1, 5, 5) === B.BEDROCK && w.get(5, H, 5) === B.AIR, 'outside the world is bedrock sideways and air above');
ok(w.get(Math.floor(w.spawn.x), Math.floor(w.spawn.y), Math.floor(w.spawn.z)) === B.AIR, 'spawn point is in open air');
ok(w.dirty.size === (W / 16) * (D / 16), 'all chunks start dirty');

console.log('— digging finds water —');
{
  const x = Math.floor(w.spawn.x), z = Math.floor(w.spawn.z);
  const h = w.surfaceAt(x, z);
  w.dirty.clear();
  for (let depth = 0; depth < SPRING_DEPTH; depth++) {
    w.dig(x, h - depth, z); w.tickWater(10000);
    ok(w.get(x, h - depth, z) === B.AIR, `hole at depth ${depth} stays dry`);
  }
  w.dig(x, h - SPRING_DEPTH, z); w.tickWater(10000);
  ok(w.get(x, h - SPRING_DEPTH, z) === B.WATER, `hole at depth ${SPRING_DEPTH} fills with water`);
  ok(w.get(x, h - SPRING_DEPTH + 1, z) === B.AIR, 'water does not rise above the spring');
  ok(w.dirty.has(`${Math.floor(x / 16)},${Math.floor(z / 16)}`), 'digging marks the chunk dirty');
  // sideways tunnel at spring depth floods, tunnel up to the surface does not
  w.dig(x + 1, h - SPRING_DEPTH, z); w.tickWater(10000);
  ok(w.get(x + 1, h - SPRING_DEPTH, z) === B.WATER, 'water flows sideways along a deep tunnel');
  ok(!w.canDig(x, 0, z), 'bedrock cannot be dug');
  ok(w.dig(x, 0, z) === null, 'dig() on bedrock returns null');
}
{
  // water never floods above ground: an air pocket at the surface next to a lake stays dry
  let dryOk = true;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const h = w.surfaceAt(x, z);
    if (h > SEA && w.get(x, h + 1, z) === B.WATER) dryOk = false;
  }
  ok(dryOk, 'no water sits above ground on dry land');
}

console.log('— placing and special blocks —');
{
  const x = 10, z = 10, y = w.groundAt(x, z) + 1;
  // make sure the test area is clear
  for (let dy = 0; dy < 3; dy++) { w.set(x, y + dy, z, B.AIR); }
  ok(w.place(x, y, z, B.METAL) === '', 'place metal');
  ok(w.place(x, y, z, B.WOOD) !== '', 'cannot place onto an occupied cell');
  ok(w.place(x, y, z, B.WATER) !== '', 'water is not placeable');
  w.dig(x, y, z);
  ok(w.place(x, y, z, B.DOOR, { facing: 2 }) === '', 'place a door');
  ok(w.get(x, y + 1, z) === B.DOOR_TOP, 'door has a top half');
  ok(w.isSolid(x, y, z) && w.isSolid(x, y + 1, z), 'closed door is solid');
  ok(w.toggleDoor(x, y + 1, z) === true, 'tapping the top half opens the door');
  ok(!w.isSolid(x, y, z) && !w.isSolid(x, y + 1, z), 'open door is walk-through');
  w.dig(x, y + 1, z);
  ok(w.get(x, y, z) === B.AIR && w.get(x, y + 1, z) === B.AIR && !w.meta.has(key(x, y, z)), 'digging either half removes the whole door');
  ok(w.place(x, y, z, B.TRAPDOOR, { code: '12' }) !== '', 'trapdoor needs a 4-digit code');
  ok(w.place(x, y, z, B.TRAPDOOR, { code: '2468' }) === '', 'trapdoor placed with code');
  ok(w.isSolid(x, y, z), 'locked trapdoor is solid');
  ok(w.tryTrapdoor(x, y, z, '0000').ok === false, 'wrong code keeps it shut');
  ok(w.tryTrapdoor(x, y, z, '2468').open === true && !w.isSolid(x, y, z), 'right code opens it');
  ok(w.tryTrapdoor(x, y, z, '').open === false && w.isSolid(x, y, z), 'closing needs no code');
  w.dig(x, y, z);
  ok(w.place(x, y, z, B.CAMERA, { yaw: 1.2, pitch: -0.3 }) === '', 'place camera');
  w.set(x + 1, y, z, B.AIR);
  ok(w.place(x + 1, y, z, B.CAMERA, { yaw: 0, pitch: 0 }) === '', 'place second camera');
  const cams = w.cameras();
  ok(cams.length === 2 && cams[0].n === 1 && cams[1].n === 2 && cams[0].yaw === 1.2, 'cameras are numbered in order');
  w.dig(x, y, z);
  ok(w.cameras().length === 1 && w.cameras()[0].n === 2, 'digging a camera removes it from the list');
  w.dig(x + 1, y, z);
}

console.log('— chests and items —');
{
  const x = 12, z = 12, y = w.groundAt(x, z) + 1;
  w.set(x, y, z, B.AIR);
  ok(w.place(x, y, z, B.CHEST) === '', 'place chest');
  const chest = w.chestItems(x, y, z), pocket = ['gem', 'apple'];
  ok(Array.isArray(chest) && chest.length === 0, 'new chest is empty');
  ok(moveItem(pocket, 0, chest, CHEST_SLOTS) && chest[0] === 'gem' && pocket.length === 1, 'move an item into the chest');
  ok(!moveItem(pocket, 5, chest, CHEST_SLOTS), 'cannot move a missing item');
  for (let i = 0; i < 20; i++) chest.push('coin');
  ok(!moveItem(pocket, 0, chest, CHEST_SLOTS), 'full chest refuses items');
  const spilled = w.dig(x, y, z);
  ok(spilled.length === 21 && w.chestItems(x, y, z) === null, 'digging a chest hands back its items');
  ok(ITEMS.every((it) => it.id && it.emoji), 'every item has an id and emoji');
}

console.log('— raycast —');
{
  const x = 20, z = 20, h = w.groundAt(x, z);
  const hit = raycast(w, x + 0.5, h + 5, z + 0.5, 0, -1, 0, 10);
  ok(hit && hit.x === x && hit.y === h && hit.z === z && hit.ny === 1, 'ray straight down hits the ground with an upward normal');
  ok(raycast(w, x + 0.5, h + 5, z + 0.5, 0, 1, 0, 10) === null, 'ray up into the sky misses');
  w.set(x + 3, h + 2, z, B.METAL);
  const side = raycast(w, x + 0.5, h + 2.5, z + 0.5, 1, 0, 0, 10);
  ok(side && side.x === x + 3 && side.nx === -1 && Math.abs(side.dist - 2.5) < 1e-6, 'sideways ray reports the face hit and distance');
  ok(raycast(w, x + 0.5, h + 2.5, z + 0.5, 1, 0, 0, 2) === null, 'max distance is respected');
  w.set(x + 3, h + 2, z, B.AIR);
  ok(Math.abs(rayBox(0, 0, 0, 1, 0, 0, 2, -1, -1, 3, 1, 1) - 2) < 1e-9, 'rayBox distance');
  ok(rayBox(0, 0, 0, 0, 1, 0, 2, -1, -1, 3, 1, 1) === null, 'rayBox miss');
}

console.log('— physics —');
{
  const x = 30, z = 30;
  // flat platform of stone at y=20, clear above
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    for (let y = 21; y < 30; y++) w.set(x + dx, y, z + dz, B.AIR);
    w.set(x + dx, 20, z + dz, B.STONE);
  }
  const e = { x: x + 0.5, y: 25, z: z + 0.5, vx: 0, vy: 0, vz: 0, w: 0.6, h: 1.8, onGround: false };
  for (let i = 0; i < 120; i++) stepEntity(w, e, { mx: 0, mz: 0, yaw: 0, jump: false }, 1 / 60);
  ok(Math.abs(e.y - 21) < 0.01 && e.onGround, `falls and lands on the platform (y=${e.y.toFixed(3)})`);
  stepEntity(w, e, { mx: 0, mz: 0, yaw: 0, jump: true }, 1 / 60);
  ok(e.vy > 0 && !e.onGround, 'jump launches upwards');
  for (let i = 0; i < 120; i++) stepEntity(w, e, { mx: 0, mz: 0, yaw: 0, jump: false }, 1 / 60);
  ok(Math.abs(e.y - 21) < 0.01, 'lands again after the jump');
  // walk forward (yaw 0 → -z) into a wall two blocks high
  w.set(x, 21, z - 2, B.STONE); w.set(x, 22, z - 2, B.STONE);
  for (let i = 0; i < 90; i++) stepEntity(w, e, { mx: 0, mz: 1, yaw: 0, jump: false }, 1 / 60);
  ok(e.z > z - 2 + 1 + 0.29 && e.z < z - 0.5, `stops at a wall (z=${e.z.toFixed(3)})`);
  // one-block step is auto-jumped
  w.set(x, 22, z - 2, B.AIR); w.set(x, 21, z - 3, B.STONE);
  let stoodOnStep = false;
  for (let i = 0; i < 60; i++) { stepEntity(w, e, { mx: 0, mz: 1, yaw: 0, jump: false }, 1 / 60); if (e.onGround && Math.abs(e.y - 22) < 0.01) stoodOnStep = true; }
  ok(stoodOnStep, `auto-jumps up a single step (y=${e.y.toFixed(2)}, z=${e.z.toFixed(2)})`);
  // swimming: drop into a water column
  for (let y = 21; y < 26; y++) w.set(x + 2, y, z + 2, B.WATER);
  const s = { x: x + 2.5, y: 24, z: z + 2.5, vx: 0, vy: 0, vz: 0, w: 0.6, h: 1.8, onGround: false };
  for (let i = 0; i < 60; i++) stepEntity(w, s, { mx: 0, mz: 0, yaw: 0, jump: false }, 1 / 60);
  ok(s.y > 21.5 && s.vy > -3, `sinks slowly in water (y=${s.y.toFixed(2)}, vy=${s.vy.toFixed(2)})`);
  const before = s.y;
  for (let i = 0; i < 30; i++) stepEntity(w, s, { mx: 0, mz: 0, yaw: 0, jump: true }, 1 / 60);
  ok(s.y > before, 'holding jump swims upwards');
}

console.log('— villagers —');
{
  const rng = makeRng(7);
  const vs = w.makeVillagers(6, rng);
  ok(vs.length === 6 && new Set(vs.map((v) => v.name)).size === 6, 'six villagers with different names');
  ok(vs.every((v) => w.get(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z)) === B.AIR), 'villagers spawn in open air');
  const v = vs[0];
  const start = { x: v.x, z: v.z };
  for (let i = 0; i < 1800; i++) updateVillager(w, v, 1 / 60, rng);
  ok(Math.hypot(v.x - start.x, v.z - start.z) > 0.5, 'villager wanders about on its own');
  ok(v.x > 1 && v.x < W - 1 && v.z > 1 && v.z < D - 1 && v.y > 0, 'villager stays in the world');
  const r = { x: v.x, z: v.z };
  for (let i = 0; i < 60; i++) updateVillager(w, v, 1 / 60, rng, { mx: 0, mz: 1, yaw: 0, jump: false });
  ok(v.z < r.z - 1, `ridden villager goes where it is steered (dz=${(v.z - r.z).toFixed(2)})`);
}

console.log('— save / load —');
{
  const a = new Uint8Array([1, 1, 1, 2, 3, 3, 0, 0, 0, 0]);
  ok(JSON.stringify(rle(a)) === '[3,1,1,2,2,3,4,0]', 'rle');
  ok(unrle(rle(a), a.length).every((v, i) => v === a[i]), 'unrle round-trips');
  const data = serialize(w, { player: { x: 1, y: 2, z: 3 }, pocket: ['gem'] });
  const json = JSON.stringify(data);
  const { world: back, state } = deserialize(JSON.parse(json));
  ok(back.blocks.every((v, i) => v === w.blocks[i]), 'blocks survive a save/load');
  ok(back.surface.every((v, i) => v === w.surface[i]), 'surface heights survive');
  ok(back.meta.size === w.meta.size, 'meta survives');
  ok(state.player.z === 3 && state.pocket[0] === 'gem', 'extra state survives');
  ok(json.length < 400000, `save is a sensible size (${(json.length / 1024).toFixed(0)} KB)`);
  let threw = false; try { deserialize({ v: 0 }); } catch { threw = true; }
  ok(threw, 'unknown save format is rejected');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
