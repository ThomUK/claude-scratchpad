# Calibration: what the real figures say

Numbers taken from the source documents in `docs/sources/`, used to set the
generator's volumes, mixes and seasonal shapes. Figures are national or
provider-level 2023/24 to 2025/26 unless stated. Anything the generator uses
that is *not* in this file is an assumption and is labelled as such in
`DESIGN.md`.

## 1. Scale of a top-10 trust: imaging (DID Table 11, 2023/24)

Providers ranked by CT plus MRI examinations. Source: `DID-Table-11-2023-24-Modality-Provider-Source-setting.xlsx`, sheet Provider.

| Rank | Trust | CT | MRI | X-ray | Ultrasound | All modalities |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | University Hospitals Birmingham | 176,350 | 95,315 | 455,440 | 144,400 | 906,390 |
| 2 | Leeds Teaching Hospitals | 160,555 | 65,135 | 388,115 | 169,875 | 814,980 |
| 3 | Northern Care Alliance | 129,690 | 87,890 | 374,050 | 123,200 | 738,650 |
| 4 | Barts Health | 144,055 | 67,970 | 399,525 | 350,050 | 994,285 |
| 5 | University Hospitals Sussex | 141,680 | 64,240 | 343,320 | 158,580 | 732,665 |
| 6 | Mid and South Essex | 142,675 | 62,970 | 448,050 | 171,395 | 841,365 |
| 7 | Imperial College Healthcare | 107,140 | 85,505 | 203,295 | 94,135 | 510,525 |
| 8 | Northern Lincolnshire and Goole | 120,770 | 61,935 | 161,190 | 84,080 | 440,770 |
| 9 | University Hospitals of North Midlands | 104,635 | 77,390 | 294,845 | 110,050 | 598,020 |
| 10 | Oxford University Hospitals | 118,045 | 59,670 | 295,975 | 102,190 | 606,315 |
| 11 | Nottingham University Hospitals | 119,295 | 58,030 | 273,400 | 112,510 | 591,895 |

137 NHS trusts submitted CT activity. The top-10 pooled mean is CT 134,560
and MRI 72,800; the 10th-ranked trust does CT 118,045 and MRI 59,670.

**Generator target (a trust sitting around rank 8 to 10):** CT 125,000 and
MRI 68,000 a year. X-ray and ultrasound, if added later: 320,000 and
130,000.

### Patient source setting, % of examinations

| Modality | A&E | Day case | Inpatient | Outpatient | GP direct access | Other provider | Other |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CT, England | 32.6 | 0.4 | 22.3 | 36.8 | 6.0 | 0.7 | 1.2 |
| CT, top-10 pooled | 34.9 | 0.2 | 22.1 | 37.6 | 5.0 | 0.2 | 0.1 |
| MRI, England | 3.3 | 0.7 | 12.4 | 62.9 | 15.8 | 3.0 | 1.9 |
| MRI, top-10 pooled | 3.9 | 0.4 | 14.3 | 70.9 | 9.9 | 0.5 | 0.1 |
| X-ray, England | 34.4 | 0.4 | 16.1 | 21.4 | 25.9 | 0.7 | 1.2 |
| Ultrasound, England | 2.5 | 0.7 | 11.4 | 51.8 | 30.2 | 1.2 | 2.3 |

The generator uses the top-10 pooled splits for CT and MRI. The difference
between the two modalities is the single strongest reason the CT and MRI
teams behave differently in the data: a third of CT comes through the
emergency department, almost no MRI does.

## 2. Emergency department: national Type 1 series (Monthly A&E Time Series, Sept 2026 edition)

Source: `Monthly-AE-Time-Series-September-2026.xls`, sheets Activity and
Performance. National, Type 1 departments, April 2023 to March 2026.

