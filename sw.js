// Fixed Waves Service Worker v4
// Robust offline handling: prevents crashes during song transitions offline
// Gracefully handles fetch failures so app stays alive and playback continues

var CACHE_NAME = 'waves-shell-v3';
var ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
var TAGS_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js';

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(ASSETS).then(function(){
        // Best-effort for optional third-party library
        return cache.add(TAGS_LIB).catch(function(e){ 
          console.log('Waves SW: tag-reader not cached for offline use', e); 
        });
      });
    }).catch(function(e){ 
      console.log('Waves SW: cache addAll failed', e); 
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; })
           .map(function(k){ return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event){
  // Only handle GET requests
  if(event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then(function(cached){
      // If found in cache, return it immediately
      if(cached) return cached;
      
      // Try to fetch from network
      return fetch(event.request)
        .then(function(response){
          // Only cache successful responses
          if(response && response.status === 200){
            // Clone so we can put it in cache
            var responseToCache = response.clone();
            caches.open(CACHE_NAME).then(function(cache){
              cache.put(event.request, responseToCache).catch(function(e){
                console.log('Waves SW: cache put failed', e);
              });
            });
          }
          return response;
        })
        .catch(function(error){
          // Network request failed - offline or server error
          console.log('Waves SW: fetch failed for', event.request.url, error.message);
          
          // For blob: URLs (IndexedDB audio), let them fail gracefully
          if(event.request.url.startsWith('blob:')){
            // Return empty audio blob to prevent app crash
            return new Response(new ArrayBuffer(0), {
              status: 200,
              statusText: 'OK',
              headers: new Headers({
                'Content-Type': 'audio/mpeg'
              })
            });
          }
          
          // For other requests (CSS, JS, etc), return 503 so app knows we're offline
          return new Response(
            JSON.stringify({
              offline: true,
              message: 'Network unavailable'
            }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'application/json'
              })
            }
          );
        });
    }).catch(function(error){
      // Cache match itself failed (should be rare)
      console.log('Waves SW: cache lookup error', error.message);
      
      // Return 503 with offline indication
      return new Response(
        JSON.stringify({
          offline: true,
          message: 'Service worker error'
        }),
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'application/json'
          })
        }
      );
    })
  );
});

// Handle messages from the app (for future enhancements)
self.addEventListener('message', function(event){
  if(event.data && event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});
