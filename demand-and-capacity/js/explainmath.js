/* Explainer maths — pure functions, no DOM (tested under Node).
 *
 * The unifying model: one queue with arrival rate λ and mean wait W.
 *  - FLOW standards (cancer CWT) read the CDF of completed waits at the
 *    threshold T: F(T) = P(completed wait ≤ T).
 *  - CENSUS standards (RTT, DM01) read the age distribution of the waiting
 *    stock. By renewal theory the census-age density is the normalised
 *    survival function of the completed-wait distribution:
 *    g(a) = S(a) / W, so C(T) = ∫₀ᵀ S(a) da / W  (the equilibrium CDF).
 *  - If completed waits are exponential (memoryless), S(a) = e^(−a/W) and
 *    C(T) = F(T) = 1 − e^(−T/W): the two cameras read the SAME number.
 *  - Waits are modelled Erlang(k) with mean W: k = 1 is exponential
 *    (random / clinically-led selection), large k approaches strict FIFO
 *    (everyone waits ≈ W), separating the two readings.
 */

// Erlang(k, mean W) CDF at x: P(wait ≤ x)
export function erlangCdf(x, k, W) {
  if (x <= 0) return 0;
  const theta = W / k;
  let sum = 0, term = 1; // (x/θ)^n / n!
  for (let n = 0; n < k; n++) {
    if (n > 0) term *= (x / theta) / n;
    sum += term;
  }
  return 1 - Math.exp(-x / theta) * sum;
}

// Census (equilibrium) CDF at x: share of the waiting stock with age ≤ x
export function censusCdf(x, k, W, steps = 400) {
  if (x <= 0) return 0;
  const h = x / steps;
  let acc = 0;
  for (let i = 0; i <= steps; i++) {
    const a = i * h;
    const s = 1 - erlangCdf(a, k, W); // survival
    acc += (i === 0 || i === steps) ? s / 2 : s;
  }
  return Math.min(1, (acc * h) / W);
}

/* Tandem-queue simulation for the OP-attendances explainer: the RTT list is
 * really two queues in series. Stage 1: waiting for a FIRST outpatient
 * attendance (fed by referrals, served by new-appointment slots). At the first
 * attendance a share is discharged (the "other removals" mostly attended
 * before leaving); the rest join stage 2: waiting for TREATMENT (served by
 * treatment capacity — the clock stop). Boosting one stage's capacity without
 * the other just moves the queue along the pathway.
 */
export function runTandemSim({
  weeks = 104, referralsWk = 100, conversionPct = 60,
  newSlotsWk = 100, treatSlotsWk = 60,
  q1Start = 400, q2Start = 600,
} = {}) {
  const conv = conversionPct / 100;
  let q1 = q1Start, q2 = q2Start;
  const s = { q1: [], q2: [], total: [], firstsSeen: [], treated: [] };
  for (let w = 0; w < weeks; w++) {
    q1 += referralsWk;
    const seen = Math.min(newSlotsWk, q1);
    q1 -= seen;
    q2 += seen * conv;
    const treated = Math.min(treatSlotsWk, q2);
    q2 -= treated;
    s.q1.push(q1); s.q2.push(q2); s.total.push(q1 + q2);
    s.firstsSeen.push(seen); s.treated.push(treated);
  }
  return s;
}

/* Backlog-clearance simulation: one queue tracked as counts by age-week.
 * Three phases: steady state (proportional selection ≈ memoryless), a
 * clearance drive (extra capacity, oldest treated first), then business as
 * usual again. Returns weekly census %≤T of the stock and flow %≤T of that
 * week's completions — the same events, read by the two cameras.
 */
export function runClearanceSim({
  weeks = 104, lambda = 100, T = 18,
  meanWait0 = 20, list0 = 2600, maxAge = 80,
  driveStart = 26, driveEnd = 78, driveCapacity = 130, baseCapacity = 100,
} = {}) {
  // opening stock: exponential ages, mean meanWait0, scaled to list0
  let q = new Array(maxAge + 1).fill(0);
  const raw = q.map((_, a) => Math.exp(-a / meanWait0));
  const rawSum = raw.reduce((x, y) => x + y, 0);
  for (let a = 0; a <= maxAge; a++) q[a] = (raw[a] / rawSum) * list0;

  const censusPct = [], flowPct = [], listSize = [];
  for (let w = 0; w < weeks; w++) {
    // age everyone one week (top bucket accumulates), then new arrivals
    for (let a = maxAge; a > 0; a--) q[a] = (a === maxAge ? q[a] : 0) + q[a - 1];
    q[0] = lambda;

    const inDrive = w >= driveStart && w < driveEnd;
    let cap = Math.min(inDrive ? driveCapacity : baseCapacity, q.reduce((x, y) => x + y, 0));
    let treated = 0, treatedInT = 0;
    if (inDrive) {
      // oldest first
      for (let a = maxAge; a >= 0 && cap > 1e-9; a--) {
        const take = Math.min(q[a], cap);
        q[a] -= take; cap -= take;
        treated += take; if (a <= T) treatedInT += take;
      }
    } else {
      // proportional across ages ≈ memoryless selection
      const tot = q.reduce((x, y) => x + y, 0);
      const frac = tot > 0 ? cap / tot : 0;
      for (let a = 0; a <= maxAge; a++) {
        const take = q[a] * frac;
        q[a] -= take;
        treated += take; if (a <= T) treatedInT += take;
      }
    }

    const tot = q.reduce((x, y) => x + y, 0);
    const inT = q.slice(0, T + 1).reduce((x, y) => x + y, 0);
    censusPct.push(tot > 0 ? (100 * inT) / tot : 100);
    flowPct.push(treated > 0 ? (100 * treatedInT) / treated : 100);
    listSize.push(tot);
  }
  return { censusPct, flowPct, listSize };
}
