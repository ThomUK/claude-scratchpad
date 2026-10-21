# Design: synthetic-hospital-datastructure

Design document for review before any code is written. Everything marked
**assumption** is a number or rule I chose because I could not find an
authoritative public figure; correct it and the generator will follow.

## 1. Purpose and principles

- A fixed, versioned, seeded synthetic dataset for one fictional acute trust,
  queryable with SQL from a browser page, from R and from Python, with no
  server.
- Three layers, each built from the one below by SQL that is checked in and
  readable, so the information lost at each step is demonstrable:
  1. **Source extracts**: what the trust's systems actually emit. Event-level,
     one table per system, deliberately messy.
  2. **Derived entities**: spells, episodes, ward stays, attendances,
     appointments, exams, procedures. What an analyst in the trust sees.
  3. **Aggregates**: the counts, snapshots and performance figures that leave
     the trust. What a board or a national return sees.
- Flow only. No diagnoses, procedures codes, observations or results in v1.
- Mess is injected on purpose, at known rates, and every injected row is
  recorded in a hidden answers table (`mess_log`) so the mess is a teaching
  aid rather than an accident. See `MESS-CATALOGUE.md`.
- Reproducible: one seed, one manifest, committed output. Re-running the
  generator with the same seed and version gives byte-identical Parquet.

## 2. The fictional trust

**Thornfield Vale NHS Foundation Trust**, organisation code `RZ9` (chosen to
look like an ODS code without being one). Two sites:

| Site code | Name | Role |
| --- | --- | --- |
| `RZ901` | Thornfield General Hospital | Main site. The only emergency department. All non-elective admissions, most medical specialties, trauma, emergency surgery, and plenty of elective work. |
| `RZ902` | Wyvern Park Hospital | Predominantly elective: day surgery, elective orthopaedics, ophthalmology, ENT, most routine outpatients and a large share of routine MRI and endoscopy. A small number of non-elective admissions arise from elective patients deteriorating on site. |

### 2.1 Specialties and where they work

Treatment function codes (TFC) from the NHS Data Dictionary, reusing the
`nhs-specialties/` reference data in this repo.

| TFC | Specialty | RZ901 (General) | RZ902 (Wyvern Park) |
| --- | --- | --- | --- |
| 180 | Emergency Medicine | ED, SDEC | – |
| 300 | General Internal Medicine | AMU, wards, OP | – |
| 430 | Geriatric Medicine | wards, OP, frailty unit | OP only |
| 320 | Cardiology | CCU, ward, OP, echo | OP only |
| 340 | Respiratory Medicine | ward, OP | – |
| 301 | Gastroenterology | ward, OP, endoscopy | OP, endoscopy |
| 100 | General Surgery | emergency + elective, OP | day case + elective, OP |
| 110 | Trauma & Orthopaedics | trauma, OP | elective inpatient + day case, OP |
| 101 | Urology | emergency, OP | elective, day case, OP |
| 130 | Ophthalmology | – | day case, OP |
| 120 | ENT | – | day case, OP |
| 502 | Gynaecology | ward, OP | day case |
| 420 | Paediatrics | ward, OP | – |
| 330 | Dermatology | – | OP |
| 410 | Rheumatology | OP | OP |

Obstetrics and mental health are out of scope for v1 (birth and delivery
episodes bring their own CDS types; mental health is a different data model).

### 2.2 Wards

About 22 wards across the two sites, each with site, specialty, bed count and
a canonical name. Names are *not* stable in the source data (see the mess
catalogue): at least two wards are renamed mid-period, one closes and
reopens, and ward names appear with inconsistent casing and spacing.

