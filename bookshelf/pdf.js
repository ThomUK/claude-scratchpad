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
  (p.qty > 1 ? `${p.qty} bookcases  ·  ` : '') +
  `${p.width} × ${p.depth} × ${p.height} mm  ·  ply ${p.thickness} mm  ·  plinth ${p.plinth} mm  ·  ` +
  `skirting cutout ${p.cutout} mm  ·  front setback ${p.setback} mm  ·  ` +
  `${p.shelves} ${p.shelves === 1 ? 'shelf' : 'shelves'}  ·  ${p.back ? `${p.backT} mm back` : 'no back'}`;

// Title + wrapped spec line + divider; returns the divider's y so content
// below shifts down when the spec wraps (it can, with a quantity prefix).
function pageHeader(doc, title, titleSize, p) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleSize);
  doc.setTextColor(INK);
  doc.text(title, 15, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(GREY);
  const lines = doc.splitTextToSize(specLine(p), 180);
  doc.text(lines, 15, 28.5);
  const yDiv = 28.5 + (lines.length - 1) * 3.4 + 3.5;
  doc.setDrawColor(FAINT);
  doc.setLineWidth(0.3);
  doc.line(15, yDiv, 195, yDiv);
  return yDiv;
}

function footer(doc, page, total) {
  doc.setDrawColor(FAINT);
  doc.setLineWidth(0.2);
  doc.line(15, 284, 195, 284);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(GREY);
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Generated ${date}  ·  thomuk.github.io/claude-scratchpad/bookshelf`, 15, 289);
  doc.text(`page ${page} of ${total}`, 195, 289, { align: 'right' });
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
  // toe rail face (set back, so a shade lighter) first, lines over it
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
  const backClear = p.back ? p.backT + 1 : 0;   // rebate depth: back ply + 1 mm
  const board = (bot, dFrom, dTo) => {
    doc.line(x(dFrom), y(bot), x(dTo), y(bot));
    doc.line(x(dFrom), y(bot + p.thickness), x(dTo), y(bot + p.thickness));
  };
  board(p.plinth, 0, p.depth);
  board(p.height - p.thickness, 0, p.depth);
  // toe rail (toe-kick): on edge, floor to plinth, set back from the front
  if (p.plinth > 0) {
    doc.line(x(p.setback), y(0), x(p.setback), y(p.plinth));
    doc.line(x(p.setback + p.thickness), y(0), x(p.setback + p.thickness), y(p.plinth));
  }
  const n = p.shelves;
  const bay = (p.height - p.plinth - 2 * p.thickness - n * p.thickness) / (n + 1);
  for (let i = 0; i < n; i++) {
    board(p.plinth + p.thickness + (i + 1) * bay + i * p.thickness, p.setback, p.depth - backClear);
  }
  // back, rebated: sits 1 mm inside the rear edge, laps 3/4 T into top/bottom
  if (p.back) {
    const lap = 0.75 * p.thickness;
    const yBot = p.plinth + p.thickness - lap, yTop = p.height - p.thickness + lap;
    doc.line(x(p.depth - backClear), y(yBot), x(p.depth - backClear), y(yTop));
    doc.line(x(p.depth - 1), y(yBot), x(p.depth - 1), y(yTop));
  }
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
// toe rail at the setback, back panel) dashed. Front of the unit is the
// bottom edge, third-angle, so it sits directly above the front elevation.
function topElevation(doc, p, x0, yTop, s) {
  const W = p.width * s, D = p.depth * s, T = p.thickness * s;
  const yFront = yTop + D;                        // page y of the unit's front edge
  doc.setDrawColor(150);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([1.1, 1.1], 0);
  if (p.setback > 0) doc.line(x0 + T, yFront - p.setback * s, x0 + W - T, yFront - p.setback * s);
  if (p.back) {
    // rebated back: front face at (back + 1) mm from the rear, lapping 3/4 T
    // into each side
    const inset = (p.thickness - 0.75 * p.thickness) * s;
    doc.line(x0 + inset, yTop + (p.backT + 1) * s, x0 + W - inset, yTop + (p.backT + 1) * s);
  }
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(70);
  doc.line(x0 + T, yTop, x0 + T, yFront);
  doc.line(x0 + W - T, yTop, x0 + W - T, yFront);
  doc.setDrawColor(INK);
  doc.setLineWidth(0.45);
  doc.rect(x0, yTop, W, D);
}

// --- the document ------------------------------------------------------------------
export async function downloadPdf({ p, rows, stats, totals, sheets, image, filename }) {
  const jsPDF = await ensureJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // ---------- page 1: brochure ----------
  const hy1 = pageHeader(doc, 'Bookshelf — birch ply', 20, p);

  // 3D view, left (fitted to the frame preserving the capture's aspect —
  // the mobile fallback captures at the viewport's aspect, not 4:3);
  // readout stats, right
  const box = { x: 15, y: hy1 + 4, w: 108, h: 81 };
  const ar = image.w / image.h;
  let iw = box.w, ih = iw / ar;
  if (ih > box.h) { ih = box.h; iw = ih * ar; }
  const ix = box.x + (box.w - iw) / 2, iy = box.y + (box.h - ih) / 2;
  doc.addImage(image.data, 'JPEG', ix, iy, iw, ih);
  doc.setDrawColor(FAINT);
  doc.setLineWidth(0.25);
  doc.rect(ix, iy, iw, ih);
  let sy = hy1 + 14;
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

  // ---------- page 2: cut list ----------
  doc.addPage();
  const hy2 = pageHeader(doc, 'Cut list', 16, p);

  const cols = [
    ['Part', 15, 'left'], ['Qty', 50, 'right'], ['Total', 66, 'right'], ['L (mm)', 82, 'right'],
    ['W (mm)', 97, 'right'], ['T (mm)', 111, 'right'], ['Notes', 118, 'left'],
  ];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(GREY);
  for (const [h, x, align] of cols) doc.text(h, x, hy2 + 7, { align });
  doc.setDrawColor(FAINT);
  doc.setLineWidth(0.2);
  doc.line(15, hy2 + 9, 195, hy2 + 9);

  let y = hy2 + 15;
  for (const r of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const noteLines = doc.splitTextToSize(r.note, 77);
    doc.setFontSize(9.5);
    doc.setTextColor(INK);
    doc.text(r.part, 15, y);
    doc.text(String(r.qty), 50, y, { align: 'right' });
    doc.text(String(r.qty * p.qty), 66, y, { align: 'right' });
    doc.text(String(r.len), 82, y, { align: 'right' });
    doc.text(String(r.wid), 97, y, { align: 'right' });
    doc.text(String(r.t), 111, y, { align: 'right' });
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
  doc.text(doc.splitTextToSize(
    `Qty is per bookcase${p.qty > 1 ? `; Total covers all ${p.qty}` : ''}. ` +
    'L × W are rectangular blanks; the sides are cut as full blanks, then notched at the back-bottom corner. ' +
    'Sheet layouts on the next page.', 180), 15, y + 8);

  // ---------- page 3+: sheet layouts ----------
  sheetLayoutPages(doc, p, sheets);

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    footer(doc, i, total);
  }
  doc.save(filename);
}

// --- sheet layout pages ------------------------------------------------------------
// One drawn rectangle per 2440 × 1220 sheet, parts at their nested positions
// (long edge along the sheet length), labelled with name and size. Flows onto
// further pages as needed.
const SHEET_L = 2440, SHEET_W = 1220;

function sheetLayoutPages(doc, p, sheets) {
  const sc = 180 / SHEET_L;           // 180 mm drawing width
  const shH = SHEET_W * sc;           // ≈ 90 mm per sheet
  doc.addPage();
  const hy3 = pageHeader(doc, 'Sheet layouts', 16, p);
  const median = (arr) => {
    const s2 = [...arr].sort((a, b) => a - b);
    const m = s2.length >> 1;
    return s2.length % 2 ? s2[m] : Math.round((s2[m - 1] + s2[m]) / 2);
  };
  const summary = 'Sheets (2440 × 1220 mm): ' + sheets.map((g) => {
    const last = g.usage[g.n - 1];
    const dist = g.n > 1 ? `, median ${median(g.usage)}%, last ${last}% — ≈${100 - last}% of it spare`
      : g.n === 1 ? ` — ≈${100 - last}% of it spare` : '';
    return `${g.t} mm: ${g.n} ${g.n === 1 ? 'sheet' : 'sheets'} (${g.parts} ${g.parts === 1 ? 'part' : 'parts'}, ` +
      `${g.used}% overall${dist}${g.oversize ? `; ${g.oversize} too big for a sheet` : ''})`;
  }).join('  ·  ');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(INK);
  const sumLines = doc.splitTextToSize(wa(summary), 180);
  doc.text(sumLines, 15, hy3 + 6);
  const sumShift = (sumLines.length - 1) * 3.8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(GREY);
  const g0 = sheets[0];
  const anyRotated = sheets.some((g) => g.sheets.some((sh) => sh.some((q) => q.rotated)));
  const noteLines = doc.splitTextToSize(
    `Buying estimate: ${g0?.mode === 'maxrects' ? 'CNC freeform nest (MaxRects)' : 'straight-cut strip nest (guillotine)'}, ` +
    `best of ${g0?.runs ?? 0} part orderings, ${g0?.kerf ?? 4} mm kerf between cuts` +
    `${g0?.trim ? `, ${g0.trim} mm trimmed off every sheet edge (dashed line)` : ''}. Blank areas are offcut. ` +
    'Fine hatching is the sheet’s grain, running along its length.' +
    (anyRotated ? ' (R) = part rotated 90°: grain along its short edge.' : '') +
    (p.qty > 1 ? ' Circled numbers mark the bookcase each part belongs to.' : ''), 180);
  doc.text(noteLines, 15, hy3 + 11 + sumShift);
  let y = hy3 + 11 + sumShift + noteLines.length * 3 + 4;
  for (const g of sheets) {
    g.sheets.forEach((placed, i) => {
      if (y + 3 + shH > 278) { doc.addPage(); y = 24; }
      const used = Math.round(100 * placed.reduce((a, q) => a + q.L * q.W, 0) / (SHEET_L * SHEET_W));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(INK);
      doc.text(`${g.t} mm ply — sheet ${i + 1} of ${g.n}`, 15, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(GREY);
      doc.text(`${used}% of this sheet`, 195, y, { align: 'right' });
      y += 2;
      doc.setDrawColor(INK);
      doc.setLineWidth(0.4);
      doc.rect(15, y, SHEET_L * sc, shH);
      if (g.trim) {
        doc.setDrawColor(170);
        doc.setLineWidth(0.2);
        doc.setLineDashPattern([1, 1], 0);
        doc.rect(15 + g.trim * sc, y + g.trim * sc, (SHEET_L - 2 * g.trim) * sc, (SHEET_W - 2 * g.trim) * sc);
        doc.setLineDashPattern([], 0);
      }
      for (const q of placed) {
        const rx = 15 + (g.trim + q.x) * sc, ry = y + (g.trim + q.y) * sc, rw = q.L * sc, rh = q.W * sc;
        doc.setFillColor(243, 239, 230);
        doc.setDrawColor(110);
        doc.setLineWidth(0.25);
        doc.rect(rx, ry, rw, rh, 'FD');
        // faint hatch for the SHEET's grain, which always runs along the
        // sheet length — uniform across every part. A rotated part reveals
        // itself because the grain crosses its long edge, as in real wood.
        doc.setDrawColor(213, 204, 184);
        doc.setLineWidth(0.16);
        const step = 2.6;
        for (let gy2 = ry + step; gy2 < ry + rh - 0.5; gy2 += step) doc.line(rx + 0.5, gy2, rx + rw - 0.5, gy2);
        const name = q.label + (q.rotated ? ' (R)' : '');
        if (rh > rw && rw < 24) {
          // tall rect (a rotated part): run the label up the part instead
          if (rw >= 3.6 && rh >= 20) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5.8);
            doc.setTextColor(INK);
            doc.text(`${name}  ${q.L} × ${q.W}`, rx + rw / 2 + 0.8, ry + rh / 2, { align: 'center', angle: 90 });
          }
        } else if (rh >= 8) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(INK);
          doc.text(name, rx + rw / 2, ry + rh / 2 - 0.6, { align: 'center' });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(GREY);
          doc.text(`${q.L} × ${q.W}`, rx + rw / 2, ry + rh / 2 + 2.6, { align: 'center' });
        } else if (rh >= 3.6) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5.8);
          doc.setTextColor(INK);
          doc.text(`${name}  ${q.L} × ${q.W}`, rx + rw / 2, ry + rh / 2 + 0.8, { align: 'center' });
        }
        // circled bookcase number (only when building more than one)
        if (q.unit && rh >= 5.4 && rw >= 8) {
          const bx = rx + 3.1, by = ry + 3.1;
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(INK);
          doc.setLineWidth(0.3);
          doc.circle(bx, by, 2.1, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(INK);
          doc.text(String(q.unit), bx, by + 0.8, { align: 'center' });
        }
      }
      y += shH + 9;
    });
    if (g.oversize) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(GREY);
      doc.text(`${g.t} mm: ${g.oversize} ${g.oversize === 1 ? 'part exceeds' : 'parts exceed'} 2440 × 1220 mm and ${g.oversize === 1 ? 'is' : 'are'} not drawn.`, 15, y);
      y += 7;
    }
  }
}
