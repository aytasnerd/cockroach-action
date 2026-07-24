// Offline cache for the app shell and data files, so the demand list,
// contacts, and RTI template stay usable with zero signal after one visit.
//
// Bump CACHE whenever the shell changes, otherwise installed copies keep
// serving the old files.

var CACHE = "cockroach-action-v7";

var ASSETS = [
  "./",
  "index.html",
  "demands.html",
  "act.html",
  "contacts.html",
  "moderate.html",
  "css/style.css",
  "js/config.js",
  "js/theme.js",
  "js/sb.js",
  "js/outbox.js",
  "js/store.js",
  "js/actions.js",
  "js/home-page.js",
  "js/demands-page.js",
  "js/act-page.js",
  "js/moderate-page.js",
  "js/sw-register.js",
  "data/demands.json",
  "data/contacts.json",
  "data/rti-template.json",
  "manifest.json",
  "icons/mark.svg",
  "icons/favicon.svg",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // addAll fails the whole install if any single file 404s, which would
      // leave the app with no offline copy at all. Tolerate individual misses.
      return Promise.all(ASSETS.map(function (url) {
        return cache.add(url).catch(function () { return null; });
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);

  // Never touch the database or auth traffic. Caching a vote response or an
  // access token would be wrong at best and a security problem at worst.
  if (url.origin !== self.location.origin) return;

  // Data files: prefer the network so a fresh snapshot wins, fall back to
  // cache when there is no signal.
  if (url.pathname.indexOf("/data/") !== -1) {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true });
      })
    );
    return;
  }

  // App shell: serve from cache instantly, refresh in the background.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
