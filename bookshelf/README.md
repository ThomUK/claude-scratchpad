# Bookshelf Designer — birch ply

A parametric birch-plywood bookshelf rendered live in 3D 
(https://thomuk.github.io/claude-scratchpad/bookshelf/). Drag the sliders or
type exact values and the model rebuilds in realtime; orbit / zoom / pan with
the mouse.

## Parameters (v1)

| Control | Range | Notes |
| --- | --- | --- |
| Width | 300–2400 mm | side to side |
| Depth | 150–600 mm | front to back |
| Height | 300–2400 mm | floor to top |
| Shelves | 0–12 | internal, evenly spaced; capped so every bay keeps ≥ 30 mm clear |
| Plinth height | 0–250 mm | floor to the underside of the bottom shelf, so the first shelf clears any skirting; adds a set-back front rail |
| Skirting cutout depth | 0–50 mm | notch in the back-bottom of each side (its height = plinth height) so the unit pushes back to the wall over the skirting |
| Front setback | 0–60 mm | internal shelf fronts and the plinth rail sit this far behind the side fronts; top and bottom stay flush |
| Ply thickness | 12 / 18 / 24 mm | applies to all structural panels |
| Back panel | on/off | fixed 6 mm, rebated into the sides, top and bottom: lap = ¾ of the main ply thickness, rebate cut 1 mm deeper than the back ply so it seats 1 mm below flush; shelves shallow by 7 mm when on |
| Quantity | 1–10 | bookcases to build: cut list shows per-bookcase and total quantities; all parts nest together on shared sheets |

Readout: external dimensions, clear bay height, total ply volume + panel
count, and an approximate weight at 680 kg/m³.

## Cut list

A live cut list sits under the readout: every panel with quantity, blank
length × width, thickness and a construction note (the sides list the
skirting notch to cut out of the blank; the plinth rail — the kick board
that stands on edge under the bottom shelf — lists its setback). It is
downloadable as CSV, headed by a one-line spec of the full parameter set.
The CSV is emitted as pure ASCII with a UTF-8 BOM, because Excel guesses
Windows-1252 for BOM-less CSVs and mangles × / — into `Ã—` / `â€”`.

Under the cut list, a **sheet nesting** summary estimates how many
2440 × 1220 sheets to buy per thickness (first-fit-decreasing guillotine
strip nesting, long edge along the sheet, 4 mm kerf), with part count and
utilisation. When building more than one bookcase, **all parts nest
together** in one pool per thickness, which packs sheets tighter than
nesting each bookcase separately. The PDF dedicates page 3 (and beyond,
as needed) to **drawn sheet layouts**: each sheet as a rectangle with
every part at its nested position, labelled with name and size, plus
per-sheet utilisation — and, for multiple bookcases, a circled number on
each part marking which bookcase it belongs to.

There is also a two-page **PDF download** (jsPDF, vendored): page 1 is a
brochure-style summary — a 3D view captured from the live scene at a
canonical angle, dimensioned top/front/side elevations in third-angle
layout (external dimensions only, drawn as vectors), and the readout
stats; page 2 is the cut list with the same totals.

The 3D build, the readout figures, the CSV and the PDF all derive from the
same `cutList()` rows and `derived()` figures, so they cannot disagree
(the repo-wide anti-drift rule).

## Construction modelled

Sides run full height and full depth, notched at the back-bottom corner to
clear skirting (extruded L-profiles with a custom UV generator so the edge
laminations stay correct on the cut faces). The bottom shelf sits on the
plinth zone; top, bottom and shelves are housed between the sides (inner
width = width − 2 × thickness). Every flat panel is built as a box
with its thickness on one axis so the two big faces take the birch *face*
material and the four rims take the laminated *edge* material — the
alternating veneer stripes that make ply read as ply (9/13/17 plies for
12/18/24 mm, canvas-generated procedurally, as is the face grain).

## No CDN dependencies

three.js is **pinned (r186) and vendored** in `vendor/three/`
(`three.module.js`, `three.core.js`, `OrbitControls.js`, wired by an import
map in `index.html`), and jsPDF is **pinned (4.2.1) and vendored** in
`vendor/jspdf/` (UMD build, lazy-loaded on first PDF download) — repo
policy after the population-projections outage:
a deployed app should not change behaviour because a third-party host or a
floating "latest" channel moved. This app makes zero runtime requests
outside the repo.

## Ideas for later

Shelf-pin vs housed-dado toggle, dividers, a drawn sheet-nesting layout
(the current summary is count + utilisation only), and cost at £/sheet.
