// NHS specialty index — DOM-free engine.
// Loads the YAML data (via injected readers), validates it, builds the code
// index, search, and the specialty <-> role graph with a deterministic layout.

export const ROLE_KINDS = ['grade', 'pathway', 'special-interest'];
const WORKFORCE_KEYS = { grade: 'grades', pathway: 'pathways', 'special-interest': 'special_interests' };

// ------------------------------------------------------------------ loading
// readText(path) -> Promise<string>, path relative to the app's data/ folder.
// parseYaml(text) -> object (js-yaml's load).
export async function loadData(readText, parseYaml) {
  const read = async (p) => parseYaml(await readText(p));
  const [manifest, roles, ms, tfc] = await Promise.all([
    read('specialties.yaml'), read('roles.yaml'),
    read('codes/main-specialties.yaml'), read('codes/treatment-functions.yaml'),
  ]);
  const specialties = await Promise.all(
    manifest.specialties.map((id) => read(`specialties/${id}.yaml`)));
  return {
    groups: manifest.groups, manifestIds: manifest.specialties,
    roles: roles.roles, mainSpecialties: ms.codes, treatmentFunctions: tfc.codes,
    notTreatmentFunctions: tfc.not_treatment_functions || [], specialties,
  };
}

// ------------------------------------------------------------------ validation
export function validate(data) {
  const errors = [];
  const err = (m) => errors.push(m);
  const groupIds = new Set(data.groups.map((g) => g.id));
  const roleById = new Map();
  for (const r of data.roles) {
    if (roleById.has(r.id)) err(`roles.yaml: duplicate role id "${r.id}"`);
    if (!ROLE_KINDS.includes(r.kind)) err(`roles.yaml: role "${r.id}" has unknown kind "${r.kind}"`);
    roleById.set(r.id, r);
  }
  const ms = new Map(data.mainSpecialties.map((c) => [String(c.code), c]));
  const tfc = new Map(data.treatmentFunctions.map((c) => [String(c.code), c]));
  const notTfc = new Set((data.notTreatmentFunctions || []).map((c) => String(c.code)));
  if (ms.size !== data.mainSpecialties.length) err('main-specialties.yaml: duplicate code');
  if (tfc.size !== data.treatmentFunctions.length) err('treatment-functions.yaml: duplicate code');

  const ids = new Set();
  const tfcOwner = new Map();
  data.specialties.forEach((s, i) => {
    const where = `specialties/${data.manifestIds[i]}.yaml`;
    if (!s || typeof s !== 'object') { err(`${where}: empty or not a mapping`); return; }
    if (s.id !== data.manifestIds[i]) err(`${where}: id "${s.id}" does not match its file name`);
    if (ids.has(s.id)) err(`${where}: duplicate id`);
    ids.add(s.id);
    for (const k of ['title', 'group', 'summary']) if (!s[k]) err(`${where}: missing ${k}`);
    if (s.group && !groupIds.has(s.group)) err(`${where}: unknown group "${s.group}"`);
    for (const c of s.main_specialty_codes || []) {
      if (!ms.has(String(c))) err(`${where}: unknown main specialty code ${c}`);
    }
    for (const c of s.treatment_function_codes || []) {
      const k = String(c);
      if (notTfc.has(k)) err(`${where}: ${c} is listed in the Data Dictionary as "not a Treatment Function"`);
      else if (!tfc.has(k)) err(`${where}: unknown treatment function code ${c}`);
      else if (tfc.get(k).status === 'retired') err(`${where}: treatment function ${c} is retired`);
      if (tfcOwner.has(k)) err(`${where}: treatment function ${c} already belongs to ${tfcOwner.get(k)}`);
      tfcOwner.set(k, s.id);
    }
    const med = (s.workforce && s.workforce.medical) || {};
    for (const [kind, key] of Object.entries(WORKFORCE_KEYS)) {
      for (const r of med[key] || []) {
        const role = roleById.get(r);
        if (!role) err(`${where}: unknown role "${r}" in workforce.medical.${key}`);
        else if (role.kind !== kind) err(`${where}: role "${r}" is a ${role.kind}, listed under ${key}`);
      }
    }
  });
  data.specialties.forEach((s, i) => {
    for (const r of (s && s.related) || []) {
      if (!ids.has(r)) err(`specialties/${data.manifestIds[i]}.yaml: related "${r}" is not a factsheet`);
    }
  });
  for (const [code, row] of tfc) {
    if (row.status !== 'retired' && !tfcOwner.has(code)) err(`treatment function ${code} has no factsheet`);
  }
  return errors;
}

