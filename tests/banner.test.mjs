// Run: node tests/banner.test.mjs   (from the repository root)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bannerModel } from '../banner.js';

let n = 0;
function check(name, fn) { fn(); n++; console.log('  ok  ' + name); }

check('bannerModel: nothing to show when there are no pending changes', () => {
  assert.equal(bannerModel(null), null);
  assert.equal(bannerModel({}), null);
  assert.equal(bannerModel({ changes: [] }), null);
});

check('bannerModel: title names the published build and every change is listed', () => {
  const m = bannerModel({ published_version: 'v1', published_build: '2026-10-21', note: 'n.', changes: ['a', 'b'] });
  assert.equal(m.title, 'Generator ahead of the published data (v1, built 2026-10-21).');
  assert.equal(m.note, 'n.');
  assert.deepEqual(m.changes, ['a', 'b']);
});

check('the committed pending-changes.json is well formed', () => {
  const p = JSON.parse(readFileSync(new URL('../pending-changes.json', import.meta.url), 'utf8'));
  assert.ok(typeof p.published_version === 'string' && /^v\d+$/.test(p.published_version));
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(p.published_build));
  assert.ok(Array.isArray(p.changes) && p.changes.every((c) => typeof c === 'string' && c.length > 10));
});

check('every page loads the shared banner module and none renders its own', () => {
  for (const f of ['index.html', 'viewer/index.html', 'erd/index.html']) {
    const html = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.match(html, /<div id="banner" hidden><\/div>/, f + ' has the banner slot');
    assert.match(html, /<script type="module" src="(\.\.\/)?banner\.js\?v=dev"><\/script>/, f + ' loads banner.js');
  }
  for (const f of ['viewer/app.js', 'viewer/engine.js', 'viewer/styles.css', 'erd/app.js', 'erd/styles.css', 'index.html']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /pending-changes|\.banner \{|Generator ahead/, f + ' has no banner code of its own');
  }
});

console.log(`\n${n} checks passed`);
