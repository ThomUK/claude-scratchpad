-- Ward stays from A01/A02 location events. Ward names are normalised through
-- derived.ref_ward_names; a stay shorter than 5 minutes is a clerical
-- correction and is dropped, as is a move to the ward the patient is already on.
CREATE OR REPLACE TABLE derived.ward_stays AS
WITH loc AS (
  SELECT v.visit_number, v.event_datetime AS t, COALESCE(w.ward_name, v.ward) AS ward, w.ward_id, w.kind, v.site_code
  FROM derived._adt_valid v LEFT JOIN derived.ref_ward_names w ON w.raw = v.ward
  WHERE v.event_type IN ('A01', 'A02') AND v.ward IS NOT NULL AND NOT v.visit_cancelled),
dedup AS (SELECT DISTINCT * FROM loc),
seq AS (
  SELECT d.*, lead(t) OVER w AS next_t, lag(ward) OVER w AS prev_ward
  FROM dedup d WINDOW w AS (PARTITION BY visit_number ORDER BY t)),
clean AS (
  SELECT * FROM seq
  WHERE (next_t IS NULL OR date_diff('minute', t, next_t) >= 5)          -- not a 2-minute correction
    AND (prev_ward IS NULL OR ward <> prev_ward)),                          -- not a move to the same ward
seq2 AS (
  SELECT c.*, lead(t) OVER (PARTITION BY visit_number ORDER BY t) AS stay_end_next,
         row_number() OVER (PARTITION BY visit_number ORDER BY t) AS stay_seq
  FROM clean c)
SELECT s.provspno, s.person_id, q.stay_seq, q.ward, q.ward_id, q.kind, q.site_code,
       q.t AS stay_start, COALESCE(q.stay_end_next, s.disdate) AS stay_end,
       date_diff('minute', q.t, COALESCE(q.stay_end_next, s.disdate)) AS stay_minutes
FROM seq2 q JOIN derived.spells s ON s.provspno = q.visit_number;
