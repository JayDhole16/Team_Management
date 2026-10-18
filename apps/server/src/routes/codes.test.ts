import { ApiErrorSchema, CodeCreatedSchema, CodeListItemSchema } from '@lk/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { keyedHash } from '../lib/crypto';
import { expireStaleCodes } from '../services/access-code.service';
import { bearer, createHarness, type Harness } from '../test/helpers';

describe('owner access codes', () => {
  let h: Harness;
  let owner: string;
  beforeEach(async () => {
    h = await createHarness();
    owner = await h.ownerToken();
  });

  it('invite returns the code once (XXXX-XXXX, 10 min) and stores only a keyed hash', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/codes/invite',
      headers: bearer(owner),
      payload: { deviceMode: 'COMPANY_MACBOOK', note: 'Rahul - frontend' },
    });
    expect(res.statusCode).toBe(201);
    const created = CodeCreatedSchema.parse(res.json<{ data: unknown }>().data);
    expect(created.code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(new Date(created.expiresAt).getTime() - h.clock.now().getTime()).toBe(10 * 60_000);

    const row = await h.db.accessCode.findUniqueOrThrow({ where: { id: created.id } });
    const plain = created.code.replace('-', '');
    expect(JSON.stringify(row)).not.toContain(plain);
    expect(row.codeHash).toBe(keyedHash(h.env.CODE_HASH_SECRET, plain));
    expect(row).toMatchObject({
      status: 'ACTIVE',
      deviceMode: 'COMPANY_MACBOOK',
      note: 'Rahul - frontend',
    });
  });

  it('device mode is required, has no default, and unknown fields are rejected', async () => {
    for (const payload of [{}, { deviceMode: 'WINDOWS' }, { deviceMode: 'PERSONAL', extra: 1 }]) {
      const res = await h.app.inject({
        method: 'POST',
        url: '/api/v1/codes/invite',
        headers: bearer(owner),
        payload,
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('rejects an unknown preset job role', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/codes/invite',
      headers: bearer(owner),
      payload: { deviceMode: 'PERSONAL', presetJobRoleId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('UNKNOWN_JOB_ROLE');
  });

  it('the list shows statuses (computed from time) but never the code', async () => {
    const active = await h.invite(owner, { note: 'active' });
    const claimed = await h.invite(owner, { note: 'claimed' });
    await h.claim(claimed.code);
    const revoked = await h.invite(owner, { note: 'revoked' });
    await h.app.inject({
      method: 'DELETE',
      url: `/api/v1/codes/${revoked.id}`,
      headers: bearer(owner),
    });

    const list = async () => {
      // Fresh token each time: the clock jumps past the 15-minute access-token lifetime.
      const token = await h.ownerToken();
      const res = await h.app.inject({
        method: 'GET',
        url: '/api/v1/codes',
        headers: bearer(token),
      });
      for (const c of [active, claimed, revoked])
        expect(res.body).not.toContain(c.code.replace('-', ''));
      const items = CodeListItemSchema.array().parse(res.json<{ data: unknown }>().data);
      return Object.fromEntries(items.map((i) => [i.note, i.status]));
    };
    expect(await list()).toEqual({ active: 'ACTIVE', claimed: 'CLAIMED', revoked: 'REVOKED' });

    h.clock.advanceMinutes(10);
    expect(await list()).toEqual({ active: 'EXPIRED', claimed: 'CLAIMED', revoked: 'REVOKED' });
    h.clock.advanceMinutes(30);
    expect(await list()).toEqual({ active: 'EXPIRED', claimed: 'EXPIRED', revoked: 'REVOKED' });
  });

  it('revoking a used or unknown code fails clearly', async () => {
    const { userId } = await h.registerEmployee();
    const used = await h.db.accessCode.findFirstOrThrow({ where: { registeredUserId: userId } });
    const res = await h.app.inject({
      method: 'DELETE',
      url: `/api/v1/codes/${used.id}`,
      headers: bearer(owner),
    });
    expect(res.statusCode).toBe(409);
    const missing = await h.app.inject({
      method: 'DELETE',
      url: '/api/v1/codes/00000000-0000-4000-8000-000000000000',
      headers: bearer(owner),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('the expiry job marks ACTIVE codes after 10 min and CLAIMED codes after 30 min as EXPIRED', async () => {
    const a = await h.invite(owner);
    const b = await h.invite(owner);
    await h.claim(b.code);
    h.clock.advanceMinutes(10);
    expect(await expireStaleCodes(h.app.serviceContext)).toBe(1);
    h.clock.advanceMinutes(20);
    expect(await expireStaleCodes(h.app.serviceContext)).toBe(1);
    const statuses = await h.db.accessCode.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(statuses.map((s) => s.status)).toEqual(['EXPIRED', 'EXPIRED']);
  });

  it('password-reset and face-rescan codes need an existing active employee', async () => {
    for (const purpose of ['password-reset', 'face-rescan']) {
      const res = await h.app.inject({
        method: 'POST',
        url: `/api/v1/codes/${purpose}/00000000-0000-4000-8000-000000000000`,
        headers: bearer(owner),
      });
      expect(res.statusCode).toBe(404);
    }
    const ownerRow = await h.db.user.findFirstOrThrow({ where: { role: 'OWNER' } });
    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/codes/password-reset/${ownerRow.id}`,
      headers: bearer(owner),
    });
    expect(res.statusCode).toBe(404);
  });
});
