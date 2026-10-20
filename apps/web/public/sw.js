// Service worker of the owner dashboard (PRD O-14). It only shows push notifications for idle
// and security alerts and opens the Alerts page on tap. It caches nothing (no offline mode),
// so the app never runs stale code.

const DEFAULT_URL = '/owner/alerts';

/** Only a page of this site; anything else (another site, `/\evil.example`, junk) opens Alerts. */
function sameSitePath(value) {
  if (typeof value !== 'string') return DEFAULT_URL;
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search : DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const text = (value, fallback) =>
    typeof value === 'string' && value ? value.slice(0, 300) : fallback;
  // Only paths on this site.
  const url = sameSitePath(data.url);
  event.waitUntil(
    self.registration.showNotification(text(data.title, 'Leaders Key alert'), {
      body: text(data.body, 'Open the dashboard to see it.'),
      tag: text(data.tag, undefined),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(sameSitePath(event.notification.data?.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      // navigate() fails for a window this worker does not control (e.g. after a hard reload).
      if (open) {
        return open
          .focus()
          .then(() => open.navigate(url))
          .catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    }),
  );
});
