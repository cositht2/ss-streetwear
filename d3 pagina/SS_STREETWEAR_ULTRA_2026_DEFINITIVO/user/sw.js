// Service worker de S&S STREETWEAR: la tienda abre aunque se cae la conexión.
// Solo guarda archivos de la tienda pública (/user/ y /shared/). Nunca toca
// /api/, /admin/ ni datos de sesión.
const CACHE = 'ss-streetwear-v7';
const CORE = ['/user/', '/user/styles.css', '/user/claro.css', '/user/app.js', '/shared/data.js', '/shared/favicon.svg', '/shared/vida.css', '/shared/tema.js', '/shared/vida.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(CORE.map(url => c.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  const isShop = url.origin === self.location.origin &&
    (url.pathname.startsWith('/user/') || url.pathname.startsWith('/shared/'));
  if (req.method !== 'GET' || !isShop) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('/user/')))
  );
});
