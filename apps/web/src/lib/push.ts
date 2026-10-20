import { deletePushSubscription, savePushSubscription } from '../api/push';

/**
 * Phone push notifications (PRD O-14).
 * - unsupported: this browser cannot do Web Push (or the page is not on HTTPS).
 * - ios-install: iPhone/iPad Safari: push works only after Add to Home Screen (iOS 16.4+).
 * - supported.
 */
export type PushSupport = 'unsupported' | 'ios-install' | 'supported';

export interface PushEnvironment {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
}

export function pushSupportFrom(env: PushEnvironment): PushSupport {
  // iPadOS reports itself as a Mac; touch points give it away.
  const ios =
    /iPhone|iPad|iPod/.test(env.userAgent) ||
    (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1);
  if (ios && !env.standalone) return 'ios-install';
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return 'unsupported';
  return 'supported';
}

export function currentPushEnvironment(): PushEnvironment {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints,
    standalone:
      nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true,
    hasServiceWorker: 'serviceWorker' in nav && window.isSecureContext,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
  };
}

/** The service worker (public/sw.js) shows the notifications. Owner pages only. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // No push on this device; everything else works.
  });
}

/** base64url VAPID key -> bytes for `pushManager.subscribe`. */
export function vapidKeyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  registerServiceWorker();
  return navigator.serviceWorker.ready;
}

/** Is this device already getting notifications? */
export async function isPushSubscribed(): Promise<boolean> {
  if (Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) != null;
}

/** Asks for permission, subscribes this browser and saves it on the server. */
export async function enablePush(publicKey: string): Promise<'on' | 'denied'> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKeyBytes(publicKey),
    }));
  const json = sub.toJSON();
  await savePushSubscription({
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  });
  return 'on';
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await deletePushSubscription(sub.endpoint);
  await sub.unsubscribe();
}
