import { describe, expect, it } from 'vitest';
import { HoursQuerySchema } from './reports';
import { HEARTBEAT_BATCH_MAX, HeartbeatBatchBodySchema } from './sessions';

describe('heartbeat batch', () => {
  it('accepts back-dated timestamps with an offset', () => {
    const body = { heartbeats: [{ at: '2026-10-18T10:30:00+05:30', state: 'IDLE' }] };
    expect(HeartbeatBatchBodySchema.parse(body)).toEqual(body);
  });

  it('rejects an empty batch, a too-large batch, unknown states and extra fields', () => {
    const hb = { at: '2026-10-18T05:00:00Z', state: 'ACTIVE' };
    expect(HeartbeatBatchBodySchema.safeParse({ heartbeats: [] }).success).toBe(false);
    expect(
      HeartbeatBatchBodySchema.safeParse({
        heartbeats: Array.from({ length: HEARTBEAT_BATCH_MAX + 1 }, () => hb),
      }).success,
    ).toBe(false);
    expect(
      HeartbeatBatchBodySchema.safeParse({ heartbeats: [{ ...hb, state: 'SLEEPING' }] }).success,
    ).toBe(false);
    expect(
      HeartbeatBatchBodySchema.safeParse({ heartbeats: [{ ...hb, sessionId: 'x' }] }).success,
    ).toBe(false);
    expect(HeartbeatBatchBodySchema.safeParse({ heartbeats: [hb], userId: 'x' }).success).toBe(
      false,
    );
  });
});

describe('hours query', () => {
  it('accepts YYYY-MM and rejects other month formats', () => {
    expect(HoursQuerySchema.safeParse({ month: '2026-10' }).success).toBe(true);
    for (const month of ['2026-13', '2026-1', '26-10', '2026-10-01']) {
      expect(HoursQuerySchema.safeParse({ month }).success).toBe(false);
    }
  });

  it('rejects unknown fields', () => {
    expect(HoursQuerySchema.safeParse({ from: '2026-10-01' }).success).toBe(false);
  });
});
