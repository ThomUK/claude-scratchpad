// Run: node tests/engine.test.mjs   (from erd/)
import assert from 'node:assert/strict';
import { diagramFor, layout, visibleRows, routeEdge, edgeTitle, parseRoute, TABS, BOX, GROUP_ORDER } from '../engine.js';

let n = 0;
function check(name, fn) { fn(); n++; console.log('  ok  ' + name); }

const T = (layer, group, cols, pk = [cols[0]], sources = []) => ({ layer, group, rows_sample: 10, rows_full: 100, pk, pk_unique: true, columns: cols.map((c) => ({ name: c, type: 'VARCHAR' })), sources });
const erd = {
  version: 'v1',
  tables: {
    'layer1/pas_patients': T('layer1', 'PAS', ['mrn', 'nhs_number', 'dob']),
    'layer1/pas_adt_events': T('layer1', 'PAS', ['message_id', 'mrn', 'visit_number', 'site_code', 'ward', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']),
    'layer1/ed_attendances': T('layer1', 'ED system', ['uec_activity_identifier', 'mrn', 'nhs_number', 'site_of_treatment']),
    'reference/sites': T('reference', 'Estate', ['site_code', 'site_name']),
    'reference/wards': T('reference', 'Estate', ['ward_id', 'ward_name', 'site_code']),
    'derived/patients': T('derived', 'Master patient index', ['person_id', 'mrn']),
    'derived/mrn_map': T('derived', 'Master patient index', ['mrn', 'after_merge', 'person_mrn']),
    'derived/spells': T('derived', 'Admitted care', ['provspno', 'person_id', 'sitetret'], ['provspno'], ['layer1/pas_adt_events', 'derived/mrn_map']),
    'answers/truth/spells': T('answers', 'Truth', ['visit_number', 'mrn', 'site_code']),
  },
  links: [
    { from: 'layer1/pas_adt_events', column: 'mrn', to: 'layer1/pas_patients', to_column: 'mrn', kind: 'key', match_rate: 1, null_rate: 0, normalised: false, one_to_one: false, note: '' },
    { from: 'layer1/pas_adt_events', column: 'site_code', to: 'reference/sites', to_column: 'site_code', kind: 'key', match_rate: 1, null_rate: 0, normalised: false, one_to_one: false, note: '' },
    { from: 'layer1/pas_adt_events', column: 'ward', to: 'reference/wards', to_column: 'ward_name', kind: 'fuzzy', match_rate: 0.941, null_rate: 0.337, normalised: true, one_to_one: false, note: 'M-PAS-09' },
    { from: 'layer1/ed_attendances', column: 'mrn', to: 'layer1/pas_patients', to_column: 'mrn', kind: 'key', match_rate: 1, null_rate: 0.039, normalised: false, one_to_one: false, note: 'M-ED-01' },
    { from: 'layer1/ed_attendances', column: 'nhs_number', to: 'layer1/pas_patients', to_column: 'nhs_number', kind: 'fuzzy', match_rate: 0.979, null_rate: 0, normalised: false, one_to_one: false, note: 'M-ED-07' },
    { from: 'reference/wards', column: 'site_code', to: 'reference/sites', to_column: 'site_code', kind: 'key', match_rate: 1, null_rate: 0, normalised: false, one_to_one: false, note: '' },
    { from: 'derived/spells', column: 'person_id', to: 'derived/patients', to_column: 'person_id', kind: 'key', match_rate: 1, null_rate: 0, normalised: false, one_to_one: false, note: '' },
    { from: 'derived/mrn_map', column: 'after_merge', to: 'derived/mrn_map', to_column: 'mrn', kind: 'key', match_rate: 1, null_rate: 0, normalised: false, one_to_one: false, note: '' },
    { from: 'derived/patients', column: 'mrn', to: 'derived/mrn_map', to_column: 'mrn', kind: 'key', match_rate: 1, null_rate: 0, normalised: false, one_to_one: true, note: '' },
    { from: 'answers/truth/spells', column: 'mrn', to: 'layer1/pas_patients', to_column: 'mrn', kind: 'key', match_rate: 1, null_rate: 0, normalised: false, one_to_one: false, note: '' },
    { from: 'answers/truth/spells', column: 'site_code', to: 'reference/sites', to_column: 'site_code', kind: 'key', match_rate: 1, null_rate: 0, normalised: false, one_to_one: false, note: '' },
  ],
  rejected: [],
};

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

check('diagramFor layer1: own tables plus linked reference tables, no derived or answers tables', () => {
  const d = diagramFor(erd, 'layer1');
  const keys = d.boxes.map((b) => b.key).sort();
  assert.deepEqual(keys, ['layer1/ed_attendances', 'layer1/pas_adt_events', 'layer1/pas_patients', 'reference/sites', 'reference/wards']);
  assert.equal(d.boxes.find((b) => b.key === 'reference/sites').kind, 'reference');
  assert.equal(d.boxes.find((b) => b.key === 'layer1/pas_patients').kind, 'main');
  // the wards -> sites link is between two reference tables both present, so it is kept
  assert.equal(d.links.length, 6);
});

check('diagramFor without reference tables: reference boxes and their links are left out', () => {
  const d = diagramFor(erd, 'layer1', { reference: false });
  assert.deepEqual(d.boxes.map((b) => b.key).sort(), ['layer1/ed_attendances', 'layer1/pas_adt_events', 'layer1/pas_patients']);
  assert.equal(d.links.length, 3);
  assert.ok(d.links.every((l) => !l.to.startsWith('reference/')));
});

check('diagramFor answers: layer 1 parents appear as external boxes', () => {
  const d = diagramFor(erd, 'answers');
  const ext = d.boxes.filter((b) => b.kind === 'external').map((b) => b.key);
  assert.deepEqual(ext, ['layer1/pas_patients']);
  assert.equal(d.boxes.find((b) => b.kind === 'external').group, 'Layer 1');
});

check('visibleRows: collapsed shows keys and linked columns with a "more" count; expanded shows everything', () => {
  const d = diagramFor(erd, 'layer1');
  const adt = d.boxes.find((b) => b.key === 'layer1/pas_adt_events');
  const c = visibleRows(d, adt, false);
  assert.deepEqual(c.rows.map((r) => r.name), ['message_id', 'mrn', 'site_code', 'ward']);
  assert.equal(c.more, 9);
  assert.ok(c.rows[0].isPk && !c.rows[0].isLink && c.rows[1].isLink);
  const e = visibleRows(d, adt, true);
  assert.equal(e.rows.length, 13); assert.equal(e.more, 0);
});

check('layout: boxes never overlap, main groups precede reference groups, edges join existing boxes', () => {
  for (const tab of TABS) {
    const d = diagramFor(erd, tab.id);
    const L = layout(d);
    for (let i = 0; i < L.boxes.length; i++) for (let j = i + 1; j < L.boxes.length; j++) assert.ok(!overlaps(L.boxes[i], L.boxes[j]), `${tab.id}: ${L.boxes[i].key} overlaps ${L.boxes[j].key}`);
    const kinds = L.columns.map((c) => c.kind);
    const lastMain = kinds.lastIndexOf('main'); const firstRef = kinds.indexOf('reference');
    if (firstRef >= 0) assert.ok(lastMain < firstRef, `${tab.id}: reference column before a main column`);
    const keys = new Set(L.boxes.map((b) => b.key));
    for (const e of L.edges) { assert.ok(keys.has(e.from) && keys.has(e.to)); assert.match(e.path, /^M /); }
    assert.ok(L.width > 0 && L.height > 0);
    for (const b of L.boxes) assert.ok(b.x + b.w <= L.width && b.y + b.h <= L.height, `${tab.id}: ${b.key} outside the canvas`);
  }
});

check('layout: groups follow GROUP_ORDER and boxes within a group are alphabetical', () => {
  const L = layout(diagramFor(erd, 'layer1'));
  assert.deepEqual(L.columns.map((c) => c.group), ['PAS', 'ED system', 'Estate']);
  const pas = L.boxes.filter((b) => b.group === 'PAS').map((b) => b.name);
  assert.deepEqual(pas, ['pas_adt_events', 'pas_patients']);
  assert.ok(GROUP_ORDER.indexOf('PAS') < GROUP_ORDER.indexOf('ED system'));
});

check('layout: expanding a box makes it taller and pushes the boxes below it down', () => {
  const d = diagramFor(erd, 'layer1');
  const a = layout(d); const b = layout(d, new Set(['layer1/pas_adt_events']));
  const ha = a.boxes.find((x) => x.key === 'layer1/pas_adt_events').h;
  const hb = b.boxes.find((x) => x.key === 'layer1/pas_adt_events').h;
  assert.ok(hb > ha);
  assert.ok(b.boxes.find((x) => x.key === 'layer1/pas_patients').y > a.boxes.find((x) => x.key === 'layer1/pas_patients').y);
  assert.equal(hb, BOX.header + BOX.pad + 13 * BOX.row + BOX.pad);
});

check('routeEdge: anchors sit on the box sides at the linked row; self-links loop off the right', () => {
  const d = diagramFor(erd, 'derived');
  const L = layout(d);
  const self = L.edges.find((e) => e.from === e.to);
  assert.ok(self, 'self link present');
  const box = L.boxes.find((b) => b.key === self.from);
  assert.equal(self.x1, box.x + box.w); assert.equal(self.x2, box.x + box.w);
  assert.ok(self.y1 !== self.y2);
  const e = L.edges.find((x) => x.from === 'derived/spells' && x.to === 'derived/patients');
  const from = L.boxes.find((b) => b.key === 'derived/spells'); const to = L.boxes.find((b) => b.key === 'derived/patients');
  assert.ok(e.x1 === from.x || e.x1 === from.x + from.w);
  assert.ok(e.x2 === to.x || e.x2 === to.x + to.w);
  assert.ok(e.y1 > from.y && e.y1 < from.y + from.h && e.y2 > to.y && e.y2 < to.y + to.h);
});

check('edgeTitle: rates, nulls, normalisation and the note', () => {
  const t = edgeTitle(erd.links[2]);
  assert.match(t, /pas_adt_events\.ward → wards\.ward_name/);
  assert.match(t, /fuzzy link/); assert.match(t, /94\.1% of values match after normalising/); assert.match(t, /33\.7% null/); assert.match(t, /M-PAS-09/);
  assert.doesNotMatch(edgeTitle(erd.links[0]), /null/);
});

check('parseRoute: tab and optional expanded table; unknown tab falls back to the first', () => {
  assert.deepEqual(parseRoute(''), { tab: 'layer1', expand: null });
  assert.deepEqual(parseRoute('#/derived'), { tab: 'derived', expand: null });
  assert.deepEqual(parseRoute('#/derived/derived/spells'), { tab: 'derived', expand: 'derived/spells' });
  assert.deepEqual(parseRoute('#/nope/x'), { tab: 'layer1', expand: null });
});

console.log(`\n${n} checks passed`);
