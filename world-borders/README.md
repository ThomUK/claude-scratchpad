# World Borders — find the mystery country

An educational guessing game on a 3D globe.

1. Choose a difficulty, then pick a starting country (searchable list of all 250
   countries and territories). The globe turns to show it, highlighted in yellow.

   | Level | Names on map | Click map to guess | Per guess | Clue button |
   |---|---|---|---|---|
   | Easy | yes | yes | warmer/cooler, distance and compass direction | not needed |
   | Intermediate | yes | no | warmer/cooler only | distance and direction from start and latest guess |
   | Hard | no | no | warmer/cooler and distance | direction from start and latest guess |
2. The game hides a random second country and tells you how far it is from your start.
3. Guess a country. A line is drawn from your previous guess (or from the start) to
   it: **orange** if that hop took you closer to the mystery country (warmer),
   **blue** if further away (cooler). Points are numbered so the path reads in
   order, and each guess shows its own distance.
4. Stuck? **Give me a clue** tells you the compass direction to the mystery
   country from your start and from your latest guess (rhumb-line bearing, i.e.
   the direction as it looks on a map). Clues used are counted.
5. Find it (green) and you get an info card: capital, population, area, region,
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
  1:50m admin-0 map units, public domain. Natural Earth's default view draws
  Crimea inside Russia; the build script moves it into Ukraine so borders are
  the internationally recognised, pre-2014 ones. Three territories have no
  polygon at this scale (Bouvet Island, Gibraltar, US Minor Outlying Islands)
  and are shown as markers.
- three.js is vendored under `vendor/three/`.

## Ideas for later

Restricting the target pool on easier levels, scoring and streaks, and a native
Android wrap.
