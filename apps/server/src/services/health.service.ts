import type { HealthData } from '@lk/shared';
import type { HealthRepository } from '../repositories/health.repository';

export const DB_PING_TIMEOUT_MS = 3000;

export async function getHealth(
  repo: HealthRepository,
  now: () => Date = () => new Date(),
  timeoutMs = DB_PING_TIMEOUT_MS,
): Promise<HealthData> {
  const db = (await pingWithTimeout(repo, timeoutMs)) ? 'ok' : 'down';
  return { status: db === 'ok' ? 'ok' : 'degraded', db, time: now().toISOString() };
}

async function pingWithTimeout(repo: HealthRepository, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('DB ping timed out')), timeoutMs);
  });
  try {
    await Promise.race([repo.pingDb(), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
