// Decides where each agent heartbeat belongs (ARCHITECTURE section 13, point 7). Pure.
import type { HeartbeatState, SessionEndReason } from '@lk/shared';

/** Back-dated heartbeats from the agent's offline queue are accepted up to this age. */
export const HEARTBEAT_MAX_AGE_MS = 12 * 60 * 60_000;
/** Small client clock skew is clamped to "now"; anything further ahead is ignored. */
export const HEARTBEAT_MAX_FUTURE_MS = 60_000;

export interface MergeSession {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  endReason: SessionEndReason | null;
  lastHeartbeatAt: Date | null;
}

export interface IncomingHeartbeat {
  at: Date;
  state: HeartbeatState;
}

export interface MergeInput {
  /** The user's recent sessions (at least every session that may contain a heartbeat). */
  sessions: readonly MergeSession[];
  heartbeats: readonly IncomingHeartbeat[];
  now: Date;
  autocloseSec: number;
}

export interface MergePlan {
  attach: { sessionId: string; at: Date; state: HeartbeatState }[];
  ignored: number;
  /** Final state of every session the batch changed. */
  sessionUpdates: Map<
    string,
    { endedAt: Date | null; endReason: SessionEndReason | null; lastHeartbeatAt: Date }
  >;
  /** Stretches known only from replayed heartbeats (reported as offline gaps). */
  gaps: { sessionId: string; fromAt: Date; toAt: Date }[];
}

/**
 * - A heartbeat inside a session (open, or between its start and end) is attached to it.
 * - A heartbeat after an AUTO_CLOSED session that continues its heartbeat chain (no silence
 *   longer than `autocloseSec`) extends that session: it is reopened if it is the user's
 *   latest session, otherwise its end moves forward. The covered stretch is a gap.
 * - Sessions the user or owner ended (stop, logout, deactivation, no-agent cap) never reopen.
 * - Anything else (too old, too far in the future, during a break) is ignored.
 * - A session left open with a stale last heartbeat is closed again at that heartbeat.
 */
export function planHeartbeatMerge(input: MergeInput): MergePlan {
  const { now, autocloseSec } = input;
  const autocloseMs = autocloseSec * 1000;
  const sessions = input.sessions
    .map((s) => ({ ...s }))
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const heartbeats = [...input.heartbeats].sort((a, b) => a.at.getTime() - b.at.getTime());

  const plan: MergePlan = { attach: [], ignored: 0, sessionUpdates: new Map(), gaps: [] };
  const touched = new Set<(typeof sessions)[number]>();
  const gapBySession = new Map<string, MergePlan['gaps'][number]>();

  const attach = (session: (typeof sessions)[number], at: Date, state: HeartbeatState) => {
    plan.attach.push({ sessionId: session.id, at, state });
    if (!session.lastHeartbeatAt || session.lastHeartbeatAt < at) session.lastHeartbeatAt = at;
    const gap = gapBySession.get(session.id);
    if (gap && gap.toAt < at) gap.toAt = at;
    touched.add(session);
  };

  for (const hb of heartbeats) {
    const ageMs = now.getTime() - hb.at.getTime();
    if (ageMs > HEARTBEAT_MAX_AGE_MS || ageMs < -HEARTBEAT_MAX_FUTURE_MS) {
      plan.ignored++;
      continue;
    }
    const at = ageMs < 0 ? now : hb.at;

    const containing = sessions.find(
      (s) => s.startedAt <= at && (s.endedAt === null || at <= s.endedAt),
    );
    if (containing) {
      attach(containing, at, hb.state);
      continue;
    }

    const prevIndex = sessions.findLastIndex((s) => s.startedAt <= at);
    const prev = sessions[prevIndex];
    const anchor = prev?.lastHeartbeatAt ?? prev?.endedAt;
    const continuesChain =
      prev?.endReason === 'AUTO_CLOSED' &&
      prev.endedAt !== null &&
      anchor !== null &&
      anchor !== undefined &&
      at.getTime() - anchor.getTime() <= autocloseMs;
    if (!prev || !continuesChain || !prev.endedAt) {
      plan.ignored++;
      continue;
    }

    if (!gapBySession.has(prev.id)) {
      const gap = { sessionId: prev.id, fromAt: prev.endedAt, toAt: at };
      gapBySession.set(prev.id, gap);
      plan.gaps.push(gap);
    }
    // A later session exists: extend up to this heartbeat (it starts after `at`, so no
    // overlap). Otherwise reopen.
    if (sessions[prevIndex + 1]) {
      prev.endedAt = at;
    } else {
      prev.endedAt = null;
      prev.endReason = null;
    }
    attach(prev, at, hb.state);
  }

  for (const session of touched) {
    // `attach` always sets lastHeartbeatAt.
    const last = session.lastHeartbeatAt as Date;
    if (session.endedAt === null && now.getTime() - last.getTime() > autocloseMs) {
      session.endedAt = last;
      session.endReason = 'AUTO_CLOSED';
    }
    plan.sessionUpdates.set(session.id, {
      endedAt: session.endedAt,
      endReason: session.endReason,
      lastHeartbeatAt: last,
    });
  }
  return plan;
}
