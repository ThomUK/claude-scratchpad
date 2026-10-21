-- HES outpatient activity shape.
CREATE OR REPLACE TABLE agg.op_monthly AS
SELECT date_trunc('month', apptdate)::DATE AS month, sitetret AS site_code, tretspef,
       count(*) FILTER (WHERE attended_flag AND firstatt IN ('1','3')) AS first_attendances,
       count(*) FILTER (WHERE attended_flag AND firstatt IN ('2','4')) AS follow_up_attendances,
       count(*) FILTER (WHERE attended_flag AND telephone) AS telephone_attendances,
       count(*) FILTER (WHERE attended IN ('3','7')) AS dnas,
       count(*) FILTER (WHERE attended = '2') AS patient_cancellations,
       count(*) FILTER (WHERE attended = '4') AS hospital_cancellations,
       round(100.0 * count(*) FILTER (WHERE attended IN ('3','7')) / NULLIF(count(*) FILTER (WHERE attended IN ('3','7','5','6')), 0), 1) AS dna_rate_pct,
       median(waiting) FILTER (WHERE attended_flag AND firstatt IN ('1','3') AND refsourc_gp) AS median_wait_gp_first_days
FROM (SELECT o.*, r.referral_source = '03' AS refsourc_gp FROM derived.op_appointments o LEFT JOIN l1.pas_referrals r USING (referral_id))
WHERE apptdate BETWEEN TIMESTAMP '2023-04-01' AND TIMESTAMP '2026-03-31 23:59:59'
GROUP BY ALL ORDER BY 1, 2, 3;
