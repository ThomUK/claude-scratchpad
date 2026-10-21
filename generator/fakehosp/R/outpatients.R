# Referrals, RTT pathways, outpatient appointments and the appointment audit trail.

op_specialty_mix <- function() {
  fread(text = "
tfc,w
110,12
120,8
130,10
330,7
502,9
320,6
301,5
101,5
410,2
400,4
340,3
430,2
420,6
100,4
104,2
107,1
361,2
300,3
")
}

generate_outpatients <- function(pts, ref, vol, scale, seed, start, end, verbose = FALSE) {
  stage_seed(seed, 4L)
  start <- as.Date(start); end <- as.Date(end)
  # Referrals arrive from 9 months before the window so that first appointments
  # and open pathways exist at the start.
  r_dates <- seq(start - 270, end, by = "day")
  n_r <- daily_counts(vol$referrals * scale, r_dates, start - 270, rep(1, 48), dow_op)
  ref_dt <- data.table(referral_received_date = rep(r_dates, n_r))
  n <- nrow(ref_dt)
  vmsg(verbose, "Referrals: ", n)
  mix <- op_specialty_mix(); mix[, tfc := sprintf("%03d", tfc)]
  ref_dt[, specialty_code := mix$tfc[wsample(.N, mix$w)]]
  # patients conditioned on specialty
  ref_dt[, mrn := NA_character_]
  ref_dt[specialty_code == "420", mrn := pick_patients(pts, .N, pts$age_mid < 16)]
  ref_dt[specialty_code == "502", mrn := pick_patients(pts, .N, pts$sex == "2" & pts$age_mid >= 16)]
  ref_dt[specialty_code == "430", mrn := pick_patients(pts, .N, pts$age_mid >= 70)]
  ref_dt[is.na(mrn), mrn := pick_patients(pts, .N, pts$age_mid >= 16)]
  ref_dt[, referral_source := rcat(.N, c("03", "05", "04", "10", "01", "11"), c(50, 22, 6, 6, 5, 11))]
  ref_dt[, priority := rcat(.N, c("1", "2", "3"), c(75, 17, 8))]
  ref_dt[specialty_code %in% c("330", "130", "410") & priority == "3" & runif(.N) < 0.5, priority := "1"]
  ref_dt[, rtt := runif(.N) < vol$rtt_share_referrals]
  ref_dt[referral_source == "01", rtt := FALSE]            # post-emergency follow-up is non-RTT
  ref_dt[, referral_id := sprintf("REF%09d", .I)]
  ref_dt[, rtt_pathway_id := ifelse(rtt, sprintf("RTT%09d", .I), NA_character_)]
  # site for the pathway's clinics
  sp <- ref$specialties
  bshare <- setNames(ifelse(sp$op_b == 1, pmax(sp$elective_b_share, ifelse(sp$op_a == 1, 0.35, 1)), 0), sp$tfc)
  ref_dt[, site_code := ifelse(runif(.N) < bshare[specialty_code], "RZ902", "RZ901")]

  # ---- appointments: first attendance then follow-ups ----
  med_wait <- c("1" = 128, "2" = 28, "3" = 10)
  ref_dt[, first_due := referral_received_date + pmin(round(rln(.N, med_wait[priority], 0.6)), 400)]
  # slot status weights: attended 5, late-seen 6, DNA 3, patient cancel 2, hospital cancel 4, late-not-seen 7
  slot_status <- function(n, first) rcat(n, c("5", "6", "3", "2", "4", "7"), if (first) c(66, 4, 4.2, 8.8, 16, 1) else c(67, 4, 4.2, 8.8, 15, 1))
  appts <- list()
  # first attendances
  cur <- ref_dt[, .(referral_id, mrn, specialty_code, site_code, priority, due = first_due, first_attendance = TRUE, seq = 1L)]
  k <- 0L
  while (nrow(cur) > 0L && k < 8L) {
    k <- k + 1L
    cur[, attendance_status := slot_status(.N, cur$first_attendance[1])]
    cur[first_attendance == TRUE, attendance_status := slot_status(.N, TRUE)]
    cur[first_attendance == FALSE, attendance_status := slot_status(.N, FALSE)]
    appts[[k]] <- copy(cur)
    # cancellations and DNAs rebook (DNA first attendance: 60% rebooked, else discharged)
    rb <- cur[attendance_status %in% c("2", "4", "7") | (attendance_status == "3" & runif(.N) < 0.5)]
    rb[, due := due + round(rln(.N, ifelse(attendance_status == "4", 14, 21), 0.5))]
    rb[, seq := seq + 1L]
    cur <- rb
  }
  ap <- rbindlist(appts)
  setorder(ap, referral_id, seq)
  # outcomes for attended rows
  ap[, outcome := NA_character_]
  ap[attendance_status %in% c("5", "6") & first_attendance == TRUE,
     outcome := rcat(.N, c("discharged", "follow_up", "waiting_list", "diagnostic"), c(20, 62, 10, 8))]
  ap[attendance_status %in% c("5", "6") & first_attendance == FALSE,
     outcome := rcat(.N, c("discharged", "follow_up", "waiting_list", "diagnostic"), c(35, 55, 5, 5))]
  # follow-up chains from attended rows with follow_up / diagnostic outcome
  fu_seed <- ap[outcome %in% c("follow_up", "diagnostic"), .(referral_id, mrn, specialty_code, site_code, priority, due, seq)]
  fu_all <- list(); depth <- 0L
  while (nrow(fu_seed) > 0L && depth < 14L) {
    depth <- depth + 1L
    nxt <- fu_seed[, .(referral_id, mrn, specialty_code, site_code, priority, due = due + round(rln(.N, 60, 0.7)), first_attendance = FALSE, seq = seq + 1L)]
    nxt <- nxt[due <= end + 30]
    k <- 0L; chain <- list(); cur <- nxt
    while (nrow(cur) > 0L && k < 6L) {
      k <- k + 1L
      cur[, attendance_status := slot_status(.N, FALSE)]
      chain[[k]] <- copy(cur)
      rb <- cur[attendance_status %in% c("2", "4", "7") | (attendance_status == "3" & runif(.N) < 0.5)]
      rb[, due := due + round(rln(.N, 24, 0.6))]; rb[, seq := seq + 1L]
      cur <- rb
    }
    ch <- rbindlist(chain)
    ch[, outcome := NA_character_]
    ch[attendance_status %in% c("5", "6"), outcome := rcat(.N, c("discharged", "follow_up", "waiting_list", "diagnostic"), c(26, 64, 5, 5))]
    fu_all[[depth]] <- ch
    fu_seed <- ch[outcome %in% c("follow_up", "diagnostic") & runif(.N) < 0.93, .(referral_id, mrn, specialty_code, site_code, priority, due, seq)]
  }
  ap <- rbind(ap, rbindlist(fu_all))
  stops <- ap[attendance_status %in% c("5", "6") & first_attendance == TRUE, .(stop_date = min(due), stop_kind = outcome[which.min(due)]), by = referral_id]
  stops[stop_kind != "waiting_list", stop_kind := "treated"]
  # a first-attendance chain that ends in a DNA with no rebooking closes the RTT clock (status 33)
  lastf <- ap[first_attendance == TRUE][order(referral_id, seq), .(last_status = attendance_status[.N], last_due = due[.N], any_att = any(attendance_status %in% c("5", "6"))), by = referral_id]
  first_dna <- lastf[any_att == FALSE & last_status == "3", .(referral_id, dna_first = last_due)]
  rebooked <- lastf[, .(referral_id, n = 1L)]
  ap <- ap[due >= start - 60 & due <= end]
  setorder(ap, referral_id, due)
  ap[, seq := seq_len(.N), by = referral_id]
  vmsg(verbose, "Outpatient appointment rows: ", nrow(ap))

  # slot time, clinic, consultant, mode
  ap[, appointment_date := weekday_shift(as_dt(due), 1)]
  ap[, appointment_datetime := appointment_date + hours(sample(c(9, 9.25, 9.5, 10, 10.5, 11, 11.5, 13.5, 14, 14.5, 15, 15.5, 16), .N, TRUE)) + mins(sample(c(0, 10, 20), .N, TRUE))]
  cl <- ref$clinics
  ap[, clinic_code := {
    cc <- cl[site_code == .BY$site_code & tfc == .BY$specialty_code, clinic_code]
    if (length(cc) == 0L) cc <- cl[tfc == .BY$specialty_code, clinic_code]
    if (length(cc) == 0L) cc <- paste0(substr(.BY$site_code, 5, 5), .BY$specialty_code, "A")
    sample(cc, .N, TRUE)
  }, by = .(site_code, specialty_code)]
  cons <- ref$consultants
  ap[, consultant_code := {
    cc <- cons[tfc == .BY$specialty_code, consultant_code]
    if (length(cc) == 0L) cc <- cons$consultant_code
    sample(cc, .N, TRUE)
  }, by = specialty_code]
  ap[, tele := runif(.N) < ifelse(specialty_code %in% c("330", "130", "120", "110"), 0.08, 0.26)]
  ap[, first_attendance_code := ifelse(first_attendance, ifelse(tele, "3", "1"), ifelse(tele, "4", "2"))]
  ap[, booked_datetime := appointment_datetime - days(round(rln(.N, 21, 0.8))) - hours(runif(.N, 0, 8))]
  ap[booked_datetime > appointment_datetime - hours(2), booked_datetime := appointment_datetime - days(1)]
  ap[, cancelled_datetime := as_dt(NA)]
  ap[attendance_status == "4", cancelled_datetime := appointment_datetime - days(round(rln(.N, 8, 0.9)))]
  ap[attendance_status == "2", cancelled_datetime := appointment_datetime - days(round(rln(.N, 2, 1.0)))]
  ap[!is.na(cancelled_datetime) & cancelled_datetime <= booked_datetime, cancelled_datetime := booked_datetime + hours(runif(.N, 1, 48))]
  ap[, dna_date := as.Date(NA)]
  ap[attendance_status %in% c("3", "7"), dna_date := as.Date(appointment_datetime)]
  ap[, staff_type := rcat(.N, c("03", "04"), c(70, 30))]
  ap[, appointment_id := sprintf("OPA%010d", .I)]
  outcome_code <- c(discharged = "1", follow_up = "2", waiting_list = "5", diagnostic = "3")
  ap[, outcome_code := ifelse(is.na(outcome), NA_character_, outcome_code[outcome])]

  # ---- status log (clean: true event times) ----
  seen_delay <- function(n) mins(rln(n, 18, 0.6))
  lg <- rbind(
    ap[, .(appointment_id, field = "attendance_status", old_value = NA_character_, new_value = "booked", recorded_datetime = booked_datetime, workstation = rcat(.N, c("central booking", "clinic reception", "ward clerk"), c(70, 25, 5)))],
    ap[attendance_status %in% c("5", "6"), .(appointment_id, field = "attendance_status", old_value = "booked", new_value = "arrived", recorded_datetime = appointment_datetime + mins(runif(.N, -15, 20)), workstation = "clinic reception")],
    ap[attendance_status %in% c("5", "6"), .(appointment_id, field = "attendance_status", old_value = "arrived", new_value = attendance_status, recorded_datetime = appointment_datetime + seen_delay(.N), workstation = "clinic reception")],
    ap[attendance_status %in% c("5", "6"), .(appointment_id, field = "outcome", old_value = NA_character_, new_value = outcome_code, recorded_datetime = appointment_datetime + seen_delay(.N) + mins(runif(.N, 10, 40)), workstation = "clinic reception")],
    ap[attendance_status %in% c("3", "7"), .(appointment_id, field = "attendance_status", old_value = "booked", new_value = attendance_status, recorded_datetime = appointment_datetime + mins(runif(.N, 30, 120)), workstation = "clinic reception")],
    ap[attendance_status %in% c("2", "4"), .(appointment_id, field = "attendance_status", old_value = "booked", new_value = attendance_status, recorded_datetime = cancelled_datetime, workstation = ifelse(attendance_status == "4", "central booking", rcat(.N, c("central booking", "clinic reception"), c(80, 20))))]
  )
  lg[, user_id := sprintf("U%04d", sample.int(600L, .N, TRUE))]
  setorder(lg, appointment_id, recorded_datetime)
  lg[, log_id := .I]

  # ---- RTT pathways ----
  ref_dt <- merge(ref_dt, stops, by = "referral_id", all.x = TRUE)
  ref_dt[, rtt_period_start_date := ifelse(rtt, referral_received_date, as.Date(NA))]
  ref_dt[, rtt_period_start_date := as.Date(rtt_period_start_date, origin = "1970-01-01")]
  ref_dt[, rtt_period_end_date := as.Date(NA)]
  ref_dt[, rtt_period_status := NA_character_]
  ref_dt[rtt == TRUE & !is.na(stop_date) & stop_kind == "treated", `:=`(rtt_period_end_date = stop_date, rtt_period_status = rcat(.N, c("30", "34", "32"), c(75, 12, 13)))]
  # waiting-list stops are closed by the elective admission (admissions stage sets the date)
  ref_dt[rtt == TRUE & is.na(rtt_period_end_date), rtt_period_status := "20"]
  ref_dt[rtt == TRUE & is.na(rtt_period_end_date) & stop_kind %in% "waiting_list", rtt_period_status := "20"]
  # DNA first appointment that was not rebooked: status 33, clock stops
  ref_dt <- merge(ref_dt, first_dna, by = "referral_id", all.x = TRUE)
  ref_dt <- merge(ref_dt, rebooked, by = "referral_id", all.x = TRUE)
  ref_dt[rtt == TRUE & !is.na(dna_first) & n == 1L & is.na(rtt_period_end_date), `:=`(rtt_period_end_date = dna_first, rtt_period_status = "33")]
  ref_dt[!is.na(rtt_period_end_date) & rtt_period_end_date > end, `:=`(rtt_period_end_date = as.Date(NA), rtt_period_status = "20")]

  referrals <- ref_dt[, .(referral_id, mrn, referral_received_date, referral_source, specialty_code, priority, site_code,
                          rtt_pathway_id, rtt_period_start_date, rtt_period_end_date, rtt_period_status, stop_kind,
                          wl_decision_date = fifelse(stop_kind == "waiting_list", stop_date, as.Date(NA)))]
  appointments <- ap[, .(appointment_id, mrn, referral_id, site_code, clinic_code, specialty_code, consultant_code,
                         appointment_datetime, first_attendance = first_attendance_code, attendance_status, outcome = outcome_code,
                         priority, booked_datetime, cancelled_datetime, dna_date, staff_type)]
  list(referrals = referrals, appointments = appointments, status_log = lg)
}
