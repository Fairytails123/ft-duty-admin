// Minimal app-shell service worker. Same-origin shell only; the n8n API (cross-origin) is never cached.
const CACHE = 'ft-duty-admin-v3';
const SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // let API + other cross-origin requests go to network untouched
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
