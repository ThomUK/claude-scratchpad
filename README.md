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
| Demand & Capacity — NUH (RX1) | [`demand-and-capacity/`](demand-and-capacity/) | [open](https://thomuk.github.io/claude-scratchpad/demand-and-capacity/) | Trust-wide, specialty-connected demand & capacity model for Nottingham University Hospitals: RTT 65/80/92 glide path converted to required outpatient, theatre, bed and diagnostic capacity per treatment function. Pure-JS engine, unit-tested. |
| RTT 18-week Diversion | [`rtt-diversion/`](rtt-diversion/) | [open](https://thomuk.github.io/claude-scratchpad/rtt-diversion/) | Animated fictional waiting list to 1 April 2028 under surplus / balanced / deficit capacity, each run ordinarily and again with capacity diverted in the final 18 weeks to flatter the %<18wk figure on the day, plus the hangover after. A study of a tactic the author does not endorse. Pure-JS engine, unit-tested. |
| World Borders | [`world-borders/`](world-borders/) | [open](https://thomuk.github.io/claude-scratchpad/world-borders/) | Educational guessing game on a three.js globe: pick a start country, then find the hidden one by distance, with warmer/cooler guesses coloured on the map and an info card (capital, population, borders, facts, who administers each dependent territory) for all 250 countries and territories. Pure-JS engine, unit-tested. |

## How deployment works

Every push to `main` triggers `.github/workflows/pages.yml`, which publishes the
repo root to GitHub Pages. An app in directory `foo/` is therefore served at
`https://thomuk.github.io/claude-scratchpad/foo/`.

To add a new app: create its directory, then add a card to the root
`index.html` (copy the existing template block) and a row to the table above.
