# Population Pyramids — English Regions

Two population pyramids side by side for a chosen English region, each at a year
you select, with the **change by age band and sex** between the two years shown
below — both **absolute** and **percentage**.

Built to explore how a region's age/sex structure is projected to shift over time
(e.g. left = 2026, right = 2036, and the panels below show exactly where people are
gained and lost). Rendered entirely in the browser with
[webR](https://docs.r-wasm.org/webr/latest/) — no backend.

## Data — this one is the real thing

Unlike the other toy models, this uses **real ONS data**:

- **ONS 2022-based subnational population projections**, *Regions in England,
  Table 1* — five-year age groups by sex, migration-category variant,
  mid-2022 to mid-2047, on 2021 regional boundaries. Published 24 June 2025.
- Source page:
  <https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationprojections/datasets/regionsinenglandtable1>

The original workbook is kept in `source/` for provenance.

### Pipeline

`source/popprojreg5yrmigcat22based.xls` → `build_csv.py` → `data/population.csv`

```sh
pip install xlrd
python3 build_csv.py
```

`build_csv.py` reads the `Males` and `Females` sheets and writes a tidy CSV; the
`All ages` total row is dropped (the app sums the bands itself).

### `data/population.csv` schema

| Column | Meaning |
| --- | --- |
| `region` | England or one of the 9 English regions |
| `year` | 2022–2047 |
| `sex` | `male` / `female` |
| `age_group` | five-year band: `0-4`, `5-9`, … `85-89`, `90+` |
| `population` | projected resident population (persons) |

To refresh with a newer ONS edition, drop the new workbook into `source/`, adjust
the sheet/column handling in `build_csv.py` if the layout changed, and re-run it.

## Running locally

Static files — serve over HTTP (webR is an ES-module import, so `file://` won't work):

```sh
cd population-projections && python3 -m http.server 8000
# open http://localhost:8000/
```
