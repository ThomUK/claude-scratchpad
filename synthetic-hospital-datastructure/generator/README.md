# Generator

`fakehosp/` is the R package that generates the Fake NHS Trust synthetic
dataset (layer 1: source-system extracts). See `../docs/DESIGN.md` for what
it builds and `../docs/CALIBRATION.md` for every number it is tuned to.

## Status

Clean generator (deliverable 2 in the design). It produces internally
consistent, calibrated data with **no injected mess**: the mess layer
(deliverable 3) will take this output and add the catalogued imperfections,
recording each one in `mess_log`.

## Running it

In a cloud session, run `setup-cloud.sh` once (R 4.3.3, data.table,
testthat and friends from the Ubuntu archive, DuckDB and Arrow for Python).
Then:

```sh
R CMD INSTALL --no-docs generator/fakehosp
Rscript generator/run.R <out_dir> [n_patients] [seed]
```

Defaults are the full scale (800,000 patients) and seed 20230401. A
20,000-patient run takes about ten seconds and is the right size for
development. Output is one CSV per table plus `manifest.json` with the seed,
parameters and row counts.

Full-scale run on the cloud container (4 cores, 15 GB): 6 min 20 s to
generate, 8 min 45 s wall clock including the CSV write, 3.7 GB of CSV,
37.9 million rows:

| Table | Rows |
| --- | --- |
| pas_patients | 800,000 |
| pas_adt_events | 2,627,292 |
| ed_attendances | 795,950 |
| ed_status_log | 3,425,580 |
| pas_referrals | 2,096,135 |
| pas_outpatient_appointments | 6,163,826 |
| pas_op_status_log | 21,030,538 |
| ris_imaging | 933,561 |
| endo_procedures | 70,250 |

The two audit logs are two thirds of the rows. Parquet will compress them
heavily; if the published set still needs trimming, the logs are the first
candidates for per-year partitioning.

From R:

```r
library(fakehosp)
g <- generate(seed = 1L, n_patients = 20000L)
g$tables$pas_adt_events      # layer-1 tables as data.tables
g$truth$spells               # the clean spells the derived layer should reproduce
write_layer1(g, "out/")
```

## Tests

```sh
cd generator/fakehosp && Rscript -e 'testthat::test_dir("tests/testthat")'
```

The suite checks determinism (same seed, identical output), fake NHS
number check digits, the calibrated annual volumes within tolerance, ED
conversion and four-hour performance, imaging source mix and waits, ADT
structure (one A01 per spell, A03 only for closed spells, ordering),
cross-system identifier integrity, ECDS timestamp ordering, the DID hard
validations, the endoscopy vendor formats, no activity after death, and the
CSV writer.

## Layout

| Path | What |
| --- | --- |
| `fakehosp/R/config.R` | annual volumes at full scale and the seasonal, weekday and time-of-day indices |
| `fakehosp/R/reference.R` | sites, wards, specialties, consultants, clinics, exam catalogue, national code lists |
| `fakehosp/R/population.R` | patients, identifiers, activity weights |
| `fakehosp/R/ed.R` | ED attendances (ECDS-shaped) and the tracking-board log |
| `fakehosp/R/outpatients.R` | referrals, RTT pathways, appointments, appointment audit log |
| `fakehosp/R/admissions.R` | spells, ward stays, episodes, ADT events |
| `fakehosp/R/imaging.R` | CT, MRI and ultrasound requests and exams |
| `fakehosp/R/endoscopy.R` | the endoscopy vendor export |
| `fakehosp/R/generate.R` | orchestration, deaths, post-death activity reassignment |
| `fakehosp/R/write.R` | CSV writer and manifest |
| `fakehosp/inst/extdata/` | ECDS code lists (from the ETOS) and NICIP-to-SNOMED map (from DID Annex 1) |
| `run.R` | command-line entry point |
| `setup-cloud.sh` | toolchain install for cloud sessions |

## Toolchain note

CRAN is unreachable from the cloud container and the Ubuntu archive has no
`arrow` or `duckdb` for R, so the package writes CSV and the Parquet
conversion, derived layer and aggregates run in Python DuckDB (deliverable 4).
