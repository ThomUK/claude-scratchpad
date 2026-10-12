// Run: node tests/engine.test.mjs   (from nhs-specialties/)
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from '../vendor/js-yaml.mjs';
import { loadData, validate, buildIndex, search, connections, buildGraph, neighbours, layout, declutter, overlaps, regionTree, collapseRegions, linkBasis } from '../engine.js';

const DATA = fileURLToPath(new URL('../data/', import.meta.url));
let n = 0;
function check(name, fn) { fn(); n++; console.log('  ok  ' + name); }

const data = await loadData((p) => readFile(DATA + p, 'utf8'), parseYaml);
const index = buildIndex(data);

check('the shipped data validates with no errors', () => {
  assert.deepEqual(validate(data), []);
});

const files = (await readdir(DATA + 'specialties')).filter((f) => f.endsWith('.yaml')).map((f) => f.slice(0, -5)).sort();
check('manifest lists exactly the factsheet files on disk', () => {
  assert.deepEqual([...data.manifestIds].sort(), files);
});

check('every active treatment function has exactly one home factsheet', () => {
  for (const t of index.treatmentFunctions.values()) {
    if (t.status === 'active') assert.ok(t.specialty, `TFC ${t.code} unmapped`);
  }
});

check('code lists look like the Data Dictionary (3-digit codes, known anchors)', () => {
  for (const c of [...index.mainSpecialties.keys(), ...index.treatmentFunctions.keys()]) assert.match(c, /^\d{3}$/);
  assert.equal(index.mainSpecialties.get('110').title, 'Trauma and Orthopaedics');
  assert.equal(index.treatmentFunctions.get('110').title, 'Trauma and Orthopaedic Service');
  assert.equal(index.mainSpecialties.get('191').status, 'retired');
  assert.equal(index.treatmentFunctions.get('191').status, 'active');
  assert.ok(index.treatmentFunctions.size >= 180);
});

check('validate catches a broken factsheet', () => {
  const bad = structuredClone(data);
  const s = bad.specialties.find((x) => x.id === 'cardiology');
  s.treatment_function_codes.push('100');            // owned by general surgery
  s.workforce.medical.pathways.push('consultant');   // a grade, not a pathway
  s.related.push('nope');
  const errs = validate(bad);
  assert.ok(errs.some((e) => e.includes('already belongs to')), 'duplicate TFC');
  assert.ok(errs.some((e) => e.includes('is a grade')), 'wrong kind');
  assert.ok(errs.some((e) => e.includes('"nope"')), 'bad related');
});

check('validate catches an orphaned treatment function and an id/file mismatch', () => {
  const bad = structuredClone(data);
  const s = bad.specialties.find((x) => x.id === 'dermatology');
  s.treatment_function_codes = [];
  s.id = 'skin';
  const errs = validate(bad);
  assert.ok(errs.some((e) => e.includes('330 has no factsheet')));
  assert.ok(errs.some((e) => e.includes('does not match its file name')));
});

check('index maps codes back to factsheets', () => {
  assert.deepEqual(index.mainSpecialties.get('320').specialties, ['cardiology']);
  assert.equal(index.treatmentFunctions.get('306').specialty, 'gastroenterology');
  assert.deepEqual(index.mainSpecialties.get('500').specialties.sort(), ['gynaecology', 'obstetrics']);
});

check('search: by name, by code, by TFC title, by role', () => {
  assert.equal(search(index, 'cardiology')[0].id, 'cardiology');
  assert.equal(search(index, '110')[0].id, 'trauma-and-orthopaedics');
  assert.equal(search(index, '306')[0].id, 'gastroenterology');
  assert.equal(search(index, 'bariatric')[0].id, 'general-surgery');
  assert.ok(search(index, 'intensivist').some((r) => r.id === 'renal-medicine'));
  assert.equal(search(index, '').length, index.specialties.size);
});

