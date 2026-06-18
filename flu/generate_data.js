// Generates flu/data/flu_weekly.csv — ILLUSTRATIVE, SYNTHETIC data.
// NOT real NHS figures. Shaped to demonstrate the three season archetypes:
// early peak, late peak, and a low long "slow burn".
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
  // Box–Muller
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// season_week 1 ≈ ISO week 40 (early Oct); wraps after 52.
const isoWeek = (sw) => ((40 + (sw - 1) - 1) % 52) + 1;

// Each season: a Gaussian bump (amplitude A at season-week mu, width sigma)
// on a small baseline, plus light noise. weeks = how many weeks reported.
const seasons = [
  { season: '2015-16', A: 900,  mu: 18, sigma: 5.0, weeks: 30, note: 'slow burn' },
  { season: '2016-17', A: 1800, mu: 8,  sigma: 2.3, weeks: 30, note: 'early peak' },
  { season: '2017-18', A: 3400, mu: 14, sigma: 3.2, weeks: 30, note: 'late, severe' },
  { season: '2018-19', A: 1500, mu: 10, sigma: 2.8, weeks: 30, note: 'mid' },
  { season: '2019-20', A: 1300, mu: 9,  sigma: 2.6, weeks: 30, note: 'early-mid' },
  { season: '2021-22', A: 350,  mu: 16, sigma: 6.0, weeks: 30, note: 'low slow burn' },
  { season: '2022-23', A: 2600, mu: 6,  sigma: 2.0, weeks: 30, note: 'very early peak' },
  { season: '2023-24', A: 1700, mu: 11, sigma: 3.0, weeks: 30, note: 'mid' },
  // Current season: only the first few weeks observed so far (rising).
  { season: '2024-25', A: 2200, mu: 8,  sigma: 2.4, weeks: 7,  note: 'current (partial)', current: true },
];

const baseline = 30;
const rows = [['season', 'season_week', 'iso_week', 'count', 'is_current']];

for (const s of seasons) {
  for (let sw = 1; sw <= s.weeks; sw++) {
    const bump = s.A * Math.exp(-((sw - s.mu) ** 2) / (2 * s.sigma * s.sigma));
    const noise = gauss() * (8 + 0.04 * bump);
    const count = Math.max(0, Math.round(baseline + bump + noise));
    rows.push([s.season, sw, isoWeek(sw), count, s.current ? 1 : 0]);
  }
}

const csv = rows.map((r) => r.join(',')).join('\n') + '\n';
const out = path.join(__dirname, 'data', 'flu_weekly.csv');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, csv);
console.log(`Wrote ${out} (${rows.length - 1} rows)`);
