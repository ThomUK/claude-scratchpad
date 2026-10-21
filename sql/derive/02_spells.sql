-- Hospital provider spells from the ADT event log.
-- Rules: a visit with an A11 never happened; an A03 followed by an A13 is not
-- a discharge; the discharge is the last surviving A03; duplicate messages are
-- harmless because every field is taken with min/max per visit.
CREATE OR REPLACE TABLE derived._adt_valid AS
WITH ev AS (
  SELECT e.*, m.person_mrn AS person_id FROM l1.pas_adt_events e LEFT JOIN derived.mrn_map m ON m.mrn = e.mrn),
canc AS (SELECT DISTINCT visit_number FROM ev WHERE event_type = 'A11'),
a03 AS (
  SELECT a.message_id
  FROM ev a
  WHERE a.event_type = 'A03'
    AND EXISTS (SELECT 1 FROM ev c WHERE c.visit_number = a.visit_number AND c.event_type = 'A13'
                                       AND c.event_datetime > a.event_datetime AND c.event_datetime < a.event_datetime + INTERVAL 3 DAY))
SELECT ev.*,
       visit_number IN (SELECT visit_number FROM canc) AS visit_cancelled,
       message_id IN (SELECT message_id FROM a03) AS discharge_cancelled
FROM ev;

CREATE OR REPLACE TABLE derived.spells AS
WITH a01 AS (
  SELECT visit_number, person_id, min(event_datetime) AS admit,
         arg_min(site_code, event_datetime) AS site_code, arg_min(specialty_code, event_datetime) AS specialty_first,
         arg_min(consultant_code, event_datetime) AS consultant_first, arg_min(admission_method, event_datetime) AS admission_method,
         arg_min(admission_source, event_datetime) AS admission_source, arg_min(patient_class, event_datetime) AS patient_class,
         arg_min(intended_management, event_datetime) AS intended_management, arg_min(decision_to_admit_date, event_datetime) AS decision_to_admit_date,
         arg_min(ward, event_datetime) AS first_ward_raw
  FROM derived._adt_valid WHERE event_type = 'A01' AND NOT visit_cancelled GROUP BY visit_number, person_id),
a03 AS (
  SELECT visit_number, max(event_datetime) AS discharge,
         arg_max(discharge_method, event_datetime) AS discharge_method, arg_max(discharge_destination, event_datetime) AS discharge_destination,
         arg_max(discharge_ready_date, event_datetime) AS discharge_ready_date, arg_max(specialty_code, event_datetime) AS specialty_last,
         arg_max(consultant_code, event_datetime) AS consultant_last
  FROM derived._adt_valid WHERE event_type = 'A03' AND NOT discharge_cancelled GROUP BY visit_number)
SELECT a01.visit_number AS provspno, a01.person_id, a01.admit AS admidate, a03.discharge AS disdate,
       a01.admission_method AS admimeth, a01.admission_source AS admisorc, a01.patient_class AS classpat, a01.intended_management AS intmanig,
       a01.decision_to_admit_date AS elecdate, a03.discharge_method AS dismeth, a03.discharge_destination AS disdest, a03.discharge_ready_date AS disreadydate,
       a01.site_code AS sitetret, a01.specialty_first AS tretspef_first, COALESCE(a03.specialty_last, a01.specialty_first) AS tretspef_last,
       a01.consultant_first, a03.consultant_last,
       a01.admission_method IN ('21','22','23','24','25','28','2A','2B','2C','2D') AS emergency,
       a01.patient_class = '2' AS day_case,
       a03.discharge IS NULL AS open_spell,
       date_diff('day', CAST(a01.admit AS DATE), CAST(a03.discharge AS DATE)) AS speldur,
       a03.discharge_method = '4' AS died,
       CASE WHEN a01.admission_method = '21' THEN 'ED' WHEN a01.admission_method IN ('22','23','24','28','2A','2B','2C','2D') THEN 'other emergency'
            WHEN a01.admission_method = '13' THEN 'planned' ELSE 'elective' END AS admission_group
FROM a01 LEFT JOIN a03 USING (visit_number);
