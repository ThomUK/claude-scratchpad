// Engine validation — run with: node tests/engine.test.mjs
import {
  HOUSES, ITEMS, ITEM, PETS, PET, WALLPAPERS, FLOORS, PAINTS, NEIGHBOURS, SUBJECTS, LEVELS, HOURS, START_COINS, LESSONS_PER_DAY, QUESTIONS_PER_LESSON, PERFECT_BONUS, BABY_GROWS_AT, CHILD_SCHOOL_AGE, BURGLAR_GRACE_DAYS,
  makeRng, newGame, buildHouse, houseWidth, moveHouse, houseSalePrice, buyItem, sellFromVan, vanItems, vanCount, placeItem, removeItem, placedList, setWallpaper, setFlooring, setPaint,
  securityScore, buyPet, feedPet, playWithPet, mealsLeft, canHaveBaby, newBaby, feedPerson, lessonsLeft, canStartLesson, makeQuestion, startLesson, checkAnswer, answerQuestion, finishLesson,
  neighbourHouse, visitNeighbour, trapInRoom, trapCount, callPolice, TRAP_REWARD, cameraFor, saveClip, deleteClip, GALLERY_MAX, sleep, canSleep, advanceTime, clockText, isNight, serialize, deserialize, bedCount, cotCount,
} from '../engine.js';

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${msg}`); if (!cond) fails++; };

console.log('— catalogue —');
ok(HOUSES.length === 4 && HOUSES.every((h, i) => i === 0 || h.price > HOUSES[i - 1].price), 'four houses, each dearer than the last');
ok(HOUSES[0].price < START_COINS && HOUSES[1].price > START_COINS, 'only the flat is affordable at the start');
ok(new Set(ITEMS.map(i => i.id)).size === ITEMS.length, 'item ids are unique');
ok(ITEMS.every(i => ['floor', 'wall', 'garden', 'supply'].includes(i.kind) && i.price > 0), 'every item has a kind and a price');
ok(ITEMS.filter(i => i.security).length >= 4, 'several security gadgets exist');
ok(PETS.length === 7 && PET.dragon.security > PET.dog.security, 'seven pets; the dragon guards best');
ok(WALLPAPERS.length >= 10 && FLOORS.length >= 6, 'plenty of wallpapers and floors');
for (const h of HOUSES) {
  const b = buildHouse(h.id);
  const rooms = h.floors.flat().length;
  ok(b.rooms.length === rooms && b.rooms.every(r => r.floorSlots.length === r.w * 2 && r.wallSlots.length === r.w), `${h.name}: ${rooms} rooms with slots sized from width`);
  ok(b.garden.length === h.garden && houseWidth(b) >= 4, `${h.name}: garden has ${h.garden} spots`);
}
ok(NEIGHBOURS.every(n => { const h = neighbourHouse(n); return placedList(h).length > 5; }), 'neighbour houses build without error and are furnished');

console.log('— rng —');
{
  const a = makeRng(5), b = makeRng(5);
  ok(Array.from({ length: 20 }, () => a()).every((v, i) => v === b.int(0, 0) * 0 + v && v >= 0 && v < 1), 'rng in [0,1)');
  const c = makeRng(9), d = makeRng(9);
  ok(JSON.stringify(c.shuffle([1, 2, 3, 4, 5])) === JSON.stringify(d.shuffle([1, 2, 3, 4, 5])), 'rng is deterministic for a seed');
}

console.log('— new game, buying a home —');
const s = newGame('  Elliott ', makeRng(1));
ok(s.name === 'Elliott' && s.coins === START_COINS && s.day === 1 && s.hour === HOURS.START && s.house === null, 'new game starts homeless with starting coins');
ok(!moveHouse(s, 'castle').ok, 'cannot afford the castle');
let r = moveHouse(s, 'flat');
ok(r.ok && s.house.type === 'flat' && s.coins === START_COINS - HOUSES[0].price, 'bought the flat');
ok(!moveHouse(s, 'flat').ok, 'cannot buy the house you live in');
ok(clockText(s) === '8:00 am', `clock reads ${clockText(s)} after an hour at the estate agent`);

console.log('— shopping and decorating —');
ok(!buyItem(s, 'piano').ok, 'cannot afford a piano yet');
r = buyItem(s, 'bed');
ok(r.ok && vanCount(s, 'bed') === 1 && s.coins === START_COINS - 300 - 60, 'bought a bed into the van');
ok(!placeItem(s, 0, 'wall', 0, 'bed').ok, 'a bed cannot go on a wall');
ok(placeItem(s, 2, 'floor', 0, 'bed').ok && s.house.rooms[2].floorSlots[0] === 'bed' && vanCount(s, 'bed') === 0, 'placed the bed in the bedroom');
ok(!placeItem(s, 2, 'floor', 0, 'bed').ok, 'cannot place from an empty van');
s.coins += 1000;
buyItem(s, 'sofa'); buyItem(s, 'sofa');
ok(!placeItem(s, 0, 'floor', 3, 'sofa').ok, 'a two-slot sofa does not fit in the last slot');
ok(placeItem(s, 0, 'floor', 0, 'sofa').ok && s.house.rooms[0].floorSlots[1] === '@0', 'sofa takes two slots');
ok(!placeItem(s, 0, 'floor', 1, 'sofa').ok, 'cannot overlap the sofa');
ok(removeItem(s, 0, 'floor', 1).ok && s.house.rooms[0].floorSlots.every(x => x === null) && vanCount(s, 'sofa') === 2, 'removing by the continuation slot clears both slots and returns the sofa');
ok(placeItem(s, 0, 'floor', 2, 'sofa').ok, 'sofa fits at the end');
buyItem(s, 'camera'); buyItem(s, 'tree');
ok(placeItem(s, 0, 'wall', 1, 'camera').ok, 'camera goes on a wall');
ok(placeItem(s, -1, 'garden', 0, 'tree').ok && s.house.garden[0] === 'tree', 'tree goes in the garden');
ok(!placeItem(s, -1, 'garden', 0, 'tree').ok, 'garden spot already taken');
setWallpaper(s, 0, 'stars'); setFlooring(s, 0, 'walnut'); setPaint(s, 'door', PAINTS.door[2]); setPaint(s, 'door', '#123456');
ok(s.house.rooms[0].wallpaper === 'stars' && s.house.rooms[0].flooring === 'walnut' && s.house.paint.door === PAINTS.door[2], 'wallpaper, floor and paint set; unknown paint ignored');
r = sellFromVan(s, 'sofa');
ok(r.ok && r.price === 55 && vanCount(s, 'sofa') === 0, 'selling from the van gives half price');
ok(vanItems(s).length === 0, 'van is now empty');
ok(bedCount(s.house) === 1 && cotCount(s.house) === 0, 'bed and cot counts');

console.log('— selling a decorated house —');
{
  const t = newGame('T'); moveHouse(t, 'flat');
  ok(houseSalePrice(t.house) === HOUSES[0].price, 'an empty house sells for what you paid');
  t.coins += 500; buyItem(t, 'bed'); buyItem(t, 'wardrobe'); placeItem(t, 2, 'floor', 0, 'bed'); placeItem(t, 2, 'floor', 1, 'wardrobe');
  ok(houseSalePrice(t.house) === HOUSES[0].price + Math.round(HOUSES[0].price * 0.08), 'one decorated room adds a bonus');
  buyItem(t, 'flowers'); buyItem(t, 'gnome'); placeItem(t, -1, 'garden', 0, 'flowers'); placeItem(t, -1, 'garden', 1, 'gnome');
  ok(houseSalePrice(t.house) === HOUSES[0].price + Math.round(HOUSES[0].price * 0.08 * 2), 'a finished balcony adds a bonus too');
  const sale = houseSalePrice(t.house);
  t.coins = HOUSES[1].price - sale - 1;
  ok(!moveHouse(t, 'terrace').ok, 'one coin short of the terrace');
  t.coins++;
  r = moveHouse(t, 'terrace');
  ok(r.ok && t.coins === 0 && t.house.type === 'terrace' && vanCount(t, 'bed') === 1 && vanCount(t, 'gnome') === 1, 'moved house; furniture went into the van');
  ok(t.house.rooms.every(rm => rm.floorSlots.every(x => x === null)), 'new house starts empty');
}

console.log('— security —');
ok(securityScore(s) === 2, 'one camera = 2 points');

console.log('— pets —');
{ const c = s.coins; s.coins = 100; ok(!buyPet(s, 'dragon', 'Smaug').ok, 'cannot afford a dragon'); s.coins = c; }
r = buyPet(s, 'dog', ' Biscuit ');
ok(r.ok && s.pets.length === 1 && s.pets[0].name === 'Biscuit' && securityScore(s) === 4, 'dog bought and guards the house');
ok(!feedPet(s, 0).ok, 'a new pet is not hungry');
s.pets[0].hunger = 2;
ok(!feedPet(s, 0).ok, 'no pet food means no feeding');
buyItem(s, 'petfood');
ok(mealsLeft(s) === 5 && feedPet(s, 0).ok && s.pets[0].hunger === 0 && mealsLeft(s) === 4, 'feeding uses one meal from the bag');
s.pets[0].fun = 2;
r = playWithPet(s, 0, makeRng(3));
ok(r.ok && r.trick && r.coins >= 1 && r.coins <= 4, 'a happy fed pet does a trick and finds a few coins');
r = playWithPet(s, 0, makeRng(3)); r = playWithPet(s, 0, makeRng(3));
ok(!r.trick, 'at most two tricks a day');

console.log('— family —');
ok(!canHaveBaby(s).ok, 'no cot, no baby');
buyItem(s, 'cot'); placeItem(s, 2, 'floor', 1, 'cot');
ok(canHaveBaby(s).ok, 'with a cot a baby can come home');
r = newBaby(s, 'Mia');
ok(r.ok && s.family.length === 1 && s.family[0].stage === 'baby', 'baby Mia arrived');
ok(!canHaveBaby(s).ok, 'one baby per cot');
s.family[0].hunger = 2;
ok(feedPerson(s, 0).ok && s.family[0].hunger === 0, 'fed the baby');

console.log('— school —');
{
  const t = newGame('Q'); moveHouse(t, 'flat');
  ok(lessonsLeft(t) === LESSONS_PER_DAY, 'three lessons a day');
  t.hour = 7; ok(!canStartLesson(t).ok, 'school not open at 7am');
  t.hour = 9;
  for (const sub of SUBJECTS) for (const lv of LEVELS) {
    const rng = makeRng(11);
    let kinds = new Set(), valid = true;
    for (let i = 0; i < 60; i++) {
      const q = makeQuestion(sub.id, lv.id, rng); kinds.add(q.kind);
      if (q.kind === 'choice') { if (q.options.length !== 4 || new Set(q.options).size !== 4 || q.options[q.answer] === undefined) valid = false; }
      else if (q.kind === 'order') { if (q.tiles.length !== q.answer.length || !checkAnswer(q, q.answer)) valid = false; }
      else if (q.kind === 'build') { if (q.tiles.join('').split('').sort().join('') !== q.answer.split('').sort().join('')) valid = false; }
      else valid = false;
    }
    ok(valid, `${sub.name} / ${lv.name}: 60 well-formed questions (${[...kinds].join(', ')})`);
  }
  const l1 = startLesson(t, 'maths', 'easy', makeRng(2)), l2 = startLesson(t, 'maths', 'easy', makeRng(2));
  ok(l1.ok && l1.lesson.questions.length === QUESTIONS_PER_LESSON && JSON.stringify(l1.lesson) === JSON.stringify(l2.lesson), 'lessons are deterministic for a seed');
  ok(new Set(l1.lesson.questions.map(q => q.prompt)).size === QUESTIONS_PER_LESSON, 'no repeated questions in a lesson');
  const lesson = l1.lesson;
  const before = t.coins;
  for (const q of lesson.questions) {
    const given = q.kind === 'choice' ? q.answer : q.kind === 'order' ? q.answer : q.answer;
    const a = answerQuestion(lesson, given);
    ok(a.ok && a.correct && a.coins === 3, `answered "${q.prompt}" correctly for 3 coins`);
  }
  ok(lesson.done && lesson.perfect && lesson.coins === 6 * 3 + PERFECT_BONUS, 'perfect lesson earns the bonus');
  ok(!answerQuestion(lesson, 0).ok, 'cannot answer after the lesson ends');
  r = finishLesson(t, lesson);
  ok(r.ok && t.coins === before + 23 && t.lessonsToday === 1 && t.hour === 11 && lessonsLeft(t) === 2, 'finished: paid, time passed, one lesson used');
  ok(!finishLesson(t, lesson).ok, 'a lesson is only paid once');
  const l3 = startLesson(t, 'words', 'hard', makeRng(4)).lesson;
  const wrong = l3.questions[0].kind === 'choice' ? (l3.questions[0].answer + 1) % 4 : 'nope';
  const a = answerQuestion(l3, wrong);
  ok(a.ok && !a.correct && a.coins === 0 && a.correctAnswer, 'a wrong answer earns nothing and reveals the answer');
  t.lessonsToday = 3; ok(!canStartLesson(t).ok, 'no fourth lesson');
  t.family.push({ name: 'Kid', stage: 'child', age: CHILD_SCHOOL_AGE, hunger: 0, room: 0 });
  ok(lessonsLeft(t) === 1, 'a school-age child adds a lesson');
  t.hour = 15; ok(!canStartLesson(t).ok, 'school closes at 3pm');
}

console.log('— neighbours —');
{
  const t = newGame('N'); moveHouse(t, 'flat');
  const before = t.coins;
  r = visitNeighbour(t, 'patel', makeRng(1));
  ok(r.ok && r.gift && (r.gift.coins ? t.coins > before : vanItems(t).length === 1), 'first visit of the day brings a gift');
  r = visitNeighbour(t, 'patel', makeRng(1));
  ok(r.ok && r.gift === null, 'second visit the same day: no gift');
}

console.log('— night —');
{
  const t = newGame('Z'); moveHouse(t, 'flat');
  ok(!canSleep(t), 'too early to sleep at 8am');
  advanceTime(t, 12); ok(canSleep(t) && isNight(t) && t.hour === 20, 'evening: can sleep');
  advanceTime(t, 5); ok(t.hour === HOURS.LATEST, 'time never passes 10pm');
  t.coins += 500; buyItem(t, 'bed'); buyItem(t, 'cot'); placeItem(t, 2, 'floor', 0, 'bed'); placeItem(t, 2, 'floor', 1, 'cot');
  newBaby(t, 'Bo'); buyPet(t, 'cat', 'Tom'); t.pets[0].fun = 3; t.visitedToday.push('rose'); t.lessonsToday = 2;
  r = sleep(t, makeRng(1));
  ok(r.ok && t.day === 2 && t.hour === HOURS.START && t.lessonsToday === 0 && t.visitedToday.length === 0, 'morning: new day, lessons and visits reset');
  ok(r.report.happyBonus === 4, 'happy pet + happy baby = 4 coin bonus');
  ok(t.pets[0].hunger === 1 && t.pets[0].fun === 2 && t.family[0].hunger === 1 && t.family[0].age === 1, 'everyone a bit hungrier, baby a day older');
  ok(r.report.burglar === null && r.report.burglars.length === 0, 'no burglars on the very first night');
  for (let i = 0; i < BABY_GROWS_AT - 1; i++) sleep(t, makeRng(100));
  ok(t.family[0].stage === 'child', `baby grows into a child after ${BABY_GROWS_AT} days`);
  // burglary: find a seed that produces a burglar with no security
  const u = newGame('U'); moveHouse(u, 'flat'); u.day = BURGLAR_GRACE_DAYS; u.coins += 500; buyItem(u, 'bed'); placeItem(u, 2, 'floor', 0, 'bed');
  let seed = 1; let rep;
  for (; seed < 200; seed++) { const c = JSON.parse(serialize(u)); rep = sleep(c, makeRng(seed)).report; if (rep.burglar && rep.burglar.outcome === 'robbed') break; }
  ok(seed < 200 && rep.burglar.item === 'bed', 'with no security a burglar steals your only item');
  const v = JSON.parse(serialize(u)); buyItem(v, 'camera'); buyItem(v, 'alarm'); placeItem(v, 0, 'wall', 0, 'camera'); placeItem(v, 0, 'wall', 1, 'alarm');
  const coinsBefore = v.coins;
  rep = sleep(v, makeRng(seed)).report;
  ok(rep.burglars.length >= 1 && rep.burglars.every(b => b.outcome === 'caught') && v.coins === coinsBefore + (20 + 5 * 2) * rep.burglars.length && v.house.rooms[2].floorSlots[0] === 'bed', `camera + alarm catch the same night's burglar${rep.burglars.length > 1 ? 's' : ''} and earn a reward each`);
  const w = JSON.parse(serialize(u)); buyItem(w, 'doorbell'); placeItem(w, -1, 'garden', 0, 'doorbell');
  rep = sleep(w, makeRng(seed)).report;
  ok(rep.burglar && rep.burglar.outcome === 'scared' && w.house.rooms[2].floorSlots[0] === 'bed', 'a doorbell camera alone scares them off');
  const d = JSON.parse(serialize(u)); d.coins += 1000; buyPet(d, 'dragon', 'Ember');
  rep = sleep(d, makeRng(seed)).report;
  ok(rep.burglar && rep.burglar.outcome === 'caught', 'a dragon catches burglars by itself');
  // burglars are frequent, and posh houses attract two
  let nights = 0, visits = 0, doubles = 0;
  for (let sd = 1; sd <= 200; sd++) { const c = JSON.parse(serialize(d)); const rp = sleep(c, makeRng(sd)).report; nights++; visits += rp.burglars.length; if (rp.burglars.length === 2) doubles++; }
  ok(visits >= nights, `a burglar every night (${(visits / nights).toFixed(2)} per night at the flat)`);
  const castle = newGame('C'); castle.coins = 20000; moveHouse(castle, 'castle'); castle.day = BURGLAR_GRACE_DAYS; let cd = 0;
  for (let sd = 1; sd <= 200; sd++) { const c = JSON.parse(serialize(castle)); if (sleep(c, makeRng(sd)).report.burglars.length === 2) cd++; }
  ok(cd > doubles && cd > 60, `the castle gets two burglars in a night far more often than the flat (${cd} vs ${doubles} of 200)`);
}