| Month | Type 1 attendances | Emergency admissions via Type 1 | Admitted % | Type 1 within 4 h % | 12 h+ from decision to admit |
| --- | --- | --- | --- | --- | --- |
| 2023-04 | 1,271,145 | 363,625 | 28.6 | 60.9 | 26,492 |
| 2023-07 | 1,379,854 | 391,312 | 28.4 | 60.9 | 23,396 |
| 2023-10 | 1,413,597 | 401,524 | 28.4 | 55.9 | 43,534 |
| 2024-01 | 1,397,975 | 403,208 | 28.8 | 55.4 | 54,312 |
| 2024-03 | 1,462,878 | 420,025 | 28.7 | 60.9 | 42,972 |
| 2024-07 | 1,425,569 | 405,655 | 28.5 | 61.4 | 36,806 |
| 2024-12 | 1,440,311 | 411,161 | 28.5 | 55.3 | 54,207 |
| 2025-01 | 1,359,026 | 400,481 | 29.5 | 57.7 | 61,529 |
| 2025-07 | 1,469,050 | 412,893 | 28.1 | 63.1 | 35,467 |
| 2026-01 | 1,434,757 | 395,611 | 27.6 | 57.3 | 71,517 |
| 2026-03 | 1,478,144 | 402,356 | 27.2 | 64.1 | 46,665 |

Shape the generator reproduces:

- **Volume seasonality is weak** (about ±7% around the mean; February is
  the low month because it is short, March and May are high). Attendance
  numbers do not have a big winter peak.
- **Performance seasonality is strong**: Type 1 four-hour performance runs
  about 60–64% in summer and 55–57% in December and January, and 12-hour
  waits from decision to admit roughly double in winter. The winter effect
  is a flow and bed problem, not an arrivals problem.
- **Conversion to admission** is steady at 27–29.5% nationally for Type 1.
- There is a slow improvement in four-hour performance across the three
  years (about 61% in 2023 to about 64% by March 2026).

### 2.1 Provider level: one month (Monthly A&E provider CSV, September 2026)

Source: `Monthly-AE-Provider-September-2026.csv`. The trusts that are in
the imaging top ten, with the single-ED teaching trusts that match the
fictional trust's shape at the bottom. Columns: Type 1 attendances, Type 1
four-hour performance, emergency admissions via Type 1 and as a share of
attendances, other emergency admissions (not via A&E), 12-hour-plus waits
from decision to admit, and Type 3 / other attendances.

| Trust | Type 1 | 4 h % | Adm via T1 | Adm % | Other emerg adm | 12 h+ DTA | Type 3 / other |
| --- | --- | --- | --- | --- | --- | --- | --- |
| University Hospitals Birmingham (4 EDs) | 34,437 | 57.3 | 10,284 | 29.9 | 8,515 | 2,085 | 12,413 |
| University Hospitals Sussex (3) | 28,715 | 57.2 | 8,244 | 28.7 | 1,652 | 840 | 1,421 |
| Mid and South Essex (3) | 28,595 | 61.8 | 9,218 | 32.2 | 1,161 | 1,371 | 8,495 |
| Barts Health (3) | 27,253 | 61.0 | 3,992 | 14.6 | 1,207 | 1,208 | 18,702 |
| Northern Care Alliance (4) | 27,197 | 61.5 | 7,815 | 28.7 | 2,708 | 1,103 | 9,021 |
| Leeds Teaching Hospitals (2) | 19,809 | 61.8 | 3,696 | 18.7 | 1,164 | 685 | 10,454 |
| University Hospitals of North Midlands (2) | 15,160 | 45.3 | 4,724 | 31.2 | 1,167 | 640 | 9,198 |
| Nottingham University Hospitals (1) | 13,656 | 44.6 | 3,760 | 27.5 | 4,052 | 979 | 11,627 |
| Oxford University Hospitals (2) | 13,610 | 72.6 | 5,677 | 41.7 | 4,224 | 8 | 2,856 |
| Imperial College Healthcare (2) | 12,877 | 57.3 | 3,776 | 29.3 | 1,001 | 0 | 7,376 |
| Northern Lincolnshire and Goole (2) | 10,716 | 50.8 | 5,487 | 51.2 | 327 | 757 | 6,433 |
| England | 1,475,440 | 60.4 | 394,675 | 26.7 | 134,842 | 50,582 | 839,337 |

