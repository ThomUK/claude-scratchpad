-- HES admitted patient care activity shape: spells, episodes, bed days and length of stay by specialty and admission group.
CREATE OR REPLACE TABLE agg.apc_monthly AS
WITH fce AS (SELECT provspno, count(*) AS n_fce FROM derived.episodes GROUP BY provspno)
SELECT date_trunc('month', s.admidate)::DATE AS month, s.sitetret AS site_code, s.tretspef_first AS tretspef, s.admission_group,
       count(*) AS spells,
       sum(COALESCE(f.n_fce, 1)) AS fces,
       count(*) FILTER (WHERE s.day_case) AS day_cases,
       count(*) FILTER (WHERE s.died) AS deaths,
       sum(s.speldur) FILTER (WHERE NOT s.day_case) AS bed_days,
       round(avg(s.speldur) FILTER (WHERE NOT s.day_case), 2) AS mean_los,
       median(s.speldur) FILTER (WHERE NOT s.day_case) AS median_los,
       round(avg(date_diff('day', s.elecdate, CAST(s.admidate AS DATE))) FILTER (WHERE NOT s.emergency), 1) AS mean_elective_wait_days,
       count(*) FILTER (WHERE s.open_spell) AS unfinished
FROM derived.spells s LEFT JOIN fce f USING (provspno)
WHERE s.admidate BETWEEN TIMESTAMP '2023-04-01' AND TIMESTAMP '2026-03-31 23:59:59'
GROUP BY ALL ORDER BY 1, 2, 3, 4;
