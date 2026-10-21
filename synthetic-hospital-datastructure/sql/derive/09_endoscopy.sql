-- Endoscopy procedures from the vendor export: text dates parsed (with the
-- month/day swap detected where the day field exceeds 12), NHS numbers and
-- site names normalised, the person resolved, the admission attached by
-- person and date, and the DM01 category assigned.
CREATE OR REPLACE TABLE derived.endoscopy_procedures AS
WITH parsed AS (
  SELECT e.*,
         CASE WHEN CAST(split_part(ProcDate, '/', 1) AS INTEGER) > 12 THEN strptime(ProcDate, '%d/%m/%Y')
              WHEN CAST(split_part(ProcDate, '/', 2) AS INTEGER) > 12 THEN strptime(ProcDate, '%m/%d/%Y')
              ELSE strptime(ProcDate, '%d/%m/%Y') END::DATE AS proc_date,
         TRY_CAST(strptime(ReferralDate, '%d/%m/%Y') AS DATE) AS referral_date,
         nhs_norm(NHSNo) AS nhs_number,
         CASE WHEN upper(Site) IN ('HA', 'HOSP A', 'HOSPITAL A') THEN 'RZ901' WHEN upper(Site) IN ('HB', 'HOSP B', 'HOSPITAL B') THEN 'RZ902' END AS site_code
  FROM l1.endo_procedures e),
person AS (
  SELECT p.*, COALESCE(m.person_mrn, pt.person_id) AS person_id
  FROM parsed p LEFT JOIN derived.mrn_map m ON m.mrn = p.HospNo
  LEFT JOIN derived.patients pt ON p.HospNo IS NULL AND pt.nhs_number = p.nhs_number),
dedup AS (
  SELECT *, row_number() OVER (PARTITION BY person_id, proc_date, ProcType, StartTime ORDER BY ProcID) AS dup_rank FROM person),
linked AS (
  SELECT d.*, s.provspno
  FROM dedup d
  LEFT JOIN derived.spells s ON s.person_id = d.person_id AND CAST(s.admidate AS DATE) <= d.proc_date AND (s.disdate IS NULL OR CAST(s.disdate AS DATE) >= d.proc_date)
  WHERE d.dup_rank = 1
  QUALIFY row_number() OVER (PARTITION BY d.ProcID ORDER BY s.admidate DESC) = 1)
SELECT l.ProcID AS proc_id, l.person_id, l.HospNo AS mrn_as_recorded, l.PatientRef AS vendor_patient_ref, l.nhs_number, l.proc_date, l.referral_date,
       CASE WHEN l.StartTime IS NOT NULL THEN l.proc_date + CAST(l.StartTime || ':00' AS TIME) END AS start_datetime,
       l.ProcType AS proc_type, l.Category AS category, l.Indication AS indication, l.Urgency AS urgency, l.Endoscopist AS endoscopist,
       l.ListID AS list_id, l.ListPoints AS list_points, l.Points AS points, l.Sedation AS sedation, l.Extent AS extent, l.Completion AS completion,
       l.Comfort AS comfort, l.Outcome AS outcome, l.site_code, l.provspno,
       s.emergency AS linked_spell_emergency,
       l.Outcome NOT IN ('DNA', 'cancelled on the day') AS performed,
       CASE WHEN l.Category = 'BCSP' THEN 'screening (not DM01)'
            WHEN l.Category = 'SURV' THEN 'planned'
            WHEN l.Category = 'IP-NEL' OR s.emergency THEN 'unscheduled'
            ELSE 'waiting list' END AS dm01_category,
       date_diff('day', l.referral_date, l.proc_date) AS referral_to_procedure_days
FROM linked l LEFT JOIN derived.spells s ON s.provspno = l.provspno;
