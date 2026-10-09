#!/usr/bin/env node
// Builds data/countries.json and data/world.json for the Global Explorer game.
//
// Inputs (downloaded separately, not committed):
//   countries.json     https://raw.githubusercontent.com/mledoze/countries/master/countries.json
//                      (the dataset behind REST Countries; ODbL)
//   map_units.geojson  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_map_units.geojson
//                      (Natural Earth 1:50m admin-0 map units; public domain)
//   breakaway.geojson  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_breakaway_disputed_areas.geojson
//                      (Natural Earth's disputed-area polygons; used to move Crimea into Ukraine)
//   tools dir          a directory with node_modules containing topojson-server and polygon-clipping
//                      (npm install topojson-server polygon-clipping)
//
// Run from global-explorer/:
//   node build_data.mjs <countries.json> <map_units.geojson> <breakaway.geojson> <tools dir>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [rcPath, nePath, brkPath, toolsDir] = process.argv.slice(2);
if (!rcPath || !nePath || !brkPath || !toolsDir) {
  console.error('usage: node build_data.mjs <countries.json> <map_units.geojson> <breakaway.geojson> <tools dir>');
  process.exit(1);
}
const { topology } = await import(pathToFileURL(join(toolsDir, 'node_modules/topojson-server/src/index.js')));
const pc = (await import(pathToFileURL(join(toolsDir, 'node_modules/polygon-clipping/dist/polygon-clipping.esm.js')))).default;

const rc = JSON.parse(readFileSync(rcPath, 'utf8'));
const ne = JSON.parse(readFileSync(nePath, 'utf8'));
const brk = JSON.parse(readFileSync(brkPath, 'utf8'));

// ---- Borders: internationally recognised ---------------------------------
// Natural Earth draws de facto control. Move these disputed-area polygons
// into the state that holds recognised sovereignty. `hatch` marks the moved
// area on the globe as under someone else's administration; Ukraine is drawn
// whole and unhatched.
const MOVES = [
  { brk: 'Crimea', from: 'RUS', to: 'UKR', hatch: false },
  // Natural Earth's 'W. Sahara' polygon is the whole territory; the hatch is that minus the eastern strip already drawn as Western Sahara.
  { brk: 'W. Sahara', from: 'MAR', to: 'ESH', hatch: true, hatchExcludeTo: true, label: 'Western Sahara (Moroccan-administered)' },
  { brk: 'Golan Heights', from: 'ISR', to: 'SYR', hatch: true, label: 'Golan Heights' },
];
// Areas already drawn inside the recognised state (as their own Natural Earth
// map unit) that just need the hatch.
const HATCH_UNITS = [{ adm0: 'CYN', in: 'CYP', label: 'Northern Cyprus' }];
const hatched = []; // GeoJSON features for the hatch layer
{
  const asMulti = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
  const ringArea = (r) => Math.abs(r.reduce((a, [x1, y1], i) => { const [x2, y2] = r[(i + 1) % r.length]; return a + x1 * y2 - x2 * y1; }, 0) / 2);
  // Natural Earth's ADM0_A3 differs from ISO for some places (Western Sahara is SAH), so match any of its code fields.
  const unitOf = (code) => ne.features.find((f) => [f.properties.ISO_A3, f.properties.ISO_A3_EH, f.properties.ADM0_A3].includes(code));
  for (const m of MOVES) {
    const area = brk.features.find((f) => f.properties.BRK_NAME === m.brk);
    const from = unitOf(m.from);
    const to = unitOf(m.to);
    if (!area || !from || !to) throw new Error(`${m.brk}: features not found`);
    const mp = asMulti(area.geometry);
    const toBefore = asMulti(to.geometry);
    // Clipping can leave hairline slivers along shared lines; drop tiny leftovers inside the area's box.
    const cb = [180, 90, -180, -90];
    for (const ring of mp.flat()) for (const [x, y] of ring) { cb[0] = Math.min(cb[0], x); cb[1] = Math.min(cb[1], y); cb[2] = Math.max(cb[2], x); cb[3] = Math.max(cb[3], y); }
    const inBox = (poly) => poly[0].every(([x, y]) => x >= cb[0] - 0.05 && x <= cb[2] + 0.05 && y >= cb[1] - 0.05 && y <= cb[3] + 0.05);
    const fromMP = pc.difference(asMulti(from.geometry), mp).filter((poly) => !(inBox(poly) && ringArea(poly[0]) < 0.05));
    from.geometry = { type: 'MultiPolygon', coordinates: fromMP };
    to.geometry = { type: 'MultiPolygon', coordinates: pc.union(asMulti(to.geometry), mp) };
    if (m.hatch) {
      const hatchMP = m.hatchExcludeTo ? pc.difference(mp, toBefore).filter((poly) => ringArea(poly[0]) > 0.01) : mp;
      hatched.push({ type: 'Feature', properties: { c: m.to, h: 1, n: m.label }, geometry: { type: 'MultiPolygon', coordinates: hatchMP } });
    }
    console.log(`moved ${m.brk}: ${m.from} -> ${m.to}${m.hatch ? ' (hatched)' : ''}`);
  }
  for (const h of HATCH_UNITS) {
    const unit = ne.features.find((f) => f.properties.ADM0_A3 === h.adm0);
    if (!unit) throw new Error(`${h.adm0}: unit not found`);
    hatched.push({ type: 'Feature', properties: { c: h.in, h: 1, n: h.label }, geometry: unit.geometry });
  }
}

