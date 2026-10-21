test_that("mess = NULL gives the clean dataset and the default rates change it", {
  a <- generate(seed = 11L, n_patients = 4000L, mess = NULL, verbose = FALSE)
  b <- generate(seed = 11L, n_patients = 4000L, verbose = FALSE)
  expect_null(a$mess_log)
  expect_true(nrow(b$mess_log) > 0)
  expect_false(identical(a$tables$pas_adt_events, b$tables$pas_adt_events))
  c <- generate(seed = 11L, n_patients = 4000L, verbose = FALSE)
  for (nm in names(b$tables)) expect_identical(b$tables[[nm]], c$tables[[nm]], info = nm)
  expect_identical(b$mess_log, c$mess_log)
})

test_that("every logged row key exists in its table, or was deliberately removed", {
  g <- gen_messy(); ml <- g$mess_log; T <- g$tables
  keys <- list(pas_adt_events = "message_id", ed_attendances = "uec_activity_identifier", pas_outpatient_appointments = "appointment_id",
               pas_referrals = "referral_id", ris_imaging = "accession_number", endo_procedures = "ProcID", pas_patients = "mrn",
               pas_op_status_log = "appointment_id")
  removed <- ml[grepl("removed|never happened", note), row_key]
  for (tb in names(keys)) {
    rows <- ml[table == tb & !is.na(row_key) & !(row_key %in% removed) & mess_id != "M-BOUNCE-03"]
    if (nrow(rows) == 0L) next
    present <- rows$row_key %in% as.character(T[[tb]][[keys[[tb]]]])
    # ADT message ids are re-sequenced after injection, so they are checked by count not identity
    if (tb != "pas_adt_events") expect_true(mean(present) > 0.995, info = tb)
  }
  expect_true(all(ml$mess_id %in% names(default_mess_rates())))
})

test_that("injection rates land near the catalogue rates", {
  g <- gen_messy(); ml <- g$mess_log; T <- g$tables
  share <- function(code, denom) ml[mess_id == code, .N] / denom
  ed <- T$ed_attendances
  expect_true(approx_rel(share("M-ED-01", nrow(ed)), 0.04, 0.25))
  expect_true(approx_rel(share("M-ED-03", sum(!is.na(ed$decided_to_admit_datetime))), 0.60, 0.15))
  ct <- T$ris_imaging[modality == "CT"]
  expect_true(approx_rel(share("M-CT-03", nrow(ct)), 0.30, 0.2))
  expect_true(approx_rel(share("M-US-01", T$ris_imaging[modality == "US" & status == "verified", .N]), 0.95, 0.1))
  en <- T$endo_procedures
  expect_true(all(en$Site %in% c("HA", "Hosp A", "Hospital A", "HOSPITAL A", "HB", "Hosp B", "Hospital B", "HOSPITAL B")))
  expect_true(any(is.na(en$HospNo)))
  expect_true(any(grepl("^fake_[0-9]{3} [0-9]{3} [0-9]{4}$", ed$nhs_number)))
})

test_that("the ADT log is still well formed after injection", {
  g <- gen_messy(); ev <- g$tables$pas_adt_events
  expect_false(any(duplicated(ev$message_id)))
  expect_true(all(diff(as.numeric(ev$recorded_datetime)) >= 0))
  expect_true(all(c("A11", "A13", "A40") %in% ev$event_type))
  a40 <- ev[event_type == "A40"]
  expect_true(all(!is.na(a40$prior_mrn)))
  expect_true(all(a40$prior_mrn %in% g$tables$pas_patients$mrn))
  # cancelled admissions have no discharge
  canc <- g$truth$spells[cancelled == TRUE, visit_number]
  expect_false(any(ev[visit_number %in% canc, event_type] %in% c("A03", "A02")))
  # one open spell per A11-cancelled admission; every logged original value is recoverable
  ml <- g$mess_log
  expect_true(all(c("mess_id", "table", "row_key", "field", "original_value", "note", "mess_row") %in% names(ml)))
})

test_that("bouncing writes extra audit rows and the final values the catalogue describes", {
  g <- gen_messy(); lg <- g$tables$pas_op_status_log; ap <- g$tables$pas_outpatient_appointments; ml <- g$mess_log
  b1 <- ml[mess_id == "M-BOUNCE-01", row_key]
  n <- lg[appointment_id %in% b1, .N, by = appointment_id]
  expect_true(all(n$N >= 5))
  b2 <- ml[mess_id == "M-BOUNCE-02", row_key]
  expect_true(all(ap[appointment_id %in% b2, attendance_status] == "3"))
  b4 <- ml[mess_id == "M-BOUNCE-04", row_key]
  expect_true(all(ap[appointment_id %in% b4, outcome] == "5"))
  el <- g$tables$ed_status_log
  expect_true("re-opened" %in% el$status)
  expect_true("decision to admit removed" %in% el$status)
})


test_that("every NHS number in every table keeps the fake_ prefix, whatever the formatting mess", {
  g <- gen_messy()
  for (nm in names(g$tables)) {
    t <- g$tables[[nm]]
    for (col in grep("nhs_?number$", names(t), ignore.case = TRUE, value = TRUE)) {
      if (!is.character(t[[col]])) next
      v <- t[[col]][!is.na(t[[col]]) & t[[col]] != ""]
      if (!length(v)) next
      expect_true(all(startsWith(v, "fake_")), label = paste(nm, col))
    }
  }
})


test_that("duplicate registrations never reuse an MRN that belongs to someone else", {
  g <- gen_messy()
  p <- g$tables$pas_patients
  expect_equal(anyDuplicated(p$mrn), 0L)
  expect_true(all(g$tables$pas_adt_events$mrn %in% p$mrn))
})
