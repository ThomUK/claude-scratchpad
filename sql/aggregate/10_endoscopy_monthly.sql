-- Endoscopy activity by procedure, category and month, with points and completion.
CREATE OR REPLACE TABLE agg.endoscopy_monthly AS
SELECT date_trunc('month', proc_date)::DATE AS month, site_code, proc_type, category, dm01_category,
       count(*) AS procedures,
       count(*) FILTER (WHERE performed) AS performed,
       sum(points) FILTER (WHERE performed) AS points,
       round(100.0 * count(*) FILTER (WHERE completion = 'Y') / NULLIF(count(*) FILTER (WHERE completion IS NOT NULL), 0), 1) AS completion_rate_pct,
       count(*) FILTER (WHERE outcome = 'DNA') AS dnas,
       median(referral_to_procedure_days) AS median_referral_to_procedure_days
FROM derived.endoscopy_procedures
WHERE proc_date BETWEEN DATE '2023-04-01' AND DATE '2026-03-31'
GROUP BY ALL ORDER BY 1, 2, 3, 4;
