import { load as parseYaml } from './vendor/js-yaml.mjs?v=dev';
import { loadData, validate, buildIndex, search, connections, buildGraph, neighbours, layout } from './engine.js?v=dev';

const REPO = 'https://github.com/ThomUK/claude-scratchpad';
const DATA_PATH = 'nhs-specialties/data';
const KIND_LABEL = { grade: 'Grades', pathway: 'Training pathways', 'special-interest': 'Special-interest roles' };
// Canonical order for the career ladder on a factsheet
const GRADE_ORDER = ['consultant', 'specialist', 'general-practitioner', 'specialty-doctor', 'specialty-registrar', 'core-trainee',
  'foundation-doctor', 'locally-employed-doctor', 'general-dental-practitioner', 'dental-core-trainee', 'dental-foundation-trainee',
  'physician-assistant', 'physician-assistant-anaesthesia'];

const $view = document.getElementById('view');
const $status = document.getElementById('status');
const $tip = document.getElementById('tip');
let index = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const groupTitle = (g) => index.groups.find((x) => x.id === g)?.title ?? g;
const sLink = (id) => `<a href="#/s/${esc(id)}">${esc(index.specialties.get(id).title)}</a>`;
const rLink = (id) => `<a class="chip chip--${esc(index.roles.get(id).kind)}" href="#/role/${esc(id)}">${esc(index.roles.get(id).title)}</a>`;

// ---------------------------------------------------------------- boot
(async function boot() {
  try {
    const data = await loadData(async (p) => {
      const res = await fetch(`data/${p}?v=dev`);
      if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
      return res.text();
    }, parseYaml);
    const errors = validate(data);
    index = buildIndex(data);
    if (errors.length) {
      $status.className = 'status status--warn';
      $status.innerHTML = `<strong>${errors.length} data problem${errors.length > 1 ? 's' : ''}:</strong> ${errors.slice(0, 5).map(esc).join('; ')}${errors.length > 5 ? '…' : ''}`;
    } else {
      $status.hidden = true;
    }
    window.addEventListener('hashchange', route);
    route();
  } catch (e) {
    $status.className = 'status status--bad';
    $status.textContent = `Could not load the data: ${e.message}`;
    console.error(e);
  }
})();

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [view, arg] = h.split('/');
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active',
    a.dataset.view === (view === 's' || view === 'role' ? 'index' : view || 'index')));
  hideTip();
  if (view === 's' && index.specialties.has(arg)) renderFactsheet(arg);
  else if (view === 'role' && index.roles.has(arg)) renderRole(arg);
  else if (view === 'graph') renderGraph(arg);
  else if (view === 'codes') renderCodes();
  else if (view === 'about') renderAbout();
  else renderIndex();
  if (view !== 'graph') window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- index view
const indexState = { q: '', group: '' };

function renderIndex() {
  $view.innerHTML = `
    <section class="panel">
      <div class="controls">
        <div class="field grow">
          <label for="q">Search specialties, codes, services or roles</label>
          <input id="q" type="search" placeholder="e.g. cardiology, 110, bariatric, intensivist" value="${esc(indexState.q)}" autocomplete="off" />
        </div>
        <div class="field">
          <label for="grp">Group</label>
          <select id="grp"><option value="">All groups</option>${index.groups.map((g) =>
            `<option value="${esc(g.id)}"${g.id === indexState.group ? ' selected' : ''}>${esc(g.title)}</option>`).join('')}</select>
        </div>
      </div>
      <p class="muted small" id="count"></p>
      <div id="results"></div>
    </section>`;
  const $q = document.getElementById('q');
  const $g = document.getElementById('grp');
  const update = () => {
    indexState.q = $q.value; indexState.group = $g.value;
    const hits = search(index, indexState.q).filter((h) => !indexState.group || index.specialties.get(h.id).group === indexState.group);
    document.getElementById('count').textContent = `${hits.length} of ${index.specialties.size} factsheets`;
    const card = (h) => {
      const s = index.specialties.get(h.id);
      const tfc = s.treatmentFunctionCodes.length;
      return `<a class="scard" href="#/s/${esc(s.id)}">
        <span class="scard-codes">${s.mainSpecialtyCodes.map((c) => `<span class="code${index.mainSpecialties.get(c).status === 'retired' ? ' code--retired' : ''}">${esc(c)}</span>`).join('')}</span>
        <span class="scard-title">${esc(s.title)}</span>
        <span class="scard-sub">${tfc ? `${tfc} treatment function${tfc > 1 ? 's' : ''}` : 'no treatment function'}${s.consultantTitle ? ` · ${esc(s.consultantTitle)}` : ''}</span>
        ${h.why ? `<span class="scard-why">matched: ${esc(h.why)}</span>` : ''}
      </a>`;
    };
    let html;
    if (indexState.q.trim()) {
      html = `<div class="scards">${hits.map(card).join('')}</div>`;
    } else {
      html = index.groups.map((g) => {
        const list = hits.filter((h) => index.specialties.get(h.id).group === g.id);
        return list.length ? `<h3 class="group-h">${esc(g.title)} <span class="muted small">${list.length}</span></h3><div class="scards">${list.map(card).join('')}</div>` : '';
      }).join('');
    }
    document.getElementById('results').innerHTML = html || '<p class="muted">No matches.</p>';
  };
  $q.addEventListener('input', update);
  $g.addEventListener('change', update);
  update();
  if (indexState.q) $q.focus();
}

