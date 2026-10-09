# Block World

A 3D block-building game for tablets and phones (keyboard and mouse work too),
co-designed with Elliott.

**Live:** https://thomuk.github.io/claude-scratchpad/block-world/

## What you can do

- **Build** with grass, earth, stone, sand, wood, logs, leaves, brick, metal and glass.
  Blocks are unlimited.
- **Dig** anywhere. Dig four blocks under the ground and water bubbles up and spreads
  along your tunnels. You can swim in it. Valleys are already lakes.
- **Doors** open with a tap. **Passcode trapdoors** sit flush in the floor: you pick a
  4-digit code when you place one and it only opens for the right code. Dig
  underneath to make a secret room.
- **Chests** hold items (apples, gems, coins, keys…). Make items from your 🎒 pocket,
  and hunt for the treasure chests buried underground.
- **Security cameras** watch where they point. Tap a **computer** to flick through
  every camera's live view.
- **Villagers** wander about. Tap one to climb on and ride it; you steer.
- 🌙 switches between day and night. The world saves itself in the browser, and the
  ☰ menu can export it as a file, import one, or start a fresh world.

## Controls

| | Touch | Keyboard / mouse |
| --- | --- | --- |
| Move | left joystick | `WASD` / arrows |
| Look | drag on the right | mouse (click to capture) |
| Jump / swim up | ⬆ button | `Space` |
| Dig | hold ⛏, or press and hold a block | left click |
| Place / use | tap ✋, or tap a block | right click / `F` |
| Choose block | bar at the bottom | `1`–`9`, `Q`/`R`, scroll wheel |
| Pocket | 🎒 | `E` |

## How it is built

- `engine.js` — DOM-free rules: 128×48×128 voxel world, seeded terrain, water
  flow, voxel raycast, AABB physics with auto-step, villager AI, special blocks,
  and run-length save/load. Tested with `node tests/engine.test.mjs`.
- `render.js` — three.js chunk meshing with a procedurally drawn 16px texture
  atlas, prop models (doors, trapdoors, chests, computers, cameras) and villagers.
- `app.js` — the game loop, touch/keyboard controls, HUD and modals.
