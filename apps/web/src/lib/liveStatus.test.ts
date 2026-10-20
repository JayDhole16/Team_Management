import type { LiveEmployee } from '@lk/shared';
import { describe, expect, it } from 'vitest';
import {
  agentMissing,
  countByStatus,
  grownSinceLoad,
  lastSeenText,
  sortLive,
  teamTodaySec,
} from './liveStatus';

const NOW = Date.parse('2026-10-20T10:00:00.000Z');

function emp(overrides: Partial<LiveEmployee>): LiveEmployee {
  return {
    userId: '11111111-1111-4111-8111-111111111111',
    name: 'A',
    jobRole: null,
    status: 'OFFLINE',
    agentRunning: false,
    session: null,
    lastSeenAt: null,
    lastIdle: null,
    todaySec: 0,
    monthSec: 0,
    ...overrides,
  };
}

describe('live status helpers', () => {
  it('counts employees per status', () => {
    const counts = countByStatus([
      emp({ status: 'WORKING' }),
      emp({ status: 'WORKING' }),
      emp({ status: 'IDLE' }),
    ]);
    expect(counts).toEqual({ WORKING: 2, IDLE: 1, ON_BREAK: 0, OFFLINE: 0 });
  });

  it('sorts idle first, then working, on break, offline, by name', () => {
    const sorted = sortLive([
      emp({ name: 'Zara', status: 'OFFLINE' }),
      emp({ name: 'Bina', status: 'WORKING' }),
      emp({ name: 'Amit', status: 'WORKING' }),
      emp({ name: 'Ravi', status: 'IDLE' }),
      emp({ name: 'Mona', status: 'ON_BREAK' }),
    ]);
    expect(sorted.map((e) => e.name)).toEqual(['Ravi', 'Amit', 'Bina', 'Mona', 'Zara']);
  });

  it('flags "agent not running" only while a session is open', () => {
    const session = { startedAt: '2026-10-20T09:00:00.000Z' };
    expect(agentMissing({ session, agentRunning: false })).toBe(true);
    expect(agentMissing({ session, agentRunning: true })).toBe(false);
    expect(agentMissing({ session: null, agentRunning: false })).toBe(false);
  });

  it('says how long ago someone was seen', () => {
    const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
    expect(lastSeenText(null, NOW)).toBe('Never');
    expect(lastSeenText(ago(0.5), NOW)).toBe('just now');
    expect(lastSeenText(ago(5), NOW)).toBe('5 min ago');
    expect(lastSeenText(ago(185), NOW)).toBe('3 h ago');
    expect(lastSeenText(ago(60 * 30), NOW)).toBe('19 Oct 2026, 09:30');
  });

  it('adds the running time of open sessions to team hours', () => {
    const total = teamTodaySec(
      [
        emp({ todaySec: 3600, session: { startedAt: '2026-10-20T09:00:00.000Z' } }),
        emp({ todaySec: 1800 }),
      ],
      60,
    );
    expect(total).toBe(3600 + 60 + 1800);
  });

  it('grows open sessions since the board loaded, but not past India midnight', () => {
    const loaded = '2026-10-20T18:00:00.000Z'; // 23:30 IST
    expect(grownSinceLoad(loaded, Date.parse(loaded) + 60_000)).toBe(60);
    expect(grownSinceLoad(loaded, Date.parse(loaded) + 3600_000)).toBe(30 * 60);
    expect(grownSinceLoad(loaded, Date.parse(loaded) - 5000)).toBe(0);
  });
});
