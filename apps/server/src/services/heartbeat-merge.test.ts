import { describe, expect, it } from 'vitest';
import { planHeartbeatMerge, type MergeSession } from './heartbeat-merge';

const NOW = new Date('2026-10-18T12:00:00.000Z');
const ago = (sec: number) => new Date(NOW.getTime() - sec * 1000);

function plan(sessions: MergeSession[], seconds: number[], state: 'ACTIVE' | 'IDLE' = 'ACTIVE') {
  return planHeartbeatMerge({
    sessions,
    heartbeats: seconds.map((s) => ({ at: ago(s), state })),
    now: NOW,
    autocloseSec: 180,
  });
}

const open = (startedSecAgo: number, lastHbSecAgo: number | null = null): MergeSession => ({
  id: 'open',
  startedAt: ago(startedSecAgo),
  endedAt: null,
  endReason: null,
  lastHeartbeatAt: lastHbSecAgo === null ? null : ago(lastHbSecAgo),
});

const closed = (
  id: string,
  startedSecAgo: number,
  endedSecAgo: number,
  endReason: MergeSession['endReason'],
): MergeSession => ({
  id,
  startedAt: ago(startedSecAgo),
  endedAt: ago(endedSecAgo),
  endReason,
  lastHeartbeatAt: endReason === 'AUTO_CLOSED' ? ago(endedSecAgo) : null,
});

describe('planHeartbeatMerge', () => {
  it('attaches live heartbeats to the open session', () => {
    const p = plan([open(3600, 30)], [0]);
    expect(p.attach).toEqual([{ sessionId: 'open', at: NOW, state: 'ACTIVE' }]);
    expect(p.ignored).toBe(0);
    expect(p.sessionUpdates.get('open')).toEqual({
      endedAt: null,
      endReason: null,
      lastHeartbeatAt: NOW,
    });
    expect(p.gaps).toEqual([]);
  });

  it('ignores heartbeats older than 12 hours', () => {
    const p = plan([open(13 * 3600)], [12 * 3600 + 1, 12 * 3600 - 1]);
    expect(p.ignored).toBe(1);
    expect(p.attach).toHaveLength(1);
  });

  it('ignores heartbeats far in the future and clamps small clock skew to now', () => {
    const p = plan([open(3600)], [-61, -30]);
    expect(p.ignored).toBe(1);
    expect(p.attach).toEqual([{ sessionId: 'open', at: NOW, state: 'ACTIVE' }]);
  });

  it('ignores heartbeats during a break (no session contains them)', () => {
    const p = plan([closed('a', 7200, 3600, 'MANUAL_STOP')], [1800, 0]);
    expect(p.ignored).toBe(2);
    expect(p.sessionUpdates.size).toBe(0);
  });

  it('attaches a late heartbeat that falls inside a closed session without reopening it', () => {
    const p = plan([closed('a', 7200, 3600, 'MANUAL_STOP')], [4000]);
    expect(p.attach.map((a) => a.sessionId)).toEqual(['a']);
    expect(p.sessionUpdates.get('a')).toMatchObject({
      endedAt: ago(3600),
      endReason: 'MANUAL_STOP',
    });
  });

  it('reopens an AUTO_CLOSED session when the queued heartbeats cover the gap', () => {
    // Agent offline from 600 s ago; the job closed the session at its last heartbeat.
    const s = closed('a', 3600, 600, 'AUTO_CLOSED');
    const queue = [570, 540, 510, 480, 300, 150, 30, 0];
    const p = plan([s], queue);
    expect(p.ignored).toBe(0);
    expect(p.attach).toHaveLength(queue.length);
    expect(p.sessionUpdates.get('a')).toEqual({
      endedAt: null,
      endReason: null,
      lastHeartbeatAt: NOW,
    });
    expect(p.gaps).toEqual([{ sessionId: 'a', fromAt: ago(600), toAt: NOW }]);
  });

  it('does not reopen when the queue has a silence longer than the auto-close threshold', () => {
    const p = plan([closed('a', 3600, 600, 'AUTO_CLOSED')], [600 - 181, 0]);
    expect(p.ignored).toBe(2);
    expect(p.sessionUpdates.size).toBe(0);
  });

  it('never reopens a session the employee stopped (or that logout/deactivation ended)', () => {
    for (const reason of ['MANUAL_STOP', 'LOGOUT', 'DEACTIVATED', 'MAX_DURATION'] as const) {
      const p = plan([closed('a', 3600, 600, reason)], [570, 540]);
      expect(p.ignored).toBe(2);
      expect(p.sessionUpdates.size).toBe(0);
    }
  });

  it('extends (not reopens) an AUTO_CLOSED session when a later session already exists', () => {
    const earlier = closed('a', 3600, 900, 'AUTO_CLOSED');
    const later: MergeSession = { ...open(300, 0), id: 'b' };
    const p = plan([later, earlier], [870, 840, 810]);
    expect(p.sessionUpdates.get('a')).toEqual({
      endedAt: ago(810),
      endReason: 'AUTO_CLOSED',
      lastHeartbeatAt: ago(810),
    });
    expect(p.gaps).toEqual([{ sessionId: 'a', fromAt: ago(900), toAt: ago(810) }]);
    expect(p.sessionUpdates.has('b')).toBe(false);
  });

  it('closes a reopened session again when its newest replayed heartbeat is already stale', () => {
    const p = plan([closed('a', 7200, 1200, 'AUTO_CLOSED')], [1170, 1140, 1110]);
    expect(p.sessionUpdates.get('a')).toEqual({
      endedAt: ago(1110),
      endReason: 'AUTO_CLOSED',
      lastHeartbeatAt: ago(1110),
    });
    expect(p.gaps).toEqual([{ sessionId: 'a', fromAt: ago(1200), toAt: ago(1110) }]);
  });

  it('processes an unsorted batch in time order', () => {
    const p = plan([closed('a', 3600, 600, 'AUTO_CLOSED')], [0, 450, 570, 300, 150]);
    expect(p.ignored).toBe(0);
    expect(p.sessionUpdates.get('a')?.endedAt).toBeNull();
  });

  it('keeps the heartbeat state', () => {
    const p = plan([open(3600, 30)], [0], 'IDLE');
    expect(p.attach[0]?.state).toBe('IDLE');
  });
});