| Site | Ward (canonical) | Specialty | Beds | Notes |
| --- | --- | --- | --- | --- |
| RZ901 | ED | 180 | – | Not a bed ward; appears in ADT as a location for admitted patients boarding. |
| RZ901 | SDEC | 180 | 12 | Same-day emergency care. |
| RZ901 | AMU | 300 | 40 | Acute medical unit; most non-elective medical admissions land here first. |
| RZ901 | Ward 1 Cardiology / CCU | 320 | 24 | |
| RZ901 | Ward 2 Respiratory | 340 | 28 | |
| RZ901 | Ward 3 Gastro | 301 | 24 | |
| RZ901 | Ward 4 Medicine | 300 | 28 | |
| RZ901 | Ward 5 Frailty | 430 | 28 | Renamed from "Ward 5 Elderly Care" in month 14. |
| RZ901 | Ward 6 Frailty | 430 | 28 | |
| RZ901 | SAU | 100 | 16 | Surgical assessment unit. |
| RZ901 | Ward 7 Surgery | 100 | 28 | |
| RZ901 | Ward 8 Trauma | 110 | 28 | |
| RZ901 | Ward 9 Urology / Gynae | 101/502 | 24 | Mixed ward: specialty of the bed is ambiguous in the data. |
| RZ901 | Childrens Ward | 420 | 20 | |
| RZ901 | ICU | 192 | 12 | Critical care; appears as a location only. |
| RZ901 | Escalation Ward | mixed | 0–20 | Opens in winter months only. |
| RZ901 | Discharge Lounge | – | – | Location with no overnight stays. |
| RZ902 | Day Surgery Unit | mixed | 30 | |
| RZ902 | Elective Ortho Ward | 110 | 32 | |
| RZ902 | Eye Unit | 130 | 8 | |
| RZ902 | ENT Day Unit | 120 | 8 | |
| RZ902 | Ward W1 Surgery | 100 | 20 | |

## 3. Time range and population

- **Activity window:** 1 April 2023 to 31 March 2026 inclusive. Three full
  financial years, enough for monthly time series and seasonality.
- **Edges are honest.** Some spells are open at 1 April 2023 (their admission
  events exist, dated before the window) and some are open at 31 March 2026
  (no discharge yet). This is what real extracts look like and it is what
  makes the midnight census differ from admissions minus discharges.
- **Population:** 50,000 patients who had at least one contact in the window.
  Age and sex drawn from an English acute-trust contact profile (older
  skewed; roughly 20% under 18, 35% 18–64, 45% 65+ for admissions,
  flatter for ED and outpatients). **Assumption.**
- Some patients die during the window (in hospital or notified later), so
  dates of death exist and some are recorded after activity that should have
  stopped.

### 3.1 Identifiers

| Identifier | Format | Owner | Notes |
| --- | --- | --- | --- |
| NHS number | `fake_` + 10 digits, the 10 digits having a valid modulus-11 check digit | national | Looks right, cannot be mistaken for real. Stored as text. |
| Hospital number (MRN) | `T` + 7 digits | PAS | The trust's master identifier. Both sites share one PAS. |
| ED system ID | `E` + 8 digits | ED system | Issued by the ED system, mapped to MRN by an interface that sometimes fails. |
| RIS patient ID | integer | Radiology Information System | |
| Endoscopy system ID | `EN-` + 6 digits | endoscopy vendor | |

A patient can have more than one MRN (duplicates later merged via an A40
event) and the departmental systems hold their own identifiers, so joining
across systems is a real task, not a foreign-key lookup. The master patient
index in layer 2 resolves this.

## 4. Layer 1: source extracts

One table per source system, with that system's own conventions. Column
names deliberately differ in style between systems.

### 4.1 `pas_adt_events` — the PAS event log

An HL7 v2 ADT-style event stream. This is the single most important table:
everything in the inpatient domain is derived from it.

| Column | Meaning |
| --- | --- |
| `message_id` | sequence number in the order the message was received |
| `event_type` | `A04` register (ED or outpatient-to-admit pre-registration), `A01` admit, `A02` transfer, `A03` discharge, `A08` update (consultant or specialty change creates a new episode; also used for demographic corrections), `A11` cancel admit, `A13` cancel discharge, `A40` merge patient |
| `event_datetime` | when the thing happened (effective time) |
| `recorded_datetime` | when the message was sent; lags `event_datetime` by minutes to days |
| `mrn` | hospital number |
| `visit_number` | PAS spell identifier |
| `site_code` | `RZ901` or `RZ902` |
| `ward` | ward name as typed in the PAS at the time |
| `bed` | bay/bed label, often blank |
| `consultant_code` | fictional GMC-style code |
| `specialty_code` | TFC |
| `admission_method` | NHS Data Dictionary admission method (e.g. `21` ED, `11` waiting list, `12` booked, `13` planned, `22` GP, `28` other emergency) on A01 only |
| `admission_source` | NHS Data Dictionary source of admission on A01 only |
| `discharge_method` / `discharge_destination` | on A03 only |
| `patient_class` | `I` inpatient, `D` day case, `R` regular day attender |
| `prior_mrn` | on A40 only: the MRN being merged away |

Roughly 10 events per spell. Volume: around 60,000 spells a year, so about
1.8 million events over three years. **Assumption**; see section 7.

### 4.2 `ed_attendances` — ED system export

