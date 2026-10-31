// Offline support: cache the app shell, serve from cache, refresh in the background.
const CACHE = 'groove-metronome-v12';
const ASSETS = [
  './', 'index.html', 'css/style.css', 'js/app.js', 'js/audio.js', 'js/grooves.js', 'js/theory.js', 'js/tuner.js', 'js/practice.js', 'js/importers.js', 'js/library.js', 'js/pdfview.js', 'js/omr.js',
  'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs',
  'samples/manifest.json', 'samples/drums/hhc-soft.flac', 'samples/drums/hhc-1.flac', 'samples/drums/hhc-2.flac',
  'samples/drums/hhc-hard.flac', 'samples/drums/hho.flac', 'samples/drums/snare-ghost.flac', 'samples/drums/snare-1.flac',
  'samples/drums/snare-2.flac', 'samples/drums/snare-hard.flac', 'samples/drums/rim-1.flac', 'samples/drums/rim-2.flac',
  'samples/drums/clap-1.flac', 'samples/drums/clap-2.flac', 'samples/drums/tamb-soft.flac', 'samples/drums/tamb-hard.flac',
  'samples/drums/tamb-shake.flac', 'samples/drums/shaker-down.flac', 'samples/drums/shaker-up.flac', 'samples/drums/clave.flac',
  'samples/drums/cowbell.flac', 'samples/drums/conga.flac', 'samples/drums/tomH.flac', 'samples/drums/tomL.flac',
  'samples/drums/crash.flac', 'samples/drums/ride.flac', 'samples/ep/36.flac', 'samples/ep/40.flac',
  'samples/ep/44.flac', 'samples/ep/48.flac', 'samples/ep/52.flac', 'samples/ep/56.flac',
  'samples/ep/60.flac', 'samples/ep/64.flac', 'samples/ep/68.flac', 'samples/ep/72.flac',
  'samples/ep/76.flac', 'samples/ep/80.flac', 'samples/piano/48.flac', 'samples/piano/50.flac',
  'samples/piano/52.flac', 'samples/piano/54.flac', 'samples/piano/56.flac', 'samples/piano/58.flac',
  'samples/piano/60.flac', 'samples/piano/62.flac', 'samples/piano/64.flac', 'samples/piano/66.flac',
  'samples/piano/68.flac', 'samples/piano/70.flac', 'samples/piano/72.flac', 'samples/piano/74.flac',
  'samples/piano/76.flac', 'samples/piano/78.flac', 'samples/piano/80.flac', 'samples/piano/82.flac',
  'samples/piano/84.flac',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
