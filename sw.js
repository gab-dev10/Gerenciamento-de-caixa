// Service Worker — LavaJato
const CACHE = 'lavajato-v1';
 
const ASSETS = [
  '/Gerenciamento-de-caixa/',
  '/Gerenciamento-de-caixa/index.html',
  '/Gerenciamento-de-caixa/style.css',
  '/Gerenciamento-de-caixa/app.js',
  '/Gerenciamento-de-caixa/manifest.json',
  '/Gerenciamento-de-caixa/icon-192.png',
  '/Gerenciamento-de-caixa/icon-512.png'
];
 
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});
 
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});
 
self.addEventListener('fetch', e => {
  const url = e.request.url;
 
  if (url.includes('supabase.co') || url.includes('cdn.jsdelivr') || url.includes('fonts.googleapis')) {
    e.respondWith(fetch(e.request));
    return;
  }
 
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
