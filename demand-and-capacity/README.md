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

**Trust-level anchors are researched from published reporting; the TFC-level
split and operational parameters are clearly-flagged estimates.** Every number
lives in `data/baseline.json` with a source note. Researched anchors:

| Anchor | Value | Source |
| --- | --- | --- |
| RTT %<18wk | 55.1% (Jan-26) → **63.5% (Mar-26)**, fastest-improving in the Midlands | [West Bridgford Wire](https://westbridgfordwire.com/nottingham-university-hospitals-is-the-fastest-improving-trust-in-the-midlands-for-elective-waiting-times/) |
| Waiting list size | **~100,000 (ESTIMATE)** pending NHSE published figure | scale inference — [NUH](https://www.nuh.nhs.uk/) serves 2.5m local + 3–4m tertiary |
| Cancer 62-day | ~66% (Mar-25); backlog peaked >650 (Oct-25), 555 by mid-Nov-25; constrained: breast, gynae, urology, lower GI | [West Bridgford Wire](https://westbridgfordwire.com/nottingham-hospitals-still-under-pressure-as-emergency-care-cancer-and-diagnostic-waits-remain-below-plan/), [Newark Advertiser](https://www.newarkadvertiser.co.uk/news/hospital-trust-reports-largest-ever-backlog-in-people-waitin-9448418/), [Chad](https://www.chad.co.uk/news/people/cancer-target-missed-for-more-than-400-people-as-nottingham-hospitals-face-waiting-list-backlog-5129996) |
| Cancer FDS | 64.8% (Oct-25) vs 70.9% trajectory / 80% objective | West Bridgford Wire (as above) |
| ED four-hour | ~50% headline; median 2h59m (Mar-26); 82% MTPF objective | [NottinghamWorld](https://www.nottinghamworld.com/your-nottingham/nottingham/half-of-ae-arrivals-at-nottingham-university-hospitals-seen-within-four-hours-missing-nhs-target-4510834) |
| Ambulance handover | 45-min max process (Dec-24); QMC mean pre-handover ~37 min (early 2026) | [Chad](https://www.chad.co.uk/news/people/faster-notts-ambulance-response-times-but-added-hospital-pressure-4945959), [Erewash Sound](https://www.erewashsound.com/news/ambulance-trust-lost-more-than-19000-handover-hours-due-to-ongoing-pressures/) |
| Scale | ~1,663 beds, ~20,000 staff | [CQC](https://www.cqc.org.uk/provider/RX1), [NUH](https://www.nuh.nhs.uk/) |

Best-practice benchmarks in `data/standards.json`: GIRFT ([85% capped theatre
utilisation](https://gettingitrightfirsttime.co.uk/medical_specialties/theatres-and-perioperative-medicine/),
[day-case guides](https://gettingitrightfirsttime.co.uk/cross_cutting_theme/day-case-surgery/)),
[BADS](https://bads.co.uk/) day-case directory, NHS Elect outpatient benchmarks,
NHSE planning guidance. National statistics landing pages:
[RTT](https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/),
[DM01](https://www.england.nhs.uk/statistics/statistical-work-areas/diagnostics-waiting-times-and-activity/monthly-diagnostics-waiting-times-and-activity/).

### Replacing estimates with the real extracts

This environment cannot download the NHSE statistical files directly. To seed
the true position, download and drop in (an ingest script will be added with
each phase):

1. **RTT**: monthly *Incomplete pathways by provider and treatment function*
   (XLS) → replaces `tfcs[].list`, `pct18`, and (from completed pathways +
   new periods) `referralsWk`/`clockStopsWk`.
2. **DM01**: provider extract by modality (phase 2).
3. **Cancer waits**: provider extract by tumour site (phase 3).
4. **AE attendances & handover** (phase 4); **workforce returns** (phase 5).

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