check('connections: shared pathways and special interests, strongest first', () => {
  const c = connections(index, 'emergency-medicine');
  const ids = c.map((x) => x.id);
  assert.ok(ids.includes('intensive-care-medicine'));
  assert.ok(ids.includes('paediatrics'));
  const icm = c.find((x) => x.id === 'intensive-care-medicine');
  assert.ok(icm.via.includes('intensivist') && icm.via.includes('pre-hospital-emergency-medicine'));
  for (let i = 1; i < c.length; i++) assert.ok(c[i - 1].via.length >= c[i].via.length);
});

check('graph: grades hidden by default, edges only to included nodes', () => {
  const g = buildGraph(index);
  assert.ok(!g.nodes.some((x) => x.kind === 'grade'));
  const ids = new Set(g.nodes.map((x) => x.id));
  for (const e of g.edges) assert.ok(ids.has(e.source) && ids.has(e.target));
  const withGrades = buildGraph(index, { kinds: ['grade', 'pathway', 'special-interest'] });
  assert.ok(withGrades.edges.length > g.edges.length);
  assert.ok(neighbours(withGrades, 'r:consultant').size > 50);
});

check('graph: group filter and minDegree', () => {
  const g = buildGraph(index, { groups: ['surgical'], minDegree: 2 });
  assert.ok(g.nodes.filter((x) => x.type === 'specialty').every((x) => x.group === 'surgical'));
  assert.ok(g.nodes.filter((x) => x.type === 'role').every((x) => x.degree >= 2));
  assert.ok(neighbours(g, 'r:core-surgical-training').has('s:general-surgery'));
});

check('graph: specialties with no link in view are listed as isolated, not drawn', () => {
  const g = buildGraph(index, { minDegree: 2 });
  assert.ok(g.isolated.includes('nursing'));
  assert.ok(!g.nodes.some((x) => x.id === 's:nursing'));
  assert.ok(g.nodes.filter((x) => x.type === 'specialty').every((x) => x.degree > 0));
  const kept = buildGraph(index, { minDegree: 2, keepIsolated: true });
  assert.ok(kept.nodes.some((x) => x.id === 's:nursing'));
});

check('layout: deterministic, finite and inside the canvas', () => {
  const g = buildGraph(index);
  const a = layout(g, { width: 800, height: 600, iterations: 60, seed: 7 });
  const b = layout(g, { width: 800, height: 600, iterations: 60, seed: 7 });
  assert.equal(a.size, g.nodes.length);
  for (const [id, p] of a) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    assert.ok(p.x >= 0 && p.x <= 800 && p.y >= 0 && p.y <= 600);
    assert.deepEqual(p, b.get(id));
  }
});

check('layout: linked nodes end up closer than the average pair', () => {
  const g = buildGraph(index);
  const pos = layout(g, { width: 1000, height: 800, iterations: 200 });
  const dist = (a, b) => Math.hypot(pos.get(a).x - pos.get(b).x, pos.get(a).y - pos.get(b).y);
  const edgeMean = g.edges.reduce((s, e) => s + dist(e.source, e.target), 0) / g.edges.length;
  let all = 0; let cnt = 0;
  for (let i = 0; i < g.nodes.length; i += 3) for (let j = i + 1; j < g.nodes.length; j += 3) { all += dist(g.nodes[i].id, g.nodes[j].id); cnt++; }
  assert.ok(edgeMean < all / cnt, `${edgeMean} vs ${all / cnt}`);
});

check('layout: hubs do not knot the graph (IMT spokes no longer cross everything)', () => {
  const g = buildGraph(index, { minDegree: 2 });
  const pos = layout(g, { width: 1100, height: 700, iterations: 320, seed: 3 });
  const L = g.edges.map((e) => [pos.get(e.source), pos.get(e.target)]);
  const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  let crossings = 0;
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const [a, b] = L[i]; const [c, d] = L[j];
    if (a === c || a === d || b === c || b === d) continue;
    if (ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d)) crossings++;
  }
  assert.ok(crossings < 800, `${crossings} edge crossings`);
});