// ---------------------------------------------------------------- factsheet
function renderFactsheet(id) {
  const s = index.specialties.get(id);
  const t = s.training;
  const grades = [...s.rolesByKind.grade].sort((a, b) => GRADE_ORDER.indexOf(a) - GRADE_ORDER.indexOf(b));
  const conns = connections(index, id);
  const yamlUrl = `${REPO}/blob/main/${DATA_PATH}/specialties/${id}.yaml`;
  $view.innerHTML = `
    <article class="panel factsheet">
      <p class="crumbs"><a href="#/">← All specialties</a> · ${esc(groupTitle(s.group))}</p>
      <h2 class="fs-title">${esc(s.title)}</h2>
      <p class="fs-codes">
        ${s.mainSpecialtyCodes.map((c) => { const m = index.mainSpecialties.get(c); return `<span class="badge${m.status === 'retired' ? ' badge--retired' : ''}" title="${esc(m.note || '')}">Main specialty <b>${esc(c)}</b>${m.status === 'retired' ? ' (retired)' : ''}</span>`; }).join('')}
        ${s.treatmentFunctionCodes.length ? `<span class="badge badge--tfc">${s.treatmentFunctionCodes.length} treatment function${s.treatmentFunctionCodes.length > 1 ? 's' : ''}</span>` : ''}
      </p>
      <p class="fs-summary">${esc(s.summary)}</p>
      ${s.notes ? `<p class="note small">${esc(s.notes)}</p>` : ''}

      <div class="fs-grid">
        <section>
          <h3>Treatment functions</h3>
          ${s.treatmentFunctionCodes.length ? `<table class="tbl"><thead><tr><th>TFC</th><th>Service</th><th>DD group</th></tr></thead><tbody>
            ${s.treatmentFunctionCodes.map((c) => { const r = index.treatmentFunctions.get(c); return `<tr><td class="num">${esc(c)}</td><td>${esc(r.title)}</td><td class="muted">${esc(r.group)}</td></tr>`; }).join('')}
          </tbody></table>` : '<p class="muted small">No treatment function maps to this specialty.</p>'}
          <h3>Main specialty codes</h3>
          <table class="tbl"><thead><tr><th>Code</th><th>Title</th><th>Status</th></tr></thead><tbody>
            ${s.mainSpecialtyCodes.map((c) => { const m = index.mainSpecialties.get(c); return `<tr><td class="num">${esc(c)}</td><td>${esc(m.title)}${m.note ? `<div class="muted small">${esc(m.note)}</div>` : ''}</td><td>${esc(m.status)}</td></tr>`; }).join('')}
          </tbody></table>
          ${t.college || t.route || t.length ? `<h3>Training</h3><dl class="dl">
            ${t.college ? `<dt>College / faculty</dt><dd>${esc(t.college)}</dd>` : ''}
            ${t.route ? `<dt>Route</dt><dd>${esc(t.route)}</dd>` : ''}
            ${t.length ? `<dt>Indicative length</dt><dd>${esc(t.length)}</dd>` : ''}
          </dl>` : ''}
        </section>

        <section>
          <h3>Medical workforce</h3>
          ${s.consultantTitle ? `<p class="small"><span class="muted">Senior post:</span> <strong>${esc(s.consultantTitle)}</strong></p>` : ''}
          ${grades.length ? `<p class="lbl">Grades</p><ul class="ladder">${grades.map((r) => `<li>${rLink(r)}</li>`).join('')}</ul>`
            : '<p class="muted small">No medical roles yet. This specialty is led by another staff group, which is a future layer.</p>'}
          ${s.rolesByKind.pathway.length ? `<p class="lbl">Shared training pathways</p><p class="chips">${s.rolesByKind.pathway.map(rLink).join('')}</p>` : ''}
          ${s.rolesByKind['special-interest'].length ? `<p class="lbl">Special-interest roles</p><p class="chips">${s.rolesByKind['special-interest'].map(rLink).join('')}</p>` : ''}
          <div class="ego" id="ego"></div>
        </section>
      </div>

      <div class="fs-grid">
        <section>
          <h3>Connected through shared roles</h3>
          ${conns.length ? `<ul class="conns">${conns.slice(0, 14).map((c) => `<li>${sLink(c.id)} <span class="muted small">via ${c.via.map((r) => esc(index.roles.get(r).title)).join(', ')}</span></li>`).join('')}</ul>
            ${conns.length > 14 ? `<p class="muted small">…and ${conns.length - 14} more (mostly through a shared core training programme).</p>` : ''}`
            : '<p class="muted small">No pathway or special-interest roles shared with other specialties.</p>'}
        </section>
        <section>
          <h3>Related specialties</h3>
          ${s.related.length ? `<p class="chips">${s.related.map((r) => `<a class="chip" href="#/s/${esc(r)}">${esc(index.specialties.get(r).title)}</a>`).join('')}</p>` : '<p class="muted small">None listed.</p>'}
          <p class="small edit"><a href="${yamlUrl}" target="_blank" rel="noopener">View or edit this factsheet's YAML on GitHub ↗</a></p>
        </section>
      </div>
    </article>`;
  drawEgo(document.getElementById('ego'), id);
}

