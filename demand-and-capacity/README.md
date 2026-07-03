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
  demand (referrals × (1 − other-removals rate)), exposed as a lever; the
  overview cards show the full arithmetic (referrals − removals = effective).
- **Shape-factor drift**: k is calibrated to today's booking discipline
  (0.93–1.81 per TFC) and held to 2030 by default — a stated assumption, with a
  `kEndScale` lever that morphs k towards FIFO (larger sustainable list, less
  clearance) or memoryless (×1, deeper clearance). t = 0 always keeps the
  published anchor.
- **Milestones are per-TFC** (never below start): an equity stance — the trust
  aggregate deliberately overshoots the literal 65/80/92 (e.g. ~69% at Apr-27),
  quantified on the page. Bed occupancy is aligned at the 92% planning norm
  across the spine and UEC modules so bed totals add consistently.

**Still estimates** (flagged in `data/baseline.json`): operational parameters —
day-case rate, cases/session, N:FU ratio, elective LOS, diagnostics/referral —
pending GIRFT / Model Health System / trust figures. Cancer, ED and handover
anchors researched from published reporting remain in the provenance block for
later phases.

To re-seed with a newer month:

```sh
python3 ingest/ingest_rtt.py source/<latest>.zip --prior source/<yr-1>.zip --prior source/<yr-2>.zip --provider RX1
python3 ingest/ingest_dm01.py source/<latest-dm01>.xls --prior source/<yr-1>.xls --prior source/<yr-2>.xls --provider RX1
python3 ingest/ingest_cwt.py source/<latest-cwt>.csv --prior source/<yr-1>.xlsx --prior source/<yr-2>.xlsx --provider RX1
python3 ingest/ingest_ae.py source/<latest-ae>.csv --prior source/<yr-1>.csv --prior source/<yr-2>.csv --provider RX1
python3 ingest/ingest_sitrep.py source/<winter1>.xlsx source/<winter2>.xlsx source/<winter3>.xlsx --provider RX1
python3 ingest/ingest_kh03.py source/<kh03-ts>.xlsx source/<kh03-overnight>.csv source/<kh03-day>.csv --provider RX1
python3 ingest/ingest_drd.py source/<drd-latest>.xlsx source/<yr-1>.xlsx source/<yr-2>.xlsx --provider RX1
node tests/engine.test.mjs
```
(The UEC ingests append to `data/uec.json`, so run `ingest_ae.py` first.)

### Diagnostics (DM01) seeding

`ingest/ingest_dm01.py` reads the NHSE Monthly Diagnostics provider workbooks
('Provider by Test' sheet): per-modality waiting list and 6-week bands, plus
planned / unscheduled / waiting-list activity. Demand ≈ waiting-list tests +
year-on-year ΔWL/12. April 2026 position: **25,065 waiting, 57.3% under
6 weeks** (standard 95/99%) — MRI, CT, NOUS and echo carry the bulk. Demand
growth **+12.6%/yr** from the pre-EPR pair (the EPR year shows −13.2%,
recoding/counting-contaminated as with RTT). The 95%-by-Apr-27 / 99%-by-Apr-29
milestones are a documented modelling assumption aligned to the RTT trajectory.

### Cancer (CWT) seeding

`ingest/ingest_cwt.py` reads the published CWT provider data in both NHSE
formats: the monthly combined CSV (2026+) and the CRS provider workbooks
(2024/25). Some workbooks carry a broken worksheet dimension record (`A1:A1`),
which silently empties openpyxl's read-only iteration — the ingest calls
`reset_dimensions()` to recover the real rows. April 2026 position: **FDS
71.0%** (target 80%), **31-day 93.7%** (96%), **62-day 68.1%** (interim 70% by
Apr-27, 85% by Apr-29). Unlike RTT/DM01 these are *flow* standards with no
published backlog census, so the model works on cohort volumes × a timeliness
glide path; the gap vs today's timely rate is the pathway capacity to add.
FDS-volume growth **−0.7%/yr** from the pre-EPR pair (the EPR year shows
+13.4%). Trust PTL data would deepen this to a backlog model.

### UEC seeding

