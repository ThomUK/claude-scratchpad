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
   - **Outpatients**: first attendances driven by *referrals* (the pathway
     start — they do not surge with clearance), follow-ups by clock stops
     (N:FU ratio), uplifted for DNA rate and clinic utilisation → slots;
   - **Theatres**: admitted stops → cases → sessions via cases-per-session and
     GIRFT capped utilisation, day-case vs inpatient split (BADS).
     *casesPerSession is defined at full utilisation* (a planning norm, not
     achieved throughput) so the utilisation divide happens exactly once;
   - **Beds**: inpatient electives × specialty LOS ÷ occupancy target;
   - **Diagnostics**: referral-driven tests per referral (deepened in phase 2).

The engine is validated by `tests/engine.test.mjs` (27 checks: queueing
round-trips, glide-path milestones, list conservation, activity sanity). Run:
`node tests/engine.test.mjs`.

## Seed data & provenance

**The RTT position is seeded from the published NHSE RTT full extracts** (the
"Full CSV data file" from the [RTT statistics page](https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/)),
ingested by `ingest/ingest_rtt.py` (source ZIPs kept in `source/`):

- **April 2026 extract** → per-TFC waiting list (85,166 total) and %<18 weeks
  from the published wait bands (62.8% trust-weighted). **Flow levels
  (referrals 4,531/wk, clock stops 3,249/wk, admitted share) are working-day-
  normalised means over Feb–Apr 2026** (`--level` extracts, standard 21-working-
  day month): per working day April referrals were the highest of the observed
  months — the apparent April dip was entirely working-day count. January 2026
  is excluded (EPR catch-up tail: 615 stops/wd vs 656–688 later). The Apr-26
  census sits AFTER the Feb→Mar validation purge (~8,500 migrated unclosed
  pathways left the list in one month), so the opening list is post-cleanup;
  validation removals were still running ~21% of referrals in April (the
  forward-looking lever keeps the pre-EPR 10.7% steady state). **Admitted
  share is seeded from the pre-EPR pooled flows (20.4%)** rather than the
  current period (15.1%): the pathways not completing now are
  disproportionately the admitted/surgical ones, and the clearance must work
  through that admitted-heavy backlog — seeding at the distorted current share
  would understate the theatre and bed requirement per clock stop.
- **April 2024 + April 2025 extracts** → calibration from the **pre-EPR pair**
  (Apr-24→Apr-25), **working-day adjusted**: April 2024 had 21 working days but
  April 2025 only 20 (Easter fell wholly inside April), so the raw −2.5%/yr is
  an Easter artefact — adjusted, trust demand growth is **+2.3%/yr** (in line
  with national planning); the charts carry a band spanning both methods.
  Other-removals rate
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
  (≈0.9–2.4 per TFC on the current seed; the exact range is computed live on
  the page from the data so this prose cannot drift) and held to 2030 by default — a stated assumption, with a
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
python3 ingest/ingest_rtt.py source/<latest>.zip --prior source/<yr-1>.zip --prior source/<yr-2>.zip --level source/<mo-1>.zip --level source/<mo-2>.zip --provider RX1
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
growth **+6.5%/yr**: core modalities only, working-day adjusted. The all-
modality raw figure (+12.6%) decomposes into three artefacts — capacity
step-changes (MRI +32%, DEXA +45%, audiology +64% activity in one year:
delivered tests measure *capacity*, not demand, in a backlog-constrained
system — cause unattributed from published data; it is NOT the Community
Diagnostic Centre, which [does not open until 2027](https://www.nuh.nhs.uk/community-diagnostic-centre/),
so insourced/mobile/outsourced capacity or reporting-coverage changes are the
candidates), a service move (sleep studies −48%, list 1,303→417) and list
validation (NOUS census −38% on flat activity). Step-changed modalities are
excluded from calibration, mirroring the RTT method; the EPR-year pair's core
reading (−5.8%) confirms that year is contaminated for diagnostics too.
*Symmetry note*: the pre-EPR rule is applied consistently even though it
raises growth here while (before working-day adjustment) it lowered growth
for RTT — the rejected EPR-year pairs swing in implausible and opposite
directions across modules, which is recording disruption, not demand. The
pre-EPR pair may itself embed recovery-drive catch-up rather than pure
demand, so growth stays a lever with the raw figure quoted alongside.
The 95%-by-Apr-27 / 99%-by-Apr-29 milestones are a documented modelling
assumption aligned to the RTT trajectory.

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
FDS-volume growth **+4.2%/yr** from the pre-EPR pair, **working-day adjusted
on the same basis as RTT/DM01** — cancer cohorts (diagnoses communicated,
treatments delivered) are clinic-driven, and Apr-24 had 21 working days vs
Apr-25's 20, so the raw ratio (−0.7%) is the Easter artefact again (the EPR
year shows +13.4%). Trust PTL data would deepen this to a backlog model.

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
emergency LOS (5.1d) via Little's Law, net of an elective-occupied estimate
(~57 beds from the RTT baseline's current activity; both figures are written
into the JSON by the ingest and rendered from it) so the bed chart is a
true emergency + elective decomposition without double-counting. `ingest_kh03.py` adds the KH03
specialty bed mix (geriatric medicine is the largest occupied base) and
England occupancy context. `ingest_drd.py` adds Discharge Ready Date delays
(Apr-26: 22.7% of discharges delayed, **5,435 bed-days lost ≈ 179 beds**;
early-year figures understate — DRD recording matured over 2024-26). The
module models the 4-hour standard as a flow standard (like cancer) with
DOCUMENTED milestone assumptions — 82% at Apr-27 is the Medium Term Planning
Framework objective (2025/26 ambition was 78%), 88%/95% are our interpolation
and constitutional endpoint — and, because the all-types metric is
UTC-flattered, also derives the implied TYPE-1 glide (holding non-type-1
streams at today's performance, type-1 must reach ~98.8% for 95% all-types,
from 44.7% today); plus 12-hour DTA to zero and the shared bed pool: emergency beds (λ×LOS) + the elective
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
The index is ANCHORED to required vs DELIVERED activity at t0 — month-0
required work already exceeds today's delivery (the recovery step-up), so the
FTE gap includes the step-up rather than assuming current staff absorb it for
free. Even so the gap is understated: bank/agency staffing (outside the
published counts) currently absorbs part of that step-up. A productivity
panel makes the 'no-chequebook' case: the RX1 proxy (occupied bed-days per
clinical FTE, caveats stated) is **−15% vs 2019** with +26% more staff —
matching the direction of NHSE's national acute estimate (−8% by late
2024/25, recovering ≈2.4%/yr) — and a solver reports the productivity rate
that closes the FTE gap at trend headcount (≈5.7%/yr on the current seed;
+1.5%/yr headcount brings it to ≈4.1%/yr — the credible plan is a mix; both
figures are solved live on the page, so treat the page as authoritative).

