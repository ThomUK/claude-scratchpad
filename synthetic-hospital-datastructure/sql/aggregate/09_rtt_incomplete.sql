-- RTT incomplete pathways at each month end by specialty: weeks-waiting profile, median, 18 and 52 week shares.
CREATE OR REPLACE TABLE agg.rtt_incomplete AS
WITH months AS (SELECT (CAST(d AS DATE) + INTERVAL 1 MONTH - INTERVAL 1 DAY)::DATE AS month_end FROM range(DATE '2023-04-01', DATE '2026-04-01', INTERVAL 1 MONTH) t(d)),
open_paths AS (
  SELECT m.month_end, r.tretspef, date_diff('day', r.rttperstart, m.month_end) / 7.0 AS weeks
  FROM months m JOIN derived.rtt_pathways r ON r.rttperstart <= m.month_end AND (r.rttperend IS NULL OR r.rttperend > m.month_end))
SELECT month_end, tretspef,
       count(*) AS incomplete_pathways,
       round(median(weeks), 1) AS median_weeks,
       round(quantile_cont(weeks, 0.92), 1) AS p92_weeks,
       count(*) FILTER (WHERE weeks < 18) AS within_18_weeks,
       round(100.0 * count(*) FILTER (WHERE weeks < 18) / count(*), 1) AS pct_within_18_weeks,
       count(*) FILTER (WHERE weeks >= 52) AS over_52_weeks,
       count(*) FILTER (WHERE weeks >= 65) AS over_65_weeks
FROM open_paths GROUP BY ALL ORDER BY 1, 2;
