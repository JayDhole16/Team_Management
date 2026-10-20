import type { FastifyInstance } from 'fastify';

const REFRESH_INTERVAL_MS = 15_000;

/**
 * Recomputes every employee's live status every 15 s, for changes that no request triggers:
 * the agent going silent ("Agent not running") and a break ending at IST midnight.
 * Events (sessions, heartbeats, idle alerts) refresh one employee at once.
 */
export function startLiveStatusJob(app: FastifyInstance): () => void {
  // Skipped while the previous one is still queued or running (a slow database).
  const tick = () => app.liveTracker.scheduleAll();
  const timer = setInterval(tick, REFRESH_INTERVAL_MS);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}
