# claude-scratchpad

A collection of small, self-contained toy web apps, each in its own directory
and deployed to GitHub Pages.

## 🔗 Live site

**https://thomuk.github.io/claude-scratchpad/**

## Apps

| App | Path | Live | Description |
| --- | --- | --- | --- |
| Occupancy & Percentiles | [`occupancy/`](occupancy/) | [open](https://thomuk.github.io/claude-scratchpad/occupancy/) | Simulates daily occupancy and shows why p50/p85/p95/p99 give very different absolute answers from the same data. Runs R in the browser via [webR](https://docs.r-wasm.org/webr/latest/). |
| Flu Season Shapes | [`flu/`](flu/) | [open](https://thomuk.github.io/claude-scratchpad/flu/) | Weekly flu patients overlaid across seasons (early-peak / late-peak / slow-burn), and which past season a new one most resembles so far. Runs R in the browser via webR. |
| Average vs Intraday Bed Modelling | [`averages-modelling/`](averages-modelling/) | [open](https://thomuk.github.io/claude-scratchpad/averages-modelling/) | Why average-based bed planning (admissions × LOS) under-provisions versus an hour-by-hour deterministic flow model accounting for arrival timing, LOS spread and discharge timing. Runs R in the browser via webR. |
| Population Pyramids — English Geographies | [`population-projections/`](population-projections/) | [open](https://thomuk.github.io/claude-scratchpad/population-projections/) | Two population pyramids side by side for selected areas (region / sub-ICB / local authority, multi-select) and chosen years, with change by age band and sex below. Real ONS 2022-based subnational projections. Runs R in the browser via webR. |
| England Geography Map | [`england-region-map/`](england-region-map/) | [open](https://thomuk.github.io/claude-scratchpad/england-region-map/) | Linked list + Leaflet map selector for English regions, sub-ICBs and local authorities — tick the list or click the map and they stay in sync. ONS boundaries, OpenStreetMap tiles. |
| Waiting Lists: Shape & Simulation | [`waiting-list/`](waiting-list/) | [open](https://thomuk.github.io/claude-scratchpad/waiting-list/) | Queueing theory for backlogs (NHS RTT and any waiting list): the exponential model + targets, how constraining long waiters reshapes the census, and a referral/removal simulator. Based on Fong et al. (2022) / NHSRwaitinglist. Runs R in the browser via webR. |

## How deployment works

Every push to `main` triggers `.github/workflows/pages.yml`, which publishes the
repo root to GitHub Pages. An app in directory `foo/` is therefore served at
`https://thomuk.github.io/claude-scratchpad/foo/`.

To add a new app: create its directory, then add a card to the root
`index.html` (copy the existing template block) and a row to the table above.
