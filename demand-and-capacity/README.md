# Trust Demand & Capacity Model — NUH (RX1)

A trust-wide, specialty-connected demand & capacity model for Nottingham
University Hospitals NHS Trust, built to answer: **what capacity is required to
meet the NHS constitutional standards** —

- **RTT**: 65% within 18 weeks by April 2027, 80% by April 2028, 92% by April 2029
- **Cancer**: Faster Diagnosis (28-day), 31-day and 62-day standards
- **Diagnostics**: DM01 six-week standard
- **UEC**: A&E four-hour standard and ambulance handover times

Pure-JavaScript engine (unit-tested in Node), static deployment to GitHub Pages,
scenario export/import as JSON. **Phase 1 (this release) is the elective (RTT)
spine**; later phases per the roadmap below.

## Method — phase 1

Queueing theory per Fong, House, Walton et al. (2022), *Understanding Waiting
List Pressures* ([medRxiv 10.1101/2022.08.23.22279117](https://doi.org/10.1101/2022.08.23.22279117))
and the [NHSRwaitinglist](https://nhs-r-community.github.io/NHSRwaitinglist/) package:

1. Achieving *p*% within 18 weeks needs mean wait `W = −18/ln(1−p)` weeks
   (exponential steady state).
2. Little's Law: the **sustainable list size** at performance *p* is
   `weekly demand × W`.
3. **Required clock stops** each month = demand + phased clearance of the excess
   list down to the target size by the next milestone (65/80/92 glide path).
4. Clock stops convert to deliverable activity per treatment function:
   - **Outpatients**: first + follow-up attendances (N:FU ratio), uplifted for
     DNA rate and clinic utilisation → slots required;
   - **Theatres**: admitted stops → cases → sessions via cases-per-session and
     GIRFT capped utilisation, day-case vs inpatient split (BADS);
   - **Beds**: inpatient electives × specialty LOS ÷ occupancy target;
   - **Diagnostics**: referral-driven tests per referral (deepened in phase 2).

The engine is validated by `tests/engine.test.mjs` (27 checks: queueing
round-trips, glide-path milestones, list conservation, activity sanity). Run:
`node tests/engine.test.mjs`.

## Seed data & provenance

**The RTT position is seeded from the published NHSE RTT full extracts** (the
"Full CSV data file" from the [RTT statistics page](https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/)),
ingested by `ingest/ingest_rtt.py` (source ZIPs kept in `source/`):

- **April 2026 extract** → per-TFC waiting list (85,166 total), %<18 weeks from
  the published wait bands (62.8% trust-weighted), referral demand (New RTT
  Periods, 4,410/wk), clock stops (completed admitted + non-admitted,
  3,026/wk counted in April) and admitted share.
- **April 2024 + April 2025 extracts** → calibration from the **pre-EPR pair**
  (Apr-24→Apr-25): trust demand growth **−2.5%/yr**, other-removals rate
  **10.7%** (ΔL = new − stops − other), and **per-TFC demand growth** seeded for
  14/21 TFCs where |growth| ≤ 15%/yr. The EPR-era pair (Apr-25→Apr-26: +8.0%,
  removals 20.3%, 14/21 TFC swings >15%) is reported by the ingest for
  comparison but deliberately not used — NUH's Nov-2025 EPR go-live contaminates
  it with recoding and validation artefacts.

Two modelling consequences of using real (non-idealised) data:

- **Census-shape calibration**: NUH's census is front-loaded vs the exponential
  steady state (shape factor ≈ 1.33), so the engine anchors each TFC's implied
  performance to its published %<18wk and scales the sustainable-list-size
  relationship consistently.
- **Other removals**: required clock stops are computed against *effective*
  demand (referrals × (1 − other-removals rate)), exposed as a lever.

**Still estimates** (flagged in `data/baseline.json`): operational parameters —
day-case rate, cases/session, N:FU ratio, elective LOS, diagnostics/referral —
pending GIRFT / Model Health System / trust figures. Cancer, ED and handover
anchors researched from published reporting remain in the provenance block for
later phases.

To re-seed with a newer month:

```sh
python3 ingest/ingest_rtt.py source/<latest>.zip --prior source/<yr-1>.zip --prior source/<yr-2>.zip --provider RX1
node tests/engine.test.mjs
```

## Roadmap

| Phase | Scope |
| --- | --- |
| **1 — Elective spine (this release)** | RTT waiting list → clock stops → OP / theatres / beds / diagnostics per TFC, trust rollup, levers, scenarios |
| 2 — Diagnostics | DM01 modality-level (MRI, CT, NOUS, endoscopy…) queues vs the 6-week standard, demand fed by the elective spine |
| 3 — Cancer | FDS / 31-day / 62-day capacity by tumour site |
| 4 — UEC | ED four-hour + handover; bed interaction with the elective model |
| 5 — Workforce | Medical & nursing WTE as the cross-cutting constraint |

## Running locally

```sh
cd demand-and-capacity && python3 -m http.server 8000   # static, no build step
node tests/engine.test.mjs                               # engine test suite
```

**Not operational advice** — an illustrative planning model with editable
assumptions.
