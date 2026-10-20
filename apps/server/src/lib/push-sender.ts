import webpush from 'web-push';
import type { Env } from '../config/env';

/** How long the push service keeps an undelivered alert: 24 hours. */
export const PUSH_TTL_SEC = 24 * 60 * 60;

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type PushSendResult =
  | { ok: true }
  /** `gone`: the browser unsubscribed (404/410); the subscription should be deleted. */
  | { ok: false; gone: boolean; statusCode: number | null };

/** Sends one Web Push message. Tests pass a fake. */
export interface PushSender {
  publicKey: string;
  send(target: PushTarget, payload: string): Promise<PushSendResult>;
}

/** The real sender (VAPID-signed, payload encrypted for the browser), or null when the
 *  VAPID settings are missing: push is then simply off. */
export function createWebPushSender(env: Env): PushSender | null {
  const {
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey,
    VAPID_SUBJECT: subject,
  } = env;
  if (!publicKey || !privateKey || !subject) return null;
  return {
    publicKey,
    async send(target, payload) {
      try {
        await webpush.sendNotification(target, payload, {
          vapidDetails: { subject, publicKey, privateKey },
          // A device that is off gets the alert when it comes back within 24 hours (decided
          // with the user 2026-10-20); after that the push service drops it.
          TTL: PUSH_TTL_SEC,
          urgency: 'high',
          timeout: 10_000,
        });
        return { ok: true };
      } catch (err) {
        const statusCode =
          err instanceof webpush.WebPushError && typeof err.statusCode === 'number'
            ? err.statusCode
            : null;
        return { ok: false, gone: statusCode === 404 || statusCode === 410, statusCode };
      }
    },
  };
}