Two things stand out. The big Type 1 numbers belong to multi-ED trusts;
the single-ED teaching hospitals in the imaging top ten (Nottingham's
QMC, Oxford's John Radcliffe) run 13,000–14,000 Type 1 attendances a
month, about 165,000 a year, with a co-located UTC or Type 3 stream of a
similar order. And "other emergency admissions" (GP, bed bureau, transfers,
SDEC conversions) are as large as admissions via the ED at those trusts,
which matters for the ADT admission-method mix. Twelve-hour waits from
decision to admit vary from near zero to almost a thousand a month at the
same scale, so they are a generator parameter rather than a derived fact.

**Generator targets, taken from the Nottingham and Oxford shape:**

| Measure | Per year | Per month |
| --- | --- | --- |
| Type 1 attendances | 165,000 | 13,750 |
| UTC / Type 3 stream (same table, `uec_activity_type`) | 100,000 | 8,300 |
| Emergency admissions via the ED | 46,000 (28%) | 3,850 |
| Other emergency admissions | 40,000 | 3,300 |
| 12-hour-plus decision-to-admit waits | 5,000, winter-weighted | 250–650 |
| Type 1 four-hour performance | tracks the national monthly shape, 55–64% | |

## 3. Referral to treatment: national series (RTT Overview Timeseries, Aug 2026 edition)

Source: `RTT-Overview-Timeseries-Aug26.xlsx`. National, incomplete pathways.

| Month | Incomplete pathways | Median wait (weeks) | Within 18 weeks % | Over 52 weeks % |
| --- | --- | --- | --- | --- |
| 2023-04 | 4,324,159 | 14 | 58.3 | 5.0 |
| 2023-09 | 4,462,623 | 15 | 57.6 | 5.0 |
| 2024-03 | 4,312,728 | 15 | 57.2 | 4.1 |
| 2024-09 | 4,429,902 | 14 | 58.5 | 3.3 |
| 2025-03 | 4,434,722 | 14 | 59.8 | 2.4 |
| 2025-09 | 4,505,684 | 13 | 61.7 | 2.4 |
| 2026-03 | 4,580,320 | 11 | 65.3 | 1.3 |

Shape: the list is flat to slightly rising; the tail (over 52 weeks)
shrinks steadily from 5% to about 1%; median wait drifts from 14–15 weeks
to 11; within-18-weeks improves from 58% to 65%. The generator's referral
and clock-stop rates are tuned so the fictional trust's incomplete list
follows this profile scaled to its size.

### 3.1 Provider level: one month (RTT waiting times by provider, August 2026)

Source: `RTT-Waiting-Times-by-Provider-Aug26.xls`, sheets IncompProv,
AdmProv and NonAdmProv. The imaging top-ten trusts plus Nottingham. The
single-ED comparators (Nottingham, Oxford) sit 14th to 19th nationally by
incomplete list size.

| Trust | Incomplete | Within 18 wk % | Median wk | 92nd pct wk | Over 52 wk % | Completed admitted in month | Median wk | Completed non-admitted in month | Median wk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| University Hospitals Birmingham NHS Foundation Trust | 96,056 | 66.6 | 11.8 | 32.8 | 0.2 | 3,066 | 4.2 | 17,094 | 7.9 |
| Leeds Teaching Hospitals NHS Trust | 89,297 | 67.5 | 11.0 | 37.3 | 1.7 | 4,642 | 8.4 | 13,772 | 6.8 |
| Northern Care Alliance NHS Foundation Trust | 136,819 | 55.8 | 15.5 | 43.6 | 2.9 | 2,501 | 14.3 | 14,463 | 13.2 |
| Barts Health NHS Trust | 122,447 | 64.1 | 12.5 | 38.4 | 0.8 | 2,537 | 15.6 | 17,778 | 10.9 |
| University Hospitals Sussex NHS Foundation Trust | 118,139 | 52.6 | 16.9 | 47.5 | 4.8 | 3,922 | 19.8 | 14,902 | 9.6 |
| Mid And South Essex NHS Foundation Trust | 165,234 | 50.4 | 17.8 | 52.2 | 8.1 | 4,078 | 12.8 | 20,348 | 11.2 |
| Imperial College Healthcare NHS Trust | 84,317 | 70.4 | 10.8 | 32.5 | 0.0 | 3,163 | 13.9 | 15,686 | 7.3 |
| Northern Lincolnshire And Goole NHS Foundation Trust | 43,136 | 58.6 | 14.3 | 44.5 | 3.7 | 1,231 | 14.5 | 6,063 | 9.8 |
| University Hospitals Of North Midlands NHS Trust | 75,383 | 60.0 | 13.8 | 41.5 | 2.3 | 2,700 | 12.8 | 11,859 | 6.4 |
| Oxford University Hospitals NHS Foundation Trust | 89,879 | 62.2 | 13.3 | 40.9 | 1.7 | 3,575 | 16.4 | 13,358 | 10.0 |
| Nottingham University Hospitals NHS Trust | 86,339 | 62.1 | 13.3 | 43.2 | 2.8 | 2,289 | 20.3 | 10,156 | 13.5 |

Pooled specialty mix of the incomplete list at five teaching trusts
(Nottingham, Oxford, Leeds, Birmingham, Imperial). "Other medical" and
"other surgical" are the national return's catch-all treatment functions
and are larger than any named specialty, which the generator reproduces
by mapping its tertiary and sub-specialty referrals to them.

| Treatment function | Description | Share of incomplete list % |
| --- | --- | --- |
| X02 | Other - Medical Services | 15.2 |
| 502 | Gynaecology Service | 9.0 |
| X05 | Other - Surgical Services | 8.4 |
| 120 | Ear Nose and Throat Service | 8.1 |
| 130 | Ophthalmology Service | 7.5 |
| 110 | Trauma and Orthopaedic Service | 6.9 |
| 330 | Dermatology Service | 6.8 |
| X04 | Other - Paediatric Services | 5.9 |
| 320 | Cardiology Service | 4.9 |
| 101 | Urology Service | 4.9 |
| 301 | Gastroenterology Service | 4.5 |
| 400 | Neurology Service | 3.5 |
| 100 | General Surgery Service | 2.5 |
| 140 | Oral Surgery Service | 2.4 |
| 340 | Respiratory Medicine Service | 2.1 |
| 160 | Plastic Surgery Service | 1.9 |
| 150 | Neurosurgical Service | 1.8 |
| 410 | Rheumatology Service | 1.4 |
| X06 | Other - Other Services | 1.2 |
| 430 | Elderly Medicine Service | 0.5 |
| 170 | Cardiothoracic Surgery Service | 0.4 |
| 300 | General Internal Medicine Service | 0.1 |
| X03 | Other - Mental Health Services | 0.0 |

**Generator targets, taken from the Nottingham and Oxford shape:**

| Measure | Value |
| --- | --- |
| Incomplete pathways, month-end snapshot | 88,000 |
| Within 18 weeks | 62% |
| Median wait | 13 weeks |
| 92nd percentile | 42 weeks |
| Over 52 weeks | 2% |
| Completed admitted pathways per month | 3,000 (median 18 weeks) |
| Completed non-admitted pathways per month | 12,000 (median 12 weeks) |
| Clock starts per month | about 15,500, so the list is roughly stable |

Over the three-year window the trust follows the national trajectory in
section 3: the over-52-week share falls from about 5% to about 1.5% and
the median from 15 weeks to 11.

## 4. Diagnostics waiting times: DM01 rules (DM01 Guidance v9, March 2026)

Source: `DM01-Guidance-v9.pdf`. Page numbers are the printed ones.

- **The 15 tests** (p5, p17). Imaging: MRI, CT, non-obstetric ultrasound,
  barium enema, DEXA. Physiological science: audiology assessments,
  echocardiography, cardiac electrophysiology, peripheral neurophysiology,
  sleep studies, urodynamics. Endoscopy: colonoscopy, flexi sigmoidoscopy,
  cystoscopy, gastroscopy. Plain X-ray is not a DM01 test. The dataset
  covers four of the fifteen: MRI, CT, and all four endoscopy tests except
  that cystoscopy is modelled as a urology endoscopy in the same vendor
  table.
- **Clock start** (p6): "when the request for a diagnostic test or procedure
  is made." **Clock stop**: "when the patient receives the diagnostic
  test/procedure." The report date plays no part.
- **Snapshot** (p6): length of wait in weeks "on the last day of the month".
- **Patient cancellation or DNA** (p6): the clock "continues until the date
  of the appointment that the patient cancelled or missed, whereupon it is
  set to zero and the waiting time starts again." Two declined reasonable
  offers (three or more weeks out) also allow a reset. No rule for hospital
  cancellations: the clock runs on.
- **Excluded from the waiting list** (p5–6): planned or surveillance tests
  on a planned list; screening-programme tests (but a diagnostic triggered
  by a positive screen is included); patients currently admitted and waiting
  for an unscheduled test; tests incidental to a therapeutic admission.
- **Activity** (p7–9): tests "carried out during the month", one unit per
  distinct test (multiple MR scans of the same knee at one visit are one
  unit), in three columns: waiting list (excluding planned), planned
  (surveillance), and unscheduled (patients admitted as emergencies,
  admission methods 21–2D, 31, 32, and tests in A&E).
- **Not in the document**: the weeks-waiting bands, the 6-week / 1%
  operational standard, any report-date rule. The bands and the standard
  come from the monthly proforma and statistical release, not the guidance.

## 5. Diagnostic Imaging Dataset: fields and derivations

Sources: `DID-Annex-2-Data-Items-v6.1.pdf`, `DID-Technical-Report-v13-2023-24.pdf`,
`DID-Annual-Statistical-Release-2023-24.pdf`.

### 5.1 The submission (Annex 2)

A CSV with no header row and 17 columns in this order: NHS Number (M*),
NHS Number Status (R), Date of Birth (M*), Ethnicity (M*), Patient Gender
(M*), Patient Home Postcode (M*), Registered GP Practice (M*), Patient Type
(M), Referrer (R), Referring Organisation (R), Date of Test Request (R),
Date Test Request Received (R), Date of Test (M), Imaging Code NICIP (M, or
SNOMED CT), Imaging Code SNOMED CT, Date Test Report Issued (R), Provider
Site Code (M), RIS Accession Number (M). M = mandatory, R = required, M* =
at least one of the starred items must be present (Technical Report p9).

Every temporal item is a **date only**. There is no time of day, no
cancellation, no DNA, no modality and no body-site field: modality and body
site live inside the NICIP or SNOMED code, and the accession number exists
"so that a differentiation can be made between multiple body parts examined
at the same attendance". It must be unique within site code.

Patient Type (source setting) codes: 01 inpatient, 02 day case, 03
outpatient, 04 GP direct access, 05 A&E, 06 other health care provider, 07
other; "based on intended management at the time of the diagnostic test
request". There is no code for unknown.

### 5.2 Hard validations (Technical Report Table A, p9)

Request date ≤ request received ≤ test date ≤ report issued; test date not
more than 3 months before the submission month; NHS number must pass the
modulus-11 check and must not be 1234567890, 0123456789 or N00000000N;
postcode has exactly one space; referrer must be 8 characters (1–2 letters
then digits) or is converted to 99. "Only five data fields (in addition to
accession number) are mandatory, whilst all other fields can be left blank."

