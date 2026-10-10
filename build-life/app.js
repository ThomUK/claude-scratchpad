// Build Life — UI. Screens, navigation, modals and saving. Game rules live in engine.js, drawings in art.js.
import * as E from './engine.js?v=dev';
import * as A from './art.js?v=dev';

const $ = s => document.querySelector(s);
const app = $('#app'), hud = $('#hud'), modal = $('#modal'), modalBox = $('#modalBox'), toastEl = $('#toast');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const arg = v => esc(JSON.stringify(v));

// ───────────────────────── storage ─────────────────────────
const PKEY = 'buildlife.profiles';
const profiles = () => { try { return JSON.parse(localStorage.getItem(PKEY) || '[]'); } catch { return []; } };
const saveProfiles = list => localStorage.setItem(PKEY, JSON.stringify(list));
const saveKey = name => 'buildlife.save.' + name.toLowerCase();
function save() { if (!S) return; try { localStorage.setItem(saveKey(S.name), E.serialize(S)); } catch { } }
function load(name) { try { const j = localStorage.getItem(saveKey(name)); return j ? E.deserialize(j) : null; } catch { return null; } }

// ───────────────────────── state ─────────────────────────
let S = null, screen = 'start', ui = {}, lesson = null, toastTimer = 0;
const night = () => E.isNight(S);
const evening = () => S.hour >= 17 && S.hour < E.HOURS.NIGHT;
const ctx = () => ({ hour: S.hour, night: night(), evening: evening() });
function toast(msg, ms = 2600) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms); }
function openModal(html) { modalBox.innerHTML = html; modal.hidden = false; }
function closeModal() { modal.hidden = true; modalBox.innerHTML = ''; }

const TIMED = { furniture: 1, gadget: 1, garden: 1, pets: 1, hospital: 1, estate: 1, neighbours: 0.5 };
function go(where, a = null) {
  if (S && TIMED[where] && screen !== where) E.advanceTime(S, TIMED[where]);
  screen = where; ui = { a };
  closeModal(); render();
  window.scrollTo(0, 0);
}

// ───────────────────────── render ─────────────────────────
function render() {
  if (S) save();
  hud.hidden = !S || screen === 'start';
  if (S && screen !== 'start') hud.innerHTML = `<a class="home" href="../" title="All toy models">⌂</a><span class="name">${esc(S.name)}</span><span class="pill coins">🪙 ${S.coins}</span><span class="pill">Day ${S.day}</span><span class="pill">${night() ? '🌙' : evening() ? '🌇' : '☀️'} ${E.clockText(S)}</span><span class="spacer"></span><button data-act="help">? Help</button><button data-act="switch">Players</button>`;
  const fn = SCREENS[screen] || SCREENS.start;
  app.innerHTML = fn();
}
function nav(...btns) { return `<div class="nav">${btns.filter(Boolean).map(([label, act, a, cls]) => `<button class="${cls || 'alt'}" data-act="${act}" data-arg='${arg(a ?? null)}'>${label}</button>`).join('')}</div>`; }
const navHome = () => ['🏠 Home', 'go', 'home'];
const navTown = () => [E.tooLate(S) ? '🏙 Town (closed, bedtime!)' : '🏙 Town', 'go', 'town'];
const bedBtn = () => E.canSleep(S) ? ['🌙 Go to bed', 'sleep', null, 'warm'] : null;

function meter(label, cls) { return `<span class="meter ${cls}">${label}</span>`; }
function secMeter() { const sc = E.securityScore(S); const lbl = E.securityLabel(sc); return meter(`🔒 Security: ${lbl} (${sc})`, sc >= 3 ? 'ok' : sc >= 1 ? 'warn' : 'bad'); }

