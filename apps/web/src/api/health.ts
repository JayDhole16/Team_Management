import { HealthDataSchema, type HealthData } from '@lk/shared';
import { apiGet } from './client';

/** The server answers 503 with a `{ data }` body when the database is down. */
export function fetchHealth(fetchImpl?: typeof fetch): Promise<HealthData> {
  return apiGet('/health', HealthDataSchema, {
    dataStatuses: [503],
    ...(fetchImpl ? { fetchImpl } : {}),
  });
}
