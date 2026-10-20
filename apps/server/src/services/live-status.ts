// Live status of one employee (PRD O-6). Pure, so every rule has a unit test.
import type { HeartbeatState, LiveStatus, SessionEndReason } from '@lk/shared';
import { istDateString } from '../lib/clock';

/**
 * A heartbeat older than this means the agent is not running. The agent sends one every
 * ~30 s (Phase 8); the auto-close job ends the session later, at SESSION_AUTOCLOSE_AFTER_SEC.
 */
export const AGENT_STALE_AFTER_SEC = 90;

export interface LiveStatusInput {
  now: Date;
  open: {
    startedAt: Date;
    /** The newest heartbeat of the open session. */
    lastHeartbeat: { at: Date; state: HeartbeatState } | null;
    /** The newest ACTIVE heartbeat of the open session. */
    lastActiveAt: Date | null;
    /** Server time the last heartbeat arrived. "Agent running" is judged by this, not by the
     *  laptop's clock (which may be slow). */
    lastReceivedAt: Date | null;
  } | null;
  /** The most recent ended session (used only when none is open). */
  lastEnded: { endedAt: Date; endReason: SessionEndReason | null } | null;
  /** The employee's newest idle alert. */
  lastIdleAt: Date | null;
}

export interface LiveStatusResult {
  status: LiveStatus;
  agentRunning: boolean;
  lastSeenAt: Date | null;
}

/**
 * - Open session: IDLE when the agent's last heartbeat says IDLE/AWAY, or an idle alert in
 *   this session is newer than the last ACTIVE heartbeat; otherwise WORKING. `agentRunning`
 *   is false when no heartbeat arrived in the last AGENT_STALE_AFTER_SEC (web-only session or
 *   a stopped agent): "Agent not running".
 * - No open session: ON_BREAK when the last session was ended with Stop today (IST), decided
 *   with the user 2026-10-20; otherwise OFFLINE (logout, auto-close, 12 h cap, deactivation,
 *   or the break started on an earlier day).
 */
export function deriveLiveStatus(input: LiveStatusInput): LiveStatusResult {
  const { now, open, lastEnded, lastIdleAt } = input;

  if (open) {
    const hb = open.lastHeartbeat;
    const received = open.lastReceivedAt;
    const agentRunning =
      received !== null && now.getTime() - received.getTime() <= AGENT_STALE_AFTER_SEC * 1000;
    const activeSince = open.lastActiveAt ?? open.startedAt;
    const idleByHeartbeat = hb !== null && hb.state !== 'ACTIVE';
    const idleByAlert =
      lastIdleAt !== null && lastIdleAt >= open.startedAt && lastIdleAt > activeSince;
    return {
      status: idleByHeartbeat || idleByAlert ? 'IDLE' : 'WORKING',
      agentRunning,
      lastSeenAt: hb?.at ?? open.startedAt,
    };
  }

  const onBreak =
    lastEnded !== null &&
    lastEnded.endReason === 'MANUAL_STOP' &&
    istDateString(lastEnded.endedAt) === istDateString(now);
  return {
    status: onBreak ? 'ON_BREAK' : 'OFFLINE',
    agentRunning: false,
    lastSeenAt: lastEnded?.endedAt ?? null,
  };
}
