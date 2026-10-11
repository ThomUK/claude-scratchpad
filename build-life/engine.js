// Build Life — game engine. Pure JS, no DOM. Unit-tested with `node tests/engine.test.mjs`.

// ───────────────────────── time ─────────────────────────
export const HOURS = { START: 7, SCHOOL_OPEN: 8, SCHOOL_CLOSE: 15, SHOPS_CLOSE: 18, NIGHT: 19, LATEST: 22 };
export const LESSONS_PER_DAY = 3;
export const START_COINS = 420;
export const BABY_GROWS_AT = 5;      // days old when a baby becomes a child
export const CHILD_SCHOOL_AGE = 7;   // days old when a child can go to school
export const BURGLAR_GRACE_DAYS = 2; // the very first night is safe
export const BURGLAR_CHANCE = 1;     // a burglar every single night
export const BANK_RATE = 0.05;        // interest per night on coins in the bank
export const BANK_MAX_INTEREST = 25;  // cap per night
export const POCKET_THEFT = [10, 25]; // % of coins at home a burglar can pinch
export const BUS_FARE = 2;            // coins per trip into town (the school bus is free)
export const BILL_GADGET = 0;         // gadgets and traps cost nothing to run (players' choice)
export const BILL_MOUTH = 3;          // nightly food per pet or family member
export const TRAVEL = { furniture: 1, gadget: 1, garden: 1, pets: 1, hospital: 1, estate: 1, bank: 1, neighbours: 0.5, school: 0, alley: 0.5 };
export const GALLERY_MAX = 40;        // clips the criminal gallery can hold
export const TRAP_REWARD = 40;       // police reward for a burglar caught in a trap
export const SECOND_BURGLAR_CHANCE = { flat: 0.15, terrace: 0.3, detached: 0.5, castle: 0.7 }; // posh houses attract more

// ───────────────────────── houses ─────────────────────────
// Each floor is listed top to bottom. Room width `w` is in units; floor slots = 2 per unit, wall slots = 1 per unit.
export const HOUSES = [
  { id: 'flat', name: 'Small Flat', price: 300, garden: 2, gardenName: 'Balcony', blurb: 'Cosy and cheap. One bedroom, a kitchen, a living room and a little balcony.',
    floors: [[['living', 2], ['kitchen', 1], ['bedroom', 1], ['bathroom', 1]]] },
  { id: 'terrace', name: 'Terraced House', price: 1200, garden: 4, gardenName: 'Garden', blurb: 'Two bedrooms upstairs, a kitchen and living room downstairs, and a small back garden.',
    floors: [[['bedroom', 2], ['bedroom', 1], ['bathroom', 1]], [['living', 2], ['kitchen', 2]]] },
  { id: 'detached', name: 'Big Detached House', price: 4000, garden: 6, gardenName: 'Big Garden', blurb: 'Four bedrooms, a dining room, a garage and a big garden with room for a trampoline.',
    floors: [[['bedroom', 2], ['bedroom', 1], ['bedroom', 1], ['bedroom', 1], ['bathroom', 1]], [['living', 2], ['dining', 1], ['kitchen', 2], ['garage', 1]]] },
  { id: 'castle', name: 'Castle', price: 12000, garden: 8, gardenName: 'Castle Grounds', blurb: 'Towers, a great hall, a library, a swimming pool and enormous grounds. Save up for ages!',
    floors: [[['tower', 1], ['bedroom', 2], ['bedroom', 2], ['tower', 1]], [['bedroom', 2], ['library', 1], ['bedroom', 2], ['bathroom', 1]], [['hall', 3], ['kitchen', 2], ['pool', 1]]] },
];
export const ROOM_NAMES = { living: 'Living Room', kitchen: 'Kitchen', bedroom: 'Bedroom', bathroom: 'Bathroom', dining: 'Dining Room', garage: 'Garage', tower: 'Tower Room', library: 'Library', hall: 'Great Hall', pool: 'Pool Room' };

export const WALLPAPERS = [
  { id: 'cream', name: 'Cream', color: '#efe6d4' }, { id: 'sage', name: 'Sage', color: '#c9d3bd' }, { id: 'duckegg', name: 'Duck Egg', color: '#c6dbdc' },
  { id: 'blush', name: 'Blush', color: '#e9cfc7' }, { id: 'navy', name: 'Navy', color: '#3f4b63' }, { id: 'stripe', name: 'Stripes', color: '#e4dccb', pattern: 'stripe' },
  { id: 'stars', name: 'Stars', color: '#4a5a8a', pattern: 'stars' }, { id: 'floral', name: 'Floral', color: '#e6e0cf', pattern: 'floral' },
  { id: 'brick', name: 'Bare Brick', color: '#a8655a', pattern: 'brick' }, { id: 'tiles', name: 'White Tiles', color: '#eef0f1', pattern: 'tiles' },
  { id: 'stone', name: 'Castle Stone', color: '#9a978f', pattern: 'stone' }, { id: 'charcoal', name: 'Charcoal', color: '#4b4b4f' },
];
export const FLOORS = [
  { id: 'oak', name: 'Oak Boards', color: '#b8905f', pattern: 'boards' }, { id: 'walnut', name: 'Walnut', color: '#6e4b32', pattern: 'boards' },
  { id: 'carpet', name: 'Grey Carpet', color: '#8d8f93' }, { id: 'redcarpet', name: 'Red Carpet', color: '#8f3a3a' },
  { id: 'tile', name: 'Stone Tiles', color: '#c9c3b6', pattern: 'tiles' }, { id: 'chequer', name: 'Chequerboard', color: '#dddddd', pattern: 'chequer' },
  { id: 'blue', name: 'Blue Carpet', color: '#5e7aa3' }, { id: 'concrete', name: 'Concrete', color: '#a7a7a3' },
];
export const PAINTS = {
  wall: ['#e8dcc4', '#f1efe9', '#b7866b', '#9fb3c2', '#c4b59a', '#6f7f8a', '#8c6b5a', '#d9c7b8'],
  roof: ['#5a4a42', '#7a3f35', '#4a5660', '#8a8275', '#2f3a44', '#9c5a3c'],
  door: ['#2b3a55', '#8a2e2e', '#2f5a3e', '#1f1f1f', '#d9b24a', '#e9e4da', '#6a3d9a', '#c75b2a'],
};
const DEFAULT_WALLPAPER = { living: 'cream', kitchen: 'tiles', bedroom: 'duckegg', bathroom: 'tiles', dining: 'blush', garage: 'charcoal', tower: 'stone', library: 'navy', hall: 'stone', pool: 'duckegg' };
const DEFAULT_FLOOR = { living: 'oak', kitchen: 'tile', bedroom: 'carpet', bathroom: 'tile', dining: 'walnut', garage: 'concrete', tower: 'walnut', library: 'redcarpet', hall: 'chequer', pool: 'tile' };

// ───────────────────────── catalogue ─────────────────────────
// kind: floor | wall | garden. size: floor slots used. security: points that stop burglars.
export const ITEMS = [
  // furniture — bedroom
  { id: 'bed', name: 'Single Bed', cat: 'furniture', kind: 'floor', price: 60, size: 1, bed: true },
  { id: 'doublebed', name: 'Double Bed', cat: 'furniture', kind: 'floor', price: 140, size: 2, bed: true },
  { id: 'bunkbed', name: 'Bunk Beds', cat: 'furniture', kind: 'floor', price: 120, size: 1, bed: true, beds: 2 },
  { id: 'cot', name: 'Baby Cot', cat: 'furniture', kind: 'floor', price: 50, size: 1, cot: true },
  { id: 'wardrobe', name: 'Wardrobe', cat: 'furniture', kind: 'floor', price: 70, size: 1 },
  { id: 'desk', name: 'Desk & Chair', cat: 'furniture', kind: 'floor', price: 55, size: 1 },
  // furniture — living
  { id: 'sofa', name: 'Sofa', cat: 'furniture', kind: 'floor', price: 110, size: 2 },
  { id: 'armchair', name: 'Armchair', cat: 'furniture', kind: 'floor', price: 55, size: 1 },
  { id: 'coffeetable', name: 'Coffee Table', cat: 'furniture', kind: 'floor', price: 35, size: 1 },
  { id: 'bookcase', name: 'Bookcase', cat: 'furniture', kind: 'floor', price: 65, size: 1 },
  { id: 'lamp', name: 'Floor Lamp', cat: 'furniture', kind: 'floor', price: 30, size: 1, light: true },
  { id: 'plant', name: 'Pot Plant', cat: 'furniture', kind: 'floor', price: 20, size: 1 },
  { id: 'rug', name: 'Persian Rug', cat: 'furniture', kind: 'floor', price: 45, size: 2 },
  { id: 'piano', name: 'Piano', cat: 'furniture', kind: 'floor', price: 260, size: 2 },
  { id: 'fireplace', name: 'Fireplace', cat: 'furniture', kind: 'floor', price: 180, size: 1, light: true },
  // furniture — kitchen / dining
  { id: 'fridge', name: 'Fridge', cat: 'furniture', kind: 'floor', price: 90, size: 1 },
  { id: 'cooker', name: 'Cooker', cat: 'furniture', kind: 'floor', price: 85, size: 1 },
  { id: 'sink', name: 'Kitchen Sink', cat: 'furniture', kind: 'floor', price: 50, size: 1 },
  { id: 'diningtable', name: 'Dining Table', cat: 'furniture', kind: 'floor', price: 120, size: 2 },
  // furniture — bathroom
  { id: 'bath', name: 'Bath', cat: 'furniture', kind: 'floor', price: 130, size: 2 },
  { id: 'toilet', name: 'Toilet', cat: 'furniture', kind: 'floor', price: 45, size: 1 },
  { id: 'basin', name: 'Wash Basin', cat: 'furniture', kind: 'floor', price: 40, size: 1 },
  // furniture — walls
  { id: 'picture', name: 'Landscape Painting', cat: 'furniture', kind: 'wall', price: 25 },
  { id: 'abstract', name: 'Modern Art', cat: 'furniture', kind: 'wall', price: 40 },
  { id: 'mirror', name: 'Mirror', cat: 'furniture', kind: 'wall', price: 30 },
  { id: 'clock', name: 'Wall Clock', cat: 'furniture', kind: 'wall', price: 20 },
  { id: 'shelf', name: 'Shelf', cat: 'furniture', kind: 'wall', price: 25 },
  { id: 'window', name: 'Window & Curtains', cat: 'furniture', kind: 'wall', price: 35 },
  { id: 'chandelier', name: 'Chandelier', cat: 'furniture', kind: 'wall', price: 200, light: true },
  // gadgets
  { id: 'tv', name: 'Big Screen TV', cat: 'gadget', kind: 'wall', price: 150, screen: true },
  { id: 'computer', name: 'Computer', cat: 'gadget', kind: 'floor', price: 120, size: 1, screen: true },
  { id: 'console', name: 'Games Console', cat: 'gadget', kind: 'floor', price: 90, size: 1 },
  { id: 'camera', name: 'Security Camera', cat: 'gadget', kind: 'wall', price: 80, security: 2 },
  { id: 'alarm', name: 'Burglar Alarm', cat: 'gadget', kind: 'wall', price: 120, security: 3 },
  { id: 'doorbell', name: 'Doorbell Camera', cat: 'gadget', kind: 'garden', price: 60, security: 1 },
  { id: 'outcam', name: 'Outdoor Camera', cat: 'gadget', kind: 'garden', price: 100, security: 2 },
  { id: 'robot', name: 'Robot Vacuum', cat: 'gadget', kind: 'floor', price: 70, size: 1 },
  { id: 'speaker', name: 'Smart Speaker', cat: 'gadget', kind: 'wall', price: 40 },
  // burglar traps — catch a burglar who sneaks into THAT room
  { id: 'cagetrap', name: 'Drop Cage Trap', cat: 'gadget', kind: 'wall', price: 90, trap: 'cage' },
  { id: 'nettrap', name: 'Net Trap', cat: 'gadget', kind: 'floor', price: 70, size: 1, trap: 'net' },
  { id: 'banana', name: 'Banana Skin', cat: 'gadget', kind: 'floor', price: 15, size: 1, trap: 'banana' },
  // garden
  { id: 'tree', name: 'Apple Tree', cat: 'garden', kind: 'garden', price: 40 },
  { id: 'flowers', name: 'Flower Bed', cat: 'garden', kind: 'garden', price: 20 },
  { id: 'bench', name: 'Garden Bench', cat: 'garden', kind: 'garden', price: 35 },
  { id: 'pond', name: 'Pond', cat: 'garden', kind: 'garden', price: 60 },
  { id: 'trampoline', name: 'Trampoline', cat: 'garden', kind: 'garden', price: 120 },
  { id: 'swing', name: 'Swing', cat: 'garden', kind: 'garden', price: 70 },
  { id: 'bbq', name: 'Barbecue', cat: 'garden', kind: 'garden', price: 50 },
  { id: 'shed', name: 'Shed', cat: 'garden', kind: 'garden', price: 90 },
  { id: 'car', name: 'Car', cat: 'garden', kind: 'garden', price: 400 },
  { id: 'fountain', name: 'Fountain', cat: 'garden', kind: 'garden', price: 250 },
  { id: 'gnome', name: 'Garden Gnome', cat: 'garden', kind: 'garden', price: 10 },
  { id: 'lantern', name: 'Garden Lantern', cat: 'garden', kind: 'garden', price: 25, light: true },
  // home-made gifts from neighbours — nice to have, worth nothing to sell
  { id: 'jam', name: 'Jar of Home-made Jam', cat: 'gift', kind: 'wall', price: 0, gift: true },
  { id: 'drawing', name: "Child's Drawing", cat: 'gift', kind: 'wall', price: 0, gift: true },
  { id: 'cushion', name: 'Knitted Cushion', cat: 'gift', kind: 'floor', price: 0, size: 1, gift: true },
  { id: 'cake', name: 'Home-made Cake', cat: 'gift', kind: 'floor', price: 0, size: 1, gift: true },
  // pet supplies
  { id: 'petfood', name: 'Bag of Pet Food (5 meals)', cat: 'petshop', kind: 'supply', price: 10, meals: 5 },
];
export const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));

