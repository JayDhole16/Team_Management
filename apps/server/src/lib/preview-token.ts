import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

/**
 * Signs the plain-language preview of a progress update (decided 2026-10-20: the owner reads
 * exactly what the employee previewed). The token binds the employee, the technical text and
 * the AI output, so the browser cannot send back a different plain text. Stateless: nothing is
 * stored until the update is sent.
 */

export const UPDATE_PREVIEW_TTL_MS = 60 * 60_000;

export interface UpdatePreviewClaims {
  userId: string;
  textTechnical: string;
  plain: string;
  blockers: readonly string[];
}

const VERSION = 'v1';

/**
 * A separate key, derived from an existing secret with HKDF (no new env key). HKDF output can
 * never equal a `keyedHash` lookup value made with the same secret.
 */
function previewKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, '', 'lk:progress-update-preview:v1', 32));
}

function mac(secret: string, claims: UpdatePreviewClaims, expMs: number): string {
  const payload = JSON.stringify([
    VERSION,
    claims.userId,
    expMs,
    claims.textTechnical,
    claims.plain,
    claims.blockers,
  ]);
  return createHmac('sha256', previewKey(secret)).update(payload).digest('hex');
}

export function signUpdatePreview(secret: string, claims: UpdatePreviewClaims, now: Date): string {
  const expMs = now.getTime() + UPDATE_PREVIEW_TTL_MS;
  return `${VERSION}.${expMs}.${mac(secret, claims, expMs)}`;
}

/** The MAC part of a well-formed token: stored with the update so one preview is saved once. */
export function previewTokenMac(token: string): string | null {
  const mac = token.split('.')[2];
  return mac && /^[0-9a-f]{64}$/.test(mac) ? mac : null;
}

/** True only for an unexpired token made for exactly these claims. */
export function verifyUpdatePreview(
  secret: string,
  token: string,
  claims: UpdatePreviewClaims,
  now: Date,
): boolean {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  const [, expText = '', given = ''] = parts;
  if (!/^\d{1,16}$/.test(expText) || !/^[0-9a-f]{64}$/.test(given)) return false;
  const expMs = Number(expText);
  if (expMs <= now.getTime()) return false;
  const expected = Buffer.from(mac(secret, claims, expMs), 'hex');
  return timingSafeEqual(expected, Buffer.from(given, 'hex'));
}
