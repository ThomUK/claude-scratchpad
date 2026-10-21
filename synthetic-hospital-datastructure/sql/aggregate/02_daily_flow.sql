-- Admissions, discharges, deaths and ward transfers by site, specialty and day.
CREATE OR REPLACE TABLE agg.daily_flow AS
WITH adm AS (SELECT CAST(admidate AS DATE) AS d, sitetret AS site_code, tretspef_first AS tretspef, count(*) AS admissions, count(*) FILTER (WHERE emergency) AS emergency_admissions, count(*) FILTER (WHERE day_case) AS day_cases FROM derived.spells GROUP BY ALL),
dis AS (SELECT CAST(disdate AS DATE) AS d, sitetret AS site_code, tretspef_last AS tretspef, count(*) AS discharges, count(*) FILTER (WHERE died) AS deaths FROM derived.spells WHERE disdate IS NOT NULL GROUP BY ALL),
mv AS (SELECT CAST(w.stay_start AS DATE) AS d, w.site_code, s.tretspef_last AS tretspef, count(*) AS transfers_in FROM derived.ward_stays w JOIN derived.spells s USING (provspno) WHERE w.stay_seq > 1 GROUP BY ALL)
SELECT COALESCE(adm.d, dis.d, mv.d) AS flow_date, COALESCE(adm.site_code, dis.site_code, mv.site_code) AS site_code, COALESCE(adm.tretspef, dis.tretspef, mv.tretspef) AS tretspef,
       COALESCE(admissions, 0) AS admissions, COALESCE(emergency_admissions, 0) AS emergency_admissions, COALESCE(day_cases, 0) AS day_cases,
       COALESCE(discharges, 0) AS discharges, COALESCE(deaths, 0) AS deaths, COALESCE(transfers_in, 0) AS ward_transfers
FROM adm FULL JOIN dis ON adm.d = dis.d AND adm.site_code = dis.site_code AND adm.tretspef = dis.tretspef
FULL JOIN mv ON COALESCE(adm.d, dis.d) = mv.d AND COALESCE(adm.site_code, dis.site_code) = mv.site_code AND COALESCE(adm.tretspef, dis.tretspef) = mv.tretspef
WHERE COALESCE(adm.d, dis.d, mv.d) BETWEEN DATE '2023-04-01' AND DATE '2026-03-31'
ORDER BY 1, 2, 3;