// Small radial graph: this specialty, its pathway/special-interest roles, and the specialties beyond them.
function drawEgo(el, id) {
  const s = index.specialties.get(id);
  const roles = [...s.rolesByKind.pathway, ...s.rolesByKind['special-interest']];
  if (!roles.length) { el.remove(); return; }
  const W = 660; const H = 380; const cx = W / 2; const cy = H / 2;
  const others = new Map();
  roles.forEach((r) => index.roleSpecialties.get(r).forEach((o) => { if (o !== id) { if (!others.has(o)) others.set(o, []); others.get(o).push(r); } }));
  const rPos = new Map(roles.map((r, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / roles.length; return [r, { x: cx + 105 * Math.cos(a), y: cy + 85 * Math.sin(a), a }]; }));
  // outer ring ordered by the mean angle of the roles that link them, so lines don't criss-cross
  const outer = [...others.entries()].map(([o, via]) => {
    const vx = via.reduce((t, r) => t + Math.cos(rPos.get(r).a), 0); const vy = via.reduce((t, r) => t + Math.sin(rPos.get(r).a), 0);
    return { id: o, via, a: Math.atan2(vy, vx) };
  }).sort((a, b) => a.a - b.a);
  const maxOuter = 28;
  const shown = outer.length > maxOuter ? outer.filter((o) => o.via.length > 1 || !roles.some((r) => index.roles.get(r).kind === 'pathway' && o.via.includes(r))).slice(0, maxOuter) : outer;
  const oPos = new Map(shown.map((o, i) => { const a = -Math.PI / 2 + (2 * Math.PI * (i + 0.5)) / shown.length; return [o.id, { x: cx + 200 * Math.cos(a), y: cy + 160 * Math.sin(a) }]; }));
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="ego-svg" role="img" aria-label="Roles linking ${esc(s.title)} to other specialties">`;
  for (const o of shown) for (const r of o.via) { const a = rPos.get(r); const b = oPos.get(o.id); svg += `<line class="e" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`; }
  for (const r of roles) { const p = rPos.get(r); svg += `<line class="e e--core" x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}"/>`; }
  for (const o of shown) {
    const p = oPos.get(o.id); const anchor = p.x < cx - 10 ? 'end' : p.x > cx + 10 ? 'start' : 'middle';
    const dx = anchor === 'end' ? -7 : anchor === 'start' ? 7 : 0;
    svg += `<a href="#/s/${esc(o.id)}"><circle class="n-spec" cx="${p.x}" cy="${p.y}" r="4.5"/><text class="lbl-o" x="${p.x + dx}" y="${p.y + 3.5}" text-anchor="${anchor}">${esc(trunc(index.specialties.get(o.id).title, 24))}</text></a>`;
  }
  for (const r of roles) {
    const p = rPos.get(r); const role = index.roles.get(r);
    svg += `<a href="#/role/${esc(r)}">${shape(role.kind, p.x, p.y, 6)}<text class="lbl-rr" x="${p.x}" y="${p.y + 17}" text-anchor="middle">${esc(trunc(role.title, 22))}</text><title>${esc(role.title)}</title></a>`;
  }
  svg += `<circle class="n-self" cx="${cx}" cy="${cy}" r="9"/></svg>`;
  el.innerHTML = `<p class="lbl">Role network <span class="muted small">(${others.size} connected specialt${others.size === 1 ? 'y' : 'ies'}${shown.length < others.size ? `, ${shown.length} shown` : ''})</span></p>${svg}${legendHtml(['pathway', 'special-interest'])}`;
}

