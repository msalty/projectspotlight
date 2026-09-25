import { $, $$, esc, chrome, sheet, confirmSheet, toast, debounce, pickFile } from '../ui.js';
import { icon } from '../icons.js';
import { state, loadAll, clientFor, saveProject, deleteProject } from '../store.js';
import { render, renderBlob, TEMPLATES, templateById, pageCount } from '../render.js';
import { SIZES, FONT_STYLES, HEADLINE_TAGS, tradeById } from '../presets.js';
import { prepareImage, imageFor } from '../images.js';
import { db, collectGarbage } from '../db.js';
import { buildCaption } from '../caption.js';
import { getConfig, isConnected, saveGraphicsToDrive } from '../sync.js';

let lastTab = 'photos';
const touchUI = matchMedia('(pointer: coarse)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export async function editorView(root, id) {
  await loadAll();
  let p = state.projects.find((x) => x.id === id);
  let persisted = !!p;
  if (!p && state.pendingProject?.id === id) p = state.pendingProject;
  if (!p) { toast('Project not found'); location.replace('#/'); return; }
  let client = clientFor(p);
  let page = 0, slots = [], selected = p.photos.after ? 'after' : 'before';
  let tab = lastTab;

  chrome({
    title: p.title || 'New project', back: '#/',
    actions: `<button class="icon-btn" id="moreBtn" aria-label="Project options">${icon('ellipsis-vertical')}</button>`,
  });

  root.innerHTML = `
  <div class="editor">
    <section class="stage" id="stage">
      <div class="canvas-box" id="canvasBox">
        <canvas id="canvas" width="1080" height="1080" aria-label="Design preview"></canvas>
        <div class="pager" id="pager" hidden>
          <button class="icon-btn sm" id="prevPage" aria-label="Previous slide">${icon('chevron-right', 'flip')}</button>
          <span id="pageLabel"></span>
          <button class="icon-btn sm" id="nextPage" aria-label="Next slide">${icon('chevron-right')}</button>
        </div>
      </div>
      <p class="stage-hint">${icon('move')}<span>${touchUI ? 'Drag a photo to reposition · pinch to zoom' : 'Drag a photo to reposition · scroll to zoom'}</span></p>
    </section>

    <div class="editor-panel">
      <nav class="seg-tabs" role="tablist">
        ${[['photos', 'camera', 'Photos'], ['details', 'pencil', 'Details'], ['design', 'layout-template', 'Design'], ['share', 'share', 'Share']]
          .map(([k, ic, l]) => `<button role="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}">${icon(ic)}<span>${l}</span></button>`).join('')}
      </nav>

      <section class="pane" data-pane="photos">
        <div class="slot-grid">
          ${['before', 'after'].map((k) => `
            <div class="slot-tile" data-slot="${k}">
              <div class="slot-media"></div>
              <span class="slot-label ${k}">${k}</span>
              <div class="slot-actions"></div>
            </div>`).join('')}
        </div>
        <div class="row gap">
          <button class="btn tonal sm" id="swapBtn">${icon('images')}Swap before / after</button>
        </div>
        <div class="card adjust" id="adjust">
          <div class="adjust-head"><b>Position</b>
            <div class="mini-seg">${['before', 'after'].map((k) => `<button data-sel="${k}">${k}</button>`).join('')}</div>
          </div>
          <label class="range">${icon('zoom-in')}<input type="range" id="zoom" min="1" max="4" step="0.01" aria-label="Zoom"></label>
          <button class="btn text sm" id="resetAdj">Reset position</button>
        </div>
      </section>

      <section class="pane" data-pane="details">
        <label class="field"><span>Client / brand</span>
          <div class="row gap">
            <select id="fClient">${state.clients.map((c) => `<option value="${c.id}">${esc(c.name || 'Untitled client')}</option>`).join('')}<option value="__new">+ Add a new client…</option></select>
            <a class="btn tonal sm" id="editClient" href="#/c/${client.id}">${icon('palette')}Brand</a>
          </div>
        </label>
        <label class="field"><span>Project title</span><input id="fTitle" autocomplete="off" enterkeyhint="next" placeholder="e.g. 200A Panel Upgrade" value="${esc(p.title)}"></label>
        <div class="field"><span>Category</span>
          <input id="fCategory" autocomplete="off" enterkeyhint="next" placeholder="Kitchen, Panel Upgrade…" value="${esc(p.category)}">
          <div class="chip-row tight" id="catChips"></div>
        </div>
        <label class="field"><span>Location</span><input id="fLocation" autocomplete="address-level2" enterkeyhint="next" placeholder="West Chester, PA" value="${esc(p.location)}"></label>
        <label class="field"><span>Description <small id="descCount"></small></span>
          <textarea id="fDesc" rows="4" placeholder="What did you do? Keep it short — 1–3 sentences work best.">${esc(p.description)}</textarea></label>
        <div class="field"><span>Headline tag</span>
          <input id="fHeadline" autocomplete="off" placeholder="Project Spotlight" value="${esc(p.headline)}">
          <div class="chip-row tight">${HEADLINE_TAGS.map((t) => `<button class="chip sm" data-headline="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        </div>
      </section>

      <section class="pane" data-pane="design">
        <h3 class="pane-h">Template</h3>
        <div class="tpl-strip" id="tplStrip">
          ${TEMPLATES.map((t) => `<button class="tpl" data-tpl="${t.id}"><canvas></canvas><span>${esc(t.label)}</span></button>`).join('')}
        </div>
        <div id="tplFields"></div>
        <h3 class="pane-h">Size</h3>
        <div class="size-seg">
          ${Object.entries(SIZES).map(([k, s]) => `<button data-size="${k}"><i style="--ar:${s.w}/${s.h}"></i><b>${s.label}</b><small>${s.hint}</small></button>`).join('')}
        </div>
        <h3 class="pane-h">Headline font</h3>
        <div class="chip-row" id="fontChips">
          <button class="chip font" data-font="">Brand default</button>
          ${Object.entries(FONT_STYLES).map(([k, f]) => `<button class="chip font" data-font="${k}" style="font-family:'${f.family}';font-weight:${f.weight}">${f.upper ? f.label.toUpperCase() : f.label}</button>`).join('')}
        </div>
        <h3 class="pane-h">Show on graphic</h3>
        <div class="card list">
          ${[['logo', 'Logo', 'image'], ['badges', 'Trust badges', 'shield-check'], ['contact', 'Phone & website', 'phone'], ['qr', 'QR code to website', 'qr-code']]
            .map(([k, l, ic]) => `<label class="switch-row">${icon(ic)}<span>${l}</span><input type="checkbox" role="switch" data-show="${k}"></label>`).join('')}
        </div>
        <p class="muted small" id="qrNote" hidden>Add a website or booking link to the brand to use a QR code.</p>
      </section>

      <section class="pane" data-pane="share">
        <div class="card drive-card" id="driveCard" hidden>
          ${icon('folder-open')}<div><b>Save to Google Drive</b><small>Keeps a copy of the finished graphic in your Graphics folder.</small></div>
          <button class="btn tonal sm" id="driveBtn">${icon('upload')}Save</button>
        </div>
        <div class="field"><span>Caption <small>copied automatically when you share</small></span>
          <textarea id="fCaption" rows="9"></textarea>
          <div class="row gap">
            <button class="btn tonal sm" id="copyCaption">${icon('copy')}Copy caption</button>
            <button class="btn text sm" id="resetCaption">Regenerate</button>
          </div>
        </div>
        <p class="muted small">Tip: Instagram ignores text from the share sheet — paste the caption after choosing your photo.</p>
      </section>
    </div>
  </div>
  <div class="action-bar">
    <button class="btn tonal" id="saveBtn">${icon('download')}<span>Save</span></button>
    <button class="btn primary" id="shareBtn">${icon('share')}<span>Share</span></button>
  </div>`;

  const canvas = $('#canvas', root);
  const status = (t) => { const s = $('#appbarSub'); if (s) s.textContent = t; };

  // ------------------------------------------------------------ saving
  const isEmpty = () => !p.title && !p.description && !p.photos.before && !p.photos.after;
  let saveTimer = null;
  async function save() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!persisted && isEmpty()) { status(''); return; }
    await saveProject(p);
    if (!persisted && state.pendingProject?.id === p.id) state.pendingProject = null;
    persisted = true;
    status('Saved on this device');
  }
  function changed({ redraw: rd = true } = {}) {
    p.updated = Date.now();
    status('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save().catch((e) => toast('Could not save: ' + e.message)), 450);
    if (rd) redraw();
  }

  // ------------------------------------------------------------ rendering
  let drawing = false, again = false;
  async function redraw() {
    if (drawing) { again = true; return; }
    drawing = true;
    try { slots = await render(canvas, p, client, page); } catch (e) { console.error(e); }
    drawing = false;
    if (again) { again = false; return redraw(); }
    updatePager();
    prerender();
    if (tab === 'design') thumbsLater();
  }
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  let rafPending = false;
  const redrawSoon = () => { if (!rafPending) { rafPending = true; frame().then(() => { rafPending = false; redraw(); }); } };

  function updatePager() {
    const tpl = templateById(p.template), n = pageCount(p);
    $('#pager', root).hidden = n < 2;
    if (n > 1) $('#pageLabel', root).textContent = `${tpl.pages[page]} · ${page + 1}/${n}`;
    const s = SIZES[p.size] || SIZES.square;
    $('#canvasBox', root).style.setProperty('--ar', `${s.w}/${s.h}`);
  }
  $('#prevPage', root).onclick = () => { page = (page + pageCount(p) - 1) % pageCount(p); redraw(); };
  $('#nextPage', root).onclick = () => { page = (page + 1) % pageCount(p); redraw(); };

  // ------------------------------------------------------------ tabs
  function showTab(k) {
    tab = lastTab = k;
    $$('.seg-tabs button', root).forEach((b) => b.classList.toggle('on', b.dataset.tab === k));
    $$('.pane', root).forEach((s) => s.hidden = s.dataset.pane !== k);
    if (k === 'design') thumbsLater(0);
    if (k === 'share') refreshCaption();
  }
  $$('.seg-tabs button', root).forEach((b) => b.onclick = () => showTab(b.dataset.tab));

  // Shrink the preview while the keyboard is open on phones.
  root.addEventListener('focusin', (e) => { if (e.target.matches('input:not([type=checkbox]):not([type=range]),textarea,select')) document.body.classList.add('typing'); });
  root.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement?.matches('input,textarea,select')) document.body.classList.remove('typing'); }, 60));

  // ------------------------------------------------------------ photos
  async function renderSlots() {
    for (const tile of $$('.slot-tile', root)) {
      const k = tile.dataset.slot, id = p.photos[k];
      const media = $('.slot-media', tile), acts = $('.slot-actions', tile);
      tile.classList.toggle('filled', !!id);
      tile.classList.toggle('selected', k === selected && !!id);
      if (id) {
        const img = await imageFor(id);
        media.innerHTML = img ? `<img src="${img.src}" alt="${k} photo">` : '';
        acts.innerHTML = `<button class="icon-btn glass" data-act="replace" aria-label="Replace ${k} photo">${icon('camera')}</button>
          <button class="icon-btn glass" data-act="remove" aria-label="Remove ${k} photo">${icon('trash-2')}</button>`;
      } else {
        media.innerHTML = `<div class="slot-empty">${icon(k === 'before' ? 'image' : 'sparkles')}<b>Add ${k} photo</b></div>`;
        acts.innerHTML = `${touchUI ? `<button class="btn primary sm" data-act="camera">${icon('camera')}Camera</button>` : ''}
          <button class="btn ${touchUI ? 'tonal' : 'primary'} sm" data-act="library">${icon('images')}${touchUI ? 'Library' : 'Choose photo'}</button>`;
      }
    }
    $$('[data-sel]', root).forEach((b) => b.classList.toggle('on', b.dataset.sel === selected));
    $('#zoom', root).value = (p.adjust[selected] || {}).zoom || 1;
    $('#adjust', root).hidden = !p.photos.before && !p.photos.after;
  }

  async function addPhoto(k, capture) {
    const file = await pickFile({ capture });
    if (!file) return;
    const tile = $(`.slot-tile[data-slot="${k}"]`, root);
    tile.classList.add('busy');
    try {
      const blob = await prepareImage(file);
      p.photos[k] = await db.putBlob(blob);
      delete p.adjust[k];
      selected = k;
      changed();
      await renderSlots();
    } catch (e) {
      toast(e.message);
    } finally {
      tile.classList.remove('busy');
    }
  }

  root.querySelector('.slot-grid').addEventListener('click', async (e) => {
    const tile = e.target.closest('.slot-tile');
    if (!tile) return;
    const k = tile.dataset.slot;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'camera') return addPhoto(k, true);
    if (act === 'library') return addPhoto(k, false);
    if (act === 'remove') {
      p.photos[k] = null; delete p.adjust[k]; changed(); renderSlots(); return;
    }
    if (act === 'replace') {
      if (!touchUI) return addPhoto(k, false);
      const v = await sheet({ title: `Replace ${k} photo`, actions: [{ label: 'Take photo', icon: 'camera', value: 'c' }, { label: 'Choose from library', icon: 'images', value: 'l' }] });
      if (v) addPhoto(k, v === 'c');
      return;
    }
    if (!p.photos[k]) return addPhoto(k, false);
    selected = k; renderSlots();
  });

  $('#swapBtn', root).onclick = () => {
    p.photos = { before: p.photos.after, after: p.photos.before };
    p.adjust = { before: p.adjust.after, after: p.adjust.before };
    changed(); renderSlots();
  };
  $$('[data-sel]', root).forEach((b) => b.onclick = () => { selected = b.dataset.sel; renderSlots(); });
  const adj = (k) => (p.adjust[k] ||= { fx: 0.5, fy: 0.5, zoom: 1 });
  $('#zoom', root).oninput = (e) => { adj(selected).zoom = +e.target.value; redrawSoon(); };
  $('#zoom', root).onchange = () => changed({ redraw: false });
  $('#resetAdj', root).onclick = () => { delete p.adjust[selected]; changed(); renderSlots(); };

  // ------------------------------------------------------------ drag & pinch on the preview
  const hitCtx = document.createElement('canvas').getContext('2d');
  const pointers = new Map();
  let gesture = null;
  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
  };
  const hit = (pt) => [...slots].reverse().find((s) => (s.path ? hitCtx.isPointInPath(s.path, pt.x, pt.y)
    : pt.x >= s.x && pt.x <= s.x + s.w && pt.y >= s.y && pt.y <= s.y + s.h));
  const slotNow = (k) => slots.find((s) => s.key === k);
  const dist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const startPan = (pt, key) => { gesture = { key, mode: 'pan', start: pt, a0: { ...adj(key) } }; };

  canvas.addEventListener('pointerdown', (e) => {
    const pt = toCanvas(e);
    pointers.set(e.pointerId, pt);
    if (pointers.size === 1) {
      const s = hit(pt);
      if (!s || !p.photos[s.key]) { gesture = null; return; }
      canvas.setPointerCapture(e.pointerId);
      startPan(pt, s.key);
      if (selected !== s.key) { selected = s.key; renderSlots(); }
      canvas.classList.add('dragging');
    } else if (pointers.size === 2 && gesture) {
      canvas.setPointerCapture(e.pointerId);
      gesture = { key: gesture.key, mode: 'pinch', d0: dist(), a0: { ...adj(gesture.key) } };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const pt = toCanvas(e);
    pointers.set(e.pointerId, pt);
    if (!gesture) return;
    const a = adj(gesture.key), s = slotNow(gesture.key);
    if (gesture.mode === 'pan' && s) {
      if (s.ow > 0.5) a.fx = clamp(gesture.a0.fx - (pt.x - gesture.start.x) / s.ow, 0, 1);
      if (s.oh > 0.5) a.fy = clamp(gesture.a0.fy - (pt.y - gesture.start.y) / s.oh, 0, 1);
    } else if (gesture.mode === 'pinch' && pointers.size >= 2) {
      a.zoom = clamp(gesture.a0.zoom * (dist() / gesture.d0), 1, 4);
      $('#zoom', root).value = a.zoom;
    }
    redrawSoon();
  });
  const endPointer = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (gesture && pointers.size === 1) { startPan([...pointers.values()][0], gesture.key); return; }
    if (pointers.size === 0) {
      canvas.classList.remove('dragging');
      if (gesture) { gesture = null; changed({ redraw: false }); }
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => {
    const s = hit(toCanvas(e));
    if (!s || !p.photos[s.key]) return;
    e.preventDefault();
    const a = adj(s.key);
    a.zoom = clamp(a.zoom * (1 - e.deltaY * 0.0015), 1, 4);
    selected = s.key;
    $('#zoom', root).value = a.zoom;
    redrawSoon();
    saveWheel();
  }, { passive: false });
  const saveWheel = debounce(() => changed({ redraw: false }), 400);

  // ------------------------------------------------------------ details
  const bindText = (sel, key, after) => {
    $(sel, root).addEventListener('input', (e) => { p[key] = e.target.value; changed(); after?.(); });
  };
  bindText('#fTitle', 'title', () => { $('#appbar h1').textContent = p.title || 'New project'; });
  bindText('#fCategory', 'category', () => renderCatChips());
  bindText('#fLocation', 'location');
  bindText('#fDesc', 'description', () => updateCount());
  bindText('#fHeadline', 'headline');
  const updateCount = () => { $('#descCount', root).textContent = p.description ? `${p.description.length} chars` : ''; };
  updateCount();
  $$('[data-headline]', root).forEach((b) => b.onclick = () => { p.headline = b.dataset.headline; $('#fHeadline', root).value = p.headline; changed(); });

  function renderCatChips() {
    const cats = tradeById(client.trade).categories;
    $('#catChips', root).innerHTML = cats.map((c) => `<button class="chip sm ${c === p.category ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    $$('[data-cat]', root).forEach((b) => b.onclick = () => { p.category = b.dataset.cat; $('#fCategory', root).value = p.category; changed(); renderCatChips(); });
  }

  $('#fClient', root).value = client.id;
  $('#fClient', root).onchange = async (e) => {
    if (e.target.value === '__new') { await save(); location.hash = '#/c/new?for=' + p.id; return; }
    p.clientId = e.target.value;
    client = clientFor(p);
    $('#editClient', root).href = '#/c/' + client.id;
    renderCatChips();
    changed();
  };

  // ------------------------------------------------------------ design
  function syncDesign() {
    $$('[data-tpl]', root).forEach((b) => b.classList.toggle('on', b.dataset.tpl === p.template));
    $$('[data-size]', root).forEach((b) => b.classList.toggle('on', b.dataset.size === p.size));
    $$('[data-font]', root).forEach((b) => b.classList.toggle('on', b.dataset.font === (p.font || '')));
    $$('[data-show]', root).forEach((i) => i.checked = !!p.show[i.dataset.show]);
    $('#qrNote', root).hidden = !(p.show.qr && !(client.website || client.bookingUrl));
    renderTplFields();
  }
  function renderTplFields() {
    const box = $('#tplFields', root);
    if (p.template === 'review') {
      box.innerHTML = `<div class="card fields">
        <label class="field"><span>Customer review</span><textarea id="fReview" rows="3" placeholder="Paste a customer review…">${esc(p.review.text)}</textarea></label>
        <label class="field"><span>Customer name</span><input id="fReviewer" placeholder="Sarah M." value="${esc(p.review.name)}"></label></div>`;
      $('#fReview', box).oninput = (e) => { p.review.text = e.target.value; changed(); };
      $('#fReviewer', box).oninput = (e) => { p.review.name = e.target.value; changed(); };
    } else if (p.template === 'offer') {
      box.innerHTML = `<div class="card fields">
        <label class="field"><span>Offer headline</span><input id="fOfferH" placeholder="$50 off panel upgrades" value="${esc(p.offer.headline)}"></label>
        <label class="field"><span>Details</span><textarea id="fOfferD" rows="2" placeholder="Book by June 30. Free estimates.">${esc(p.offer.details)}</textarea></label>
        <label class="field"><span>Button text</span><input id="fOfferC" placeholder="Call today" value="${esc(p.offer.cta)}"></label></div>`;
      $('#fOfferH', box).oninput = (e) => { p.offer.headline = e.target.value; changed(); };
      $('#fOfferD', box).oninput = (e) => { p.offer.details = e.target.value; changed(); };
      $('#fOfferC', box).oninput = (e) => { p.offer.cta = e.target.value; changed(); };
    } else if (p.template === 'carousel') {
      box.innerHTML = `<p class="muted small">Carousel exports 4 slides — cover, before, after and details. Use the arrows on the preview to check each one.</p>`;
    } else box.innerHTML = '';
  }
  $$('[data-tpl]', root).forEach((b) => b.onclick = () => { p.template = b.dataset.tpl; page = 0; syncDesign(); changed(); });
  $$('[data-size]', root).forEach((b) => b.onclick = () => { p.size = b.dataset.size; syncDesign(); changed(); thumbsLater(0); });
  $$('[data-font]', root).forEach((b) => b.onclick = () => { p.font = b.dataset.font; syncDesign(); changed(); });
  $$('[data-show]', root).forEach((i) => i.onchange = () => { p.show[i.dataset.show] = i.checked; syncDesign(); changed(); });

  // Live template thumbnails (only while the Design tab is visible).
  const thumbCanvas = document.createElement('canvas');
  async function renderTemplateThumbs() {
    for (const b of $$('[data-tpl]', root)) {
      if (tab !== 'design' || !b.isConnected) return;
      await render(thumbCanvas, { ...p, template: b.dataset.tpl }, client, 0);
      const c = $('canvas', b);
      const w = 180, h = Math.round((thumbCanvas.height * w) / thumbCanvas.width);
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(thumbCanvas, 0, 0, w, h);
    }
  }
  const thumbsDebounced = debounce(() => renderTemplateThumbs().catch(console.error), 700);
  function thumbsLater(ms) { if (ms === 0) { thumbsDebounced.cancel(); renderTemplateThumbs().catch(console.error); } else thumbsDebounced(); }

  // ------------------------------------------------------------ share / export
  const caption = () => p.caption || buildCaption(p, client);
  function refreshCaption() { const el = $('#fCaption', root); if (document.activeElement !== el) el.value = caption(); }
  $('#fCaption', root).oninput = (e) => { p.caption = e.target.value; changed({ redraw: false }); };
  $('#resetCaption', root).onclick = () => { p.caption = ''; refreshCaption(); changed({ redraw: false }); };
  $('#copyCaption', root).onclick = async () => {
    try { await navigator.clipboard.writeText(caption()); toast('Caption copied'); } catch { toast('Copy failed — select the text and copy manually'); }
  };

  const fileName = (i, n) => `${(p.title || 'project-spotlight').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'}${n > 1 ? '-' + (i + 1) : ''}.jpg`;
  async function buildFiles() {
    const n = pageCount(p), files = [];
    for (let i = 0; i < n; i++) files.push(new File([await renderBlob(p, client, i)], fileName(i, n), { type: 'image/jpeg' }));
    return files;
  }
  // Pre-render share files so the share sheet can open immediately on tap (iOS requires this).
  let shareCache = { key: '', files: null };
  const cacheKey = () => JSON.stringify([p, client.updated]);
  const prerender = debounce(async () => {
    if (!navigator.canShare) return;
    const key = cacheKey();
    if (shareCache.key === key) return;
    try { shareCache = { key, files: await buildFiles() }; } catch (e) { console.error(e); }
  }, 1200);

  async function download(files) {
    files ||= await buildFiles();
    for (const f of files) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  async function share() {
    const text = caption();
    navigator.clipboard?.writeText(text).catch(() => {});
    const cached = shareCache.key === cacheKey() ? shareCache.files : null;
    const files = cached || await buildFiles();
    if (navigator.canShare && navigator.canShare({ files })) {
      try {
        await navigator.share({ files, title: p.title || 'Project Spotlight', text });
      } catch (e) {
        if (e.name === 'NotAllowedError' && !cached) { shareCache = { key: cacheKey(), files }; toast('Ready — tap Share again'); }
        else if (e.name !== 'AbortError') toast('Sharing failed: ' + e.message);
      }
    } else {
      await download(files);
      toast(files.length > 1 ? `Saved ${files.length} images · caption copied` : 'Image saved · caption copied');
    }
  }
  async function saveImages() {
    const files = shareCache.key === cacheKey() && shareCache.files;
    // On phones the share sheet's "Save Image" is the reliable way into the photo library.
    if (touchUI && navigator.canShare && files && navigator.canShare({ files })) {
      try { await navigator.share({ files }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    await download(files || null);
    toast('Image saved');
  }
  getConfig().then((c) => { $('#driveCard', root).hidden = !isConnected(c); });
  $('#driveBtn', root).onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const files = shareCache.key === cacheKey() ? shareCache.files : await buildFiles();
      const folderUrl = await saveGraphicsToDrive(files);
      toast(files.length > 1 ? `Saved ${files.length} images to Google Drive` : 'Saved to Google Drive', folderUrl ? { label: 'Open', onClick: () => window.open(folderUrl, '_blank', 'noopener') } : null);
    } catch (err) { toast(err.message); } finally { btn.disabled = false; }
  };
  $('#shareBtn', root).onclick = () => share().catch((e) => toast(e.message));
  $('#saveBtn', root).onclick = () => saveImages().catch((e) => toast(e.message));

  // ------------------------------------------------------------ overflow menu
  $('#moreBtn').onclick = async () => {
    const v = await sheet({ title: p.title || 'Project', actions: [
      { label: 'Duplicate project', icon: 'copy', value: 'dup' },
      { label: 'Edit brand', icon: 'palette', value: 'brand' },
      { label: 'Delete project', icon: 'trash-2', danger: true, value: 'del' },
    ] });
    if (v === 'dup') {
      await save();
      const copy = structuredClone(p);
      Object.assign(copy, { id: crypto.randomUUID(), title: (p.title || 'Untitled') + ' (copy)', created: Date.now(), updated: Date.now() });
      await saveProject(copy);
      toast('Duplicated — now editing the copy');
      location.hash = '#/p/' + copy.id;
    }
    if (v === 'brand') location.hash = '#/c/' + client.id;
    if (v === 'del' && await confirmSheet('Delete this project?', 'Its photos will be removed from this device.', 'Delete project')) {
      clearTimeout(saveTimer);
      persisted = false;
      p.title = ''; p.description = ''; p.photos = {};
      await deleteProject(id);
      location.hash = '#/';
    }
  };

  // ------------------------------------------------------------ init
  renderCatChips();
  syncDesign();
  showTab(tab);
  await renderSlots();
  await redraw();
  status(persisted ? 'Saved on this device' : '');

  return async () => {
    document.body.classList.remove('typing');
    prerender.cancel(); thumbsDebounced.cancel(); saveWheel.cancel();
    if (saveTimer) await save();
    collectGarbage().catch(() => {});
  };
}
