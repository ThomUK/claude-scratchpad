/* Demand & capacity engine — phase 1: the elective (RTT) spine.
 *
 * Pure functions, no DOM: runs identically in the browser and under Node for
 * the test suite. Monthly time-steps from the scenario start to March 2030.
 *
 * Method (Fong, House, Walton et al. 2022, "Understanding Waiting List
 * Pressures"; NHSRwaitinglist):
 *   - In steady state waits are ~exponential, so achieving p% within 18 weeks
 *     needs mean wait W = -18/ln(1-p) weeks.
 *   - Little's Law: sustainable list size at performance p = weeklyDemand × W.
 *   - Required treatment (clock-stop) rate = demand + phased clearance of the
 *     excess list down to the target size by the next milestone.
 * Clock stops are then converted to deliverable activity: outpatient slots
 * (DNA + utilisation adjusted), theatre sessions (day-case split, cases per
 * session, capped utilisation), elective bed-days, and diagnostic tests.
 */

export const WKS_PER_MONTH = 52 / 12;

// --- calendar ---------------------------------------------------------------
export function ymAdd(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export function ymDiff(a, b) { // months from a to b
  const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
  return (yb * 12 + mb) - (ya * 12 + ma);
}
export function calendar(startYM, endYM = '2030-03') {
  const n = ymDiff(startYM, endYM) + 1;
  return Array.from({ length: n }, (_, i) => ymAdd(startYM, i));
}

// --- queueing core ----------------------------------------------------------
export function meanWaitFor(pFrac, weeks = 18) {
  if (pFrac <= 0 || pFrac >= 1) throw new Error('p must be in (0,1)');
  return -weeks / Math.log(1 - pFrac);
}
export function targetListSize(weeklyDemand, pFrac, weeks = 18) {
  return weeklyDemand * meanWaitFor(pFrac, weeks);
}
// Implied %<18wk of a list of given size under exponential shape (Little inverse).
export function impliedPerformance(list, weeklyDemand, weeks = 18) {
  if (list <= 0) return 1;
  const W = list / weeklyDemand;
  return 1 - Math.exp(-weeks / W);
}

// --- trajectory -------------------------------------------------------------
// Monthly performance glide from the start position through the milestones,
// linear between points, never below the start position, held after the last.
export function glidePath(cal, startPct, milestones) {
  const pts = [{ ym: cal[0], pct: startPct }, ...milestones]
    .map((p) => ({ i: ymDiff(cal[0], p.ym), pct: p.pct }))
    .filter((p) => p.i >= 0)
    .sort((a, b) => a.i - b.i);
  return cal.map((ym, i) => {
    let prev = pts[0], next = pts[pts.length - 1];
    for (let k = 0; k < pts.length - 1; k++) {
      if (i >= pts[k].i && i <= pts[k + 1].i) { prev = pts[k]; next = pts[k + 1]; break; }
    }
    let pct;
    if (i <= pts[0].i) pct = pts[0].pct;
    else if (i >= pts[pts.length - 1].i) pct = pts[pts.length - 1].pct;
    else pct = prev.pct + (next.pct - prev.pct) * (i - prev.i) / (next.i - prev.i);
    return Math.max(startPct, pct);
  });
}

// Census-shape calibration. Published lists are rarely exponential-shaped
// (trusts constrain long waits), so anchor the implied-performance curve to the
// ACTUAL starting position: k = 1 for a perfect exponential steady state; k > 1
// means the census is front-loaded (better %<18wk than exponential predicts for
// its size). k then scales the sustainable-list-size relationship consistently.
export function shapeFactor(list, pct18Frac, effRefWk, weeks = 18) {
  if (list <= 0 || effRefWk <= 0) return 1;
  const p = Math.min(0.98, Math.max(0.05, pct18Frac));
  const k = (-Math.log(1 - p) * list) / (weeks * effRefWk);
  return Math.min(4, Math.max(0.25, k));
}

// --- per-TFC model ----------------------------------------------------------
// Returns monthly series for one treatment function.
export function runTfc(tfc, levers, cal, milestones) {
  const n = cal.length;
  // Per-TFC calibrated growth where seeded (clean pre-EPR pair), else the trust
  // baseline; the adjustment lever shifts all TFCs together for scenarios.
  const growthPctYr = (tfc.demandGrowthPctYr ?? levers.demandGrowthPctYr ?? 0)
    + (levers.demandGrowthAdjPctYr ?? 0);
  const growth = Math.pow(1 + growthPctYr / 100, 1 / 12);
  // Share of referrals that leave the list without a counted clock stop
  // (DNA discharges, duplicates, deaths, validation) — a real feature of RTT
  // accounting: nationally New RTT Periods exceed completed pathways.
  const keep = 1 - (levers.otherRemovalsPct ?? 0);
  const glide = glidePath(cal, tfc.pct18, milestones);
  const msIdx = milestones.map((m) => ymDiff(cal[0], m.ym)).filter((i) => i > 0);
  const k = shapeFactor(tfc.list, tfc.pct18 / 100, tfc.referralsWk * keep);

  const s = {
    ym: cal, list: new Array(n), targetList: new Array(n), glidePct: glide,
    impliedPct: new Array(n), demandMo: new Array(n), requiredStopsMo: new Array(n),
    currentStopsMo: new Array(n), opAttendancesMo: new Array(n), opSlotsMo: new Array(n),
    theatreCasesMo: new Array(n), theatreSessionsMo: new Array(n),
    dayCasesMo: new Array(n), ipElectivesMo: new Array(n), bedsRequired: new Array(n),
    diagnosticsMo: new Array(n),
  };

  let L = tfc.list;
  let refWk = tfc.referralsWk;
  for (let i = 0; i < n; i++) {
    const effRefWk = refWk * keep;              // referrals that need a clock stop
    const demandMo = effRefWk * WKS_PER_MONTH;
    // clearance phased to the NEXT milestone (or end of horizon)
    const nextMs = msIdx.find((m) => m > i) ?? (n - 1);
    const monthsLeft = Math.max(1, nextMs - i);
    const pAtMs = glide[Math.min(nextMs, n - 1)] / 100;
    const refWkAtMs = effRefWk * Math.pow(growth, monthsLeft);
    const LtargetMs = k * targetListSize(refWkAtMs, pAtMs);
    const clearance = Math.max(0, L - LtargetMs) / monthsLeft;
    const required = demandMo + clearance;

    // activity conversion
    const stops = required;
    const admitted = stops * tfc.admittedShare;
    const nonAdmitted = stops - admitted;
    const firsts = stops;                          // every stopping pathway had a first attendance
    const fus = stops * tfc.newToFuRatio;
    const attendances = firsts + fus;
    const slots = attendances / (1 - levers.dnaRate) / levers.clinicUtilisation;
    const cases = admitted;
    const sessions = (cases / tfc.casesPerSession) / levers.theatreUtilisation;
    const dayCases = cases * tfc.dayCaseRate;
    const ip = cases - dayCases;
    const bedDays = ip * tfc.losElectiveIP;
    const beds = bedDays / 30.4 / levers.bedOccupancy;
    const diags = refWk * WKS_PER_MONTH * tfc.diagPerReferral;   // all referrals drive diagnostics

    s.list[i] = L;
    s.targetList[i] = k * targetListSize(effRefWk, glide[i] / 100);
    s.impliedPct[i] = 100 * impliedPerformance(L, k * effRefWk);
    s.demandMo[i] = demandMo;
    s.requiredStopsMo[i] = required;
    s.currentStopsMo[i] = tfc.clockStopsWk * WKS_PER_MONTH;
    s.opAttendancesMo[i] = attendances;
    s.opSlotsMo[i] = slots;
    s.theatreCasesMo[i] = cases;
    s.theatreSessionsMo[i] = sessions;
    s.dayCasesMo[i] = dayCases;
    s.ipElectivesMo[i] = ip;
    s.bedsRequired[i] = beds;
    s.diagnosticsMo[i] = diags;
    void nonAdmitted;

    // advance state assuming required capacity is delivered
    L = Math.max(0, L + demandMo - required);
    refWk *= growth;
  }
  return s;
}

// --- trust rollup -----------------------------------------------------------
export function runScenario(baseline, opts = {}) {
  const cal = calendar(opts.startYM || baseline._provenance.modelStart, opts.endYM || '2030-03');
  const milestones = opts.milestones || [
    { ym: '2027-04', pct: 65 }, { ym: '2028-04', pct: 80 }, { ym: '2029-04', pct: 92 },
  ];
  const levers = { ...baseline.levers, ...(opts.levers || {}) };
  const perTfc = baseline.tfcs.map((t) => ({ tfc: t, series: runTfc({ ...t, ...(opts.tfcOverrides?.[t.code] || {}) }, levers, cal, milestones) }));

  const n = cal.length;
  const sum = (key) => cal.map((_, i) => perTfc.reduce((a, r) => a + r.series[key][i], 0));
  const trust = {
    ym: cal,
    list: sum('list'), targetList: sum('targetList'),
    demandMo: sum('demandMo'), requiredStopsMo: sum('requiredStopsMo'), currentStopsMo: sum('currentStopsMo'),
    opAttendancesMo: sum('opAttendancesMo'), opSlotsMo: sum('opSlotsMo'),
    theatreCasesMo: sum('theatreCasesMo'), theatreSessionsMo: sum('theatreSessionsMo'),
    dayCasesMo: sum('dayCasesMo'), ipElectivesMo: sum('ipElectivesMo'),
    bedsRequired: sum('bedsRequired'), diagnosticsMo: sum('diagnosticsMo'),
    // trust %<18wk = share of the combined list within 18 weeks
    impliedPct: cal.map((_, i) => {
      const within = perTfc.reduce((a, r) => a + r.series.list[i] * r.series.impliedPct[i] / 100, 0);
      const total = perTfc.reduce((a, r) => a + r.series.list[i], 0);
      return total > 0 ? 100 * within / total : 100;
    }),
  };
  return { cal, milestones, levers, perTfc, trust };
}