console.log('— burglar traps —');
{
  const t = newGame('T'); moveHouse(t, 'flat'); t.coins += 1000; t.day = BURGLAR_GRACE_DAYS;
  buyItem(t, 'bed'); placeItem(t, 2, 'floor', 0, 'bed');
  buyItem(t, 'cagetrap'); buyItem(t, 'nettrap'); buyItem(t, 'banana');
  ok(placeItem(t, 0, 'wall', 0, 'cagetrap').ok && placeItem(t, 1, 'floor', 0, 'nettrap').ok && placeItem(t, 3, 'floor', 0, 'banana').ok, 'traps go on walls and floors');
  ok(trapInRoom(t.house, 0) === 'cage' && trapInRoom(t.house, 1) === 'net' && trapInRoom(t.house, 3) === 'banana' && trapInRoom(t.house, 2) === null && trapCount(t.house) === 2, 'trapInRoom finds the right trap per room');
  ok(securityScore(t) === 0, 'traps do not add security points: they only guard their own room');
  let trapped = null, slipped = null, robbed = null;
  for (let sd = 1; sd < 300 && !(trapped && slipped && robbed); sd++) {
    const c = JSON.parse(serialize(t)); const rep = sleep(c, makeRng(sd)).report;
    for (const b of rep.burglars) { if (b.outcome === 'trapped' && !trapped) trapped = { c, b }; if (b.outcome === 'slipped' && !slipped) slipped = { c, b }; if (b.outcome === 'robbed' && !robbed) robbed = { c, b }; }
  }
  ok(trapped && trapped.c.caged.length >= 1 && trapped.c.caged[0].room === trapped.b.room && ['cage', 'net'].includes(trapped.b.trap), 'a burglar entering a trapped room is caught and stays in the cage');
  ok(trapped && trapped.c.house.rooms[2].floorSlots[0] === 'bed' || !trapped, 'a trapped burglar takes nothing');
  ok(slipped && slipped.b.coins >= 5 && slipped.b.room === 3, 'the banana skin makes them slip and drop coins');
  ok(robbed && robbed.b.room === 2, 'the only room without a trap is where you get robbed');
  if (trapped) {
    const c = trapped.c; const n = c.caged.length; const coins = c.coins;
    const r = callPolice(c, 0);
    ok(r.ok && c.coins === coins + TRAP_REWARD && c.caged.length === n - 1 && c.stats.burglarsCaught >= 1, 'calling the police pays the reward and empties the trap');
    ok(!callPolice(c, 99).ok, 'no burglar, no reward');
    const d = JSON.parse(serialize(trapped.c)); d.hour = 20; const coins2 = d.coins; d.caged.push({ room: 0, trap: 'cage' }); const left = d.caged.length;
    const rep = sleep(d, makeRng(999)).report;
    ok(rep.collected === left && d.coins >= coins2 + left * TRAP_REWARD, 'burglars left in traps overnight are collected and paid for');
    const e = JSON.parse(serialize(trapped.c)); e.coins += 5000; e.caged.push({ room: 1, trap: 'net' }); const coins3 = e.coins, left2 = e.caged.length;
    moveHouse(e, 'terrace');
    ok(e.caged.length === 0 && e.coins === coins3 - (HOUSES[1].price - houseSalePrice(trapped.c.house)) + left2 * TRAP_REWARD, 'moving house hands trapped burglars to the police first');
  }
  const back = deserialize(serialize(t));
  ok(Array.isArray(back.caged), 'saves carry the caged list');
}

