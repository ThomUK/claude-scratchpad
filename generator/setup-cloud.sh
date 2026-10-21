#!/usr/bin/env bash
# Installs the toolchain the generator needs in a Claude Code cloud session.
# Paste the body of this file into the environment's setup script, or run it
# once at the start of a session. Takes about four minutes.
#
# CRAN is not reachable from the cloud container, so R packages come from the
# Ubuntu archive (R 4.3.3). The archive has no arrow or duckdb for R, so the
# generator writes CSV with data.table and Python DuckDB converts to Parquet
# and runs the derive/aggregate SQL. See docs/DESIGN.md section 9.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq r-base r-base-dev \
  r-cran-data.table r-cran-testthat r-cran-jsonlite r-cran-withr r-cran-cli \
  r-cran-checkmate r-cran-digest r-cran-lubridate
pip install -q duckdb pyarrow openpyxl xlrd
Rscript -e 'cat("R", R.version.string, "\n"); stopifnot(all(sapply(c("data.table","testthat","jsonlite","withr","cli","checkmate","digest","lubridate"), requireNamespace, quietly=TRUE)))'
python3 -c 'import duckdb, pyarrow; print("duckdb", duckdb.__version__, "pyarrow", pyarrow.__version__)'
