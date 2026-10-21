# Population: patients with demographics, identifiers and an activity weight.

generate_patients <- function(n, seed, start, end) {
  stage_seed(seed, 2L)
  mid <- as.Date(start) + as.numeric(as.Date(end) - as.Date(start)) / 2
  bands <- data.table(lo = c(0,5,15,25,35,45,55,65,75,85), hi = c(4,14,24,34,44,54,64,74,84,99),
                      w  = c(6,9,10,13,12,12,12,11,10,5),
                      act = c(1.3,0.6,0.8,0.9,1.0,1.1,1.4,1.7,2.4,3.2))
  b <- wsample(n, bands$w)
  age <- bands$lo[b] + runif(n) * (bands$hi[b] - bands$lo[b] + 1)
  dob <- mid - age * 365.25
  sex <- rcat(n, c("1", "2"), c(48, 52))                    # NHS gender code: 1 male, 2 female
  eth <- rcat(n, c("A","B","C","D","E","F","G","H","J","K","L","M","N","P","R","S","Z"),
              c(78,1.2,3,0.8,0.5,0.4,0.3,2.5,1.5,0.8,0.6,0.6,1.5,0.6,0.4,1.5,6))
  gp <- sprintf("F%05d", sample.int(90L, n, replace = TRUE) + 80000L)
  pc <- paste0("FK", sample.int(9L, n, TRUE), " ", sample.int(9L, n, TRUE), sample(LETTERS, n, TRUE), sample(LETTERS, n, TRUE))
  pts <- data.table(
    mrn = sprintf("T%07d", sample.int(9000000L, n) + 999999L),
    nhs_number = nhs_number_fake(n),
    sex = sex, dob = as.Date(dob), ethnicity = eth, gp_practice = gp, postcode = pc,
    age_mid = floor(age),
    activity_weight = bands$act[b] * rgamma(n, shape = 0.8, rate = 0.8),
    ed_patient_id = sprintf("E%08d", sample.int(90000000L, n) + 9999999L),
    ris_patient_id = sample.int(9000000L, n) + 999999L,
    endo_patient_ref = sprintf("EN-%06d", sample.int(900000L, n) + 99999L),
    registered_datetime = as_dt(as.Date(start) - rln(n, 1500, 1) ),
    date_of_death = as.Date(NA)
  )
  setkey(pts, mrn)
  pts
}

# Sample n patients from a pool (data.table with mrn and activity_weight),
# optionally restricted by predicate, with replacement.
pick_patients <- function(pts, n, cond = NULL) {
  pool <- if (is.null(cond)) pts else pts[cond]
  if (nrow(pool) == 0L) pool <- pts
  pool$mrn[wsample(n, pool$activity_weight)]
}

age_at <- function(dob, when) floor(as.numeric(as.Date(when) - dob) / 365.25)
