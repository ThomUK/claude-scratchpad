// Run: node tests/engine.test.mjs   (from rtt-diversion/)
import assert from 'node:assert/strict';
import { MAX_WEEKS, TARGET_WEEKS, meanWaitFor, initialList, age, removeFrom, stepWeek, metrics, simulate, simulateAll } from '../engine.js';

let n = 0;
function check(name, fn) { fn(); n++; console.log('  ok  ' + name); }
const sum = (a) => a.reduce((s, v) => s + v, 0);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

const base = { referrals: 3000, pctUnder18: 60, randomShare: 0.3, weeksToTarget: 77, weeksAfter: 52 };

check('meanWaitFor: 92% within 18 weeks needs W ≈ 7.13 (Fong et al.)', () => {
  close(meanWaitFor(0.92), 7.127, 0.01, 'W');
});

check('initialList: size = λ·W and %<18 matches the input', () => {
  const bins = initialList({ referrals: 3000, pctUnder18: 60 });
  const W = meanWaitFor(0.6);
  close(sum(bins), 3000 * W, 1e-6, 'size');
  close(metrics(bins).pctUnder18, 60, 1.5, '%<18 (discrete bins vs continuous)');
  assert.equal(bins.length, MAX_WEEKS + 1);
});

check('age: shifts everyone up one week and accumulates in the overflow bin', () => {
  const b = new Float64Array(MAX_WEEKS + 1); b[0] = 5; b[MAX_WEEKS - 1] = 2; b[MAX_WEEKS] = 7;
  const a = age(b);
  assert.equal(a[0], 0); assert.equal(a[1], 5); assert.equal(a[MAX_WEEKS], 9);
  close(sum(a), sum(b), 1e-9, 'conserved');
});

check('removeFrom: longest-first (randomShare 0) empties the top bins first', () => {
  const b = new Float64Array(MAX_WEEKS + 1).fill(10);
  const got = removeFrom(b, 0, MAX_WEEKS, 25, 0);
  assert.equal(got, 25);
  assert.equal(b[MAX_WEEKS], 0); assert.equal(b[MAX_WEEKS - 1], 0); assert.equal(b[MAX_WEEKS - 2], 5); assert.equal(b[0], 10);
});

check('removeFrom: random (randomShare 1) removes proportionally', () => {
  const b = new Float64Array(MAX_WEEKS + 1); b[0] = 30; b[1] = 10;
  removeFrom(b, 0, MAX_WEEKS, 20, 1);
  close(b[0], 15, 1e-9, 'bin0'); close(b[1], 5, 1e-9, 'bin1');
});

check('removeFrom: cannot remove more than is there, reports the shortfall', () => {
  const b = new Float64Array(MAX_WEEKS + 1); b[3] = 4;
  const got = removeFrom(b, 0, MAX_WEEKS, 10, 0.3);
  close(got, 4, 1e-9, 'removed'); close(sum(b), 0, 1e-9, 'empty');
});

check('stepWeek: conservation — new list = old + referrals − removed', () => {
  const b = initialList({ referrals: 3000, pctUnder18: 60 });
  const r = stepWeek(b, { referrals: 3000, capacity: 3100, randomShare: 0.3 });
  close(sum(r.bins), sum(b) + 3000 - r.removed, 1e-6, 'conservation');
  close(r.removed, 3100, 1e-6, 'full capacity used');
});

check('stepWeek with eligibleFrom: protected bins untouched while eligible patients remain', () => {
  const b = initialList({ referrals: 3000, pctUnder18: 60 });
  const r = stepWeek(b, { referrals: 3000, capacity: 2000, randomShare: 0.3, eligibleFrom: 10 });
  const aged = age(b); aged[0] += 3000;
  for (let i = 0; i < 10; i++) close(r.bins[i], aged[i], 1e-9, `bin ${i} protected`);
  assert.equal(r.spilled, 0);
});

check('stepWeek with eligibleFrom: spills over once the eligible cohort is exhausted', () => {
  const b = new Float64Array(MAX_WEEKS + 1); b[2] = 100; b[30] = 50;
  const r = stepWeek(b, { referrals: 0, capacity: 80, randomShare: 0, eligibleFrom: 20 });
  assert.equal(r.bins[31], 0);
  close(r.spilled, 30, 1e-9, 'spilled'); close(r.bins[3], 70, 1e-9, 'protected bin reduced by spill only');
});

check('simulate: balance (load 1) keeps the list size constant; surplus shrinks; deficit grows', () => {
  const bal = simulate({ ...base, load: 1, divert: false });
  const sur = simulate({ ...base, load: 0.9, divert: false });
  const def = simulate({ ...base, load: 1.1, divert: false });
  const s0 = bal.frames[0].metrics.total;
  close(bal.frames[77].metrics.total, s0, 1e-6, 'balance');
  close(sur.frames[77].metrics.total, s0 - 77 * (3000 / 0.9 - 3000), 1e-6, 'surplus');
  close(def.frames[77].metrics.total, s0 + 77 * (3000 - 3000 / 1.1), 1e-6, 'deficit');
  assert.equal(bal.frames.length, 77 + 52 + 1);
});

