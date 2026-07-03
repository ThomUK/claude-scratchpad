// Engine validation — run with: node tests/engine.test.mjs
import { readFileSync } from 'node:fs';
import { meanWaitFor, targetListSize, impliedPerformance, glidePath, calendar, runScenario, ymDiff, shapeFactor, runDiagnostics, runCancer } from '../js/engine.js';

const dm01 = JSON.parse(readFileSync(new URL('../data/dm01.json', import.meta.url)));
const cancer = JSON.parse(readFileSync(new URL('../data/cancer.json', import.meta.url)));

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
{
  const refWk = baseline.tfcs.reduce((a, t) => a + t.referralsWk, 0);
  ok(close(refWk, 4531, 5), `seeded demand ${refWk.toFixed(0)}/wk (Feb-Apr working-day-normalised mean)`);
  ok(close(shapeFactor(85166, 0.628, refWk * keep), 1.16, 0.1), `trust census shape factor ≈ ${shapeFactor(85166, 0.628, refWk * keep).toFixed(2)} (front-loaded vs exponential)`);
}
// per-TFC calibrated growth is used where seeded; trust fallback otherwise
{
  const seeded = baseline.tfcs.filter((t) => 'demandGrowthPctYr' in t);
  ok(seeded.length >= 10, `per-TFC growth seeded for ${seeded.length}/${baseline.tfcs.length} TFCs (pre-EPR pair)`);
  const t = { ...baseline.tfcs[0], demandGrowthPctYr: 6 };
  const lv = { ...baseline.levers, demandGrowthAdjPctYr: 1 };
  const one = runScenario({ ...baseline, tfcs: [t] }, { levers: lv });
  const d = one.perTfc[0].series.demandMo;
  const annual = Math.pow(d[12] / d[0], 1);
  ok(close(annual, 1.07, 0.005), `per-TFC growth + adjustment applied (12-mo demand ratio ${annual.toFixed(3)} ≈ 1.07)`);
}
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

console.log('— booking-discipline drift (kEndScale) & occupancy alignment —');
{
  // occupancy: spine and UEC must divide by the same target so bed totals add
  const uecSeed = JSON.parse(readFileSync(new URL('../data/uec.json', import.meta.url)));
  ok(baseline.levers.bedOccupancy === uecSeed.levers.bedOccupancyTarget,
     `spine bedOccupancy (${baseline.levers.bedOccupancy}) = UEC bedOccupancyTarget (${uecSeed.levers.bedOccupancyTarget})`);
  // kEndScale = 1 (default) is a no-op; t=0 anchor holds for any scale
  const hi = runScenario(baseline, { levers: { kEndScale: 1.3 } });
  const lo = runScenario(baseline, { levers: { kEndScale: 0.8 } });
  ok(close(hi.trust.impliedPct[0], res.trust.impliedPct[0], 1e-6), 'kEndScale leaves the published t=0 anchor untouched');
  const iEnd = res.cal.length - 1;
  ok(hi.trust.targetList[iEnd] > res.trust.targetList[iEnd] * 1.2,
     `k drift ×1.3 raises the end sustainable list (${Math.round(res.trust.targetList[iEnd]).toLocaleString()} → ${Math.round(hi.trust.targetList[iEnd]).toLocaleString()})`);
  // direction check: LOWER k → smaller sustainable list → MORE clearance work
  ok(lo.trust.requiredStopsMo.reduce((a, b) => a + b, 0) > res.trust.requiredStopsMo.reduce((a, b) => a + b, 0),
     'k drift ×0.8 (towards memoryless) deepens the clearance requirement (smaller sustainable list)');
  ok(hi.trust.requiredStopsMo.reduce((a, b) => a + b, 0) < res.trust.requiredStopsMo.reduce((a, b) => a + b, 0),
     'k drift ×1.3 (FIFO-like) eases the clearance requirement (larger list tolerated at the same %)');
  // sustainable list scales ~linearly with k at the horizon
  const ratio = hi.trust.targetList[iEnd] / res.trust.targetList[iEnd];
  ok(close(ratio, 1.3, 0.02), `end sustainable list scales linearly with k (ratio ${ratio.toFixed(3)} ≈ 1.30)`);
}

