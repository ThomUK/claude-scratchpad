# Endoscopy: the vendor's procedure-centric export.

generate_endoscopy <- function(pts, ref, vol, scale, seed, start, end, adm, op, verbose = FALSE) {
  stage_seed(seed, 7L)
  start <- as.Date(start); end <- as.Date(end)
  yrs <- as.numeric(end - start + 1) / 365.25
  n <- round(vol$endoscopy * scale * yrs)
  cat_w <- c(OP = 45, SURV = 12, BCSP = 8, `IP-EL` = 30, `IP-NEL` = 5)
  nc <- round(n * cat_w / sum(cat_w))
  rows <- list()
  # elective inpatient / day case: endoscopy-flagged day cases
  el <- adm$spells[endoscopy == TRUE & as.Date(admit) >= start]
  k <- min(nrow(el), nc["IP-EL"])
  i <- if (k > 0) sample.int(nrow(el), k) else integer(0)
  rows$ipel <- if (k > 0) data.table(mrn = el$mrn[i], Category = "IP-EL", proc_dt = el$admit[i] + hours(runif(k, 1, 5)), site_code = el$site_code[i],
                          spec = el$specialty_code[i], ReferralDate = el$decision_to_admit_date[i], linked_id = el$visit_number[i])
  # emergency inpatient
  ne <- adm$spells[emergency == TRUE & specialty_code %in% c("301", "104", "300") & los >= 1 & as.Date(admit) >= start]
  k <- min(nrow(ne), nc["IP-NEL"]); i <- if (k > 0) sample.int(nrow(ne), k) else integer(0)
  rows$ipnel <- if (k > 0) data.table(mrn = ne$mrn[i], Category = "IP-NEL", proc_dt = pmin(ne$admit[i] + hours(runif(k, 6, 48)), ne$discharge[i] - hours(3)), site_code = "RZ901",
                           spec = ne$specialty_code[i], ReferralDate = as.Date(ne$admit[i]), linked_id = ne$visit_number[i])
  # outpatient direct
  oa <- op$appointments[attendance_status %in% c("5", "6") & specialty_code %in% c("301", "104", "101")]
  k <- min(nrow(oa), nc["OP"])
  i <- if (k > 0) wsample(k, ifelse(oa$specialty_code == "101", 0.25, 1) * ifelse(oa$outcome == "3", 4, 1), replace = FALSE) else integer(0)
  rows$op <- if (k > 0) data.table(mrn = oa$mrn[i], Category = "OP", proc_dt = to_working_hours(oa$appointment_datetime[i] + days(rln(k, 35, 0.7))), site_code = ifelse(runif(k) < 0.55, "RZ902", "RZ901"),
                        spec = oa$specialty_code[i], ReferralDate = as.Date(oa$appointment_datetime[i]), linked_id = oa$appointment_id[i])
  # surveillance and bowel screening
  k <- nc["SURV"]; d <- sample(seq(start, end, by = "day"), k, TRUE)
  rows$surv <- if (k > 0) data.table(mrn = pick_patients(pts, k, pts$age_mid >= 40), Category = "SURV", proc_dt = to_working_hours(dt_of(d, hours(9))), site_code = ifelse(runif(k) < 0.55, "RZ902", "RZ901"),
                          spec = rcat(k, c("301", "104", "101"), c(50, 30, 20)), ReferralDate = d - round(rln(k, 120, 0.6)), linked_id = NA_character_)
  k <- nc["BCSP"]; d <- sample(seq(start, end, by = "day"), k, TRUE)
  rows$bcsp <- if (k > 0) data.table(mrn = pick_patients(pts, k, pts$age_mid >= vol$bcsp_age[1] & pts$age_mid <= vol$bcsp_age[2]), Category = "BCSP", proc_dt = to_working_hours(dt_of(d, hours(9))), site_code = ifelse(runif(k) < 0.55, "RZ902", "RZ901"),
                          spec = "104", ReferralDate = d - round(rln(k, 25, 0.5)), linked_id = NA_character_)
  x <- rbindlist(rows)[!is.na(mrn)]            # zero-length categories produce an NA row
  x <- x[as.Date(proc_dt) >= start & as.Date(proc_dt) <= end]
  x[, proc_dt := weekday_shift(proc_dt, 0.9)]
  # procedure type
  x[, ProcType := NA_character_]
  x[Category == "BCSP", ProcType := "Colonoscopy"]
  x[spec == "101", ProcType := "Cystoscopy"]
  x[is.na(ProcType) & Category == "IP-NEL", ProcType := rcat(.N, c("OGD", "Flexi Sig", "Colonoscopy"), c(80, 15, 5))]
  x[is.na(ProcType) & Category == "SURV", ProcType := rcat(.N, c("OGD", "Colonoscopy", "Flexi Sig"), c(40, 52, 8))]
  x[is.na(ProcType), ProcType := rcat(.N, c("OGD", "Colonoscopy", "Flexi Sig"), c(48, 34, 18))]
  x[, Urgency := "routine"]
  x[Category == "OP", Urgency := rcat(.N, c("2WW", "urgent", "routine"), c(25, 25, 50))]
  x[Category == "IP-EL", Urgency := rcat(.N, c("urgent", "routine"), c(30, 70))]
  x[Category == "IP-NEL", Urgency := "emergency"]
  x[Category == "BCSP", Urgency := "screening"]
  ind <- list(OGD = c("dyspepsia", "dysphagia", "iron deficiency anaemia", "reflux", "weight loss", "Barrett's surveillance"),
              Colonoscopy = c("PR bleeding", "change in bowel habit", "FIT positive", "iron deficiency anaemia", "polyp surveillance", "IBD assessment"),
              `Flexi Sig` = c("PR bleeding", "change in bowel habit", "IBD assessment"),
              Cystoscopy = c("haematuria", "bladder tumour surveillance", "LUTS"))
  x[, Indication := { v <- ind[[.BY$ProcType]]; sample(v, .N, TRUE) }, by = ProcType]
  x[Category == "IP-NEL" & ProcType == "OGD", Indication := "upper GI bleed inpatient"]
  x[Category == "BCSP", Indication := "FIT positive (screening)"]
  x[Category == "SURV" & ProcType == "Colonoscopy", Indication := "polyp surveillance"]
  x[Category == "SURV" & ProcType == "OGD", Indication := "Barrett's surveillance"]
  x[Category == "SURV" & ProcType == "Cystoscopy", Indication := "bladder tumour surveillance"]
  x[, Points := ifelse(ProcType == "Colonoscopy", 2L, 1L)]
  x[, Outcome := "normal"]
  x[Category %in% c("OP", "SURV", "BCSP"), Outcome := rcat(.N, c("normal", "abnormal with biopsy", "polypectomy", "abandoned", "DNA", "cancelled on the day"), c(43, 34, 12, 2, 5, 4))]
  x[Category %in% c("IP-EL", "IP-NEL"), Outcome := rcat(.N, c("normal", "abnormal with biopsy", "polypectomy", "abandoned"), c(45, 40, 12, 3))]
  x[ProcType %in% c("OGD", "Cystoscopy") & Outcome == "polypectomy", Outcome := "abnormal with biopsy"]
  dur <- function(pt, n) switch(pt, OGD = runif(n, 10, 15), `Flexi Sig` = runif(n, 15, 20), Colonoscopy = runif(n, 30, 45), Cystoscopy = runif(n, 10, 15))
  x[, duration := dur(.BY$ProcType, .N), by = ProcType]
  x[Outcome == "polypectomy", duration := duration + 10]
  x[Outcome == "abandoned", duration := duration * 0.4]
  x[, end_dt := proc_dt + mins(duration)]
  x[Outcome %in% c("DNA", "cancelled on the day"), `:=`(proc_dt_na = TRUE)]
  x[, Sedation := { v <- switch(.BY$ProcType, OGD = c("throat spray", "conscious sedation", "none"), Colonoscopy = c("conscious sedation", "Entonox", "none", "GA"),
                                `Flexi Sig` = c("none", "Entonox", "conscious sedation"), Cystoscopy = c("none", "GA")); w <- switch(.BY$ProcType, OGD = c(60, 35, 5), Colonoscopy = c(55, 35, 8, 2), `Flexi Sig` = c(60, 30, 10), Cystoscopy = c(85, 15)); rcat(.N, v, w) }, by = ProcType]
  x[, Extent := NA_character_]
  x[ProcType == "Colonoscopy", Extent := rcat(.N, c("caecum", "terminal ileum", "hepatic flexure", "splenic flexure", "sigmoid"), c(70, 20, 4, 3, 3))]
  x[ProcType == "Flexi Sig", Extent := rcat(.N, c("splenic flexure", "descending colon", "sigmoid"), c(60, 30, 10))]
  x[, Completion := NA_character_]
  x[ProcType == "Colonoscopy", Completion := ifelse(Extent %in% c("caecum", "terminal ileum"), "Y", "N")]
  x[ProcType == "Flexi Sig", Completion := ifelse(Extent == "splenic flexure", "Y", "N")]
  x[Outcome == "abandoned", `:=`(Completion = ifelse(is.na(Completion), NA_character_, "N"), Extent = ifelse(is.na(Extent), NA_character_, "sigmoid"))]
  x[, Comfort := rcat(.N, 1:5, c(45, 30, 15, 7, 3))]
  x[Outcome %in% c("DNA", "cancelled on the day"), `:=`(Comfort = NA_integer_, Extent = NA_character_, Completion = NA_character_, Sedation = NA_character_)]
  x[, Endoscopist := sprintf("EN%03d", ifelse(site_code == "RZ901", sample.int(28L, .N, TRUE), sample.int(16L, .N, TRUE) + 40L))]
  x[, room := ifelse(site_code == "RZ901", sample.int(3L, .N, TRUE), sample.int(4L, .N, TRUE))]
  x[, ListID := sprintf("%s-%s-R%d-%s", substr(site_code, 5, 5), format(proc_dt, "%Y%m%d"), room, ifelse(as.numeric(format(proc_dt, "%H")) < 13, "AM", "PM"))]
  x[, ListPoints := sum(Points), by = ListID]
  x[, Report := paste0(ProcType, " for ", Indication, ": ", Outcome, ifelse(is.na(Extent), "", paste0(", reached ", Extent)), ".")]
  x <- merge(x, pts[, .(mrn, nhs_number)], by = "mrn", sort = FALSE)
  setorder(x, proc_dt)
  vmsg(verbose, "Endoscopy procedures: ", nrow(x))
  x[, .(ProcID = sprintf("%07d", .I),
        PatientRef = pts$endo_patient_ref[match(mrn, pts$mrn)],
        NHSNo = paste0(substr(nhs_number, 1, 8), " ", substr(nhs_number, 9, 11), " ", substr(nhs_number, 12, 15)),
        HospNo = mrn,
        ProcDate = format(proc_dt, "%d/%m/%Y"),
        StartTime = ifelse(Outcome %in% c("DNA", "cancelled on the day"), NA_character_, format(proc_dt, "%H:%M")),
        EndTime = ifelse(Outcome %in% c("DNA", "cancelled on the day"), NA_character_, format(end_dt, "%H:%M")),
        ProcType, Category, Indication, Urgency, ReferralDate = format(ReferralDate, "%d/%m/%Y"), Endoscopist, ListID, ListPoints, Points,
        Sedation, Extent, Completion, Comfort, Outcome, Site = ifelse(site_code == "RZ901", "Hospital A", "Hospital B"), Report, linked_id)]
}