// ---- Dependent / special-status territories -------------------------------
// cca3 -> { sov: cca3 of the administering state (null if none), rel: phrase }
const DEPENDENT = {
  ABW: ['NLD', 'a constituent country of the Kingdom of the Netherlands'],
  CUW: ['NLD', 'a constituent country of the Kingdom of the Netherlands'],
  SXM: ['NLD', 'a constituent country of the Kingdom of the Netherlands, sharing its island with French Saint Martin'],
  BES: ['NLD', 'three special municipalities of the Netherlands: Bonaire, Sint Eustatius and Saba'],
  AIA: ['GBR', 'a British Overseas Territory'],
  BMU: ['GBR', 'a British Overseas Territory'],
  IOT: ['GBR', 'a British Overseas Territory'],
  VGB: ['GBR', 'a British Overseas Territory'],
  CYM: ['GBR', 'a British Overseas Territory'],
  FLK: ['GBR', 'a British Overseas Territory, also claimed by Argentina'],
  GIB: ['GBR', 'a British Overseas Territory on the southern tip of Spain'],
  MSR: ['GBR', 'a British Overseas Territory'],
  PCN: ['GBR', 'a British Overseas Territory, and one of the least populated territories in the world'],
  SHN: ['GBR', 'a British Overseas Territory of three island groups in the South Atlantic'],
  SGS: ['GBR', 'a British Overseas Territory with no permanent population'],
  TCA: ['GBR', 'a British Overseas Territory'],
  GGY: ['GBR', 'a Crown Dependency: self-governing, not part of the United Kingdom, but with the UK responsible for its defence'],
  JEY: ['GBR', 'a Crown Dependency: self-governing, not part of the United Kingdom, but with the UK responsible for its defence'],
  IMN: ['GBR', 'a Crown Dependency: self-governing, not part of the United Kingdom, but with the UK responsible for its defence'],
  ALA: ['FIN', 'an autonomous, Swedish-speaking region of Finland'],
  ASM: ['USA', 'an unincorporated territory of the United States'],
  GUM: ['USA', 'an unincorporated territory of the United States'],
  MNP: ['USA', 'a commonwealth in political union with the United States'],
  PRI: ['USA', 'an unincorporated territory of the United States with commonwealth status'],
  VIR: ['USA', 'an unincorporated territory of the United States'],
  UMI: ['USA', 'nine small, mostly uninhabited islands administered by the United States'],
  ATA: [null, 'not owned by any country: it is governed under the Antarctic Treaty, although seven states maintain territorial claims there'],
  ATF: ['FRA', 'an overseas territory of France made up of sub-Antarctic islands and a claim in Antarctica'],
  BLM: ['FRA', 'an overseas collectivity of France'],
  MAF: ['FRA', 'an overseas collectivity of France, sharing its island with Dutch Sint Maarten'],
  SPM: ['FRA', 'an overseas collectivity of France, just off the coast of Newfoundland'],
  WLF: ['FRA', 'an overseas collectivity of France'],
  PYF: ['FRA', 'an overseas collectivity of France'],
  NCL: ['FRA', 'a special-status collectivity of France'],
  GLP: ['FRA', 'an overseas department and region of France, and so part of the European Union'],
  GUF: ['FRA', 'an overseas department and region of France, and so part of the European Union'],
  MTQ: ['FRA', 'an overseas department and region of France, and so part of the European Union'],
  MYT: ['FRA', 'an overseas department and region of France, and so part of the European Union'],
  REU: ['FRA', 'an overseas department and region of France, and so part of the European Union'],
  BVT: ['NOR', 'an uninhabited dependency of Norway'],
  SJM: ['NOR', 'under Norwegian sovereignty; Svalbard is governed by the 1920 Svalbard Treaty'],
  CCK: ['AUS', 'an external territory of Australia'],
  CXR: ['AUS', 'an external territory of Australia'],
  NFK: ['AUS', 'an external territory of Australia'],
  HMD: ['AUS', 'an uninhabited external territory of Australia'],
  COK: ['NZL', 'a self-governing state in free association with New Zealand'],
  NIU: ['NZL', 'a self-governing state in free association with New Zealand'],
  TKL: ['NZL', 'a dependent territory of New Zealand'],
  FRO: ['DNK', 'an autonomous territory within the Kingdom of Denmark'],
  GRL: ['DNK', 'an autonomous territory within the Kingdom of Denmark'],
  HKG: ['CHN', 'a Special Administrative Region of China under the "one country, two systems" principle'],
  MAC: ['CHN', 'a Special Administrative Region of China under the "one country, two systems" principle'],
  ESH: [null, 'a disputed territory: most of it is administered by Morocco, the rest by the Sahrawi Arab Democratic Republic'],
  UNK: [null, 'a partially recognised state: it declared independence from Serbia in 2008 and is recognised by roughly half of UN members'],
  PSE: [null, 'a UN observer state recognised by most UN members'],
  TWN: [null, 'self-governing, but its status is disputed and it is not a UN member'],
};