// ------------------------------------------------------------------ index
export function buildIndex(data) {
  const specialties = new Map(data.specialties.map((s) => [s.id, normaliseSpecialty(s)]));
  const roles = new Map(data.roles.map((r) => [r.id, r]));
  const mainSpecialties = new Map(data.mainSpecialties.map((c) => [String(c.code), { ...c, code: String(c.code), specialties: [] }]));
  const treatmentFunctions = new Map(data.treatmentFunctions.map((c) => [String(c.code), { ...c, code: String(c.code), specialty: null }]));
  const roleSpecialties = new Map(data.roles.map((r) => [r.id, []]));
  // main specialty codes that Table 2 says are not treatment functions, with its pointer (e.g. "See Clinical Haematology")
  for (const c of data.notTreatmentFunctions || []) {
    const m = mainSpecialties.get(String(c.code));
    if (m) { m.notTreatmentFunction = true; m.notTreatmentFunctionComment = c.comment || null; }
  }
  for (const s of specialties.values()) {
    for (const c of s.mainSpecialtyCodes) mainSpecialties.get(c)?.specialties.push(s.id);
    for (const c of s.treatmentFunctionCodes) { const t = treatmentFunctions.get(c); if (t) t.specialty = s.id; }
    for (const r of s.roleIds) roleSpecialties.get(r)?.push(s.id);
  }
  return { groups: data.groups, specialties, roles, mainSpecialties, treatmentFunctions, roleSpecialties };
}

function normaliseSpecialty(s) {
  const med = (s.workforce && s.workforce.medical) || {};
  const byKind = {};
  for (const [kind, key] of Object.entries(WORKFORCE_KEYS)) byKind[kind] = (med[key] || []).slice();
  return {
    ...s,
    mainSpecialtyCodes: (s.main_specialty_codes || []).map(String),
    treatmentFunctionCodes: (s.treatment_function_codes || []).map(String),
    consultantTitle: med.consultant_title || null,
    rolesByKind: byKind,
    roleIds: ROLE_KINDS.flatMap((k) => byKind[k]),
    related: s.related || [],
    training: s.training || {},
  };
}

// Why a treatment function sits on its factsheet: 'code-match' when the factsheet's
// main specialty has the same code (e.g. TFC 320 Cardiology Service -> MS 320
// Cardiology); 'curated' when the grouping is an editorial choice made in the
// YAML (e.g. TFC 103 Breast Surgery Service -> General Surgery). null if unmapped.
export function linkBasis(index, tfcCode) {
  const t = index.treatmentFunctions.get(String(tfcCode));
  if (!t || !t.specialty) return null;
  return index.specialties.get(t.specialty).mainSpecialtyCodes.includes(t.code) ? 'code-match' : 'curated';
}

// Specialties sharing a pathway or special-interest role with `id`, strongest first.
export function connections(index, id, kinds = ['pathway', 'special-interest']) {
  const s = index.specialties.get(id);
  const shared = new Map();
  for (const kind of kinds) {
    for (const r of s.rolesByKind[kind]) {
      for (const other of index.roleSpecialties.get(r)) {
        if (other === id) continue;
        if (!shared.has(other)) shared.set(other, []);
        shared.get(other).push(r);
      }
    }
  }
  return [...shared.entries()]
    .map(([other, via]) => ({ id: other, via }))
    .sort((a, b) => b.via.length - a.via.length || cmpTitle(index, a.id, b.id));
}

const cmpTitle = (index, a, b) => index.specialties.get(a).title.localeCompare(index.specialties.get(b).title);

