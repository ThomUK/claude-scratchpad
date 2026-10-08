// Pure simulation engine for the 18-week diversion study.
// No DOM, no globals: importable from the browser (ES module) and from Node (tests).
//
// The waiting list is a census by weeks waited: bins[i] = number of patients who
// have waited between i and i+1 weeks. The last bin (MAX_WEEKS) is an open
// "MAX_WEEKS or more" bucket. Counts are continuous (fractional patients) so the
// model is deterministic.

export const MAX_WEEKS = 104;   // bins 0..104, the last is "104+"
export const TARGET_WEEKS = 18; // the RTT standard: wait < 18 weeks

/** Mean wait for an exponential list where a share p is under `weeks` (Fong et al.). */
export function meanWaitFor(pUnder, weeks = TARGET_WEEKS) {
  return -weeks / Math.log(1 - pUnder);
}

/**
 * Starting list: exponential (random-order steady state) with mean wait W chosen
 * so that `pctUnder18`% of the census is under 18 weeks, and total size λ·W by
 * Little's law. Returns a Float64Array of MAX_WEEKS+1 bins.
 */
export function initialList({ referrals, pctUnder18 }) {
  const p = pctUnder18 / 100;
  const W = meanWaitFor(p);
  const size = referrals * W;
  const bins = new Float64Array(MAX_WEEKS + 1);
  const r = Math.exp(-1 / W);
  // Geometric census: bin i ∝ r^i, overflow bin = the geometric tail.
  let sum = 0;
  for (let i = 0; i < MAX_WEEKS; i++) { bins[i] = Math.pow(r, i); sum += bins[i]; }
  bins[MAX_WEEKS] = Math.pow(r, MAX_WEEKS) / (1 - r);
  sum += bins[MAX_WEEKS];
  for (let i = 0; i <= MAX_WEEKS; i++) bins[i] *= size / sum;
  return bins;
}

/** Everyone waits one more week. Bin 0 becomes empty; the overflow bin absorbs. */
export function age(bins) {
  const out = new Float64Array(bins.length);
  for (let i = bins.length - 2; i >= 0; i--) out[i + 1] = bins[i];
  out[bins.length - 1] += bins[bins.length - 1];
  return out;
}

/**
 * Remove up to `amount` patients from bins[lo..hi] (inclusive), in place.
 * A share `randomShare` is removed in proportion to each bin (random order);
 * the rest is removed longest-waiting-first. Returns the amount actually removed
 * (less than `amount` only when the range runs out of patients).
 */
export function removeFrom(bins, lo, hi, amount, randomShare) {
  if (amount <= 0 || lo > hi) return 0;
  let total = 0;
  for (let i = lo; i <= hi; i++) total += bins[i];
  if (total <= 0) return 0;
  const take = Math.min(amount, total);

  // Random (proportional) part.
  const rnd = Math.min(take * randomShare, total);
  if (rnd > 0) {
    const f = rnd / total;
    for (let i = lo; i <= hi; i++) bins[i] -= bins[i] * f;
  }
  // Longest-waiting-first part.
  let left = take - rnd;
  for (let i = hi; i >= lo && left > 1e-12; i--) {
    const d = Math.min(bins[i], left);
    bins[i] -= d; left -= d;
  }
  return take - Math.max(0, left);
}

/**
 * One week of the list, returning the new bins and bookkeeping.
 *   referrals     new clock starts this week (into bin 0)
 *   capacity      removals (clock stops) this week
 *   randomShare   0..1 share of removals taken in random order (rest longest-first)
 *   eligibleFrom  lowest bin index capacity may be spent on; 0 = no restriction.
 *                 Capacity left over once bins >= eligibleFrom are empty spills
 *                 over to the protected bins (the under-18-at-target cohort).
 */
export function stepWeek(bins, { referrals, capacity, randomShare, eligibleFrom = 0 }) {
  const next = age(bins);
  next[0] += referrals;
  const e = Math.max(0, Math.min(eligibleFrom, MAX_WEEKS + 1));
  const fromEligible = removeFrom(next, e, MAX_WEEKS, capacity, randomShare);
  const spill = removeFrom(next, 0, e - 1, capacity - fromEligible, randomShare);
  return { bins: next, removed: fromEligible + spill, spilled: spill, eligibleFrom: e };
}

export function metrics(bins) {
  let total = 0, under = 0, w52 = 0, w65 = 0, wsum = 0;
  for (let i = 0; i < bins.length; i++) {
    const v = bins[i];
    total += v;
    wsum += v * (i + 0.5);
    if (i < TARGET_WEEKS) under += v;
    if (i >= 52) w52 += v;
    if (i >= 65) w65 += v;
  }
  return {
    total,
    pctUnder18: total > 0 ? (100 * under) / total : 100,
    over52: w52,
    over65: w65,
    meanWait: total > 0 ? wsum / total : 0,
  };
}

/**
 * Full run of one scenario.
 *   referrals, pctUnder18, randomShare   as above
 *   load           referrals ÷ capacity (0.9 = surplus, 1 = balance, 1.1 = deficit)
 *   divert         if true, in the final 18 weeks before the target date capacity
 *                  is spent only on patients who will have waited 18+ weeks at
 *                  the target date (spilling over only if that cohort runs dry)
 *   weeksToTarget  number of weekly steps between the start and the target date
 *   weeksAfter     steps to continue after the target date
 * Returns { capacity, frames: [{ week, bins, metrics, eligibleFrom, removed, spilled }] }
 * where frames[weeksToTarget] is the list on the target date.
 */
export function simulate({ referrals, pctUnder18, randomShare, load, divert, weeksToTarget, weeksAfter }) {
  const capacity = referrals / load;
  let bins = initialList({ referrals, pctUnder18 });
  const frames = [{ week: 0, bins, metrics: metrics(bins), eligibleFrom: 0, removed: 0, spilled: 0 }];
  const n = weeksToTarget + weeksAfter;
  for (let t = 0; t < n; t++) {
    const remaining = weeksToTarget - (t + 1); // weeks still to go after this step
    let eligibleFrom = 0;
    if (divert && remaining >= 0 && remaining < TARGET_WEEKS) {
      // A patient in bin i after this step will be in bin i + remaining on the
      // target date; only those reaching 18+ by then may be treated.
      eligibleFrom = TARGET_WEEKS - remaining;
    }
    const r = stepWeek(bins, { referrals, capacity, randomShare, eligibleFrom });
    bins = r.bins;
    frames.push({ week: t + 1, bins, metrics: metrics(bins), eligibleFrom: r.eligibleFrom, removed: r.removed, spilled: r.spilled });
  }
  return { capacity, frames };
}

/** The six scenarios: three loads × {ordinary, diverted}. */
export function simulateAll(params) {
  const { loads } = params; // { surplus, balance, deficit }
  const kinds = [
    { key: 'surplus', label: 'Capacity surplus', load: loads.surplus },
    { key: 'balance', label: 'Capacity in balance', load: loads.balance },
    { key: 'deficit', label: 'Capacity deficit', load: loads.deficit },
  ];
  const out = [];
  for (const divert of [false, true]) {
    for (const k of kinds) {
      out.push({ ...k, divert, ...simulate({ ...params, load: k.load, divert }) });
    }
  }
  return out;
}
