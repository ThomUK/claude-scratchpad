// Generates flu/data/flu_weekly.csv — ILLUSTRATIVE, SYNTHETIC data.
// NOT real NHS figures. Shaped to demonstrate the three season archetypes:
// early peak, late peak, and a low long "slow burn".
//
// The season runs over a full year on an ISO-8601 week axis that starts at
// week 14 (April), runs through week 52, then wraps to week 13 the next April.
// "pos" is that 1..52 position (pos 1 = ISO week 14); it is stored as
// season_week so the app can align and truncate seasons.
//
// Replace data/flu_weekly.csv with real NHS England weekly flu inpatient
// counts (same columns) to use this visualiser for real. See README.md.
//
// Run: node generate_data.js  (writes data/flu_weekly.csv)

const fs = require('fs');
const path = require('path');

// Tiny seeded RNG (mulberry32) so output is reproducible.
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(12345);
const gauss = () => {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const TOTAL_WEEKS = 52;
// Annual-axis position (1..52) -> ISO week. pos 1 = ISO wk 14, pos 39 = wk 52,
// pos 40 = wk 1, pos 52 = wk 13.
const isoOf = (pos) => ((14 + (pos - 1) - 1) % 52) + 1;

// Each season: a winter Gaussian bump (amplitude A) centred at annual-axis
// position muP (≈ peak timing), width sigma weeks, on a low summer baseline.
// observed: how many weeks (from pos 1) are reported — full year unless partial.
const seasons = [
  { season: '2015-16', A: 900,  muP: 44, sigma: 7.0, note: 'slow burn' },
  { season: '2016-17', A: 1800, muP: 35, sigma: 3.0, note: 'early peak' },
  { season: '2017-18', A: 3400, muP: 45, sigma: 4.0, note: 'late, severe' },
  { season: '2018-19', A: 1500, muP: 40, sigma: 3.5, note: 'mid' },
  { season: '2019-20', A: 1300, muP: 37, sigma: 3.2, note: 'early-mid' },
  { season: '2021-22', A: 350,  muP: 43, sigma: 8.0, note: 'low slow burn' },
  { season: '2022-23', A: 2600, muP: 33, sigma: 2.6, note: 'very early peak' },
  { season: '2023-24', A: 1700, muP: 41, sigma: 3.6, note: 'mid' },
  // Current season: an early-peak shape, observed through ~early January only.
  { season: '2024-25', A: 2200, muP: 35, sigma: 3.0, observed: 40, note: 'current (partial)', current: true },
];

// Low summer baseline that dips mid-summer and lifts a little in deep winter.
const baselineAt = (pos) => 25 + 12 * Math.exp(-((pos - 42) ** 2) / (2 * 12 * 12));

const rows = [['season', 'season_week', 'iso_week', 'count', 'is_current']];

for (const s of seasons) {
  const weeks = s.observed || TOTAL_WEEKS;
  for (let pos = 1; pos <= weeks; pos++) {
    const bump = s.A * Math.exp(-((pos - s.muP) ** 2) / (2 * s.sigma * s.sigma));
    const noise = gauss() * (6 + 0.04 * bump);
    const count = Math.max(0, Math.round(baselineAt(pos) + bump + noise));
    rows.push([s.season, pos, isoOf(pos), count, s.current ? 1 : 0]);
  }
}

const csv = rows.map((r) => r.join(',')).join('\n') + '\n';
const out = path.join(__dirname, 'data', 'flu_weekly.csv');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, csv);
console.log(`Wrote ${out} (${rows.length - 1} rows)`);
