#' Reference tables for the fictional trust
#'
#' Sites, wards, specialties, consultants, clinics, exam catalogue and the
#' national code lists the source tables use. Everything here is fictional
#' except the national code values.
#' @param seed integer seed (consultant codes are random)
#' @export
fh_reference <- function(seed = 1L) {
  stage_seed(seed, 1L)
  ref <- list()
  ref$sites <- data.table(site_code = c("RZ901", "RZ902"), site_name = c("Hospital A", "Hospital B"),
                          has_ed = c(TRUE, FALSE), beds = c(1100L, 400L))

  # TFC, name, where it works: ED/IP/DC/OP flags per site, elective share at B
  sp <- fread(text = "
tfc,name,ip_a,dc_a,op_a,ip_b,dc_b,op_b,elective_b_share,emergency_share
180,Emergency Medicine,1,0,0,0,0,0,0,0
300,General Internal Medicine,1,0,1,0,0,0,0,0.30
430,Geriatric Medicine,1,0,1,0,0,1,0,0.14
320,Cardiology,1,1,1,0,0,1,0,0.07
340,Respiratory Medicine,1,0,1,0,0,1,0,0.06
301,Gastroenterology,1,1,1,0,1,1,0.5,0.04
361,Renal Medicine,1,1,1,0,0,0,0,0.02
400,Neurology,1,0,1,0,0,1,0,0.03
100,General Surgery,1,1,1,1,1,1,0.55,0.08
104,Colorectal Surgery,1,1,1,0,1,1,0.5,0.02
107,Vascular Surgery,1,0,1,0,0,0,0,0.01
110,Trauma & Orthopaedics,1,0,1,1,1,1,0.8,0.08
101,Urology,1,1,1,1,1,1,0.7,0.03
130,Ophthalmology,0,0,1,0,1,1,1,0.004
120,ENT,1,0,0,1,1,1,0.9,0.006
502,Gynaecology,1,0,1,0,1,1,0.5,0.03
420,Paediatrics,1,0,1,0,0,0,0,0.09
330,Dermatology,0,0,0,0,0,1,1,0
410,Rheumatology,0,0,1,0,0,1,0.5,0
192,Critical Care Medicine,1,0,0,0,0,0,0,0
")
  sp[, tfc := sprintf("%03d", tfc)]
  ref$specialties <- sp

  # Wards. ward_id is stable; ward_name is the canonical name.
  w <- function(site, names, tfc, beds, kind = "bed") data.table(site_code = site, ward_name = names, tfc = tfc, beds = beds, kind = kind)
  wards <- rbind(
    w("RZ901", c("ED", "UTC", "Childrens ED"), "180", 0L, "location"),
    w("RZ901", "SDEC", "180", 16L),
    w("RZ901", c("AMU 1", "AMU 2"), "300", 40L),
    w("RZ901", "SAU", "100", 20L),
    w("RZ901", c("Ward 1 Cardiology", "CCU"), "320", c(28L, 12L)),
    w("RZ901", c("Ward 2 Respiratory", "Ward 3 Respiratory"), "340", 28L),
    w("RZ901", "Ward 4 Gastro", "301", 26L),
    w("RZ901", "Ward 5 Renal", "361", 24L),
    w("RZ901", "Ward 6 Neurology", "400", 24L),
    w("RZ901", c("Ward 7 Medicine", "Ward 8 Medicine", "Ward 9 Medicine", "Ward 10 Medicine"), "300", 28L),
    w("RZ901", c("Ward 11 Frailty", "Ward 12 Frailty", "Ward 13 Frailty"), "430", 28L),
    w("RZ901", c("Ward 14 Surgery", "Ward 15 Surgery", "Ward 16 Colorectal"), c("100", "100", "104"), 26L),
    w("RZ901", "Ward 17 Vascular", "107", 24L),
    w("RZ901", c("Ward 18 Trauma", "Ward 19 Trauma"), "110", 28L),
    w("RZ901", "Ward 20 Urology Gynae", "101", 24L),
    w("RZ901", "Ward 21 ENT Maxfax", "120", 20L),
    w("RZ901", c("ICU", "HDU"), "192", c(24L, 12L), "critical"),
    w("RZ901", c("Childrens Ward 1", "Childrens Ward 2"), "420", c(24L, 16L)),
    w("RZ901", c("Ward 22 Elective Surgery", "Ward 23 Elective Surgery", "Ward 24 Elective Ortho", "Ward 25 Elective Urology"), c("100", "100", "110", "101"), 26L),
    w("RZ901", c("Escalation Ward 1", "Escalation Ward 2", "Escalation Ward 3"), "300", 24L, "escalation"),
    w("RZ901", "Discharge Lounge", "300", 0L, "location"),
    w("RZ901", "Day Case Unit A", "100", 24L, "daycase"),
    w("RZ901", "Endoscopy Unit A", "301", 12L, "daycase"),
    w("RZ902", c("Day Surgery Unit 1", "Day Surgery Unit 2", "Treatment Unit", "Endoscopy Unit B"), c("100", "110", "101", "301"), c(30L, 30L, 20L, 12L), "daycase"),
    w("RZ902", c("Elective Ortho 1", "Elective Ortho 2", "Elective Ortho 3"), "110", c(32L, 32L, 28L)),
    w("RZ902", c("Ward W1 Surgery", "Ward W2 Urology", "Ward W3 ENT"), c("100", "101", "120"), c(20L, 24L, 20L)),
    w("RZ902", "Eye Unit", "130", 8L, "daycase"),
    w("RZ902", "Endoscopy Recovery", "301", 12L, "daycase")
  )
  wards[, ward_id := sprintf("W%03d", .I)]
  ref$wards <- wards

  # Consultants: ~420, by specialty roughly in proportion to activity.
  cons_n <- c("300"=60,"430"=30,"320"=24,"340"=18,"301"=18,"361"=12,"400"=14,"100"=28,"104"=10,"107"=8,"110"=34,"101"=16,
              "130"=18,"120"=14,"502"=20,"420"=30,"330"=10,"410"=8,"192"=20,"180"=36)
  cons <- data.table(tfc = rep(names(cons_n), cons_n))
  cons[, consultant_code := paste0("C", formatC(sample.int(8999999, .N) + 1000000, width = 7, flag = "0"))]
  cons[, main_site := ifelse(tfc %in% c("130","120","330"), "RZ902", ifelse(runif(.N) < 0.2 & tfc %in% c("110","101","100","104","502","301","410","430","320","340","400"), "RZ902", "RZ901"))]
  ref$consultants <- cons

  # Clinics per specialty/site for outpatients.
  cl <- sp[op_a == 1 | op_b == 1]
  clinics <- rbind(
    cl[op_a == 1, .(site_code = "RZ901", tfc, n = pmax(2L, round(8 * (emergency_share + 0.05) / 0.1)))],
    cl[op_b == 1, .(site_code = "RZ902", tfc, n = pmax(2L, round(6 * (elective_b_share + 0.2))))])
  clinics <- clinics[, .(clinic_code = paste0(substr(site_code, 5, 5), tfc, LETTERS[seq_len(n)])), by = .(site_code, tfc)]
  ref$clinics <- clinics

  # Exam catalogue. room_min/max minutes, slot minutes, share within modality,
  # source weights ED/IP/OP/GP, DM01 countable flag.
  ref$exam_catalogue <- fread(text = "
modality,exam_code,exam_description,body_area,room_min,room_max,slot,share,w_ed,w_ip,w_op,w_gp,dm01
CT,CSKUH,CT Head,Head,5,10,10,0.30,5,3,0.5,0.2,1
CT,CCHEC,CT Chest with contrast,Chest,8,12,15,0.10,0.5,1,2,1,1
CT,CHRC,CT Chest high resolution,Chest,8,12,15,0.02,0,0.2,2,0.5,1
CT,CABPEC,CT Abdomen and pelvis with contrast,Abdomen,12,18,20,0.18,2,2,2,0.8,1
CT,CCHAPC,CT Thorax abdomen pelvis with contrast,Chest abdomen pelvis,15,20,20,0.10,0.2,1,3,0.5,1
CT,CAPUG,CT Angiogram pulmonary,Chest,10,15,15,0.08,3,2,0.1,0,1
CT,CURIT,CT Urinary tract,Abdomen,5,10,10,0.06,3,0.5,0.5,0.2,1
CT,CAICN,CT Angiogram intracranial,Head,12,18,20,0.03,2,1,0.2,0,1
CT,CAAAG,CT Angiogram aorta,Chest abdomen,12,18,20,0.02,1,1,0.5,0,1
CT,CACRY,CT Cardiac angiogram coronary,Heart,20,30,30,0.04,0,0.2,3,0,1
CT,CVCLD,CT Colonography low dose,Abdomen,20,30,30,0.03,0,0.1,2,1,1
CT,CBIOPB,CT Guided biopsy,Various,30,50,45,0.02,0,1,1,0,0
CT,CLSPI,CT Lumbar spine,Spine,8,12,15,0.02,1,0.5,1,0.3,1
MR,MSKUH,MRI Head,Head,20,30,30,0.22,1,2,2,1,1
MR,MLUSP,MRI Lumbar spine,Spine,20,30,30,0.20,0.2,0.5,2,2.5,1
MR,MKNEL,MRI Knee,Knee,20,30,30,0.14,0.1,0.1,2,2.5,1
MR,MSPNW,MRI Spine whole,Spine,40,50,45,0.06,1,2,1,0.2,1
MR,MSHRL,MRI Shoulder Lt,Shoulder,20,30,30,0.05,0,0,2,2,1
MR,MHIPB,MRI Hips,Hip,20,30,30,0.05,0,0.2,2,1.5,1
MR,MMRCP,MRCP,Abdomen,25,40,45,0.05,0.2,2,2,0.3,1
MR,MPROSC,MRI Prostate with contrast,Pelvis,30,40,40,0.07,0,0,3,0.2,1
MR,MPEGY,MRI Pelvis gynaecological,Pelvis,30,45,45,0.05,0,0.2,3,0.3,1
MR,MCARD,MRI Heart,Heart,45,60,60,0.04,0,0.5,3,0,1
MR,MBRSB,MRI Breast,Breast,30,45,45,0.02,0,0,3,0,1
MR,MLIVEC,MRI Liver with contrast,Abdomen,30,40,45,0.05,0,1,2,0.3,1
US,UABDO,US Abdomen,Abdomen,15,20,20,0.18,1,2,2,3,1
US,UABPE,US Abdomen and pelvis,Abdomen,20,25,30,0.08,0.5,1,2,2,1
US,UPELV,US Pelvis,Pelvis,15,25,20,0.08,0.5,0.5,2,2,1
US,UPETV,US Pelvis transvaginal,Pelvis,15,25,20,0.06,0.3,0.2,3,1.5,1
US,UUTR,US Urinary tract,Abdomen,15,20,20,0.10,1,2,2,2,1
US,UTHPY,US Thyroid and parathyroid,Neck,15,20,20,0.04,0,0.2,3,1.5,1
US,UNECK,US Neck,Neck,15,20,20,0.02,0.2,0.5,3,0.5,1
US,UTEST,US Testes,Scrotum,10,15,15,0.03,2,0.5,2,2,1
US,USHRL,US Shoulder Lt,Shoulder,15,20,20,0.05,0,0,2,3,1
US,USLUM,US Soft tissue lump,Soft tissue,15,20,20,0.05,0.2,0.5,2,3,1
US,ULLVL,US Doppler lower limb veins Lt,Lower limb,15,20,20,0.09,5,3,0.2,0.2,0
US,ULIVE,US Liver,Abdomen,15,20,20,0.05,0,1,2,2,1
US,UMAAB,US Breast and axilla,Breast,20,30,30,0.07,0,0.1,4,0.1,1
US,UHIPB,US Hip Both,Hip,10,15,15,0.03,0,0.2,3,0.5,1
US,UABDOB,US Guided biopsy abdomen,Abdomen,30,45,45,0.04,0,2,2,0,0
US,ULAMB,US Doppler artery map lower limb,Lower limb,20,30,30,0.03,0.2,1,2,0.2,0
")

  ref$admission_method <- fread(text = "
code,description,group
11,Waiting list,elective
12,Booked,elective
13,Planned,elective
21,Accident and emergency department of this provider,emergency
22,General practitioner,emergency
23,Bed bureau,emergency
24,Consultant clinic,emergency
28,Other emergency admission,emergency
2B,Transfer of an admitted patient from another hospital provider in an emergency,emergency
2D,Other emergency admission,emergency
81,Transfer of any admitted patient from other hospital provider,other
")
  ref$admission_source <- fread(text = "
code,description
19,Usual place of residence
29,Temporary place of residence
51,NHS other hospital provider ward for general patients
54,Care home
87,Non-NHS run hospital
")
  ref$discharge_destination <- fread(text = "
code,description
19,Usual place of residence
29,Temporary place of residence
51,NHS other hospital provider ward for general patients
54,Care home
79,Not applicable: patient died
85,Non-NHS run care home
87,Non-NHS run hospital
")
  ref$discharge_method <- fread(text = "
code,description
1,Patient discharged on clinical advice or with clinical consent
4,Patient died
6,Patient discharged himself or herself
7,Patient discharged by a relative or advocate
")
  ref$attendance_status <- fread(text = "
code,description
2,Appointment cancelled by or on behalf of the patient
3,Did not attend no advance warning given
4,Appointment cancelled or postponed by the health care provider
5,Seen having attended on time or if late before the care professional was ready
6,Arrived late after the care professional was ready but was seen
7,Did not attend patient arrived late and could not be seen
")
  ref$patient_source_setting <- fread(text = "
code,description
01,Admitted Patient Care - Inpatient
02,Admitted Patient Care - Day case
03,Out-patient
04,GP Direct Access
05,Accident and Emergency Department
06,Other Health Care Provider
07,Other
")
  ref$ecds_codes <- fread(system.file("extdata", "ecds_codes.csv", package = "fakehosp"), colClasses = "character")
  ref
}

# Chief complaints: a weighted subset of the ECDS refset with admission propensity and specialty hints.
chief_complaints <- function(ref) {
  cc <- ref$ecds_codes[code_set == "chief_complaint"]
  pick <- fread(text = "
pattern,w,adm,spec
^Chest pain,9,0.45,320
^Shortness of breath,7,0.55,340
^Abdominal pain,8,0.35,100
^Fall,6,0.5,430
^Head injury,4,0.1,300
^Limb injury,7,0.1,110
^Fever,3,0.4,300
^Collapse,2,0.6,300
^Palpitations,2,0.3,320
^Headache,3,0.2,400
^Back pain,2,0.1,110
^Vomiting,3,0.3,300
^Mental health,2,0.15,300
^Rash,1,0.05,330
^Urinary,2,0.3,101
^Wound,3,0.05,100
^Dizziness,2,0.3,300
^Confusion,2,0.7,430
^Seizure,1,0.5,400
^Gastrointestinal bleeding,1,0.8,301
^Diabetes,1,0.5,300
^Sore throat,2,0.05,120
^Eye,2,0.02,130
^Vaginal bleeding,1,0.2,502
^Testicular,1,0.2,101
^Allergic,1,0.1,300
^Alcohol,1,0.3,300
^Self harm,1,0.4,300
^Breathing difficulty,1,0.6,420
^Minor,3,0.02,180
")
  out <- rbindlist(lapply(seq_len(nrow(pick)), function(i) {
    m <- cc[grepl(pick$pattern[i], description, ignore.case = TRUE)][1]
    if (is.na(m$description)) m <- data.table(code_set = "chief_complaint", group = NA, description = sub("^\\^", "", pick$pattern[i]), snomed_code = NA_character_)
    data.table(chief_complaint = m$description, snomed_code = m$snomed_code, w = pick$w[i], adm = pick$adm[i], spec = sprintf("%03d", pick$spec[i]))
  }))
  out
}
