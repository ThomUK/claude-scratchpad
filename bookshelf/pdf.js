// Brochure-style PDF export for the bookshelf designer.
// Page 1: 3D view, readout, and dimensioned orthographic elevations
// (external dimensions only). Page 2: the cut list.
// jsPDF is pinned (4.2.1) and vendored in vendor/jspdf/ (UMD build, loaded
// lazily on first use) — same no-CDN policy as three.js. All drawing is in
// millimetres on A4 portrait (210 × 297).

const INK = 25, GREY = 110, FAINT = 200;

// jsPDF's built-in Helvetica is WinAnsi-encoded: a character outside it (≈,
// ≥ …) degrades the whole string into letter-spaced fallback glyphs. Map the
// few offenders to safe equivalents before any doc.text().
const wa = (s) => s.replace(/≈/g, '~').replace(/≥/g, '>=');

let jsPDFCtor = null;
async function ensureJsPDF() {
  if (!jsPDFCtor) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = './vendor/jspdf/jspdf.umd.min.js?v=dev';
      s.onload = res;
      s.onerror = () => rej(new Error('failed to load vendored jsPDF'));
      document.head.appendChild(s);
    });
    jsPDFCtor = window.jspdf.jsPDF;
  }
  return jsPDFCtor;
}

const specLine = (p) =>
  `${p.width} × ${p.depth} × ${p.height} mm  ·  ply ${p.thickness} mm  ·  plinth ${p.plinth} mm  ·  ` +
  `skirting cutout ${p.cutout} mm  ·  front setback ${p.setback} mm  ·  ` +
  `${p.shelves} ${p.shelves === 1 ? 'shelf' : 'shelves'}  ·  ${p.back ? `${p.backT} mm back` : 'no back'}`;