const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function shape(kind, x, y, r, extra = '') {
  if (kind === 'pathway') return `<rect class="n-role n--pathway" x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="2" ${extra}/>`;
  if (kind === 'special-interest') return `<path class="n-role n--special-interest" d="M${x} ${y - r * 1.25}L${x + r * 1.25} ${y}L${x} ${y + r * 1.25}L${x - r * 1.25} ${y}Z" ${extra}/>`;
  return `<path class="n-role n--grade" d="M${x} ${y - r * 1.2}L${x + r * 1.1} ${y + r * 0.8}L${x - r * 1.1} ${y + r * 0.8}Z" ${extra}/>`;
}

function legendHtml(kinds, withSpecialty = true) {
  const item = (svg, label) => `<span class="lg-item"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${svg}</svg>${label}</span>`;
  return `<div class="legend">${withSpecialty ? item('<circle class="n-spec" cx="8" cy="8" r="5"/>', 'Specialty') : ''}${kinds.map((k) => item(shape(k, 8, 8, 5), KIND_LABEL[k].replace(/s$/, ''))).join('')}</div>`;
}

// ---------------------------------------------------------------- role page
function renderRole(id) {
  const r = index.roles.get(id);
  const list = [...index.roleSpecialties.get(id)].sort((a, b) => index.specialties.get(a).title.localeCompare(index.specialties.get(b).title));
  $view.innerHTML = `
    <article class="panel">
      <p class="crumbs"><a href="#/">← All specialties</a> · <a href="#/graph/${esc(id)}">Show in role graph</a></p>
      <h2 class="fs-title"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">${shape(r.kind, 10, 10, 6.5)}</svg> ${esc(r.title)}</h2>
      <p class="muted small">${esc(KIND_LABEL[r.kind].replace(/s$/, ''))} · ${r.staff_group === 'medical-associate' ? 'Medical associate professions' : 'Medical and dental staff'}</p>
      <p class="fs-summary">${esc(r.description)}</p>
      <h3>Specialties (${list.length})</h3>
      <div class="scards">${list.map((sid) => { const s = index.specialties.get(sid); return `<a class="scard" href="#/s/${esc(sid)}"><span class="scard-codes">${s.mainSpecialtyCodes.map((c) => `<span class="code">${esc(c)}</span>`).join('')}</span><span class="scard-title">${esc(s.title)}</span><span class="scard-sub">${esc(groupTitle(s.group))}</span></a>`; }).join('')}</div>
    </article>`;
}

// ---------------------------------------------------------------- graph view
const graphState = { kinds: new Set(['pathway', 'special-interest']), group: '', hideSingles: true, focus: null, zoom: { k: 1, x: 0, y: 0 } };

