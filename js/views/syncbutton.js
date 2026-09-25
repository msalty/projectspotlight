// Cloud status button shown in the app bar when Google Sync is connected.
import { $, toast } from '../ui.js';
import { icon } from '../icons.js';
import { getConfig, isConnected, syncNow, syncEvents, syncStatus } from '../sync.js';

const ICON = { syncing: 'refresh-cw', error: 'cloud-alert', offline: 'cloud-off' };
const LABEL = { syncing: 'Syncing with Google…', error: 'Sync problem', offline: 'Offline', ok: 'Synced with Google', off: 'Google Sync' };

export async function mountSyncButton() {
  if (!isConnected(await getConfig())) return;
  const box = $('#appbar .appbar-actions');
  if (!box) return;
  const btn = document.createElement('button');
  btn.className = 'icon-btn sync-btn';
  const paint = () => {
    if (!btn.isConnected && btn.dataset.state) { syncEvents.removeEventListener('status', paint); return; }
    const s = syncStatus();
    btn.dataset.state = s.state;
    btn.innerHTML = icon(ICON[s.state] || 'cloud');
    btn.setAttribute('aria-label', s.message || LABEL[s.state] || 'Sync');
    btn.title = btn.getAttribute('aria-label');
  };
  syncEvents.addEventListener('status', paint);
  btn.onclick = async () => {
    const s = syncStatus();
    if (s.state === 'error') toast(s.message, { label: 'Settings', onClick: () => { location.hash = '#/settings'; } });
    try {
      const r = await syncNow();
      if (r && r.changed) toast(`Synced — ${r.changed} update${r.changed === 1 ? '' : 's'} from your other devices`);
      else if (syncStatus().state === 'ok') toast('Everything is synced');
    } catch (e) {
      toast(e.message, { label: 'Settings', onClick: () => { location.hash = '#/settings'; } });
    }
  };
  box.prepend(btn);
  paint();
}
