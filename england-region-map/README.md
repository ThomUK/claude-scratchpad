# England Geography Map

A linked geography selector across three levels — **Region**, **Sub-ICB location**,
**Local authority**. Pick a level, then tick areas in the (grouped, searchable) list
to highlight them on the map, or click areas on the map to toggle them in the list;
the two stay in sync. Pan and scroll-zoom freely, with OpenStreetMap tiles behind
the polygons.

Pure HTML/CSS/JS — Leaflet is loaded from a CDN; no build step, no backend. Each
level's shapes are lazy-loaded on first use.

## Data

Area lists (codes, labels, parent groups, 2022 population) come from the
`population-projections` data via `build_area_lookups.py`:

```sh
python3 build_area_lookups.py   # writes data/<level>_areas.csv
```

Boundaries are ONS GeoJSON (WGS84 / EPSG:4326), matched to the area lists by ONS
code. The app keeps only features whose code is in the level's list, so UK-wide
files are filtered to England automatically.

| Level | `data/` file | ONS product | Codes |
| --- | --- | --- | --- |
| Region | `regions.geojson` | Regions (December 2022) Boundaries EN, BUC | `RGN22CD` E12… (9) |
| Sub-ICB | `subicb.geojson` | Sub-ICB Locations (April 2023) Boundaries EN, BGC | `SICBL23CD` E38… (106) |
| Local authority | `la.geojson` | Local Authority Districts (December 2022) Boundaries UK, BUC | `LAD22CD` E06–E09 (309 of 374) |

**Vintage matters for LAs:** the projection data uses pre-April-2023 boundaries
(e.g. Allerdale, South Somerset), so the **December 2022** LAD file is the matching
vintage. A 2023+ file would miss ~20 codes. Download all three from the ONS Open
Geography Portal: <https://geoportal.statistics.gov.uk>.

## Running locally

Static files — serve over HTTP (`fetch` of the GeoJSON won't work from `file://`):

```sh
cd england-region-map && python3 -m http.server 8000
# open http://localhost:8000/
```

## Licence & attribution

Boundary and population data are © Crown copyright, licensed under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
When reusing, retain the following acknowledgements (shown in the app footer):

- Source: Office for National Statistics licensed under the Open Government Licence v.3.0
- Contains National Statistics data © Crown copyright and database right 2022 & 2023
- Contains OS data © Crown copyright and database right 2022 & 2023

Basemap tiles are © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
(map data under the ODbL). Tiles are served from OpenStreetMap's public tile servers,
whose [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) applies —
switch to a dedicated tile provider before any heavy or production use.
