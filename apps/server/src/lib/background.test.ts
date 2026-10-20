import { describe, expect, it } from 'vitest';
import { createBackgroundQueue } from './background';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('background queue', () => {
  it('runs one task at a time per lane, in order; lanes do not wait for each other', async () => {
    const order: string[] = [];
    const q = createBackgroundQueue(() => undefined);
    q.run('slow', async () => {
      await tick(30);
      order.push('a1');
    });
    q.run('next', async () => {
      order.push('a2');
    });
    q.run(
      'other lane',
      async () => {
        order.push('b1');
      },
      'b',
    );
    await q.drain();
    expect(order).toEqual(['b1', 'a1', 'a2']);
  });

  it('reports a failure and keeps going, even if reporting throws', async () => {
    const failed: string[] = [];
    const q = createBackgroundQueue((name) => {
      failed.push(name);
      throw new Error('reporter broke');
    });
    q.run('bad', () => Promise.reject(new Error('x')));
    let ran = false;
    q.run('good', async () => {
      ran = true;
    });
    await q.drain();
    expect(failed).toEqual(['bad']);
    expect(ran).toBe(true);
  });

  it('drain waits for tasks started by other tasks', async () => {
    const q = createBackgroundQueue(() => undefined);
    let done = false;
    q.run('outer', async () => {
      q.spawn('inner', async () => {
        await tick(20);
        done = true;
      });
    });
    await q.drain();
    expect(done).toBe(true);
  });
});
