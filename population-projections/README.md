# Population Pyramids — English Geographies

Two population pyramids side by side for a chosen English geography, each at a year
you select, with the **change by age band and sex** between them shown below — both
**absolute** and **percentage**.

Pick a **geography level** (Region / Sub-ICB / Local authority), then **multi-select**
one or more areas; they are **summed** into a single footprint. The right pyramid
carries a dotted outline of the left year so the shift is visible. Rendered entirely
in the browser with [webR](https://docs.r-wasm.org/webr/latest/) — no backend.

## Data — real ONS projections

ONS **2022-based subnational population projections**, migration-category variant,
five-year age groups by sex, mid-2022 to mid-2047, on 2021 boundaries
(published 24 June 2025). Three tables, kept in `source/` for provenance:

| Level | Source workbook | Areas kept |
| --- | --- | --- |
| Region | `popprojreg5yrmigcat22based.xls` (Table 1) | 9 regions (E12) |
| Sub-ICB | `popprojsicb5yrmigcat22based.xls` (Table 3) | 106 sub-ICB locations (E38), grouped by ICB |
| Local authority | `popprojla5yrmigcat22based.xls` (Table 2) | 309 lower-tier/unitary/met/London authorities (E06–E09), grouped by region |

**Non-overlapping by design.** For LAs, only the lower-tier set (E06 unitary, E07
non-met district, E08 met district, E09 London borough) is kept; counties (E10),
met counties (E11), regions (E12) and England (E92) are dropped because they are
aggregates that would double-count when summed. Each level sums to the same England
total (57,112,542 in 2022), confirming a clean partition.

### Pipeline

`source/*.xls` → `build_csv.py` → per-level CSVs in `data/`:

```sh
pip install xlrd
python3 build_csv.py
```

For each level it writes:

- `data/<level>.csv` — `code, year, sex, age_group, population` (keyed by ONS code)
- `data/<level>_areas.csv` — `code, label, group` (the picker lookup; `group` is the
  region for LAs, the ICB for sub-ICBs)

The app loads each level's data lazily (the LA file is ~10 MB) and aggregates the
selected codes in R. Parents (region for LAs, NHS region order, ICB for sub-ICBs)
are inferred from the workbooks' document order and the sub-ICB names — the source
tables carry no explicit parent column.

## Running locally

Static files — serve over HTTP (webR is an ES-module import, so `file://` won't work):

```sh
cd population-projections && python3 -m http.server 8000
# open http://localhost:8000/
```
