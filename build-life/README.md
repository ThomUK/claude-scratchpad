# Build Life

A life-building game for children aged 7 to 12, designed with the two players
who asked for it. Buy a house, decorate it inside and out, go to school to earn
gold coins, and fill your home with pets and family.

**Live:** https://thomuk.github.io/claude-scratchpad/build-life/

## How it plays

- **Start** by typing your name. Every player has their own house, coins and
  family, saved in the browser on that device.
- **Houses.** You begin with enough coins for the Small Flat. Save up for the
  Terraced House, the Big Detached House or the Castle. The estate agent buys
  your old house back for more than you paid if the rooms and garden are
  decorated, and all your furniture, pets and family move with you in the van.
- **Decorating** uses a dolls'-house cutaway: tap a dotted `+` in any room to
  place something from your van, tap a room name to choose its wallpaper and
  floor, and go outside to paint the walls, roof and door and fill the garden.
  Lamps, fireplaces, chandeliers and garden lanterns glow at night.
- **School** pays the coins. Pick Maths, Words or The World, then Easy, Medium
  or Hard. Lessons mix multiple-choice questions with tap-the-tiles mini games
  (order the numbers, spell the word, put the planets in order). Right answers
  pay 3, 5 or 8 coins, a perfect lesson earns a bonus, and you get three
  lessons a day, plus one more for every child in the family who is old enough
  for school.
- **Shops.** A furniture shop, a gadget shop (screens, computers, consoles,
  cameras and alarms), a pet shop and a garden centre.
- **Pets.** Dog, cat, rabbit, hamster, goldfish, parrot and a dragon. They get
  hungry and bored; feed them with pet food and play with them. A happy pet
  does a trick and finds a few coins.
- **Family.** Once you own a cot, the hospital sends a baby home. Feed it a
  bottle each day and after five days it grows into a child, who can later go
  to school with you. Nobody in Build Life ever dies.
- **Burglars** come every night from the second night on, and the posher the
  house the more often two turn up at once. Cameras, alarms, doorbell cameras, dogs,
  parrots and dragons add security points: three or more catches the burglar
  and the police pay a reward, one or two scares them off, none and something
  goes missing.
- **Day and night.** Everything takes time. Shops close at 6pm, school at 3pm.
  Go to bed in the evening to start the next day; the morning report tells you
  what happened overnight.
- **Neighbours.** Three nearby families with furnished houses to look around.
  Visiting earns a small thank-you once a day.

## Files

- `engine.js` — all game rules, catalogue and question generators. Pure JS,
  no DOM, deterministic with a seeded random number generator.
- `art.js` — SVG drawings for every item, pet and person, plus the interior
  and exterior house views.
- `app.js` — screens, navigation, modals and saving to `localStorage`.
- `tests/engine.test.mjs` — unit tests: `node tests/engine.test.mjs`.
