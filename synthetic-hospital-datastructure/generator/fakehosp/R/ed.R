# Emergency department attendances (ECDS-shaped) and the tracking-board audit trail.

generate_ed <- function(pts, ref, vol, scale, seed, start, end, verbose = FALSE) {
  stage_seed(seed, 3L)
  dates <- seq(as.Date(start), as.Date(end), by = "day")
  n_t1  <- daily_counts(vol$ed_type1 * scale, dates, start, ed_month_index(), dow_ed)
  n_utc <- daily_counts(vol$ed_utc  * scale, dates, start, ed_month_index(), dow_ed)
  att <- rbind(data.table(date = rep(dates, n_t1), stream = "ED"),
               data.table(date = rep(dates, n_utc), stream = "UTC"))
  n <- nrow(att)
  vmsg(verbose, "ED attendances: ", n)
  att[, arrival := dt_of(date, sample_tod(.N, tod_ed))]
  setorder(att, arrival)
  att[, mrn := pick_patients(pts, .N)]
  att <- merge(att, pts[, .(mrn, nhs_number, dob, sex, ed_patient_id)], by = "mrn", sort = FALSE)
  att[, age := age_at(dob, arrival)]
  att[stream == "ED" & age < 16, stream := "Childrens ED"]
  # acuity 1..5
  att[, acuity := ifelse(stream == "UTC", rcat(.N, 4:5, c(70, 30)), rcat(.N, 1:5, c(2, 10, 45, 38, 5)))]
  cc <- chief_complaints(ref)
  att[, cc_i := wsample(.N, cc$w)]
  att[, chief_complaint := cc$chief_complaint[cc_i]]
  att[, chief_complaint_snomed := cc$snomed_code[cc_i]]
  # admission decision: acuity-driven, nudged by complaint propensity and age
  base <- c(0.88, 0.66, 0.38, 0.085, 0.02)
  att[, p_adm := base[acuity] * (0.6 + cc$adm[cc_i]) * ifelse(age >= 75, 1.35, ifelse(age < 16, 0.8, 1))]
  att[stream == "UTC", p_adm := 0.02]
  att[, admitted := runif(.N) < pmin(p_adm, 0.97)]
  # codes
  amb <- ref$ecds_codes[code_set == "arrival_mode"]
  att[, arrival_mode := ifelse(acuity <= 2 & runif(.N) < 0.85 | runif(.N) < 0.25 & stream != "UTC",
                               rcat(.N, c("Emergency road ambulance", "Emergency road ambulance with medical escort", "Non-emergency road ambulance", "Helicopter"), c(85, 5, 9, 1)),
                               rcat(.N, c("Patient arranged own transport / walk-in", "Public transport / taxi", "Police transport"), c(88, 11, 1)))]
  att[, attendance_source := rcat(.N, c("Self / family / friends / education / work colleague", "GP / practice nurse", "NHS telephone / internet advice e.g. NHS 111", "Ambulance service", "Out of hours GP service", "Outpatient service including SDEC", "Inpatient", "Police service / forensic medical officer", "Non-NHS telephone / internet advice", "Care home"),
                                  c(60, 9, 8, 12, 3, 2, 1, 1, 2, 2))]
  att[, attendance_category := rcat(.N, c("1", "2", "3"), c(90, 7, 3))]
  wi <- winter_index()
  att[, wfac := wi[month_index(date, start) + 1L]]
  # timestamps
  att[, triage := arrival + mins(ifelse(stream == "UTC", runif(.N, 10, 40), runif(.N, 3, 20)))]
  med_seen <- c(5, 25, 75, 60, 50)
  att[, seen := triage + mins(rln(.N, med_seen[acuity] * wfac, 0.7))]
  att[acuity == 1, `:=`(triage = arrival + mins(runif(.N, 1, 3)))]
  att[acuity == 1, seen := triage + mins(runif(.N, 0, 3))]
  att[, dta := as_dt(NA)]
  att[admitted == TRUE, dta := seen + mins(rln(.N, 95 * wfac, 0.6))]
  # departure
  att[, depart := seen + mins(rln(.N, ifelse(stream == "UTC", 35, 85), 0.65))]
  att[admitted == TRUE, depart := dta + mins(rln(.N, 170 * wfac^2, 1.15))]
  # discharge status and destination
  att[, discharge_status := "Treatment complete"]
  att[admitted == FALSE, discharge_status := rcat(.N, c("Treatment complete", "Streamed to primary care service / GP", "Left before initial assessment", "Left after assessment but before treatment complete (destination unknown)", "Same Day Emergency Care service", "Died in the Emergency Care facility"), c(81, 7, 4, 2, 5.7, 0.3))]
  att[discharge_status == "Left before initial assessment", `:=`(triage = as_dt(NA), seen = as_dt(NA), depart = arrival + mins(rln(.N, 90, 0.5)))]
  att[discharge_status == "Left after assessment but before treatment complete (destination unknown)", `:=`(depart = seen + mins(rln(.N, 120, 0.5)))]
  att[discharge_status == "Died in the Emergency Care facility", `:=`(depart = seen + mins(runif(.N, 20, 180)))]
  att[, discharge_destination := "Usual place of residence / family members"]
  att[admitted == FALSE & discharge_status == "Same Day Emergency Care service", discharge_destination := "Same Day Emergency Care service"]
  att[admitted == FALSE & discharge_status == "Died in the Emergency Care facility", discharge_destination := "Mortuary"]
  att[admitted == FALSE & age >= 75 & runif(.N) < 0.12, discharge_destination := rcat(.N, c("Residential care facility without 24 hour nursing care (e.g. residential home)", "Residential care facility with 24 hour nursing care (e.g. nursing home)"), c(1, 1))]
  att[admitted == TRUE, discharge_destination := rcat(.N, c("Ward – physical ward bed outside ED", "Short stay (less than 24hr) ward outside the ED but managed by ED", "High Dependency Unit (level 2)", "Coronary Care Unit (level 2)", "Intensive Care Unit (level 3)", "Operating theatre"), c(83, 6, 3, 3, 2, 3))]
  att[, uec_activity_identifier := sprintf("UEC%09d", .I)]
  att[, site_of_treatment := "RZ901"]
  att[, uec_activity_type := stream]
  att[, nhs_number_status_indicator_code := "01"]
  att[, tfc_decision_to_admit := NA_character_]
  spec <- cc$spec[att$cc_i]
  att[admitted == TRUE, tfc_decision_to_admit := ifelse(age < 16, "420", ifelse(spec == "180", "300", spec))]
  att[admitted == TRUE & age >= 75 & tfc_decision_to_admit == "300" & runif(.N) < 0.45, tfc_decision_to_admit := "430"]
  att[, ready_to_proceed := as_dt(NA)]
  att[admitted == TRUE, ready_to_proceed := dta + mins(runif(.N, 5, 60))]
  att[, died := discharge_status == "Died in the Emergency Care facility"]

  out <- att[, .(uec_activity_identifier, local_patient_identifier = ed_patient_id, nhs_number, nhs_number_status_indicator_code,
                 mrn, site_of_treatment, uec_activity_type, arrival_mode, attendance_category, attendance_source,
                 activity_start_datetime = arrival, initial_assessment_timestamp = triage, acuity, chief_complaint, chief_complaint_snomed,
                 seen_for_treatment_timestamp = seen, decided_to_admit_datetime = dta, tfc_decision_to_admit,
                 clinically_ready_to_proceed_timestamp = ready_to_proceed, discharge_status, discharge_destination,
                 activity_end_timestamp = depart, admitted, died, age)]
  # status log
  log <- rbind(
    out[, .(uec_activity_identifier, status = "arrived", recorded_datetime = activity_start_datetime, user_role = "receptionist")],
    out[!is.na(initial_assessment_timestamp), .(uec_activity_identifier, status = "triaged", recorded_datetime = initial_assessment_timestamp, user_role = "nurse")],
    out[!is.na(seen_for_treatment_timestamp), .(uec_activity_identifier, status = "seen", recorded_datetime = seen_for_treatment_timestamp, user_role = "clinician")],
    out[admitted == TRUE, .(uec_activity_identifier, status = "decision to admit", recorded_datetime = decided_to_admit_datetime, user_role = "clinician")],
    out[admitted == TRUE, .(uec_activity_identifier, status = "ready to go", recorded_datetime = clinically_ready_to_proceed_timestamp, user_role = "bed manager")],
    out[, .(uec_activity_identifier, status = "departed", recorded_datetime = activity_end_timestamp, user_role = ifelse(admitted, "bed manager", "nurse"))]
  )
  log[, recorded_datetime := recorded_datetime + mins(runif(.N, 0, 2))]
  setorder(log, uec_activity_identifier, recorded_datetime)
  log[, log_id := .I]
  list(attendances = out, status_log = log)
}