### 5.3 Completeness and known data-quality behaviour (Technical Report)

2023/24 completeness: NHS number 99.4%, NHS number status 82.6%, GP code
94.1%, date of test request 94.0%, date of report issue about 95.8%.
Providers have defaulted Patient Type to "Other" for up to 40% of
outpatient requests; accession numbers not consistently available have
produced both overwrites (same accession, different exams) and duplicates
(same exam, different accessions); some providers submit several records
for a complex exam that should be one. All of these are reproduced in the
mess catalogue (M-RIS-*).

### 5.4 Waits and reporting (Annual Release, 2023/24)

| Measure | X-ray | Ultrasound | CT | MRI |
| --- | --- | --- | --- | --- |
| Median request to test, days | 0 | 15 | 1 | 20 |
| Median test to report, days | 1 | 0 | 0 | 4 |
| Reported same day, inpatient and A&E | 31% | 97% | 91% | 74% |
| Reported by end of next day, inpatient and A&E | 55% | 98% | 98% | 87% |
| Reported same day, outpatient and GP | 38% | 94% | 18% | 12% |
| Reported by end of next day, outpatient and GP | 50% | 96% | 29% | 24% |

Monthly MRI request-to-test medians run 19–23 days with January the
longest; the release notes a seasonal rise in January for every modality.
Brain MRI is 953,500 of 4.4 million MRI (21.6%); chest and/or abdomen CT is
806,625 of 7.7 million CT (10.5%). RCR/SoR reporting guidance "suggests
turnaround times from 12 hours (<4 hours for Emergency Department requests
and the acutely unwell) up to 28 days according to urgency and modality".