console.log('— activity conversion sanity —');
const req0 = res.trust.requiredStopsMo[0];
ok(res.trust.opAttendancesMo[0] > req0, 'OP attendances > clock stops (follow-ups included)');
ok(res.trust.opSlotsMo[0] > res.trust.opAttendancesMo[0], 'slots > attendances (DNA + utilisation uplift)');
ok(res.trust.theatreSessionsMo[0] > 0 && res.trust.theatreSessionsMo[0] < req0, 'theatre sessions plausible');
ok(res.trust.bedsRequired[0] > 0 && res.trust.bedsRequired[0] < 1663, `elective beds required ${res.trust.bedsRequired[0].toFixed(0)} < total trust beds`);

console.log('— diagnostics (DM01) module —');
{
  const d = runDiagnostics(dm01, { startYM: '2026-07' });
  const j0 = 0, j27 = ymDiff('2026-07', '2027-04'), j29 = ymDiff('2026-07', '2029-04');
  ok(close(d.total.list[j0], 25065, 1), `opening DM01 list = ${Math.round(d.total.list[j0]).toLocaleString()} (published Apr-26)`);
  ok(close(d.total.impliedPct[j0], 57.3, 0.6), `opening implied <6wk ${d.total.impliedPct[j0].toFixed(1)}% ≈ published 57.3%`);
  ok(d.total.impliedPct[j27] >= 94.5, `Apr-27 implied ${d.total.impliedPct[j27].toFixed(1)}% ≥ 95% (tol)`);
  ok(d.total.impliedPct[j29] >= 98.5, `Apr-29 implied ${d.total.impliedPct[j29].toFixed(1)}% ≥ 99% (tol)`);
  ok(close(meanWaitFor(0.95, 6), 2.0, 0.01), `meanWaitFor(0.95, 6wk) = ${meanWaitFor(0.95, 6).toFixed(2)} wk`);
  const m0 = d.perMod[0].series;
  ok(close(m0.list[5], m0.list[4] + m0.demandMo[4] - m0.requiredTestsMo[4], 0.5), 'DM01 list conservation holds');
  console.log(`  DM01 peak required tests/mo: ${Math.round(Math.max(...d.total.requiredTestsMo)).toLocaleString()} vs current ${Math.round(d.total.currentTestsMo[0]).toLocaleString()}`);
}

console.log('— cancer (CWT) module —');
{
  const c = runCancer(cancer, { startYM: '2026-07' });
  const j0 = 0, j27 = ymDiff('2026-07', '2027-04'), j29 = ymDiff('2026-07', '2029-04');
  ok(close(c.perStd.fds.series.glidePct[j0], 71.0, 0.1), `FDS glide starts at published ${c.perStd.fds.series.glidePct[j0].toFixed(1)}%`);
  ok(close(c.perStd.fds.series.glidePct[j27], 80, 1e-9), 'FDS glide hits 80% at Apr-27');
  ok(close(c.perStd.d31.series.glidePct[j27], 96, 1e-9), '31-day glide hits 96% at Apr-27');
  ok(close(c.perStd.d62.series.glidePct[j27], 70, 1e-9), '62-day glide hits interim 70% at Apr-27');
  ok(close(c.perStd.d62.series.glidePct[j29], 85, 1e-9), '62-day glide hits constitutional 85% at Apr-29');
  // at t=0 required timely equals today's timely rate (no gap yet)
  const s62 = c.perStd.d62.series;
  ok(close(s62.requiredTimelyMo[j0], s62.currentRateTimelyMo[j0], 0.5), '62-day required = current timely at t=0');
  ok(close(s62.volumeMo[j0], 444, 0.5), `62-day cohort ${s62.volumeMo[j0].toFixed(0)}/mo (published Apr-26)`);
  // volume identity: required timely + breaches = cohort
  ok(c.cal.every((_, i) => close(s62.requiredTimelyMo[i] + s62.breachesMo[i], s62.volumeMo[i], 1e-6)), 'timely + breaches = cohort (all months)');
  // growth lever compounds annually on volumes
  const g = runCancer(cancer, { levers: { demandGrowthPctYr: 6 } });
  ok(close(g.perStd.fds.series.volumeMo[12] / g.perStd.fds.series.volumeMo[0], 1.06, 0.005), 'growth lever compounds to +6% over 12 months');
  const extra62 = s62.extraTimelyMo[j29];
  console.log(`  62-day: extra timely treatments/mo at Apr-29 = ${extra62.toFixed(0)} (${(100 * extra62 / s62.volumeMo[j29]).toFixed(0)}% of cohort)`);
  // referral → treated-cancer conversion block (seeded from the combined CSV)
  const conv = cancer.conversion;
  ok(conv && conv.sites.length >= 8, `conversion block seeded (${conv.sites.length} site groups)`);
  ok(close(conv.sites.reduce((a, s) => a + s.referralsMo, 0), conv.referralsMo, 0.5), 'site referrals sum to USC total');
  ok(close(conv.sites.reduce((a, s) => a + s.treatedMo, 0), conv.treatedMo, 0.5), 'site treated sum to USC 62-day total');
  ok(close(conv.convPct, 100 * conv.treatedMo / conv.referralsMo, 0.06), `treated conversion ${conv.convPct}% (national benchmark ≈ 7%)`);
}

