# Global Explorer — find the mystery country

An educational guessing game on a 3D globe, laid out as a phone app (bottom
tab bar, full-screen globe with a sliding panel) that also works on the desktop
web, where the tab bar becomes a side rail. Installable as a web app and works
offline; the shell is ready for a Capacitor wrap.

**Play.** Tap Begin and choose where to start: where you are, somewhere
random, a tap on the map, or a search.
The game hides a second country and tells you how far it is. Guess a country:
a line is drawn from your previous guess (or the start) to it, **orange** if
that hop took you closer, **blue** if further away, and the feedback tells
you how far, and in which direction, the mystery country lies from that
guess. Points are numbered so the path reads in order. **Give me a clue** reveals the compass
direction (and, when distances are hidden, the distance) from your start and
your latest guess; clues count against your score. Find it (green) and you get
the country card: capital, population, area, density, region, languages,
currency, neighbours and a few facts, with dependent territories saying who
administers them. Chain on: the next round can start from the country you found.

**Passport.** The scoring page. Each country has three stamps to collect, one
per level (Easy, Intermediate, Advanced; Custom rounds don't stamp). Finding a
country stamps it, and until a level's passport is complete the mystery
country is always drawn from the countries you have not yet stamped at that
level. Shows rounds, streaks, best scores,
progress bars per level and the stamp book.

**Atlas.** All 250 countries and territories as a sortable list (name,
population, area, density, coastline, neighbours, continent, status, difficulty) with a
filter and mini stamps. Each country has its own page with the full card,
stamps, "Show on globe" (highlights it in teal) and "Start a round here".

**Settings.** Difficulty presets plus the individual rules they set, so a custom
mix is possible; kilometres or miles; data credits.

| Level | Names on map | Tap map to guess | Per guess | Mystery pool | Clue button |
|---|---|---|---|---|---|
| Easy | yes | yes | warmer/cooler, distance and compass direction | 80 most visited | not needed |
| Intermediate | yes | no | warmer/cooler and distance | 193 UN member states | direction |
| Advanced | no | no | warmer/cooler and distance | all 250, dependencies and disputed places included | direction |

On Easy the mystery country is drawn only from the 80 countries UK residents
visit most (ONS *Travel trends*, UK residents' visits abroad by main country
visited). The top 10 are the published 2024 figures; ranks 11–80 are a
reconstruction of the ONS country table and live in `build_data.mjs`
(`EASY_POOL`) for correction. The start country can still be anywhere.

Live: https://thomuk.github.io/claude-scratchpad/global-explorer/

## How it works

- `engine.js` — DOM-free rules: haversine distance and rhumb-line bearings,
  warmer/cooler, round state, rule presets, scoring and stats, sorting, a
  point-in-country lookup for map taps and a small TopoJSON decoder. Tested
  with `node tests/engine.test.mjs`.
- `globe.js` — three.js globe. Country fills are vector meshes (each polygon
  triangulated in lon/lat, long edges bisected so triangles hug the sphere),
  borders are 3D line segments, and tiny or shapeless territories get a ring
  marker, so everything stays crisp at any zoom. Dragging keeps the ground
  under the pointer; taps snap to the nearest small country.
- `app.js` — the app shell: tabs, bottom sheet, picker, atlas, settings,
  local storage for settings and progress.
- `sw.js` + `manifest.webmanifest` + `icons/` — offline cache and install.
- `build_data.mjs` — regenerates `data/` from the sources below (see its header
  for the download URLs and the run command).

Distances are great-circle, centre to centre, using each country's
representative lat/lon from the dataset.

## Data

- Country facts: [mledoze/countries](https://github.com/mledoze/countries)
  (the dataset behind REST Countries), ODbL. The dependency relationships and
  a handful of corrections (e.g. Vatican City is a UN observer, not a member)
  are in `build_data.mjs`.
- Coastline lengths: the CIA World Factbook, fetched from the
  [factbook/factbook.json](https://github.com/factbook/factbook.json) mirror
  into `data/coastline.json`; Western Sahara and the French overseas
  departments use the Factbook's earlier editions. Four territories have no
  published figure.
- Boundaries and population estimates: [Natural Earth](https://www.naturalearthdata.com/)
  1:50m admin-0 map units, public domain. Natural Earth draws de facto
  control; the build script moves Crimea into Ukraine, the Golan Heights into
  Syria and the Moroccan-administered part of Western Sahara into Western
  Sahara, so borders are the internationally recognised ones. Areas under
  someone else's long-standing administration (western Western Sahara, the
  Golan Heights, Northern Cyprus) are hatched; Ukraine is drawn whole and
  unhatched. Three territories have no
  polygon at this scale (Bouvet Island, Gibraltar, US Minor Outlying Islands)
  and are shown as markers.
- three.js is vendored under `vendor/three/`.

## Ideas for later

A daily challenge with a shareable result, haptics on warmer/cooler, a
follow-system dark theme, and the Capacitor Android wrap.
