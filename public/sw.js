// Ambo service worker — offline shell + asset caching
// Strategy:
//   - Static assets (JS/CSS bundles, icons, fonts): cache-first
//   - Navigation (HTML pages): network-first, fall back to cached shell
//   - API calls (Supabase, Universalis): network-first, fall back to cache
//   - Everything else: network-only

const CACHE_VERSION = "ambo-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// App shell — must load for any offline use
const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// ── Install: pre-cache the shell ─────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("ambo-") && k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: tiered strategy ────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, and cross-origin non-API requests
  if (request.method !== "GET") return;
  if (url.protocol === "chrome-extension:") return;

  // Next.js static bundles (_next/static) — cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Static files in /public (icons, manifest, fonts)
  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.match(/\.(png|jpg|ico|svg|woff2?|ttf)$/)
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Supabase API — never cache; let it fail offline so the app's
  // localStorage fallback takes over cleanly
  if (url.hostname.includes("supabase")) {
    return; // pass through, no SW involvement
  }

  // Universalis readings API — network-first, fall back to cached readings
  if (url.hostname.includes("universalis") || url.pathname.startsWith("/api/readings")) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // App pages (navigation) — network-first, fall back to cached shell
  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, DYNAMIC_CACHE).catch(() =>
        caches.match("/").then((r) => r ?? fetch(request))
      )
    );
    return;
  }

  // Everything else — network-first
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error("Offline and no cached response for: " + request.url);
  }
}