check('simulate: diversion only active in the final 18 weeks before the target, never after', () => {
  const d = simulate({ ...base, load: 1.1, divert: true });
  for (const f of d.frames) {
    const remaining = base.weeksToTarget - f.week;
    if (f.week === 0) continue;
    if (remaining >= 0 && remaining < TARGET_WEEKS) assert.equal(f.eligibleFrom, TARGET_WEEKS - remaining, `week ${f.week}`);
    else assert.equal(f.eligibleFrom, 0, `week ${f.week}`);
  }
  assert.equal(d.frames[77].eligibleFrom, TARGET_WEEKS, 'last step before target spends only on 18+');
});

check('simulate: diverted and ordinary runs use identical capacity and list size (nothing is "saved")', () => {
  const o = simulate({ ...base, load: 1, divert: false });
  const d = simulate({ ...base, load: 1, divert: true });
  assert.equal(o.capacity, d.capacity);
  for (let t = 0; t < o.frames.length; t++) close(o.frames[t].metrics.total, d.frames[t].metrics.total, 1e-6, `size week ${t}`);
});

check('simulate: diversion flatters %<18 on the target date, then the metric collapses afterwards', () => {
  for (const load of [0.9, 1, 1.1]) {
    const o = simulate({ ...base, load, divert: false });
    const d = simulate({ ...base, load, divert: true });
    const T = base.weeksToTarget;
    assert.ok(d.frames[T].metrics.pctUnder18 >= o.frames[T].metrics.pctUnder18 - 1e-9, `load ${load}: at target`);
    // In the diverted run the untouched under-18 cohort is 18 weeks of raw referrals,
    // so the metric must drop after April as that block ages past 18 weeks —
    // unless the list was already 100% under 18 (a big surplus), where the
    // eligible cohort runs dry, capacity spills over and diversion changes nothing.
    const after = d.frames[T + 10].metrics.pctUnder18;
    if (load >= 1) assert.ok(after < d.frames[T].metrics.pctUnder18, `load ${load}: hangover`);
  }
});

check('simulate: in the diverted deficit run, on the target date the under-18 cohort is exactly 18 weeks of referrals', () => {
  const d = simulate({ ...base, load: 1.1, divert: true });
  const bins = d.frames[base.weeksToTarget].bins;
  let under = 0; for (let i = 0; i < TARGET_WEEKS; i++) under += bins[i];
  close(under, 18 * 3000, 1e-6, 'untouched cohort');
});

check('simulate: pure random removal at load 1 keeps a geometric (exponential) shape', () => {
  const r = simulate({ ...base, randomShare: 1, load: 1, divert: false });
  const b = r.frames[77].bins;
  const ratios = [];
  for (let i = 1; i < 40; i++) ratios.push(b[i] / b[i - 1]);
  const mn = Math.min(...ratios), mx = Math.max(...ratios);
  assert.ok(mx - mn < 0.01, `ratios spread ${mx - mn}`);
});

check('simulate: after the target date removal reverts to the ordinary rule, including the protected block', () => {
  const T = base.weeksToTarget;
  const d = simulate({ ...base, randomShare: 1, load: 1.1, divert: true });
  assert.equal(d.frames[T + 1].eligibleFrom, 0);
  // Under pure random removal every bin loses the same fraction, so the
  // previously protected bins (now 1..18) must shrink by the same ratio as the rest.
  const before = age(d.frames[T].bins); before[0] += 3000;
  const after = d.frames[T + 1].bins;
  const ratios = [];
  for (let i = 1; i < 60; i++) ratios.push(after[i] / before[i]);
  close(Math.max(...ratios), Math.min(...ratios), 1e-9, 'uniform removal across protected and unprotected bins');
  assert.ok(ratios[0] < 1, 'protected block is being drawn from');
});

check('simulate: with random removal the diverted runs converge back onto the ordinary runs after the target', () => {
  const T = base.weeksToTarget;
  for (const load of [0.9, 1, 1.1]) {
    const o = simulate({ ...base, randomShare: 1, load, divert: false });
    const d = simulate({ ...base, randomShare: 1, load, divert: true });
    const gapAt = d.frames[T].metrics.pctUnder18 - o.frames[T].metrics.pctUnder18;
    const gapLater = Math.abs(d.frames[T + 30].metrics.pctUnder18 - o.frames[T + 30].metrics.pctUnder18);
    assert.ok(gapAt > 5, `load ${load}: diversion flatters the day (${gapAt.toFixed(1)} pts)`);
    assert.ok(gapLater < 0.5, `load ${load}: gap 30 weeks later ${gapLater.toFixed(2)} pts`);
  }
});

check('simulateAll: six scenarios in the documented order', () => {
  const all = simulateAll({ ...base, loads: { surplus: 0.9, balance: 1, deficit: 1.1 } });
  assert.deepEqual(all.map((s) => s.key + (s.divert ? '/div' : '')),
    ['surplus', 'balance', 'deficit', 'surplus/div', 'balance/div', 'deficit/div']);
});

console.log(`\n${n} checks passed`);
