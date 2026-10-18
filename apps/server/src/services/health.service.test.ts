import { describe, expect, it } from 'vitest';
import type { HealthRepository } from '../repositories/health.repository';
import { getHealth } from './health.service';

const fixedNow = () => new Date('2026-10-18T10:00:00.000Z');

describe('getHealth', () => {
  it('reports ok when the DB answers', async () => {
    const repo: HealthRepository = { pingDb: async () => undefined };
    await expect(getHealth(repo, fixedNow)).resolves.toEqual({
      status: 'ok',
      db: 'ok',
      time: '2026-10-18T10:00:00.000Z',
    });
  });

  it('reports down when the DB throws', async () => {
    const repo: HealthRepository = {
      pingDb: async () => {
        throw new Error('connection refused');
      },
    };
    await expect(getHealth(repo, fixedNow)).resolves.toMatchObject({
      status: 'degraded',
      db: 'down',
    });
  });

  it('reports down when the DB hangs past the timeout', async () => {
    const repo: HealthRepository = { pingDb: () => new Promise(() => undefined) };
    await expect(getHealth(repo, fixedNow, 20)).resolves.toMatchObject({ db: 'down' });
  });
});
