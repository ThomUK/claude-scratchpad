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
  // Booking-discipline drift: k is calibrated to TODAY's census shape and, by
  // default, held to 2030 (kEndScale = 1). The lever morphs k linearly to
  // k × kEndScale by the final milestone — FIFO-like discipline raises k (the
  // sustainable list scales linearly with it), memoryless selection lowers it
  // towards 1. t = 0 always keeps the calibrated k, preserving the published
  // %<18wk anchor.
  const kEnd = k * (levers.kEndScale ?? 1);
  const lastMs = msIdx.length ? Math.max(...msIdx) : n - 1;
  const kAt = (i) => k + (kEnd - k) * Math.min(1, i / lastMs);

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
    const LtargetMs = kAt(nextMs) * targetListSize(refWkAtMs, pAtMs);
    const clearance = Math.max(0, L - LtargetMs) / monthsLeft;
    const required = demandMo + clearance;

    // activity conversion
    const stops = required;
    const admitted = stops * tfc.admittedShare;
    const nonAdmitted = stops - admitted;
    // First OP attendances are generated by REFERRALS at the start of the
    // pathway (the other-removals cohort mostly attends before leaving), so
    // they do not surge with the clearance; follow-ups track clock stops.
    const firsts = refWk * WKS_PER_MONTH;
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
    s.targetList[i] = kAt(i) * targetListSize(effRefWk, glide[i] / 100);
    s.impliedPct[i] = 100 * impliedPerformance(L, kAt(i) * effRefWk);
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

// --- diagnostics (DM01) -------------------------------------------------------
// Same queueing core on a 6-week window: monthly required tests = demand +
// phased clearance of the excess list down to the shape-calibrated sustainable
// size for the glide-path target. Units are tests/month throughout.
export function runDiagnostic(mod, levers, cal, milestones, windowWeeks = 6) {
  const n = cal.length;
  const growthPctYr = (mod.demandGrowthPctYr ?? levers.demandGrowthPctYr ?? 0)
    + (levers.demandGrowthAdjPctYr ?? 0);
  const growth = Math.pow(1 + growthPctYr / 100, 1 / 12);
  const glide = glidePath(cal, mod.pct6, milestones);
  const msIdx = milestones.map((m) => ymDiff(cal[0], m.ym)).filter((i) => i > 0);
  const k = shapeFactor(mod.list, mod.pct6 / 100, mod.demandWk, windowWeeks);

  const s = {
    ym: cal, list: new Array(n), targetList: new Array(n), glidePct: glide,
    impliedPct: new Array(n), demandMo: new Array(n),
    requiredTestsMo: new Array(n), currentTestsMo: new Array(n),
  };
  let L = mod.list, dWk = mod.demandWk;
  for (let i = 0; i < n; i++) {
    const demandMo = dWk * WKS_PER_MONTH;
    const nextMs = msIdx.find((m) => m > i) ?? (n - 1);
    const monthsLeft = Math.max(1, nextMs - i);
    const pAtMs = glide[Math.min(nextMs, n - 1)] / 100;
    const LtargetMs = k * targetListSize(dWk * Math.pow(growth, monthsLeft), pAtMs, windowWeeks);
    const required = demandMo + Math.max(0, L - LtargetMs) / monthsLeft;
    s.list[i] = L;
    s.targetList[i] = k * targetListSize(dWk, glide[i] / 100, windowWeeks);
    s.impliedPct[i] = 100 * impliedPerformance(L, k * dWk, windowWeeks);
    s.demandMo[i] = demandMo;
    s.requiredTestsMo[i] = required;
    s.currentTestsMo[i] = mod.testsWk * WKS_PER_MONTH;
    L = Math.max(0, L + demandMo - required);
    dWk *= growth;
  }
  return s;
}

