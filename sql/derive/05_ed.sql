-- ED attendances with the first time each status was reached (from the
-- tracking-board log) rather than the last-written value, the known
-- two-minute clock offset removed, the person resolved through the MPI, and
-- the admission spell attached.
CREATE OR REPLACE TABLE derived.ed_attendances AS
WITH firsts AS (
  SELECT uec_activity_identifier,
         min(CASE WHEN status = 'arrived' THEN recorded_datetime END) AS t_arrived,
         min(CASE WHEN status = 'triaged' THEN recorded_datetime END) AS t_triaged,
         min(CASE WHEN status = 'seen' THEN recorded_datetime END) AS t_seen,
         min(CASE WHEN status = 'decision to admit' THEN recorded_datetime END) AS t_dta_first,
         max(CASE WHEN status = 'decision to admit' THEN recorded_datetime END) AS t_dta_last,
         min(CASE WHEN status = 'departed' THEN recorded_datetime END) AS t_departed_first,
         max(CASE WHEN status = 'departed' THEN recorded_datetime END) AS t_departed_last,
         count(*) AS n_log_rows,
         count(*) FILTER (WHERE status IN ('re-opened', 'decision to admit removed')) AS n_reversals
  FROM l1.ed_status_log GROUP BY uec_activity_identifier),
base AS (
  SELECT e.*, f.*,
         COALESCE(m.person_mrn, p.person_id) AS person_id
  FROM l1.ed_attendances e
  LEFT JOIN firsts f USING (uec_activity_identifier)
  LEFT JOIN derived.mrn_map m ON m.mrn = e.mrn
  LEFT JOIN derived.patients p ON e.mrn IS NULL AND p.nhs_number = nhs_norm(e.nhs_number))
SELECT base.uec_activity_identifier AS aekey, base.person_id, base.mrn AS mrn_as_recorded, base.local_patient_identifier, base.site_of_treatment AS sitetret,
       base.uec_activity_type, base.arrival_mode, base.attendance_category, base.attendance_source, base.acuity, base.chief_complaint,
       base.activity_start_datetime - INTERVAL 2 MINUTE AS arrival,
       base.t_triaged - INTERVAL 2 MINUTE AS triage,
       base.t_seen - INTERVAL 2 MINUTE AS seen,
       base.t_dta_first - INTERVAL 2 MINUTE AS decision_to_admit_first,
       base.t_dta_last - INTERVAL 2 MINUTE AS decision_to_admit_last,
       base.t_departed_first - INTERVAL 2 MINUTE AS departure_first,
       base.activity_end_timestamp - INTERVAL 2 MINUTE AS departure_recorded,
       base.discharge_status, base.discharge_destination, base.tfc_decision_to_admit,
       base.decided_to_admit_datetime IS NOT NULL AS admitted,
       date_diff('minute', base.activity_start_datetime, base.activity_end_timestamp) AS minutes_in_department,
       date_diff('minute', base.activity_start_datetime, base.activity_end_timestamp) <= 240 AS within_4h,
       CASE WHEN base.decided_to_admit_datetime IS NOT NULL THEN date_diff('minute', base.decided_to_admit_datetime, base.activity_end_timestamp) END AS dta_to_departure_minutes,
       base.n_reversals > 0 AS bounced,
       s.provspno
FROM base
LEFT JOIN derived.spells s ON s.person_id = base.person_id AND s.admimeth = '21'
      AND s.admidate >= base.activity_start_datetime - INTERVAL 1 HOUR AND s.admidate <= base.activity_end_timestamp + INTERVAL 12 HOUR
QUALIFY row_number() OVER (PARTITION BY base.uec_activity_identifier ORDER BY s.admidate) = 1;
