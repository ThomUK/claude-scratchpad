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
- **Code index** (`#/codes`): both Data Dictionary code lists, with the
  factsheet each code maps to.

## Data, all YAML

```
data/
  specialties.yaml              manifest: navigation groups + list of factsheet ids
  specialties/<id>.yaml         one factsheet per specialty (86)
  roles.yaml                    role catalogue: grades, pathways, special-interest roles
  codes/main-specialties.yaml   MAIN SPECIALTY CODE national codes (92)
  codes/treatment-functions.yaml TREATMENT FUNCTION CODE national codes (189)
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

- **Treatment function codes**: the full Data Dictionary table, taken
  programmatically from the Strategy Unit's mirror
  ([`tx-lookup.json`](https://github.com/The-Strategy-Unit/nhp_outputs/blob/main/inst/app/data/tx-lookup.json))
  because datadictionary.nhs.uk was not reachable from the build environment.
- **Main specialty codes**: transcribed from the Data Dictionary's
  Main Specialty Code attribute, including the retired codes 191, 312 and 832.
  Re-check this list against the live page when convenient.
- **Each TFC's home factsheet** follows the Data Dictionary's Main Specialty and
  Treatment Function Codes Table where it is clear. Judgement calls are explained
  in the factsheet's `notes`.
- **Summaries, training routes and lengths, role mappings and related specialties**
  are a curated first draft for discussion. They are not an authoritative
  statement of curricula; check the relevant college's curriculum.
- Uses [js-yaml](https://github.com/nodeca/js-yaml) 4.1.0 (MIT), vendored in `vendor/`.