export const PETS = [
  { id: 'dog', name: 'Dog', price: 80, security: 2, trick: 'rolls over and fetches a slipper', sound: 'Woof!' },
  { id: 'cat', name: 'Cat', price: 60, security: 0, trick: 'chases its tail and purrs', sound: 'Miaow!' },
  { id: 'rabbit', name: 'Rabbit', price: 35, security: 0, trick: 'does a big binky jump', sound: '(wiggles nose)' },
  { id: 'hamster', name: 'Hamster', price: 25, security: 0, trick: 'runs super fast on its wheel', sound: 'Squeak!' },
  { id: 'fish', name: 'Goldfish', price: 20, security: 0, trick: 'blows a perfect bubble ring', sound: 'Blub.' },
  { id: 'parrot', name: 'Parrot', price: 70, security: 1, trick: 'says your name backwards', sound: 'Pieces of eight!' },
  { id: 'dragon', name: 'Dragon', price: 500, security: 5, trick: 'toasts marshmallows with one tiny puff', sound: 'ROAR!' },
];
export const PET = Object.fromEntries(PETS.map(p => [p.id, p]));

// ───────────────────────── rng ─────────────────────────
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  const rng = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  rng.int = (a, b) => a + Math.floor(rng() * (b - a + 1));
  rng.pick = arr => arr[Math.floor(rng() * arr.length)];
  rng.shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  return rng;
}

// ───────────────────────── state ─────────────────────────
export function buildHouse(typeId) {
  const t = HOUSES.find(h => h.id === typeId);
  if (!t) throw new Error('unknown house ' + typeId);
  const rooms = [];
  t.floors.forEach((floor, fi) => floor.forEach(([type, w]) => rooms.push({
    type, name: ROOM_NAMES[type], w, floor: fi, wallpaper: DEFAULT_WALLPAPER[type], flooring: DEFAULT_FLOOR[type],
    floorSlots: Array(w * 2).fill(null), wallSlots: Array(w).fill(null),
  })));
  return { type: typeId, paint: { wall: PAINTS.wall[0], roof: PAINTS.roof[0], door: PAINTS.door[0] }, rooms, garden: Array(t.garden).fill(null), boughtDay: 1 };
}
export function houseType(h) { return HOUSES.find(t => t.id === h.type); }
export function houseWidth(h) { return Math.max(...houseType(h).floors.map(f => f.reduce((a, [, w]) => a + w, 0))); }

export function newGame(name, rng = makeRng(7)) {
  const s = {
    name: String(name || 'Player').trim().slice(0, 16) || 'Player', coins: START_COINS, day: 1, hour: HOURS.START,
    house: null, bank: 0, van: {}, pets: [], family: [], caged: [], footage: [], gallery: [], lessonsToday: 0, lessonsYesterday: 1, jobsToday: 0, extraLessonsToday: 0,
    visitedToday: [], log: [], stats: { lessons: 0, correct: 0, coinsEarned: 0, burglarsCaught: 0, housesOwned: 0, interest: 0, stolen: 0, bills: 0, fares: 0 },
    seed: rng.int(1, 1e9),
  };
  return s;
}

function say(s, msg) { s.log.unshift({ day: s.day, msg }); if (s.log.length > 40) s.log.length = 40; return msg; }
export function isNight(s) { return s.hour >= HOURS.NIGHT || s.hour < HOURS.START; }
export function tooLate(s) { return s.hour >= HOURS.LATEST; }
export function advanceTime(s, hours) { s.hour = Math.min(HOURS.LATEST, s.hour + hours); }
export function clockText(s) { const h = Math.floor(s.hour); const m = Math.round((s.hour - h) * 60); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; }

// ───────────────────────── houses: buy / move ─────────────────────────
function placedItems(house) {
  const out = [];
  if (!house) return out;
  house.rooms.forEach((r, ri) => {
    r.floorSlots.forEach((id, si) => { if (id && !id.startsWith('@')) out.push({ id, room: ri, kind: 'floor', slot: si }); });
    r.wallSlots.forEach((id, si) => { if (id) out.push({ id, room: ri, kind: 'wall', slot: si }); });
  });
  house.garden.forEach((id, si) => { if (id) out.push({ id, room: -1, kind: 'garden', slot: si }); });
  return out;
}
export function placedList(house) { return placedItems(house); }
export function decorationValue(house) { return placedItems(house).reduce((a, p) => a + ITEM[p.id].price, 0); }
export function houseSalePrice(house) {
  if (!house) return 0;
  const t = houseType(house);
  const rooms = house.rooms;
  let decorated = 0;
  for (const r of rooms) { const n = r.floorSlots.filter(x => x && !x.startsWith('@')).length + r.wallSlots.filter(Boolean).length; if (n >= 2) decorated++; }
  const gardenDone = house.garden.filter(Boolean).length >= Math.min(2, house.garden.length) ? 1 : 0;
  const bonus = Math.round(t.price * 0.08 * (decorated + gardenDone));
  return t.price + bonus;
}
export function moveHouse(s, typeId) {
  const t = HOUSES.find(h => h.id === typeId);
  if (!t) return { ok: false, msg: 'No such house.' };
  if (s.house && s.house.type === typeId) return { ok: false, msg: 'You already live there!' };
  const sale = houseSalePrice(s.house);
  const cost = t.price - sale;
  if (s.coins < cost) return { ok: false, msg: `You need ${cost - s.coins} more coins for the ${t.name}.` };
  const old = s.house;
  if (old) {
    for (const c of s.caged) { s.coins += TRAP_REWARD; s.stats.burglarsCaught++; }
    s.caged = [];
    for (const p of placedItems(old)) addToVan(s, p.id);
    say(s, `Sold the ${houseType(old).name} for ${sale} coins. Everything went into the van.`);
  }
  s.coins -= cost;
  s.house = buildHouse(typeId);
  s.house.boughtDay = s.day;
  s.stats.housesOwned++;
  advanceTime(s, 1);
  return { ok: true, sale, cost, msg: say(s, `Moved into the ${t.name}!`) };
}

// ───────────────────────── shop / van ─────────────────────────
function addToVan(s, id, n = 1) { s.van[id] = (s.van[id] || 0) + n; }
export function vanCount(s, id) { return s.van[id] || 0; }
export function buyItem(s, id) {
  const it = ITEM[id];
  if (!it) return { ok: false, msg: 'No such item.' };
  if (s.coins < it.price) return { ok: false, msg: `You need ${it.price - s.coins} more coins.` };
  s.coins -= it.price;
  addToVan(s, id);
  return { ok: true, msg: `Bought a ${it.name}.` };
}
export function sellFromVan(s, id) {
  if (!vanCount(s, id)) return { ok: false, msg: 'Not in the van.' };
  if (ITEM[id].gift) return { ok: false, msg: `Nobody would buy a ${ITEM[id].name.toLowerCase()} — it was made with love. Put it in your house instead.` };
  const price = Math.floor(ITEM[id].price / 2);
  s.van[id]--; if (!s.van[id]) delete s.van[id];
  s.coins += price;
  return { ok: true, price, msg: `Sold the ${ITEM[id].name} for ${price} coins.` };
}
export function vanItems(s, kind = null) {
  return Object.entries(s.van).filter(([id, n]) => n > 0 && (!kind || ITEM[id].kind === kind)).map(([id, n]) => ({ id, n, item: ITEM[id] }));
}

export function placeItem(s, roomIdx, kind, slotIdx, id) {
  const it = ITEM[id];
  if (!it || it.kind !== kind) return { ok: false, msg: 'That does not go there.' };
  if (!vanCount(s, id)) return { ok: false, msg: 'That is not in the van.' };
  if (kind === 'garden') {
    if (s.house.garden[slotIdx]) return { ok: false, msg: 'That spot is taken.' };
    s.house.garden[slotIdx] = id;
  } else {
    const room = s.house.rooms[roomIdx];
    const slots = kind === 'floor' ? room.floorSlots : room.wallSlots;
    const size = kind === 'floor' ? (it.size || 1) : 1;
    if (slotIdx + size > slots.length) return { ok: false, msg: 'Not enough room for that here.' };
    for (let i = 0; i < size; i++) if (slots[slotIdx + i]) return { ok: false, msg: 'Not enough room for that here.' };
    slots[slotIdx] = id;
    for (let i = 1; i < size; i++) slots[slotIdx + i] = '@' + slotIdx; // continuation marker
  }
  s.van[id]--; if (!s.van[id]) delete s.van[id];
  return { ok: true };
}
export function removeItem(s, roomIdx, kind, slotIdx) {
  let id;
  if (kind === 'garden') { id = s.house.garden[slotIdx]; if (!id) return { ok: false }; s.house.garden[slotIdx] = null; }
  else {
    const room = s.house.rooms[roomIdx];
    const slots = kind === 'floor' ? room.floorSlots : room.wallSlots;
    let i = slotIdx;
    if (slots[i] && slots[i].startsWith('@')) i = Number(slots[i].slice(1));
    id = slots[i]; if (!id) return { ok: false };
    slots[i] = null;
    for (let k = i + 1; k < slots.length && slots[k] === '@' + i; k++) slots[k] = null;
  }
  addToVan(s, id);
  return { ok: true, id };
}
export function setWallpaper(s, roomIdx, wp) { if (WALLPAPERS.some(w => w.id === wp)) s.house.rooms[roomIdx].wallpaper = wp; }
export function setFlooring(s, roomIdx, fl) { if (FLOORS.some(f => f.id === fl)) s.house.rooms[roomIdx].flooring = fl; }
export function setPaint(s, part, color) { if (PAINTS[part] && PAINTS[part].includes(color)) s.house.paint[part] = color; }
export function countPlaced(house, pred) { return placedItems(house).filter(p => pred(ITEM[p.id])).length; }
export function bedCount(house) { return placedItems(house).reduce((a, p) => a + (ITEM[p.id].bed ? (ITEM[p.id].beds || 1) : 0), 0); }
export function cotCount(house) { return countPlaced(house, i => i.cot); }

