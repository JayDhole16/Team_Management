import {
  describeAlert,
  SECURITY_KIND_LABELS,
  SecurityAlertKindSchema,
  type Alert,
  type PushConfig,
  type PushPayload,
  type PushSubscribeBody,
  type PushUnsubscribeBody,
} from '@lk/shared';
import { AppError, badRequest } from '../lib/errors';
import type { ServiceContext } from './context';

/** Subscriptions per owner (browsers and phones). */
export const MAX_PUSH_SUBSCRIPTIONS = 10;

/**
 * The server POSTs to the subscription endpoint, so only the browsers' real push services are
 * accepted (no requests to internal addresses): Chrome/Edge/Android (FCM), Firefox, Windows,
 * Safari/iPhone.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  return PUSH_HOSTS.some((host) => host.test(url.hostname));
}

const pushDisabled = () =>
  new AppError(503, 'PUSH_DISABLED', 'Phone notifications are not set up on the server yet.');

export function pushConfig(ctx: ServiceContext): PushConfig {
  return { enabled: ctx.push !== null, publicKey: ctx.push?.publicKey ?? null };
}

export async function subscribePush(
  ctx: ServiceContext,
  ownerId: string,
  body: PushSubscribeBody,
): Promise<PushConfig> {
  if (!ctx.push) throw pushDisabled();
  if (!isAllowedPushEndpoint(body.endpoint)) {
    throw badRequest('This browser push service is not supported.', 'PUSH_ENDPOINT_REFUSED');
  }
  const { repos } = ctx.data;
  const existing = await repos.pushSubscriptions.findByEndpoint(body.endpoint);
  if (existing?.userId !== ownerId) {
    if ((await repos.pushSubscriptions.countForUser(ownerId)) >= MAX_PUSH_SUBSCRIPTIONS) {
      throw badRequest(
        `At most ${MAX_PUSH_SUBSCRIPTIONS} devices can get notifications. Turn one off first.`,
        'PUSH_LIMIT',
      );
    }
  }
  await repos.pushSubscriptions.upsert({
    userId: ownerId,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
  });
  return pushConfig(ctx);
}

export async function unsubscribePush(
  ctx: ServiceContext,
  ownerId: string,
  body: PushUnsubscribeBody,
): Promise<{ removed: boolean }> {
  const removed = await ctx.data.repos.pushSubscriptions.deleteForUser(ownerId, body.endpoint);
  return { removed: removed > 0 };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Idle: the employee's name and the reason. Security: a generic line only (no names or
 * addresses on a lock screen); the details are on the Alerts page.
 */
export function alertPushPayload(alert: Alert): PushPayload {
  const kind = SecurityAlertKindSchema.safeParse(alert.securityKind);
  const body =
    alert.kind === 'IDLE'
      ? describeAlert(alert)
      : `${capitalize(kind.success ? SECURITY_KIND_LABELS[kind.data] : 'something needs a look')}. Open the dashboard.`;
  return {
    title: alert.kind === 'IDLE' ? 'Idle alert' : 'Security alert',
    body,
    url: '/owner/alerts',
    tag: alert.id,
  };
}

/**
 * Sends an alert to every owner device. A subscription the browser has dropped (404/410) is
 * deleted. Endpoints and keys are never logged.
 */
export async function pushAlert(
  ctx: ServiceContext,
  alert: Alert,
): Promise<{ sent: number; failed: number; removed: number }> {
  const sender = ctx.push;
  if (!sender) return { sent: 0, failed: 0, removed: 0 };
  const { repos } = ctx.data;
  const payload = JSON.stringify(alertPushPayload(alert));
  const subs = await repos.pushSubscriptions.listForOwners();
  let sent = 0;
  let failed = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (sub) => {
      const result = await sender.send(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      if (result.ok) {
        sent += 1;
        await repos.pushSubscriptions.touch(sub.id, ctx.clock());
      } else if (result.gone) {
        removed += 1;
        await repos.pushSubscriptions.deleteById(sub.id);
      } else {
        failed += 1;
      }
    }),
  );
  return { sent, failed, removed };
}
