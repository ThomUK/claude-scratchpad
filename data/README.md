# Data

Published builds of the Fake NHS Trust synthetic dataset. Everything here is
generated: no row describes a real person, and every NHS number carries the
`fake_` prefix.

## Layout

```
data/v1/
  manifest.json              every file with rows, bytes and SHA-256; the generator seed and parameters
  sample/                    5% of patients with all of their rows, derived and aggregate layers recomputed
    layer1/<table>.parquet   the nine source-system extracts (messy)
    reference/<table>.parquet
    derived/<table>.parquet  spells, episodes, ward stays, ED, outpatients, RTT, imaging, endoscopy, MPI
    aggregate/<table>.parquet
    answers/mess_log.parquet the answers table: every injected imperfection with its original value
    answers/truth/*.parquet  the clean spells, stays and linkages the derived layer is marked against
    sample-csv.zip           the same tables as CSV, for tools that cannot read Parquet
  preview/sample/            the first 100 rows of every sample table as JSON, for the table viewer
  full/                      every row (see below for where it lives)
```

The table viewer at `../viewer/` (served at
`https://thomuk.github.io/claude-scratchpad/synthetic-hospital-datastructure/viewer/`)
lists every table from the manifest with its counts and download links and
shows those 100-row previews.

The sample is in this repository and served by GitHub Pages. The full set
is about 1.1 GB of Parquet, which is more than GitHub Pages will host, so
it is attached to a GitHub release of this repository as one asset per
file. Release assets cannot be nested, so an asset is named by its path
under `full/` with `/` replaced by `__`: the file `derived/spells.parquet`
is the asset `derived__spells.parquet`, and
`layer1/pas_op_status_log/fy2024.parquet` is
`layer1__pas_op_status_log__fy2024.parquet`. `manifest.json` lists every
path. The Parquet files are canonical; the CSV zip is a convenience.

Release page: `https://github.com/ThomUK/claude-scratchpad/releases/tag/synthetic-hospital-datastructure-v1`
Asset URL pattern: `https://github.com/ThomUK/claude-scratchpad/releases/download/synthetic-hospital-datastructure-v1/<asset>`

The release is produced by the `Synthetic hospital dataset release`
workflow (`.github/workflows/synthetic-hospital-release.yml`), which
rebuilds the full set from the seed on a GitHub runner, checks every row
count against the committed `manifest.json` and uploads the files. The
rebuilt manifest is attached to the release too, and it is the one to
check full-set downloads against: the rows are identical between builds
but the Parquet bytes are not (row order inside a file depends on thread
scheduling), so the full-set checksums in the committed manifest describe
the session build, not the release assets. The sample's checksums in the
committed manifest describe the files in this repository.

Timestamps are UTC to the second. Two source systems have deliberate clock
behaviour (the ED runs two minutes fast; the RIS writes UTC during British
Summer Time), described in `docs/MESS-CATALOGUE.md` under M-X-02 and
corrected in the derived layer.

## Reading it

Base URL for the sample:
`https://thomuk.github.io/claude-scratchpad/synthetic-hospital-datastructure/data/v1/sample/`

Python, with DuckDB:

```python
import duckdb
base = "https://thomuk.github.io/claude-scratchpad/synthetic-hospital-datastructure/data/v1/sample/"
duckdb.sql(f"""
  SELECT tretspef_first, count(*) AS spells, median(speldur) AS median_los
  FROM read_parquet('{base}derived/spells.parquet')
  WHERE emergency GROUP BY 1 ORDER BY 2 DESC
""").show()
```

Python, with pandas: `pd.read_parquet(base + "derived/spells.parquet")`.

R, with DuckDB (the httpfs extension loads automatically for URLs):

```r
library(duckdb); con <- dbConnect(duckdb())
base <- "https://thomuk.github.io/claude-scratchpad/synthetic-hospital-datastructure/data/v1/sample/"
dbGetQuery(con, sprintf("SELECT count(*) FROM read_parquet('%sderived/spells.parquet')", base))
```

R, with arrow: `arrow::read_parquet(paste0(base, "derived/spells.parquet"))`.

Tables partitioned by financial year in the full set are directories of
`fy2022.parquet` ... `fy2025.parquet`; read them with a glob
(`read_parquet('.../pas_adt_events/*.parquet')`) or by listing the files in
`manifest.json`.

## Versioning

`v1` is immutable once published. A regenerated or reshaped dataset goes to
`v2` with its own manifest. Other projects should pin the version in their
URLs.

## Building it

```sh
Rscript generator/run.R <run_dir> 800000 20230401      # layer 1 as CSV, about 9 minutes
python3 generator/build.py --input <run_dir> --out data  # Parquet, derived and aggregate layers, sample, manifest, about 1.5 minutes
python3 generator/check_manifest.py data/v1/manifest.json <rebuilt>/v1/manifest.json  # row counts must match
```

Full-set download in Python, straight from the release:

```python
import duckdb
rel = "https://github.com/ThomUK/claude-scratchpad/releases/download/synthetic-hospital-datastructure-v1/"
duckdb.sql(f"SELECT count(*) FROM read_parquet('{rel}derived__spells.parquet')").show()
```
