import {
  AiHealthSchema,
  BreakdownResultSchema,
  TranslateTaskResultSchema,
  type AiHealth,
  type BreakdownResult,
  type TranslateTaskResult,
} from '@lk/shared';
import { apiGet, apiPost } from './client';
import { ApiError } from './errors';

export const fetchAiHealth = (): Promise<AiHealth> => apiGet('/ai/health', AiHealthSchema);

/** P1. Nothing is saved: the owner reviews and edits the result first. */
export const breakdownBrief = (brief: string): Promise<BreakdownResult> =>
  apiPost('/ai/breakdown', BreakdownResultSchema, { brief });

/** P2. */
export const translateTask = (
  text: string,
  jobRoleId: string | null,
): Promise<TranslateTaskResult> =>
  apiPost('/ai/translate-task', TranslateTaskResultSchema, { text, jobRoleId });

/**
 * True when the AI could not help (offline, too slow, model missing, unusable answer, busy):
 * the page then offers to write it by hand. Validation errors are not AI failures.
 */
export function isAiFailure(err: unknown): boolean {
  return (
    err instanceof ApiError && (err.status === 502 || err.status === 503 || err.status === 429)
  );
}
