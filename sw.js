// Pocket Wizard offline support.
//
// Strategy: network first, cache as fallback. Online, phones always get the
// latest files (no stale mix of old and new modules); offline, they get the
// last copy they saw. Every successful same-origin response is stored.
//
// FILES is stored at install so the app works offline after the very first
// visit. If you add a module and forget to list it here, it's still cached on
// the next online visit. Raise VERSION to clear out old caches.
const VERSION = "v3";
const APP = "pocketwizard-app-" + VERSION;
const FONTS = "pocketwizard-fonts";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/styles.css",
  "assets/fonts/Faustus.ttf", "assets/images/hourglass_2.png",
  "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/apple-touch-icon.png",
  "js/main.js", "js/util.js", "js/mapping.js", "js/tracking.js",
  "js/analysis/color.js", "js/analysis/detect.js", "js/analysis/geometry.js", "js/analysis/image.js",
  "js/audio/engine.js", "js/audio/unlock.js",
  "js/recording/compose.js", "js/recording/finalize.js", "js/recording/recorder.js", "js/recording/share.js",
  "js/sources/camera.js", "js/sources/image-file.js", "js/sources/sample.js", "js/sources/zoom.js",
  "js/ui/pinch.js", "js/ui/render.js", "js/ui/settings.js", "js/ui/theme.js",
  // js/vendor/mediabunny (700 KB) is left out on purpose: it's cached the first
  // time a recording finishes, and without it recordings still save, just unpolished.
];

self.addEventListener("install", e => {
  // One missing file shouldn't stop the rest from being stored
  e.waitUntil(caches.open(APP)
    .then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => (k.startsWith("pocketwizard-app-") && k !== APP) || k.startsWith("shapescape-"))
        .map(k => caches.delete(k))))
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
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch (err) { return new Response("", { status: 504 }); }
    }));
    return;
  }

  if (url.origin !== location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(APP);
    // Pages share one cache entry, whatever query string they were opened with
    const key = req.mode === "navigate" ? "index.html" : req;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") cache.put(key, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(key, { ignoreSearch: req.mode === "navigate" });
      return hit || Response.error();
    }
  })());
});
