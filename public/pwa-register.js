// See sw.js for why this exists: registering it is what keeps iOS from
// treating the installed PWA as a disposable bookmark and clearing its
// cookies/localStorage between launches.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}

// Explicitly ask the browser not to evict this origin's storage under
// pressure - belt-and-suspenders alongside the service worker above.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(function () {});
}
