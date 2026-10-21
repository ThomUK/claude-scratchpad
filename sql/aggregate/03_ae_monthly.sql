-- The monthly A&E return shape: attendances, four-hour performance, admissions via ED, waits from decision to admit.
CREATE OR REPLACE TABLE agg.ae_monthly AS
SELECT date_trunc('month', arrival)::DATE AS month, sitetret AS site_code,
       CASE WHEN uec_activity_type = 'UTC' THEN 'Type 3' ELSE 'Type 1' END AS department_type,
       count(*) AS attendances,
       count(*) FILTER (WHERE within_4h) AS within_4h,
       count(*) FILTER (WHERE NOT within_4h) AS over_4h,
       round(100.0 * count(*) FILTER (WHERE within_4h) / count(*), 1) AS pct_within_4h,
       count(*) FILTER (WHERE admitted) AS emergency_admissions_via_ed,
       count(*) FILTER (WHERE dta_to_departure_minutes > 240) AS dta_to_admission_over_4h,
       count(*) FILTER (WHERE dta_to_departure_minutes > 720) AS dta_to_admission_over_12h,
       round(median(minutes_in_department)) AS median_minutes_in_department
FROM derived.ed_attendances
WHERE arrival BETWEEN TIMESTAMP '2023-04-01' AND TIMESTAMP '2026-03-31 23:59:59'
GROUP BY ALL ORDER BY 1, 2, 3;
