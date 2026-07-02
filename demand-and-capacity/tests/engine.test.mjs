// Engine validation — run with: node tests/engine.test.mjs
import { readFileSync } from 'node:fs';
import { meanWaitFor, targetListSize, impliedPerformance, glidePath, calendar, runScenario, ymDiff, shapeFactor } from '../js/engine.js';

const baseline = JSON.parse(readFileSync(new URL('../data/baseline.json', import.meta.url)));
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${msg}`); if (!cond) fails++; };
const close = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('— queueing core —');
ok(close(meanWaitFor(0.92), 7.128, 0.01), `meanWaitFor(0.92) = ${meanWaitFor(0.92).toFixed(3)} ≈ 7.128 wk`);
ok(close(meanWaitFor(0.65), 17.145, 0.05), `meanWaitFor(0.65) = ${meanWaitFor(0.65).toFixed(3)} ≈ 17.14 wk`);
const w = 100;
for (const p of [0.5, 0.65, 0.8, 0.92, 0.99]) {
  const L = targetListSize(w, p);
  ok(close(impliedPerformance(L, w), p, 1e-9), `round-trip targetList↔impliedPerformance at p=${p}`);
}

console.log('— glide path —');
const cal = calendar('2026-07', '2030-03');
const glide = glidePath(cal, 63.4, [{ ym: '2027-04', pct: 65 }, { ym: '2028-04', pct: 80 }, { ym: '2029-04', pct: 92 }]);
ok(glide.length === cal.length, `glide covers ${cal.length} months (Jul-26 → Mar-30)`);
ok(close(glide[ymDiff('2026-07', '2027-04')], 65, 1e-9), 'glide hits 65 at Apr-27');
ok(close(glide[ymDiff('2026-07', '2028-04')], 80, 1e-9), 'glide hits 80 at Apr-28');
ok(close(glide[ymDiff('2026-07', '2029-04')], 92, 1e-9), 'glide hits 92 at Apr-29');
ok(glide[cal.length - 1] === 92, 'glide holds 92 to Mar-30');
ok(glide.every((v, i, a) => i === 0 || v >= a[i - 1] - 1e-9), 'glide is non-decreasing');

console.log('— scenario run —');
const res = runScenario(baseline);
const i0 = 0, iM1 = ymDiff('2026-07', '2027-04'), iM2 = ymDiff('2026-07', '2028-04'), iM3 = ymDiff('2026-07', '2029-04');
ok(close(res.trust.list[i0], 85166, 1), `opening trust list = ${Math.round(res.trust.list[i0]).toLocaleString()} (published Apr-26)`);
ok(close(res.trust.impliedPct[i0], 62.8, 0.5), `opening implied performance ${res.trust.impliedPct[i0].toFixed(1)}% ≈ published 62.8% (shape-calibrated)`);
// shape calibration anchors every TFC's implied performance to its published %<18wk
const keep = 1 - baseline.levers.otherRemovalsPct;
const worst = Math.max(...res.perTfc.map((r) => Math.abs(r.series.impliedPct[0] - Math.min(95, Math.max(5, r.tfc.pct18)))));
ok(worst < 0.75, `per-TFC implied(t=0) matches published pct18 (worst |Δ| = ${worst.toFixed(2)}pp)`);
ok(close(shapeFactor(85166, 0.628, 4410 * keep), 1.32, 0.1), `trust census shape factor ≈ ${shapeFactor(85166, 0.628, 4410 * keep).toFixed(2)} (front-loaded vs exponential)`);
ok(res.trust.impliedPct[iM1] >= 64.9, `Apr-27 implied ${res.trust.impliedPct[iM1].toFixed(1)}% ≥ 65% (tol)`);
ok(res.trust.impliedPct[iM2] >= 79.5, `Apr-28 implied ${res.trust.impliedPct[iM2].toFixed(1)}% ≥ 80% (tol)`);
ok(res.trust.impliedPct[iM3] >= 91.5, `Apr-29 implied ${res.trust.impliedPct[iM3].toFixed(1)}% ≥ 92% (tol)`);
ok(res.trust.requiredStopsMo.every((v) => v >= 0), 'required stops never negative');
ok(res.trust.list.every((v) => v >= 0), 'list never negative');
// conservation: L(t+1) = L(t) + demand - required (per TFC)
const t0 = res.perTfc[0].series;
ok(close(t0.list[5], t0.list[4] + t0.demandMo[4] - t0.requiredStopsMo[4], 0.5), 'list conservation holds');
// required ≥ demand while above target (clearance phase)
ok(res.trust.requiredStopsMo[0] > res.trust.demandMo[0], 'clearance phase: required > demand at start');

console.log('— activity conversion sanity —');
const req0 = res.trust.requiredStopsMo[0];
ok(res.trust.opAttendancesMo[0] > req0, 'OP attendances > clock stops (follow-ups included)');
ok(res.trust.opSlotsMo[0] > res.trust.opAttendancesMo[0], 'slots > attendances (DNA + utilisation uplift)');
ok(res.trust.theatreSessionsMo[0] > 0 && res.trust.theatreSessionsMo[0] < req0, 'theatre sessions plausible');
ok(res.trust.bedsRequired[0] > 0 && res.trust.bedsRequired[0] < 1663, `elective beds required ${res.trust.bedsRequired[0].toFixed(0)} < total trust beds`);

console.log('— headline numbers (eyeball) —');
console.log(`  peak required stops/mo: ${Math.round(Math.max(...res.trust.requiredStopsMo)).toLocaleString()} vs current ${Math.round(res.trust.currentStopsMo[0]).toLocaleString()}`);
console.log(`  list: ${Math.round(res.trust.list[0]).toLocaleString()} → ${Math.round(res.trust.list[res.cal.length - 1]).toLocaleString()} (Mar-30)`);
console.log(`  OP slots/mo at peak: ${Math.round(Math.max(...res.trust.opSlotsMo)).toLocaleString()}`);
console.log(`  theatre sessions/mo at peak: ${Math.round(Math.max(...res.trust.theatreSessionsMo)).toLocaleString()}`);

process.exit(fails ? 1 : 0);
