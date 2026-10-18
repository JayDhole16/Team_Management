import type { FastifyBaseLogger } from 'fastify';
import type { ServiceContext } from '../services/context';
import { autoCloseSessions, pruneHeartbeats } from '../services/session.service';

const AUTOCLOSE_INTERVAL_MS = 30_000;
const PRUNE_INTERVAL_MS = 60 * 60_000;

/**
 * Closes silent sessions (every 30 s) and deletes heartbeats older than 90 days (hourly).
 * Returns a function that stops the job.
 */
export function startSessionJobs(ctx: ServiceContext, log: FastifyBaseLogger): () => void {
  const autoClose = async () => {
    try {
      const { autoClosed, maxDuration } = await autoCloseSessions(ctx);
      if (autoClosed + maxDuration > 0) log.info({ autoClosed, maxDuration }, 'sessions closed');
    } catch (err) {
      log.warn({ err }, 'session auto-close job failed; will retry');
    }
  };
  const prune = async () => {
    try {
      const count = await pruneHeartbeats(ctx);
      if (count > 0) log.info({ count }, 'old heartbeats deleted');
    } catch (err) {
      log.warn({ err }, 'heartbeat prune job failed; will retry');
    }
  };
  const timers = [
    setInterval(() => void autoClose(), AUTOCLOSE_INTERVAL_MS),
    setInterval(() => void prune(), PRUNE_INTERVAL_MS),
  ];
  for (const timer of timers) timer.unref();
  void autoClose();
  void prune();
  return () => {
    for (const timer of timers) clearInterval(timer);
  };
}
