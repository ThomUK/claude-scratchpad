# England Region Map

A linked region selector: a **checkbox list** and a **Leaflet map** kept in sync.
Tick a region in the list and it highlights on the map; click a region on the map
and it toggles in the list. Pan and scroll-zoom freely. OpenStreetMap tiles sit
behind the region polygons.

Pure HTML/CSS/JS — Leaflet is loaded from a CDN; no build step, no backend.

## Boundary data (you supply)

Add `data/regions.geojson` — the **ONS Regions (December 2022) Boundaries, England**.

- Download from the **ONS Open Geography Portal**: <https://geoportal.statistics.gov.uk>
  → search *"Regions December 2022 Boundaries EN"*.
- Choose a **generalised, clipped** resolution (**BUC** ultra-generalised is smallest
  and fine for web; **BGC** generalised for crisper coastlines).
- Export as **GeoJSON in WGS84 / EPSG:4326** (Leaflet needs lat-long, not British
  National Grid).
- It should hold **9 features** with `RGN22CD` = `E12000001`…`E12000009` and `RGN22NM`.

The app matches features to regions by their **E12 code** (it scans each feature's
properties for an `E12NNNNNN` value), so minor differences in property naming are
fine. The headline's 2022 populations are baked into `app.js` (from the ONS
2022-based projections) — `57,112,542` across all nine.

## Running locally

Static files — serve over HTTP (`fetch` of the GeoJSON won't work from `file://`):

```sh
cd england-region-map && python3 -m http.server 8000
# open http://localhost:8000/
```
