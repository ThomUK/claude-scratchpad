-- Reference helpers used by the derivations.
-- Ward names: every variant the PAS has used, mapped to the canonical name in ref_wards.
CREATE OR REPLACE TABLE derived.ref_ward_names AS
WITH canon AS (SELECT ward_name, ward_id, site_code, tfc, kind FROM l1.ref_wards),
renames AS (
  SELECT * FROM (VALUES ('Ward 11 Elderly Care', 'Ward 11 Frailty', DATE '2024-06-01'),
                        ('Ward 4 GI Medicine', 'Ward 4 Gastro', DATE '2024-11-01')) AS t(old_name, ward_name, valid_from)),
seen AS (SELECT DISTINCT ward AS raw FROM l1.pas_adt_events WHERE ward IS NOT NULL),
norm AS (
  SELECT raw,
         -- undo the typing variants: case, dropped spaces, W5 for Ward 5, trailing blanks
         regexp_replace(regexp_replace(trim(raw), '^W(\d+)', 'Ward \1'), '(?i)^ward(\d+)', 'Ward \1') AS step1
  FROM seen)
SELECT n.raw,
       COALESCE(c.ward_name, c2.ward_name, r.ward_name) AS ward_name,
       COALESCE(c.ward_id, c2.ward_id, cr.ward_id) AS ward_id,
       COALESCE(c.site_code, c2.site_code, cr.site_code) AS site_code,
       COALESCE(c.kind, c2.kind, cr.kind) AS kind
FROM norm n
LEFT JOIN canon c  ON lower(c.ward_name) = lower(n.step1)
LEFT JOIN canon c2 ON lower(replace(c2.ward_name, ' ', '')) = lower(replace(n.step1, ' ', ''))
LEFT JOIN renames r ON lower(r.old_name) = lower(n.step1) OR lower(replace(r.old_name, ' ', '')) = lower(replace(n.step1, ' ', ''))
LEFT JOIN canon cr ON cr.ward_name = r.ward_name;

-- Normalised NHS number: the generator's fake_ prefix plus ten digits, whatever the source typed.
CREATE OR REPLACE MACRO nhs_norm(x) AS
  CASE WHEN x IS NULL THEN NULL
       WHEN x LIKE 'fake_%' THEN 'fake_' || replace(substr(x, 6), ' ', '')
       ELSE 'fake_' || replace(x, ' ', '') END;

-- Financial year of a timestamp or date, as an integer (2023 = April 2023 to March 2024).
CREATE OR REPLACE MACRO fy(x) AS CASE WHEN month(x) >= 4 THEN year(x) ELSE year(x) - 1 END;
