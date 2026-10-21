test_that("the same seed and parameters give identical output", {
  a <- generate(seed = 11L, n_patients = 4000L, mess = NULL, verbose = FALSE)
  b <- generate(seed = 11L, n_patients = 4000L, mess = NULL, verbose = FALSE)
  for (nm in names(a$tables)) expect_identical(a$tables[[nm]], b$tables[[nm]], info = nm)
  c <- generate(seed = 12L, n_patients = 4000L, mess = NULL, verbose = FALSE)
  expect_false(identical(a$tables$pas_adt_events, c$tables$pas_adt_events))
})

test_that("fake NHS numbers are unique, prefixed and pass the modulus-11 check", {
  x <- nhs_number_fake(5000)
  expect_true(all(grepl("^fake_[1-9][0-9]{9}$", x)))
  expect_false(any(duplicated(x)))
  d <- t(sapply(strsplit(sub("fake_", "", x), ""), as.integer))
  s <- d[, 1:9] %*% (10:2)
  cd <- 11 - (s %% 11); cd[cd == 11] <- 0
  expect_true(all(cd == d[, 10]))
})