ECDS-shaped, one row per attendance, from a different system with its own
patient ID.

Columns: `ed_attendance_id`, `ed_patient_id`, `nhs_number`, `mrn` (nullable:
the interface fills it in later and sometimes never), `arrival_datetime`,
`arrival_mode` (ambulance, walk-in, other), `attendance_category` (first,
follow-up, unplanned re-attendance), `triage_datetime`, `acuity` (1–5),
`initial_assessment_datetime`, `seen_by_clinician_datetime`,
`decision_to_admit_datetime` (nullable), `departure_datetime`,
`discharge_status` (admitted, discharged, transferred, left before treatment,
died), `chief_complaint` (short code list), `department` (ED, UTC, SDEC).

Volume around 85,000 attendances a year with about 25% admitted.
**Assumption.**

### 4.3 `pas_outpatient_appointments`

One row per appointment slot that was booked. Columns: `appointment_id`,
`mrn`, `referral_id`, `site_code`, `clinic_code`, `specialty_code`,
`consultant_code`, `appointment_datetime`, `appointment_type`
(first/follow-up), `attendance_status` (NHS Data Dictionary attended-or-DNA
codes: 5 attended, 6 arrived late and seen, 7 DNA, 2 patient cancelled,
4 hospital cancelled, 3 arrived late not seen), `outcome` (discharged,
follow-up, added to waiting list, diagnostic requested), `booked_datetime`,
`cancelled_datetime`, `contact_mode` (face to face, telephone, video).

Volume around 350,000 appointments a year. **Assumption.**

### 4.4 `pas_referrals` — the RTT skeleton

One row per referral into the trust. Columns: `referral_id`, `mrn`,
`referral_received_date`, `referral_source` (GP, consultant-to-consultant,
ED, other), `specialty_code`, `priority` (routine, urgent, two-week-wait),
`rtt_pathway_id`, `clock_start_date`, `clock_stop_date` (nullable),
`clock_stop_reason`. Enough to derive incomplete-pathway snapshots, not a
full RTT implementation.

### 4.5 `ris_imaging` — CT and MRI from the Radiology Information System

One structure, two modalities, two very different teams (see mess
catalogue M-CT-* and M-MRI-*). One row per examination request.

| Column | Meaning |
| --- | --- |
| `exam_id` | RIS accession number |
| `ris_patient_id` | RIS identifier |
| `nhs_number`, `mrn` | as the RIS holds them |
| `modality` | `CT` or `MR` |
| `exam_code` | NICIP-style short code, e.g. `CHEAC` (CT head), `MKNEL` (MRI knee left) |
| `exam_description` | free text as the booking clerk typed it |
| `body_area` | reference-table value, inconsistently filled |
| `priority` | emergency, urgent, two-week-wait, routine, planned |
| `patient_source` | DID-style source setting: GP direct access, outpatient, inpatient, A&E, other |
| `referrer_code`, `referring_specialty` | |
| `request_datetime` | |
| `vetted_datetime` | radiologist vetting, nullable |
| `booked_datetime` | appointment time given |
| `scan_start_datetime`, `scan_end_datetime` | actual scanner time |
| `slot_minutes` | the slot the booking system allocated |
| `reported_datetime` | preliminary report |
| `verified_datetime` | final report authorised |
| `reporter_code` | |
| `status` | requested, vetted, booked, cancelled, DNA, performed, reported, verified |
| `cancel_reason` | nullable |
| `site_code` | scanner site |
| `scanner_id` | CT1, CT2 at RZ901; MR1 at RZ901, MR2 at RZ902 |

**Exam catalogue.** Durations are the scanner-room time; slot lengths are
what the booking system allocates. All **assumptions** from patient-facing
NHS guidance and published timing studies, since no public NHS slot-length
standard was found; inpatient and ED exams run a few minutes longer than
outpatient ones.