## Known limitations

The model produces strong structural findings (the implied type-1 4-hour
requirement, the required productivity rate, the bed gap being largely a
discharge problem). Those claims will travel further than the caveats
attached to them, so the boundary of what the model can support is written
down here, by us, rather than left for a critic to discover:

- **Steady-state queueing assumptions.** Waits and census shapes come from
  the exponential/Erlang family (Fong et al. 2022); real pathways deviate,
  and the shape factor k patches the level but not the dynamics. Clearance
  trajectories between milestones are smooth glides, not operational plans.
- **No within-year seasonality.** Everything is seeded from April(-anchored)
  levels and grows smoothly; winter surges, leave patterns and elective
  cancellation waves are outside the model. The UEC module uses winter
  averages for beds precisely because the annual average would flatter them.
- **Modules do not compete for capacity.** Cancer pathway activity, RTT
  clock stops and diagnostic tests are modelled as separate requirements;
  in reality they share the same theatres, clinics and scanners, so the
  module totals cannot simply be added (the bed pool is the one shared
  constraint the model does join up).
- **Workforce counts are substantive ESR only.** Bank and agency staffing is
  invisible to the published statistics, so FTE gaps are understated and the
  productivity proxy conflates substantive-staff productivity with changes
  in the bank/agency share.
- **Published national data, not trust operational data.** April snapshots,
  no PTL, no theatre timetables, no job plans; operational parameters
  (cases/session, N:FU ratios, LOS) remain estimates until trust data
  replaces them.
- **Requirement ≠ feasibility.** The model computes the capacity that meets
  the standards; it does not check that estates, workforce supply or money
  make that capacity deliverable — that is exactly the conversation the
  outputs are meant to start.

## Roadmap

| Phase | Scope |
| --- | --- |
| **1 — Elective spine (this release)** | RTT waiting list → clock stops → OP / theatres / beds / diagnostics per TFC, trust rollup, levers, scenarios |
| **2 — Diagnostics (this release)** | DM01 modality-level queues vs the 6-week standard — `diagnostics.html`, seeded from the published DM01 provider files (Apr-24/25/26), same queueing core on a 6-week window |
| **3 — Cancer (this release)** | FDS / 31-day / 62-day timeliness by tumour site — `cancer.html`, seeded from published CWT provider data (Apr-24/25/26, two formats), flow model on cohort volumes |
| **4 — UEC (this release)** | ED 4-hour, 12-hour DTA, discharge delays and the shared bed pool — `uec.html`, seeded from MSitAE, UEC sitreps, KH03 and Discharge Ready Date; including ambulance handover (Handover Times by Acute Trust) |
| **5 — Workforce (this release)** | Medical & nursing FTE as the cross-cutting constraint — `workforce.html`, activity-driven requirement vs supply at trend, seeded from NHS Workforce Statistics |

## Method documentation — the anatomy page

`anatomy.html` is the model's visual method documentation, built for a
lay reader and on the same anti-drift principle as the k-range fix:
**every number is computed live from the engine and the seed, none are
typed in**, so the explanation can never disagree with the tool. One
flow picture carries the whole method — referrals → minus removals →
effective demand → plus backlog clearance → clock stops required →
converting into outpatient slots, theatre sessions, beds and diagnostic
tests — with the actual monthly volumes on every band, a month slider, a
today's-delivery marker, and the model levers redrawing the picture in
real time. The conversion arrows carry their formulas (the units change
there, so the flow is only claimed volume-true up to clock stops), and
work driven by referrals rather than stops (first attendances,
diagnostics) is drawn from the referrals node — the tandem-queue point.
The census-vs-flow cameras, the tandem queue and the shape factor are
footnotes linking to their explainers. Every model page also now carries
a **"Where do these numbers come from?"** provenance click-through,
rendering the `_provenance` block its ingest wrote into the JSON seed.

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