// ------------------------------------------------------------------ search
const norm = (t) => String(t).toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Returns [{id, score, why}] — matches on title, codes, TFC titles and role titles.
export function search(index, query) {
  const q = norm(query);
  if (!q) return [...index.specialties.keys()].sort((a, b) => cmpTitle(index, a, b)).map((id) => ({ id, score: 0, why: null }));
  const terms = q.split(' ');
  const out = [];
  for (const s of index.specialties.values()) {
    let score = 0; let why = null;
    const title = norm(s.title);
    if (title === q) score += 100;
    else if (title.startsWith(q)) score += 60;
    else if (terms.every((t) => title.includes(t))) score += 40;
    if (/^\d{3}$/.test(q)) {
      if (s.mainSpecialtyCodes.includes(q)) { score += 90; why = `Main specialty ${q}`; }
      if (s.treatmentFunctionCodes.includes(q)) { score += 80; why = `Treatment function ${q}`; }
    }
    if (!score) {
      for (const c of s.treatmentFunctionCodes) {
        const t = index.treatmentFunctions.get(c);
        if (t && terms.every((x) => norm(t.title).includes(x))) { score = 30; why = `TFC ${c} ${t.title}`; break; }
      }
    }
    if (!score && s.consultantTitle && terms.every((x) => norm(s.consultantTitle).includes(x))) { score = 25; why = s.consultantTitle; }
    if (!score) {
      for (const r of s.roleIds) {
        const role = index.roles.get(r);
        if (role.kind !== 'grade' && terms.every((x) => norm(role.title).includes(x))) { score = 20; why = role.title; break; }
      }
    }
    if (!score && terms.every((x) => norm(s.summary).includes(x))) { score = 10; why = 'summary'; }
    if (score) out.push({ id: s.id, score, why });
  }
  return out.sort((a, b) => b.score - a.score || cmpTitle(index, a.id, b.id));
}

// ------------------------------------------------------------------ graph
// opts: { kinds: role kinds to include, groups: specialty groups to include (null = all),
//         staffGroups: staff groups to include (null = all), minDegree: drop roles with fewer links,
//         keepIsolated: keep specialties with no link in view (default: list them in `isolated`) }
export function buildGraph(index, opts = {}) {
  const kinds = new Set(opts.kinds || ['pathway', 'special-interest']);
  const groups = opts.groups ? new Set(opts.groups) : null;
  const staff = opts.staffGroups ? new Set(opts.staffGroups) : null;
  const minDegree = opts.minDegree ?? 1;
  const nodes = []; const edges = [];
  const sIds = [...index.specialties.values()].filter((s) => !groups || groups.has(s.group)).map((s) => s.id);
  const inGraph = new Set(sIds);
  const roleLinks = new Map();
  for (const sid of sIds) {
    for (const r of index.specialties.get(sid).roleIds) {
      const role = index.roles.get(r);
      if (!kinds.has(role.kind) || (staff && !staff.has(role.staff_group))) continue;
      if (!roleLinks.has(r)) roleLinks.set(r, []);
      roleLinks.get(r).push(sid);
    }
  }
  for (const [r, list] of roleLinks) {
    if (list.length < minDegree) continue;
    const role = index.roles.get(r);
    nodes.push({ id: `r:${r}`, ref: r, type: 'role', kind: role.kind, staffGroup: role.staff_group, label: role.title });
    for (const sid of list) if (inGraph.has(sid)) edges.push({ source: `s:${sid}`, target: `r:${r}` });
  }
  const degree = new Map();
  for (const e of edges) { degree.set(e.source, (degree.get(e.source) || 0) + 1); degree.set(e.target, (degree.get(e.target) || 0) + 1); }
  // specialties with no link in view would only float free, so they are listed as `isolated` instead
  const isolated = [];
  const specNodes = [];
  for (const sid of sIds) {
    const s = index.specialties.get(sid);
    if (opts.keepIsolated || degree.has(`s:${sid}`)) specNodes.push({ id: `s:${sid}`, ref: sid, type: 'specialty', group: s.group, label: s.title });
    else isolated.push(sid);
  }
  const all = [...specNodes, ...nodes];
  for (const n of all) n.degree = degree.get(n.id) || 0;
  return { nodes: all, edges, isolated };
}

export function neighbours(graph, nodeId) {
  const out = new Set();
  for (const e of graph.edges) {
    if (e.source === nodeId) out.add(e.target);
    else if (e.target === nodeId) out.add(e.source);
  }
  return out;
}