check('declutter: removes every node/label overlap and reports bounds', () => {
  const g = buildGraph(index, { kinds: ['grade', 'pathway', 'special-interest'], minDegree: 1 });
  const boxes = new Map(g.nodes.map((x) => [x.id, { w: Math.min(x.label.length, 30) * 6.5, h: 26, dy: -8 }]));
  const raw = layout(g, { width: 900, height: 600, iterations: 120 });
  assert.ok(overlaps(raw, boxes) > 0, 'the raw layout should have overlaps to fix');
  const { pos, bounds } = declutter(raw, boxes);
  assert.equal(overlaps(pos, boxes), 0);
  for (const [id, p] of pos) {
    const b = boxes.get(id);
    assert.ok(p.x - b.w / 2 >= bounds.x0 - 1e-6 && p.x + b.w / 2 <= bounds.x1 + 1e-6);
    assert.ok(p.y + b.dy - b.h / 2 >= bounds.y0 - 1e-6 && p.y + b.dy + b.h / 2 <= bounds.y1 + 1e-6);
  }
});

check('regionTree: spanning tree joins all points, long links split islands', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 500, y: 0 }, { x: 510, y: 0 }];
  const all = regionTree(pts);
  assert.equal(all.links.length, 4);
  assert.equal(all.islands.length, 1);
  const split = regionTree(pts, { maxLink: 50 });
  assert.equal(split.links.length, 3);
  assert.deepEqual(split.bridges, [[2, 3]]);
  assert.deepEqual(split.islands.map((i) => i.sort((a, b) => a - b)), [[0, 1, 2], [3, 4]]);
  assert.deepEqual(regionTree([]), { links: [], bridges: [], islands: [] });
});

check('collapseRegions: pathways leave the layout graph and become weak member-to-member pulls', () => {
  const g = buildGraph(index, { minDegree: 2 });
  const { graph, regions } = collapseRegions(g, (x) => x.kind === 'pathway');
  assert.ok(!graph.nodes.some((x) => x.kind === 'pathway'));
  const imt = regions.find((r) => r.id === 'r:internal-medicine-training');
  assert.ok(imt.members.includes('s:cardiology') && imt.members.length > 30);
  const pull = graph.edges.filter((e) => e.weight && (e.source === 's:cardiology' || e.target === 's:cardiology')).reduce((t, e) => t + e.weight, 0);
  assert.ok(pull > 1 && pull < 4, `total pull on cardiology ${pull}`);
  const ids = new Set(graph.nodes.map((x) => x.id));
  for (const e of graph.edges) assert.ok(ids.has(e.source) && ids.has(e.target));
});

check('linkBasis: same-code links vs curated groupings', () => {
  assert.equal(linkBasis(index, '320'), 'code-match');
  assert.equal(linkBasis(index, '103'), 'curated');
  assert.equal(linkBasis(index, '510'), null); // retired, no factsheet
  const counts = { 'code-match': 0, curated: 0 };
  for (const t of index.treatmentFunctions.values()) if (t.specialty) counts[linkBasis(index, t.code)]++;
  assert.ok(counts['code-match'] > 60 && counts.curated > 100, JSON.stringify(counts));
});

check('Data Dictionary table: not-a-treatment-function codes are known and refused on factsheets', () => {
  const m = index.mainSpecialties.get('823');
  assert.equal(m.notTreatmentFunction, true);
  assert.equal(m.notTreatmentFunctionComment, 'See Clinical Haematology');
  assert.ok(!index.treatmentFunctions.has('810'));
  assert.equal(index.treatmentFunctions.get('990').status, 'retired');
  const bad = structuredClone(data);
  bad.specialties.find((x) => x.id === 'radiology').treatment_function_codes.push('810');
  assert.ok(validate(bad).some((e) => e.includes('810 is listed in the Data Dictionary as "not a Treatment Function"')));
});

check('Data Dictionary table: every main specialty code has a factsheet or is retired / a combined code', () => {
  const orphans = [...index.mainSpecialties.values()].filter((m) => m.status === 'active' && !m.specialties.length).map((m) => m.code);
  assert.deepEqual(orphans, []);
});

console.log(`\n${n} checks passed`);
