/* Spindle service worker — lets the app open with no connection.
   Your music never goes through here; it lives in IndexedDB on the device. */
const V = 'spindle-gh-3';
const SHELL = ['./', './index.html', './manifest.webmanifest',
               './icon-192.png', './icon-512.png',
               './sc-shuffle.png', './sc-resume.png', './sc-lists.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(V)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if(r.method !== 'GET') return;

  let url;
  try{ url = new URL(r.url); }catch(err){ return; }

  // Page loads: try the network, but always have the cached shell to fall back on.
  if(r.mode === 'navigate'){
    e.respondWith(
      fetch(r)
        .then(res => {
          if(res && res.ok){
            const copy = res.clone();
            caches.open(V).then(c => c.put(r, copy)).catch(()=>{});
          }
          return res;
        })
        .catch(async () => {
          const c = await caches.open(V);
          return (await c.match(r, {ignoreSearch:true}))
              || (await c.match('./index.html'))
              || (await c.match('./'))
              || new Response(
                   '<!doctype html><meta charset=utf-8><title>Spindle</title>'
                 + '<body style="font:16px system-ui;padding:40px;background:#E7E3D7;color:#2B2822">'
                 + '<p>Spindle has not finished saving itself for offline use. '
                 + 'Open it once with a connection, then try again.</p>',
                   {headers:{'Content-Type':'text/html; charset=utf-8'}});
        })
    );
    return;
  }

  // Our own files: network first, so a new build lands; fall back to cache offline.
  if(url.origin === self.location.origin){
    e.respondWith(
      fetch(r)
        .then(res => {
          if(res && res.ok){
            const copy = res.clone();
            caches.open(V).then(c => c.put(r, copy)).catch(()=>{});
          }
          return res;
        })
        .catch(() => caches.match(r, {ignoreSearch:true}).then(m => m || caches.match('./index.html')))
    );
    return;
  }

  // Lyrics lookups always go to the network; never cache them.
  if(/(^|\.)lrclib\.net$/.test(url.hostname)) return;

  // Fonts: cache first, they never change.
  if(/(^|\.)(googleapis|gstatic)\.com$/.test(url.hostname)){
    e.respondWith(
      caches.match(r).then(m => m || fetch(r).then(res => {
        if(res && (res.ok || res.type === 'opaque')){
          const copy = res.clone();
          caches.open(V).then(c => c.put(r, copy)).catch(()=>{});
        }
        return res;
      }).catch(() => m))
    );
  }
});
