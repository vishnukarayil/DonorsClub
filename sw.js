/* Minimal service worker: makes the site installable and lets the app shell
   open instantly. It never caches database calls or the admin console. */
const CACHE = 'donors-club-v4';
const SHELL = ['./', 'index.html', 'profile.html', 'card.html', 'policy.html', 'css/style.css', 'js/common.js', 'js/avatars.js',
               'js/register.js', 'js/profile.js', 'js/card.js', 'js/policy.js', 'js/supabase.js', 'js/config.js',
               'icons/icon-192.png', 'icons/icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // Supabase, fonts: straight to network
  if (/admin/.test(url.pathname)) return;                               // admin console is never cached

  // network first, fall back to the cached copy when offline
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
