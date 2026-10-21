-- Master patient index.
-- One person can appear under several hospital numbers: duplicates later
-- merged by an A40 (prior_mrn -> mrn) and duplicates never merged, which the
-- MPI links on NHS number, date of birth and sex where the NHS number is present.
CREATE OR REPLACE TABLE derived.mrn_map AS
WITH merges AS (
  SELECT prior_mrn AS mrn, mrn AS target FROM l1.pas_adt_events WHERE event_type = 'A40' AND prior_mrn IS NOT NULL),
base AS (
  SELECT p.mrn, COALESCE(m.target, p.mrn) AS after_merge, p.nhs_number, p.dob, p.sex
  FROM l1.pas_patients p LEFT JOIN merges m ON m.mrn = p.mrn),
-- link unmerged duplicates: same NHS number, dob and sex -> the smallest surviving mrn
link AS (
  SELECT b.mrn, b.after_merge,
         CASE WHEN b.nhs_number IS NOT NULL
              THEN min(b.after_merge) OVER (PARTITION BY b.nhs_number, b.dob, b.sex)
              ELSE b.after_merge END AS person_mrn
  FROM base b)
SELECT mrn, after_merge, person_mrn,
       mrn <> person_mrn AS is_alias,
       mrn <> after_merge AS merged_by_a40
FROM link;

CREATE OR REPLACE TABLE derived.patients AS
SELECT m.person_mrn AS person_id,
       m.person_mrn AS mrn,
       max(p.nhs_number) AS nhs_number,
       max(p.sex) AS sex, max(p.dob) AS dob, max(p.ethnicity) AS ethnicity, max(p.gp_practice) AS gp_practice,
       max(p.postcode) AS postcode, min(p.registered_datetime) AS registered_datetime, max(p.date_of_death) AS date_of_death,
       count(*) AS n_mrns, list(p.mrn) AS all_mrns
FROM l1.pas_patients p JOIN derived.mrn_map m ON m.mrn = p.mrn
GROUP BY m.person_mrn;

-- Identifiers held by the departmental systems, mapped to the person.
CREATE OR REPLACE TABLE derived.patient_identifiers AS
SELECT DISTINCT person_id, 'PAS' AS source, m.mrn AS identifier FROM derived.mrn_map m JOIN derived.patients p ON p.person_id = m.person_mrn
UNION ALL
SELECT DISTINCT m.person_mrn, 'ED', e.local_patient_identifier FROM l1.ed_attendances e JOIN derived.mrn_map m ON m.mrn = e.mrn WHERE e.mrn IS NOT NULL
UNION ALL
SELECT DISTINCT m.person_mrn, 'RIS', CAST(r.ris_patient_id AS VARCHAR) FROM l1.ris_imaging r JOIN derived.mrn_map m ON m.mrn = r.mrn WHERE r.mrn IS NOT NULL
UNION ALL
SELECT DISTINCT m.person_mrn, 'ENDO', e.PatientRef FROM l1.endo_procedures e JOIN derived.mrn_map m ON m.mrn = e.HospNo WHERE e.HospNo IS NOT NULL;

-- Resolve a person from any system's identifier or NHS number.
CREATE OR REPLACE MACRO person_from_mrn(x) AS (SELECT person_mrn FROM derived.mrn_map WHERE mrn = x);
