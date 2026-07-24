// Minimal offline cache. Cache-first for the app shell and data files
// so the demand list, contacts, and RTI template are usable with
// zero signal after the first visit.

var CACHE = "cockroach-action-v4";
var ASSETS = [
  "./",
  "index.html",
  "demands.html",
  "act.html",
  "contacts.html",
  "css/style.css",
  "js/theme.js",
  "js/store.js",
  "js/sync.js",
  "js/actions.js",
  "js/demands-page.js",
  "js/act-page.js",
  "js/sw-register.js",
  "data/demands.json",
  "data/contacts.json",
  "data/rti-template.json",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var network = fetch(event.request)
        .then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
          }
          return response;
        })
        .catch(function () { return cached; });
      return cached || network;
    })
  );
});