console.log('— UEC module —');
{
  const { runUec } = await import('../js/engine.js');
  const uec = JSON.parse(readFileSync(new URL('../data/uec.json', import.meta.url)));
  const u = runUec(uec, { startYM: '2026-07' });
  const s = u.series, j0 = 0, j27 = ymDiff('2026-07', '2027-04'), j28 = ymDiff('2026-07', '2028-04'), j29 = ymDiff('2026-07', '2029-04');
  ok(close(s.attMo[j0], 24214, 1), `opening all-type attendances ${s.attMo[j0].toFixed(0)}/mo (published Apr-26)`);
  ok(close(s.glidePct[j0], 66.9, 0.1), `4h glide starts at published ${s.glidePct[j0].toFixed(1)}%`);
  ok(close(s.glidePct[j27], 82, 1e-9), '4h glide hits 82% at Apr-27 (MTPF objective)');
  // derived type-1: non-T1 streams held at today's performance
  ok(s.glideT1Pct[j0] < s.glidePct[j0] - 15, `type-1 implied starts well below all-types (${s.glideT1Pct[j0].toFixed(1)}% vs ${s.glidePct[j0].toFixed(1)}%)`);
  ok(s.glideT1Pct[j29] > 88 && s.glideT1Pct[j29] < 100, `type-1 must reach ${s.glideT1Pct[j29].toFixed(1)}% for 95% all-types`);
  {
    // arithmetic identity: sT1×T1 + (1−sT1)×nonT1 = all-types glide
    const sT1 = uec.current.att.t1 / uec.current.attAll;
    const recon = sT1 * s.glideT1Pct[j29] + (1 - sT1) * s.pctNonT1;
    ok(close(recon, 95, 0.1), `T1/non-T1 shares reconstruct the all-types milestone (${recon.toFixed(1)} ≈ 95)`);
  }
  ok(close(s.glidePct[j29], 95, 1e-9), '4h glide hits constitutional 95% at Apr-29');
  ok(close(s.dta12Mo[j0], 819, 1), `12h DTA starts at published ${s.dta12Mo[j0].toFixed(0)}/mo`);
  ok(s.dta12Mo[j28] < 1 && s.dta12Mo[u.cal.length - 1] === 0, '12h DTA reaches zero by Apr-28 and stays there');
  // Little's Law: occupied = daily admissions × LOS; open = occupied / target
  const expOcc = (uec.current.admTotal / 30.4) * uec.levers.emergencyLOSDays;
  ok(close(s.emergencyOccupiedBeds[j0], expOcc, 0.5), `emergency occupied beds ${s.emergencyOccupiedBeds[j0].toFixed(0)} = λ×W`);
  ok(close(s.emergencyOpenBedsNeeded[j0], expOcc / uec.levers.bedOccupancyTarget, 0.5), 'open beds = occupied ÷ occupancy target');
  // implied LOS reproduces the winter occupied base NET of the elective share
  // (so stacking the RTT spine's elective beds on top is not double-counting)
  const w = uec.beds.winters['W2025-26'];
  ok(uec.electiveOccupiedEstimate > 20 && uec.electiveOccupiedEstimate < 150,
     `elective occupied estimate ${uec.electiveOccupiedEstimate} beds (from RTT baseline current activity)`);
  ok(close(s.emergencyOccupiedBeds[j0], w.adultGA.occupied - uec.electiveOccupiedEstimate, 15),
     `emergency occupied ${s.emergencyOccupiedBeds[j0].toFixed(0)} ≈ winter occupied ${w.adultGA.occupied} − elective ${uec.electiveOccupiedEstimate}`);
  ok(s.emergencyOccupiedBeds[j0] < w.adultGA.occupied - 20, 'emergency line no longer absorbs the whole pool (decomposition is real)');
  ok(w.adultGA.occupancyPct > 92, `winter 2025-26 occupancy ${w.adultGA.occupancyPct}% above the 92% norm`);
  // handover seed: cross-validated snapshot vs timeseries, thresholds ordered
  const ho = uec.handover;
  const apr26 = ho.months['Apr-26'];
  ok(close(apr26.meanMin, 31.3, 0.1), `Apr-26 mean handover ${apr26.meanMin} min (snapshot)`);
  const tsApr26 = ho.timeseries.find((r) => r.ym === '2026-04');
  ok(close(tsApr26.meanMin, apr26.meanMin, 0.1), 'timeseries Apr-26 matches the snapshot workbook');
  ok(tsApr26.handovers === apr26.handovers, `timeseries count ${tsApr26.handovers} matches snapshot`);
  ok(apr26.over15 >= apr26.over30 && apr26.over30 >= apr26.over60, 'threshold counts are nested (>15 ≥ >30 ≥ >60)');
  ok(ho.timeseries.length >= 30, `handover timeseries spans ${ho.timeseries.length} months`);
  const peak = Math.max(...ho.timeseries.map((r) => r.meanMin));
  ok(close(peak, 84.8, 0.1) && ho.timeseries[ho.timeseries.length - 1].meanMin < peak / 2, `Jan-24 peak ${peak} min has more than halved`);
}

