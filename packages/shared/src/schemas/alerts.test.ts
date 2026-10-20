import { describe, expect, it } from 'vitest';
import { AlertListQuerySchema, describeAlert, IdleEventBodySchema } from './alerts';
import { PushSubscribeBodySchema } from './push';
import { OwnerSocketEvents, TaskAssignedEventSchema } from './realtime';

const NOW = '2026-10-20T10:00:00.000Z';
const ID = '11111111-1111-4111-8111-111111111111';

describe('idle events', () => {
  it('accept a reason with a client time (offset allowed) and an optional score', () => {
    expect(
      IdleEventBodySchema.parse({ at: '2026-10-20T15:30:00+05:30', reason: 'NO_FACE' }),
    ).toEqual({ at: '2026-10-20T15:30:00+05:30', reason: 'NO_FACE' });
    expect(
      IdleEventBodySchema.safeParse({ at: NOW, reason: 'FACE_MISMATCH', score: 0.6 }).success,
    ).toBe(true);
  });

  it('refuse unknown reasons, extra fields and silly scores', () => {
    expect(IdleEventBodySchema.safeParse({ at: NOW, reason: 'ASLEEP' }).success).toBe(false);
    expect(IdleEventBodySchema.safeParse({ at: NOW, reason: 'NO_FACE', userId: ID }).success).toBe(
      false,
    );
    expect(IdleEventBodySchema.safeParse({ at: NOW, reason: 'NO_FACE', score: -1 }).success).toBe(
      false,
    );
  });
});

describe('alert list query', () => {
  it('defaults to all alerts, 50 per page', () => {
    expect(AlertListQuerySchema.parse({})).toEqual({ status: 'all', limit: 50 });
  });
  it('refuses unknown filters', () => {
    expect(AlertListQuerySchema.safeParse({ status: 'closed' }).success).toBe(false);
    expect(AlertListQuerySchema.safeParse({ userId: ID }).success).toBe(false);
  });
});

describe('describeAlert', () => {
  it('names the employee and the reason in plain words', () => {
    expect(
      describeAlert({
        kind: 'IDLE',
        employeeName: 'Rahul',
        idleReason: 'CAMERA_UNAVAILABLE',
        message: null,
      }),
    ).toBe('Rahul: camera blocked or not available');
  });
  it('uses the server message for security alerts', () => {
    expect(
      describeAlert({
        kind: 'SECURITY',
        employeeName: null,
        idleReason: null,
        message: 'Too many wrong codes',
      }),
    ).toBe('Too many wrong codes');
  });
});

describe('push subscription body', () => {
  const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4', auth: 'tBHItJI5svbpez7KI4CCXg' };
  it('accepts an https endpoint and drops extra fields like expirationTime', () => {
    const body = PushSubscribeBodySchema.parse({
      endpoint: 'https://fcm.googleapis.com/fcm/send/x',
      keys,
      expirationTime: null,
    });
    expect(body).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys });
  });
  it('refuses http endpoints and non-base64url keys', () => {
    expect(
      PushSubscribeBodySchema.safeParse({ endpoint: 'http://fcm.googleapis.com/x', keys }).success,
    ).toBe(false);
    expect(
      PushSubscribeBodySchema.safeParse({
        endpoint: 'https://fcm.googleapis.com/x',
        keys: { ...keys, auth: 'not base64 at all!' },
      }).success,
    ).toBe(false);
  });
});

describe('socket event schemas', () => {
  it('task:assigned keeps only the task id and time (no previous assignee)', () => {
    expect(TaskAssignedEventSchema.parse({ taskId: ID, at: NOW, previousAssigneeId: ID })).toEqual({
      taskId: ID,
      at: NOW,
    });
  });
  it('an idle alert with a bad reason is rejected by the page', () => {
    expect(
      OwnerSocketEvents['idle:alert'].safeParse({
        alertId: ID,
        userId: ID,
        name: 'A',
        reason: 'X',
        at: NOW,
      }).success,
    ).toBe(false);
  });
});