// Deterministic force-directed layout, seeded so the same data always draws the
// same picture. Repulsion is degree-weighted (as in ForceAtlas2) so a hub such as
// Internal Medicine Training pushes its 30+ specialties out into a ring instead
// of pulling them into a knot; positions are then fitted to the canvas.
export function layout(graph, { width = 1000, height = 700, iterations = 300, seed = 1, spread = 0.7, gravity = 12, margin = 40, degRep = 0.5, massAttr = 0.5 } = {}) {
  const n = graph.nodes.length;
  if (!n) return new Map();
  const rand = mulberry32(seed);
  const idx = new Map(graph.nodes.map((node, i) => [node.id, i]));
  const x = new Float64Array(n); const y = new Float64Array(n);
  // start on a circle grouped by type/group so related nodes begin close
  const order = graph.nodes.map((node, i) => i).sort((a, b) => key(graph.nodes[a]).localeCompare(key(graph.nodes[b])));
  order.forEach((i, j) => {
    const a = (2 * Math.PI * j) / n;
    x[i] = width / 2 + (width / 3) * Math.cos(a) + (rand() - 0.5) * 10;
    y[i] = height / 2 + (height / 3) * Math.sin(a) + (rand() - 0.5) * 10;
  });
  const E = graph.edges.map((e) => [idx.get(e.source), idx.get(e.target), e.weight ?? 1]);
  const deg = new Float64Array(n);
  for (const [a, b, w] of E) { deg[a] += w; deg[b] += w; }
  const mass = Float64Array.from(deg, (d) => (d + 1) ** degRep);
  const amass = Float64Array.from(deg, (d) => (d + 1) ** massAttr);
  const meanA = amass.reduce((t, m) => t + m, 0) / n;
  const meanMass = mass.reduce((t, m) => t + m, 0) / n;
  const k = Math.sqrt((width * height) / n) * spread;
  const dx = new Float64Array(n); const dy = new Float64Array(n);
  let t = width / 8;
  const cool = t / (iterations + 1);
  for (let it = 0; it < iterations; it++) {
    dx.fill(0); dy.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ddx = x[i] - x[j]; let ddy = y[i] - y[j];
        let d2 = ddx * ddx + ddy * ddy;
        if (d2 < 0.01) { ddx = rand() - 0.5; ddy = rand() - 0.5; d2 = 0.01; }
        const f = (k * k * mass[i] * mass[j]) / (meanMass * meanMass * d2);
        dx[i] += ddx * f; dy[i] += ddy * f; dx[j] -= ddx * f; dy[j] -= ddy * f;
      }
    }
    for (const [a, b, w] of E) {
      const ddx = x[a] - x[b]; const ddy = y[a] - y[b];
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
      const f = (w * d) / k;
      // each end moves in inverse proportion to its mass, so hubs stay put and leaves come to them
      dx[a] -= ddx * f / amass[a] * meanA; dy[a] -= ddy * f / amass[a] * meanA;
      dx[b] += ddx * f / amass[b] * meanA; dy[b] += ddy * f / amass[b] * meanA;
    }
    for (let i = 0; i < n; i++) {
      // constant-magnitude pull to the centre keeps disconnected clusters on screen
      const gx = width / 2 - x[i]; const gy = (height / 2 - y[i]) * (width / height);
      const gd = Math.sqrt(gx * gx + gy * gy) || 1;
      dx[i] += (gx / gd) * gravity * k; dy[i] += (gy / gd) * gravity * k;
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1;
      const step = Math.min(d, t);
      x[i] += (dx[i] / d) * step; y[i] += (dy[i] / d) * step;
    }
    t = Math.max(t - cool, 0.5);
  }
  // fit the result into the canvas (no clamping during the run, so nothing piles up on the border)
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, x[i]); x1 = Math.max(x1, x[i]); y0 = Math.min(y0, y[i]); y1 = Math.max(y1, y[i]); }
  const sx = (width - 2 * margin) / Math.max(x1 - x0, 1e-9); const sy = (height - 2 * margin) / Math.max(y1 - y0, 1e-9);
  const sc = Math.min(sx, sy, 1.5);
  const ox = (width - (x1 - x0) * sc) / 2; const oy = (height - (y1 - y0) * sc) / 2;
  return new Map(graph.nodes.map((node, i) => [node.id, { x: ox + (x[i] - x0) * sc, y: oy + (y[i] - y0) * sc }]));
}

