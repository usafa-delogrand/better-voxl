// Network-only by design: never cache credentials, remote files, video, or desktop
// HTML. An installed app still needs a live connection to its remote machine.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voxl offline</title><body style="background:#101923;color:white;font:18px system-ui;padding:2rem"><h1>Voxl is offline</h1><p>Reconnect to the network and reload to reach your desktop.</p><button onclick="location.reload()">Retry connection</button>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  )));
});
