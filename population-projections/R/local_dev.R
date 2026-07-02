# Local development harness — NOT loaded by the web app.
#
# Run this from RStudio (or Rscript) with the working directory set to
# population-projections/. It installs/loads the packages, builds the global
# data frame `D` from the CSVs exactly as the web app does in webR, sources the
# chart functions, and shows an example call.
#
#   setwd("population-projections")   # if needed
#   source("R/local_dev.R")
#
# Then iterate on R/data.R, R/pyramids.R, R/compare.R and re-source them.

# install.packages(c("dplyr", "tidyr"))   # uncomment on first run
library(dplyr)
library(tidyr)

# Build D from all three geography levels, matching how the app appends them.
levels <- c("region", "subicb", "la")
D <<- bind_rows(lapply(levels, function(lv) {
  read.csv(file.path("data", paste0(lv, ".csv")),
           stringsAsFactors = FALSE, colClasses = c(code = "character"))
}))

source("R/data.R")
source("R/pyramids.R")
source("R/compare.R")

cat(sprintf("Loaded D: %d rows, %d areas, years %d-%d\n",
            nrow(D), length(unique(D$code)), min(D$year), max(D$year)))

# --- example: render to a PNG you can open -------------------------------------
if (interactive()) {
  # East Midlands, 2026 vs 2036
  png("R/_preview_pyramid.png", width = 1000, height = 800)
  print(pyramid_chart(c("E12000004"), 2026, 2036, "East Midlands"))
  dev.off()

  # Compare: Nottingham LAs (A) vs rest of England (B), share mode
  png("R/_preview_compare.png", width = 1000, height = 800)
  print(compare_chart(
    codesA = c("E06000018", "E07000172", "E07000176", "E07000173", "E07000170"),
    codesB = NULL, bRest = TRUE, yL = 2026, yR = 2036,
    normalise = "percent", titleA = "Nottinghamshire", titleB = "Rest of England"
  ))
  dev.off()
  cat("Wrote R/_preview_pyramid.png and R/_preview_compare.png\n")
}
