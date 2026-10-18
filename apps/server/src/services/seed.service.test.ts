import { beforeEach, describe, expect, it } from 'vitest';
import { createDataAccess } from '../repositories';
import { resetDb, testPrisma } from '../test/helpers';
import { runSeed } from './seed.service';

const input = {
  ownerEmail: 'Boss@Example.com',
  ownerName: 'Boss',
  ownerPassword: 'Tiger-Window-Rain-91',
};
const now = new Date('2026-10-18T05:00:00Z');

describe('runSeed', () => {
  beforeEach(resetDb);

  it('can run twice safely: 6 job roles and exactly 1 owner', async () => {
    const data = createDataAccess(testPrisma());
    expect(await runSeed(data, input, now)).toEqual({ jobRoles: 6, owner: 'created' });
    expect(await runSeed(data, input, now)).toEqual({ jobRoles: 6, owner: 'exists' });
    const db = testPrisma();
    expect(await db.jobRole.count()).toBe(6);
    expect(await db.user.findMany({ where: { role: 'OWNER' } })).toEqual([
      expect.objectContaining({ email: 'boss@example.com', deviceMode: null }),
    ]);
  });

  it('never overwrites an existing owner password', async () => {
    const data = createDataAccess(testPrisma());
    await runSeed(data, input, now);
    const before = await testPrisma().user.findFirstOrThrow({ where: { role: 'OWNER' } });
    await runSeed(data, { ...input, ownerPassword: 'Other-Strong-Pass-55' }, now);
    const after = await testPrisma().user.findFirstOrThrow({ where: { role: 'OWNER' } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('does not create a second owner when OWNER_EMAIL changes', async () => {
    const data = createDataAccess(testPrisma());
    await runSeed(data, input, now);
    const result = await runSeed(data, { ...input, ownerEmail: 'new@example.com' }, now);
    expect(result.owner).toBe('skipped-other-owner-exists');
    expect(await testPrisma().user.count({ where: { role: 'OWNER' } })).toBe(1);
  });

  it.each(['change-me-now', 'password123', 'Boss-is-the-best-1'])(
    'refuses a weak or placeholder owner password (%s) without echoing it',
    async (ownerPassword) => {
      const data = createDataAccess(testPrisma());
      const attempt = runSeed(data, { ...input, ownerPassword }, now);
      await expect(attempt).rejects.toThrow(/OWNER_PASSWORD/);
      await expect(attempt).rejects.not.toThrow(ownerPassword);
      expect(await testPrisma().user.count()).toBe(0);
    },
  );
});