// ───────────────────────── travel, bills, police ─────────────────────────
export function travel(s, dest) {
  const hours = TRAVEL[dest];
  if (hours === undefined) return { ok: true, fare: 0 };
  if (dest === 'school' && s.lessonsYesterday >= 1) { advanceTime(s, hours); return { ok: true, fare: 0, free: true }; }
  if (s.coins >= BUS_FARE) { s.coins -= BUS_FARE; s.stats.fares += BUS_FARE; advanceTime(s, hours); return { ok: true, fare: BUS_FARE }; }
  advanceTime(s, hours + 1);
  return { ok: true, fare: 0, walked: true };
}
export function gadgetCount(house) { return countPlaced(house, i => i.cat === 'gadget'); }
export function nightlyBill(s) { return (s.house ? gadgetCount(s.house) * BILL_GADGET : 0) + (s.pets.length + s.family.length) * BILL_MOUTH; }
export function schoolBusFree(s) { return s.lessonsYesterday >= 1; }
// The police always pay rewards in full (players' choice: no school link, no budget).
export function payReward(s, amount) { s.coins += amount; return amount; }
export function rewardNote(s, asked, paid) { return `paid you a ${paid} coin reward`; }

// ───────────────────────── bank ─────────────────────────
export function bankOpen(s) { return s.hour >= HOURS.SCHOOL_OPEN && s.hour < HOURS.SHOPS_CLOSE; }
export function nightlyInterest(bank) { if (bank <= 0) return 0; return Math.max(1, Math.min(BANK_MAX_INTEREST, Math.floor(bank * BANK_RATE))); }
export function deposit(s, amount) {
  amount = Math.floor(Number(amount) || 0);
  if (amount <= 0) return { ok: false, msg: 'Pay in at least 1 coin.' };
  if (amount > s.coins) return { ok: false, msg: `You only have ${s.coins} coins on you.` };
  s.coins -= amount; s.bank += amount;
  return { ok: true, msg: `Paid ${amount} coins into the bank.` };
}
export function withdraw(s, amount) {
  amount = Math.floor(Number(amount) || 0);
  if (amount <= 0) return { ok: false, msg: 'Take out at least 1 coin.' };
  if (amount > s.bank) return { ok: false, msg: `You only have ${s.bank} coins in the bank.` };
  s.bank -= amount; s.coins += amount;
  return { ok: true, msg: `Took ${amount} coins out of the bank.` };
}

// ───────────────────────── security ─────────────────────────
export function securityScore(s) {
  let score = placedItems(s.house).reduce((a, p) => a + (ITEM[p.id].security || 0), 0);
  score += s.pets.reduce((a, p) => a + PET[p.type].security, 0);
  return score;
}
export function securityLabel(score) { return score >= 5 ? 'Fortress' : score >= 3 ? 'Safe' : score >= 1 ? 'A bit risky' : 'Wide open'; }

export function trapInRoom(house, roomIdx) {
  const r = house.rooms[roomIdx];
  const ids = [...r.wallSlots, ...r.floorSlots].filter(id => id && !id.startsWith('@') && ITEM[id].trap);
  const strong = ids.find(id => ITEM[id].trap !== 'banana');
  return strong ? ITEM[strong].trap : ids.length ? 'banana' : null;
}
export function cameraFor(house, roomIdx) {
  const r = house.rooms[roomIdx];
  if (r.wallSlots.includes('camera')) return `${r.name} camera`;
  if (house.garden.includes('outcam')) return 'Outdoor camera';
  if (house.garden.includes('doorbell')) return 'Doorbell camera';
  return null;
}
export function saveClip(s, idx) {
  const clip = s.footage[idx]; if (!clip) return { ok: false };
  if (clip.saved) return { ok: false, msg: 'Already in the gallery.' };
  if (s.gallery.length >= GALLERY_MAX) return { ok: false, msg: 'The gallery is full! Delete an old clip first.' };
  clip.saved = true;
  s.gallery.unshift({ ...clip });
  return { ok: true, msg: 'Saved to the Criminal Gallery.' };
}
export function deleteClip(s, idx) { if (!s.gallery[idx]) return { ok: false }; s.gallery.splice(idx, 1); return { ok: true }; }
export function trapCount(house) { return countPlaced(house, i => i.trap && i.trap !== 'banana'); }
export function callPolice(s, idx) {
  const c = s.caged[idx]; if (!c) return { ok: false };
  s.caged.splice(idx, 1);
  s.stats.burglarsCaught++;
  const paid = payReward(s, TRAP_REWARD);
  return { ok: true, reward: paid, msg: say(s, `The police took the burglar away from the ${s.house.rooms[c.room].name} and ${rewardNote(s, TRAP_REWARD, paid)}.`) };
}

// ───────────────────────── pets ─────────────────────────
export function buyPet(s, type, name) {
  const p = PET[type];
  if (!p) return { ok: false, msg: 'No such pet.' };
  if (!s.house) return { ok: false, msg: 'You need a home first!' };
  if (s.coins < p.price) return { ok: false, msg: `You need ${p.price - s.coins} more coins.` };
  if (s.pets.length >= 8) return { ok: false, msg: 'Your home is full of pets already!' };
  s.coins -= p.price;
  const pet = { type, name: String(name || p.name).trim().slice(0, 14) || p.name, hunger: 0, fun: 2, room: (s.pets.length * 3 + 1) % s.house.rooms.length, tricks: 0 };
  s.pets.push(pet);
  return { ok: true, pet, msg: say(s, `${pet.name} the ${p.name.toLowerCase()} came home with you.`) };
}
export function feedPet(s, idx) {
  const pet = s.pets[idx]; if (!pet) return { ok: false };
  if (pet.hunger === 0) return { ok: false, msg: `${pet.name} is not hungry.` };
  if (!vanCount(s, 'petfood') && !s.meals) return { ok: false, msg: 'No pet food! Buy some at the pet shop.' };
  if (!s.meals) { s.van.petfood--; if (!s.van.petfood) delete s.van.petfood; s.meals = ITEM.petfood.meals; }
  s.meals--;
  pet.hunger = 0;
  return { ok: true, msg: `${pet.name} gobbles it up. ${PET[pet.type].sound}` };
}
export function playWithPet(s, idx, rng = makeRng(s.seed + s.day)) {
  const pet = s.pets[idx]; if (!pet) return { ok: false };
  pet.fun = Math.min(3, pet.fun + 1);
  let coins = 0;
  let trick = false;
  if (pet.fun === 3 && pet.hunger === 0 && (pet.tricksToday || 0) < 2) {
    trick = true; pet.tricks++; pet.tricksToday = (pet.tricksToday || 0) + 1;
    coins = rng.int(1, 4); s.coins += coins; s.stats.coinsEarned += coins;
  }
  const p = PET[pet.type];
  return { ok: true, trick, coins, msg: trick ? `${pet.name} ${p.trick}! You find ${coins} coins down the back of the sofa.` : `${pet.name} loves that. ${p.sound}` };
}
export function petHappy(pet) { return pet.hunger === 0 && pet.fun >= 2; }
export function mealsLeft(s) { return (s.meals || 0) + vanCount(s, 'petfood') * ITEM.petfood.meals; }

// ───────────────────────── family ─────────────────────────
export function canHaveBaby(s) {
  if (!s.house) return { ok: false, msg: 'You need a home first.' };
  const cots = cotCount(s.house);
  const babies = s.family.filter(f => f.stage === 'baby').length;
  if (babies >= cots) return { ok: false, msg: cots ? 'Every cot already has a baby in it. Buy another cot first.' : 'The nurse says you need a cot at home first. Buy one at the furniture shop.' };
  if (s.family.length >= 6) return { ok: false, msg: 'Your family is big enough!' };
  return { ok: true };
}
export function newBaby(s, name) {
  const c = canHaveBaby(s); if (!c.ok) return c;
  const cotRoom = s.house.rooms.findIndex(r => r.floorSlots.some(id => id && ITEM[id]?.cot));
  const person = { name: String(name || 'Baby').trim().slice(0, 14) || 'Baby', stage: 'baby', age: 0, hunger: 0, bornDay: s.day, room: Math.max(0, cotRoom) };
  s.family.push(person);
  advanceTime(s, 2);
  return { ok: true, person, msg: say(s, `Baby ${person.name} came home from the hospital!`) };
}
export function feedPerson(s, idx) {
  const p = s.family[idx]; if (!p) return { ok: false };
  if (p.hunger === 0) return { ok: false, msg: `${p.name} is full up.` };
  p.hunger = 0;
  return { ok: true, msg: p.stage === 'baby' ? `${p.name} drinks a whole bottle and burps.` : `${p.name} eats a big dinner.` };
}
export function personHappy(p) { return p.hunger === 0; }
export function childrenAtSchoolAge(s) { return s.family.filter(f => f.stage === 'child' && f.age >= CHILD_SCHOOL_AGE).length; }

// ───────────────────────── school ─────────────────────────
export const SUBJECTS = [
  { id: 'maths', name: 'Maths', blurb: 'Adding, taking away, times tables and money' },
  { id: 'words', name: 'Words', blurb: 'Spelling, opposites and word building' },
  { id: 'world', name: 'The World', blurb: 'Countries, animals, planets and your body' },
];
export const LEVELS = [
  { id: 'easy', name: 'Easy', coins: 3 }, { id: 'medium', name: 'Medium', coins: 5 }, { id: 'hard', name: 'Hard', coins: 8 },
];
export const QUESTIONS_PER_LESSON = 6;
export const PERFECT_BONUS = 5;

export function lessonsLeft(s) { return LESSONS_PER_DAY + childrenAtSchoolAge(s) - s.lessonsToday; }
export function schoolOpen(s) { return s.hour >= HOURS.SCHOOL_OPEN && s.hour < HOURS.SCHOOL_CLOSE; }
export function canStartLesson(s) {
  if (!schoolOpen(s)) return { ok: false, msg: s.hour < HOURS.SCHOOL_OPEN ? 'School is not open yet.' : 'School has closed for today. Come back tomorrow.' };
  if (lessonsLeft(s) <= 0) return { ok: false, msg: 'You have done all your lessons for today. Well done!' };
  return { ok: true };
}

