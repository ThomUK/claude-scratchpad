-- Beds occupied at midnight, by ward and day. A stay counts if it spans 00:00.
CREATE OR REPLACE TABLE agg.midnight_census AS
WITH days AS (SELECT CAST(d AS DATE) AS census_date FROM range(DATE '2023-04-01', DATE '2026-04-01', INTERVAL 1 DAY) t(d)),
stays AS (SELECT ward, ward_id, site_code, kind, stay_start, COALESCE(stay_end, TIMESTAMP '2026-04-01') AS stay_end FROM derived.ward_stays WHERE kind IN ('bed', 'critical', 'escalation', 'daycase'))
SELECT d.census_date, s.site_code, s.ward, s.ward_id, count(*) AS beds_occupied
FROM days d JOIN stays s ON s.stay_start < d.census_date::TIMESTAMP AND s.stay_end >= d.census_date::TIMESTAMP
GROUP BY ALL ORDER BY census_date, site_code, ward;
