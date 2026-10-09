#!/usr/bin/env node
// Builds data/countries.json and data/world.json for the World Borders game.
//
// Inputs (downloaded separately, not committed):
//   countries.json     https://raw.githubusercontent.com/mledoze/countries/master/countries.json
//                      (the dataset behind REST Countries; ODbL)
//   map_units.geojson  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_map_units.geojson
//                      (Natural Earth 1:50m admin-0 map units; public domain)
//   tools dir          a directory with node_modules containing topojson-server
//                      (npm install topojson-server)
//
// Run from world-borders/:
//   node build_data.mjs <countries.json> <map_units.geojson> <tools dir>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [rcPath, nePath, toolsDir] = process.argv.slice(2);
if (!rcPath || !nePath || !toolsDir) {
  console.error('usage: node build_data.mjs <countries.json> <map_units.geojson> <tools dir>');
  process.exit(1);
}
const { topology } = await import(pathToFileURL(join(toolsDir, 'node_modules/topojson-server/src/index.js')));

const rc = JSON.parse(readFileSync(rcPath, 'utf8'));
const ne = JSON.parse(readFileSync(nePath, 'utf8'));

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

// Natural Earth features whose ISO code does not match the country list.
const NE_OVERRIDE = { KOS: 'UNK', SOL: 'SOM', CYN: 'CYP', KAS: null };

const byCode = new Map(rc.map((c) => [c.cca3, c]));
const neCodeOf = (p) => {
  if (p.ADM0_A3 in NE_OVERRIDE) return NE_OVERRIDE[p.ADM0_A3];
  for (const k of ['ISO_A3', 'ISO_A3_EH', 'ADM0_A3']) if (byCode.has(p[k])) return p[k];
  return null;
};

// ---- Geometry --------------------------------------------------------------
const pop = new Map(); // code -> NE population estimate (sum over map units)
const bbox = new Map(); // code -> [minLon, minLat, maxLon, maxLat]
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
  }
  geoms.push({ type: 'Feature', properties: { c: code }, geometry: f.geometry });
}
const topo = topology({ units: { type: 'FeatureCollection', features: geoms } }, 1e5);
writeFileSync('data/world.json', JSON.stringify(topo));

// ---- Countries -------------------------------------------------------------
const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th');
const nth = (n) => (n === 1 ? '' : ord(n) + ' ');
const fmt = (n) => (n < 10 ? n.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : Math.round(n).toLocaleString('en-GB'));
// Population for territories Natural Earth has no polygon for (approximate).
const POP_FIX = { GIB: 32700, BVT: 0, UMI: 0 };
// The source dataset marks the Holy See as a UN member; it is a permanent observer.
const UN_FIX = { VAT: false };
const areaRank = [...rc].sort((a, b) => b.area - a.area).map((c) => c.cca3);
const popRank = [...rc].filter((c) => (pop.get(c.cca3) ?? POP_FIX[c.cca3]) > 0).sort((a, b) => pop.get(b.cca3) - pop.get(a.cca3)).map((c) => c.cca3);
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
    code, name, official: c.name.official, flag: c.flag, cca2: c.cca2,
    capital: c.capital, region: c.region, subregion: c.subregion,
    population, area: c.area, latlng: c.latlng, borders: c.borders,
    landlocked: c.landlocked, independent: !!c.independent, unMember: UN_FIX[code] ?? c.unMember,
    languages: langs, currencies: currs,
    dependentOf: dep ? dep[0] : null,
    bbox: b, span: +span.toFixed(2), hasShape: !!b,
    facts,
  };
}).sort((a, b) => a.name.localeCompare(b.name));

writeFileSync('data/countries.json', JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  sources: {
    countries: 'mledoze/countries (the REST Countries dataset), ODbL',
    geometry: 'Natural Earth 1:50m admin-0 map units (public domain); population is Natural Earth POP_EST',
  },
  countries,
}));
console.log(`wrote ${countries.length} countries, ${geoms.length} geometries; no shape: ${countries.filter((c) => !c.hasShape).map((c) => c.code).join(', ')}`);