// ---- Easy-mode target pool ---------------------------------------------------
// The 80 countries UK residents visit most, per the ONS "Travel trends"
// release (UK residents' visits abroad, main country visited). Ranks 1-10 are
// the published 2024 figures (Spain 17.8m, France 9.3m, Italy 4.8m, Turkey 4.1m,
// USA 4.1m, Greece 3.8m, Portugal 3.7m, Ireland 3.6m, Germany 3.2m, Poland 2.9m).
// Ranks 11-80 follow the ONS country table as best reconstructed without
// access to the spreadsheet; edit this list to correct the order or members.
const EASY_POOL = [
  'ESP', 'FRA', 'ITA', 'TUR', 'USA', 'GRC', 'PRT', 'IRL', 'DEU', 'POL',
  'NLD', 'CYP', 'BEL', 'CHE', 'AUT', 'HRV', 'EGY', 'ARE', 'IND', 'CZE',
  'HUN', 'MLT', 'CAN', 'DNK', 'SWE', 'AUS', 'ROU', 'BGR', 'NOR', 'THA',
  'MEX', 'MAR', 'PAK', 'ISL', 'JPN', 'LTU', 'JAM', 'ZAF', 'TUN', 'FIN',
  'LVA', 'BRB', 'SVK', 'SGP', 'CHN', 'HKG', 'NGA', 'DOM', 'SAU', 'SVN',
  'LUX', 'EST', 'BRA', 'NZL', 'MYS', 'LKA', 'VNM', 'IDN', 'QAT', 'CUB',
  'KEN', 'ISR', 'MUS', 'BGD', 'ARG', 'PHL', 'KOR', 'GHA', 'TTO', 'BHS',
  'ATG', 'LCA', 'GIB', 'MNE', 'ALB', 'SRB', 'GEO', 'KHM', 'PER', 'OMN',
];
const EASY_POOL_SIZE = 80;

