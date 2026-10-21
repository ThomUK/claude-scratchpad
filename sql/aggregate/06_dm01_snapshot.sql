-- DM01: at each month end, patients waiting by weeks band (planned and
-- unscheduled excluded), and activity in the month in its three columns.
CREATE OR REPLACE TABLE agg.dm01_snapshot AS
WITH months AS (SELECT (CAST(d AS DATE) + INTERVAL 1 MONTH - INTERVAL 1 DAY)::DATE AS month_end FROM range(DATE '2023-04-01', DATE '2026-04-01', INTERVAL 1 MONTH) t(d)),
img AS (
  SELECT CASE modality WHEN 'CT' THEN 'Computed Tomography' WHEN 'MR' THEN 'Magnetic Resonance Imaging' ELSE 'Non-obstetric Ultrasound' END AS test,
         CAST(COALESCE(request_datetime, request_received_datetime) AS DATE) AS clock_start, CAST(scan_start_datetime AS DATE) AS test_date,
         CASE WHEN planned THEN 'planned' WHEN inpatient_or_ae THEN 'unscheduled' ELSE 'waiting list' END AS dm01_category
  FROM derived.imaging_exams WHERE dm01_countable = 1 AND modality IN ('CT', 'MR', 'US')),
-- waiting: performed exams between request and test (a DNA resets the clock, so the rebooked row carries the wait)
img_waiting AS (
  SELECT test, clock_start, test_date FROM img WHERE dm01_category = 'waiting list'),
endo AS (
  SELECT CASE proc_type WHEN 'OGD' THEN 'Gastroscopy' WHEN 'Flexi Sig' THEN 'Flexi Sigmoidoscopy' ELSE proc_type END AS test,
         referral_date AS clock_start, proc_date AS test_date, dm01_category
  FROM derived.endoscopy_procedures WHERE performed AND dm01_category <> 'screening (not DM01)'),
endo_waiting AS (SELECT test, clock_start, test_date FROM endo WHERE dm01_category = 'waiting list'),
waiting AS (SELECT * FROM img_waiting UNION ALL SELECT * FROM endo_waiting),
activity AS (SELECT test, test_date, dm01_category FROM img UNION ALL SELECT test, test_date, dm01_category FROM endo),
wl AS (
  SELECT m.month_end, w.test,
         count(*) AS total_waiting,
         count(*) FILTER (WHERE date_diff('day', w.clock_start, m.month_end) >= 42) AS waiting_6_plus_weeks,
         count(*) FILTER (WHERE date_diff('day', w.clock_start, m.month_end) >= 91) AS waiting_13_plus_weeks,
         count(*) FILTER (WHERE date_diff('day', w.clock_start, m.month_end) < 7) AS wk_0_1,
         count(*) FILTER (WHERE date_diff('day', w.clock_start, m.month_end) BETWEEN 7 AND 13) AS wk_1_2,
         count(*) FILTER (WHERE date_diff('day', w.clock_start, m.month_end) BETWEEN 14 AND 20) AS wk_2_3,
         count(*) FILTER (WHERE date_diff('day', w.clock_start, m.month_end) BETWEEN 21 AND 27) AS wk_3_4,
         count(*) FILTER (WHERE date_diff('day', w.clock_start, m.month_end) BETWEEN 28 AND 34) AS wk_4_5,
         count(*) FILTER (WHERE date_diff('day', w.clock_start, m.month_end) BETWEEN 35 AND 41) AS wk_5_6,
         count(*) FILTER (WHERE date_diff('day', w.clock_start, m.month_end) BETWEEN 42 AND 90) AS wk_6_13,
         count(*) FILTER (WHERE date_diff('day', w.clock_start, m.month_end) >= 91) AS wk_13_plus
  FROM months m JOIN waiting w ON w.clock_start <= m.month_end AND (w.test_date IS NULL OR w.test_date > m.month_end)
  GROUP BY ALL),
act AS (
  SELECT (date_trunc('month', test_date) + INTERVAL 1 MONTH - INTERVAL 1 DAY)::DATE AS month_end, test,
         count(*) FILTER (WHERE dm01_category = 'waiting list') AS activity_waiting_list,
         count(*) FILTER (WHERE dm01_category = 'planned') AS activity_planned,
         count(*) FILTER (WHERE dm01_category = 'unscheduled') AS activity_unscheduled
  FROM activity GROUP BY ALL)
SELECT COALESCE(wl.month_end, act.month_end) AS month_end, COALESCE(wl.test, act.test) AS test,
       total_waiting, waiting_6_plus_weeks, waiting_13_plus_weeks, round(100.0 * waiting_6_plus_weeks / NULLIF(total_waiting, 0), 1) AS pct_6_plus_weeks,
       wk_0_1, wk_1_2, wk_2_3, wk_3_4, wk_4_5, wk_5_6, wk_6_13, wk_13_plus,
       activity_waiting_list, activity_planned, activity_unscheduled
FROM wl FULL JOIN act ON wl.month_end = act.month_end AND wl.test = act.test
WHERE COALESCE(wl.month_end, act.month_end) BETWEEN DATE '2023-04-30' AND DATE '2026-03-31'
ORDER BY 1, 2;