const CAPITALS = [['France', 'Paris'], ['Spain', 'Madrid'], ['Italy', 'Rome'], ['Germany', 'Berlin'], ['United Kingdom', 'London'], ['Japan', 'Tokyo'], ['China', 'Beijing'], ['India', 'New Delhi'], ['Egypt', 'Cairo'], ['Kenya', 'Nairobi'], ['Australia', 'Canberra'], ['Canada', 'Ottawa'], ['USA', 'Washington DC'], ['Brazil', 'Brasília'], ['Mexico', 'Mexico City'], ['Russia', 'Moscow'], ['Greece', 'Athens'], ['Portugal', 'Lisbon'], ['Ireland', 'Dublin'], ['Norway', 'Oslo'], ['Sweden', 'Stockholm'], ['Turkey', 'Ankara'], ['Argentina', 'Buenos Aires'], ['South Africa', 'Pretoria'], ['Wales', 'Cardiff'], ['Scotland', 'Edinburgh'], ['Netherlands', 'Amsterdam'], ['Poland', 'Warsaw']];
const CONTINENTS = [['France', 'Europe'], ['Kenya', 'Africa'], ['Japan', 'Asia'], ['Brazil', 'South America'], ['Canada', 'North America'], ['Australia', 'Australia'], ['Egypt', 'Africa'], ['India', 'Asia'], ['Italy', 'Europe'], ['Mexico', 'North America'], ['Peru', 'South America'], ['China', 'Asia'], ['Nigeria', 'Africa'], ['Spain', 'Europe']];
const BABY_ANIMALS = [['dog', 'puppy'], ['cat', 'kitten'], ['cow', 'calf'], ['horse', 'foal'], ['sheep', 'lamb'], ['pig', 'piglet'], ['duck', 'duckling'], ['frog', 'tadpole'], ['kangaroo', 'joey'], ['lion', 'cub'], ['goat', 'kid'], ['swan', 'cygnet'], ['hen', 'chick'], ['deer', 'fawn'], ['eagle', 'eaglet'], ['goose', 'gosling']];
const ANIMAL_FACTS = [
  ['Which animal is the tallest in the world?', 'Giraffe', ['Elephant', 'Horse', 'Ostrich']],
  ['Which animal is the biggest in the world?', 'Blue whale', ['Elephant', 'Shark', 'Giraffe']],
  ['Which animal is the fastest runner?', 'Cheetah', ['Lion', 'Horse', 'Greyhound']],
  ['Which of these is a mammal?', 'Dolphin', ['Shark', 'Crocodile', 'Frog']],
  ['Which of these is a reptile?', 'Crocodile', ['Dolphin', 'Penguin', 'Frog']],
  ['Which of these lays eggs?', 'Penguin', ['Dog', 'Cow', 'Dolphin']],
  ['What do caterpillars turn into?', 'Butterflies', ['Beetles', 'Bees', 'Worms']],
  ['How many legs does a spider have?', '8', ['6', '4', '10']],
  ['How many legs does an insect have?', '6', ['8', '4', '10']],
  ['Which animal has a trunk?', 'Elephant', ['Rhino', 'Hippo', 'Camel']],
  ['What do bees make?', 'Honey', ['Milk', 'Silk', 'Jam']],
  ['Which bird cannot fly?', 'Penguin', ['Robin', 'Eagle', 'Parrot']],
  ['What is a group of lions called?', 'A pride', ['A flock', 'A herd', 'A pack']],
  ['What is a group of wolves called?', 'A pack', ['A pride', 'A school', 'A swarm']],
  ['Which animal sleeps all winter?', 'Bear', ['Fox', 'Owl', 'Deer']],
  ['Where do polar bears live?', 'The Arctic', ['Antarctica', 'The desert', 'The jungle']],
];
const PLANETS = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const SCIENCE_FACTS = [
  ['Which planet is closest to the Sun?', 'Mercury', ['Venus', 'Earth', 'Mars']],
  ['Which is the biggest planet?', 'Jupiter', ['Saturn', 'Earth', 'Neptune']],
  ['Which planet has famous rings?', 'Saturn', ['Mars', 'Venus', 'Mercury']],
  ['Which planet is called the Red Planet?', 'Mars', ['Jupiter', 'Venus', 'Earth']],
  ['What do we call the planet we live on?', 'Earth', ['Mars', 'Venus', 'Pluto']],
  ['What goes round the Earth once a month?', 'The Moon', ['The Sun', 'Mars', 'A comet']],
  ['What is the Sun?', 'A star', ['A planet', 'A moon', 'A comet']],
  ['How many planets are in our solar system?', '8', ['7', '9', '10']],
  ['Which organ pumps blood around your body?', 'Heart', ['Lungs', 'Brain', 'Stomach']],
  ['Which organ do you think with?', 'Brain', ['Heart', 'Liver', 'Lungs']],
  ['What do your lungs do?', 'Breathe air', ['Pump blood', 'Digest food', 'Make bones']],
  ['How many bones are in an adult body?', '206', ['100', '500', '52']],
  ['What are your teeth covered in?', 'Enamel', ['Bone', 'Skin', 'Shell']],
  ['Which part of your body helps you hear?', 'Ears', ['Eyes', 'Nose', 'Hands']],
  ['What is the biggest organ of your body?', 'Skin', ['Heart', 'Liver', 'Brain']],
  ['What does your skeleton do?', 'Holds you up', ['Pumps blood', 'Digests food', 'Makes you think']],
  ['What do plants need to grow?', 'Sunlight and water', ['Milk and sugar', 'Sand and salt', 'Wind and ice']],
  ['What is ice made of?', 'Frozen water', ['Frozen milk', 'Glass', 'Salt']],
  ['What do we breathe in to stay alive?', 'Oxygen', ['Helium', 'Carbon', 'Steam']],
  ['What is the hottest thing in our solar system?', 'The Sun', ['Jupiter', 'A volcano', 'Mercury']],
];
const SPELL_WORDS = {
  easy: [['cat', 'a furry pet that purrs'], ['dog', 'a pet that barks'], ['house', 'a building you live in'], ['sun', 'it shines in the day'], ['tree', 'it has leaves and branches'], ['bed', 'you sleep in it'], ['milk', 'a white drink from cows'], ['fish', 'it swims in a tank'], ['ball', 'you can throw or kick it'], ['book', 'you read it'], ['door', 'you open it to go in'], ['chair', 'you sit on it'], ['rain', 'water falling from clouds'], ['frog', 'a green hopping animal'], ['cake', 'a sweet treat with candles'], ['boat', 'it floats on water'], ['hand', 'it has five fingers'], ['shop', 'where you buy things'], ['moon', 'it shines at night'], ['king', 'he wears a crown']],
  medium: [['garden', 'where flowers grow outside your house'], ['window', 'you look out of it'], ['kitchen', 'the room where you cook'], ['school', 'where you learn'], ['dragon', 'a fire-breathing beast'], ['rabbit', 'a pet with long ears'], ['castle', 'a big stone home with towers'], ['money', 'coins and notes'], ['monkey', 'it swings in the trees'], ['picture', 'a painting on the wall'], ['bottle', 'a baby drinks from it'], ['hungry', 'wanting food'], ['yellow', 'the colour of a banana'], ['planet', 'Earth or Mars'], ['parrot', 'a bird that can talk'], ['pillow', 'your head rests on it'], ['winter', 'the coldest season'], ['rocket', 'it flies into space'], ['dinner', 'the evening meal'], ['balloon', 'it floats and pops']],
  hard: [['beautiful', 'very pretty'], ['neighbour', 'the person who lives next door'], ['bicycle', 'it has two wheels and pedals'], ['hospital', 'where a baby is born'], ['furniture', 'sofas, beds and tables'], ['chocolate', 'a sweet brown treat'], ['different', 'not the same'], ['because', 'gives a reason'], ['favourite', 'the one you like best'], ['elephant', 'the animal with a trunk'], ['surprise', 'something you did not expect'], ['scissors', 'they cut paper'], ['tomorrow', 'the day after today'], ['remember', 'not forget'], ['knowledge', 'things you know'], ['February', 'the shortest month'], ['giraffe', 'the tallest animal'], ['necessary', 'needed'], ['television', 'a big screen you watch'], ['sandwich', 'bread with filling']],
};
const OPPOSITES = [['hot', 'cold'], ['big', 'small'], ['up', 'down'], ['fast', 'slow'], ['happy', 'sad'], ['wet', 'dry'], ['open', 'closed'], ['light', 'dark'], ['loud', 'quiet'], ['full', 'empty'], ['old', 'new'], ['tall', 'short'], ['heavy', 'light'], ['clean', 'dirty'], ['early', 'late'], ['soft', 'hard'], ['rich', 'poor'], ['inside', 'outside'], ['push', 'pull'], ['brave', 'scared'], ['ancient', 'modern'], ['generous', 'selfish'], ['cheerful', 'gloomy'], ['enormous', 'tiny']];
const PLURALS = [['mouse', 'mice'], ['child', 'children'], ['foot', 'feet'], ['tooth', 'teeth'], ['goose', 'geese'], ['sheep', 'sheep'], ['man', 'men'], ['leaf', 'leaves'], ['baby', 'babies'], ['box', 'boxes'], ['wolf', 'wolves'], ['person', 'people']];

function misspell(word, rng) {
  const tries = [
    w => { const i = rng.int(0, w.length - 2); return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2); },
    w => { const i = rng.int(1, w.length - 1); return w.slice(0, i) + w[i] + w.slice(i); },
    w => { const vs = [...w].map((c, i) => 'aeiou'.includes(c) ? i : -1).filter(i => i > 0); if (!vs.length) return w; const i = rng.pick(vs); return w.slice(0, i) + rng.pick('aeiou'.replace(w[i], '')) + w.slice(i + 1); },
    w => { const vs = [...w].map((c, i) => 'aeiou'.includes(c) ? i : -1).filter(i => i > 0); if (!vs.length) return w; const i = rng.pick(vs); return w.slice(0, i) + w.slice(i + 1); },
  ];
  for (let k = 0; k < 10; k++) { const m = rng.pick(tries)(word); if (m !== word) return m; }
  return word + word[word.length - 1];
}
function choice(prompt, answer, wrong, rng, extra = {}) {
  const options = rng.shuffle([answer, ...wrong.slice(0, 3)]);
  return { kind: 'choice', prompt, options, answer: options.indexOf(answer), ...extra };
}
function distinct(arr, n, rng, not) { const out = []; for (const x of rng.shuffle(arr)) { if (x !== not && !out.includes(x)) out.push(x); if (out.length === n) break; } return out; }

function mathsQuestion(level, rng) {
  const t = rng();
  if (level === 'easy') {
    if (t < 0.4) { const a = rng.int(1, 10), b = rng.int(1, 10); return numChoice(`${a} + ${b} = ?`, a + b, rng); }
    if (t < 0.7) { const a = rng.int(5, 20), b = rng.int(1, a); return numChoice(`${a} − ${b} = ?`, a - b, rng); }
    if (t < 0.85) { const a = rng.int(2, 5), b = rng.int(1, 5); return numChoice(`${a} × ${b} = ?`, a * b, rng); }
    return orderNumbers(rng.int(1, 20), 4, rng);
  }
  if (level === 'medium') {
    if (t < 0.3) { const a = rng.int(10, 60), b = rng.int(10, 40); return numChoice(`${a} + ${b} = ?`, a + b, rng); }
    if (t < 0.5) { const a = rng.int(30, 100), b = rng.int(5, 29); return numChoice(`${a} − ${b} = ?`, a - b, rng); }
    if (t < 0.8) { const a = rng.int(2, 10), b = rng.int(2, 10); return numChoice(`${a} × ${b} = ?`, a * b, rng); }
    if (t < 0.9) { const b = rng.int(2, 5), q = rng.int(2, 10); return numChoice(`${b * q} ÷ ${b} = ?`, q, rng); }
    return orderNumbers(rng.int(10, 90), 5, rng);
  }
  if (t < 0.3) { const a = rng.int(3, 12), b = rng.int(3, 12); return numChoice(`${a} × ${b} = ?`, a * b, rng); }
  if (t < 0.5) { const b = rng.int(3, 12), q = rng.int(3, 12); return numChoice(`${b * q} ÷ ${b} = ?`, q, rng); }
  if (t < 0.7) { const a = rng.int(100, 900), b = rng.int(50, 400); return numChoice(`${a} + ${b} = ?`, a + b, rng); }
  if (t < 0.85) { const p = rng.int(2, 9) * 10 + rng.int(0, 9); const paid = p <= 50 ? 100 : 200; return numChoice(`A toy costs ${p}p. You pay £${paid / 100}. How much change?`, paid - p, rng, 'p'); }
  const s = rng.int(1, 3) === 1 ? rng.int(3, 9) : rng.int(2, 6); const start = rng.int(1, 9); return orderStep(start, s, rng);
}
function numChoice(prompt, answer, rng, unit = '') {
  const wrong = new Set();
  while (wrong.size < 3) { const d = rng.pick([-10, -3, -2, -1, 1, 2, 3, 10]); const w = answer + d; if (w !== answer && w >= 0) wrong.add(w); }
  return choice(prompt, `${answer}${unit}`, [...wrong].map(w => `${w}${unit}`), rng, { subject: 'maths' });
}
function orderNumbers(lo, n, rng) {
  const nums = new Set(); while (nums.size < n) nums.add(rng.int(lo, lo + 30));
  const sorted = [...nums].sort((a, b) => a - b).map(String);
  return { kind: 'order', prompt: 'Tap the numbers from smallest to biggest', tiles: rng.shuffle(sorted), answer: sorted, subject: 'maths' };
}
function orderStep(start, step, rng) {
  const seq = Array.from({ length: 5 }, (_, i) => String(start + i * step));
  return { kind: 'order', prompt: `Tap the numbers in order, counting up in ${step}s`, tiles: rng.shuffle(seq), answer: seq, subject: 'maths' };
}

