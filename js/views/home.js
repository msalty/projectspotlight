import { $, $$, esc, chrome, sheet, confirmSheet, toast } from '../ui.js';
import { icon } from '../icons.js';
import { state, loadAll, clientFor, thumbFor, saveProject, deleteProject, brandLabel } from '../store.js';
import { mountSyncButton } from './syncbutton.js';

let filter = 'all';

export async function homeView(root) {
  await loadAll();
  chrome({ title: 'Projects', large: true, tab: 'projects' });
  mountSyncButton();
  if (filter !== 'all' && !state.clients.some((c) => c.id === filter)) filter = 'all';
  const projects = state.projects
    .filter((p) => filter === 'all' || p.clientId === filter)
    .sort((a, b) => b.updated - a.updated);

  const welcome = !state.projects.length ? `
    <section class="welcome">
      <p class="eyebrow">Contractor marketing, simplified</p>
      <h2>Turn finished jobs into scroll-stopping posts.</h2>
      <ol class="steps">
        <li><span>1</span><div><b>Set up your brand</b><small>Logo, colors, phone and trust badges — just once.</small></div></li>
        <li><span>2</span><div><b>Snap before &amp; after</b><small>Straight from your phone's camera or library.</small></div></li>
        <li><span>3</span><div><b>Share</b><small>Pick a template and post to Instagram, Facebook or Google.</small></div></li>
      </ol>
      <div class="welcome-actions">
        <a class="btn primary" href="#/new">${icon('plus')}New project</a>
        <a class="btn tonal" href="#/brand">${icon('palette')}Set up your brand</a>
      </div>
    </section>` : '';

  const chips = state.clients.length > 1 ? `
    <div class="chip-row" role="tablist" aria-label="Filter by brand">
      <button class="chip ${filter === 'all' ? 'on' : ''}" data-filter="all">All</button>
      ${state.clients.map((c) => `<button class="chip ${filter === c.id ? 'on' : ''}" data-filter="${c.id}"><i class="dot" style="background:${esc(c.accent)}"></i>${esc(brandLabel(c))}</button>`).join('')}
    </div>` : '';

  root.innerHTML = `
    ${welcome}${chips}
    <div class="project-grid" id="grid">
      ${projects.map((p) => {
        const c = clientFor(p);
        return `<article class="project-card" data-id="${p.id}">
          <a href="#/p/${p.id}" class="card-link">
            <div class="thumb"><img class="thumb-bg" alt="" aria-hidden="true" decoding="async"><img class="thumb-fg" alt="" decoding="async"></div>
            <div class="card-body"><h3>${esc(p.title || 'Untitled project')}</h3>
            <p>${esc([state.clients.length > 1 ? brandLabel(c) : p.category, new Date(p.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })].filter(Boolean).join(' · '))}</p></div>
          </a>
          <button class="icon-btn card-more" aria-label="Project options">${icon('ellipsis-vertical')}</button>
        </article>`;
      }).join('')}
    </div>
    ${state.projects.length && !projects.length ? `<p class="muted center pad">No projects for this brand yet.</p>` : ''}
    <a class="fab" href="#/new">${icon('plus')}<span>New project</span></a>`;

  $$('[data-filter]', root).forEach((b) => b.onclick = () => { filter = b.dataset.filter; homeView(root); });

  for (const card of $$('.project-card', root)) {
    const p = state.projects.find((x) => x.id === card.dataset.id);
    // Every card uses the same 4:5 tile so the grid stays even; the full design is shown
    // uncropped, with a blurred copy of itself filling any leftover space.
    thumbFor(p).then((url) => {
      if (!url) return;
      for (const img of $$('.thumb img', card)) img.src = url;
      $('.thumb', card).classList.add('in');
    });
    $('.card-more', card).onclick = async () => {
      const choice = await sheet({ title: p.title || 'Untitled project', actions: [
        { label: 'Open', icon: 'pencil', value: 'open' },
        { label: 'Duplicate', icon: 'copy', value: 'dup' },
        { label: 'Delete', icon: 'trash-2', danger: true, value: 'del' },
      ] });
      if (choice === 'open') location.hash = '#/p/' + p.id;
      if (choice === 'dup') {
        const copy = structuredClone(p);
        Object.assign(copy, { id: crypto.randomUUID(), title: (p.title || 'Untitled') + ' (copy)', created: Date.now(), updated: Date.now() });
        await saveProject(copy);
        toast('Project duplicated');
        homeView(root);
      }
      if (choice === 'del' && await confirmSheet('Delete this project?', 'Its photos will be removed from this device.', 'Delete project')) {
        await deleteProject(p.id);
        toast('Project deleted');
        homeView(root);
      }
    };
  }
}