National monthly activity 2023/24 (all modalities): April lowest at 3.61
million, January highest at 4.19 million, December 3.64 million. The
generator uses the per-modality monthly columns from Table 1 as its
seasonal index.

### 5.5 Day curves (GIRFT radiology, 2017/18 DID data, chart-read)

| Days from request | CT done by | MRI done by |
| --- | --- | --- |
| 0 | ≈43% | ≈8% |
| 1 | ≈50% | ≈13% |
| 10 | ≈65% | ≈31% |
| 14 | ≈72% | ≈38% |
| 28 | ≈85% | ≈62% |
| 42 | ≈92% | ≈84% |

| Days from test | CT reported by | MRI reported by |
| --- | --- | --- |
| 0 | ≈59% | ≈24% |
| 1 | ≈69% | ≈35% |
| 3 | ≈76% | ≈50% |
| 7 | ≈88% | ≈70% |
| 21 | ≈98% | ≈92% |

GIRFT also reports mean scanner counts per trust of 3.4 CT and 2.8 MRI
(median 2), recommends at least two CT scanners accessible from any ED, and
suggests cold scanners plan for "75–80% of all available slots". It gives
no slot lengths, no per-scanner throughput and no DNA rates; those stay as
assumptions.

## 6. HES and ECDS field shapes