// --- workforce (phase 5: the cross-cutting constraint) ------------------------
// Requirement side: clinical FTE must scale with the activity the other modules
// say is required — an activity index (1.0 at t0), deflated by a productivity
// lever (activity per FTE per year). Supply side: each group grows at its
// calibrated trend plus an adjustment lever. Infrastructure support is treated
// as activity-independent. Bank/agency are outside the published counts, so
// gaps understate true pressure.
export const WORKFORCE_CLINICAL = ['nurses', 'midwives', 'doctors', 'stt', 'supportClinical'];

export function runWorkforce(wf, activityIdx, opts = {}) {
  const cal = calendar(opts.startYM || '2026-07', opts.endYM || '2030-03');
  const n = cal.length;
  const levers = { ...wf.levers, ...(opts.levers || {}) };
  const prod = Math.pow(1 + (levers.productivityPctYr ?? 0) / 100, 1 / 12);
  const perGroup = {};
  for (const [key, g] of Object.entries(wf.groups)) {
    if (key === 'total' || key === 'consultants') continue;
    const clinical = WORKFORCE_CLINICAL.includes(key);
    const gr = Math.pow(1 + ((g.growthPctYr ?? 0) + (levers.workforceGrowthAdjPctYr ?? 0)) / 100, 1 / 12);
    const required = new Array(n), supply = new Array(n);
    for (let i = 0; i < n; i++) {
      required[i] = clinical ? (g.fte * activityIdx[i]) / Math.pow(prod, i) : g.fte;
      supply[i] = g.fte * Math.pow(gr, i);
    }
    perGroup[key] = { group: g, clinical, required, supply };
  }
  const clin = Object.values(perGroup).filter((r) => r.clinical);
  const requiredClinical = cal.map((_, i) => clin.reduce((a, r) => a + r.required[i], 0));
  const supplyClinical = cal.map((_, i) => clin.reduce((a, r) => a + r.supply[i], 0));
  const totals = {
    ym: cal, requiredClinical, supplyClinical,
    gapClinical: cal.map((_, i) => requiredClinical[i] - supplyClinical[i]),
  };
  return { cal, levers, perGroup, totals };
}

// --- UEC (A&E 4-hour, 12-hour DTA, emergency beds) ----------------------------
// The 4-hour standard is a FLOW standard like cancer: each month's attendances
// are scored on timeliness (no backlog census — nobody waits in A&E between
// months). Beds are Little's Law a third time: average occupied emergency beds
// = daily admissions × length of stay; open beds needed = occupied / occupancy
// target. Elective beds from the RTT spine stack on top (passed in by the page).
export function runUec(uec, opts = {}) {
  const cal = calendar(opts.startYM || '2026-07', opts.endYM || '2030-03');
  const levers = { ...uec.levers, ...(opts.levers || {}) };
  const cur = uec.current;
  const n = cal.length;
  const gAtt = Math.pow(1 + (levers.attGrowthPctYr ?? 0) / 100, 1 / 12);
  const gAdm = Math.pow(1 + (levers.admGrowthPctYr ?? 0) / 100, 1 / 12);
  const msFour = opts.fourHourMilestones || [
    { ym: '2027-04', pct: 78 }, { ym: '2028-04', pct: 86 }, { ym: '2029-04', pct: 95 },
  ];
  const glide4 = glidePath(cal, cur.pct4hAll, msFour);
  const dtaZero = Math.max(1, ymDiff(cal[0], opts.dtaZeroYM || '2028-04'));
  const los = levers.emergencyLOSDays ?? 5;
  const occT = levers.bedOccupancyTarget ?? 0.92;

  const s = {
    ym: cal, glidePct: glide4,
    attMo: new Array(n), requiredTimelyMo: new Array(n),
    currentRateTimelyMo: new Array(n), extraTimelyMo: new Array(n),
    dta12Mo: new Array(n),
    admMo: new Array(n), emergencyOccupiedBeds: new Array(n), emergencyOpenBedsNeeded: new Array(n),
  };
  let att = cur.attAll, adm = cur.admTotal;
  for (let i = 0; i < n; i++) {
    const req = att * glide4[i] / 100;
    const today = att * cur.pct4hAll / 100;
    s.attMo[i] = att;
    s.requiredTimelyMo[i] = req;
    s.currentRateTimelyMo[i] = today;
    s.extraTimelyMo[i] = Math.max(0, req - today);
    s.dta12Mo[i] = Math.max(0, cur.dta12plus * (1 - i / dtaZero));
    s.admMo[i] = adm;
    const occupied = (adm / 30.4) * los;         // Little's Law: L = λ × W
    s.emergencyOccupiedBeds[i] = occupied;
    s.emergencyOpenBedsNeeded[i] = occupied / occT;
    att *= gAtt; adm *= gAdm;
  }
  return { cal, milestones: msFour, levers, series: s };
}

