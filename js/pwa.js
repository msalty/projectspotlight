// Service worker registration and the install prompt (Android/desktop Chrome).
export const VERSION = '5.1.0';

let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
window.addEventListener('appinstalled', () => { deferred = null; });
export const installPrompt = () => deferred;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker failed', e));
}
