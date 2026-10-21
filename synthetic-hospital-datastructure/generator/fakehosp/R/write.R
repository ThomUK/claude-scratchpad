#' Write the generated layer-1 tables as CSV
#'
#' @param gen the list returned by [generate()]
#' @param out_dir directory to write into (created if needed)
#' @export
write_layer1 <- function(gen, out_dir) {
  dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)
  # fwrite formats POSIXct (UTC) as "YYYY-MM-DD HH:MM:SS" and Date as ISO without copying the table
  fmt <- function(dt) dt
  wr <- function(dt, f) fwrite(dt, f, na = "", dateTimeAs = "write.csv")
  counts <- list()
  for (nm in names(gen$tables)) {
    f <- file.path(out_dir, paste0(nm, ".csv"))
    wr(gen$tables[[nm]], f)
    counts[[nm]] <- nrow(gen$tables[[nm]])
  }
  if (!is.null(gen$mess_log)) { wr(gen$mess_log, file.path(out_dir, "mess_log.csv")); counts$mess_log <- nrow(gen$mess_log) }
  for (nm in names(gen$reference)) {
    f <- file.path(out_dir, paste0("ref_", nm, ".csv"))
    wr(gen$reference[[nm]], f)
    counts[[paste0("ref_", nm)]] <- nrow(gen$reference[[nm]])
  }
  manifest <- list(dataset = "Fake NHS Trust synthetic hospital data", layer = 1L, version = gen$meta$version,
                   seed = gen$meta$seed, n_patients = gen$meta$n_patients, start = gen$meta$start, end = gen$meta$end,
                   generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"), mess = gen$meta$mess,
                   row_counts = counts)
  writeLines(jsonlite::toJSON(manifest, auto_unbox = TRUE, pretty = TRUE), file.path(out_dir, "manifest.json"))
  invisible(counts)
}
