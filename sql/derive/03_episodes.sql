-- Consultant episodes: the A01 starts the first; an A08 starts a new one when
-- it changes the consultant or the specialty and comes at least 60 minutes
-- after the previous episode start (earlier A08s are treated as corrections
-- of the A01). A flip back to the previous specialty within 4 hours is collapsed.
CREATE OR REPLACE TABLE derived.episodes AS
WITH starts AS (
  SELECT visit_number, event_datetime AS t, specialty_code, consultant_code, event_type
  FROM derived._adt_valid WHERE event_type IN ('A01', 'A08') AND NOT visit_cancelled AND specialty_code IS NOT NULL),
ordered AS (
  SELECT *, lag(specialty_code) OVER w AS prev_spec, lag(consultant_code) OVER w AS prev_cons, lag(t) OVER w AS prev_t,
         lag(specialty_code, 2) OVER w AS prev2_spec
  FROM starts WINDOW w AS (PARTITION BY visit_number ORDER BY t)),
kept AS (
  SELECT * FROM ordered
  WHERE event_type = 'A01'
     OR ((specialty_code <> prev_spec OR consultant_code IS DISTINCT FROM prev_cons) AND date_diff('minute', prev_t, t) >= 60
         AND NOT (specialty_code = prev2_spec AND date_diff('minute', prev_t, t) < 240))),
num AS (
  SELECT k.*, row_number() OVER (PARTITION BY visit_number ORDER BY t) AS epiorder,
         lead(t) OVER (PARTITION BY visit_number ORDER BY t) AS next_t
  FROM kept k)
SELECT s.provspno, n.visit_number || '-' || lpad(CAST(n.epiorder AS VARCHAR), 2, '0') AS epikey, s.person_id, n.epiorder,
       n.t AS epistart, COALESCE(n.next_t, s.disdate) AS epiend, n.specialty_code AS tretspef, n.consultant_code,
       n.epiorder = 1 AS spelbgin, n.next_t IS NULL AS spelend,
       CASE WHEN COALESCE(n.next_t, s.disdate) IS NULL THEN 1 ELSE 3 END AS epistat
FROM num n JOIN derived.spells s ON s.provspno = n.visit_number;