// Natural Earth features whose ISO code does not match the country list.
const NE_OVERRIDE = { KOS: 'UNK', SOL: 'SOM', CYN: 'CYP', KAS: null };

const byCode = new Map(rc.map((c) => [c.cca3, c]));
for (const code of EASY_POOL) if (!byCode.has(code)) throw new Error(`EASY_POOL: unknown code ${code}`);
if (new Set(EASY_POOL).size !== EASY_POOL_SIZE) throw new Error(`EASY_POOL must hold ${EASY_POOL_SIZE} distinct codes`);
const neCodeOf = (p) => {
  if (p.ADM0_A3 in NE_OVERRIDE) return NE_OVERRIDE[p.ADM0_A3];
  for (const k of ['ISO_A3', 'ISO_A3_EH', 'ADM0_A3']) if (byCode.has(p[k])) return p[k];
  return null;
};

// ---- Geometry --------------------------------------------------------------
const pop = new Map(); // code -> NE population estimate (sum over map units)
const bbox = new Map(); // code -> [minLon, minLat, maxLon, maxLat]
const label = new Map(); // code -> { pos: [lat, lon], area } from the largest map unit's LABEL_X/Y
const geoms = [];
const walk = (coords, fn) => (typeof coords[0] === 'number' ? fn(coords) : coords.forEach((c) => walk(c, fn)));
for (const f of ne.features) {
  const code = neCodeOf(f.properties);
  if (code && Number.isFinite(f.properties.POP_EST)) {
    // Some units repeat the parent's population (e.g. Somaliland carries its own). Take the max, not the sum.
    pop.set(code, Math.max(pop.get(code) || 0, f.properties.POP_EST));
  }
  if (code) {
    const b = bbox.get(code) || [180, 90, -180, -90];
    walk(f.geometry.coordinates, ([x, y]) => {
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    });
    bbox.set(code, b);
    const fb = [180, 90, -180, -90];
    walk(f.geometry.coordinates, ([x, y]) => { fb[0] = Math.min(fb[0], x); fb[1] = Math.min(fb[1], y); fb[2] = Math.max(fb[2], x); fb[3] = Math.max(fb[3], y); });
    const area = (fb[2] - fb[0]) * (fb[3] - fb[1]);
    const { LABEL_X, LABEL_Y } = f.properties;
    if (Number.isFinite(LABEL_X) && Number.isFinite(LABEL_Y) && (!label.has(code) || label.get(code).area < area)) label.set(code, { pos: [LABEL_Y, LABEL_X], area });
  }
  geoms.push({ type: 'Feature', properties: { c: code }, geometry: f.geometry });
}
const topo = topology({
  units: { type: 'FeatureCollection', features: geoms },
  hatched: { type: 'FeatureCollection', features: hatched },
}, 1e5);
writeFileSync('data/world.json', JSON.stringify(topo));

