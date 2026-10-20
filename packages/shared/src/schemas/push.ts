import { z } from 'zod';

/** Web Push for the owner's phone (PRD O-14). */

const base64url = z
  .string()
  .min(16)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+=*$/, 'must be base64url');

/** What `PushSubscription.toJSON()` gives in the browser (extra fields are dropped). */
export const PushSubscribeBodySchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  keys: z.object({ p256dh: base64url, auth: base64url }),
});
export type PushSubscribeBody = z.infer<typeof PushSubscribeBodySchema>;

export const PushUnsubscribeBodySchema = z.object({ endpoint: z.url().max(1000) }).strict();
export type PushUnsubscribeBody = z.infer<typeof PushUnsubscribeBodySchema>;

export const PushConfigSchema = z.object({
  /** False when the server has no VAPID keys: the page hides "Enable notifications". */
  enabled: z.boolean(),
  publicKey: z.string().nullable(),
});
export type PushConfig = z.infer<typeof PushConfigSchema>;

/** The JSON inside a push message, read by the service worker. */
export const PushPayloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  url: z.string(),
  tag: z.string(),
});
export type PushPayload = z.infer<typeof PushPayloadSchema>;
