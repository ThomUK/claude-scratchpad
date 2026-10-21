-- DID statistics shape: activity and median waits by modality and source setting.
CREATE OR REPLACE TABLE agg.did_monthly AS
SELECT date_trunc('month', scan_start_datetime)::DATE AS month, modality, source_setting,
       count(*) AS exams,
       median(request_to_test_days) AS median_request_to_test_days,
       median(test_to_report_days) AS median_test_to_report_days,
       round(100.0 * count(*) FILTER (WHERE test_to_report_days = 0) / NULLIF(count(*) FILTER (WHERE NOT report_date_missing), 0), 1) AS pct_reported_same_day,
       round(100.0 * count(*) FILTER (WHERE report_date_missing) / count(*), 1) AS pct_report_date_missing
FROM derived.imaging_exams
WHERE scan_start_datetime BETWEEN TIMESTAMP '2023-04-01' AND TIMESTAMP '2026-03-31 23:59:59'
GROUP BY ALL ORDER BY 1, 2, 3;