function renderGraph(focusRole) {
  if (focusRole && index.roles.has(focusRole)) {
    graphState.focus = `r:${focusRole}`;
    const kind = index.roles.get(focusRole).kind;
    graphState.kinds.add(kind);
    graphState.group = '';
    if (index.roleSpecialties.get(focusRole).length < 2) graphState.hideSingles = false;
  }
  $view.innerHTML = `
    <section class="panel">
      <div class="controls">
        ${['pathway', 'special-interest', 'grade'].map((k) => `<label class="check"><input type="checkbox" data-kind="${k}"${graphState.kinds.has(k) ? ' checked' : ''}/>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${shape(k, 8, 8, 5)}</svg>${KIND_LABEL[k]}</label>`).join('')}
        <label class="check"><input type="checkbox" id="singles"${graphState.hideSingles ? ' checked' : ''}/>Hide roles in only one specialty</label>
        <div class="field">
          <select id="ggrp" aria-label="Specialty group"><option value="">All specialty groups</option>${index.groups.map((g) =>
            `<option value="${esc(g.id)}"${g.id === graphState.group ? ' selected' : ''}>${esc(g.title)}</option>`).join('')}</select>
        </div>
        <button class="btn" id="reset">Reset view</button>
      </div>
      <p class="muted small">Specialties (grey circles) link to the roles they list in their factsheet. Hover to see a node, click to
        highlight its neighbours, scroll or pinch to zoom and drag to pan. Grades link almost every specialty, so they are off by default.</p>
      <div class="graph-wrap">
        <svg id="graph" class="graph" role="img" aria-label="Network of NHS specialties and medical roles"></svg>
        <aside id="gside" class="gside"></aside>
      </div>
      <details class="table-view"><summary>Table view of the links</summary><div id="gtable"></div></details>
    </section>`;
  document.querySelectorAll('[data-kind]').forEach((cb) => cb.addEventListener('change', () => {
    cb.checked ? graphState.kinds.add(cb.dataset.kind) : graphState.kinds.delete(cb.dataset.kind); drawGraph();
  }));
  document.getElementById('singles').addEventListener('change', (e) => { graphState.hideSingles = e.target.checked; drawGraph(); });
  document.getElementById('ggrp').addEventListener('change', (e) => { graphState.group = e.target.value; graphState.focus = null; drawGraph(); });
  document.getElementById('reset').addEventListener('click', () => { graphState.zoom = { k: 1, x: 0, y: 0 }; graphState.focus = null; drawGraph(); });
  drawGraph();
}

const layoutCache = new Map();

