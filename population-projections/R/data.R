# Data-wrangling helpers (dplyr / tidyr) and shared constants for the
# population-projections charts. Sourced into the webR session at app start
# (after dplyr/tidyr are installed), and loadable locally via R/local_dev.R.
#
# All helpers read the global data frame `D` (columns: code, year, sex,
# age_group, population), which the app builds from data/<level>.csv.

suppressMessages({
  library(dplyr)
  library(tidyr)
})

# 5-year age bands, low -> high. Charts render bands in this order.
age_levels <- c("0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34",
                "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65-69",
                "70-74", "75-79", "80-84", "85-89", "90+")

male_col   <- "#3182bd"
female_col <- "#dd3497"

old_bands   <- c("65-69", "70-74", "75-79", "80-84", "85-89", "90+")
young_bands <- c("0-4", "5-9", "10-14")

# Population by 5-year age band (ordered by age_levels) for a set of ONS codes,
# one sex, one year. Bands with no rows are filled with 0. Returns a numeric
# vector of length(age_levels).
band_vec <- function(codes, sx, yr) {
  D |>
    filter(.data$code %in% codes, .data$sex == sx, .data$year == yr) |>
    group_by(.data$age_group) |>
    summarise(pop = sum(.data$population), .groups = "drop") |>
    right_join(tibble(age_group = age_levels), by = "age_group") |>
    mutate(pop = coalesce(.data$pop, 0)) |>
    arrange(match(.data$age_group, age_levels)) |>
    pull(.data$pop)
}

# England = the sum of the nine E12 region rows (the region level is always
# loaded at boot, so this works regardless of the currently selected level).
england_vec <- function(sx, yr) {
  D |>
    filter(substr(.data$code, 1, 3) == "E12", .data$sex == sx, .data$year == yr) |>
    group_by(.data$age_group) |>
    summarise(pop = sum(.data$population), .groups = "drop") |>
    right_join(tibble(age_group = age_levels), by = "age_group") |>
    mutate(pop = coalesce(.data$pop, 0)) |>
    arrange(match(.data$age_group, age_levels)) |>
    pull(.data$pop)
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