// ---- Countries -------------------------------------------------------------
const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th');
const nth = (n) => (n === 1 ? '' : ord(n) + ' ');
const fmt = (n) => (n < 10 ? n.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : Math.round(n).toLocaleString('en-GB'));
// Population for territories Natural Earth has no polygon for (approximate).
const POP_FIX = { GIB: 32700, BVT: 0, UMI: 0 };
// Places whose ISO code has no emoji flag on most phones. They fly their
// parent state's flag, so show that, and say so in the facts.
const FLAG_FIX = {
  BES: ['🇳🇱', 'The Caribbean Netherlands has no flag of its own: four flags fly there, the flag of the Netherlands and a separate flag for each of its three islands, Bonaire, Sint Eustatius and Saba.'],
  BVT: ['🇳🇴', 'It has no flag of its own and flies the flag of Norway.'],
  HMD: ['🇦🇺', 'It has no flag of its own and flies the flag of Australia.'],
  SJM: ['🇳🇴', 'It has no flag of its own and flies the flag of Norway.'],
  UMI: ['🇺🇸', 'The islands have no flag of their own and fly the flag of the United States.'],
  MAF: ['🇫🇷', 'Its official flag is the flag of France, although a local flag is used unofficially.'],
};
// Land areas the source dataset leaves as -1 ("unknown"). Svalbard 61,022 km²
// + Jan Mayen 377 km² (Statistics Norway); the CIA World Factbook gives 62,045 for Svalbard alone.
const AREA_FIX = { SJM: 61399 };
for (const c of rc) if (AREA_FIX[c.cca3] != null) c.area = AREA_FIX[c.cca3];
{
  const bad = rc.filter((c) => !(c.area > 0));
  if (bad.length) throw new Error(`non-positive land area for ${bad.map((c) => c.cca3).join(', ')}; add to AREA_FIX`);
}
// The source dataset marks the Holy See as a UN member; it is a permanent observer.
const UN_FIX = { VAT: false };
const areaRank = [...rc].sort((a, b) => b.area - a.area).map((c) => c.cca3);
const popRank = [...rc].filter((c) => (pop.get(c.cca3) ?? POP_FIX[c.cca3]) > 0).sort((a, b) => pop.get(b.cca3) - pop.get(a.cca3)).map((c) => c.cca3);
const densityOf = (c) => { const p = pop.get(c.cca3) ?? POP_FIX[c.cca3]; return p != null && c.area > 0 ? p / c.area : null; };
const densityRank = [...rc].filter((c) => densityOf(c) > 0).sort((a, b) => densityOf(b) - densityOf(a)).map((c) => c.cca3);
const N = rc.length;
const maxBorders = Math.max(...rc.map((c) => c.borders.length));