function footer(doc, page) {
  doc.setDrawColor(FAINT);
  doc.setLineWidth(0.2);
  doc.line(15, 284, 195, 284);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(GREY);
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Generated ${date}  ·  thomuk.github.io/claude-scratchpad/bookshelf`, 15, 289);
  doc.text(`page ${page} of 2`, 195, 289, { align: 'right' });
}

// --- dimension lines (grey, with extension lines and filled arrowheads) ----------
function dimStyle(doc) {
  doc.setDrawColor(GREY);
  doc.setFillColor(GREY);
  doc.setTextColor(GREY);
  doc.setLineWidth(0.2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
}

function dimH(doc, x1, x2, yEdge, label) {
  const y = yEdge + 8;
  dimStyle(doc);
  doc.line(x1, yEdge + 1.5, x1, y + 1.5);
  doc.line(x2, yEdge + 1.5, x2, y + 1.5);
  doc.line(x1, y, x2, y);
  doc.triangle(x1, y, x1 + 1.8, y - 0.7, x1 + 1.8, y + 0.7, 'F');
  doc.triangle(x2, y, x2 - 1.8, y - 0.7, x2 - 1.8, y + 0.7, 'F');
  doc.text(label, (x1 + x2) / 2, y - 1.2, { align: 'center' });
}

function dimV(doc, xEdge, yTop, yBot, label) {
  const x = xEdge - 8;
  dimStyle(doc);
  doc.line(xEdge - 1.5, yTop, x - 1.5, yTop);
  doc.line(xEdge - 1.5, yBot, x - 1.5, yBot);
  doc.line(x, yTop, x, yBot);
  doc.triangle(x, yTop, x - 0.7, yTop + 1.8, x + 0.7, yTop + 1.8, 'F');
  doc.triangle(x, yBot, x - 0.7, yBot - 1.8, x + 0.7, yBot - 1.8, 'F');
  doc.text(label, x - 1.4, (yTop + yBot) / 2, { align: 'center', angle: 90 });
}

// --- orthographic elevations (model mm -> page mm via scale s; y flipped) --------
function frontElevation(doc, p, x0, baseY, s) {
  const W = p.width * s, H = p.height * s, T = p.thickness * s;
  const y = (mm) => baseY - mm * s;
  const xi = x0 + T, wi = W - 2 * T;
  // plinth rail face (set back, so a shade lighter) first, lines over it
  if (p.plinth > 0) {
    doc.setFillColor(235);
    doc.rect(xi, y(p.plinth), wi, p.plinth * s, 'F');
  }
  doc.setDrawColor(INK);
  doc.setLineWidth(0.45);
  doc.rect(x0, baseY - H, W, H);
  doc.setDrawColor(70);
  doc.setLineWidth(0.2);
  doc.line(xi, baseY, xi, baseY - H);
  doc.line(xi + wi, baseY, xi + wi, baseY - H);
  const board = (bot) => {  // a horizontal panel seen edge-on: its two edges
    doc.line(xi, y(bot), xi + wi, y(bot));
    doc.line(xi, y(bot + p.thickness), xi + wi, y(bot + p.thickness));
  };
  board(p.plinth);                      // bottom
  doc.line(xi, y(p.height - p.thickness), xi + wi, y(p.height - p.thickness)); // top underside
  const n = p.shelves;
  const bay = (p.height - p.plinth - 2 * p.thickness - n * p.thickness) / (n + 1);
  for (let i = 0; i < n; i++) board(p.plinth + p.thickness + (i + 1) * bay + i * p.thickness);
}

function sideElevation(doc, p, x0, baseY, s) {
  const y = (mm) => baseY - mm * s;
  const x = (mm) => x0 + mm * s;   // model depth: 0 = front (left on page)
  const notch = p.plinth > 0 && p.cutout > 0;
  // hidden edges (bottom, top, shelves, back) dashed, under the outline
  doc.setDrawColor(150);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([1.1, 1.1], 0);
  const backT = p.back ? p.backT : 0;
  const board = (bot, dFrom, dTo) => {
    doc.line(x(dFrom), y(bot), x(dTo), y(bot));
    doc.line(x(dFrom), y(bot + p.thickness), x(dTo), y(bot + p.thickness));
  };
  board(p.plinth, 0, p.depth);
  board(p.height - p.thickness, 0, p.depth);
  // plinth rail (toe-kick): on edge, floor to plinth, set back from the front
  if (p.plinth > 0) {
    doc.line(x(p.setback), y(0), x(p.setback), y(p.plinth));
    doc.line(x(p.setback + p.thickness), y(0), x(p.setback + p.thickness), y(p.plinth));
  }
  const n = p.shelves;
  const bay = (p.height - p.plinth - 2 * p.thickness - n * p.thickness) / (n + 1);
  for (let i = 0; i < n; i++) {
    board(p.plinth + p.thickness + (i + 1) * bay + i * p.thickness, p.setback, p.depth - backT);
  }
  if (p.back) doc.line(x(p.depth - backT), y(p.plinth + p.thickness), x(p.depth - backT), y(p.height - p.thickness));
  doc.setLineDashPattern([], 0);
  // side-panel profile: notch (cutout deep × plinth tall) at the back-bottom
  doc.setDrawColor(INK);
  doc.setLineWidth(0.45);
  const pts = notch
    ? [[0, 0], [p.depth - p.cutout, 0], [p.depth - p.cutout, p.plinth], [p.depth, p.plinth], [p.depth, p.height], [0, p.height]]
    : [[0, 0], [p.depth, 0], [p.depth, p.height], [0, p.height]];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    doc.line(x(a[0]), y(a[1]), x(b[0]), y(b[1]));
  }
}

// Top (plan) view: the full W × D footprint seen from above. Solid seams
// where the top panel meets the side tops; hidden detail (shelf fronts /
// plinth rail at the setback, back panel) dashed. Front of the unit is the
// bottom edge, third-angle, so it sits directly above the front elevation.
function topElevation(doc, p, x0, yTop, s) {
  const W = p.width * s, D = p.depth * s, T = p.thickness * s;
  const yFront = yTop + D;                        // page y of the unit's front edge
  doc.setDrawColor(150);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([1.1, 1.1], 0);
  if (p.setback > 0) doc.line(x0 + T, yFront - p.setback * s, x0 + W - T, yFront - p.setback * s);
  if (p.back) doc.line(x0 + T, yTop + p.backT * s, x0 + W - T, yTop + p.backT * s);
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(70);
  doc.line(x0 + T, yTop, x0 + T, yFront);
  doc.line(x0 + W - T, yTop, x0 + W - T, yFront);
  doc.setDrawColor(INK);
  doc.setLineWidth(0.45);
  doc.rect(x0, yTop, W, D);
}

// --- the document ------------------------------------------------------------------
export async function downloadPdf({ p, rows, stats, totals, image, filename }) {
  const jsPDF = await ensureJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // ---------- page 1: brochure ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(INK);
  doc.text('Bookshelf — birch ply', 15, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(GREY);
  doc.text(specLine(p), 15, 29);
  doc.setDrawColor(FAINT);
  doc.setLineWidth(0.3);
  doc.line(15, 33, 195, 33);

  // 3D view, left (fitted to the frame preserving the capture's aspect —
  // the mobile fallback captures at the viewport's aspect, not 4:3);
  // readout stats, right
  const box = { x: 15, y: 37, w: 108, h: 81 };
  const ar = image.w / image.h;
  let iw = box.w, ih = iw / ar;
  if (ih > box.h) { ih = box.h; iw = ih * ar; }
  const ix = box.x + (box.w - iw) / 2, iy = box.y + (box.h - ih) / 2;
  doc.addImage(image.data, 'JPEG', ix, iy, iw, ih);
  doc.setDrawColor(FAINT);
  doc.setLineWidth(0.25);
  doc.rect(ix, iy, iw, ih);
  let sy = 47;
  for (const [v, l] of stats) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(INK);
    doc.text(wa(v), 130, sy);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(GREY);
    doc.text(l, 130, sy + 4.2);
    sy += 15.5;
  }

  // dimensioned elevations
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(GREY);
  doc.text('DIMENSIONED ELEVATIONS — EXTERNAL DIMENSIONS, MM', 15, 128);
  // third-angle layout: top (plan) view above the front elevation, side
  // elevation to its right
  const gapX = 24, gapY = 13;
  const availH = 118;                                  // drawing band y 136..254
  const availW = 210 - 2 * 15 - gapX - 16;             // minus view gap + dim margins
  const s = Math.min(availW / (p.width + p.depth), (availH - gapY) / (p.height + p.depth));
  const fw = p.width * s, sw = p.depth * s, H = p.height * s, td = p.depth * s;
  const fx = Math.max(29, (210 - (fw + gapX + sw)) / 2); // keep room for the H dimension
  const sx = fx + fw + gapX;
  const group = td + gapY + H;
  const topY = 136 + (availH - group) / 2;             // top of the plan view
  const baseY = topY + group;                          // bottom of front/side views
  topElevation(doc, p, fx, topY, s);
  frontElevation(doc, p, fx, baseY, s);
  sideElevation(doc, p, sx, baseY, s);
  dimH(doc, fx, fx + fw, baseY, String(p.width));
  dimV(doc, fx, baseY - H, baseY, String(p.height));
  dimH(doc, sx, sx + sw, baseY, String(p.depth));
  doc.setFontSize(7.5);
  doc.setTextColor(GREY);
  doc.text('TOP ELEVATION', fx + fw / 2, topY - 2.5, { align: 'center' });
  doc.text('FRONT ELEVATION', fx + fw / 2, baseY + 15, { align: 'center' });
  doc.text('SIDE ELEVATION', sx + sw / 2, baseY + 15, { align: 'center' });
  footer(doc, 1);

  // ---------- page 2: cut list ----------
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(INK);
  doc.text('Cut list', 15, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(GREY);
  doc.text(specLine(p), 15, 28.5);
  doc.setDrawColor(FAINT);
  doc.setLineWidth(0.3);
  doc.line(15, 32, 195, 32);

  const cols = [
    ['Part', 15, 'left'], ['Qty', 58, 'right'], ['L (mm)', 76, 'right'],
    ['W (mm)', 94, 'right'], ['T (mm)', 110, 'right'], ['Notes', 118, 'left'],
  ];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(GREY);
  for (const [h, x, align] of cols) doc.text(h, x, 40, { align });
  doc.setDrawColor(FAINT);
  doc.setLineWidth(0.2);
  doc.line(15, 42, 195, 42);

  let y = 48;
  for (const r of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const noteLines = doc.splitTextToSize(r.note, 77);
    doc.setFontSize(9.5);
    doc.setTextColor(INK);
    doc.text(r.part, 15, y);
    doc.text(String(r.qty), 58, y, { align: 'right' });
    doc.text(String(r.len), 76, y, { align: 'right' });
    doc.text(String(r.wid), 94, y, { align: 'right' });
    doc.text(String(r.t), 110, y, { align: 'right' });
    doc.setFontSize(7.5);
    doc.setTextColor(GREY);
    doc.text(noteLines, 118, y);
    y += Math.max(9, noteLines.length * 3.2 + 5.5);
    doc.setDrawColor(FAINT);
    doc.line(15, y - 5.5, 195, y - 5.5);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(INK);
  doc.text(wa(totals), 15, y + 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(GREY);
  doc.text('L × W are rectangular blanks; the sides are cut as full blanks, then notched at the back-bottom corner.', 15, y + 8);
  footer(doc, 2);

  doc.save(filename);
}
