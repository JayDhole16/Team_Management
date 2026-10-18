import { describe, expect, it } from 'vitest';
import { ApiErrorSchema, apiSuccess } from './api';
import { HealthDataSchema } from './health';

describe('HealthDataSchema', () => {
  it('accepts a healthy response', () => {
    const body = { status: 'ok', db: 'ok', time: '2026-10-18T10:00:00.000Z' };
    expect(apiSuccess(HealthDataSchema).parse({ data: body }).data).toEqual(body);
  });

  it('rejects an unknown db state', () => {
    const result = HealthDataSchema.safeParse({
      status: 'ok',
      db: 'maybe',
      time: '2026-10-18T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-ISO time', () => {
    expect(HealthDataSchema.safeParse({ status: 'ok', db: 'ok', time: 'now' }).success).toBe(false);
  });
});

describe('ApiErrorSchema', () => {
  it('requires code and message', () => {
    expect(ApiErrorSchema.safeParse({ error: { code: 'X', message: 'y' } }).success).toBe(true);
    expect(ApiErrorSchema.safeParse({ error: { code: 'X' } }).success).toBe(false);
  });
});
