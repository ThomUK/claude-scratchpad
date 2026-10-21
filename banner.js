// The out-of-sync banner, shared by every page of the sub-project. The text
// comes from pending-changes.json next to this file; the pages only provide
// an empty <div id="banner" hidden>. Nothing else renders this notice, so
// every page shows the same thing.

export function bannerModel(pending) {
  if (!pending || !Array.isArray(pending.changes) || pending.changes.length === 0) return null;
  return {
    title: `Generator ahead of the published data (${pending.published_version}, built ${pending.published_build}).`,
    note: pending.note || '',
    changes: pending.changes.map(String),
  };
}

const CSS = `
.banner { background: #3a2a0f; border: 1px solid #8a6414; color: #f3d99b; border-radius: 10px; padding: 12px 16px; margin: 0 0 18px; font-size: 0.9rem; line-height: 1.5; }
.banner b { color: #ffe9b0; }
.banner ul { margin: 6px 0 0; padding-left: 20px; color: #f3d99b; }
.banner li { margin: 2px 0; }
`;

export function renderBanner(target, model, doc = document) {
  if (!model) { target.hidden = true; target.replaceChildren(); return; }
  const b = doc.createElement('b'); b.textContent = model.title;
  const ul = doc.createElement('ul');
  for (const c of model.changes) { const li = doc.createElement('li'); li.textContent = c; ul.append(li); }
  target.replaceChildren(b, doc.createTextNode(' ' + model.note), ul);
  target.className = 'banner';
  target.hidden = false;
}

export async function mountBanner() {
  const target = document.getElementById('banner');
  if (!target) return;
  if (!document.getElementById('banner-css')) {
    const style = document.createElement('style'); style.id = 'banner-css'; style.textContent = CSS; document.head.append(style);
  }
  try {
    // resolved against this module, so every page reads the same file; cache-busted by the Pages deploy
    const r = await fetch(new URL('pending-changes.json?v=dev', import.meta.url), { cache: 'no-cache' });
    if (!r.ok) return;
    renderBanner(target, bannerModel(await r.json()));
  } catch (e) { /* no banner */ }
}

if (typeof document !== 'undefined') mountBanner();