// Push apart overlapping node+label boxes. boxes: Map id -> {w, h, dy} where the
// box is w wide, h tall and its centre sits dy below the node (labels sit above,
// so dy is negative). Moves along the axis of least overlap; returns new positions
// and the bounds of all boxes, so the caller can size the canvas to fit.
export function declutter(pos, boxes, { iterations = 2000, pad = 2 } = {}) {
  const ids = [...pos.keys()];
  const n = ids.length;
  const cx = new Float64Array(n); const cy = new Float64Array(n);
  const hw = new Float64Array(n); const hh = new Float64Array(n); const off = new Float64Array(n);
  ids.forEach((id, i) => {
    const b = boxes.get(id); const p = pos.get(id);
    hw[i] = b.w / 2 + pad; hh[i] = b.h / 2 + pad; off[i] = b.dy;
    cx[i] = p.x; cy[i] = p.y + b.dy;
  });
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ox = hw[i] + hw[j] - Math.abs(cx[i] - cx[j]);
        const oy = hh[i] + hh[j] - Math.abs(cy[i] - cy[j]);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // prefer vertical moves (labels are wide and short) unless the x overlap is small
        if (ox < oy * 2) {
          const s = (cx[i] < cx[j] || (cx[i] === cx[j] && i < j) ? -1 : 1) * (ox / 2 + 0.1);
          cx[i] += s; cx[j] -= s;
        } else {
          const s = (cy[i] < cy[j] || (cy[i] === cy[j] && i < j) ? -1 : 1) * (oy / 2 + 0.1);
          cy[i] += s; cy[j] -= s;
        }
      }
    }
    if (!moved) break;
  }
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  const out = new Map();
  ids.forEach((id, i) => {
    out.set(id, { x: cx[i], y: cy[i] - off[i] });
    x0 = Math.min(x0, cx[i] - hw[i]); x1 = Math.max(x1, cx[i] + hw[i]);
    y0 = Math.min(y0, cy[i] - hh[i]); y1 = Math.max(y1, cy[i] + hh[i]);
  });
  return { pos: out, bounds: { x0, y0, x1, y1 } };
}

// Count of overlapping box pairs — used by the tests and handy when tuning.
export function overlaps(pos, boxes) {
  const ids = [...pos.keys()]; let c = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = pos.get(ids[i]); const b = pos.get(ids[j]); const A = boxes.get(ids[i]); const B = boxes.get(ids[j]);
      if (Math.abs(a.x - b.x) < (A.w + B.w) / 2 && Math.abs(a.y + A.dy - (b.y + B.dy)) < (A.h + B.h) / 2) c++;
    }
  }
  return c;
}

const key = (node) => (node.type === 'specialty' ? `0${node.group}${node.label}` : `1${node.kind}${node.label}`);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ regions
// For drawing some roles (e.g. training pathways) as shaded regions rather than
// nodes: returns a layout graph without those roles, where each region instead
// becomes a weak pull between every pair of its members (total pull per member
// ~ `strength`, so a 36-specialty pathway gathers its members without knotting
// them). regions: [{ id, members: [nodeId] }].
export function collapseRegions(graph, isRegion, { strength = 1.5 } = {}) {
  const regionIds = new Set(graph.nodes.filter(isRegion).map((n) => n.id));
  const members = new Map([...regionIds].map((id) => [id, []]));
  const edges = [];
  for (const e of graph.edges) {
    if (regionIds.has(e.target)) members.get(e.target).push(e.source);
    else edges.push(e);
  }
  for (const list of members.values()) {
    const w = strength / Math.max(1, list.length - 1);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) edges.push({ source: list[i], target: list[j], weight: w });
  }
  return {
    graph: { nodes: graph.nodes.filter((n) => !regionIds.has(n.id)), edges },
    regions: [...members.entries()].map(([id, m]) => ({ id, members: m })),
  };
}

// A shaded region for a group of points (e.g. the specialties on one training
// pathway): a minimum spanning tree over the points, keeping only links up to
// maxLink so far-apart members form separate islands rather than a corridor
// across unrelated parts of the graph. Returns { links: [[i, j]], bridges: [[i, j]],
// islands: [[i...]] } — bridges are the tree links that were too long — islands largest first.
export function regionTree(points, { maxLink = Infinity } = {}) {
  const n = points.length;
  const links = []; const bridges = [];
  if (!n) return { links, bridges, islands: [] };
  const inTree = new Uint8Array(n); const best = new Float64Array(n).fill(Infinity); const from = new Int32Array(n).fill(-1);
  best[0] = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
    inTree[u] = 1;
    if (from[u] >= 0) (best[u] <= maxLink ? links : bridges).push([from[u], u]);
    for (let v = 0; v < n; v++) {
      if (inTree[v]) continue;
      const d = Math.hypot(points[u].x - points[v].x, points[u].y - points[v].y);
      if (d < best[v]) { best[v] = d; from[v] = u; }
    }
  }
  // islands = connected components of the kept links
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [a, b] of links) parent[find(a)] = find(b);
  const groups = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
  return { links, bridges, islands: [...groups.values()].sort((a, b) => b.length - a.length) };
}
