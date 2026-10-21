-- RTT pathways: one per referral with a pathway id. The clock stop is the
-- referral's recorded end date; the first attended appointment and the
-- elective admission are attached so a validator can compare.
CREATE OR REPLACE TABLE derived.rtt_pathways AS
WITH first_att AS (
  SELECT referral_id, min(apptdate) AS first_attended FROM derived.op_appointments WHERE attended_flag AND firstatt IN ('1','3') GROUP BY referral_id),
any_appt AS (SELECT referral_id, count(*) AS n_appointments, max(apptdate) AS last_appointment FROM derived.op_appointments GROUP BY referral_id)
SELECT r.rtt_pathway_id, r.referral_id, m.person_mrn AS person_id, r.specialty_code AS tretspef, r.priority, r.referral_source AS refsourc,
       r.referral_received_date AS reqdate, r.rtt_period_start_date AS rttperstart, r.rtt_period_end_date AS rttperend, r.rtt_period_status AS rttperstat,
       r.rtt_period_end_date IS NULL AS incomplete,
       f.first_attended, a.n_appointments, a.last_appointment,
       date_diff('day', r.rtt_period_start_date, COALESCE(r.rtt_period_end_date, DATE '2026-03-31')) / 7.0 AS weeks_waited
FROM l1.pas_referrals r
LEFT JOIN derived.mrn_map m ON m.mrn = r.mrn
LEFT JOIN first_att f USING (referral_id)
LEFT JOIN any_appt a USING (referral_id)
WHERE r.rtt_pathway_id IS NOT NULL;
