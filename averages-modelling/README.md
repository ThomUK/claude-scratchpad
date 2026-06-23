# Average vs Intraday Bed Modelling

A teaching toy contrasting two ways of sizing hospital beds:

- **Average model** — beds = admissions/day × mean length of stay
  ([Little's Law](https://en.wikipedia.org/wiki/Little%27s_law)). One flat number.
- **Intraday flow model** — a deterministic, hour-by-hour simulation over a week
  that accounts for *when* admissions arrive, *how long* patients stay, and *when*
  they are discharged (including reduced weekend discharges).

The point: the average is the *mean* of a curve that swings well above it. Plan to
the average and you under-provision — the **peak** (what actually drives bed need)
is higher, occupancy sits over the average line for much of the week, and weekends
stack up.

Runs entirely in the browser via [webR](https://docs.r-wasm.org/webr/latest/) — no
backend, no data files.

## What it shows (all four, deterministically)

- **Peak > average** — admissions arrive before discharges happen, so occupancy
  peaks during the day above the flat average line.
- **Discharge timing** — moving discharges earlier (vs afternoon-heavy) lowers the
  daily peak for the same throughput.
- **Length-of-stay distribution** — admissions are split across a discretised LOS
  distribution (a "spread" knob; 0 = fixed stay, higher = long tail), not a single
  mean — long tails lift occupancy and its variability.
- **Day-to-day variation** — fewer discharges at weekends (a real effect) make
  occupancy build up across Sat/Sun and unwind in the week, without any randomness.

## Model in brief

Hourly over several weeks (burn-in, then the final settled week is shown):

1. Admissions per day are spread across 24 hours by an **arrival profile**.
2. Each admission is due for discharge `LOS` days later, with `LOS` drawn from a
   discretised distribution (mean = input, spread = the CV knob).
3. Each day's due discharges are spread over the hours by a **discharge profile**;
   a fraction of weekend-due discharges is **deferred** to following days.
4. Occupancy = running total of admissions minus discharges.

Because daily admissions and discharges balance, mean occupancy ≈ the average model
(plus a little, from discharge delay) — the interesting part is the variation around
it. Realised mean LOS is reported so you can see the discharge-delay effect.

## Inputs

Admissions/day · mean length of stay · LOS spread · arrival profile · discharge
profile · weekend discharge level.

## Running locally

Static files — serve over HTTP (webR is an ES-module import, so `file://` won't work):

```sh
cd averages-modelling && python3 -m http.server 8000
# open http://localhost:8000/
```
