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
  full/                      every row (see below for where it lives)
```

The sample is in this repository and served by GitHub Pages. The full set
is about 1.1 GB of Parquet, which is more than GitHub Pages will host, so
it is attached to a GitHub release of this repository as one asset per
file; `manifest.json` lists the paths and the release carries the same
layout. The Parquet files are canonical; the CSV zip is a convenience.

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
python3 generator/build.py --input <run_dir> --out data  # Parquet, derived and aggregate layers, sample, manifest
```
