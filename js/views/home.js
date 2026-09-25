import { $, $$, esc, chrome, sheet, confirmSheet, toast } from '../ui.js';
import { icon } from '../icons.js';
import { state, loadAll, clientFor, thumbFor, saveProject, deleteProject } from '../store.js';
import { SIZES } from '../presets.js';

let filter = 'all';

export async function homeView(root) {
  await loadAll();
  chrome({ title: 'Projects', large: true, tab: 'projects' });
  if (filter !== 'all' && !state.clients.some((c) => c.id === filter)) filter = 'all';
  const projects = state.projects
    .filter((p) => filter === 'all' || p.clientId === filter)
    .sort((a, b) => b.updated - a.updated);

  const welcome = !state.projects.length ? `
    <section class="welcome">
      <p class="eyebrow">Contractor marketing, simplified</p>
      <h2>Turn finished jobs into scroll-stopping posts.</h2>
      <ol class="steps">
        <li><span>1</span><div><b>Set up a brand</b><small>Logo, colors, phone and trust badges — once per client.</small></div></li>
        <li><span>2</span><div><b>Snap before &amp; after</b><small>Straight from your phone's camera or library.</small></div></li>
        <li><span>3</span><div><b>Share</b><small>Pick a template and post to Instagram, Facebook or Google.</small></div></li>
      </ol>
      <div class="welcome-actions">
        <a class="btn primary" href="#/new">${icon('plus')}New project</a>
        <a class="btn tonal" href="${state.clients.length ? '#/c/' + state.clients[0].id : '#/c/new'}">${icon('palette')}Set up brand</a>
      </div>
    </section>` : '';

  const chips = state.clients.length > 1 ? `
    <div class="chip-row" role="tablist" aria-label="Filter by client">
      <button class="chip ${filter === 'all' ? 'on' : ''}" data-filter="all">All</button>
      ${state.clients.map((c) => `<button class="chip ${filter === c.id ? 'on' : ''}" data-filter="${c.id}"><i class="dot" style="background:${esc(c.accent)}"></i>${esc(c.name || 'Untitled client')}</button>`).join('')}
    </div>` : '';

  root.innerHTML = `
    ${welcome}${chips}
    <div class="project-grid" id="grid">
      ${projects.map((p) => {
        const c = clientFor(p), s = SIZES[p.size] || SIZES.square;
        return `<article class="project-card" data-id="${p.id}">
          <a href="#/p/${p.id}" class="card-link">
            <div class="thumb" style="--ar:${s.w}/${s.h}"><img alt="" decoding="async"></div>
            <div class="card-body"><h3>${esc(p.title || 'Untitled project')}</h3>
            <p>${esc([state.clients.length > 1 ? c.name : p.category, new Date(p.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })].filter(Boolean).join(' · '))}</p></div>
          </a>
          <button class="icon-btn card-more" aria-label="Project options">${icon('ellipsis-vertical')}</button>
        </article>`;
      }).join('')}
    </div>
    ${state.projects.length && !projects.length ? `<p class="muted center pad">No projects for this client yet.</p>` : ''}
    <a class="fab" href="#/new">${icon('plus')}<span>New project</span></a>`;

  $$('[data-filter]', root).forEach((b) => b.onclick = () => { filter = b.dataset.filter; homeView(root); });

  for (const card of $$('.project-card', root)) {
    const p = state.projects.find((x) => x.id === card.dataset.id);
    thumbFor(p).then((url) => { const img = $('img', card); if (url && img) { img.src = url; img.classList.add('in'); } });
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