// --- cancer (CWT) -------------------------------------------------------------
// The cancer standards are FLOW standards, unlike RTT/DM01: each month's cohort
// of diagnoses (FDS) or treatments (31/62-day) is scored on timeliness, and the
// published data carries no backlog census. So the model works on volumes ×
// timeliness: required timely activity per month = glide-path % × cohort volume.
// The gap vs today's timely rate is the pathway capacity that must be added
// (faster diagnostics, earlier DTT, escalation of long waiters).
export function runCancerStandard(std, levers, cal) {
  const n = cal.length;
  const growthPctYr = (levers.demandGrowthPctYr ?? 0) + (levers.demandGrowthAdjPctYr ?? 0);
  const growth = Math.pow(1 + growthPctYr / 100, 1 / 12);
  const glide = glidePath(cal, std.current.pct, std.milestones);
  const s = {
    ym: cal, glidePct: glide, volumeMo: new Array(n),
    requiredTimelyMo: new Array(n), currentRateTimelyMo: new Array(n),
    breachesMo: new Array(n), extraTimelyMo: new Array(n),
  };
  let vol = std.current.total;
  for (let i = 0; i < n; i++) {
    const req = vol * glide[i] / 100;
    const atCurrentRate = vol * std.current.pct / 100;
    s.volumeMo[i] = vol;
    s.requiredTimelyMo[i] = req;
    s.currentRateTimelyMo[i] = atCurrentRate;
    s.breachesMo[i] = vol - req;
    s.extraTimelyMo[i] = Math.max(0, req - atCurrentRate);
    vol *= growth;
  }
  return s;
}

export function runCancer(cancer, opts = {}) {
  const cal = calendar(opts.startYM || '2026-07', opts.endYM || '2030-03');
  const levers = { ...cancer.levers, ...(opts.levers || {}) };
  const perStd = {};
  for (const [key, std] of Object.entries(cancer.standards)) {
    perStd[key] = { std, series: runCancerStandard(std, levers, cal) };
  }
  return { cal, levers, perStd };
}

export function runDiagnostics(dm01, opts = {}) {
  const cal = calendar(opts.startYM || '2026-07', opts.endYM || '2030-03');
  const milestones = opts.milestones || dm01.standard.milestones;
  const levers = { ...dm01.levers, ...(opts.levers || {}) };
  const wk = dm01.standard.windowWeeks || 6;
  const perMod = dm01.modalities.map((m) => ({ mod: m, series: runDiagnostic(m, levers, cal, milestones, wk) }));
  const sum = (key) => cal.map((_, i) => perMod.reduce((a, r) => a + r.series[key][i], 0));
  const total = {
    ym: cal, list: sum('list'), targetList: sum('targetList'),
    demandMo: sum('demandMo'), requiredTestsMo: sum('requiredTestsMo'), currentTestsMo: sum('currentTestsMo'),
    impliedPct: cal.map((_, i) => {
      const within = perMod.reduce((a, r) => a + r.series.list[i] * r.series.impliedPct[i] / 100, 0);
      const tot = perMod.reduce((a, r) => a + r.series.list[i], 0);
      return tot > 0 ? 100 * within / tot : 100;
    }),
  };
  return { cal, milestones, levers, perMod, total };
}
