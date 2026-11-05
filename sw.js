// Shapescape Synth offline cache.
// When you upload a new index.html, raise VERSION so phones fetch the update.
const VERSION = "v1";
const APP = "shapescape-app-" + VERSION;
const FONTS = "shapescape-fonts";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("shapescape-app-") && k !== APP).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts: cache on first use so the app looks right offline
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); c.put(req, res.clone()); return res; }
      catch (err) { return new Response("", { status: 504 }); }
    }));
    return;
  }

  if (url.origin !== location.origin) return;

  // The page itself: try the network first so updates arrive, fall back to the cache offline
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(res => { caches.open(APP).then(c => c.put("index.html", res.clone())); return res; })
        .catch(() => caches.match("index.html"))
    );
    return;
  }

  // Everything else: cache first
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
