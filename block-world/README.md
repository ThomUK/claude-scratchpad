# Block World

A 3D block-building game for tablets and phones (keyboard and mouse work too),
co-designed with Elliott.

**Live:** https://thomuk.github.io/claude-scratchpad/block-world/

## What you can do

- **Build** with 76 kinds of block, sorted into tabs: Nature (grass, earth, stone,
  sand, logs, leaves, snow, mud, pebbles, mossy stone, ice, hay, cloud), Building
  (wood, dark wood, brick, metal, glass, copper, rusty metal, slate, marble, roof tiles,
  cobbles, checkerboard, bookcase), Colours (nine paints plus candy stripe, chocolate,
  rainbow and honeycomb), Magic (six glowing blocks, moonstone, ember rock, starry
  night, crystal and a bouncy block that springs you into the air), Furniture and
  Gadgets. Blocks are unlimited.
- **Furnish** with beds (sleep to make it morning), lamps, lanterns and ceiling lights
  that really light the night, shelves, tables, desks, chairs and sofas you can sit on,
  five carpets, pot plants, paintings (different art every time), clocks that show
  the real time, a toilet, a bath, a fridge full of snacks and a cooker that bakes cakes.
- **Dig** anywhere. Dig four blocks under the ground and water bubbles up and spreads
  along your tunnels. You can swim in it. Valleys are already lakes.
- **Doors** open with a tap. **Passcode trapdoors** sit flush in the floor: you pick a
  4-digit code when you place one and it only opens for the right code. Dig
  underneath to make a secret room.
- **Chests** hold items (apples, gems, coins, keys…). Make items from your 🎒 pocket,
  and hunt for the treasure chests buried underground.
- **Security cameras** watch where they point. Tap a **computer** to flick through
  every camera's live view.
- **Villagers** wander about. Tap one to climb on and ride it; you steer. The round
  mini-map shows where they are, and 📣 **Call** brings the nearest one to you.
- **Fly** by holding jump: you rise straight up and can steer. No more getting stuck
  in holes.
- 🌙 switches between day and night. The world saves itself in the browser, and the
  ☰ menu can export it as a file, import one, or start a fresh world.

## Controls

| | Touch | Keyboard / mouse |
| --- | --- | --- |
| Move | left joystick | `WASD` / arrows |
| Look | drag on the right | mouse (click to capture) |
| Jump / swim up | ⬆ button | `Space` |
| Fly | hold ⬆ | hold `Space` |
| Call a villager | 📣 Call | `C` |
| Dig | hold ⛏, or press and hold a block | left click |
| Place / use | tap ✋, or tap a block | right click / `F` |
| Choose block | tabs and bar at the bottom | `Tab` for the next tab, `1`–`9`, `Q`/`R`, scroll wheel |
| Pocket | 🎒 | `E` |

## How it is built

- `engine.js` — DOM-free rules: 256×48×256 voxel world (older 128-wide saves are
  dropped seamlessly into the middle), seeded terrain, water
  flow, voxel raycast, AABB physics with auto-step, villager AI, special blocks,
  and run-length save/load. Tested with `node tests/engine.test.mjs`.
- `render.js` — three.js chunk meshing with a procedurally drawn 16px texture
  atlas, prop models (doors, trapdoors, chests, computers, cameras, furniture),
  villagers, and the little 3D-rendered icons in the block bar.
- `app.js` — the game loop, touch/keyboard controls, HUD and modals.
