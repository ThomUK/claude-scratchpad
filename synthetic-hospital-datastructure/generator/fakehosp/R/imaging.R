# Radiology: CT, MRI and ultrasound requests and examinations (RIS-shaped).

source_split <- function(modality) {
  switch(modality,
    CT = c(AE = 34.9, DC = 0.2, IP = 22.1, OP = 37.6, GP = 5.0, OHCP = 0.2),
    MR = c(AE = 3.9,  DC = 0.4, IP = 14.3, OP = 70.9, GP = 9.9, OHCP = 0.5),
    US = c(AE = 2.8,  DC = 0.7, IP = 14.4, OP = 55.1, GP = 26.8, OHCP = 0.2))
}
# Request-to-test bands (0-7, 8-31, 32-62, >62 days), DID Table 9 England 2023/24.
rtt_bands <- list(
  CT = list(AE = c(99.7, 0.2, 0.0, 0.1), DC = c(66.7, 22.0, 6.1, 5.2), IP = c(98.0, 1.5, 0.3, 0.2), GP = c(26.9, 51.0, 16.9, 5.2), OP = c(26.3, 38.5, 16.7, 18.5), OHCP = c(50.1, 27.6, 11.7, 10.6)),
  MR = list(AE = c(86.2, 7.4, 5.2, 1.1), DC = c(30.5, 25.0, 14.6, 29.9), IP = c(93.1, 5.3, 1.0, 0.6), GP = c(14.3, 45.6, 29.6, 10.5), OP = c(19.6, 37.4, 25.1, 17.9), OHCP = c(27.7, 33.4, 26.7, 12.2)),
  US = list(AE = c(85.7, 5.7, 3.2, 5.4), DC = c(67.7, 17.2, 6.9, 8.2), IP = c(94.2, 3.8, 1.4, 0.6), GP = c(14.7, 37.3, 33.9, 14.1), OP = c(41.9, 25.6, 16.0, 16.5), OHCP = c(41.2, 26.3, 19.2, 13.4)))
# Test-to-report bands for outpatient and GP (0-1 d, 1-7, 7-14, 14-28, >28), DID Table 13 comparators.
rep_bands_op <- list(CT = c(32, 24, 18, 19, 7), MR = c(30, 32, 14, 17, 7), US = c(95, 4, 1, 0, 0))
same_day_ip  <- c(CT = 0.96, MR = 0.84, US = 0.99)

