# Flu Season Shapes

Overlays weekly flu patient counts across multiple seasons, **aligned by week of
season**, to show that flu seasons tend to fall into a few recognisable shapes:

- **early peak** — rises and peaks early, then fades;
- **late peak** — builds later, often higher;
- **slow burn** — a lower peak but a long season that finishes late.

As a new season arrives week by week, the app ranks which past season it most
resembles *so far*, and projects where that analogue eventually peaked — a
starting point for modelling the season ahead.

Everything runs **R in the browser** via [webR](https://docs.r-wasm.org/webr/latest/);
there is no backend.

## ⚠ The bundled data is synthetic

`data/flu_weekly.csv` currently holds **illustrative, hand-shaped data — not real
NHS figures**. It exists so the app is fully functional and the three archetypes
are visible. Replace it with real data to use this for real.

## Data schema

`data/flu_weekly.csv`, one row per season-week:

| Column | Meaning |
| --- | --- |
| `season` | Season label, e.g. `2023-24` |
| `season_week` | Week index within the season (1 = first reporting week; week 1 ≈ early October). Used to align seasons. |
| `iso_week` | ISO week number (for reference/tooltips) |
| `count` | Number of flu patients that week (e.g. mean daily G&A + critical-care beds occupied by confirmed flu) |
| `is_current` | `1` for the in-progress season (drawn bold by default), else `0` |

The tracked season simply has fewer weeks present (only those observed so far).

## Getting real NHS England data

I could not fetch it automatically (this build environment has no outbound
network). To populate it yourself:

- **NHS England — Winter Daily SitRep** (the source for hospital flu bed
  occupancy): <https://www.england.nhs.uk/statistics/statistical-work-areas/winter-daily-sitreps/>.
  Each winter's "Acute Time series" workbook includes flu beds occupied (general
  & acute plus critical care) by day; aggregate to weekly means.
- **UKHSA — National flu surveillance** (weekly hospital admission rates,
  full Oct–May season, longer history): published on GOV.UK.

Reshape into the schema above (one row per season-week, with a consistent
`season_week` alignment) and overwrite `data/flu_weekly.csv`. No code changes
needed.

`generate_data.js` (`node generate_data.js`) regenerates the synthetic placeholder
if you want to tweak the illustrative shapes.

## Running locally

Static files — serve over HTTP (the webR module is an ES import, so `file://`
won't work):

```sh
cd flu && python3 -m http.server 8000
# open http://localhost:8000/
```