console.log('— workforce module —');
{
  const { runWorkforce } = await import('../js/engine.js');
  const wf = JSON.parse(readFileSync(new URL('../data/workforce.json', import.meta.url)));
  ok(close(wf.groups.total.fte, 17662, 1), `total FTE ${wf.groups.total.fte.toLocaleString()} (published Apr-26)`);
  ok(close(wf.groups.nurses.fte + wf.groups.midwives.fte + wf.groups.doctors.fte + wf.groups.stt.fte
     + wf.groups.supportClinical.fte + wf.groups.infrastructure.fte + 15,
     wf.groups.total.fte, 25), 'staff groups + unknown(15) sum to total');
  // flat activity, zero productivity, zero growth adj → required(0) = supply(0)
  const cal = calendar('2026-07', '2030-03');
  const flat = cal.map(() => 1);
  const w0 = runWorkforce(wf, flat, { levers: { productivityPctYr: 0, workforceGrowthAdjPctYr: 0 } });
  ok(close(w0.totals.requiredClinical[0], w0.totals.supplyClinical[0], 0.5), 'required = supply at t=0');
  // rising activity opens a gap when supply trend is flat-ish
  const rising = cal.map((_, i) => 1 + 0.10 * (i / 12));
  const w1 = runWorkforce(wf, rising, { levers: { productivityPctYr: 0, workforceGrowthAdjPctYr: 0 } });
  const iEnd = cal.length - 1;
  ok(w1.totals.gapClinical[iEnd] > 0, `+10%/yr activity opens a clinical gap (${Math.round(w1.totals.gapClinical[iEnd]).toLocaleString()} FTE by Mar-30)`);
  // productivity substitutes for workforce: 10%/yr activity with 10%/yr productivity → no gap
  const w2 = runWorkforce(wf, cal.map((_, i) => Math.pow(1.10, i / 12)), { levers: { productivityPctYr: 10, workforceGrowthAdjPctYr: 0 } });
  const reqEnd = w2.totals.requiredClinical[iEnd];
  ok(close(reqEnd, w2.totals.requiredClinical[0], 1), 'productivity exactly offsets matching activity growth');
  // infrastructure is activity-independent
  ok(close(w1.perGroup.infrastructure.required[iEnd], wf.groups.infrastructure.fte, 0.1), 'infrastructure requirement stays flat');
  // supply follows calibrated per-group trend
  const ng = wf.groups.nurses.growthPctYr / 100;
  ok(close(w0.perGroup.nurses.supply[12] / w0.perGroup.nurses.supply[0], 1 + ng, 0.002), `nurse supply compounds at calibrated ${wf.groups.nurses.growthPctYr}%/yr`);
}

