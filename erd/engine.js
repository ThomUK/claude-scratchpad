// ERD engine: DOM-free. Picks the tables for a layer's diagram out of
// erd.json, lays the boxes out in group columns and routes the links as SVG
// paths. Tested by tests/engine.test.mjs.

export const TABS = [
  { id: 'layer1', label: 'Layer 1: source extracts', blurb: 'The extracts as the source systems hand them over. Each system is a column; the identifiers that cross between systems are the dashed links, with the share of values that actually match.' },
  { id: 'derived', label: 'Layer 2: derived entities', blurb: 'Rebuilt from layer 1 by sql/derive: one row per person, spell, episode, stay, attendance, appointment, pathway, exam and procedure. Every box lists the tables it is built from.' },
  { id: 'aggregate', label: 'Layer 3: aggregates', blurb: 'National-return shapes computed from layer 2 by sql/aggregate. They link only to the reference tables; the rows are counts, not things.' },
  { id: 'answers', label: 'Answers', blurb: 'The mess log and the clean truth tables the derived layer is marked against. They describe layer 1 entities, so they link back to the layer 1 keys.' },
];

export const GROUP_ORDER = [
  'PAS', 'ED system', 'Radiology (RIS)', 'Endoscopy vendor',
  'Master patient index', 'Admitted care', 'Emergency care', 'Outpatients and RTT', 'Imaging', 'Endoscopy', 'Diagnostics',
  'Mess log', 'Truth', 'Other', 'Layer 1', 'Estate', 'Services', 'Code lists',
];

export const BOX = { w: 250, refW: 210, header: 30, row: 17, pad: 6, gapY: 22, gapX: 90, margin: 24, maxRowsCollapsed: 8 };

export function shortName(key) {
  return key.split('/').slice(1).join('/');
}

export function layerOf(key) {
  return key.split('/')[0];
}

// The tables that belong on a layer's diagram: the layer's own tables, the
// reference tables they link to, and (for cross-layer links) the parent
// tables from other layers, drawn as external boxes.
export function diagramFor(erd, layer, opts = {}) {
  const showRef = opts.reference !== false;
  const own = Object.keys(erd.tables).filter((k) => layerOf(k) === layer);
  const ownSet = new Set(own);
  // links out of this layer's tables, plus links between the reference tables they pull in
  const out = erd.links.filter((l) => ownSet.has(l.from) && (showRef || layerOf(l.to) !== 'reference' || layer === 'reference'));
  const keys = new Set(own);
  for (const l of out) { keys.add(l.from); keys.add(l.to); }
  const links = erd.links.filter((l) => (ownSet.has(l.from) && keys.has(l.to)) || (keys.has(l.from) && keys.has(l.to) && layerOf(l.from) === 'reference'));
  const boxes = [...keys].map((k) => {
    const t = erd.tables[k];
    const kind = ownSet.has(k) ? 'main' : (layerOf(k) === 'reference' ? 'reference' : 'external');
    const group = kind === 'external' ? (layerOf(k) === 'layer1' ? 'Layer 1' : 'Other') : t.group;
    return { key: k, name: shortName(k), layer: t.layer, group, kind, columns: t.columns, pk: t.pk, pkUnique: t.pk_unique,
             rowsSample: t.rows_sample, rowsFull: t.rows_full, sources: t.sources || [] };
  });
  const present = new Set(boxes.map((b) => b.key));
  return { layer, boxes, links: links.filter((l) => present.has(l.from) && present.has(l.to)) };
}

function linkedColumns(diagram, key) {
  const s = new Set();
  for (const l of diagram.links) {
    if (l.from === key) s.add(l.column);
    if (l.to === key) s.add(l.to_column);
  }
  return s;
}

// Rows shown inside a box: all columns when expanded, else the keys and the
// linked columns (up to a limit) and a "+ n more" line.
export function visibleRows(diagram, box, expanded) {
  const linked = linkedColumns(diagram, box.key);
  const pk = new Set(box.pk);
  const rows = box.columns.map((c) => ({ name: c.name, type: c.type, isPk: pk.has(c.name), isLink: linked.has(c.name) }));
  if (expanded) return { rows, more: 0 };
  let shown = rows.filter((r) => r.isPk || r.isLink);
  if (shown.length > BOX.maxRowsCollapsed) shown = shown.slice(0, BOX.maxRowsCollapsed);
  return { rows: shown, more: rows.length - shown.length };
}

