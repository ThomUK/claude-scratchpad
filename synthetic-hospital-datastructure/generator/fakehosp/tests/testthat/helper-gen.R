# One small generation shared by the tests (scale 1.5%).
gen_small <- local({
  cache <- NULL
  function() {
    if (is.null(cache)) cache <<- generate(seed = 7L, n_patients = 12000L, mess = NULL, verbose = FALSE)
    cache
  }
})
approx_rel <- function(x, target, tol) abs(x - target) / target <= tol
gen_messy <- local({
  cache <- NULL
  function() {
    if (is.null(cache)) cache <<- generate(seed = 7L, n_patients = 12000L, verbose = FALSE)
    cache
  }
})
