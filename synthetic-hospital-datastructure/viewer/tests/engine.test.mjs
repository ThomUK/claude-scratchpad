// Run: node tests/engine.test.mjs   (from synthetic-hospital-datastructure/viewer/)
import assert from 'node:assert/strict';
import { buildIndex, assetName, releaseUrl, sampleUrl, previewPath, formatCell, fmtBytes, fmtInt, parseRoute, routeFor, LAYERS, isNumericType } from '../engine.js';

let n = 0;
function check(name, fn) { fn(); n++; console.log('  ok  ' + name); }

const manifest = {
  version: 'v1',
  full: {
    'layer1/pas_adt_events': { rows: 2723958, files: [
      { path: 'v1/full/layer1/pas_adt_events/fy2015.parquet', bytes: 2669, sha256: 'a' },
      { path: 'v1/full/layer1/pas_adt_events/fy2023.parquet', bytes: 18000000, sha256: 'b' }] },
    'derived/spells': { rows: 765317, files: [{ path: 'v1/full/derived/spells.parquet', bytes: 20267486, sha256: 'c' }] },
    'reference/sites': { rows: 2, files: [{ path: 'v1/full/reference/sites.parquet', bytes: 1000, sha256: 'd' }] },
  },
  sample: {
    'layer1/pas_adt_events': { rows: 137824, files: [{ path: 'v1/sample/layer1/pas_adt_events.parquet', bytes: 3056598, sha256: 'e' }] },
    'derived/spells': { rows: 38594, files: [{ path: 'v1/sample/derived/spells.parquet', bytes: 1000000, sha256: 'f' }] },
    'reference/sites': { rows: 2, files: [{ path: 'v1/sample/reference/sites.parquet', bytes: 1000, sha256: 'g' }] },
    'sample-csv.zip': { files: [{ path: 'v1/sample/sample-csv.zip', bytes: 69848533, sha256: 'h' }], note: 'csv' },
  },
  totals: { full_bytes: 1, sample_bytes: 2 },
};

check('buildIndex: groups tables by layer in LAYERS order and keeps the zip as an extra', () => {
  const idx = buildIndex(manifest);
  assert.equal(idx.version, 'v1');
  assert.deepEqual(idx.groups.map((g) => g.id), ['layer1', 'reference', 'derived']);
  const order = LAYERS.map((l) => l.id);
  for (let i = 1; i < idx.groups.length; i++) assert.ok(order.indexOf(idx.groups[i - 1].id) < order.indexOf(idx.groups[i].id));
  assert.equal(idx.extras.length, 1);
  assert.equal(idx.extras[0].key, 'sample-csv.zip');
});

check('buildIndex: a table carries full and sample rows, bytes summed over partitions, and a description', () => {
  const idx = buildIndex(manifest);
  const adt = idx.groups[0].tables.find((t) => t.key === 'layer1/pas_adt_events');
  assert.equal(adt.name, 'pas_adt_events');
  assert.equal(adt.full.rows, 2723958);
  assert.equal(adt.full.bytes, 18002669);
  assert.equal(adt.full.files.length, 2);
  assert.equal(adt.sample.rows, 137824);
  assert.match(adt.description, /HL7/);
});

check('buildIndex: a table present in only one part has null for the other', () => {
  const m = { version: 'v1', full: { 'derived/x': { rows: 1, files: [{ path: 'v1/full/derived/x.parquet', bytes: 1 }] } }, sample: {} };
  const idx = buildIndex(m);
  const x = idx.groups[0].tables[0];
  assert.equal(x.sample, null);
  assert.equal(x.full.rows, 1);
});

check('assetName and releaseUrl: path under full/ with / replaced by __', () => {
  assert.equal(assetName('v1/full/layer1/pas_adt_events/fy2023.parquet'), 'layer1__pas_adt_events__fy2023.parquet');
  assert.equal(assetName('v1/full/derived/spells.parquet'), 'derived__spells.parquet');
  assert.equal(releaseUrl('v1', 'v1/full/derived/spells.parquet'),
    'https://github.com/ThomUK/claude-scratchpad/releases/download/synthetic-hospital-datastructure-v1/derived__spells.parquet');
});

check('sampleUrl and previewPath', () => {
  assert.equal(sampleUrl('v1/sample/derived/spells.parquet'),
    'https://thomuk.github.io/claude-scratchpad/synthetic-hospital-datastructure/data/v1/sample/derived/spells.parquet');
  assert.equal(previewPath('../data/v1/', 'full', 'answers/truth/spells'), '../data/v1/preview/full/answers__truth__spells.json');
});

check('formatCell: null stays null, booleans and arrays render, doubles are rounded to 4 places', () => {
  assert.equal(formatCell(null, 'VARCHAR'), null);
  assert.equal(formatCell(undefined, 'VARCHAR'), null);
  assert.equal(formatCell(true, 'BOOLEAN'), 'true');
  assert.equal(formatCell(['a', null, 'b'], 'VARCHAR[]'), 'a, null, b');
  assert.equal(formatCell(1234567, 'BIGINT'), '1234567');
  assert.equal(formatCell(3.14159265, 'DOUBLE'), '3.1416');
  assert.equal(formatCell(2, 'DOUBLE'), '2');
  assert.equal(formatCell('2024-05-08 15:46:20', 'TIMESTAMP'), '2024-05-08 15:46:20');
});

check('isNumericType', () => {
  assert.ok(isNumericType('BIGINT')); assert.ok(isNumericType('DOUBLE')); assert.ok(!isNumericType('VARCHAR')); assert.ok(!isNumericType('TIMESTAMP'));
});

check('fmtBytes and fmtInt', () => {
  assert.equal(fmtBytes(500), '500 B');
  assert.equal(fmtBytes(20267486), '19 MB');
  assert.equal(fmtBytes(3056598), '2.9 MB');
  assert.equal(fmtBytes(1069316034), '1020 MB');
  assert.equal(fmtBytes(1200000000), '1.12 GB');
  assert.equal(fmtInt(2723958), '2,723,958');
  assert.equal(fmtInt(null), '');
});

check('parseRoute and routeFor round-trip', () => {
  assert.deepEqual(parseRoute(''), { view: 'index' });
  assert.deepEqual(parseRoute('#/'), { view: 'index' });
  assert.deepEqual(parseRoute('#/full/answers/truth/spells'), { view: 'table', part: 'full', key: 'answers/truth/spells' });
  assert.deepEqual(parseRoute(routeFor('sample', 'derived/spells')), { view: 'table', part: 'sample', key: 'derived/spells' });
  assert.deepEqual(parseRoute('#/bogus/x'), { view: 'index' });
});

console.log(`\n${n} checks passed`);
