# NHS Specialties & Treatment Functions

An index of NHS **main specialties** and **treatment functions** from the
[NHS Data Dictionary](https://www.datadictionary.nhs.uk/attributes/treatment_function_code.html),
built into a factsheet per specialty, with a graph layer showing how specialties
connect through their clinical roles. The first role layer is **doctors and
medical staff**.

Live: https://thomuk.github.io/claude-scratchpad/nhs-specialties/

## Views

- **Specialties**: searchable cards grouped for navigation. Search matches
  names, main specialty and treatment function codes, service titles and role titles.
- **Factsheet** (`#/s/<id>`): codes, treatment functions, training route,
  medical workforce (grade ladder, shared pathways, special-interest roles), a
  small role network, and specialties connected through shared roles.
- **Role graph** (`#/graph`): specialties linked to the special-interest roles
  (and optionally grades) they list. Shared training pathways are drawn as
  shaded regions around their specialties instead of hub nodes. Filter by role kind
  and specialty group, click a node or region to highlight its links, and zoom
  or pan. Includes a table view.
- **Code tree** (`#/tree`): main specialty → treatment function tree, grouped
  by Data Dictionary Table 1 heading, with each link marked *same code* or
  *curated*. Filter by specialty type (Table 1), service type (Table 2), link
  kind (all / same code / curated) and free text. Optionally include main
  specialties that have no treatment function, such as 823 Haematology, which
  the Data Dictionary points to Clinical Haematology.
- **Code index** (`#/codes`): both Data Dictionary code lists, with the
  factsheet each code maps to.

## Data, all YAML

```
data/
  specialties.yaml              manifest: navigation groups + list of factsheet ids
  specialties/<id>.yaml         one factsheet per specialty (86)
  roles.yaml                    role catalogue: grades, pathways, special-interest roles
  codes/main-specialties.yaml   Data Dictionary Table 1: main specialty codes (95)
  codes/treatment-functions.yaml Data Dictionary Table 2: treatment function codes (184)
source/                         saved copy of the Data Dictionary page (input of record)
ingest/ingest_dd_table.py       rebuilds data/codes/ from the newest copy in source/
```

Factsheet schema:

```yaml
id: cardiology                       # must match the file name
title: "Cardiology"
group: medical                       # id from specialties.yaml groups
main_specialty_codes: ["320"]
treatment_function_codes: ["320", "327", "331"]   # each active TFC has exactly one home
summary: >-
  ...
notes: >-                            # optional
  ...
training:                            # optional
  college: "..."
  route: "..."
  length: "..."
workforce:
  medical:
    consultant_title: "Consultant cardiologist"
    grades: [consultant, specialist, ...]          # roles.yaml, kind: grade
    pathways: [internal-medicine-training]         # kind: pathway
    special_interests: [interventional-cardiologist]  # kind: special-interest
related: [cardiothoracic-surgery, paediatric-cardiology]
```

**To add a specialty**, create `data/specialties/<id>.yaml` and add `<id>` to
`data/specialties.yaml`. GitHub Pages cannot list folders, so the manifest is
required. **To add a role**, add it to `data/roles.yaml` and reference it from
factsheets. **To add the next staff group** (nursing, AHPs, scientists, and so on),
add roles with a new `staff_group` and list them under a new key next to
`workforce.medical`.

The app validates everything on load and shows any problem at the top of the
page. It flags unknown codes, roles listed under the wrong kind, a treatment
function claimed twice or by no factsheet, and broken `related` links. The tests
run the same checks:

```
node tests/engine.test.mjs        # from nhs-specialties/
```

## Sources and caveats

- **Both code lists** come from the NHS Data Dictionary page
  [Main Specialty and Treatment Function Codes Table](https://www.datadictionary.nhs.uk/supporting_information/main_specialty_and_treatment_function_codes_table.html).
  A saved copy is kept in `source/` and is the input of record.
  `ingest/ingest_dd_table.py` turns it into `data/codes/*.yaml`. Don't edit those
  files by hand.
  - Table 1, Main Specialty Codes: 95 codes, 8 of them retired.
  - Table 2, Treatment Function Codes: 184 codes, 6 of them retired. It also
    lists 18 main specialty codes as "not a Treatment Function", sometimes with a
    pointer such as 823 "See Clinical Haematology".
- **To update the codes**:
  1. Save the live page (browser "Save page as… → HTML only") as
     `source/dd-main-specialty-and-treatment-function-codes-table.<YYYY-MM-DD>.html`.
  2. Run `python3 ingest/ingest_dd_table.py`. It reads the newest copy.
  3. Run `node tests/engine.test.mjs`. Validation names every factsheet that now
     uses a retired, removed or "not a Treatment Function" code.
- **The table does not map main specialties to treatment functions.** It is two
  separate lists that share many code numbers. Each treatment function's home
  factsheet is one of two kinds of link, labelled in the app:
  - **Same code** (66): the treatment function shares its number with the
    factsheet's main specialty.
  - **Curated** (112): this app's editorial grouping for treatment functions with
    no same-number main specialty, such as 103 Breast Surgery under General
    Surgery. The table's service descriptions and its "See …" pointers were used
    as a guide. Debatable placements are explained in the factsheet's `notes`.
- **History:** the first version used an older mirror of the treatment function
  list and a main specialty list compiled from memory. Against the Data Dictionary
  copy of 2026-10-12 these were wrong in places:
  - 810, 823, 831 and 900 are not treatment functions;
  - 832 and 990 are retired;
  - 833 is not a treatment function code;
  - 199 and 499 are no longer listed;
  - the retired main specialty codes 510, 520, 610, 620 and 990 were missing.

  All of these are corrected.
- **Summaries, training routes and lengths, role mappings and related specialties**
  are a curated first draft for discussion. They are not an authoritative
  statement of curricula; check the relevant college's curriculum.
- Uses [js-yaml](https://github.com/nodeca/js-yaml) 4.1.0 (MIT), vendored in `vendor/`.
