import { describe, expect, it } from 'vitest';
import {
  previewTokenMac,
  signUpdatePreview,
  UPDATE_PREVIEW_TTL_MS,
  verifyUpdatePreview,
  type UpdatePreviewClaims,
} from './preview-token';

const secret = 'a'.repeat(64);
const now = new Date('2026-10-20T10:00:00.000Z');
const claims: UpdatePreviewClaims = {
  userId: '3f1c2a9e-7b4d-4c1e-9a2b-5d6e7f8a9b0c',
  textTechnical: 'Fixed the JWT refresh bug',
  plain: 'The login problem is fixed.',
  blockers: ['Waiting for the API key'],
};

describe('update preview token', () => {
  const token = signUpdatePreview(secret, claims, now);

  it('verifies the claims it was made for', () => {
    expect(token).toMatch(/^v1\.\d+\.[0-9a-f]{64}$/);
    expect(verifyUpdatePreview(secret, token, claims, now)).toBe(true);
  });

  it('refuses a changed technical text, plain text or blocker list', () => {
    expect(verifyUpdatePreview(secret, token, { ...claims, textTechnical: 'Other' }, now)).toBe(
      false,
    );
    expect(verifyUpdatePreview(secret, token, { ...claims, plain: 'All done!' }, now)).toBe(false);
    expect(verifyUpdatePreview(secret, token, { ...claims, blockers: [] }, now)).toBe(false);
    expect(
      verifyUpdatePreview(secret, token, { ...claims, blockers: [...claims.blockers, 'x'] }, now),
    ).toBe(false);
  });

  it('refuses another user and another secret', () => {
    const other = { ...claims, userId: '11111111-2222-4333-8444-555555555555' };
    expect(verifyUpdatePreview(secret, token, other, now)).toBe(false);
    expect(verifyUpdatePreview('b'.repeat(64), token, claims, now)).toBe(false);
  });

  it('expires after the TTL', () => {
    const almost = new Date(now.getTime() + UPDATE_PREVIEW_TTL_MS - 1);
    const after = new Date(now.getTime() + UPDATE_PREVIEW_TTL_MS);
    expect(verifyUpdatePreview(secret, token, claims, almost)).toBe(true);
    expect(verifyUpdatePreview(secret, token, claims, after)).toBe(false);
  });

  it('refuses a token whose expiry was pushed forward', () => {
    const [v, exp, sig] = token.split('.');
    const pushed = `${v}.${Number(exp) + 1}.${sig}`;
    expect(verifyUpdatePreview(secret, pushed, claims, now)).toBe(false);
  });

  it('exposes the MAC for de-duplication', () => {
    expect(previewTokenMac(token)).toBe(token.split('.')[2]);
    expect(previewTokenMac('v1.1.zz')).toBeNull();
  });

  it('refuses malformed tokens without throwing', () => {
    for (const bad of ['', 'v1', 'v2.1.ab', 'v1.x.ab', 'v1.1.zz', `v1.1.${'a'.repeat(63)}`]) {
      expect(verifyUpdatePreview(secret, bad, claims, now)).toBe(false);
    }
  });
});
