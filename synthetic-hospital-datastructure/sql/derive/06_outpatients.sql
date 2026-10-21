-- Outpatient appointments with HES-style derivations. The status the table
-- holds is the last value written; the audit trail gives how many times it
-- changed and whether it bounced (three or more writes inside ten minutes).
CREATE OR REPLACE TABLE derived.op_appointments AS
WITH logs AS (
  SELECT appointment_id,
         count(*) FILTER (WHERE field = 'attendance_status') AS n_status_writes,
         count(*) FILTER (WHERE field = 'outcome') AS n_outcome_writes,
         min(CASE WHEN new_value = 'arrived' THEN recorded_datetime END) AS t_arrived,
         min(CASE WHEN new_value IN ('5', '6') THEN recorded_datetime END) AS t_seen,
         max(recorded_datetime) - min(recorded_datetime) AS span
  FROM l1.pas_op_status_log l GROUP BY appointment_id),
bounce AS (
  SELECT appointment_id, count(*) AS n_in_window
  FROM (SELECT appointment_id, recorded_datetime,
               count(*) OVER (PARTITION BY appointment_id ORDER BY recorded_datetime RANGE BETWEEN INTERVAL 10 MINUTE PRECEDING AND CURRENT ROW) AS c
        FROM l1.pas_op_status_log WHERE field = 'attendance_status' AND new_value <> 'booked')
  WHERE c >= 3 GROUP BY appointment_id)
SELECT a.appointment_id AS attendkey, m.person_mrn AS person_id, a.mrn AS mrn_as_recorded, a.referral_id, a.site_code AS sitetret, a.clinic_code,
       a.specialty_code AS tretspef, a.consultant_code, a.appointment_datetime AS apptdate, a.first_attendance AS firstatt, a.attendance_status AS attended,
       a.outcome, a.priority, a.booked_datetime, a.cancelled_datetime, a.dna_date AS dnadate, a.staff_type AS stafftyp,
       CASE WHEN a.attendance_status IN ('5','6') AND a.first_attendance IN ('1','3') THEN '1'
            WHEN a.attendance_status IN ('5','6') THEN '2'
            WHEN a.attendance_status IN ('3','7') AND a.first_attendance IN ('1','3') THEN '4'
            WHEN a.attendance_status IN ('3','7') THEN '5'
            WHEN a.attendance_status = '2' AND a.first_attendance IN ('1','3') THEN '7'
            WHEN a.attendance_status = '2' THEN '8'
            WHEN a.attendance_status = '4' AND a.first_attendance IN ('1','3') THEN '10'
            WHEN a.attendance_status = '4' THEN '11' END AS atentype,
       a.attendance_status IN ('5','6') AS attended_flag,
       a.first_attendance IN ('3','4') AS telephone,
       r.referral_received_date AS reqdate,
       date_diff('day', r.referral_received_date, CAST(a.appointment_datetime AS DATE)) AS waiting,
       l.n_status_writes, l.n_outcome_writes, l.t_arrived, l.t_seen,
       b.appointment_id IS NOT NULL AS status_bounced,
       l.t_seen IS NOT NULL AND l.t_arrived IS NOT NULL AND date_diff('minute', l.t_arrived, l.t_seen) = 0 AS batch_closed
FROM l1.pas_outpatient_appointments a
LEFT JOIN derived.mrn_map m ON m.mrn = a.mrn
LEFT JOIN l1.pas_referrals r USING (referral_id)
LEFT JOIN logs l USING (appointment_id)
LEFT JOIN bounce b USING (appointment_id);