generate_imaging <- function(pts, ref, vol, scale, seed, start, end, ed, adm, op, verbose = FALSE) {
  stage_seed(seed, 6L)
  start <- as.Date(start); end <- as.Date(end)
  yrs <- as.numeric(end - start + 1) / 365.25
  cat <- ref$exam_catalogue
  snomed <- fread(system.file("extdata", "nicip_snomed.csv", package = "fakehosp"), colClasses = "character")
  eda <- ed$attendances
  sp_ip <- adm$spells[day_case == FALSE]
  sp_dc <- adm$spells[day_case == TRUE]
  opa <- op$appointments[attendance_status %in% c("5", "6")]
  out <- list()
  for (mod in c("CT", "MR", "US")) {
    total <- round(vol[[tolower(mod)]] * scale * yrs)
    ss <- source_split(mod); ns <- round(total * ss / sum(ss))
    rows <- list()
    # A&E
    w <- c(5, 4, 2, 0.5, 0.1)[eda$acuity] * ifelse(eda$uec_activity_type == "UTC", 0.05, 1) * ifelse(mod == "US", ifelse(eda$acuity >= 3, 1, 0.5), 1)
    i <- wsample(ns["AE"], w)
    rows$AE <- if (ns["AE"] > 0) data.table(mrn = eda$mrn[i], src = "AE", patient_source_setting = "05",
                          request_datetime = fifelse(is.na(eda$seen_for_treatment_timestamp[i]), eda$activity_start_datetime[i] + mins(30), eda$seen_for_treatment_timestamp[i]) + mins(runif(ns["AE"], 5, 40)),
                          linked_id = eda$uec_activity_identifier[i], site_code = "RZ901", referrer_tfc = "180")
    # inpatients
    i <- wsample(ns["IP"], sp_ip$los + 1)
    rq <- sp_ip$admit[i] + hours(runif(ns["IP"], 2, 10)) + days(runif(ns["IP"], 0, pmax(sp_ip$los[i], 0.5)))
    rq <- pmin(rq, sp_ip$discharge[i] - hours(2))
    rows$IP <- if (ns["IP"] > 0) data.table(mrn = sp_ip$mrn[i], src = "IP", patient_source_setting = "01", request_datetime = rq,
                          linked_id = sp_ip$visit_number[i], site_code = sp_ip$site_code[i], referrer_tfc = sp_ip$specialty_code[i])
    i <- wsample(ns["DC"], rep(1, nrow(sp_dc)))
    rows$DC <- if (ns["DC"] > 0) data.table(mrn = sp_dc$mrn[i], src = "DC", patient_source_setting = "02", request_datetime = sp_dc$admit[i] + hours(runif(ns["DC"], 0.5, 4)),
                          linked_id = sp_dc$visit_number[i], site_code = sp_dc$site_code[i], referrer_tfc = sp_dc$specialty_code[i])
    # outpatients
    i <- wsample(ns["OP"], rep(1, nrow(opa)))
    rows$OP <- if (ns["OP"] > 0) data.table(mrn = opa$mrn[i], src = "OP", patient_source_setting = "03", request_datetime = opa$appointment_datetime[i] + mins(runif(ns["OP"], 10, 60)),
                          linked_id = opa$appointment_id[i], site_code = opa$site_code[i], referrer_tfc = opa$specialty_code[i])
    # GP direct access and other providers
    dates <- seq(start, end, by = "day")
    for (s in c("GP", "OHCP")) {
      nd <- daily_counts(ns[[s]] / yrs, dates, start, imaging_month_index(mod), dow_op)
      d <- rep(dates, nd)
      if (length(d) == 0L) next
      rows[[s]] <- data.table(mrn = pick_patients(pts, length(d), pts$age_mid >= 16 | mod == "US"), src = s, patient_source_setting = ifelse(s == "GP", "04", "06"),
                              request_datetime = dt_of(d, hours(8) + runif(length(d), 0, 10 * 3600)), linked_id = NA_character_, site_code = NA_character_, referrer_tfc = NA_character_)
    }
    x <- rbindlist(rows)[!is.na(mrn)]          # zero-length sources produce an NA row
    x[, modality := mod]
    # exam type by source weights
    cm <- cat[modality == mod]
    wcol <- c(AE = "w_ed", IP = "w_ip", DC = "w_ip", OP = "w_op", GP = "w_gp", OHCP = "w_gp")
    x[, exam_i := { ww <- cm$share * cm[[wcol[.BY$src]]]; if (sum(ww) == 0) ww <- cm$share; wsample(.N, ww) }, by = src]
    x[, `:=`(nicip_code = cm$exam_code[exam_i], exam_description = cm$exam_description[exam_i], body_area = cm$body_area[exam_i],
             slot_minutes = cm$slot[exam_i], room_min = cm$room_min[exam_i], room_max = cm$room_max[exam_i], dm01 = cm$dm01[exam_i])]
    x[, snomed_code := snomed$snomed_code[match(nicip_code, snomed$nicip_code)]]
    x[snomed_code == "", snomed_code := NA_character_]
    # priority
    x[, priority := "routine"]
    x[src == "AE", priority := "emergency"]
    x[src == "IP", priority := rcat(.N, c("urgent", "emergency"), c(80, 20))]
    x[src == "DC", priority := "urgent"]
    x[src == "OP", priority := rcat(.N, c("two_week_wait", "urgent", "routine", "planned"), c(12, 25, 55, 8))]
    x[src %in% c("GP", "OHCP"), priority := rcat(.N, c("two_week_wait", "urgent", "routine", "planned"), c(10, 15, 70, 5))]
    # request received
    x[, request_received_datetime := request_datetime]
    x[src %in% c("GP", "OHCP"), request_received_datetime := to_working_hours(request_datetime + days(rln(.N, 1, 0.8)))]
    # request to scan
    x[, band := { b <- rtt_bands[[mod]][[.BY$src]]; wsample(.N, b) }, by = src]
    x[, delta_days := 0]
    x[band == 1L, delta_days := runif(.N, 0.5, 7)]
    x[band == 2L, delta_days := runif(.N, 8, 31)]
    x[band == 3L, delta_days := runif(.N, 32, 62)]
    x[band == 4L, delta_days := runif(.N, 63, 150)]
    x[src == "AE" & band == 1L, delta_days := rln(.N, c(CT = 2.5, MR = 20, US = 4)[mod], 0.7) / 24]
    x[src == "IP" & band == 1L, delta_days := rln(.N, c(CT = 0.5, MR = 1.4, US = 0.9)[mod], 0.7)]
    x[priority == "two_week_wait", delta_days := pmin(delta_days, runif(.N, 2, 10))]
    x[priority == "planned", delta_days := rln(.N, 120, 0.4)]
    x[, scan_start_datetime := request_received_datetime + days(delta_days)]
    x[src %in% c("OP", "GP", "OHCP", "DC"), scan_start_datetime := weekday_shift(to_working_hours(scan_start_datetime, 8, 20), 0.9)]
    # vetting and booking
    x[, vetted_datetime := as_dt(NA)]
    x[src %in% c("OP", "GP", "OHCP") & (mod != "CT" | priority %in% c("routine", "two_week_wait")),
      vetted_datetime := pmin(to_working_hours(request_received_datetime + days(rln(.N, 1.5, 0.7))), scan_start_datetime - hours(4))]
    x[, booked_datetime := request_received_datetime]
    x[src %in% c("OP", "GP", "OHCP"), booked_datetime := pmin(fifelse(is.na(vetted_datetime), request_received_datetime, vetted_datetime) + days(rln(.N, 1, 0.8)), scan_start_datetime - hours(2))]
    x[, scan_end_datetime := scan_start_datetime + mins(runif(.N, room_min, room_max) + ifelse(src %in% c("AE", "IP"), 3, 0))]
    # reporting
    x[, reported_datetime := as_dt(NA)]
    x[src %in% c("AE", "IP", "DC"), reported_datetime := scan_end_datetime + {
      sd <- runif(.N) < same_day_ip[mod]
      fifelse(sd, hours(rln(.N, c(CT = 1.5, MR = 4, US = 0.2)[mod], 0.6)), hours(rln(.N, 30, 0.5)))
    }]
    x[src %in% c("OP", "GP", "OHCP"), reported_datetime := scan_end_datetime + {
      b <- wsample(.N, rep_bands_op[[mod]])
      days(c(runif(.N, 0.01, 1), runif(.N, 1, 7), runif(.N, 7, 14), runif(.N, 14, 28), runif(.N, 28, 60))[cbind(seq_len(.N), b)[, 1] + (b - 1L) * .N])
    }]
    x[mod == "US", reported_datetime := scan_end_datetime + mins(runif(.N, 2, 15))]
    x[, verified_datetime := reported_datetime + mins(runif(.N, 5, 90))]
    x[, status := "verified"]
    # site and scanner
    x[src %in% c("AE", "IP"), site_code := "RZ901"]
    bshare <- c(CT = 0.25, MR = 0.55, US = 0.5)[mod]
    x[is.na(site_code) | src %in% c("OP", "GP", "OHCP", "DC"), site_code := ifelse(runif(.N) < bshare, "RZ902", "RZ901")]
    scanners <- list(CT = list(RZ901 = c("CT1", "CT2", "CT3", "CT4"), RZ902 = "CT5"), MR = list(RZ901 = c("MR1", "MR2", "MR3"), RZ902 = c("MR4", "MR5")),
                     US = list(RZ901 = paste0("US", 1:6), RZ902 = paste0("US", 7:10)))
    x[, scanner_id := sample(scanners[[mod]][[.BY$site_code]], .N, TRUE), by = site_code]
    x[src %in% c("AE", "IP") & mod == "CT", scanner_id := rcat(.N, c("CT1", "CT2"), c(1, 1))]
    # DNA with rebooking for outpatient and GP exams
    pd <- c(CT = 0.04, MR = 0.06, US = 0.08)[mod]
    dna <- x[src %in% c("OP", "GP", "OHCP") & priority != "planned" & runif(.N) < pd]
    if (nrow(dna) > 0L) {
      dna2 <- copy(dna)
      dna[, `:=`(status = "DNA", scan_end_datetime = as_dt(NA), reported_datetime = as_dt(NA), verified_datetime = as_dt(NA), dna_slot = scan_start_datetime, scan_start_datetime = as_dt(NA))]
      shift <- days(runif(nrow(dna2), 14, 35))
      dna2[, `:=`(booked_datetime = booked_datetime + days(2), scan_start_datetime = scan_start_datetime + shift, scan_end_datetime = scan_end_datetime + shift,
                  reported_datetime = reported_datetime + shift, verified_datetime = verified_datetime + shift)]
      x <- rbind(x[!dna, on = c("mrn", "request_datetime", "nicip_code")], dna, dna2, fill = TRUE)
    }
    out[[mod]] <- x
  }
  x <- rbindlist(out, fill = TRUE)
  x <- x[as.Date(fifelse(is.na(scan_start_datetime), dna_slot, scan_start_datetime)) <= end & as.Date(request_datetime) >= start - 120]
  setorder(x, site_code, request_datetime)
  x[, accession_number := sprintf("%s-%08d", site_code, seq_len(.N)), by = site_code]
  x <- merge(x, pts[, .(mrn, nhs_number, ris_patient_id)], by = "mrn", sort = FALSE)
  x[, nhs_number_status := "01"]
  x[, referrer_code := ifelse(src %in% c("GP", "OHCP"), sprintf("G%07d", sample.int(8999999L, .N, TRUE) + 1000000L), sprintf("C%07d", sample.int(8999999L, .N, TRUE) + 1000000L))]
  x[, referring_organisation := ifelse(src == "GP", pts$gp_practice[match(mrn, pts$mrn)], ifelse(src == "OHCP", "RZZ", "RZ9"))]
  x[, reporter_code := sprintf("R%04d", sample.int(120L, .N, TRUE))]
  x[, cancel_reason := NA_character_]
  x[, modality := ifelse(modality == "MR", "MR", modality)]
  setorder(x, request_datetime)
  vmsg(verbose, "Imaging rows: ", nrow(x))
  x[, .(accession_number, ris_patient_id, nhs_number, nhs_number_status, mrn, modality, nicip_code, snomed_code, exam_description, body_area,
        priority, patient_source_setting, referrer_code, referring_organisation, request_datetime, request_received_datetime, vetted_datetime,
        booked_datetime, scan_start_datetime, scan_end_datetime, slot_minutes, reported_datetime, verified_datetime, reporter_code, status,
        cancel_reason, site_code, scanner_id, dm01_countable = dm01, linked_id)]
}
