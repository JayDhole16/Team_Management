import type { FastifyBaseLogger } from 'fastify';
import { expireStaleCodes } from '../services/access-code.service';
import type { ServiceContext } from '../services/context';

const INTERVAL_MS = 60_000;

/**
 * Keeps the stored status of access codes tidy (ACTIVE/CLAIMED -> EXPIRED).
 * Correctness never depends on it: every code check also compares against "now".
 * Returns a function that stops the job.
 */
export function startExpireCodesJob(ctx: ServiceContext, log: FastifyBaseLogger): () => void {
  const run = async () => {
    try {
      const count = await expireStaleCodes(ctx);
      if (count > 0) log.info({ count }, 'access codes expired');
    } catch (err) {
      log.warn({ err }, 'expire-codes job failed; will retry');
    }
  };
  const timer = setInterval(() => void run(), INTERVAL_MS);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
