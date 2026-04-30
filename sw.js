// Service Worker — LavaJato
const CACHE = 'lavajato-v1';
 
// Arquivos que ficam em cache (só a casca do app)
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];
 
// Instala e faz cache dos arquivos estáticos
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});
 
// Limpa caches antigos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});
 
// Estratégia: tenta a rede primeiro
// Se falhar (offline), tenta o cache
// Requisições ao Supabase nunca usam cache
self.addEventListener('fetch', e => {
  const url = e.request.url;
 
  // Supabase e CDNs externos: sempre vai para a rede, nunca cache
  if (url.includes('supabase.co') || url.includes('cdn.jsdelivr') || url.includes('fonts.googleapis')) {
    e.respondWith(fetch(e.request));
    return;
  }
 
  // Arquivos locais: rede primeiro, cache como fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Atualiza o cache com a versão mais recente
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});