const countries = rc.map((c) => {
  const code = c.cca3;
  const name = c.name.common;
  const dep = DEPENDENT[code];
  const population = pop.get(code) ?? POP_FIX[code] ?? null;
  const b = bbox.get(code) || null;
  const span = b ? Math.max(b[2] - b[0], b[3] - b[1]) : 0;
  const langs = Object.values(c.languages || {});
  // Continent: split the Americas by subregion; otherwise the UN region.
  const continent = c.region === 'Americas'
    ? (c.subregion === 'South America' ? 'South America' : 'North America')
    : c.region === 'Antarctic' ? 'Antarctica' : c.region;
  // Designation: how the place stands politically, in a few words.
  const designation = dep && dep[0] ? `Territory of ${byCode.get(dep[0]).name.common}`
    : (UN_FIX[code] ?? c.unMember) ? 'UN member'
    : code === 'VAT' || code === 'PSE' ? 'UN observer'
    : code === 'ATA' ? 'Antarctic Treaty'
    : code === 'ESH' ? 'Disputed'
    : dep ? 'Partially recognised'
    : 'Sovereign';
  const currs = Object.values(c.currencies || {}).map((x) => x.name);
  const facts = [];

  if (dep && dep[0]) {
    const sov = byCode.get(dep[0]).name.common;
    facts.push(`${name} is not an independent country: it is ${dep[1]}${dep[1].includes(sov) ? '' : ` (${sov})`}.`);
  } else if (dep) {
    facts.push(`${name} is ${dep[1]}.`);
  } else if (UN_FIX[code] ?? c.unMember) {
    facts.push(`${name} is a sovereign state and one of the 193 members of the United Nations.`);
  } else {
    facts.push(`${name} is a sovereign state but not a member of the United Nations${code === 'VAT' ? ', where it sits as a permanent observer' : ''}.`);
  }

  const aRank = areaRank.indexOf(code) + 1;
  if (aRank <= 10) facts.push(`It is the ${nth(aRank)}largest of the ${N} countries and territories by area (${fmt(c.area)} km²).`);
  else if (aRank > N - 10) facts.push(`At ${fmt(c.area)} km² it is the ${ord(N - aRank + 1)} smallest of the ${N} countries and territories.`);

  const pRank = popRank.indexOf(code) + 1;
  if (pRank > 0 && pRank <= 10) facts.push(`It is the ${nth(pRank)}most populous, with about ${fmt(population)} people.`);
  else if (population === 0 || (pRank > 0 && population < 1000)) facts.push(population === 0 ? 'It has no permanent population.' : `Fewer than 1,000 people live there.`);

  const density = densityOf(c);
  const dRank = densityRank.indexOf(code) + 1;
  if (dRank > 0 && dRank <= 5) facts.push(`It is the ${nth(dRank)}most densely populated place, with about ${fmt(density)} people per km².`);
  else if (density != null && density > 0 && density < 5 && population > 1000) facts.push(`It is very sparsely populated: about ${density < 1 ? density.toFixed(2) : density.toFixed(1)} people per km².`);

  const HATCH_FACTS = {
    ESH: 'The western part, shaded on the map, is administered by Morocco; the United Nations regards the territory\'s status as still to be decided.',
    SYR: 'The Golan Heights, shaded on the map in the south-west, have been occupied by Israel since 1967 and are recognised as Syrian.',
    CYP: 'The north of the island, shaded on the map, has been run by a Turkish-Cypriot administration since 1974 that only Türkiye recognises.',
    MAR: 'Morocco administers most of neighbouring Western Sahara, shown shaded on the map; the territory\'s status is unresolved.',
    ISR: 'It occupies the Golan Heights, shown shaded inside Syria on the map.',
  };
  if (HATCH_FACTS[code]) facts.push(HATCH_FACTS[code]);
  if (FLAG_FIX[code]) facts.push(FLAG_FIX[code][1]);

  if (c.landlocked) facts.push('It is landlocked: it has no coastline.');
  else if (c.borders.length === 0 && code !== 'ATA') facts.push('It has no land borders at all: it is entirely surrounded by sea.');
  if (c.borders.length === maxBorders) facts.push(`With ${c.borders.length} neighbours it shares land borders with more countries than any other.`);
  else if (c.borders.length >= 8) facts.push(`It shares land borders with ${c.borders.length} countries.`);
  else if (c.borders.length === 1) facts.push(`Its only land border is with ${byCode.get(c.borders[0]).name.common}.`);

  if (c.capital.length > 1) facts.push(`It has ${c.capital.length} capital cities: ${c.capital.join(', ')}.`);
  else if (c.capital.length === 0) facts.push('It has no official capital city.');
  if (langs.length >= 4) facts.push(`It has ${langs.length} official or widely used languages: ${langs.join(', ')}.`);
  if (c.car && c.car.side === 'left') facts.push('Traffic drives on the left.');
  const native = Object.values(c.name.native || {}).map((x) => x.common).find((x) => x && x !== name);
  if (native) facts.push(`In its own language it is called "${native}".`);

  return {
    code, name, official: c.name.official, flag: FLAG_FIX[code] ? FLAG_FIX[code][0] : c.flag, cca2: c.cca2,
    capital: c.capital, region: c.region, subregion: c.subregion, continent, designation,
    population, area: c.area, density: density == null ? null : +density.toFixed(density < 10 ? 2 : 1), latlng: c.latlng, borders: c.borders,
    landlocked: c.landlocked, independent: !!c.independent, unMember: UN_FIX[code] ?? c.unMember,
    languages: langs, currencies: currs,
    dependentOf: dep ? dep[0] : null,
    bbox: b, span: +span.toFixed(2), hasShape: !!b,
    label: label.has(code) ? label.get(code).pos.map((v) => +v.toFixed(3)) : c.latlng,
    facts,
  };
}).sort((a, b) => a.name.localeCompare(b.name));

writeFileSync('data/countries.json', JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  sources: {
    countries: 'mledoze/countries (the REST Countries dataset), ODbL',
    geometry: 'Natural Earth 1:50m admin-0 map units (public domain); population is Natural Earth POP_EST',
  },
  pools: {
    easy: {
      label: '80 commonly visited countries',
      source: "ONS Travel trends 2024, UK residents' visits abroad by main country visited (top 10 as published; 11-80 reconstructed)",
      codes: EASY_POOL,
    },
    un: {
      label: '193 United Nations countries',
      source: 'UN membership from the country dataset (Vatican City corrected to observer)',
      codes: countries.filter((c) => c.unMember).map((c) => c.code),
    },
  },
  countries,
}));
console.log(`wrote ${countries.length} countries, ${geoms.length} geometries; no shape: ${countries.filter((c) => !c.hasShape).map((c) => c.code).join(', ')}`);
