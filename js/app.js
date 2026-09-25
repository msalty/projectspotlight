// Entry point: hash router and app start-up.
import { $, toast } from './ui.js';
import { icon } from './icons.js';
import { migrateLegacy } from './migrate.js';
import { state, loadAll, saveClient } from './store.js';
import { newProject, newClient } from './presets.js';
import { registerServiceWorker } from './pwa.js';
import { homeView } from './views/home.js';
import { editorView } from './views/editor.js';
import { clientsView, clientView } from './views/client.js';
import { settingsView } from './views/settings.js';

const routes = [
  [/^\/?$/, homeView],
  [/^\/new$/, newProjectRoute],
  [/^\/p\/([\w-]+)$/, editorView],
  [/^\/clients$/, clientsView],
  [/^\/c\/(new|[\w-]+)$/, clientView],
  [/^\/settings$/, settingsView],
];

let cleanup = null;
let routing = Promise.resolve();

function route() {
  routing = routing.then(async () => {
    if (cleanup) { try { await cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    const [path, query = ''] = (location.hash.slice(1) || '/').split('?');
    const root = $('#view');
    for (const [re, view] of routes) {
      const m = path.match(re);
      if (!m) continue;
      root.className = 'view view-' + view.name.replace('View', '').replace('Route', '').toLowerCase();
      root.innerHTML = '';
      window.scrollTo(0, 0);
      try {
        cleanup = (await view(root, ...m.slice(1), query)) || null;
      } catch (e) {
        console.error(e);
        root.innerHTML = `<div class="empty">${icon('circle-alert')}<h3>Something went wrong</h3><p>${String(e.message || e)}</p><a class="btn tonal" href="#/">Back to projects</a></div>`;
      }
      return;
    }
    location.replace('#/');
  });
}

// Creates an unsaved project and opens it; it is stored on the first real edit.
async function newProjectRoute(root, query) {
  await loadAll();
  const want = new URLSearchParams(query).get('client');
  let clientId = state.clients.some((c) => c.id === want) ? want : null;
  if (!clientId) {
    const recent = [...state.projects].sort((a, b) => b.updated - a.updated)[0];
    clientId = recent?.clientId || state.clients[0]?.id || null;
  }
  if (!clientId) {
    const c = newClient({ name: 'My Business' });
    await saveClient(c);
    clientId = c.id;
  }
  state.pendingProject = newProject({ clientId });
  location.replace('#/p/' + state.pendingProject.id);
}

window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); toast('Error: ' + (e.reason?.message || e.reason)); });

(async () => {
  try {
    const n = await migrateLegacy();
    if (n) toast(`Imported ${n} project${n === 1 ? '' : 's'} from the previous version`);
  } catch (e) { console.error('Migration failed', e); }
  route();
  registerServiceWorker();
  document.documentElement.classList.add('ready');
})();
