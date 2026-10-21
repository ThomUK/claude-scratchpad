-- The DID submission: the 17 columns, dates only, performed exams only. Compare with ris_imaging to see what the national extract cannot see.
CREATE OR REPLACE TABLE agg.did_extract AS
SELECT r.nhs_number, r.nhs_number_status, p.dob AS date_of_birth, p.ethnicity, p.sex AS patient_gender, p.postcode AS patient_home_postcode, p.gp_practice AS registered_gp_practice,
       r.patient_source_setting AS patient_type, r.referrer_code AS referrer, r.referring_organisation,
       CAST(r.request_datetime AS DATE) AS date_of_test_request, CAST(r.request_received_datetime AS DATE) AS date_test_request_received,
       CAST(r.scan_start_datetime AS DATE) AS date_of_test, r.nicip_code AS imaging_code_nicip, r.snomed_code AS imaging_code_snomed,
       CAST(COALESCE(r.verified_datetime, r.reported_datetime) AS DATE) AS date_test_report_issued,
       r.site_code AS provider_site_code, r.accession_number AS ris_accession_number
FROM l1.ris_imaging r LEFT JOIN l1.pas_patients p ON p.mrn = r.mrn
WHERE r.status IN ('verified', 'reported', 'performed') AND r.scan_start_datetime IS NOT NULL;
