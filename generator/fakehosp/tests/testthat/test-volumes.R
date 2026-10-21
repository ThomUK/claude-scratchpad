test_that("annual volumes land within tolerance of the calibrated targets", {
  g <- gen_small(); sc <- g$meta$scale; yrs <- 3
  t <- function(x) x * sc * yrs
  ed <- g$tables$ed_attendances
  expect_true(approx_rel(sum(ed$uec_activity_type != "UTC"), t(165000), 0.08))
  expect_true(approx_rel(sum(ed$uec_activity_type == "UTC"), t(100000), 0.10))
  sp <- g$truth$spells[as.Date(admit) >= as.Date(g$meta$start)]
  expect_true(approx_rel(nrow(sp), t(250000), 0.10))
  expect_true(approx_rel(mean(sp$day_case), 0.36, 0.15))
  expect_true(approx_rel(mean(sp$n_episodes), 1.25, 0.12))
  ap <- g$tables$pas_outpatient_appointments
  expect_true(approx_rel(sum(ap$attendance_status %in% c("5", "6")), t(1500000), 0.12))
  im <- g$tables$ris_imaging[status == "verified"]
  expect_true(approx_rel(sum(im$modality == "CT"), t(125000), 0.08))
  expect_true(approx_rel(sum(im$modality == "MR"), t(68000), 0.08))
  expect_true(approx_rel(sum(im$modality == "US"), t(115000), 0.08))
  expect_true(approx_rel(nrow(g$tables$endo_procedures), t(24000), 0.10))
})

test_that("ED conversion and performance match the national shape", {
  g <- gen_small(); ed <- g$tables$ed_attendances; adm <- g$truth$ed_admitted
  t1 <- ed[uec_activity_type != "UTC"]
  a <- adm$admitted[match(t1$uec_activity_identifier, adm$uec_activity_identifier)]
  expect_true(mean(a) > 0.25 && mean(a) < 0.31)
  within4 <- as.numeric(t1$activity_end_timestamp - t1$activity_start_datetime, units = "hours") <= 4
  expect_true(mean(within4) > 0.52 && mean(within4) < 0.66)
})

test_that("imaging source mix and waits follow the DID", {
  g <- gen_small(); im <- g$tables$ris_imaging[status == "verified"]
  ct <- im[modality == "CT"]; mr <- im[modality == "MR"]
  expect_true(approx_rel(mean(ct$patient_source_setting == "05"), 0.35, 0.15))
  expect_true(approx_rel(mean(mr$patient_source_setting == "03"), 0.71, 0.10))
  d <- function(z) median(as.numeric(as.Date(z$scan_start_datetime) - as.Date(z$request_datetime)))
  expect_true(d(ct) <= 2); expect_true(d(mr) >= 15 && d(mr) <= 25)
  us <- im[modality == "US"]
  expect_true(mean(as.Date(us$reported_datetime) == as.Date(us$scan_end_datetime)) > 0.95)
})
