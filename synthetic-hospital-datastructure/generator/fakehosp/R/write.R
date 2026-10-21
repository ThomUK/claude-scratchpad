#' Write the generated layer-1 tables as CSV
#'
#' @param gen the list returned by [generate()]
#' @param out_dir directory to write into (created if needed)
#' @export
write_layer1 <- function(gen, out_dir) {
  dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)
  fmt <- function(dt) {
    dt <- copy(dt)
    for (col in names(dt)) {
      if (inherits(dt[[col]], "POSIXct")) set(dt, j = col, value = fmt_dt(dt[[col]]))
      else if (inherits(dt[[col]], "Date")) set(dt, j = col, value = fmt_d(dt[[col]]))
    }
    dt
  }
  counts <- list()
  for (nm in names(gen$tables)) {
    f <- file.path(out_dir, paste0(nm, ".csv"))
    fwrite(fmt(gen$tables[[nm]]), f, na = "")
    counts[[nm]] <- nrow(gen$tables[[nm]])
  }
  for (nm in names(gen$reference)) {
    f <- file.path(out_dir, paste0("ref_", nm, ".csv"))
    fwrite(fmt(gen$reference[[nm]]), f, na = "")
    counts[[paste0("ref_", nm)]] <- nrow(gen$reference[[nm]])
  }
  manifest <- list(dataset = "Fake NHS Trust synthetic hospital data", layer = 1L, version = gen$meta$version,
                   seed = gen$meta$seed, n_patients = gen$meta$n_patients, start = gen$meta$start, end = gen$meta$end,
                   generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"), mess = gen$meta$mess,
                   row_counts = counts)
  writeLines(jsonlite::toJSON(manifest, auto_unbox = TRUE, pretty = TRUE), file.path(out_dir, "manifest.json"))
  invisible(counts)
}
