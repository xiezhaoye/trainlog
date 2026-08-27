// App-shell cache for the static pages/assets, so a PWA relaunch paints
// instantly from disk instead of waiting on a network round trip. Strategy
// is stale-while-revalidate: serve the cached copy immediately if there is
// one, and in the background fetch a fresh copy to update the cache for
// next time - so the UI is never more than one load behind.
//
// /api/* is deliberately never touched here: session/auth state and
// training data must always go to the network, never served from cache.
//
// Bump CACHE_VERSION whenever shell assets change in a way that matters
// (new pages, renamed files, etc.) - activate() deletes any cache that
// doesn't match the current name, so bumping it is how a stale cache gets
// cleared out on the next launch instead of lingering forever.
var CACHE_VERSION = 'v2';
var CACHE_NAME = 'trainlog-shell-' + CACHE_VERSION;

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        return name === CACHE_NAME ? null : caches.delete(name);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') === 0) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(request).then(function (cached) {
        var network = fetch(request).then(function (response) {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        }).catch(function () { return cached; });
        return cached || network;
      });
    })
  );
});
