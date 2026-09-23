/* Ambience service worker.
   The whole app is a single HTML file, so a cache-first shell gives full
   offline use of the UI, presets and saved mixes. Audio still needs the
   network — YouTube is not cacheable and must not be intercepted. */
var CACHE = "ambience-v2";
var SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg", "/fraunces-subset.woff2"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  /* Only ever handle our own origin. YouTube, the iframe API and Google Fonts
     must reach the network untouched — intercepting them breaks playback. */
  if (url.origin !== self.location.origin) return;

  /* Network-first for navigations so a deploy is picked up immediately,
     falling back to the cached shell when offline. */
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("/index.html", copy); });
        return res;
      }).catch(function () {
        return caches.match("/index.html");
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
