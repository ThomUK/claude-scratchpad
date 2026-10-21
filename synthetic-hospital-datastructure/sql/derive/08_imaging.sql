-- Performed imaging examinations. Cancelled and DNA rows are dropped, the RIS
-- clock (UTC during British Summer Time) is put back to local time, split
-- bookings are flagged, exact duplicates are collapsed, and the DID and DM01
-- intervals are derived.
-- British Summer Time runs from 01:00 UTC on the last Sunday of March to 01:00 UTC on the last Sunday of October.
CREATE OR REPLACE MACRO is_bst(t) AS
  t >= (make_date(year(t), 3, 31) - CAST(dayofweek(make_date(year(t), 3, 31)) AS INTEGER))::TIMESTAMP + INTERVAL 1 HOUR
  AND t < (make_date(year(t), 10, 31) - CAST(dayofweek(make_date(year(t), 10, 31)) AS INTEGER))::TIMESTAMP + INTERVAL 1 HOUR;
CREATE OR REPLACE MACRO local_time(t) AS CASE WHEN t IS NULL THEN NULL WHEN is_bst(t) THEN t + INTERVAL 1 HOUR ELSE t END;

CREATE OR REPLACE TABLE derived.imaging_exams AS
WITH perf AS (
  SELECT r.*, m.person_mrn AS person_id,
         regexp_replace(accession_number, '(/[0-9]|[A-Z])$', '') AS accession_stem
  FROM l1.ris_imaging r LEFT JOIN derived.mrn_map m ON m.mrn = r.mrn
  WHERE r.status IN ('verified', 'reported', 'performed') AND r.scan_start_datetime IS NOT NULL),
dedup AS (
  SELECT *, row_number() OVER (PARTITION BY person_id, nicip_code, scan_start_datetime ORDER BY accession_number) AS dup_rank,
         count(*) OVER (PARTITION BY accession_stem) AS rows_on_slot
  FROM perf)
SELECT accession_number, accession_stem, person_id, mrn AS mrn_as_recorded, ris_patient_id, modality, nicip_code, snomed_code, exam_description, body_area,
       priority, patient_source_setting,
       CASE patient_source_setting WHEN '05' THEN 'A&E' WHEN '01' THEN 'Inpatient' WHEN '02' THEN 'Day case' WHEN '03' THEN 'Outpatient' WHEN '04' THEN 'GP direct access' WHEN '06' THEN 'Other provider' ELSE 'Other' END AS source_setting,
       patient_source_setting IN ('01','02','05') AS inpatient_or_ae,
       local_time(request_datetime) AS request_datetime, local_time(request_received_datetime) AS request_received_datetime,
       local_time(vetted_datetime) AS vetted_datetime, local_time(booked_datetime) AS booked_datetime,
       local_time(scan_start_datetime) AS scan_start_datetime, local_time(scan_end_datetime) AS scan_end_datetime,
       local_time(reported_datetime) AS reported_datetime, local_time(verified_datetime) AS verified_datetime,
       slot_minutes, reporter_code, site_code, scanner_id, dm01_countable,
       date_diff('day', CAST(COALESCE(request_datetime, request_received_datetime) AS DATE), CAST(scan_start_datetime AS DATE)) AS request_to_test_days,
       date_diff('day', CAST(scan_start_datetime AS DATE), CAST(COALESCE(verified_datetime, reported_datetime) AS DATE)) AS test_to_report_days,
       COALESCE(verified_datetime, reported_datetime) IS NULL AS report_date_missing,
       rows_on_slot > 1 AS split_booking,
       priority = 'planned' AS planned
FROM dedup WHERE dup_rank = 1;
