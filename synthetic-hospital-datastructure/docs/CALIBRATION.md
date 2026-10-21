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

**Generator target for the fictional trust's single Type 1 department:**
175,000 attendances a year (**assumption**: the series is national and the
provider-level monthly file was not supplied, so this is set at the scale of
a large single-ED teaching hospital), 28% admitted, performance tracking the
national monthly shape with a slightly better level because the trust is
fictional and it is nice to have something to aim at.

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

**Generator target:** an incomplete list of about 75,000 pathways
(**assumption**: a top-10 trust's share, roughly 1.6% of the national
list), with the same weeks-waiting profile.

## 4. Still to extract

- DM01 test list and clock rules (from `DM01-Guidance-v9.pdf`).
- DID derivation and validation rules (from `DID-Technical-Report-v13-2023-24.pdf`) and national turnaround times and body-site mix (from `DID-Annual-Statistical-Release-2023-24.pdf`).
- DID field list (from `DID-Annex-2-Data-Items-v6.1.pdf`); NICIP exam codes (from `DID-Annex-1-...xlsx`).
- GIRFT radiology throughput and slot lengths (from `GIRFT-radiology-report.pdf`).
- HES data model entity relationships and the APC/OP field lists and code lists (from `HES-Data-Model-v1.0.pdf`, `HES-APC-TOS-v2.06.xlsx`).
- ECDS data items and code lists (from `ECDS-ETOS-v4.0.8.xlsx`).

## 5. Not supplied, still assumptions

- Provider-level A&E attendances (the monthly "A&E attendances and emergency admissions" provider CSV) would set the ED volume from a real top-10 trust rather than an estimate.
- Provider-level RTT incomplete pathways would do the same for the waiting list.
- HES APC and OP provider-level activity (the annual "Hospital Admitted Patient Care Activity" and "Hospital Outpatient Activity" provider tables) would set spells, day cases and appointments. Without them the design uses ratios to ED and imaging activity.
- Endoscopy volumes: no national provider-level endoscopy activity was supplied; DM01 gives waiting list and monthly activity by test type nationally and by provider in its monthly provider file.
