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
| Ply thickness | 12 / 18 / 24 mm | applies to all structural panels |
| Back panel | on/off | fixed 6 mm, inset within the frame; shelves shallow by 6 mm when on |

Readout: external dimensions, clear bay height, total ply volume + panel
count, and an approximate weight at 680 kg/m³.

## Construction modelled

Sides run full height; top, bottom and shelves are housed between them
(inner width = width − 2 × thickness). Every panel is built as a flat box
with its thickness on one axis so the two big faces take the birch *face*
material and the four rims take the laminated *edge* material — the
alternating veneer stripes that make ply read as ply (9/13/17 plies for
12/18/24 mm, canvas-generated procedurally, as is the face grain).

## No CDN dependencies

three.js is **pinned (r186) and vendored** in `vendor/three/`
(`three.module.js`, `three.core.js`, `OrbitControls.js`, wired by an import
map in `index.html`) — repo policy after the population-projections outage:
a deployed app should not change behaviour because a third-party host or a
floating "latest" channel moved. This app makes zero runtime requests
outside the repo.

## Ideas for later

Shelf-pin vs housed-dado toggle, kick plate, dividers, a cut list with sheet
nesting (how many 2440×1220 sheets), cost at £/sheet, and export of the cut
list as CSV.
