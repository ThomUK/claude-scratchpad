# RTT 18-week Diversion — a study in metric gaming

An animated, fictional waiting list from today to **1 April 2028**, run six ways:
three capacity positions (surplus, balance, deficit, expressed as **load** =
referrals ÷ capacity) × two removal policies:

- **Ordinary** — capacity treats patients in the same mixed order every week.
- **Diverted** — identical capacity, but in the final 18 weeks it is spent only
  on patients who will have waited 18+ weeks on the measurement date (those who
  would still be "under 18 weeks" on 1 April are left untouched). Capacity
  spills over to the protected cohort only when the eligible cohort runs dry.

**This models a tactic the author does not think is right.** No extra patient
is treated: the same capacity is pointed at the metric rather than at patients
in a sensible order, and the list the morning after is exactly as long. The app
exists to make the mechanism, and its post-April hangover, visible.

Live: https://thomuk.github.io/claude-scratchpad/rtt-diversion/

## Inputs

| Input | Default | Meaning |
|---|---|---|
| Referrals / week | 3,500 | constant clock starts per week |
| % under 18 weeks at start | 60 | fixes the starting mean wait `W = −18/ln(1−p)` and size `λ·W` (Little's law) |
| Load: surplus / balance / deficit | 0.90 / 1.00 / 1.10 | capacity per week is `referrals ÷ load` |
| Removal order | 100% random | share of removals taken in proportion to each bin (random order); the rest is longest-waiting-first |

## Model

- Weekly steps; continuous (fractional) counts; fully deterministic.
- Census by weeks waited in bins 0…103 plus a "104+" bucket.
- Each week: everyone ages one week → referrals land in bin 0 → capacity removes
  patients (random share proportionally, remainder from the top down).
- Diversion rule: with *r* weeks to go, a patient who has waited *i* weeks may
  be treated only if *i + r ≥ 18*. It bites only in the last 18 weeks and is
  switched off after the target date. It applies to **all** capacity, so
  clinical urgency is not modelled as an exemption (set the random share to
  taste; it is a shape mechanic, not a clinical one).
- After the target date the ordinary rule resumes, so the previously
  protected block is drawn from again and the diverted runs converge back onto
  the ordinary ones.
- Under random removal the exponential start is stationary at load 1, so the
  balance run barely moves; deficit thickens the tail, surplus thins it. Mixing
  in longest-waiting-first makes every run first reshape towards that policy's
  steady state, which moves % under 18 even at constant size.

## Files

- `engine.js` — pure simulation (no DOM), importable from browser and Node.
- `app.js` — inputs, the six animated census panels, two trajectory charts, the
  1 April snapshot table.
- `tests/engine.test.mjs` — 18 checks (conservation, load behaviour, eligibility
  window, spill-over, hangover, shape). Run with `node tests/engine.test.mjs`.

Based on the queueing framing in Fong, House, Walton et al. (2022),
*Understanding Waiting List Pressures*, and the sibling `waiting-list/` app.
