# Waiting Lists: Distribution, Shape & Simulation

A queueing-theory toy for **any** waiting list or backlog — NHS RTT, MRI, CT,
endoscopy, letter typing, complaints resolution. Three linked views:

1. **The exponential model & targets** — in the M/M/1 steady state the waiting time
   is exponential. Set a referral rate λ and either a target (*p%* within *y* weeks)
   or a capacity, and read off the mean wait, the steady-state list size, load, and
   performance at key weeks.
2. **Same list, different shape** — constraining long waiters *necessarily* reshapes
   the list. The exponential (random order) has many short waits and a long tail; the
   opposite extreme is **pure FIFO**, where the census is flat at λ until everyone is
   removed together. Morph between them (Weibull / lognormal) at the *same* λ and mean
   wait — the area (the list) is conserved.
3. **Simulator** — a weekly fluid simulation: referrals in, capacity out, under a
   removal discipline (random / FIFO / LIFO), from an initial list. Watch it grow /
   shrink / hold and read performance at 6 / 18 / 52 weeks.

Runs entirely in the browser via [webR](https://docs.r-wasm.org/webr/latest/) — no
backend, no data files.

## Method

Based on the queueing-theory exposition in:

> Fong, Mushtaq, House, Gordon, Chen, Griffiths, Ahmad, Walton (2022),
> *Understanding Waiting List Pressures*, medRxiv
> [10.1101/2022.08.23.22279117](https://doi.org/10.1101/2022.08.23.22279117),

and the accompanying [NHSRwaitinglist](https://nhs-r-community.github.io/NHSRwaitinglist/)
package (nhs-r-community). Key relationships used (the paper's "Facts"):

- **Stability:** capacity must exceed demand; load `ρ = λ/μ < 1` (utilisation is never
  100% for a stable list held at a short-wait target).
- **Exponential tail:** `P(wait > t) = e^(−t/W̄)` — the chance of missing a target
  halves for each fixed increment of the target.
- **Mean wait for a target:** `W̄ = −y / ln(1−p)` (e.g. 92% within 18 wks → ≈7.1 wks;
  the paper's rule of thumb is `W̄ ≈ target/4`).
- **Little's Law:** `Target Queue Size = λ · W̄`.
- **Pressure:** `2 · W̄ / target`.

This is an **illustrative** model, not a clinical or operational planning tool.

## Running locally

Static files — serve over HTTP (webR is an ES-module import, so `file://` won't work):

```sh
cd waiting-list && python3 -m http.server 8000
# open http://localhost:8000/
```
