import { describe, expect, it } from 'vitest';
import { employeeEffects, ownerEffects, reconnectKeys } from './effects';

const ID = '11111111-1111-4111-8111-111111111111';
const AT = '2026-10-20T10:00:00.000Z';

describe('owner realtime effects', () => {
  it('an idle alert beeps and shows a sticky toast with the name and reason', () => {
    const fx = ownerEffects({
      event: 'idle:alert',
      payload: { alertId: ID, userId: ID, name: 'Rahul Sharma', reason: 'NO_FACE', at: AT },
    });
    expect(fx.beep).toBe(true);
    expect(fx.toast).toMatchObject({
      title: 'Idle alert',
      body: 'Rahul Sharma: nobody at the camera',
      sticky: true,
      link: { to: '/owner/alerts' },
    });
    expect(fx.invalidate).toEqual(expect.arrayContaining(['live', 'alerts', 'alerts-open']));
  });

  it('a security alert beeps too', () => {
    const fx = ownerEffects({
      event: 'security:alert',
      payload: { alertId: ID, kind: 'CLAIM_IP_BLOCKED', message: 'Too many wrong codes', at: AT },
    });
    expect(fx.beep).toBe(true);
    expect(fx.toast?.body).toBe('Too many wrong codes');
  });

  it('a registration shows name, role and device type, without a beep', () => {
    const fx = ownerEffects({
      event: 'employee:registered',
      payload: {
        userId: ID,
        name: 'Neha',
        jobRole: 'Video Editor',
        deviceMode: 'COMPANY_MACBOOK',
        at: AT,
      },
    });
    expect(fx.beep).toBe(false);
    expect(fx.toast?.body).toBe('Neha · Video Editor · Company MacBook');
    expect(fx.toast?.link?.to).toBe(`/owner/employees/${ID}`);
  });

  it('status, updates, task changes and acks only refresh data', () => {
    expect(
      ownerEffects({
        event: 'status:changed',
        payload: { userId: ID, status: 'IDLE', agentRunning: true, at: AT },
      }),
    ).toEqual({ invalidate: ['live'], toast: null, beep: false });
    expect(
      ownerEffects({ event: 'update:new', payload: { updateId: ID, employeeId: ID, at: AT } })
        .invalidate,
    ).toEqual(['updates', 'updates-unread']);
    expect(
      ownerEffects({ event: 'task:status-changed', payload: { taskId: ID, at: AT } }).toast,
    ).toBeNull();
    expect(ownerEffects({ event: 'alert:acked', payload: { at: AT } }).invalidate).toEqual([
      'alerts',
      'alerts-open',
    ]);
  });
});

describe('quiet alerts', () => {
  it('a late or out-of-session alert refreshes the lists without a beep or toast', () => {
    expect(ownerEffects({ event: 'alert:stored', payload: { alertId: ID, at: AT } })).toEqual({
      invalidate: ['alerts', 'alerts-open', 'live'],
      toast: null,
      beep: false,
    });
  });
});

describe('employee realtime effects', () => {
  it('a new task shows a toast and refreshes My tasks', () => {
    const fx = employeeEffects({ event: 'task:assigned', payload: { taskId: ID, at: AT } });
    expect(fx.toast).toMatchObject({ title: 'New task assigned', link: { to: '/me/tasks' } });
    expect(fx.invalidate).toEqual(['my-tasks']);
    expect(fx.beep).toBe(false);
  });
});

describe('after a reconnect', () => {
  it('refreshes what events would have changed', () => {
    expect(reconnectKeys('OWNER')).toEqual(
      expect.arrayContaining(['live', 'alerts', 'alerts-open', 'updates-unread']),
    );
    expect(reconnectKeys('EMPLOYEE')).toEqual(['my-tasks']);
  });
});
