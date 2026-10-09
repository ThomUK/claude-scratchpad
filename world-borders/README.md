# World Borders — find the mystery country

An educational guessing game on a 3D globe.

1. Pick a starting country (searchable list of all 250 countries and territories).
   The globe turns to show it, highlighted in yellow.
2. The game hides a random second country and tells you how far it is from your start.
3. Guess a country. If it is closer to the mystery country than your previous guess
   (or than your start, for the first guess) the game says **warmer** and paints it
   orange; otherwise **cooler** and blue. Each guess also shows its own distance.
4. Find it (green) and you get an info card: capital, population, area, region,
   languages, currency, bordering countries and a few facts. Dependent territories
   say who administers them. Then chain on: the next round can start from the
   country you just found.

Live: https://thomuk.github.io/claude-scratchpad/world-borders/

## How it works

- `engine.js` — DOM-free rules: haversine distance, warmer/cooler, round state,
  and a small TopoJSON decoder. Tested with `node tests/engine.test.mjs`.
- `globe.js` — three.js globe. Country fills are painted on a 4096×2048 canvas
  texture (cheap to recolour); borders are 3D line segments so they stay crisp
  when zoomed; tiny or shapeless territories get a ring marker.
- `app.js` — UI: picker, guess log, reveal card.
- `build_data.mjs` — regenerates `data/` from the sources below (see its header
  for the download URLs and the run command).

Distances are great-circle, centre to centre, using each country's
representative lat/lon from the dataset.

## Data

- Country facts: [mledoze/countries](https://github.com/mledoze/countries)
  (the dataset behind REST Countries), ODbL. The dependency relationships and
  a handful of corrections (e.g. Vatican City is a UN observer, not a member)
  are in `build_data.mjs`.
- Boundaries and population estimates: [Natural Earth](https://www.naturalearthdata.com/)
  1:50m admin-0 map units, public domain. Three territories have no polygon at
  this scale (Bouvet Island, Gibraltar, US Minor Outlying Islands) and are shown
  as markers.
- three.js is vendored under `vendor/three/`.

## Ideas for later

Difficulty levels (restrict the target pool to larger or better-known places,
or add compass-direction clues), scoring and streaks, and a native Android wrap.