function wordsQuestion(level, rng) {
  const t = rng();
  const bank = SPELL_WORDS[level];
  if (t < 0.35) {
    const [w, clue] = rng.pick(bank);
    const wrong = new Set(); let guard = 0; while (wrong.size < 3 && guard++ < 30) { const m = misspell(w, rng); if (m !== w) wrong.add(m); }
    return choice(`Which is the right spelling of the word that means "${clue}"?`, w, [...wrong], rng, { subject: 'words' });
  }
  if (t < 0.6) {
    const [w, clue] = rng.pick(bank);
    return { kind: 'build', prompt: `Spell the word: ${clue}`, tiles: rng.shuffle([...w.toLowerCase()]), answer: w.toLowerCase(), subject: 'words' };
  }
  if (t < 0.8 || level === 'easy') {
    const pool = level === 'easy' ? OPPOSITES.slice(0, 12) : level === 'medium' ? OPPOSITES.slice(0, 20) : OPPOSITES;
    const [a, b] = rng.pick(pool); const flip = rng() < 0.5;
    const q = flip ? b : a, ans = flip ? a : b;
    const wrong = distinct(pool.flat().filter(x => x !== q), 3, rng, ans);
    return choice(`What is the opposite of "${q}"?`, ans, wrong, rng, { subject: 'words' });
  }
  const [one, many] = rng.pick(PLURALS);
  const wrong = distinct([one + 's', one + 'es', one.slice(0, -1) + 'ies', many + 's', one + 'en'], 3, rng, many);
  return choice(`What is the plural of "${one}"? (more than one)`, many, wrong, rng, { subject: 'words' });
}

function worldQuestion(level, rng) {
  const t = rng();
  if (t < 0.3) {
    const pool = level === 'easy' ? CAPITALS.slice(0, 8) : level === 'medium' ? CAPITALS.slice(0, 18) : CAPITALS;
    const [c, cap] = rng.pick(pool);
    return choice(`What is the capital city of ${c}?`, cap, distinct(pool.map(x => x[1]), 3, rng, cap), rng, { subject: 'world' });
  }
  if (t < 0.45 && level !== 'easy') {
    const [c, cont] = rng.pick(CONTINENTS);
    return choice(`Which continent is ${c} in?`, cont, distinct(['Europe', 'Africa', 'Asia', 'South America', 'North America', 'Australia'], 3, rng, cont), rng, { subject: 'world' });
  }
  if (t < 0.6) {
    const [a, b] = rng.pick(BABY_ANIMALS);
    return choice(`What is a baby ${a} called?`, b, distinct(BABY_ANIMALS.map(x => x[1]), 3, rng, b), rng, { subject: 'world' });
  }
  if (t < 0.75) { const [p, a, w] = rng.pick(ANIMAL_FACTS); return choice(p, a, w, rng, { subject: 'world' }); }
  if (t < 0.85 && level !== 'easy') {
    const n = level === 'medium' ? 4 : 6;
    const start = rng.int(0, PLANETS.length - n);
    const seq = PLANETS.slice(start, start + n);
    return { kind: 'order', prompt: 'Tap the planets in order, starting nearest the Sun', tiles: rng.shuffle(seq), answer: seq, subject: 'world' };
  }
  const [p, a, w] = rng.pick(level === 'easy' ? SCIENCE_FACTS.slice(0, 12) : SCIENCE_FACTS); return choice(p, a, w, rng, { subject: 'world' });
}

export function makeQuestion(subject, level, rng) {
  if (subject === 'maths') return mathsQuestion(level, rng);
  if (subject === 'words') return wordsQuestion(level, rng);
  return worldQuestion(level, rng);
}
export function startLesson(s, subject, level, rng = makeRng(s.seed + s.day * 31 + s.lessonsToday * 7)) {
  const c = canStartLesson(s); if (!c.ok) return c;
  if (!SUBJECTS.some(x => x.id === subject) || !LEVELS.some(l => l.id === level)) return { ok: false, msg: 'Pick a subject and a level.' };
  const questions = [];
  const seen = new Set();
  let guard = 0;
  while (questions.length < QUESTIONS_PER_LESSON && guard++ < 60) {
    const q = makeQuestion(subject, level, rng);
    if (seen.has(q.prompt)) continue;
    seen.add(q.prompt); questions.push(q);
  }
  return { ok: true, lesson: { subject, level, questions, index: 0, correct: 0, coins: 0, done: false, results: [] } };
}
export function checkAnswer(q, given) {
  if (q.kind === 'choice') return given === q.answer;
  if (q.kind === 'order') return Array.isArray(given) && given.length === q.answer.length && given.every((x, i) => x === q.answer[i]);
  if (q.kind === 'build') return String(given).toLowerCase() === q.answer;
  return false;
}
export function answerQuestion(lesson, given) {
  if (lesson.done) return { ok: false };
  const q = lesson.questions[lesson.index];
  const correct = checkAnswer(q, given);
  const per = LEVELS.find(l => l.id === lesson.level).coins;
  const coins = correct ? per : 0;
  if (correct) lesson.correct++;
  lesson.coins += coins;
  lesson.results.push(correct);
  lesson.index++;
  if (lesson.index >= lesson.questions.length) {
    lesson.done = true;
    if (lesson.correct === lesson.questions.length) { lesson.perfect = true; lesson.coins += PERFECT_BONUS; }
  }
  return { ok: true, correct, coins, done: lesson.done, correctAnswer: q.kind === 'choice' ? q.options[q.answer] : Array.isArray(q.answer) ? q.answer.join(' → ') : q.answer };
}
export function finishLesson(s, lesson) {
  if (!lesson.done || lesson.paid) return { ok: false };
  lesson.paid = true;
  s.coins += lesson.coins;
  s.lessonsToday++;
  s.stats.lessons++; s.stats.correct += lesson.correct; s.stats.coinsEarned += lesson.coins;
  advanceTime(s, 2);
  const name = SUBJECTS.find(x => x.id === lesson.subject).name;
  return { ok: true, coins: lesson.coins, msg: say(s, `${name} lesson: ${lesson.correct}/${lesson.questions.length} right, earned ${lesson.coins} coins${lesson.perfect ? ' (perfect bonus!)' : ''}.`) };
}

// ───────────────────────── neighbours ─────────────────────────
export const NEIGHBOURS = [
  { id: 'rose', name: 'Grandma Rose', house: 'flat', greeting: 'Hello dear! Come in, I have just baked scones.', paint: { wall: '#d9c7b8', roof: '#7a3f35', door: '#2f5a3e' },
    rooms: { 0: { wallpaper: 'floral', flooring: 'redcarpet', floor: ['armchair', 'coffeetable', 'bookcase', 'lamp'], wall: ['picture', 'clock'] }, 1: { floor: ['cooker', 'fridge'], wall: ['shelf'] }, 2: { wallpaper: 'blush', floor: ['bed', 'wardrobe'], wall: ['mirror'] }, 3: { floor: ['bath', null], wall: ['mirror'] } },
    garden: ['flowers', 'gnome'], pets: [['cat', 'Marmalade']] },
  { id: 'patel', name: 'The Patels', house: 'terrace', greeting: 'Hi! Priya is doing her homework but come and see the house.', paint: { wall: '#9fb3c2', roof: '#4a5660', door: '#d9b24a' },
    rooms: { 0: { wallpaper: 'duckegg', floor: ['doublebed', null, 'wardrobe', 'lamp'], wall: ['window', 'picture'] }, 1: { wallpaper: 'stars', floor: ['bunkbed', 'desk'], wall: ['shelf'] }, 2: { floor: ['bath', null], wall: ['mirror'] }, 3: { wallpaper: 'sage', flooring: 'walnut', floor: ['sofa', null, 'plant', 'bookcase'], wall: ['tv', 'camera'] }, 4: { floor: ['fridge', 'cooker', 'sink', 'diningtable'], wall: ['window', 'clock'] } },
    garden: ['tree', 'swing', 'bench', 'doorbell'], pets: [['dog', 'Biscuit'], ['hamster', 'Nibbles']] },
  { id: 'okafor', name: 'The Okafors', house: 'detached', greeting: 'Welcome! Mind the robot vacuum, it is a bit nosy.', paint: { wall: '#f1efe9', roof: '#2f3a44', door: '#1f1f1f' },
    rooms: { 0: { wallpaper: 'charcoal', flooring: 'walnut', floor: ['doublebed', null, 'wardrobe', 'lamp'], wall: ['abstract', 'window'] }, 1: { wallpaper: 'stars', floor: ['bed', 'desk'], wall: ['shelf'] }, 2: { wallpaper: 'blush', floor: ['cot', 'armchair'], wall: ['picture'] }, 3: { floor: ['bed', 'bookcase'], wall: ['camera'] }, 4: { floor: ['bath', null], wall: ['mirror'] }, 5: { wallpaper: 'cream', flooring: 'oak', floor: ['sofa', null, 'fireplace', 'robot'], wall: ['tv', 'alarm'] }, 6: { floor: ['diningtable', null], wall: ['chandelier'] }, 7: { wallpaper: 'tiles', floor: ['fridge', 'cooker', 'sink', 'plant'], wall: ['window', 'clock'] }, 8: { floor: ['computer', 'console'], wall: ['shelf'] } },
    garden: ['car', 'trampoline', 'tree', 'pond', 'outcam', 'lantern'], pets: [['parrot', 'Captain'], ['fish', 'Bubbles']] },
];
export const GIFTS = ['jam', 'drawing', 'cushion', 'cake'];
export function neighbourHouse(n) {
  const h = buildHouse(n.house);
  h.paint = { ...n.paint };
  for (const [ri, spec] of Object.entries(n.rooms)) {
    const room = h.rooms[Number(ri)];
    if (spec.wallpaper) room.wallpaper = spec.wallpaper;
    if (spec.flooring) room.flooring = spec.flooring;
    (spec.floor || []).forEach((id, i) => { if (id) { room.floorSlots[i] = id; for (let k = 1; k < (ITEM[id].size || 1); k++) room.floorSlots[i + k] = '@' + i; } });
    (spec.wall || []).forEach((id, i) => { if (id) room.wallSlots[i] = id; });
  }
  n.garden.forEach((id, i) => { h.garden[i] = id; });
  return h;
}
export function visitNeighbour(s, id, rng = makeRng(s.seed + s.day * 13)) {
  const n = NEIGHBOURS.find(x => x.id === id); if (!n) return { ok: false };
  advanceTime(s, 1);
  if (s.visitedToday.includes(id)) return { ok: true, gift: null, msg: `${n.name}: "Lovely to see you again! Come back tomorrow."` };
  if (s.lessonsToday < 1) return { ok: true, gift: null, noSchool: true, msg: `${n.name}: "Have you been to school today? No? Off you go then — come back after a lesson and I might have something for you."` };
  s.visitedToday.push(id);
  const id2 = rng.pick(GIFTS); addToVan(s, id2); const gift = { item: id2 };
  return { ok: true, gift, msg: say(s, `${n.name} gave you a ${ITEM[id2].name} for helping out. Home-made, so it is not for selling!`) };
}