console.log('— anchored activity index & required productivity —');
{
  const { buildActivityIndex, requiredProductivityPctYr, runWorkforce } = await import('../js/engine.js');
  const wfSeed = JSON.parse(readFileSync(new URL('../data/workforce.json', import.meta.url)));
  const uecSeed = JSON.parse(readFileSync(new URL('../data/uec.json', import.meta.url)));
  const idx = buildActivityIndex(baseline, dm01, cancer, uecSeed);
  ok(idx[0] > 1.05, `index opens at ${idx[0].toFixed(2)} — the month-0 recovery step-up is not absorbed for free`);
  const rttStep = runScenario(baseline).trust.requiredStopsMo[0] / runScenario(baseline).trust.currentStopsMo[0];
  ok(idx[0] < rttStep, 'blended index step-up is below the pure RTT step-up (emergency anchors at 1)');
  ok(idx.every((v) => v > 0.9), 'index never collapses below plausible bounds');
  // required-productivity solver: closes the Apr-29 clinical gap at trend headcount
  const p = requiredProductivityPctYr(wfSeed, idx);
  ok(p > 0.5 && p < 8, `required productivity ${p}%/yr is in a plausible band`);
  const at = runWorkforce(wfSeed, idx, { levers: { productivityPctYr: p } });
  const i29 = ymDiff(at.cal[0], '2029-04');
  ok(Math.abs(at.totals.gapClinical[i29]) < 25, `gap at Apr-29 ≈ 0 at the solved rate (${Math.round(at.totals.gapClinical[i29])} FTE)`);
  const below = runWorkforce(wfSeed, idx, { levers: { productivityPctYr: p - 0.5 } });
  ok(below.totals.gapClinical[i29] > 0, 'half a point less productivity leaves a positive gap (monotonic)');
}

console.log('— explainer maths (census vs flow) —');
{
  const { erlangCdf, censusCdf, runClearanceSim } = await import('../js/explainmath.js');
  // memoryless (k=1): both cameras read 1 − e^(−T/W)
  const W = 10, T = 18;
  const expct = 1 - Math.exp(-T / W);
  ok(close(erlangCdf(T, 1, W), expct, 1e-9), `k=1 flow CDF = 1 − e^(−T/W) = ${(100 * expct).toFixed(1)}%`);
  ok(close(censusCdf(T, 1, W), expct, 2e-3), `k=1 census CDF agrees (memoryless: cameras read the same)`);
  // strict-FIFO limit (large k): flow steps at W, census is ~linear T/W below W
  ok(erlangCdf(0.8 * W, 8, W) < 0.35 && erlangCdf(1.3 * W, 8, W) > 0.75, 'k=8 flow CDF steps around the mean wait');
  ok(close(censusCdf(0.5 * W, 8, W), 0.5, 0.05), 'k=8 census CDF ≈ T/W below the mean (linear ages)');
  // Erlang mean is W regardless of k (integral of survival = mean)
  ok(close(censusCdf(1000, 4, W) * W, W, 0.01), 'census CDF normalises (∫S = W)');
  // clearance drive: census improves during the drive while flow collapses, both end high
  const sim = runClearanceSim();
  ok(sim.censusPct[50] > sim.censusPct[25] + 10, `drive lifts census reading (${sim.censusPct[25].toFixed(0)}% → ${sim.censusPct[50].toFixed(0)}%)`);
  ok(sim.flowPct[40] < sim.flowPct[24] - 20, `drive tanks flow reading (${sim.flowPct[24].toFixed(0)}% → ${sim.flowPct[40].toFixed(0)}%)`);
  ok(sim.censusPct[103] > 78 && sim.flowPct[103] > 78, `both cameras read high after the drive (census ${sim.censusPct[103].toFixed(0)}%, flow ${sim.flowPct[103].toFixed(0)}%)`);
}