| Modality | Exam | Typical room time (min) | Slot (min) | Share of modality | Main sources |
| --- | --- | --- | --- | --- | --- |
| CT | Head | 5–10 | 10 | 30% | ED, inpatient |
| CT | Chest | 8–12 | 15 | 12% | OP, GP, inpatient |
| CT | Abdomen & pelvis with contrast | 12–18 | 20 | 18% | ED, inpatient, OP, 2WW |
| CT | Chest/abdo/pelvis (staging) | 15–20 | 20 | 10% | OP, 2WW |
| CT | Pulmonary angiogram (CTPA) | 10–15 | 15 | 8% | ED, inpatient |
| CT | KUB (renal colic) | 5–10 | 10 | 6% | ED |
| CT | Angiography (head and neck, aorta, limb) | 12–18 | 20 | 5% | ED, inpatient |
| CT | Coronary angiography (CTCA) | 20–30 | 30 | 4% | OP cardiology |
| CT | Colonography | 20–30 | 30 | 3% | OP, GP, 2WW |
| CT | Guided intervention (biopsy, drain) | 30–50 | 45 | 2% | inpatient, OP |
| CT | Spine / extremity | 8–12 | 15 | 2% | ED, OP |
| MR | Brain | 20–30 | 30 | 22% | OP, GP, inpatient |
| MR | Lumbar spine | 20–30 | 30 | 20% | GP, OP |
| MR | Knee | 20–30 | 30 | 14% | GP, OP |
| MR | Whole spine | 40–50 | 45 | 6% | inpatient, OP |
| MR | Shoulder / hip / small joint | 20–30 | 30 | 10% | GP, OP |
| MR | MRCP | 25–40 | 45 | 5% | OP, inpatient |
| MR | Prostate | 30–40 | 40 | 7% | OP, 2WW |
| MR | Pelvis (gynae) | 30–45 | 45 | 5% | OP, 2WW |
| MR | Cardiac | 45–60 | 60 | 4% | OP cardiology |
| MR | Breast | 30–45 | 45 | 2% | OP |
| MR | Liver / abdomen with contrast | 30–40 | 45 | 5% | OP, inpatient |

Pathway: request → vetting (MRI only; CT vets only routine) → booking →
scan → report → verification. Waiting-time clock for DM01-style aggregates
starts at `request_datetime` and stops at `scan_start_datetime`; planned
(surveillance) exams are excluded from the waiting list, as in DM01.

Volume: about 45,000 CT and 25,000 MRI examinations a year. **Assumption**,
scaled from the national ratio (CT roughly 1.7× MRI in 2024/25).

### 4.6 `endo_procedures` — the endoscopy vendor's export

A different vendor, so a different shape: procedure-centric, one wide table,
text dates, its own identifiers, no event log. Modelled on the National
Endoscopy Database minimum dataset as far as it is publicly described;
field names are the vendor's style, not the NED's.

| Column | Meaning |
| --- | --- |
| `ProcID` | vendor procedure id |
| `PatientRef` | `EN-` identifier |
| `NHSNo` | text, **with spaces** (`fake_123 456 7890`) |
| `HospNo` | MRN as typed, sometimes blank or with the wrong site prefix |
| `ProcDate` | text, `DD/MM/YYYY` |
| `StartTime`, `EndTime` | text, `HH:MM`, sometimes blank |
| `ProcType` | OGD (gastroscopy), Colonoscopy, Flexi Sig, (ERCP and EUS excluded from v1) |
| `Category` | `IP-EL` elective inpatient / day case, `IP-NEL` emergency inpatient, `OP` outpatient direct, `SURV` surveillance, `BCSP` bowel cancer screening |
| `Indication` | short list (e.g. dyspepsia, dysphagia, PR bleeding, iron deficiency, FIT positive, surveillance polyps, GI bleed inpatient) |
| `Urgency` | routine, urgent, 2WW, emergency |
| `ReferralDate` | text |
| `Endoscopist` | code |
| `ListID`, `ListPoints` | the list the procedure was on and its total points |
| `Points` | 1 for OGD and flexi sig, 2 for colonoscopy (JAG convention) |
| `Sedation` | none, throat spray, conscious sedation, Entonox, GA |
| `Extent` | for lower GI: caecum, terminal ileum, splenic flexure, etc. |
| `Completion` | Y/N (caecal intubation for colonoscopy) |
| `Comfort` | 1–5 modified Gloucester comfort score |
| `Outcome` | normal, abnormal with biopsy, polypectomy, abandoned, DNA, cancelled on the day |
| `Site` | free text: `TGH`, `Thornfield`, `WP`, `Wyvern Park` |
| `Report` | one-line synthetic free text, no clinical meaning |

Procedure durations (**assumption**, from NHS patient guidance): OGD 10–15
min, flexi sig 15–20, colonoscopy 30–45 (longer with polypectomy). A
standard service list is 10 points over about 4 hours at RZ902 and 8 points
at RZ901 where emergency cases interrupt (**assumption**; JAG's published
training-list standard is 8 points).

**How endoscopy links to the rest.** There is no spell or appointment key in
this table. Linkage is by patient and date:

- `IP-EL` procedures match a day-case spell on the same date (admission method 11/12, specialty 301 or 100).
- `IP-NEL` procedures match an open non-elective spell containing the procedure date (e.g. upper GI bleed admitted via ED).
- `OP` procedures match a referral or an outpatient appointment whose outcome was "diagnostic requested" within the preceding 12 weeks.
- `SURV` and `BCSP` are planned: a recall date exists and the procedure is excluded from waiting-time aggregates. They have no matching referral; `BCSP` patients are aged 50–74 (**assumption**).

About 40% `OP`, 25% `SURV`+`BCSP`, 25% `IP-EL`, 10% `IP-NEL`
(**assumption**). Volume: about 9,000 procedures a year.

### 4.7 Reference tables

`ref_sites`, `ref_wards` (with valid-from/valid-to for renames), `ref_specialties`
(from `nhs-specialties/`), `ref_consultants`, `ref_clinics`, `ref_exam_catalogue`,
`ref_admission_method`, `ref_attendance_status`, `ref_chief_complaint`.

### 4.8 `mess_log` — the answers

One row per injected imperfection: `mess_id` (catalogue code), `table`,
`row_key`, `field`, `original_value` (where the mess replaced something),
`note`. Shipped as a separate file so it can be withheld in a teaching
exercise.

## 5. Layer 2: derived entities

All built by DuckDB SQL files under `sql/derive/`, run in order and committed
with the data. Each file is short enough to read in a teaching session.

| Table | Grain | Derived from | Key decisions the SQL has to make |
| --- | --- | --- | --- |
| `patients` | one row per real person (master patient index) | all sources + A40 merges | which MRN survives; how ED, RIS and endoscopy identifiers map on |
| `spells` | one hospital provider spell | `pas_adt_events` | handling A11/A13 cancellations, duplicate A03s, missing A03s, open spells at the edges |
| `episodes` | consultant episode within a spell | A01 + A08 specialty changes | episode boundaries when A08 is a correction rather than a transfer of care |
| `ward_stays` | one continuous stay on one ward | A01/A02/A03 | normalising ward names; stays of zero minutes; ED and Discharge Lounge as locations |
| `ed_attendances_clean` | one attendance | `ed_attendances` + MPI | resolving unmapped MRNs; linking admitted attendances to spells |
| `op_appointments_clean` | one appointment | `pas_outpatient_appointments` | collapsing rebooked slots |
| `rtt_pathways` | one pathway | `pas_referrals` + appointments + spells | clock stops implied by activity |
| `imaging_exams` | one performed exam | `ris_imaging` | de-duplicating CT cancellations; backfilled MRI report dates; request-to-scan and scan-to-report intervals |
| `endoscopy_procedures` | one performed procedure | `endo_procedures` + MPI + spells | parsing text dates; attaching `spell_id` or `referral_id` by date overlap |

## 6. Layer 3: aggregates

Built by SQL under `sql/aggregate/`. Each is a familiar NHS management or
national-return shape, and each discards something recoverable only from
layer 1 or 2.

| Aggregate | Grain | Mirrors | What it loses |
| --- | --- | --- | --- |
| `agg_midnight_census` | ward × day, beds occupied at 00:00 | bed state / SitRep | everything that happened between midnights; same-day stays vanish |
| `agg_daily_flow` | site × specialty × day: admissions, discharges, deaths, transfers in/out | daily flow report | who moved; LOS distribution |
| `agg_ed_monthly` | site × month: attendances, 4-hour %, 12-hour waits, admitted % | A&E monthly return | intra-day arrival pattern; acuity mix |
| `agg_apc_monthly` | specialty × admission-method group × month: spells, bed days, mean and median LOS | HES APC-style activity | the LOS tail; readmissions |
| `agg_op_monthly` | specialty × month: first and follow-up attendances, DNA rate | outpatient activity | rebooking churn |
| `agg_dm01_snapshot` | test × month-end: waiting list by weeks waiting, activity in month | DM01 | who waited; planned exclusions |
| `agg_did_monthly` | modality × patient source × month: exams, median request-to-test and test-to-report | DID statistics | exam mix; team differences |
| `agg_rtt_incomplete` | specialty × week: incomplete pathways by weeks waiting | RTT incomplete | pathway histories |
| `agg_endoscopy_monthly` | procedure type × category × month: procedures, points, completion rate | JAG-style activity | list utilisation; linkage to admissions |

## 7. Volumes, seasonality and shape

Indicative annual volumes (**assumptions** for a smallish acute trust; the
generator takes these as parameters):