// ───────────────────────── night ─────────────────────────
export function canSleep(s) { return !!s.jail || s.hour >= HOURS.NIGHT - 1; }
export function sleep(s, rng = makeRng(s.seed + s.day * 101)) {
  if (!s.house) return { ok: false, msg: 'You need a home to sleep in.' };
  const report = { day: s.day, happyBonus: 0, grown: [], burglar: null, cries: [], hungryPets: [] };
  // happiness bonus
  const happy = s.pets.filter(petHappy).length + s.family.filter(personHappy).length;
  if (happy) { report.happyBonus = happy * 2; s.coins += report.happyBonus; s.stats.coinsEarned += report.happyBonus; }
  // bills: batteries for gadgets and traps, food for every mouth. Unpaid = no power tonight.
  report.bill = nightlyBill(s); report.billFromBank = 0; report.powerOff = false;
  if (report.bill) {
    let due = report.bill;
    const fromPocket = Math.min(s.coins, due); s.coins -= fromPocket; due -= fromPocket;
    const fromBank = Math.min(s.bank, due); s.bank -= fromBank; due -= fromBank; report.billFromBank = fromBank;
    s.stats.bills += report.bill - due;
    if (due > 0) { report.powerOff = true; report.unpaid = due; say(s, `You could not pay the ${report.bill} coin bill, so the power was off tonight: no cameras, alarms or traps. (Bills are only food for pets and family.)`); }
  }
  const powerOff = report.powerOff;
  // burglars left in traps overnight are collected by the police
  report.collected = 0; report.collectedReward = 0;
  while (s.caged.length) { const r = callPolice(s, 0); report.collected++; report.collectedReward += r.reward; }
  // burglars
  report.burglars = [];
  s.footage = [];
  const attempts = s.day < BURGLAR_GRACE_DAYS ? 0 : (BURGLAR_CHANCE >= 1 || rng() < BURGLAR_CHANCE ? 1 : 0) + (rng() < (SECOND_BURGLAR_CHANCE[s.house.type] || 0.2) ? 1 : 0);
  for (let n = 0; n < attempts; n++) {
    const sec = powerOff ? s.pets.reduce((a, p) => a + PET[p.type].security, 0) : securityScore(s);
    const items = placedItems(s.house);
    const who = n === 0 ? 'A burglar' : 'A second burglar';
    const roomIdx = rng.int(0, s.house.rooms.length - 1);
    const roomName = s.house.rooms[roomIdx].name;
    const trapHere = trapInRoom(s.house, roomIdx);
    const trap = powerOff && trapHere !== 'banana' ? null : trapHere;
    const cam = cameraFor(s.house, roomIdx);
    let b;
    if (trap === 'cage' || trap === 'net') { s.caged.push({ room: roomIdx, trap }); b = { outcome: 'trapped', trap, room: roomIdx, msg: say(s, `${who} crept into the ${roomName} and ${trap === 'cage' ? 'CLANG! the cage dropped from the ceiling' : 'WHOOSH! the net scooped them up'}. They are still in there — tap them to call the police!`) }; }
    else if (trap === 'banana') { const dropped = rng.int(5, 12); s.coins += dropped; s.stats.coinsEarned += dropped; b = { outcome: 'slipped', coins: dropped, room: roomIdx, msg: say(s, `${who} crept into the ${roomName}, slipped on the banana skin and ran off, dropping ${dropped} coins.`) }; }
    else if (sec >= 3) { const asked = 20 + sec * 2; const reward = payReward(s, asked); s.stats.burglarsCaught++; b = { outcome: 'caught', room: roomIdx, reward, msg: say(s, `${who} tried to sneak in! Your security caught them red-handed and the police ${rewardNote(s, asked, reward)}.`) }; }
    else if (sec >= 1) b = { outcome: 'scared', room: roomIdx, msg: say(s, `${who} crept up to the house, got spooked and ran away. Phew! More cameras would catch them next time.`) };
    else {
      const here = items.filter(p => p.room === roomIdx && !ITEM[p.id].trap);
      const pct = rng.int(POCKET_THEFT[0], POCKET_THEFT[1]);
      const stolen = Math.floor(s.coins * pct / 100);
      if (stolen > 0) { s.coins -= stolen; s.stats.stolen += stolen; report.stolenCoins = (report.stolenCoins || 0) + stolen; }
      const coinMsg = stolen > 0 ? ` They also pinched ${stolen} coins (${pct}% of what you had at home) — coins in the bank are safe!` : '';
      if (here.length) {
        const taken = rng.pick(here);
        removeItem(s, taken.room, taken.kind, taken.slot);
        s.van[taken.id]--; if (!s.van[taken.id]) delete s.van[taken.id];
        b = { outcome: 'robbed', room: roomIdx, item: taken.id, stolen, msg: say(s, `Oh no! ${who} crept into the ${roomName} while everyone slept and took your ${ITEM[taken.id].name}.${coinMsg} Buy cameras, an alarm or a trap at the gadget shop!`) };
      } else b = { outcome: stolen > 0 ? 'robbed' : 'nothing', room: roomIdx, item: null, stolen, msg: say(s, stolen > 0 ? `${who} crept into the ${roomName}, found no furniture worth taking, but pinched ${stolen} coins (${pct}% of what you had at home). Coins in the bank are safe!` : `${who} crept into the ${roomName}, found nothing worth taking, and left.`) };
    }
    if (cam) {
      const clip = { id: `${s.day}-${n}-${s.seed % 1000}`, day: s.day, hour: rng.int(0, 4), minute: rng.int(0, 59), room: roomIdx, roomName, cam, who, outcome: b.outcome, trap: b.trap || null, item: b.item || null, coins: b.coins || b.reward || 0, wallpaper: s.house.rooms[roomIdx].wallpaper, flooring: s.house.rooms[roomIdx].flooring, saved: false };
      s.footage.push(clip); b.clip = s.footage.length - 1;
    }
    report.burglars.push(b);
  }
  report.burglar = report.burglars[0] || null;
  // the bank pays interest at midnight
  report.interest = nightlyInterest(s.bank);
  if (report.interest) { s.bank += report.interest; s.stats.interest += report.interest; }
  // pets
  for (const pet of s.pets) { pet.hunger = Math.min(3, pet.hunger + 1); pet.fun = Math.max(0, pet.fun - 1); pet.tricksToday = 0; pet.room = rng.int(0, s.house.rooms.length - 1); if (pet.hunger >= 2) report.hungryPets.push(pet.name); }
  // family
  for (const p of s.family) {
    p.age++; p.hunger = Math.min(3, p.hunger + 1); p.room = rng.int(0, s.house.rooms.length - 1);
    if (p.stage === 'baby' && p.age >= BABY_GROWS_AT) { p.stage = 'child'; report.grown.push(p.name); say(s, `${p.name} is not a baby any more — they are a child now! In a few days they can go to school.`); }
    if (p.hunger >= 2) report.cries.push(p.name);
  }
  s.day++; s.hour = HOURS.START; s.lessonsYesterday = s.lessonsToday; s.lessonsToday = 0; s.jobsToday = 0; s.visitedToday = [];
  if (s.jail) { s.jail.served++; s.jail.triedClimb = false; s.jail.triedKeys = false; report.jail = { served: s.jail.served, nights: s.jail.nights }; if (s.jail.served >= s.jail.nights) { report.released = true; releaseFromJail(s, 'You served your time. The jailer let you out at dawn.'); } }
  return { ok: true, report };
}

// ───────────────────────── save ─────────────────────────
export function serialize(s) { return JSON.stringify(s); }
export function deserialize(json) {
  const s = JSON.parse(json);
  if (!s || typeof s !== 'object' || !s.name) throw new Error('bad save');
  s.van = s.van || {}; s.pets = s.pets || []; s.family = s.family || []; s.bank = s.bank || 0; s.jail = s.jail || null; if (s.lessonsYesterday === undefined) s.lessonsYesterday = 1; delete s.policeBudget; s.caged = s.caged || []; s.footage = s.footage || []; s.gallery = s.gallery || []; s.log = s.log || []; s.visitedToday = s.visitedToday || [];
  s.stats = Object.assign({ lessons: 0, correct: 0, coinsEarned: 0, burglarsCaught: 0, housesOwned: 0, interest: 0, stolen: 0, bills: 0, fares: 0 }, s.stats || {});
  return s;
}

// ───────────────────────── jobs ─────────────────────────
// Each employer offers two puzzle jobs. A job is a list of tasks; every task type has a scorer below.
export const JOBS_PER_DAY = 3;
export const JOB_HOURS = 2;
export const JOB_PAY = 20;        // for a perfect job, plus the bonus
export const JOB_BONUS = 5;
export const JOB_MIN_PAY = 2;     // for turning up
export const JOBS = [
  { id: 'cushions', employer: 'furniture', name: 'Re-cover the cushions', blurb: 'Customers have ordered new fabric for their chairs. Match each order.', type: 'match' },
  { id: 'repaint', employer: 'furniture', name: 'Repaint furniture', blurb: 'Mix two paints to make the colour each customer asked for.', type: 'match' },
  { id: 'batteries', employer: 'gadget', name: 'Fresh batteries', blurb: 'Work out how many batteries each shelf of gadgets needs.', type: 'count' },
  { id: 'screens', employer: 'gadget', name: 'Test the screens', blurb: 'Each screen flashes a pattern. Repeat it back to prove it works.', type: 'simon' },
  { id: 'feed', employer: 'pets', name: 'Feed the animals', blurb: 'Every animal gets the right food.', type: 'match' },
  { id: 'bedtime', employer: 'pets', name: 'Put the pets to bed', blurb: 'Every animal goes back to the right home for the night.', type: 'match' },
  { id: 'mow', employer: 'garden', name: 'Mow the lawn', blurb: 'Drive the mower over every patch of grass. It only stops when it hits something!', type: 'mow' },
  { id: 'flowers', employer: 'garden', name: 'Plant the flower rows', blurb: 'Each row follows a pattern. Which flower comes next?', type: 'choice' },
  { id: 'water', employer: 'garden', name: 'Water the plants', blurb: 'Read the sign and give each pot exactly the right number of drops.', type: 'count' },
  { id: 'xray', employer: 'hospital', name: 'Sort the X-rays', blurb: 'The doctor needs each X-ray labelled with the right part of the body.', type: 'match' },
  { id: 'fever', employer: 'hospital', name: 'Take temperatures', blurb: 'Read every thermometer and find the patients with a fever (38°C or more).', type: 'pick' },
  { id: 'marking', employer: 'school', name: 'Mark the homework', blurb: 'Tick the sums that are right and find the ones that are wrong.', type: 'pick' },
  { id: 'library', employer: 'school', name: 'Tidy the library', blurb: 'Put the books back on the shelf in alphabetical order.', type: 'order' },
];
export const EMPLOYERS = { furniture: 'Furniture Shop', gadget: 'Gadget Shop', pets: 'Pet Shop', garden: 'Garden Centre', hospital: 'Hospital', school: 'School' };
export const JOB = Object.fromEntries(JOBS.map(j => [j.id, j]));
export function jobsFor(employer) { return JOBS.filter(j => j.employer === employer); }
export function jobsLeft(s) { return JOBS_PER_DAY - (s.jobsToday || 0); }
export function employerOpen(s, employer) { return employer === 'hospital' ? !tooLate(s) : employer === 'school' ? schoolOpen(s) : s.hour >= HOURS.SCHOOL_OPEN && s.hour < HOURS.SHOPS_CLOSE; }
export function canStartJob(s, employer) {
  if (!employerOpen(s, employer)) return { ok: false, msg: `${EMPLOYERS[employer]} is closed for work right now.` };
  if (jobsLeft(s) <= 0) return { ok: false, msg: `You have done ${JOBS_PER_DAY} jobs today — that is enough work for one day!` };
  return { ok: true };
}