function drawGraph() {
  const svg = document.getElementById('graph');
  if (!svg) return;
  const W = 1100; const H = 760;
  const g = buildGraph(index, { kinds: [...graphState.kinds], groups: graphState.group ? [graphState.group] : null, minDegree: graphState.hideSingles ? 2 : 1 });
  const key = JSON.stringify([[...graphState.kinds].sort(), graphState.group, graphState.hideSingles]);
  if (!layoutCache.has(key)) layoutCache.set(key, layout(g, { width: W, height: H, iterations: 320, seed: 3 }));
  const pos = layoutCache.get(key);
  const ids = new Set(g.nodes.map((n) => n.id));
  if (graphState.focus && !ids.has(graphState.focus)) graphState.focus = null;
  const nb = graphState.focus ? neighbours(g, graphState.focus) : null;
  const on = (id) => !nb || id === graphState.focus || nb.has(id);
  const z = graphState.zoom;

  let h = `<g id="vp" transform="translate(${z.x} ${z.y}) scale(${z.k})">`;
  h += '<g class="edges">';
  for (const e of g.edges) {
    const a = pos.get(e.source); const b = pos.get(e.target);
    const lit = nb && (e.source === graphState.focus || e.target === graphState.focus);
    h += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="${lit ? 'e e--lit' : nb ? 'e e--dim' : 'e'}"/>`;
  }
  h += '</g><g class="nodes">';
  for (const n of g.nodes) {
    const p = pos.get(n.id); const dim = !on(n.id) ? ' dim' : '';
    const r = n.type === 'specialty' ? 5 + Math.min(4, n.degree * 0.5) : 5 + Math.min(7, Math.sqrt(n.degree) * 1.6);
    const mark = n.type === 'specialty' ? `<circle class="n-spec${n.id === graphState.focus ? ' n-focus' : ''}" cx="${p.x}" cy="${p.y}" r="${r}"/>` : shape(n.kind, p.x, p.y, r, n.id === graphState.focus ? 'stroke-width="3"' : '');
    const showLabel = n.type === 'role' || nb ? on(n.id) : true;
    h += `<g class="node${dim}" data-id="${esc(n.id)}" tabindex="0">${mark}<circle class="hit" cx="${p.x}" cy="${p.y}" r="${r + 6}"/>${showLabel ? `<text class="${n.type === 'role' ? 'lbl-r' : 'lbl-s'}" x="${p.x}" y="${p.y - r - 4}" text-anchor="middle">${esc(trunc(n.label, 30))}</text>` : ''}</g>`;
  }
  h += '</g></g>';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = h;

  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  svg.querySelectorAll('.node').forEach((el) => {
    const n = byId.get(el.dataset.id);
    el.addEventListener('mouseenter', (ev) => showTip(ev, tipFor(n)));
    el.addEventListener('mousemove', moveTip);
    el.addEventListener('mouseleave', hideTip);
    const pick = () => { graphState.focus = graphState.focus === n.id ? null : n.id; drawGraph(); };
    el.addEventListener('click', (ev) => { ev.stopPropagation(); if (!dragMoved) pick(); });
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
  });
  svg.onclick = () => { if (!dragMoved && graphState.focus) { graphState.focus = null; drawGraph(); } };
  attachPanZoom(svg);
  renderSide(g, byId, nb);
  renderGraphTable(g, byId);
}

function tipFor(n) {
  if (n.type === 'specialty') {
    const s = index.specialties.get(n.ref);
    return `<b>${esc(s.title)}</b><br>${s.mainSpecialtyCodes.map((c) => `MS ${esc(c)}`).join(', ')} · ${esc(groupTitle(s.group))}<br>${n.degree} role link${n.degree === 1 ? '' : 's'} shown`;
  }
  const r = index.roles.get(n.ref);
  return `<b>${esc(r.title)}</b><br>${esc(KIND_LABEL[r.kind].replace(/s$/, ''))} · ${n.degree} specialt${n.degree === 1 ? 'y' : 'ies'} shown`;
}

function renderSide(g, byId, nb) {
  const side = document.getElementById('gside');
  const f = graphState.focus && byId.get(graphState.focus);
  if (!f) {
    const roles = g.nodes.filter((n) => n.type === 'role').sort((a, b) => b.degree - a.degree).slice(0, 10);
    side.innerHTML = `<p class="lbl">Most-shared roles in view</p><ol class="rank">${roles.map((n) => `<li><a href="#/role/${esc(n.ref)}">${esc(n.label)}</a> <span class="muted small">${n.degree}</span></li>`).join('')}</ol>
      ${legendHtml([...graphState.kinds].filter((k) => KIND_LABEL[k]))}
      <p class="muted small">${g.nodes.filter((n) => n.type === 'specialty').length} specialties · ${g.nodes.filter((n) => n.type === 'role').length} roles · ${g.edges.length} links</p>
      ${g.isolated.length ? `<details class="small"><summary class="muted">${g.isolated.length} specialt${g.isolated.length === 1 ? 'y has' : 'ies have'} no shared role in view</summary><p>${g.isolated.map(sLink).join(', ')}</p></details>` : ''}`;
    return;
  }
  const items = [...nb].map((id) => byId.get(id)).sort((a, b) => a.label.localeCompare(b.label));
  const link = f.type === 'specialty' ? `#/s/${f.ref}` : `#/role/${f.ref}`;
  side.innerHTML = `<p class="lbl">${f.type === 'specialty' ? 'Specialty' : esc(KIND_LABEL[f.kind].replace(/s$/, ''))}</p>
    <h3 class="side-title">${esc(f.label)}</h3>
    <p class="small"><a href="${link}">Open ${f.type === 'specialty' ? 'factsheet' : 'role page'} →</a></p>
    <p class="lbl">Linked ${f.type === 'specialty' ? 'roles' : 'specialties'} (${items.length})</p>
    <ul class="side-list">${items.map((n) => `<li><a href="${n.type === 'specialty' ? `#/s/${n.ref}` : `#/role/${n.ref}`}">${esc(n.label)}</a></li>`).join('')}</ul>`;
}

function renderGraphTable(g, byId) {
  const roles = g.nodes.filter((n) => n.type === 'role').sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label));
  const rows = roles.map((r) => {
    const specs = g.edges.filter((e) => e.target === r.id).map((e) => byId.get(e.source).label).sort();
    return `<tr><td>${esc(r.label)}</td><td>${esc(KIND_LABEL[r.kind].replace(/s$/, ''))}</td><td class="num">${specs.length}</td><td class="small">${specs.map(esc).join(', ')}</td></tr>`;
  });
  document.getElementById('gtable').innerHTML = `<table class="tbl"><thead><tr><th>Role</th><th>Kind</th><th>Links</th><th>Specialties</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

let dragMoved = false;
function attachPanZoom(svg) {
  if (svg.dataset.pz) return;
  svg.dataset.pz = '1';
  const z = () => graphState.zoom;
  const apply = () => { const vp = svg.querySelector('#vp'); if (vp) vp.setAttribute('transform', `translate(${z().x} ${z().y}) scale(${z().k})`); };
  const toSvg = (cx, cy) => { const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  const zoomAt = (p, f) => { const k = Math.min(6, Math.max(0.5, z().k * f)); const r = k / z().k; z().x = p.x - (p.x - z().x) * r; z().y = p.y - (p.y - z().y) * r; z().k = k; apply(); };
  svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(toSvg(e.clientX, e.clientY), Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  const pts = new Map(); let last = null; let pinch = null;
  svg.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, toSvg(e.clientX, e.clientY)); dragMoved = false; last = toSvg(e.clientX, e.clientY); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
  svg.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = toSvg(e.clientX, e.clientY);
    pts.set(e.pointerId, p);
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d / pinch); pinch = d; dragMoved = true; return;
    }
    const dx = p.x - last.x; const dy = p.y - last.y;
    if (Math.abs(dx) + Math.abs(dy) > 2 || dragMoved) {
      if (!dragMoved) svg.setPointerCapture(e.pointerId);
      dragMoved = true; z().x += dx; z().y += dy; last = p; apply(); hideTip();
    }
  });
  const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; setTimeout(() => { dragMoved = false; }, 0); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
}

function showTip(ev, html) { $tip.innerHTML = html; $tip.hidden = false; moveTip(ev); }
function moveTip(ev) {
  const pad = 14; const w = $tip.offsetWidth; const hh = $tip.offsetHeight;
  let x = ev.clientX + pad; let y = ev.clientY + pad;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
  if (y + hh > window.innerHeight - 8) y = ev.clientY - hh - pad;
  $tip.style.left = `${x}px`; $tip.style.top = `${y}px`;
}
function hideTip() { $tip.hidden = true; }

// ---------------------------------------------------------------- code index
const codeState = { q: '', table: 'tfc', showRetired: true };

function renderCodes() {
  $view.innerHTML = `
    <section class="panel">
      <div class="controls">
        <div class="seg" role="tablist">
          <button class="seg-b" data-t="tfc" role="tab">Treatment function codes (${index.treatmentFunctions.size})</button>
          <button class="seg-b" data-t="ms" role="tab">Main specialty codes (${index.mainSpecialties.size})</button>
        </div>
        <div class="field grow"><input id="cq" type="search" aria-label="Filter codes" placeholder="Filter by code or title" value="${esc(codeState.q)}" /></div>
        <label class="check"><input type="checkbox" id="ret"${codeState.showRetired ? ' checked' : ''}/>Show retired</label>
      </div>
      <p class="muted small" id="cnote"></p>
      <div id="ctable"></div>
    </section>`;
  const draw = () => {
    document.querySelectorAll('.seg-b').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.t === codeState.table)));
    const q = codeState.q.trim().toLowerCase();
    const match = (r) => (!q || r.code.includes(q) || r.title.toLowerCase().includes(q)) && (codeState.showRetired || r.status !== 'retired');
    let html;
    if (codeState.table === 'tfc') {
      document.getElementById('cnote').textContent = 'Treatment function: the specialised service a patient is treated in. This is what RTT, SUS and HES activity is reported by. Each active code has one home factsheet here.';
      const rows = [...index.treatmentFunctions.values()].filter(match);
      html = `<table class="tbl"><thead><tr><th>TFC</th><th>Title</th><th>DD group</th><th>Status</th><th>Factsheet</th></tr></thead><tbody>${rows.map((r) =>
        `<tr class="${r.status === 'retired' ? 'retired' : ''}"><td class="num">${esc(r.code)}</td><td>${esc(r.title)}</td><td class="muted">${esc(r.group)}</td><td>${esc(r.status)}</td><td>${r.specialty ? sLink(r.specialty) : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table>`;
    } else {
      document.getElementById('cnote').textContent = 'Main specialty: the specialty recognised by the medical and dental Royal Colleges, and the one a consultant is contracted in.';
      const rows = [...index.mainSpecialties.values()].filter(match);
      html = `<table class="tbl"><thead><tr><th>Code</th><th>Title</th><th>DD heading</th><th>Status</th><th>Factsheet</th></tr></thead><tbody>${rows.map((r) =>
        `<tr class="${r.status === 'retired' ? 'retired' : ''}"><td class="num">${esc(r.code)}</td><td>${esc(r.title)}${r.note ? `<div class="muted small">${esc(r.note)}</div>` : ''}</td><td class="muted">${esc(r.heading)}</td><td>${esc(r.status)}</td><td>${r.specialties.length ? r.specialties.map(sLink).join(', ') : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table>`;
    }
    document.getElementById('ctable').innerHTML = html;
  };
  document.querySelectorAll('.seg-b').forEach((b) => b.addEventListener('click', () => { codeState.table = b.dataset.t; draw(); }));
  document.getElementById('cq').addEventListener('input', (e) => { codeState.q = e.target.value; draw(); });
  document.getElementById('ret').addEventListener('change', (e) => { codeState.showRetired = e.target.checked; draw(); });
  draw();
}

// ---------------------------------------------------------------- about
function renderAbout() {
  const tree = `${REPO}/tree/main/${DATA_PATH}`;
  $view.innerHTML = `
    <section class="panel prose">
      <h2>About the data</h2>
      <h3>Two code sets</h3>
      <ul>
        <li><strong>Main specialty code</strong> (<a href="https://www.datadictionary.nhs.uk/attributes/main_specialty_code.html" target="_blank" rel="noopener">NHS Data Dictionary</a>):
          a specialty recognised by the Royal Colleges and Faculties. It describes the consultant (or other lead), not the service.</li>
        <li><strong>Treatment function code</strong> (<a href="https://www.datadictionary.nhs.uk/attributes/treatment_function_code.html" target="_blank" rel="noopener">NHS Data Dictionary</a>):
          the specialised service the patient is treated in. It is used for RTT, SUS/HES and most activity reporting. A consultant in one main
          specialty can work in several treatment functions. For example, a general surgeon (100) may run a breast service (103).</li>
      </ul>
      <p>The Data Dictionary's <a href="https://www.datadictionary.nhs.uk/supporting_information/main_specialty_and_treatment_function_codes_table.html" target="_blank" rel="noopener">Main Specialty and Treatment Function Codes Table</a>
        shows how the two relate. Here each active treatment function is given one <em>home</em> factsheet. Where the home is a
        judgement call (stroke, post-COVID, clinical psychology, the physiology services) the factsheet says so in its notes.</p>
      <h3>Factsheets are YAML</h3>
      <p>Each specialty is one file in <a href="${tree}/specialties" target="_blank" rel="noopener"><code>data/specialties/</code></a>, listed in
        <code>data/specialties.yaml</code>. The roles the graph joins on are defined once in <code>data/roles.yaml</code>. The code lists live in
        <code>data/codes/</code>. The app checks every file on load (unknown codes, roles of the wrong kind, a treatment function claimed twice
        or not at all) and shows any problem at the top of the page. <code>node tests/engine.test.mjs</code> runs the same checks.</p>
      <pre class="yaml">id: cardiology
title: "Cardiology"
group: medical                       # navigation group (data/specialties.yaml)
main_specialty_codes: ["320"]
treatment_function_codes: ["320", "327", "331"]
summary: >-
  Heart disease: ...
notes: >-                            # optional
  ...
training:                            # optional
  college: "..."
  route: "..."
  length: "..."
workforce:
  medical:                           # first staff-group layer
    consultant_title: "Consultant cardiologist"
    grades: [consultant, specialist, specialty-doctor, ...]
    pathways: [internal-medicine-training]
    special_interests: [interventional-cardiologist, ...]
related: [cardiothoracic-surgery, ...]</pre>
      <h3>The graph layer</h3>
      <p>The graph is bipartite: specialties on one side, roles on the other, joined when a factsheet lists a role. Three kinds of role:</p>
      <ul>
        <li><strong>Grades</strong>: the medical and dental career ladder (consultant, SAS grades, resident doctors) plus the
          medical associate professions. These are shared by almost everything, so they are shown on factsheets and are off by default in the graph.</li>
        <li><strong>Training pathways</strong>: programmes that feed several specialties (Core Surgical Training, Internal Medicine Training, ACCS,
          Core Psychiatry, Combined Infection Training …). They show where doctors in different specialties started from the same place.</li>
        <li><strong>Special-interest roles</strong>: roles that cut across specialties (intensivist, stroke physician, hand surgeon …).</li>
      </ul>
      <p>Later layers can add other staff groups (nursing, AHPs, healthcare science, pharmacy) with no change to the engine. Add roles with a new
        <code>staff_group</code> to <code>roles.yaml</code>, then list them under a new key beside <code>workforce.medical</code>.</p>
      <h3>Caveats</h3>
      <p>The code lists are taken from the Data Dictionary and should be re-checked against it when it changes. Everything else (summaries, training
        routes and lengths, role mappings, related specialties) is a curated first draft written for discussion. It is not an authoritative
        statement of curricula. Check the relevant college's curriculum before relying on any training detail.</p>
    </section>`;
}