console.log('— camera footage and the criminal gallery —');
{
  const t = newGame('F'); moveHouse(t, 'flat'); t.coins += 1000; t.day = BURGLAR_GRACE_DAYS;
  buyItem(t, 'camera'); placeItem(t, 0, 'wall', 0, 'camera'); buyItem(t, 'cagetrap'); placeItem(t, 0, 'wall', 1, 'cagetrap'); buyItem(t, 'bed'); placeItem(t, 2, 'floor', 0, 'bed');
  ok(cameraFor(t.house, 0) === 'Living Room camera' && cameraFor(t.house, 2) === null, 'a wall camera records its own room only');
  buyItem(t, 'doorbell'); placeItem(t, -1, 'garden', 0, 'doorbell');
  ok(cameraFor(t.house, 2) === 'Doorbell camera', 'a doorbell camera records every burglar');
  removeItem(t, -1, 'garden', 0);
  let withClip = null, without = null;
  for (let sd = 1; sd < 300 && !(withClip && without); sd++) {
    const c = JSON.parse(serialize(t)); const rep = sleep(c, makeRng(sd)).report;
    for (const b of rep.burglars) { if (b.room === 0 && !withClip) withClip = { c, b }; if (b.room === 2 && !without) without = { c, b }; }
  }
  ok(withClip && withClip.b.clip === 0 && withClip.c.footage[0].outcome === 'trapped' && withClip.c.footage[0].cam === 'Living Room camera' && withClip.c.footage[0].trap === 'cage', 'a burglar caught on camera leaves a clip of the trap springing');
  ok(without && without.b.clip === undefined && !without.c.footage.some(f => f.room === 2), 'no camera in the bedroom, no clip');
  const c = withClip.c; const r = saveClip(c, 0);
  ok(r.ok && c.gallery.length === 1 && c.footage[0].saved && c.gallery[0].day === c.day - 1, 'saving a clip puts it in the gallery');
  ok(!saveClip(c, 0).ok && !saveClip(c, 9).ok, 'cannot save the same clip twice or a missing one');
  const back = deserialize(serialize(c));
  ok(back.gallery.length === 1 && back.footage.length >= 1, 'the gallery and last night\'s footage survive a save');
  c.hour = 20; sleep(c, makeRng(5));
  ok(c.gallery.length >= 1 && !c.footage.some(f => f.day === c.day - 2), 'a new night replaces last night\'s footage but keeps the gallery');
  for (let i = 0; i < GALLERY_MAX + 2; i++) { c.footage = [{ id: 'x' + i, day: 1, outcome: 'scared' }]; saveClip(c, 0); }
  ok(c.gallery.length === GALLERY_MAX, 'the gallery has a limit');
  ok(deleteClip(c, 0).ok && c.gallery.length === GALLERY_MAX - 1 && !deleteClip(c, 99).ok, 'clips can be deleted');
}

console.log('— save / load —');
{
  const json = serialize(s);
  const back = deserialize(json);
  ok(back.name === 'Elliott' && back.pets[0].name === 'Biscuit' && back.family[0].name === 'Mia' && back.house.rooms[0].wallpaper === 'stars', 'round trip keeps the house, pets and family');
  let threw = false; try { deserialize('{"x":1}'); } catch { threw = true; }
  ok(threw, 'bad saves are rejected');
}

console.log(fails ? `\n${fails} FAILED` : '\nAll tests passed');
process.exit(fails ? 1 : 0);