| Activity | Per year |
| --- | --- |
| ED attendances | 85,000 |
| Spells (all) | 60,000, of which day cases 28,000, non-elective 22,000, elective inpatient 10,000 |
| Outpatient appointments | 350,000 |
| CT examinations | 45,000 |
| MRI examinations | 25,000 |
| Endoscopy procedures | 9,000 |

Patterns the generator builds in: ED arrivals peak early afternoon and on
Mondays; non-elective admissions peak in winter with a visible early-January
spike; elective activity dips over Christmas and in August; discharges dip at
weekends so occupancy peaks on Monday; MRI reporting backlog grows over each
summer; a flu season in each winter with a different shape (nod to the
`flu/` app). Length of stay is log-normal with a long tail per specialty.

## 8. Hosting, formats and access

- **Primary format: Parquet**, one file per table, committed under
  `synthetic-hospital-datastructure/data/v1/`. Parquet is typed, compressed
  (the whole dataset should sit well under 200 MB, within Pages limits),
  and readable over HTTPS by DuckDB, Arrow, R and Python without downloading
  the whole file.
- **Secondary format: a CSV zip** of the same tables, committed alongside.
  It exists only for people whose tools cannot read Parquet, and for opening
  a table in a spreadsheet. The Parquet files are canonical; the CSVs are
  generated from them and carry the same version tag. Both are listed in
  `manifest.json` with row counts and checksums.
- **Browser:** a page in the usual repo style with a DuckDB-WASM SQL console
  pre-loaded with the tables, a schema browser, and the explainer walking
  from an ADT event to a spell to a midnight census with runnable queries.
  GitHub Pages serves the Parquet files from the same origin, so no CORS or
  external hosting is needed.
- **R:** `duckdb` with the httpfs extension or `arrow::read_parquet()` on the
  Pages URL. A small R package in the sub-project (working name
  `thornfield`) wraps this: `tf_tables()`, `tf_read("spells")`, and
  `tf_connect()` which returns a DuckDB connection with every table attached
  as a view so joins run locally.
- **Python:** `duckdb.sql("select ... from 'https://thomuk.github.io/claude-scratchpad/synthetic-hospital-datastructure/data/v1/spells.parquet'")`
  or `pandas.read_parquet(url)`. Documented in the README; no package.
- **Versioning:** `data/v1/` is immutable once published. A regenerated or
  reshaped dataset goes to `data/v2/` with its own manifest. Other projects
  pin a version.

## 9. The generator

- **Language: R**, as an R package under `synthetic-hospital-datastructure/generator/`.
- **Entry point:** `generate(seed = 20230401, n_patients = 50000, start = "2023-04-01", end = "2026-03-31", volumes = default_volumes(), mess = default_mess_rates(), out_dir)`.
- **Pipeline:** population → referrals and outpatient → ED attendances →
  admissions and ward moves (clean event log) → imaging → endoscopy → inject
  mess (recording every injection in `mess_log`) → write layer 1 Parquet →
  run `sql/derive/*.sql` with DuckDB → run `sql/aggregate/*.sql` → write
  manifest.
- **Tests:** `testthat` unit tests on the engine (determinism for a fixed
  seed, volumes within tolerance, every spell has one A01, every injected
  mess row is in `mess_log`, derived layer reproduces the clean truth when
  mess is switched off). A `make check` equivalent runs them.
- **Mess is a switch.** `mess = NULL` produces the clean dataset, which is
  itself useful: the derived layer built from clean data is the ground
  truth the messy derivation is marked against.
- **No regeneration in the browser.** The committed dataset is the product;
  the generator is there so anyone can run it locally with another seed or
  size.

## 10. Deliverables, in order

1. This design and the mess catalogue (done, for review).
2. R package with the clean generator and tests; clean `data/v1` candidate.
3. Mess injection and `mess_log`.
4. Derive and aggregate SQL; manifest; CSV zip.
5. Browser console and explainer page; card on the root `index.html`; README row.
6. R helper package and R/Python access docs.

## 11. Open points for review

- Volumes in section 7 and the exam catalogue in 4.5 are the biggest
  assumptions. Any real-world figures you can share replace them.
- Whether ultrasound and plain X-ray should join CT and MRI in `ris_imaging`
  (same structure, cheap to add, much higher volume).
- Whether `pas_referrals` should carry a fuller RTT model now, given the
  other apps in this repo lean on RTT.
- The fictional names (Thornfield Vale, Wyvern Park) and code `RZ9`.
