// Minimal service worker: caches the app shell so Waves installs as a real
// app (standalone window, home screen icon) and still opens with no signal.
// It does not cache your songs — those live in IndexedDB, handled by the
// app itself in index.html.
var CACHE_NAME = 'waves-shell-v4';
var ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
var TAGS_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js';

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(ASSETS).then(function(){
        // Best-effort, separate from the core app shell above: if this third-
        // party script fails to fetch/cache, it must not break the install of
        // everything else (that's why it isn't inside the addAll() call).
        return cache.add(TAGS_LIB).catch(function(e){ console.log('Waves SW: tag-reader not cached for offline use', e); });
      });
    }).catch(function(e){ console.log('Waves SW: cache addAll failed', e); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event){
  if(event.request.method !== 'GET') return;
  var isPage = event.request.mode === 'navigate' || event.request.destination === 'document';

  if(isPage){
    // Network-first for the app itself: whenever there's a connection, always
    // fetch the latest index.html so future updates just work next time you
    // open the app — no manual cache-busting needed. Only when that fetch
    // truly fails (no connection at all) do we fall back to the last cached
    // copy, which is what makes opening the app offline possible.
    event.respondWith(
      fetch(event.request).then(function(res){
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        return res;
      }).catch(function(){
        return caches.match('./index.html');
      })
    );
    return;
  }

  // Everything else (icons, manifest, the tag-reader library) rarely or
  // never changes, so serve the cached copy instantly when we have one.
  event.respondWith(
    caches.match(event.request).then(function(cached){
      return cached || fetch(event.request);
    })
  );
});