console.log('— OP attendances (tandem queue & attribution) —');
{
  const { runTandemSim } = await import('../js/explainmath.js');
  // balanced capacities → steady state (queues stabilise, no growth)
  const bal = runTandemSim({ referralsWk: 100, newSlotsWk: 100, treatSlotsWk: 60, conversionPct: 60, q1Start: 0, q2Start: 0 });
  const n = bal.q1.length - 1;
  ok(bal.q1[n] < 105 && bal.q2[n] < 105, 'balanced tandem queue stabilises');
  // starve the front door → queue 1 grows linearly, queue 2 drains
  const starve = runTandemSim({ referralsWk: 100, newSlotsWk: 80, treatSlotsWk: 60, conversionPct: 60 });
  ok(starve.q1[n] > starve.q1[0] + 100 * (20 / 100) * n * 0.9, 'under-served front door: queue 1 grows ~20/wk');
  ok(starve.q2[n] < 100, 'queue 2 drains when fed less than treatment capacity');
  // treatment surge alone leaves queue 1 untouched (the queue MOVES, not shrinks)
  const surge = runTandemSim({ referralsWk: 100, newSlotsWk: 100, treatSlotsWk: 120, conversionPct: 60 });
  ok(close(surge.q1[n], runTandemSim({ referralsWk: 100, newSlotsWk: 100, treatSlotsWk: 62, conversionPct: 60 }).q1[n], 1e-9),
     'treatment surge does not touch the first-OP queue');
  // conservation: total = q1 + q2 each week
  ok(surge.total.every((v, i) => Math.abs(v - (surge.q1[i] + surge.q2[i])) < 1e-9), 'tandem conservation holds');
  // attribution: firsts follow referrals — OP attendances minus FU equals raw referrals
  const t = baseline.tfcs[0];
  const one = runScenario({ ...baseline, tfcs: [t] });
  const s = one.perTfc[0].series;
  const keep = 1 - baseline.levers.otherRemovalsPct;
  for (const i of [0, 12, 30]) {
    const firsts = s.opAttendancesMo[i] - s.requiredStopsMo[i] * t.newToFuRatio;
    const rawRefsMo = s.demandMo[i] / keep;
    if (!close(firsts, rawRefsMo, 0.5)) { ok(false, `firsts ≠ raw referrals at month ${i}`); break; }
    if (i === 30) ok(true, 'first attendances track raw referrals at t=0, 12, 30 (not the clearance surge)');
  }
}

console.log('— headline numbers (eyeball) —');
console.log(`  peak required stops/mo: ${Math.round(Math.max(...res.trust.requiredStopsMo)).toLocaleString()} vs current ${Math.round(res.trust.currentStopsMo[0]).toLocaleString()}`);
console.log(`  list: ${Math.round(res.trust.list[0]).toLocaleString()} → ${Math.round(res.trust.list[res.cal.length - 1]).toLocaleString()} (Mar-30)`);
console.log(`  OP slots/mo at peak: ${Math.round(Math.max(...res.trust.opSlotsMo)).toLocaleString()}`);
console.log(`  theatre sessions/mo at peak: ${Math.round(Math.max(...res.trust.theatreSessionsMo)).toLocaleString()}`);

process.exit(fails ? 1 : 0);
