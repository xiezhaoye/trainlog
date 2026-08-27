// Minimal service worker: no caching, no offline support. Its only job is
// to exist and stay active, because iOS treats a standalone home-screen web
// app without any registered service worker as a lesser "bookmark" for
// storage-retention purposes and will drop cookies/localStorage after the
// app has been closed for a while - forcing a fresh login on every relaunch.
// Every request is passed straight through to the network unchanged.
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  event.respondWith(fetch(event.request));
});
