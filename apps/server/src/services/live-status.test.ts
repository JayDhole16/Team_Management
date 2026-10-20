import { describe, expect, it } from 'vitest';
import { AGENT_STALE_AFTER_SEC, deriveLiveStatus, type LiveStatusInput } from './live-status';

// 2026-10-20 15:30 IST
const NOW = new Date('2026-10-20T10:00:00.000Z');
const ago = (sec: number) => new Date(NOW.getTime() - sec * 1000);

function input(overrides: Partial<LiveStatusInput> = {}): LiveStatusInput {
  return { now: NOW, open: null, lastEnded: null, lastIdleAt: null, ...overrides };
}

describe('deriveLiveStatus', () => {
  it('is WORKING with the agent running after a recent ACTIVE heartbeat', () => {
    const r = deriveLiveStatus(
      input({
        open: {
          startedAt: ago(3600),
          lastHeartbeat: { at: ago(20), state: 'ACTIVE' },
          lastActiveAt: ago(20),
          lastReceivedAt: ago(20),
        },
      }),
    );
    expect(r).toEqual({ status: 'WORKING', agentRunning: true, lastSeenAt: ago(20) });
  });

  it('is IDLE when the last heartbeat says IDLE or AWAY', () => {
    for (const state of ['IDLE', 'AWAY'] as const) {
      const r = deriveLiveStatus(
        input({
          open: {
            startedAt: ago(3600),
            lastHeartbeat: { at: ago(10), state },
            lastActiveAt: ago(600),
            lastReceivedAt: ago(10),
          },
        }),
      );
      expect(r.status).toBe('IDLE');
      expect(r.agentRunning).toBe(true);
    }
  });

  it('is IDLE after an idle alert until the next ACTIVE heartbeat', () => {
    const open = {
      startedAt: ago(3600),
      lastHeartbeat: { at: ago(30), state: 'ACTIVE' as const },
      lastActiveAt: ago(30),
      lastReceivedAt: ago(30),
    };
    expect(deriveLiveStatus(input({ open, lastIdleAt: ago(10) })).status).toBe('IDLE');
    // An ACTIVE heartbeat after the alert clears it.
    expect(deriveLiveStatus(input({ open, lastIdleAt: ago(60) })).status).toBe('WORKING');
  });

  it('ignores an idle alert from before the session started', () => {
    const r = deriveLiveStatus(
      input({
        open: {
          startedAt: ago(100),
          lastHeartbeat: null,
          lastActiveAt: null,
          lastReceivedAt: null,
        },
        lastIdleAt: ago(500),
      }),
    );
    expect(r.status).toBe('WORKING');
  });

  it('a web-only session (no heartbeat) is WORKING with the agent not running', () => {
    const r = deriveLiveStatus(
      input({
        open: {
          startedAt: ago(600),
          lastHeartbeat: null,
          lastActiveAt: null,
          lastReceivedAt: null,
        },
      }),
    );
    expect(r).toEqual({ status: 'WORKING', agentRunning: false, lastSeenAt: ago(600) });
  });

  it('marks the agent not running once its heartbeat is stale', () => {
    const at = (sec: number) =>
      deriveLiveStatus(
        input({
          open: {
            startedAt: ago(3600),
            lastHeartbeat: { at: ago(sec), state: 'ACTIVE' },
            lastActiveAt: ago(sec),
            lastReceivedAt: ago(sec),
          },
        }),
      ).agentRunning;
    expect(at(AGENT_STALE_AFTER_SEC)).toBe(true);
    expect(at(AGENT_STALE_AFTER_SEC + 1)).toBe(false);
  });

  it('judges "agent running" by when the server received the heartbeat, not the laptop clock', () => {
    // The laptop clock is 5 minutes slow: its heartbeat says ago(300) but arrived 5 s ago.
    const r = deriveLiveStatus(
      input({
        open: {
          startedAt: ago(3600),
          lastHeartbeat: { at: ago(300), state: 'ACTIVE' },
          lastActiveAt: ago(300),
          lastReceivedAt: ago(5),
        },
      }),
    );
    expect(r.agentRunning).toBe(true);
  });

  it('is ON_BREAK after Stop today (IST)', () => {
    const r = deriveLiveStatus(
      input({ lastEnded: { endedAt: ago(7200), endReason: 'MANUAL_STOP' } }),
    );
    expect(r).toEqual({ status: 'ON_BREAK', agentRunning: false, lastSeenAt: ago(7200) });
  });

  it('a break that started before IST midnight is OFFLINE the next day', () => {
    // 23:50 IST on the 19th, checked at 00:10 IST on the 20th.
    const endedAt = new Date('2026-10-19T18:20:00.000Z');
    const now = new Date('2026-10-19T18:40:00.000Z');
    const r = deriveLiveStatus(input({ now, lastEnded: { endedAt, endReason: 'MANUAL_STOP' } }));
    expect(r.status).toBe('OFFLINE');
    // ...but ON_BREAK just before midnight.
    const before = deriveLiveStatus(
      input({
        now: new Date('2026-10-19T18:29:00.000Z'),
        lastEnded: { endedAt, endReason: 'MANUAL_STOP' },
      }),
    );
    expect(before.status).toBe('ON_BREAK');
  });

  it('is OFFLINE after logout, auto-close, the 12 h cap or deactivation', () => {
    for (const endReason of ['LOGOUT', 'AUTO_CLOSED', 'MAX_DURATION', 'DEACTIVATED'] as const) {
      const r = deriveLiveStatus(input({ lastEnded: { endedAt: ago(60), endReason } }));
      expect(r.status).toBe('OFFLINE');
    }
  });

  it('is OFFLINE with no session at all', () => {
    expect(deriveLiveStatus(input())).toEqual({
      status: 'OFFLINE',
      agentRunning: false,
      lastSeenAt: null,
    });
  });
});
