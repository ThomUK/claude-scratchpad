# Data-wrangling helpers and shared constants for the population-projections
# charts. Sourced into the webR session at app start, and loadable locally via
# R/local_dev.R.
#
# BASE R ONLY — deliberately no dplyr/tidyr. The app used to install them from
# repo.r-wasm.org at every page load, which made boot depend on that repo's
# day-to-day dependency state; it broke in 2026 when the repo served dplyr
# 1.2.1 alongside vctrs 0.6.5 (< the required 0.7.1 — r-wasm/webr#602). These
# helpers need nothing beyond base R, so the app now boots with no runtime
# package downloads at all.
#
# All helpers read the global data frame `D` (columns: code, year, sex,
# age_group, population), which the app builds from data/<level>.csv.

# 5-year age bands, low -> high. Charts render bands in this order.
age_levels <- c("0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34",
                "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65-69",
                "70-74", "75-79", "80-84", "85-89", "90+")

male_col   <- "#3182bd"
female_col <- "#dd3497"

old_bands   <- c("65-69", "70-74", "75-79", "80-84", "85-89", "90+")
young_bands <- c("0-4", "5-9", "10-14")

# Sum `population` by age band (ordered by age_levels) for the rows selected
# by `keep`. Bands with no rows are filled with 0. Returns a numeric vector of
# length(age_levels).
sum_bands <- function(keep) {
  d <- D[keep, , drop = FALSE]
  s <- tapply(d$population, factor(d$age_group, levels = age_levels), sum)
  s[is.na(s)] <- 0
  as.numeric(s)
}

# Population by 5-year age band for a set of ONS codes, one sex, one year.
band_vec <- function(codes, sx, yr) {
  sum_bands(D$code %in% codes & D$sex == sx & D$year == yr)
}

# England = the sum of the nine E12 region rows (the region level is always
# loaded at boot, so this works regardless of the currently selected level).
england_vec <- function(sx, yr) {
  sum_bands(substr(D$code, 1, 3) == "E12" & D$sex == sx & D$year == yr)
}

# Share (percent) of a male/female band pair that falls in `bands`.
band_share <- function(m, f, bands) {
  idx <- age_levels %in% bands
  100 * sum((m + f)[idx]) / sum(m + f)
}

# Axis label formatter: percent in share mode, else k / m / raw by magnitude.
axis_fmt <- function(z, xmax, percent = FALSE) {
  if (percent) paste0(round(z, 1), "%")
  else if (xmax >= 1e6) paste0(round(z / 1e6, 1), "m")
  else if (xmax >= 1e4) paste0(round(z / 1e3), "k")
  else as.character(round(z))
}