const FABRICS = [{ id: 'red', label: 'Red velvet', color: '#b03030' }, { id: 'blue', label: 'Blue stripes', color: '#3b5a8a' }, { id: 'green', label: 'Green linen', color: '#4f7a3b' }, { id: 'yellow', label: 'Yellow check', color: '#d9b24a' }, { id: 'orange', label: 'Orange wool', color: '#c75b2a' }, { id: 'purple', label: 'Purple silk', color: '#6a3d9a' }];
const COLOUR_CLUES = { red: ['red', 'the colour of a strawberry', 'the colour of a fire engine'], blue: ['blue', 'the colour of the sky', 'the colour of the sea'], green: ['green', 'the colour of grass', 'the colour of a frog'], yellow: ['yellow', 'the colour of a banana', 'the colour of the sun'], orange: ['orange', 'the colour of a carrot', 'the colour of a pumpkin'], purple: ['purple', 'the colour of a plum', 'the colour of a grape'] };
const CUSTOMERS = ['Mrs Patel', 'Mr Lee', 'Grandma Rose', 'Dr Okafor', 'Captain Flint', 'Miss Honey', 'Farmer Giles', 'Mr Bumble'];
const MIXES = [{ id: 'orange', label: 'Red + Yellow', makes: 'Orange', color: '#e07a2a' }, { id: 'green', label: 'Blue + Yellow', makes: 'Green', color: '#4f9a3b' }, { id: 'purple', label: 'Red + Blue', makes: 'Purple', color: '#6a3d9a' }, { id: 'pink', label: 'Red + White', makes: 'Pink', color: '#e88ab0' }, { id: 'lightblue', label: 'Blue + White', makes: 'Light blue', color: '#8fc3e8' }, { id: 'grey', label: 'Black + White', makes: 'Grey', color: '#8a8a8a' }];
const PAINTABLE = ['table', 'chair', 'wardrobe', 'bookcase', 'bed', 'toy box'];
const FOODS = { dog: 'bone', cat: 'fish', rabbit: 'carrot', hamster: 'nuts', fish: 'flakes', parrot: 'seeds', dragon: 'marshmallows' };
const FOOD_LABEL = { bone: '🦴 Bone', fish: '🐟 Fish', carrot: '🥕 Carrot', nuts: '🌰 Nuts', flakes: '🫧 Fish flakes', seeds: '🌻 Seeds', marshmallows: '🍡 Marshmallows' };
const HOMES = { dog: 'kennel', cat: 'basket', rabbit: 'hutch', hamster: 'cage', fish: 'tank', parrot: 'perch', dragon: 'cave' };
const HOME_LABEL = { kennel: '🏠 Kennel', basket: '🧺 Basket', hutch: '🪵 Hutch', cage: '🔲 Cage', tank: '🐠 Tank', perch: '🪵 Perch', cave: '🌋 Cave' };
const GADGETS = [['torch', 'AA'], ['remote control', 'AAA'], ['wall clock', 'AA'], ['toy robot', 'AAA'], ['smoke alarm', '9V'], ['game controller', 'AA'], ['fairy lights', 'AAA'], ['radio', 'C']];
const XRAYS = ['skull', 'hand', 'foot', 'ribs', 'spine', 'leg'];
const XRAY_LABEL = { skull: 'Skull (head)', hand: 'Hand', foot: 'Foot', ribs: 'Ribs (chest)', spine: 'Spine (back)', leg: 'Leg bone' };
const FLOWERS = ['🌷', '🌻', '🌹', '🌼', '🪻'];
const BOOKS = ['Alice in Wonderland', 'Black Beauty', 'Charlotte\'s Web', 'Danny the Champion', 'Esio Trot', 'Fantastic Mr Fox', 'Gangsta Granny', 'Heidi', 'Iron Man', 'James and the Giant Peach', 'Kensuke\'s Kingdom', 'Little Women', 'Matilda', 'Northern Lights', 'Oliver Twist', 'Peter Pan', 'Rapunzel', 'Stig of the Dump', 'Treasure Island', 'Wind in the Willows'];

function matchTask(prompt, rows, options, extra = {}) { return { type: 'match', prompt, rows, options, ...extra }; }
export function makeJob(id, rng) {
  const j = JOB[id]; if (!j) throw new Error('unknown job ' + id);
  const tasks = [];
  if (id === 'cushions') {
    const names = rng.shuffle(CUSTOMERS).slice(0, 4);
    const rows = names.map(n => { const f = rng.pick(FABRICS); return { label: `${n}'s chair`, clue: `${n} wants ${rng.pick(COLOUR_CLUES[f.id])}`, answer: f.id }; });
    tasks.push(matchTask('Read the order book, then pick the right fabric for every chair.', rows, FABRICS.map(f => ({ id: f.id, label: f.label, color: f.color })), { note: rows.map(r => r.clue).join(' · ') }));
  } else if (id === 'repaint') {
    const picks = rng.shuffle(MIXES).slice(0, 4);
    const rows = picks.map(m => ({ label: `${rng.pick(CUSTOMERS)} wants the ${rng.pick(PAINTABLE)} painted`, want: m.makes, color: m.color, answer: m.id }));
    tasks.push(matchTask('Which two paints make the colour each customer wants?', rows, rng.shuffle(MIXES).map(m => ({ id: m.id, label: m.label }))));
  } else if (id === 'batteries') {
    const picks = rng.shuffle(GADGETS).slice(0, 4);
    const rows = picks.map(([g, size]) => { const each = rng.int(1, 4), n = rng.int(2, 5); return { label: `${n} ${g}s`, prompt: `Each ${g} takes ${each} ${size} batter${each === 1 ? 'y' : 'ies'}. There are ${n} of them on the shelf.`, unit: size, answer: each * n }; });
    tasks.push({ type: 'count', prompt: 'How many batteries does each shelf need?', rows, max: 20 });
  } else if (id === 'screens') {
    for (const len of [3, 4, 5]) tasks.push({ type: 'simon', prompt: `Screen ${tasks.length + 1}: watch the pattern, then tap it back.`, seq: Array.from({ length: len }, () => rng.int(0, 3)) });
  } else if (id === 'feed') {
    const pets = rng.shuffle(PETS.map(p => p.id)).slice(0, 5);
    tasks.push(matchTask('Give every animal its favourite food.', pets.map(p => ({ label: PET[p].name, pet: p, answer: FOODS[p] })), rng.shuffle(Object.keys(FOOD_LABEL)).map(f => ({ id: f, label: FOOD_LABEL[f] }))));
  } else if (id === 'bedtime') {
    const pets = rng.shuffle(PETS.map(p => p.id)).slice(0, 5);
    tasks.push(matchTask('Where does each animal sleep?', pets.map(p => ({ label: PET[p].name, pet: p, answer: HOMES[p] })), rng.shuffle(Object.keys(HOME_LABEL)).map(h => ({ id: h, label: HOME_LABEL[h] }))));
  } else if (id === 'mow') {
    tasks.push(makeLawn(rng));
  } else if (id === 'flowers') {
    for (let r = 0; r < 4; r++) {
      const kind = rng.pick(['AB', 'ABC', 'AABB', 'ABB']);
      const f = rng.shuffle(FLOWERS).slice(0, 3);
      const unit = kind === 'AB' ? [f[0], f[1]] : kind === 'ABC' ? [f[0], f[1], f[2]] : kind === 'AABB' ? [f[0], f[0], f[1], f[1]] : [f[0], f[1], f[1]];
      const shown = Array.from({ length: 6 }, (_, i) => unit[i % unit.length]);
      const answer = unit[6 % unit.length];
      const options = rng.shuffle([...new Set([answer, ...f, ...FLOWERS])]).slice(0, 4);
      if (!options.includes(answer)) options[0] = answer;
      tasks.push({ type: 'choice', prompt: `Row ${r + 1}: ${shown.join(' ')} … which flower comes next?`, options: rng.shuffle(options), answer: null, answerValue: answer });
      tasks[tasks.length - 1].answer = tasks[tasks.length - 1].options.indexOf(answer);
    }
  } else if (id === 'water') {
    const per = rng.int(2, 4);
    const rows = Array.from({ length: 4 }, (_, i) => { const n = rng.int(1, 5); return { label: `Pot ${i + 1}: ${n} plant${n === 1 ? '' : 's'}`, prompt: `${n} plant${n === 1 ? '' : 's'} in this pot`, unit: 'drops', plants: n, answer: n * per }; });
    tasks.push({ type: 'count', prompt: `The sign says: give every plant ${per} drops of water. How many drops for each pot?`, rows, max: 20 });
  } else if (id === 'xray') {
    const picks = rng.shuffle(XRAYS).slice(0, 4);
    tasks.push(matchTask('Label each X-ray with the part of the body it shows.', picks.map(x => ({ label: 'X-ray', xray: x, answer: x })), rng.shuffle(XRAYS).map(x => ({ id: x, label: XRAY_LABEL[x] }))));
  } else if (id === 'fever') {
    const names = rng.shuffle(CUSTOMERS).slice(0, 6);
    const items = names.map(n => { const temp = (rng.int(355, 402) / 10); return { label: n, temp, detail: `${temp.toFixed(1)}°C`, pick: temp >= 38 }; });
    if (!items.some(i => i.pick)) { items[0].temp = 38.6; items[0].detail = '38.6°C'; items[0].pick = true; }
    tasks.push({ type: 'pick', prompt: 'Tap every patient who has a fever (38°C or more).', items });
  } else if (id === 'marking') {
    const items = Array.from({ length: 6 }, () => {
      const a = rng.int(2, 12), b = rng.int(2, 12), op = rng.pick(['+', '−', '×']);
      const right = op === '+' ? a + b : op === '−' ? Math.max(a, b) - Math.min(a, b) : a * b;
      const wrong = rng() < 0.45; const shown = wrong ? right + rng.pick([-10, -2, -1, 1, 2, 10]) : right;
      return { label: `${op === '−' ? Math.max(a, b) : a} ${op} ${op === '−' ? Math.min(a, b) : b} = ${shown}`, pick: wrong };
    });
    const fix = (i, wrong) => { const a = rng.int(2, 12), b = rng.int(2, 12); items[i] = { label: `${a} + ${b} = ${a + b + (wrong ? 1 : 0)}`, pick: wrong }; };
    if (!items.some(i => i.pick)) fix(0, true);
    if (!items.some(i => !i.pick)) fix(1, false);
    tasks.push({ type: 'pick', prompt: 'Tap the sums that are WRONG. Leave the right ones alone.', items });
  } else if (id === 'library') {
    const books = rng.shuffle(BOOKS).slice(0, 5).sort();
    tasks.push({ type: 'order', prompt: 'Tap the books in alphabetical order (A first) to put them back on the shelf.', tiles: rng.shuffle(books), answer: books });
  }
  return { id, name: j.name, employer: j.employer, tasks, index: 0, scores: [], done: false };
}

// Lawn: the mower slides until it hits a flower bed or the edge. Level is built from a random walk so it is always solvable.
export function makeLawn(rng) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const w = rng.int(5, 6), h = rng.int(5, 6);
    const visited = new Set(), beds = new Set();
    let x = rng.int(0, w - 1), y = rng.int(0, h - 1);
    const start = [x, y];
    visited.add(`${x},${y}`);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const free = (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h && !beds.has(`${tx},${ty}`);
    for (let step = 0; step < 16; step++) {
      const [dx, dy] = rng.pick(dirs);
      const len = rng.int(1, Math.max(w, h) - 1);
      let nx = x, ny = y;
      for (let k = 0; k < len && free(nx + dx, ny + dy); k++) { nx += dx; ny += dy; }
      // plant a flower bed where we want the mower to stop; if we cannot, keep sliding like the real mower would
      if (free(nx + dx, ny + dy)) {
        if (!visited.has(`${nx + dx},${ny + dy}`)) beds.add(`${nx + dx},${ny + dy}`);
        else while (free(nx + dx, ny + dy)) { nx += dx; ny += dy; }
      }
      if (nx === x && ny === y) continue;
      let cx = x, cy = y; while (cx !== nx || cy !== ny) { cx += dx; cy += dy; visited.add(`${cx},${cy}`); }
      x = nx; y = ny;
    }
    const grass = [];
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const k = `${xx},${yy}`; if (!visited.has(k)) beds.add(k); else grass.push(k); }
    if (grass.length < 8) continue;
    return { type: 'mow', prompt: 'Tap an arrow to drive the mower. It keeps going until it hits a flower bed or the fence. Mow every patch of grass!', w, h, beds: [...beds], grass, start, pos: start.slice(), mown: [start.join(',')], moves: 0 };
  }
  // fallback: an open 5×5 lawn with one bed, always solvable
  return { type: 'mow', prompt: 'Mow every patch of grass!', w: 5, h: 5, beds: ['2,2'], grass: Array.from({ length: 25 }, (_, i) => `${i % 5},${Math.floor(i / 5)}`).filter(k => k !== '2,2'), start: [0, 0], pos: [0, 0], mown: ['0,0'], moves: 0 };
}
export function mowStep(task, dir) {
  const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] || [0, 0];
  let [x, y] = task.pos; let moved = false;
  const beds = new Set(task.beds), mown = new Set(task.mown);
  while (true) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= task.w || ny >= task.h || beds.has(`${nx},${ny}`)) break; x = nx; y = ny; mown.add(`${x},${y}`); moved = true; }
  if (moved) { task.pos = [x, y]; task.mown = [...mown]; task.moves++; }
  return { moved, complete: task.mown.length >= task.grass.length };
}

