# Global Explorer — find the mystery country

An educational guessing game on a 3D globe, laid out as a phone app (bottom
tab bar, full-screen globe with a sliding panel) that also works on the desktop
web, where the tab bar becomes a side rail. Installable as a web app and works
offline; the shell is ready for a Capacitor wrap.

**Play.** Tap any country on the globe to see its name and the ways to
begin: start exploring from there, from where you are, or from a random
location.
The game hides a second country and tells you how far it is. Guess a country:
a line is drawn from your previous guess (or the start) to it, **orange** if
that hop took you closer, **blue** if further away, and the feedback tells
you how far, and in which direction, the mystery country lies from that
guess. Points are numbered so the path reads in order. **Give me a clue**
climbs a ladder of four hints (continent, first letter, a neighbour, the
flag); each costs a point, and on Intermediate and Advanced the stamp you
earn is marked with the number of clues used. Find it (green) and you get
the country card: capital, population, area, density, region, languages,
currency, neighbours and a few facts, with dependent territories saying who
administers them. **Next round** chains on from the country you found; the Game tab starts afresh.

**Passport.** The scoring page. Each country has three stamps to collect, one
per level (Easy, Intermediate, Advanced). Finding a
country stamps it, and until a level's passport is complete the mystery
country is always drawn from the countries you have not yet stamped at that
level. Shows rounds, streaks, best scores,
progress bars per level and the stamp book.

Tapping a level in the passport summary opens the globe shaded by your
progress on that level (dark for stamped, light for still to collect, beige for
places outside the level's pool), with names on; tap any country for a quick
card with area, population, density and coastline, and a link to its page.

Countries you have really been to get a violet "been here for real" visa
stamp: open the country in the Atlas and tap the button (with a confirmation
to add or remove). Real travel is stored separately and survives a reset.

**Atlas.** All 250 countries and territories as a sortable list (name,
population, area, density, coastline, neighbours, continent, status, difficulty) with a
filter and mini stamps. Each country has its own page with the full card,
stamps, "Show on globe" (highlights it in teal) and "Start a round here".

**Settings.** The level; kilometres or miles; data credits.

Every level shows the distance and compass direction for every guess. The
levels differ in the pool, the names on the map and how you guess:

| Level | Mystery pool | Names on map | How you guess | Clues |
|---|---|---|---|---|
| Easy | 80 commonly visited countries | yes | tap the globe | free |
| Intermediate | 193 UN countries | yes | tap the globe | marked on the stamp |
| Advanced | all 250, dependencies and disputed places included | no: each appears as you guess it | type the name (a tap rings the shape without naming it) | marked on the stamp |

On Easy the mystery country is drawn only from the 80 countries UK residents
visit most (ONS *Travel trends*, UK residents' visits abroad by main country
visited). The top 10 are the published 2024 figures; ranks 11–79 are a
reconstruction of the ONS country table, and the United Kingdom itself takes
the 80th place. The list lives in `build_data.mjs` (`EASY_POOL`) for
correction. The start country can still be anywhere.

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
  local storage for settings and progress. The globe screen is always in
  one of three views (start, round, explore) applied by a single function,
  so the passport and atlas can take the globe over and hand it back
  without disturbing a round.
- `sw.js` + `manifest.webmanifest` + `icons/` — offline cache and install.
- `build_data.mjs` — regenerates `data/` from the sources below (see its header
  for the download URLs and the run command).

Distances are great-circle, centre to centre, using each country's
representative lat/lon from the dataset.

## Data

| Item | Source | Licence |
|---|---|---|
| Country facts | [mledoze/countries](https://github.com/mledoze/countries), the dataset behind REST Countries | ODbL |
| Borders and population | [Natural Earth](https://www.naturalearthdata.com/) 1:50m admin-0 map units and population estimates | Public domain |
| Coastlines | CIA World Factbook, via the [factbook.json](https://github.com/factbook/factbook.json) mirror | Public domain |
| Flags | [Twemoji](https://github.com/jdecked/twemoji) flag graphics, as the flags-only font from [country-flag-emoji-polyfill](https://github.com/talkjs/country-flag-emoji-polyfill) (TalkJS, MIT), under `vendor/fonts/` | CC BY 4.0 |
| 3D globe | [three.js](https://threejs.org/), vendored under `vendor/three/` | MIT |

Notes on the build (`build_data.mjs`):

- The dependency relationships and a handful of corrections to the country
  facts (e.g. Vatican City is a UN observer, not a member) are applied there.
- Coastline lengths go into `data/coastline.json`; Western Sahara and the
  French overseas departments use the Factbook's earlier editions, and four
  territories have no published figure.
- Natural Earth draws some areas by de facto control; the build applies the
  internationally recognised borders instead (the `MOVES` list). Areas under
  someone else's long-standing administration (the Moroccan-administered part
  of Western Sahara, the Golan Heights, Northern Cyprus) are hatched. Three
  territories have no polygon at this scale (Bouvet Island, Gibraltar,
  US Minor Outlying Islands) and are shown as markers.
- The Easy pool's "commonly visited" list is our own ranking (`EASY_POOL`),
  informed by the ONS Travel trends figures for UK residents' visits abroad,
  with the UK itself added. It reproduces no ONS data, so it carries no credit.
- The flags-only font exists because Windows has no system font with flag
  emoji.

## Ideas for later

A daily challenge with a shareable result, haptics on warmer/cooler, a
follow-system dark theme, and the Capacitor Android wrap.