`ingest/ingest_ae.py` reads the Monthly A&E (MSitAE) provider CSVs: April 2026
position **type-1 44.7% within 4 hours** (all-types 66.9% — flattered by the
UTC activity merging under RX1's code from Apr-26), **819 twelve-hour DTA
waits**, 8,717 emergency admissions/month. Growth from the LATEST pair
(+1.5%/+1.1%): the earliest pair is contaminated by the UTC reporting split —
the reverse of the RTT/DM01 EPR situation, as attendance counts are not
clock-rule sensitive. `ingest_sitrep.py` adds winter bed stats from the UEC
Daily SitRep timeseries (winter 2025-26: adult G&A **95.4% occupied**, a
quarter of occupied beds held by 21+ day stayers) and derives the implied
emergency LOS (5.2d) via Little's Law, net of an elective-occupied estimate
(~41 beds from the RTT baseline's current activity) so the bed chart is a
true emergency + elective decomposition without double-counting. `ingest_kh03.py` adds the KH03
specialty bed mix (geriatric medicine is the largest occupied base) and
England occupancy context. `ingest_drd.py` adds Discharge Ready Date delays
(Apr-26: 22.7% of discharges delayed, **5,435 bed-days lost ≈ 179 beds**;
early-year figures understate — DRD recording matured over 2024-26). The
module models the 4-hour standard as a flow standard (like cancer), 12-hour
DTA to zero, and the shared bed pool: emergency beds (λ×LOS) + the elective
spine's requirement vs ~1,600 open. `ingest_handover.py` adds the Ambulance
Handover Times by Acute Trust collection (Apr-26: mean **31.3 min** vs the
15-minute standard, 45.9% over 30 min, 747 crew-hours lost; the Jan-24 peak of
85 min has more than halved). Timeseries cells that lost their time formatting
arrive as raw Excel day fractions — the ingest converts them.

### Workforce seeding

`ingest/ingest_workforce.py` reads the NHS Workforce Statistics HCHS CSV packs
(ESR payroll-based, so *not* EPR-affected). RX1 April 2026: **17,662 total
FTE** — 4,960 nurses & health visitors, 2,360 doctors (963 consultants), 2,345
ST&T. The 2020-24 expansion (+4.4%/yr) has reversed: **−1.4% total FTE in the
latest year**. The full packs are hundreds of MB, so provider-only slices are
committed to `source/` and the ingest accepts either. The module treats
workforce as the cross-cutting constraint: required clinical FTE = a weighted
activity index from the other four modules (emergency 45%, elective 35%,
diagnostics 10%, cancer 10% — documented assumption) deflated by a
productivity lever, vs supply projected at each group's calibrated trend.
Bank/agency are outside the published counts, so gaps understate pressure.

## Roadmap

| Phase | Scope |
| --- | --- |
| **1 — Elective spine (this release)** | RTT waiting list → clock stops → OP / theatres / beds / diagnostics per TFC, trust rollup, levers, scenarios |
| **2 — Diagnostics (this release)** | DM01 modality-level queues vs the 6-week standard — `diagnostics.html`, seeded from the published DM01 provider files (Apr-24/25/26), same queueing core on a 6-week window |
| **3 — Cancer (this release)** | FDS / 31-day / 62-day timeliness by tumour site — `cancer.html`, seeded from published CWT provider data (Apr-24/25/26, two formats), flow model on cohort volumes |
| **4 — UEC (this release)** | ED 4-hour, 12-hour DTA, discharge delays and the shared bed pool — `uec.html`, seeded from MSitAE, UEC sitreps, KH03 and Discharge Ready Date; including ambulance handover (Handover Times by Acute Trust) |
| **5 — Workforce (this release)** | Medical & nursing FTE as the cross-cutting constraint — `workforce.html`, activity-driven requirement vs supply at trend, seeded from NHS Workforce Statistics |

## Explainers

`explainers.html` hosts interactive explainers for the concepts under the
model. The first covers **census standards (RTT/DM01) vs flow standards
(cancer CWT)**: one queue watched by two cameras — a monthly photograph of
the stock vs a stopwatch at the exit — unified by Little's Law (L = λ·W)
and, for memoryless queues, the identity %-within-T = 1 − e^(−T/W), under
which both cameras read the same number. Interactive panels show when they
diverge: booking-discipline shape (Erlang k, memoryless → FIFO) and
transients (a backlog clearance drive lifts the census reading while it
tanks the flow reading — same events, opposite optics). Maths in
`js/explainmath.js`, checks in the test suite.

## Running locally

```sh
cd demand-and-capacity && python3 -m http.server 8000   # static, no build step
node tests/engine.test.mjs                               # engine test suite
```

**Not operational advice** — an illustrative planning model with editable
assumptions.
