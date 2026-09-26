// Brand: the business identity used on every graphic — name, trade, contact info, logo,
// color theme, font, badges and hashtags. Most people have one brand; a list appears only
// if they add another (e.g. a second business). Stored as "clients" records for sync.
import { $, $$, esc, chrome, sheet, confirmSheet, toast, pickFile, debounce } from '../ui.js';
import { icon } from '../icons.js';
import { state, loadAll, saveClient, deleteClient, saveProject, brandLabel } from '../store.js';
import { render } from '../render.js';
import { TRADES, tradeById, BADGES, FONT_STYLES, THEMES, ELEMENT_SIZES, themeFor, newClient, newProject } from '../presets.js';
import { prepareImage, imageFor } from '../images.js';
import { db } from '../db.js';
import { mountSyncButton } from './syncbutton.js';

// Bottom-tab entry: straight into the brand editor, or a list when there is more than one brand.
export async function brandTab(root, query) {
  await loadAll();
  if (state.clients.length > 1) return brandsView(root);
  return brandView(root, state.clients[0]?.id || 'new', query, { tab: true });
}

export async function brandsView(root) {
  await loadAll();
  chrome({ title: 'Brands', large: true, tab: 'brand' });
  mountSyncButton();
  const count = (c) => state.projects.filter((p) => p.clientId === c.id).length;
  root.innerHTML = `
    <div class="client-list">
      ${state.clients.map((c) => `
        <a class="client-card" href="#/c/${c.id}">
          <span class="client-logo" style="background:${esc(c.primary)};color:${esc(c.accent)}" data-logo="${c.logo || ''}">${icon(tradeById(c.trade).icon)}</span>
          <span class="client-meta"><b>${esc(brandLabel(c))}</b><small>${esc([c.label && c.name, tradeById(c.trade).label, `${count(c)} project${count(c) === 1 ? '' : 's'}`].filter(Boolean).join(' · '))}</small></span>
          <span class="swatches"><i style="background:${esc(c.primary)}"></i><i style="background:${esc(c.accent)}"></i></span>
          ${icon('chevron-right', 'chev')}
        </a>`).join('')}
    </div>
    <a class="fab" href="#/c/new">${icon('plus')}<span>Add brand</span></a>`;
  for (const el of $$('[data-logo]', root)) {
    if (!el.dataset.logo) continue;
    imageFor(el.dataset.logo).then((img) => { if (img) { el.innerHTML = `<img src="${img.src}" alt="">`; el.classList.add('has-img'); } });
  }
}

// Example job for the preview and font samples, matched to the brand's trade.
const demoFor = (trade) => ({ ...tradeById(trade).sample, location: 'West Chester, PA' });
const fontSample = (f, trade) => (f.upper ? tradeById(trade).sample.title.toUpperCase() : tradeById(trade).sample.title);

const sizeSeg = (name, value) => `<div class="mini-seg size-pick" data-size-for="${name}">
  ${Object.entries(ELEMENT_SIZES).map(([k, s]) => `<button data-v="${k}" class="${value === k ? 'on' : ''}" aria-label="${s.name}">${s.label}</button>`).join('')}
</div>`;