export function boxHeight(nRows, more, sources) {
  return BOX.header + BOX.pad + nRows * BOX.row + (more ? BOX.row : 0) + (sources ? BOX.row : 0) + BOX.pad;
}

// Place boxes in columns: one column per group in GROUP_ORDER, main groups
// first, then external, then reference groups.
export function layout(diagram, expandedSet = new Set()) {
  const groups = new Map();
  for (const b of diagram.boxes) {
    if (!groups.has(b.group)) groups.set(b.group, []);
    groups.get(b.group).push(b);
  }
  const rank = (g, kind) => (kind === 'main' ? 0 : kind === 'external' ? 1 : 2) * 100 + (GROUP_ORDER.indexOf(g) + 1 || 99);
  const ordered = [...groups.entries()].sort((a, b) => rank(a[0], a[1][0].kind) - rank(b[0], b[1][0].kind));
  const boxes = [];
  let x = BOX.margin;
  let maxY = 0;
  const columns = [];
  for (const [group, items] of ordered) {
    const w = items[0].kind === 'main' ? BOX.w : BOX.refW;
    let y = BOX.margin + 22; // room for the group label
    items.sort((a, b) => a.name.localeCompare(b.name));
    for (const b of items) {
      const expanded = expandedSet.has(b.key);
      const { rows, more } = visibleRows(diagram, b, expanded);
      const h = boxHeight(rows.length, more, b.sources.length && b.kind === 'main');
      boxes.push({ ...b, x, y, w, h, rows, more, expanded });
      y += h + BOX.gapY;
    }
    columns.push({ group, x, w, kind: items[0].kind });
    maxY = Math.max(maxY, y);
    x += w + BOX.gapX;
  }
  const byKey = new Map(boxes.map((b) => [b.key, b]));
  const edges = diagram.links.map((l, i) => routeEdge(l, byKey.get(l.from), byKey.get(l.to), i));
  const width = boxes.length ? x - BOX.gapX + BOX.margin : 2 * BOX.margin;
  const height = boxes.length ? maxY - BOX.gapY + BOX.margin : 2 * BOX.margin;
  return { width, height, boxes, columns, edges };
}

function rowY(box, column) {
  const i = box.rows.findIndex((r) => r.name === column);
  if (i < 0) return box.y + BOX.header / 2;
  return box.y + BOX.header + BOX.pad + i * BOX.row + BOX.row / 2;
}

export function routeEdge(link, from, to, i) {
  const y1 = rowY(from, link.column);
  const y2 = rowY(to, link.to_column);
  let path, x1, x2;
  if (from.key === to.key) {
    // self-reference: a loop off the right-hand side
    x1 = from.x + from.w; x2 = x1;
    path = `M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x1 + 40} ${y2}, ${x2} ${y2}`;
  } else if (to.x >= from.x + from.w) {
    x1 = from.x + from.w; x2 = to.x;
    const dx = Math.max(40, (x2 - x1) / 2);
    path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  } else if (from.x >= to.x + to.w) {
    x1 = from.x; x2 = to.x + to.w;
    const dx = Math.max(40, (x1 - x2) / 2);
    path = `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`;
  } else {
    // same column: route out to the right and back
    x1 = from.x + from.w; x2 = to.x + to.w;
    path = `M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 + 60} ${y2}, ${x2} ${y2}`;
  }
  return { id: `e${i}`, link, from: from.key, to: to.key, x1, y1, x2, y2, path };
}

export function fmtInt(n) {
  return n == null ? '' : Number(n).toLocaleString('en-GB');
}

export function pct(x) {
  return `${Math.round(x * 1000) / 10}%`;
}

export function edgeTitle(link) {
  const parts = [`${shortName(link.from)}.${link.column} → ${shortName(link.to)}.${link.to_column}`];
  parts.push(link.kind === 'key' ? 'key link' : 'fuzzy link');
  parts.push(`${pct(link.match_rate)} of values match${link.normalised ? ' after normalising case and spacing' : ''}`);
  if (link.null_rate > 0) parts.push(`${pct(link.null_rate)} null`);
  if (link.note) parts.push(link.note);
  return parts.join('. ');
}

export function parseRoute(hash) {
  const h = (hash || '').replace(/^#\/?/, '');
  const [tab, ...rest] = h.split('/');
  const valid = TABS.some((t) => t.id === tab);
  return { tab: valid ? tab : TABS[0].id, expand: valid && rest.length ? rest.join('/') : null };
}
