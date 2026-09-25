import { $, $$, esc, chrome, sheet, confirmSheet, toast, pickFile, debounce } from '../ui.js';
import { icon } from '../icons.js';
import { state, loadAll, saveClient, deleteClient, saveProject } from '../store.js';
import { render } from '../render.js';
import { TRADES, tradeById, BADGES, FONT_STYLES, PALETTES, newClient, newProject } from '../presets.js';
import { prepareImage, imageFor } from '../images.js';
import { db } from '../db.js';
import { mountSyncButton } from './syncbutton.js';

export async function clientsView(root) {
  await loadAll();
  chrome({ title: 'Clients', large: true, tab: 'clients' });
  mountSyncButton();
  const count = (c) => state.projects.filter((p) => p.clientId === c.id).length;
  root.innerHTML = `
    <p class="muted lead">Each client has its own logo, colors, contact info and trust badges.</p>
    <div class="client-list">
      ${state.clients.map((c) => `
        <a class="client-card" href="#/c/${c.id}">
          <span class="client-logo" style="background:${esc(c.primary)};color:${esc(c.accent)}" data-logo="${c.logo || ''}">${icon(tradeById(c.trade).icon)}</span>
          <span class="client-meta"><b>${esc(c.name || 'Untitled client')}</b><small>${esc(tradeById(c.trade).label)} · ${count(c)} project${count(c) === 1 ? '' : 's'}</small></span>
          <span class="swatches"><i style="background:${esc(c.primary)}"></i><i style="background:${esc(c.accent)}"></i></span>
          ${icon('chevron-right', 'chev')}
        </a>`).join('')}
    </div>
    ${state.clients.length ? '' : `<div class="empty">${icon('briefcase')}<h3>No clients yet</h3><p>Add the business you're making posts for.</p></div>`}
    <a class="fab" href="#/c/new">${icon('plus')}<span>Add client</span></a>`;
  for (const el of $$('[data-logo]', root)) {
    if (!el.dataset.logo) continue;
    imageFor(el.dataset.logo).then((img) => { if (img) { el.innerHTML = `<img src="${img.src}" alt="">`; el.classList.add('has-img'); } });
  }
}

const DEMO = {
  title: 'Kitchen Remodel', category: 'Kitchen', location: 'West Chester, PA',
  description: 'Full gut renovation with custom cabinets, quartz counters and new lighting.',
};

export async function clientView(root, id, query) {
  await loadAll();
  let c = state.clients.find((x) => x.id === id);
  let persisted = !!c;
  if (!c) c = newClient();
  const forProject = new URLSearchParams(query || '').get('for');

  chrome({
    title: c.name || 'New client', back: forProject ? '#/p/' + forProject : '#/clients',
    actions: `<button class="icon-btn" id="moreBtn" aria-label="Client options">${icon('ellipsis-vertical')}</button>`,
  });

  const sample = state.projects.filter((p) => p.clientId === c.id).sort((a, b) => b.updated - a.updated)[0];
  let previewProject = sample ? structuredClone(sample) : newProject({ ...DEMO, template: 'split' });
  previewProject.show = { logo: true, badges: true, contact: true, qr: false };

  const field = (key, label, attrs = '') => `<label class="field"><span>${label}</span><input data-k="${key}" value="${esc(c[key])}" ${attrs}></label>`;
  root.innerHTML = `
  <div class="editor client-editor">
    <section class="stage">
      <div class="canvas-box" id="canvasBox"><canvas id="canvas" aria-label="Brand preview"></canvas></div>
      <div class="mini-seg center" id="previewTpl">
        ${[['split', 'Before & After'], ['spotlight', 'Spotlight'], ['offer', 'Offer']].map(([k, l]) => `<button data-pt="${k}" class="${previewProject.template === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
    </section>
    <div class="editor-panel">
      <section class="pane">
        <h3 class="pane-h">Trade</h3>
        <div class="trade-grid">
          ${TRADES.map((t) => `<button class="trade ${c.trade === t.id ? 'on' : ''}" data-trade="${t.id}" style="--tp:${t.primary};--ta:${t.accent}">${icon(t.icon)}<span>${esc(t.label)}</span></button>`).join('')}
        </div>

        <h3 class="pane-h">Business</h3>
        ${field('name', 'Company name', 'autocomplete="organization" placeholder="Acme Electric"')}
        ${field('tagline', 'Tagline', 'placeholder="Built right. Built to last."')}
        <div class="two">
          ${field('phone', 'Phone', 'type="tel" autocomplete="tel" placeholder="(555) 555-1234"')}
          ${field('website', 'Website', 'type="url" inputmode="url" autocapitalize="off" placeholder="acmeelectric.com"')}
        </div>
        ${field('bookingUrl', 'Booking link for QR code <small>optional — defaults to website</small>', 'type="url" inputmode="url" autocapitalize="off" placeholder="https://…"')}
        ${field('serviceArea', 'Service area', 'placeholder="Chester County, PA"')}
        <div class="three">
          ${field('license', 'License #', 'placeholder="PA123456"')}
          ${field('years', 'Years in business', 'inputmode="numeric" placeholder="15"')}
          ${field('rating', 'Star rating', 'inputmode="decimal" placeholder="4.9"')}
        </div>

        <h3 class="pane-h">Logo</h3>
        <div class="logo-row">
          <div class="logo-tile" id="logoTile"></div>
          <div class="logo-actions">
            <button class="btn tonal sm" id="logoBtn">${icon('upload')}Upload logo</button>
            <button class="btn text sm" id="logoRemove">Remove</button>
            <label class="switch-row compact"><span>White background</span><input type="checkbox" role="switch" id="logoChip"></label>
          </div>
        </div>

        <h3 class="pane-h">Colors</h3>
        <div class="palette-row">
          ${PALETTES.map(([a, b]) => `<button class="palette" data-pal="${a},${b}" aria-label="Palette ${a} ${b}"><i style="background:${a}"></i><i style="background:${b}"></i></button>`).join('')}
        </div>
        <div class="two">
          <label class="color-field"><input type="color" data-k="primary" value="${esc(c.primary)}"><span><b>Primary</b><small data-hex="primary">${esc(c.primary)}</small></span></label>
          <label class="color-field"><input type="color" data-k="accent" value="${esc(c.accent)}"><span><b>Accent</b><small data-hex="accent">${esc(c.accent)}</small></span></label>
        </div>

        <h3 class="pane-h">Headline font</h3>
        <div class="font-grid">
          ${Object.entries(FONT_STYLES).map(([k, f]) => `<button class="font-card ${c.font === k ? 'on' : ''}" data-font="${k}"><b style="font-family:'${f.family}';font-weight:${f.weight}">${f.upper ? 'KITCHEN REMODEL' : 'Kitchen Remodel'}</b><small>${f.label}</small></button>`).join('')}
        </div>

        <h3 class="pane-h">Trust badges</h3>
        <div class="chip-row wrap" id="badgeChips"></div>
        <div class="row gap"><input id="customBadge" placeholder="Add your own badge…" enterkeyhint="done"><button class="btn tonal sm" id="addBadge">${icon('plus')}Add</button></div>

        <h3 class="pane-h">Hashtags</h3>
        <label class="field"><textarea data-k="hashtags" rows="2" autocapitalize="off" placeholder="#electrician #panelupgrade">${esc(c.hashtags)}</textarea></label>
      </section>
    </div>
  </div>`;

  const canvas = $('#canvas', root);
  const status = (t) => { const s = $('#appbarSub'); if (s) s.textContent = t; };
  const redraw = debounce(async () => {
    await render(canvas, previewProject, c, 0);
    $('#canvasBox', root).style.setProperty('--ar', `${canvas.width}/${canvas.height}`);
  }, 60);

  let saveTimer = null;
  const save = async () => {
    clearTimeout(saveTimer); saveTimer = null;
    await saveClient(c);
    if (!persisted) {
      persisted = true;
      history.replaceState(null, '', '#/c/' + c.id + (query ? '?' + query : ''));
      if (forProject) {
        const p = state.projects.find((x) => x.id === forProject);
        if (p) { p.clientId = c.id; p.updated = Date.now(); await saveProject(p); }
      }
    }
    status('Saved');
  };
  const changed = () => {
    status('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save().catch((e) => toast('Could not save: ' + e.message)), 450);
    redraw();
  };

  $$('[data-k]', root).forEach((el) => el.addEventListener('input', () => {
    c[el.dataset.k] = el.value.trim();
    if (el.type === 'color') $(`[data-hex="${el.dataset.k}"]`, root).textContent = el.value;
    if (el.dataset.k === 'name') $('#appbar h1').textContent = c.name || 'New client';
    changed();
  }));

  $$('[data-trade]', root).forEach((b) => b.onclick = () => {
    const prev = tradeById(c.trade), t = tradeById(b.dataset.trade);
    c.trade = t.id;
    c.primary = t.primary; c.accent = t.accent;
    if (!c.hashtags || c.hashtags === prev.hashtags) c.hashtags = t.hashtags;
    if (!c.badges.length) c.badges = t.badges.slice(0, 2);
    $$('[data-trade]', root).forEach((x) => x.classList.toggle('on', x === b));
    syncColors(); renderBadges();
    $('[data-k="hashtags"]', root).value = c.hashtags;
    toast(`${t.label} colors applied`);
    changed();
  });

  function syncColors() {
    for (const k of ['primary', 'accent']) { $(`input[data-k="${k}"]`, root).value = c[k]; $(`[data-hex="${k}"]`, root).textContent = c[k]; }
  }
  $$('[data-pal]', root).forEach((b) => b.onclick = () => { [c.primary, c.accent] = b.dataset.pal.split(','); syncColors(); changed(); });
  $$('[data-font]', root).forEach((b) => b.onclick = () => { c.font = b.dataset.font; $$('[data-font]', root).forEach((x) => x.classList.toggle('on', x === b)); changed(); });
  $$('[data-pt]', root).forEach((b) => b.onclick = () => {
    previewProject.template = b.dataset.pt;
    $$('[data-pt]', root).forEach((x) => x.classList.toggle('on', x === b));
    redraw();
  });

  function renderBadges() {
    const all = [...new Set([...BADGES, ...c.badges])];
    $('#badgeChips', root).innerHTML = all.map((b) => `<button class="chip sm ${c.badges.includes(b) ? 'on' : ''}" data-badge="${esc(b)}">${c.badges.includes(b) ? icon('check') : ''}${esc(b)}</button>`).join('');
    $$('[data-badge]', root).forEach((el) => el.onclick = () => {
      const b = el.dataset.badge;
      c.badges = c.badges.includes(b) ? c.badges.filter((x) => x !== b) : [...c.badges, b];
      renderBadges(); changed();
    });
  }
  const addCustom = () => {
    const v = $('#customBadge', root).value.trim();
    if (!v) return;
    if (!c.badges.includes(v)) c.badges.push(v);
    $('#customBadge', root).value = '';
    renderBadges(); changed();
  };
  $('#addBadge', root).onclick = addCustom;
  $('#customBadge', root).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } };

  async function renderLogo() {
    const img = await imageFor(c.logo);
    $('#logoTile', root).innerHTML = img ? `<img src="${img.src}" alt="Logo">` : `<span>${icon('image')}<small>No logo</small></span>`;
    $('#logoTile', root).classList.toggle('chip-bg', !!c.logoChip);
    $('#logoRemove', root).hidden = !c.logo;
    $('#logoChip', root).checked = !!c.logoChip;
  }
  $('#logoBtn', root).onclick = async () => {
    const f = await pickFile();
    if (!f) return;
    try {
      c.logo = await db.putBlob(await prepareImage(f, { maxEdge: 900, keepAlpha: true }));
      renderLogo(); changed();
    } catch (e) { toast(e.message); }
  };
  $('#logoRemove', root).onclick = () => { c.logo = null; renderLogo(); changed(); };
  $('#logoChip', root).onchange = (e) => { c.logoChip = e.target.checked; renderLogo(); changed(); };

  $('#moreBtn').onclick = async () => {
    const used = state.projects.filter((p) => p.clientId === c.id).length;
    const v = await sheet({ title: c.name || 'Client', actions: [
      { label: 'New project for this client', icon: 'plus', value: 'new' },
      { label: 'Delete client', icon: 'trash-2', danger: true, value: 'del' },
    ] });
    if (v === 'new') { await save(); location.hash = '#/new?client=' + c.id; }
    if (v === 'del') {
      if (used) return toast(`Move or delete its ${used} project${used === 1 ? '' : 's'} first.`);
      if (!persisted || await confirmSheet('Delete this client?', 'Its logo and brand settings will be removed.', 'Delete client')) {
        clearTimeout(saveTimer);
        if (persisted) await deleteClient(c.id);
        persisted = true; // nothing left to save
        location.hash = '#/clients';
      }
    }
  };

  renderBadges();
  await renderLogo();
  await render(canvas, previewProject, c, 0);
  $('#canvasBox', root).style.setProperty('--ar', `${canvas.width}/${canvas.height}`);

  return async () => { redraw.cancel(); if (saveTimer) await save(); };
}
