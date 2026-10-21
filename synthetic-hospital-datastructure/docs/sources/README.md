# Source documents

Public NHS England / NHS Digital reference material used to calibrate the
design. Supplied by the repo owner; retained here so the figures quoted in
`../CALIBRATION.md` and `../DESIGN.md` can be checked. Crown copyright,
Open Government Licence unless the document says otherwise.

| File | What it is | Used for |
| --- | --- | --- |
| `DM01-Guidance-v9.pdf` | Diagnostics waiting times and activity (DM01) guidance, v9 March 2026 | the 15 tests in scope, clock rules, planned-test exclusions |
| `DID-Annex-2-Data-Items-v6.1.pdf` | Diagnostic Imaging Dataset data items | field list for `ris_imaging` |
| `DID-Annex-1-Exam-Lookup-Table-Modality-v5-May26.xlsx` | NICIP and SNOMED imaging codes by modality | exam catalogue codes |
| `DID-Technical-Report-v13-2023-24.pdf` | DID statistics methodology | waiting-time derivations and validation rules |
| `DID-Annual-Statistical-Release-2023-24.pdf` | DID annual release | national volumes, source mix, turnaround |
| `DID-Table-11-2023-24-Modality-Provider-Source-setting.xlsx` | DID activity by provider, modality and source setting | top-10 trust scale and source splits |
| `GIRFT-radiology-report.pdf` | GIRFT radiology national report, Nov 2020 | request-to-test and test-to-report distributions, equipment counts |
| `HES-Data-Model-v1.0.pdf` | HES data model | entity relationships |
| `HES-APC-TOS-v2.06.xlsx` | HES technical output specification (APC, OP, A&E, CC) | field names and code lists for the derived layer |
| `ECDS-ETOS-v4.0.8.xlsx` | Emergency Care Data Set technical output specification v4 | `ed_attendances` fields and code lists |
| `ECDS-v4.0-Data-Item-Mapping-Specification-v4.0.2.xlsx` | ECDS data item mapping | cross-check of field names |
| `Monthly-AE-Provider-September-2026.csv` | A&E attendances and emergency admissions by provider, September 2026 | ED scale for a single-ED top-10 trust; admission routes |
| `Monthly-AE-Time-Series-September-2026.xls` | National A&E attendances and emergency admissions, monthly | ED seasonality and admitted proportion |
| `RTT-Overview-Timeseries-Aug26.xlsx` | National RTT time series | waiting list profile over the window |

Not kept: `ECDS_Refset_MAX_Specification_v4.0.3.xlsx` (10 MB SNOMED refset
listing, superseded for our purposes by the refset tabs inside the ETOS).