const SCREENS = {
  start() {
    const list = profiles();
    return `<div class="screen start">
      <div class="logo">Build Life<small>Buy a house. Decorate it. Go to school to earn coins. Fill it with pets and family.</small></div>
      ${list.length ? `<h3>Who is playing?</h3><div class="profiles">${list.map(n => { const g = load(n); return `<button data-act="play" data-arg='${arg(n)}'>${A.personSvg('adult', n, 1)}<span>${esc(n)}</span><small>${g ? `Day ${g.day} · ${g.house ? E.houseType(g.house).name : 'no home yet'} · 🪙 ${g.coins}` : 'new'}</small></button>`; }).join('')}</div>` : ''}
      <div class="panel"><h3>${list.length ? 'New player' : 'Type your name to start'}</h3><div class="row" style="justify-content:center"><input type="text" id="newName" maxlength="16" placeholder="Your name" autocomplete="off" /><button data-act="newPlayer">Start ▶</button></div><p class="muted">Each player gets their own house, coins and family, saved on this device.</p></div>
      ${list.length ? `<p class="muted"><button class="alt small" data-act="deleteProfile">Remove a player…</button></p>` : ''}
    </div>`;
  },
  home() {
    if (!S.house) { screen = 'estate'; return SCREENS.estate(true); }
    const late = E.tooLate(S);
    return `<div class="screen">
      ${late ? `<div class="panel" style="background:#f7e7c4"><b>It is 10 o'clock at night.</b> Everyone is yawning. Time for bed!</div>` : ''}
      <div class="stage ${night() ? 'night' : ''}">${A.interiorSvg(S.house, { ...ctx(), interactive: true, pets: S.pets, family: S.family, player: { name: S.name, room: S.house.rooms.reduce((best, r, i) => r.w > S.house.rooms[best].w ? i : best, 0) } })}</div>
      <div class="panel"><div class="row">${secMeter()}${S.pets.length ? meter(`🐾 ${S.pets.length} pet${S.pets.length > 1 ? 's' : ''}${S.pets.some(p => p.hunger >= 2) ? ' · hungry!' : ''}`, S.pets.every(E.petHappy) ? 'ok' : 'warn') : ''}${S.family.length ? meter(`👪 ${S.family.length} in the family${S.family.some(p => p.hunger >= 2) ? ' · hungry!' : ''}`, S.family.every(E.personHappy) ? 'ok' : 'warn') : ''}<span class="spacer" style="flex:1"></span><button class="alt small" data-act="van">🚚 Van (${E.vanItems(S).reduce((a, v) => a + v.n, 0)})</button></div>
      <p class="muted">Tap a dotted <b>+</b> to put something from the van there. Tap furniture to move or sell it. Tap a room name to change the wallpaper and floor. Tap pets and people to look after them.</p></div>
      ${nav(['🌳 Outside', 'go', 'outside'], late ? null : navTown(), bedBtn())}
      ${S.log.length ? `<div class="panel log">${S.log.slice(0, 6).map(l => `<div>Day ${l.day}: ${esc(l.msg)}</div>`).join('')}</div>` : ''}
    </div>`;
  },
  outside() {
    const t = E.houseType(S.house);
    return `<div class="screen">
      <div class="stage sky ${night() ? 'night' : ''}">${A.exteriorSvg(S.house, { ...ctx(), interactive: true })}</div>
      <div class="panel"><div class="row"><b>${esc(t.name)}</b> · ${esc(t.gardenName)}<span style="flex:1"></span><button class="alt small" data-act="paint" data-arg='"wall"'>🎨 Walls</button><button class="alt small" data-act="paint" data-arg='"roof"'>🎨 Roof</button><button class="alt small" data-act="paint" data-arg='"door"'>🎨 Front door</button></div>
      <p class="muted">Tap a dotted <b>+</b> on the grass to place something from the garden centre. Lanterns light up at night.</p></div>
      ${nav(['🚪 Go inside', 'go', 'home'], E.tooLate(S) ? null : navTown(), E.tooLate(S) ? null : ['🏘 Neighbours', 'go', 'neighbours'], bedBtn())}
    </div>`;
  },
  town() {
    const late = E.tooLate(S), shopsOpen = S.hour >= 8 && S.hour < E.HOURS.SHOPS_CLOSE;
    const d = (label, ico, where, open, note, a) => `<button class="${open ? '' : 'closed'}" data-act="go" data-arg='${arg(where)}' ${a ? `data-a='${arg(a)}'` : ''}><span class="ico">${ico}</span>${label}<small>${note}</small></button>`;
    return `<div class="screen">
      <div class="panel"><h2>Town</h2><p class="muted">Where would you like to go? ${late ? '<b>Everything is shut — it is bedtime.</b>' : ''}</p></div>
      <div class="dest">
        ${d('Home', '🏠', 'home', true, S.house ? E.houseType(S.house).name : 'no home yet')}
        ${d('School', '🏫', 'school', E.schoolOpen(S) && !late, E.schoolOpen(S) ? `${E.lessonsLeft(S)} lesson${E.lessonsLeft(S) === 1 ? '' : 's'} left today` : 'open 8am – 3pm')}
        ${d('Furniture Shop', '🛋', 'furniture', shopsOpen, shopsOpen ? 'beds, sofas, pianos…' : 'open 8am – 6pm')}
        ${d('Gadget Shop', '📺', 'gadget', shopsOpen, shopsOpen ? 'screens & cameras' : 'open 8am – 6pm')}
        ${d('Pet Shop', '🐶', 'pets', shopsOpen, shopsOpen ? 'pets & pet food' : 'open 8am – 6pm')}
        ${d('Garden Centre', '🌳', 'garden', shopsOpen, shopsOpen ? 'trees, ponds, trampolines' : 'open 8am – 6pm')}
        ${d('Hospital', '🏥', 'hospital', !late, 'new babies come from here')}
        ${d('Estate Agent', '🏡', 'estate', shopsOpen, shopsOpen ? 'buy & sell houses' : 'open 8am – 6pm')}
        ${d('Neighbours', '🏘', 'neighbours', !late, 'visit nearby families')}
      </div>
      ${nav(bedBtn())}
    </div>`;
  },
  furniture() { return shopScreen('Furniture Shop', '🛋', 'furniture', 'Everything to make a house a home.'); },
  gadget() { return shopScreen('Gadget Shop', '📺', 'gadget', 'Screens to watch and cameras that catch burglars. Security points add up: 3 or more catches a burglar.'); },
  garden() { return shopScreen('Garden Centre', '🌳', 'garden', 'Things for the garden. Place them from the Outside view.'); },
  pets() {
    const open = S.hour >= 8 && S.hour < E.HOURS.SHOPS_CLOSE;
    return `<div class="screen"><div class="panel"><h2>🐶 Pet Shop</h2><p class="muted">${open ? 'Every pet needs feeding and playing with. Dogs, parrots and dragons also guard the house.' : '<b>Closed.</b> Open 8am – 6pm.'} You have <b>${E.mealsLeft(S)}</b> pet meals.</p></div>
      <div class="grid">${E.PETS.map(p => `<div class="card ${S.coins < p.price ? 'off' : ''}"><div class="art">${A.petSvg(p.id, 66)}</div><div class="nm">${p.name}</div><div class="muted" style="font-size:13px">${p.security ? `🔒 ${p.security} security` : 'cuddly'}</div><div class="pr">🪙 ${p.price}</div><button class="small" data-act="buyPet" data-arg='${arg(p.id)}' ${!open || S.coins < p.price ? 'disabled' : ''}>Choose</button></div>`).join('')}
      ${itemCard('petfood', open)}</div>
      ${nav(navTown(), navHome())}</div>`;
  },
  hospital() {
    const c = E.canHaveBaby(S);
    return `<div class="screen"><div class="panel"><h2>🏥 Hospital</h2><div class="speech">${c.ok ? 'Hello! Would you like to take a new baby home today? Babies need a bottle every day, and after a few days they grow into children who can come to school with you.' : esc(c.msg)}</div>
      ${c.ok ? `<div class="row" style="margin-top:12px"><input type="text" id="babyName" maxlength="14" placeholder="Baby's name" autocomplete="off" /><button data-act="newBaby">Bring the baby home 🍼</button></div>` : ''}
      <p class="muted" style="margin-top:12px">Nobody is ever poorly for long in Build Life, and people never die. The hospital is mostly for babies and the odd plaster.</p></div>
      ${nav(navTown(), navHome())}</div>`;
  },
  estate(intro = false) {
    const sale = E.houseSalePrice(S.house);
    const open = S.hour >= 8 && S.hour < E.HOURS.SHOPS_CLOSE;
    return `<div class="screen"><div class="panel"><h2>🏡 Estate Agent</h2>
      ${!S.house ? `<div class="speech">Welcome to Build Life, ${esc(S.name)}! First you need somewhere to live. You have <b>🪙 ${S.coins}</b>, which is enough for the Small Flat. Go to school to earn coins and you can move up to something bigger later.</div>` : `<p>You live in the <b>${E.houseType(S.house).name}</b>. Decorated as it is, it would sell for <b>🪙 ${sale}</b>${sale > E.houseType(S.house).price ? ` (that is ${sale - E.houseType(S.house).price} more than you paid, because you decorated it!)` : ' — decorate the rooms and garden to make it worth more'}. When you move, all your furniture, pets and family come with you in the van.</p>`}
      ${!open && S.house ? '<p><b>Closed.</b> Open 8am – 6pm.</p>' : ''}</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">${E.HOUSES.map(h => { const cost = h.price - sale; const mine = S.house && S.house.type === h.id; const can = !mine && cost <= S.coins && (open || !S.house); return `<div class="card ${mine ? '' : can ? '' : 'off'}"><div class="art">${A.houseThumb(h.id, mine ? S.house.paint : null)}</div><div class="nm">${h.name}</div><p class="muted" style="font-size:13px;margin:0">${h.blurb}</p><div class="pr">🪙 ${h.price}</div>${mine ? '<span class="meter ok">You live here</span>' : `<button class="small ${can ? '' : 'alt'}" data-act="moveHouse" data-arg='${arg(h.id)}' ${can ? '' : 'disabled'}>${S.house ? (cost <= 0 ? `Move in (get 🪙 ${-cost} back)` : can ? `Move in for 🪙 ${cost}` : `Need 🪙 ${cost - S.coins} more`) : can ? 'Move in' : `Need 🪙 ${cost - S.coins} more`}</button>`}</div>`; }).join('')}</div>
      ${S.house ? nav(navTown(), navHome()) : ''}</div>`;
  },
  neighbours() {
    return `<div class="screen"><div class="panel"><h2>🏘 Neighbours</h2><p class="muted">Pop round to see how other families have decorated. Helping out usually earns a little thank-you (once a day).</p></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${E.NEIGHBOURS.map(n => `<div class="card"><div class="art">${A.houseThumb(n.house, n.paint)}</div><div class="nm">${n.name}</div><div class="muted" style="font-size:13px">${E.HOUSES.find(h => h.id === n.house).name} · ${n.pets.map(p => E.PET[p[0]].name.toLowerCase()).join(' & ')}</div><button class="small" data-act="visit" data-arg='${arg(n.id)}'>Visit ${S.visitedToday.includes(n.id) ? '(again)' : ''}</button></div>`).join('')}</div>
      ${nav(navTown(), navHome())}</div>`;
  },
  visit() {
    const n = E.NEIGHBOURS.find(x => x.id === ui.a.id); const h = E.neighbourHouse(n);
    const pets = n.pets.map(([type, name], i) => ({ type, name, hunger: 0, fun: 3, room: (i * 3) % h.rooms.length }));
    return `<div class="screen"><div class="speech">💬 <b>${n.name}:</b> ${esc(n.greeting)}${ui.a.msg ? `<br><span class="muted">${esc(ui.a.msg)}</span>` : ''}</div>
      <div class="stage ${night() ? 'night' : ''}">${A.interiorSvg(h, { ...ctx(), pets, player: { name: S.name, room: h.rooms.length - 1 } })}</div>
      ${nav(['⬅ Other neighbours', 'go', 'neighbours'], navHome())}</div>`;
  },
  school() {
    if (lesson) return lessonScreen();
    const c = E.canStartLesson(S);
    return `<div class="screen"><div class="panel"><h2>🏫 School</h2>
      ${c.ok ? `<p>Pick a subject and how hard you want it. Every right answer earns coins: <b>Easy 3</b>, <b>Medium 5</b>, <b>Hard 8</b>, plus a <b>${E.PERFECT_BONUS} coin bonus</b> for getting all ${E.QUESTIONS_PER_LESSON} right. You have <b>${E.lessonsLeft(S)}</b> lesson${E.lessonsLeft(S) === 1 ? '' : 's'} left today${E.childrenAtSchoolAge(S) ? ` (your children at school add ${E.childrenAtSchoolAge(S)})` : ''}.</p>
        <h3>Subject</h3><div class="row">${E.SUBJECTS.map(s => `<button class="${ui.subject === s.id ? '' : 'alt'}" data-act="pick" data-arg='${arg(['subject', s.id])}'>${s.name}<br><small style="font-weight:400">${s.blurb}</small></button>`).join('')}</div>
        <h3 style="margin-top:12px">Level</h3><div class="row">${E.LEVELS.map(l => `<button class="${ui.level === l.id ? '' : 'alt'}" data-act="pick" data-arg='${arg(['level', l.id])}'>${l.name} · ${l.coins} coins each</button>`).join('')}</div>
        <div style="margin-top:16px"><button class="gold" data-act="startLesson" ${ui.subject && ui.level ? '' : 'disabled'}>Start the lesson ▶</button></div>` : `<div class="speech">${esc(c.msg)}</div>`}
      <p class="muted" style="margin-top:10px">Lessons: ${S.stats.lessons} · Right answers: ${S.stats.correct} · Coins earned so far: ${S.stats.coinsEarned}</p></div>
      ${nav(navTown(), navHome())}</div>`;
  },
  morning() {
    const r = ui.a;
    return `<div class="screen"><div class="panel"><h2>☀️ Good morning! It is day ${S.day}.</h2>
      ${(r.burglars || []).length ? r.burglars.map(b => `<div class="speech burglar ${b.outcome}"><div>${A.burglarSvg(b.outcome)}</div><div>${b.outcome === 'robbed' ? '🥷' : b.outcome === 'caught' ? '👮' : '😮'} ${esc(b.msg)}</div></div>`).join('') : '<p>🌙 Everyone slept soundly. No burglars tonight.</p>'}
      ${r.happyBonus ? `<p>😊 Your happy pets and family found <b>🪙 ${r.happyBonus}</b> for you.</p>` : ''}
      ${r.grown.map(n => `<p>🎉 <b>${esc(n)}</b> has grown from a baby into a child!</p>`).join('')}
      ${r.cries.length ? `<p>🍼 ${r.cries.map(esc).join(' and ')} ${r.cries.length > 1 ? 'are' : 'is'} hungry. Tap them at home to feed them.</p>` : ''}
      ${r.hungryPets.length ? `<p>🍖 ${r.hungryPets.map(esc).join(' and ')} ${r.hungryPets.length > 1 ? 'want' : 'wants'} breakfast.</p>` : ''}
      </div>${nav(['Start the day ▶', 'go', 'home', 'gold'])}</div>`;
  },
};

function itemCard(id, open) {
  const it = E.ITEM[id]; const can = open && S.coins >= it.price; const n = E.vanCount(S, id);
  return `<div class="card ${can ? '' : 'off'}"><div class="art">${A.itemSvg(id, ctx())}</div><div class="nm">${it.name}</div><div class="muted" style="font-size:13px">${it.security ? `🔒 ${it.security} security` : it.bed ? '🛏 someone can sleep here' : it.cot ? '👶 needed for a baby' : it.light ? '💡 lights up at night' : it.kind === 'wall' ? 'goes on a wall' : it.kind === 'garden' ? 'goes outside' : it.size === 2 ? 'needs two floor spaces' : 'goes on the floor'}${n ? ` · ${n} in van` : ''}</div><div class="pr">🪙 ${it.price}</div><button class="small" data-act="buy" data-arg='${arg(id)}' ${can ? '' : 'disabled'}>Buy</button></div>`;
}
function shopScreen(title, ico, cat, blurb) {
  const open = S.hour >= 8 && S.hour < E.HOURS.SHOPS_CLOSE;
  const items = E.ITEMS.filter(i => i.cat === cat);
  return `<div class="screen"><div class="panel"><div class="row"><h2 style="margin:0">${ico} ${title}</h2><span style="flex:1"></span><button class="alt small" data-act="van">🚚 Van (${E.vanItems(S).reduce((a, v) => a + v.n, 0)})</button></div><p class="muted">${open ? blurb : '<b>Closed.</b> Open 8am – 6pm. You can still look.'}</p></div>
    <div class="grid">${items.map(i => itemCard(i.id, open)).join('')}</div>
    ${nav(navTown(), navHome())}</div>`;
}

// ───────────────────────── lesson UI ─────────────────────────
function lessonScreen() {
  const L = lesson;
  if (L.done && !ui.feedback) {
    const n = L.questions.length;
    return `<div class="screen lesson"><div class="panel" style="text-align:center"><h2>Lesson finished!</h2><div class="big">${L.correct} / ${n}</div><p>${L.perfect ? '🌟 Perfect! Every answer right, so you get the bonus.' : L.correct >= n - 1 ? 'Brilliant work!' : L.correct >= n / 2 ? 'Good effort — keep practising!' : 'Tricky one. Try an easier level next time to build up coins faster.'}</p>
      <div class="big" style="color:var(--accent2)">🪙 ${L.coins}</div><div class="dots">${L.results.map(r => `<i class="${r ? 'ok' : 'no'}"></i>`).join('')}</div>
      <p style="margin-top:16px"><button class="gold" data-act="collect">Collect your coins 🪙</button></p></div></div>`;
  }
  const fb = ui.feedback;
  const q = L.questions[fb ? L.index - 1 : L.index];
  const sub = E.SUBJECTS.find(s => s.id === L.subject).name;
  const shown = fb ? L.index - 1 : L.index;
  const dots = `<div class="dots">${L.questions.map((_, i) => `<i class="${i < shown ? (L.results[i] ? 'ok' : 'no') : i === shown ? 'now' : ''}"></i>`).join('')}</div>`;
  let body = '';
  if (q.kind === 'choice') {
    body = `<div class="opts">${q.options.map((o, i) => `<button data-act="answer" data-arg='${arg(i)}' ${fb ? 'disabled' : ''} class="${fb && i === q.answer ? 'right' : fb && fb.given === i ? 'wrong' : ''}">${esc(o)}</button>`).join('')}</div>`;
  } else {
    const seq = ui.seq || [];
    body = `<div class="answerline">${seq.length ? seq.map(i => `<span>${esc(q.tiles[i])}</span>`).join('') : `<span class="muted" style="background:none;border:0;font-size:16px;font-weight:400">${q.kind === 'build' ? 'Tap the letters in order' : 'Tap the tiles in order'}</span>`}</div>
      <div class="tiles">${q.tiles.map((t, i) => `<button class="${seq.includes(i) ? 'used' : ''}" data-act="tile" data-arg='${arg(i)}' ${fb || seq.includes(i) ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>
      ${fb ? '' : `<div class="row" style="justify-content:center"><button class="alt small" data-act="undo" ${seq.length ? '' : 'disabled'}>↶ Undo</button><button class="alt small" data-act="clearSeq" ${seq.length ? '' : 'disabled'}>Clear</button></div>`}`;
  }
  return `<div class="screen lesson"><div class="panel"><div class="row"><b>${sub}</b> · ${E.LEVELS.find(l => l.id === L.level).name}<span style="flex:1"></span><span class="pill" style="background:#eee;border-radius:999px;padding:4px 12px">🪙 ${L.coins}</span></div>${dots}
    <div class="q">${esc(q.prompt)}</div>${body}
    ${fb ? `<div class="speech" style="margin-top:14px;background:${fb.correct ? '#d9eedc' : '#f3d6d6'}">${fb.correct ? `✅ Right! +${fb.coins} coins` : `❌ Not quite. The answer is <b>${esc(fb.correctAnswer)}</b>`}</div><p style="text-align:center;margin-top:12px"><button class="gold" data-act="next">${L.done ? 'See your score ▶' : 'Next question ▶'}</button></p>` : ''}
    </div></div>`;
}
function submitAnswer(given) {
  const r = E.answerQuestion(lesson, given);
  if (!r.ok) return;
  ui.feedback = { ...r, given };
  render();
}

// ───────────────────────── modals ─────────────────────────
function fits(kind, room, slot, id) {
  if (kind !== 'floor') return true;
  const slots = S.house.rooms[room].floorSlots, size = E.ITEM[id].size || 1;
  if (slot + size > slots.length) return false;
  for (let i = 0; i < size; i++) if (slots[slot + i]) return false;
  return true;
}
function pickerModal(kind, room, slot) {
  const all = E.vanItems(S, kind);
  const items = all.filter(v => fits(kind, room, slot, v.id));
  const tooBig = all.filter(v => !fits(kind, room, slot, v.id));
  const where = kind === 'garden' ? 'outside' : kind === 'wall' ? 'on the wall' : 'on the floor';
  openModal(`<h3>What goes here?</h3><p class="muted">Things in your van that go ${where}.</p>
    ${items.length ? `<div class="grid">${items.map(v => `<div class="card"><div class="art">${A.itemSvg(v.id, ctx())}</div><div class="nm">${v.item.name}${v.n > 1 ? ` ×${v.n}` : ''}</div><button class="small" data-act="place" data-arg='${arg([room, kind, slot, v.id])}'>Put it here</button></div>`).join('')}</div>` : all.length ? '' : `<div class="speech">Your van is empty of things that go ${where}. ${E.tooLate(S) ? 'Go to bed and visit the shops tomorrow.' : `Visit the ${kind === 'garden' ? 'Garden Centre' : 'Furniture or Gadget shop'} in town.`}</div>`}
    ${tooBig.length ? `<p class="muted" style="margin-top:10px">Too big for this spot (needs two empty spaces side by side): ${tooBig.map(v => esc(v.item.name)).join(', ')}.</p>` : ''}
    <div class="row" style="margin-top:14px">${items.length || E.tooLate(S) ? '' : `<button data-act="go" data-arg='${arg(kind === 'garden' ? 'garden' : 'furniture')}'>Go shopping</button>`}<button class="alt" data-act="closeModal">Close</button></div>`);
}
function placedModal(kind, room, slot) {
  let id;
  if (kind === 'garden') id = S.house.garden[slot];
  else { const slots = kind === 'floor' ? S.house.rooms[room].floorSlots : S.house.rooms[room].wallSlots; id = slots[slot]; if (id && id.startsWith('@')) id = slots[Number(id.slice(1))]; }
  const it = E.ITEM[id];
  openModal(`<div class="row"><div class="art">${A.itemSvg(id, ctx())}</div><div><h3>${it.name}</h3><p class="muted">${it.security ? `Adds ${it.security} security. ` : ''}${it.light ? 'Lights up at night. ' : ''}Worth 🪙 ${Math.floor(it.price / 2)} if you sell it.</p></div></div>
    <div class="row" style="margin-top:14px"><button data-act="remove" data-arg='${arg([room, kind, slot])}'>🚚 Put in the van</button><button class="danger" data-act="sellPlaced" data-arg='${arg([room, kind, slot, id])}'>Sell for 🪙 ${Math.floor(it.price / 2)}</button><button class="alt" data-act="closeModal">Close</button></div>`);
}
function roomModal(room) {
  const r = S.house.rooms[room];
  openModal(`<h3>${esc(r.name)}</h3><p class="muted">Wallpaper</p><div class="swatches">${E.WALLPAPERS.map(w => `<div class="swatch ${r.wallpaper === w.id ? 'sel' : ''}" style="background:${w.color}" data-act="wallpaper" data-arg='${arg([room, w.id])}' title="${w.name}"><span style="background:rgba(255,255,255,.7);width:100%;text-align:center">${w.name}</span></div>`).join('')}</div>
    <p class="muted" style="margin-top:12px">Floor</p><div class="swatches">${E.FLOORS.map(f => `<div class="swatch ${r.flooring === f.id ? 'sel' : ''}" style="background:${f.color}" data-act="flooring" data-arg='${arg([room, f.id])}' title="${f.name}"><span style="background:rgba(255,255,255,.7);width:100%;text-align:center">${f.name}</span></div>`).join('')}</div>
    <div class="row" style="margin-top:14px"><button data-act="closeModal">Done</button></div>`);
}
function paintModal(part) {
  openModal(`<h3>Paint the ${part === 'wall' ? 'walls' : part}</h3><div class="swatches">${E.PAINTS[part].map(c => `<div class="swatch ${S.house.paint[part] === c ? 'sel' : ''}" style="background:${c}" data-act="setPaint" data-arg='${arg([part, c])}'></div>`).join('')}</div><div class="row" style="margin-top:14px"><button data-act="closeModal">Done</button></div>`);
}
function vanModal() {
  const items = E.vanItems(S);
  openModal(`<h3>🚚 Your van</h3><p class="muted">Things you own that are not placed yet. Tap a dotted + at home to place them, or sell them here for half price.</p>
    ${items.length ? `<div class="grid">${items.map(v => `<div class="card"><div class="art">${A.itemSvg(v.id, ctx())}</div><div class="nm">${v.item.name}${v.n > 1 ? ` ×${v.n}` : ''}</div><div class="muted" style="font-size:13px">${v.item.kind === 'supply' ? 'feeds your pets' : `goes ${v.item.kind === 'garden' ? 'outside' : v.item.kind === 'wall' ? 'on a wall' : 'on the floor'}`}</div><button class="alt small" data-act="sellVan" data-arg='${arg(v.id)}'>Sell 🪙 ${Math.floor(v.item.price / 2)}</button></div>`).join('')}</div>` : '<div class="speech">The van is empty.</div>'}
    <div class="row" style="margin-top:14px"><button class="alt" data-act="closeModal">Close</button></div>`);
}
function petModal(i) {
  const p = S.pets[i], t = E.PET[p.type];
  const face = v => v >= 3 ? '😄' : v === 2 ? '🙂' : v === 1 ? '😐' : '😢';
  openModal(`<div class="row"><div>${A.petSvg(p.type, 90)}</div><div><h3>${esc(p.name)} the ${t.name.toLowerCase()}</h3><p>Tummy: ${p.hunger === 0 ? '😄 full' : p.hunger === 1 ? '🙂 peckish' : p.hunger === 2 ? '😐 hungry' : '😢 very hungry'}<br>Fun: ${face(p.fun)} ${['bored', 'a bit bored', 'content', 'delighted'][p.fun]}<br>Tricks learnt: ${p.tricks}${t.security ? `<br>🔒 Guards the house (+${t.security})` : ''}</p></div></div>
    <div class="row" style="margin-top:14px"><button data-act="feedPet" data-arg='${arg(i)}' ${p.hunger === 0 ? 'disabled' : ''}>🍖 Feed (${E.mealsLeft(S)} meals left)</button><button class="warm" data-act="playPet" data-arg='${arg(i)}'>🎾 Play</button><button class="alt" data-act="closeModal">Close</button></div>`);
}
function personModal(i) {
  const p = S.family[i];
  const grow = p.stage === 'baby' ? `Grows into a child in ${Math.max(0, E.BABY_GROWS_AT - p.age)} day${E.BABY_GROWS_AT - p.age === 1 ? '' : 's'}.` : p.age >= E.CHILD_SCHOOL_AGE ? '🏫 Old enough for school — adds a lesson every day!' : `Can start school in ${E.CHILD_SCHOOL_AGE - p.age} day${E.CHILD_SCHOOL_AGE - p.age === 1 ? '' : 's'}.`;
  openModal(`<div class="row"><div>${A.personSvg(p.stage, p.name, 1.6)}</div><div><h3>${esc(p.name)}</h3><p>${p.stage === 'baby' ? '👶 Baby' : '🧒 Child'}, ${p.age} day${p.age === 1 ? '' : 's'} old.<br>${p.hunger === 0 ? '😄 Full up' : p.hunger === 1 ? '🙂 A bit peckish' : p.hunger === 2 ? '😐 Hungry' : '😢 Very hungry'}<br>${grow}</p></div></div>
    <div class="row" style="margin-top:14px"><button data-act="feedPerson" data-arg='${arg(i)}' ${p.hunger === 0 ? 'disabled' : ''}>${p.stage === 'baby' ? '🍼 Give a bottle' : '🍝 Give dinner'}</button><button class="alt" data-act="closeModal">Close</button></div>`);
}
function helpModal() {
  openModal(`<h2>How to play</h2><ul class="help-list">
    <li><b>Earn coins at school.</b> Go to town → school, pick Maths, Words or The World and a level. Right answers pay coins; a perfect lesson pays a bonus. Three lessons a day (more when your children are old enough for school).</li>
    <li><b>Decorate.</b> Buy things in the shops. They go in your 🚚 van. At home, tap a dotted + to place them, tap a room name to change wallpaper and floor, and tap outside to paint the house and fill the garden.</li>
    <li><b>Pets</b> from the pet shop need feeding (buy pet food) and playing with. Happy pets do tricks and find coins. <b>Babies</b> come from the hospital once you own a cot; feed them and in a few days they grow up.</li>
    <li><b>Burglars</b> come most nights, and posh houses attract two at once. Security cameras, alarms, doorbell cameras, dogs, parrots and dragons add security points. 3 or more catches the burglar (and the police pay a reward). 1–2 scares them away. None… and something goes missing.</li>
    <li><b>Move house.</b> The estate agent buys your decorated house for more than you paid. Your furniture, pets and family move with you.</li>
    <li><b>Day and night.</b> Everything you do takes time. Shops shut at 6pm, school at 3pm. Go to bed in the evening to start a new day. Nobody in Build Life ever dies.</li></ul>
    <div class="row"><button data-act="closeModal">Got it</button></div>`);
}

// ───────────────────────── actions ─────────────────────────
const ACT = {
  play(name) { S = load(name) || E.newGame(name, E.makeRng(Date.now() % 1e9)); lesson = null; go(S.house ? 'home' : 'estate'); },
  newPlayer() {
    const name = ($('#newName').value || '').trim().slice(0, 16);
    if (!name) { toast('Type your name first!'); $('#newName').focus(); return; }
    const list = profiles();
    if (!list.some(n => n.toLowerCase() === name.toLowerCase())) { list.push(name); saveProfiles(list); }
    ACT.play(list.find(n => n.toLowerCase() === name.toLowerCase()));
  },
  deleteProfile() {
    const list = profiles();
    openModal(`<h3>Remove a player</h3><p class="muted">This deletes their house, coins and family for ever.</p><div class="row">${list.map(n => `<button class="danger" data-act="reallyDelete" data-arg='${arg(n)}'>Remove ${esc(n)}</button>`).join('')}<button class="alt" data-act="closeModal">Cancel</button></div>`);
  },
  reallyDelete(name) { saveProfiles(profiles().filter(n => n !== name)); localStorage.removeItem(saveKey(name)); closeModal(); render(); },
  switch() { save(); S = null; lesson = null; go('start'); },
  help() { helpModal(); },
  go(where) { if (where === 'town' && E.tooLate(S)) { toast('It is far too late. Time for bed!'); return; } go(where); },
  closeModal() { closeModal(); },
  van() { vanModal(); },
  buy(id) { const r = E.buyItem(S, id); toast(r.msg); render(); },
  sellVan(id) { const r = E.sellFromVan(S, id); toast(r.msg); render(); vanModal(); },
  place([room, kind, slot, id]) { const r = E.placeItem(S, room, kind, slot, id); if (!r.ok) toast(r.msg); closeModal(); render(); },
  remove([room, kind, slot]) { E.removeItem(S, room, kind, slot); closeModal(); render(); },
  sellPlaced([room, kind, slot, id]) { E.removeItem(S, room, kind, slot); const r = E.sellFromVan(S, id); toast(r.msg); closeModal(); render(); },
  wallpaper([room, id]) { E.setWallpaper(S, room, id); render(); roomModal(room); },
  flooring([room, id]) { E.setFlooring(S, room, id); render(); roomModal(room); },
  paint(part) { paintModal(part); },
  setPaint([part, c]) { E.setPaint(S, part, c); render(); paintModal(part); },
  buyPet(type) {
    const p = E.PET[type];
    openModal(`<div class="row"><div>${A.petSvg(type, 90)}</div><div><h3>A ${p.name.toLowerCase()} for 🪙 ${p.price}</h3><p class="muted">What will you call it?</p><input type="text" id="petName" maxlength="14" placeholder="Name" autocomplete="off" value="${esc(p.name)}" /></div></div><div class="row" style="margin-top:14px"><button data-act="reallyBuyPet" data-arg='${arg(type)}'>Take ${p.name.toLowerCase()} home</button><button class="alt" data-act="closeModal">No thanks</button></div>`);
    setTimeout(() => $('#petName')?.select(), 50);
  },
  reallyBuyPet(type) { const r = E.buyPet(S, type, $('#petName').value); toast(r.msg); closeModal(); render(); },
  feedPet(i) { const r = E.feedPet(S, i); toast(r.msg); render(); petModal(i); },
  playPet(i) { const r = E.playWithPet(S, i, E.makeRng((Date.now() % 1e6) + i)); toast(r.msg, r.trick ? 4000 : 2600); render(); petModal(i); },
  feedPerson(i) { const r = E.feedPerson(S, i); toast(r.msg); render(); personModal(i); },
  newBaby() { const name = ($('#babyName').value || '').trim(); if (!name) { toast('Give the baby a name first!'); return; } const r = E.newBaby(S, name); toast(r.msg); if (r.ok) go('home'); else render(); },
  moveHouse(id) {
    const h = E.HOUSES.find(x => x.id === id); const sale = E.houseSalePrice(S.house); const cost = h.price - sale;
    if (!S.house) { const r = E.moveHouse(S, id); toast(r.msg); go('home'); return; }
    openModal(`<h3>Move to the ${h.name}?</h3><p>Your ${E.houseType(S.house).name} sells for 🪙 ${sale}. The ${h.name} costs 🪙 ${h.price}, so ${cost > 0 ? `you pay <b>🪙 ${cost}</b>` : `you get <b>🪙 ${-cost}</b> back`}. All your furniture goes into the van, and your pets and family come too.</p><div class="row"><button data-act="reallyMove" data-arg='${arg(id)}'>Yes, move!</button><button class="alt" data-act="closeModal">Stay here</button></div>`);
  },
  reallyMove(id) { const r = E.moveHouse(S, id); toast(r.msg); go('home'); },
  visit(id) { const r = E.visitNeighbour(S, id, E.makeRng(Date.now() % 1e9)); if (r.gift) toast(r.msg, 4000); go('visit', { id, msg: r.gift ? r.msg : r.msg.replace(/^.*?: /, '') }); },
  pick([k, v]) { ui[k] = v; render(); },
  startLesson() { const r = E.startLesson(S, ui.subject, ui.level, E.makeRng(Date.now() % 1e9)); if (!r.ok) { toast(r.msg); return; } lesson = r.lesson; ui.seq = []; ui.feedback = null; render(); },
  answer(i) { if (ui.feedback) return; submitAnswer(i); },
  tile(i) {
    if (ui.feedback) return; ui.seq = ui.seq || []; if (ui.seq.includes(i)) return; ui.seq.push(i);
    const q = lesson.questions[lesson.index];
    if (ui.seq.length === q.tiles.length) { const vals = ui.seq.map(k => q.tiles[k]); submitAnswer(q.kind === 'build' ? vals.join('') : vals); } else render();
  },
  undo() { ui.seq?.pop(); render(); },
  clearSeq() { ui.seq = []; render(); },
  next() { ui.feedback = null; ui.seq = []; render(); },
  collect() { const r = E.finishLesson(S, lesson); lesson = null; toast(r.msg, 4000); ui.feedback = null; render(); },
  sleep() {
    if (!E.canSleep(S)) { toast('It is too early for bed!'); return; }
    const r = E.sleep(S, E.makeRng(Date.now() % 1e9)); lesson = null; go('morning', r.report);
  },
};

// ───────────────────────── events ─────────────────────────
function handle(e) {
  const btn = e.target.closest('[data-act]');
  if (btn) { const act = btn.dataset.act; let a = null; try { a = btn.dataset.arg !== undefined ? JSON.parse(btn.dataset.arg) : null; } catch { } if (ACT[act]) ACT[act](a, btn); return; }
  if (!S) return;
  const g = e.target.closest('g.slot, g.placed, g.pet, g.person, g.roomlabel');
  if (!g) return;
  const roomEl = g.closest('g.room'); const room = roomEl ? Number(roomEl.dataset.room) : -1;
  if (g.classList.contains('slot')) { if (screen === 'home' || screen === 'outside') pickerModal(g.dataset.kind, room, Number(g.dataset.slot)); }
  else if (g.classList.contains('placed')) { if (screen === 'home' || screen === 'outside') placedModal(g.dataset.kind, room, Number(g.dataset.slot)); }
  else if (g.classList.contains('pet')) { if (screen === 'home') petModal(Number(g.dataset.pet)); }
  else if (g.classList.contains('person')) { if (screen === 'home') personModal(Number(g.dataset.person)); }
  else if (g.classList.contains('roomlabel')) { if (screen === 'home') roomModal(room); }
}
document.addEventListener('click', e => { if (e.target === modal) { closeModal(); return; } handle(e); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && screen === 'start' && document.activeElement?.id === 'newName') ACT.newPlayer(); if (e.key === 'Enter' && document.activeElement?.id === 'babyName') ACT.newBaby(); if (e.key === 'Escape') closeModal(); });

render();