export function scoreTask(task, given) {
  if (task.type === 'match') { const total = task.rows.length; const correct = task.rows.filter((r, i) => given && given[i] === r.answer).length; return { correct, total }; }
  if (task.type === 'count') { const total = task.rows.length; const correct = task.rows.filter((r, i) => given && Number(given[i]) === r.answer).length; return { correct, total }; }
  if (task.type === 'pick') { const total = task.items.length; const sel = new Set(given || []); const correct = task.items.filter((it, i) => sel.has(i) === it.pick).length; return { correct, total }; }
  if (task.type === 'order') { const total = task.answer.length; const correct = task.answer.filter((a, i) => given && given[i] === a).length; return { correct, total }; }
  if (task.type === 'choice') return { correct: given === task.answer ? 1 : 0, total: 1 };
  if (task.type === 'simon') return { correct: Array.isArray(given) && given.length === task.seq.length && given.every((g, i) => g === task.seq[i]) ? 1 : 0, total: 1 };
  if (task.type === 'mow') return { correct: task.mown.length, total: task.grass.length };
  return { correct: 0, total: 1 };
}
export function startJob(s, id, rng = makeRng(s.seed + s.day * 97 + (s.jobsToday || 0) * 11)) {
  const j = JOB[id]; if (!j) return { ok: false, msg: 'No such job.' };
  const c = canStartJob(s, j.employer); if (!c.ok) return c;
  return { ok: true, job: makeJob(id, rng) };
}
export function submitTask(job, given) {
  if (job.done) return { ok: false };
  const task = job.tasks[job.index];
  const sc = scoreTask(task, given);
  job.scores.push(sc);
  job.index++;
  if (job.index >= job.tasks.length) job.done = true;
  return { ok: true, ...sc, done: job.done };
}
export function jobPay(job) {
  const correct = job.scores.reduce((a, s) => a + s.correct, 0), total = job.scores.reduce((a, s) => a + s.total, 0);
  const perfect = total > 0 && correct === total;
  return { correct, total, perfect, coins: Math.max(JOB_MIN_PAY, Math.round(JOB_PAY * (total ? correct / total : 0))) + (perfect ? JOB_BONUS : 0) };
}
export function finishJob(s, job) {
  if (!job.done || job.paid) return { ok: false };
  job.paid = true;
  const pay = jobPay(job);
  s.coins += pay.coins; s.jobsToday = (s.jobsToday || 0) + 1;
  s.stats.jobs = (s.stats.jobs || 0) + 1; s.stats.wages = (s.stats.wages || 0) + pay.coins; s.stats.coinsEarned += pay.coins;
  advanceTime(s, JOB_HOURS);
  return { ok: true, ...pay, msg: say(s, `${job.name} at the ${EMPLOYERS[job.employer]}: ${pay.correct}/${pay.total} right, paid ${pay.coins} coins${pay.perfect ? ' (perfect bonus!)' : ''}.`) };
}

// ───────────────────────── robber "jobs" and jail ─────────────────────────
export const HEISTS = [
  { id: 'house', name: 'Burgle a house', blurb: 'Crack the door code of a house across town and grab what you can. 3 digits, 6 tries.', digits: 3, tries: 6, loot: [30, 60], spotted: 0.3, nights: 2 },
  { id: 'bank', name: 'Rob the bank', blurb: 'The big one. Crack the vault code before the alarm goes off. 4 digits, 8 tries.', digits: 4, tries: 8, loot: [100, 160], spotted: 0.55, nights: 3 },
];
export const HEIST = Object.fromEntries(HEISTS.map(h => [h.id, h]));
export const ALLEY_OPEN = [HOURS.SCHOOL_OPEN, HOURS.LATEST];
export function alleyOpen(s) { return s.hour >= ALLEY_OPEN[0] && s.hour < ALLEY_OPEN[1]; }
export function canStartHeist(s) {
  if (s.jail) return { ok: false, msg: 'You are in jail!' };
  if (!alleyOpen(s)) return { ok: false, msg: 'The back alley is empty right now.' };
  if (jobsLeft(s) <= 0) return { ok: false, msg: `You have done ${JOBS_PER_DAY} jobs today — even robbers need a rest.` };
  return { ok: true };
}
export function startHeist(s, id, rng = makeRng(s.seed + s.day * 61 + (s.jobsToday || 0) * 17)) {
  const h = HEIST[id]; if (!h) return { ok: false, msg: 'No such heist.' };
  const c = canStartHeist(s); if (!c.ok) return c;
  const code = Array.from({ length: h.digits }, () => rng.int(0, 9));
  return { ok: true, heist: { id, name: h.name, code, digits: h.digits, triesLeft: h.tries, guesses: [], solved: false, failed: false, loot: rng.int(h.loot[0], h.loot[1]), spotRoll: rng() } };
}
// A guess is an array of digits. Feedback per digit: 'ok' right, 'up' the code digit is higher, 'down' it is lower.
export function heistGuess(heist, guess) {
  if (heist.solved || heist.failed) return { ok: false };
  if (!Array.isArray(guess) || guess.length !== heist.digits || guess.some(d => !Number.isInteger(d) || d < 0 || d > 9)) return { ok: false, msg: `Enter ${heist.digits} digits.` };
  const feedback = guess.map((d, i) => d === heist.code[i] ? 'ok' : d < heist.code[i] ? 'up' : 'down');
  heist.guesses.push({ guess: guess.slice(), feedback });
  heist.triesLeft--;
  if (feedback.every(f => f === 'ok')) heist.solved = true;
  else if (heist.triesLeft <= 0) heist.failed = true;
  return { ok: true, feedback, solved: heist.solved, failed: heist.failed, triesLeft: heist.triesLeft };
}
export function sendToJail(s, nights, why) {
  s.record = (s.record || 0) + 1;
  s.jail = { nights, served: 0, why, day: s.day, triedClimb: false, triedKeys: false };
  s.stats.jailed = (s.stats.jailed || 0) + 1;
  return say(s, `${why} You were marched off to jail for ${nights} night${nights === 1 ? '' : 's'}.`);
}
export function finishHeist(s, heist) {
  if (heist.paid) return { ok: false };
  heist.paid = true;
  const h = HEIST[heist.id];
  s.jobsToday = (s.jobsToday || 0) + 1;
  advanceTime(s, JOB_HOURS);
  if (heist.failed) return { ok: true, outcome: 'caught', coins: 0, msg: sendToJail(s, h.nights, `The alarm went off before you cracked the ${heist.id === 'bank' ? 'vault' : 'door'} code!`) };
  if (heist.spotRoll < h.spotted) return { ok: true, outcome: 'caught', coins: 0, msg: sendToJail(s, h.nights, `You cracked the code — but a police officer spotted you sneaking out with the loot!`) };
  s.coins += heist.loot; s.stats.loot = (s.stats.loot || 0) + heist.loot; s.stats.coinsEarned += heist.loot;
  return { ok: true, outcome: 'loot', coins: heist.loot, msg: say(s, `${heist.name}: you got away with ${heist.loot} coins. Naughty!`) };
}

// Jail. Escape by climbing the wall or nabbing the jailer's keys (one go at each per day), or serve the nights.
export function inJail(s) { return !!s.jail; }
export function releaseFromJail(s, how) { s.jail = null; return say(s, how); }
export function makeWall(rng) {
  const w = 5, h = 7;              // row 0 is the ground, row h-1 is the top of the wall
  const cells = Array.from({ length: h }, () => Array(w).fill(null));
  let col = rng.int(0, w - 1);
  const start = col;
  cells[0][col] = 'hold';
  for (let r = 1; r < h; r++) { col = Math.max(0, Math.min(w - 1, col + rng.int(-1, 1))); cells[r][col] = 'hold'; }
  // extra holds (some crumbly), never touching the path cells themselves
  for (let r = 1; r < h; r++) for (let c = 0; c < w; c++) if (!cells[r][c] && rng() < 0.45) cells[r][c] = rng() < 0.4 ? 'crumbly' : 'hold';
  return { type: 'climb', w, h, cells, start, pos: [start, 0], falls: 0, maxFalls: 3, done: false, escaped: false };
}
export function climbStep(task, col, row) {
  if (task.done) return { ok: false };
  const [pc, pr] = task.pos;
  if (row !== pr + 1 || Math.abs(col - pc) > 1 || col < 0 || col >= task.w) return { ok: false, msg: 'You can only reach the holds just above you.' };
  const cell = task.cells[row][col];
  if (!cell) return { ok: false, msg: 'Nothing to hold on to there.' };
  if (cell === 'crumbly') { task.falls++; task.cells[row][col] = null; task.pos = [task.start, 0]; if (task.falls >= task.maxFalls) task.done = true; return { ok: true, fell: true, done: task.done }; }
  task.pos = [col, row];
  if (row === task.h - 1) { task.done = true; task.escaped = true; }
  return { ok: true, fell: false, escaped: task.escaped, done: task.done };
}
export function climbDown(task) { if (task.done) return { ok: false }; task.pos = [task.start, 0]; return { ok: true }; }
export function climbGiveUp(task) { task.done = true; task.escaped = false; return { ok: true }; }
export function makeShuffle(rng) {
  const cups = 3; const keys = rng.int(0, cups - 1);
  const swaps = Array.from({ length: rng.int(5, 7) }, () => { const a = rng.int(0, cups - 1); let b = rng.int(0, cups - 2); if (b >= a) b++; return [a, b]; });
  let pos = keys; for (const [a, b] of swaps) { if (pos === a) pos = b; else if (pos === b) pos = a; }
  return { type: 'shuffle', cups, keys, swaps, answer: pos };
}
export function tryEscape(s, how, rng = makeRng(s.seed + s.day * 7 + (how === 'climb' ? 1 : 2))) {
  if (!s.jail) return { ok: false, msg: 'You are not in jail.' };
  if (how === 'climb') { if (s.jail.triedClimb) return { ok: false, msg: 'The guards are watching the wall now. Try again tomorrow.' }; s.jail.triedClimb = true; return { ok: true, task: makeWall(rng) }; }
  if (how === 'keys') { if (s.jail.triedKeys) return { ok: false, msg: 'The jailer is wide awake now. Try again tomorrow.' }; s.jail.triedKeys = true; return { ok: true, task: makeShuffle(rng) }; }
  return { ok: false };
}
export function escapeResult(s, how, success) {
  if (!s.jail) return { ok: false };
  if (!success) return { ok: true, escaped: false, msg: how === 'climb' ? 'You fell one time too many and the guards heard. Back in the cell!' : 'Wrong cup! The jailer woke up and grabbed the keys back.' };
  s.stats.escapes = (s.stats.escapes || 0) + 1;
  return { ok: true, escaped: true, msg: releaseFromJail(s, how === 'climb' ? 'You climbed the prison wall and dropped down the other side. Free!' : 'You nabbed the keys from the snoring jailer and tiptoed out. Free!') };
}
