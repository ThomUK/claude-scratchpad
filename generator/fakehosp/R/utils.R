# Internal helpers shared by all generator stages.

`%||%` <- function(a, b) if (is.null(a)) b else a

# Stage-specific RNG seeding so that stages are independent of each other.
stage_seed <- function(seed, stage) set.seed(as.integer((as.numeric(seed) * 1000 + stage) %% 2147483647))

# Log-normal draw parameterised by median and sigma on the log scale.
rln <- function(n, median, sigma) exp(log(median) + sigma * rnorm(n))

# Weighted sample of indices 1..length(w).
wsample <- function(n, w, replace = TRUE) {
  if (length(w) == 1L) return(rep.int(1L, n))
  sample.int(length(w), n, replace = replace, prob = w)
}

# Draw categorical values with weights.
rcat <- function(n, values, weights) values[wsample(n, weights)]

# Modulus-11 NHS number check digit; returns 10 digits as a string or NA
# when the check digit would be 10 (invalid).
nhs_check <- function(d9) {
  w <- 10:2
  s <- as.integer(rowSums(sweep(d9, 2, w, `*`)))
  cd <- 11L - (s %% 11L)
  cd[cd == 11L] <- 0L
  cd
}

#' Generate fake NHS numbers
#'
#' Ten digits with a valid modulus-11 check digit, prefixed `fake_`.
#' @param n number of identifiers
#' @export
nhs_number_fake <- function(n) {
  out <- character(0)
  while (length(out) < n) {
    k <- (n - length(out)) * 1.15 + 10
    d9 <- matrix(sample.int(10L, 9L * ceiling(k), replace = TRUE) - 1L, ncol = 9L)
    d9[, 1] <- pmax(d9[, 1], 1L)                      # no leading zero
    cd <- nhs_check(d9)
    ok <- cd != 10L
    digs <- paste0(apply(d9[ok, , drop = FALSE], 1, paste0, collapse = ""), cd[ok])
    out <- unique(c(out, digs))
  }
  paste0("fake_", out[seq_len(n)])
}

# Format POSIXct for CSV.
fmt_dt <- function(x) format(x, "%Y-%m-%d %H:%M:%S", tz = "UTC")
fmt_d  <- function(x) format(as.Date(x), "%Y-%m-%d")

as_dt <- function(x) as.POSIXct(x, tz = "UTC")
dt_of <- function(date, secs) as.POSIXct(as.numeric(as.POSIXct(date, tz = "UTC")) + secs, origin = "1970-01-01", tz = "UTC")
mins <- function(m) m * 60
hours <- function(h) h * 3600
days  <- function(d) d * 86400

# Clamp a datetime to a working window (hour of day) on the same or next day.
to_working_hours <- function(x, from = 8, to = 18) {
  h <- as.numeric(format(x, "%H", tz = "UTC")) + as.numeric(format(x, "%M", tz = "UTC")) / 60
  day0 <- as_dt(as.Date(x, tz = "UTC"))
  late  <- !is.na(h) & h >= to
  early <- !is.na(h) & h < from
  r <- x
  r[late]  <- day0[late] + days(1) + hours(from) + mins(runif(sum(late), 0, 120))
  r[early] <- day0[early] + hours(from) + mins(runif(sum(early), 0, 120))
  r
}

# Move weekend datetimes to the following Monday (keeping time of day) with probability p.
weekday_shift <- function(x, p = 1) {
  wd <- as.POSIXlt(x, tz = "UTC")$wday
  mv <- (wd == 0L | wd == 6L) & runif(length(x)) < p
  add <- ifelse(wd == 6L, 2, 1)
  x[mv] <- x[mv] + days(add[mv])
  x
}

# Hour-of-day sampler from a 24-vector of weights; returns seconds since midnight.
sample_tod <- function(n, w24) {
  h <- wsample(n, w24) - 1L
  h * 3600 + runif(n, 0, 3600)
}

month_index <- function(d, start) {
  # 0-based month number since the window start
  (as.POSIXlt(d)$year - as.POSIXlt(start)$year) * 12L + (as.POSIXlt(d)$mon - as.POSIXlt(start)$mon)
}

id_seq <- function(prefix, n, width, offset = 0L) {
  paste0(prefix, formatC(seq_len(n) + offset, width = width, flag = "0"))
}

vmsg <- function(verbose, ...) if (isTRUE(verbose)) message(format(Sys.time(), "%H:%M:%S "), ...)