Sources: `HES-Data-Model-v1.0.pdf` (an entity diagram only), `HES-APC-TOS-v2.06.xlsx`, `ECDS-ETOS-v4.0.8.xlsx`.

- HES APC is one row per **episode** (`EPIKEY`), with spell fields repeated
  on every episode (`ADMIDATE`, `ADMIMETH`, `ADMISORC`, `CLASSPAT`) and
  discharge fields only on the last (`DISDATE`, `DISMETH`, `DISDEST`,
  `SPELEND = Y`). `EPIORDER`, `EPISTART`, `EPIEND`, `SPELBGIN`, `EPISTAT`
  (3 finished), `SPELDUR`, `ELECDATE`, `INTMANIG`, `DISREADYDATE`,
  `TRETSPEF`, `MAINSPEF`, `SITETRET`, `PROVSPNOPS`. HES AE carries `EPIKEY`
  and HES APC carries `AEKEY`, which is how an attendance links to its
  admission.
- HES OP is one row per **appointment** (`ATTENDKEY`) with `ATTENDED` (2
  patient cancelled, 3 DNA, 4 hospital cancelled, 5 seen, 6 late and seen,
  7 late not seen), `FIRSTATT` (1–4), `ATENTYPE` derived from the two,
  `OUTCOME`, `PRIORITY` (1 routine, 2 urgent, 3 two-week wait), `REFSOURC`,
  `REQDATE`, `DNADATE`, `WAITING`, `RTTPERSTART/END/STAT`.
- ECDS v4 is one row per **attendance** with timestamps for activity start
  (arrival), initial assessment, seen for treatment, decided to admit,
  clinically ready to proceed and activity end; SNOMED-coded arrival mode,
  attendance source, acuity (1 immediate … 5 low acuity), chief complaint,
  discharge status (treatment complete, streamed, left before assessment,
  died) and discharge destination (home, ward, HDU, ICU, SDEC, theatre,
  transfer, mortuary). The ETOS refset tabs give the full code lists with
  SNOMED concept IDs; the generator's `ref_ecds_codes` is built from them.

## 7. Not supplied, still assumptions

- Provider-level A&E attendances (the monthly provider CSV) would set the ED
  volume from a real top-10 trust rather than an estimate.
- HES APC and OP provider-level activity tables would set spells, day cases
  and appointments. Without them the design uses ratios to ED and imaging.
- DM01 provider monthly file would set endoscopy volumes and the waiting-list
  weeks bands.
- DID Table 9 (medians by modality × source) and Table 13 (quarterly
  turnaround by provider) would sharpen the imaging calibration.
- Slot lengths and room times for individual exam types: nothing supplied
  gives them.