export async function brandView(root, id, query, opts = {}) {
  await loadAll();
  let c = state.clients.find((x) => x.id === id);
  let persisted = !!c;
  if (!c) c = newClient();
  c.logoSize ||= 'm';
  c.qrSize ||= 'm';
  const params = new URLSearchParams(query || '');
  const forProject = params.get('for');
  const from = params.get('from');
  const back = opts.tab ? null : from ? '#/' + from : forProject ? '#/p/' + forProject : state.clients.length > 1 ? '#/brand' : '#/';

  chrome({
    title: opts.tab ? 'Brand' : (persisted ? brandLabel(c) : 'New brand'), back, tab: opts.tab ? 'brand' : null,
    actions: `<button class="icon-btn" id="moreBtn" aria-label="Brand options">${icon('ellipsis-vertical')}</button>`,
  });
  if (opts.tab) mountSyncButton();

  const sample = state.projects.filter((p) => p.clientId === c.id).sort((a, b) => b.updated - a.updated)[0];
  const previewProject = sample ? structuredClone(sample) : newProject({ ...demoFor(c.trade), template: 'split' });
  previewProject.logoSize = ''; previewProject.qrSize = '';
  const previewShow = () => { previewProject.show = { logo: true, badges: true, contact: true, qr: !!(c.website || c.bookingUrl) }; };
  previewShow();

  const field = (key, label, attrs = '') => `<label class="field"><span>${label}</span><input data-k="${key}" value="${esc(c[key])}" ${attrs}></label>`;
  root.innerHTML = `
  <div class="editor client-editor ${opts.tab ? 'in-tab' : ''}">
    <section class="stage">
      <div class="canvas-box" id="canvasBox"><canvas id="canvas" aria-label="Brand preview"></canvas></div>
      <div class="mini-seg center" id="previewTpl">
        ${[['split', 'Before & After'], ['spotlight', 'Spotlight'], ['offer', 'Offer']].map(([k, l]) => `<button data-pt="${k}" class="${previewProject.template === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
    </section>
    <div class="editor-panel">
      <section class="pane">
        <div ${state.clients.length > 1 || c.label || (!persisted && state.clients.length) ? '' : 'hidden'}>
          <h3 class="pane-h">Brand nickname</h3>
          <label class="field"><span>Only shown in the app, to tell your brands apart</span>
            <input data-k="label" value="${esc(c.label)}" placeholder="${esc(c.name || 'e.g. Summer look')}" autocomplete="off"></label>
          <p class="field-warn" id="labelWarn" hidden>Another brand already uses this name.</p>
        </div>
        <h3 class="pane-h">Business</h3>
        ${field('name', 'Company name', 'autocomplete="organization" placeholder="Acme Electric"')}
        <label class="field"><span>Trade <small>suggests job types, badges and hashtags</small></span>
          <select id="fTrade">${TRADES.map((t) => `<option value="${t.id}" ${c.trade === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
        </label>
        ${field('tagline', 'Tagline', 'placeholder="Built right. Built to last."')}
        <div class="two">
          ${field('phone', 'Phone', 'type="tel" autocomplete="tel" placeholder="(555) 555-1234"')}
          ${field('website', 'Website', 'type="url" inputmode="url" autocapitalize="off" placeholder="acmeelectric.com"')}
        </div>
        ${field('serviceArea', 'Service area', 'placeholder="Chester County, PA"')}
        <div class="three">
          ${field('license', 'License #', 'placeholder="PA123456"')}
          ${field('years', 'Years in business', 'inputmode="numeric" placeholder="15"')}
          ${field('rating', 'Star rating', 'inputmode="decimal" placeholder="4.9"')}
        </div>

        <h3 class="pane-h">Color theme</h3>
        <div class="theme-grid" id="themeGrid">
          ${THEMES.map((t) => `<button class="theme-chip" data-theme="${t.id}"><i class="theme-swatch" style="--p:${t.primary};--a:${t.accent}"></i><span>${esc(t.name)}</span></button>`).join('')}
          <button class="theme-chip" data-theme="custom"><i class="theme-swatch custom"></i><span>Custom colors</span></button>
        </div>
        <div class="two custom-colors" id="customColors">
          <label class="color-field"><input type="color" data-k="primary" value="${esc(c.primary)}"><span><b>Background</b><small data-hex="primary">${esc(c.primary)}</small></span></label>
          <label class="color-field"><input type="color" data-k="accent" value="${esc(c.accent)}"><span><b>Accent</b><small data-hex="accent">${esc(c.accent)}</small></span></label>
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
        <div class="size-row"><span>Logo size</span>${sizeSeg('logo', c.logoSize)}</div>

        <h3 class="pane-h">QR code</h3>
        ${field('bookingUrl', 'QR code link <small>optional — defaults to your website</small>', 'type="url" inputmode="url" autocapitalize="off" placeholder="https://…"')}
        <div class="size-row"><span>QR code size</span>${sizeSeg('qr', c.qrSize)}</div>
        <p class="muted small">Turn the QR code on for a post in its <b>Design</b> tab. Posts can also use a different logo or QR size there.</p>

        <h3 class="pane-h">Headline font</h3>
        <div class="font-grid">
          ${Object.entries(FONT_STYLES).map(([k, f]) => `<button class="font-card ${c.font === k ? 'on' : ''}" data-font="${k}"><b style="font-family:'${f.family}';font-weight:${f.weight}" data-font-sample="${k}">${esc(fontSample(f, c.trade))}</b><small>${f.label}</small></button>`).join('')}
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
      if (!opts.tab) history.replaceState(null, '', '#/c/' + c.id + (query ? '?' + query : ''));
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
    if (el.type === 'color') { $(`[data-hex="${el.dataset.k}"]`, root).textContent = el.value; }
    if ((el.dataset.k === 'name' || el.dataset.k === 'label') && !opts.tab) $('#appbar h1').textContent = brandLabel(c);
    if (el.dataset.k === 'name') $('[data-k="label"]', root).placeholder = c.name || 'e.g. Summer look';
    if (el.dataset.k === 'label' || el.dataset.k === 'name') checkLabel();
    if (el.dataset.k === 'website' || el.dataset.k === 'bookingUrl') previewShow();
    changed();
  }));

  // Trade drives suggestions only — never colors.
  $('#fTrade', root).onchange = (e) => {
    const prev = tradeById(c.trade), t = tradeById(e.target.value);
    c.trade = t.id;
    if (!c.hashtags || c.hashtags === prev.hashtags) { c.hashtags = t.hashtags; $('[data-k="hashtags"]', root).value = c.hashtags; }
    if (!c.badges.length) { c.badges = t.badges.slice(0, 2); renderBadges(); }
    // Font samples and (if there's no real project yet) the preview show a job from this trade.
    $$('[data-font-sample]', root).forEach((el) => { el.textContent = fontSample(FONT_STYLES[el.dataset.fontSample], t.id); });
    if (!sample) Object.assign(previewProject, demoFor(t.id));
    changed();
  };

  // A theme chip is highlighted when the colors match it; "Custom" shows the color pickers.
  let customOpen = !themeFor(c);
  function syncThemes() {
    const match = customOpen ? null : themeFor(c);
    const active = match ? match.id : 'custom';
    $$('[data-theme]', root).forEach((b) => b.classList.toggle('on', b.dataset.theme === active));
    $('#customColors', root).hidden = active !== 'custom';
    for (const k of ['primary', 'accent']) { $(`input[data-k="${k}"]`, root).value = c[k]; $(`[data-hex="${k}"]`, root).textContent = c[k]; }
  }
  $$('[data-theme]', root).forEach((b) => b.onclick = () => {
    if (b.dataset.theme === 'custom') { customOpen = true; syncThemes(); return; }
    const t = THEMES.find((x) => x.id === b.dataset.theme);
    c.primary = t.primary; c.accent = t.accent;
    customOpen = false;
    syncThemes(); changed();
  });

  $$('[data-size-for]', root).forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    c[seg.dataset.sizeFor === 'logo' ? 'logoSize' : 'qrSize'] = b.dataset.v;
    $$('[data-v]', seg).forEach((x) => x.classList.toggle('on', x === b));
    changed();
  }));

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
    const multiple = state.clients.length > 1;
    const v = await sheet({ title: brandLabel(c), actions: [
      { label: 'New project with this brand', icon: 'plus', value: 'new' },
      { label: 'Duplicate this brand', icon: 'copy', value: 'dup' },
      { label: 'Add a blank brand', icon: 'briefcase', value: 'add' },
      ...(multiple || !persisted ? [{ label: 'Delete this brand', icon: 'trash-2', danger: true, value: 'del' }] : []),
    ] });
    if (v === 'new') { await save(); location.hash = '#/new?client=' + c.id; }
    if (v === 'dup') {
      // Copy everything (logo, contact info, badges…) so only the differences need editing.
      // The logo image is shared by id; cleanup only removes images no brand uses.
      if (saveTimer || !persisted) await save();
      // Same company name on the graphics; only the in-app nickname changes.
      const copy = { ...structuredClone(c), id: crypto.randomUUID(), label: uniqueLabel(`${brandLabel(c).replace(/ \(copy( \d+)?\)$/, '')} (copy)`) };
      await saveClient(copy);
      toast('Brand duplicated — now editing the copy');
      location.hash = '#/c/' + copy.id;
    }
    if (v === 'add') { if (saveTimer || !persisted) await save(); location.hash = '#/c/new'; }
    if (v === 'del') {
      if (used) return toast(`Move or delete its ${used} project${used === 1 ? '' : 's'} first.`);
      if (!persisted || await confirmSheet('Delete this brand?', 'Its logo and settings will be removed.', 'Delete brand')) {
        clearTimeout(saveTimer);
        if (persisted) await deleteClient(c.id);
        persisted = true; // nothing left to save
        location.hash = '#/brand';
      }
    }
  };

  function checkLabel() {
    const mine = brandLabel(c).trim().toLowerCase();
    $('#labelWarn', root).hidden = !state.clients.some((x) => x.id !== c.id && brandLabel(x).trim().toLowerCase() === mine);
  }
  function uniqueLabel(want) {
    const taken = new Set(state.clients.map((x) => brandLabel(x).toLowerCase()));
    let label = want, n = 2;
    while (taken.has(label.toLowerCase())) label = want.replace(/\)$/, ` ${n++})`);
    return label;
  }

  checkLabel();
  syncThemes();
  renderBadges();
  await renderLogo();
  await render(canvas, previewProject, c, 0);
  $('#canvasBox', root).style.setProperty('--ar', `${canvas.width}/${canvas.height}`);

  return async () => { redraw.cancel(); if (saveTimer) await save(); };
}
