import { LiveListSchema, type LiveList } from '@lk/shared';
import { apiGet } from './client';

/** Owner: every active employee's live status, timer start and hours (one request). */
export const fetchLive = (): Promise<LiveList> => apiGet('/live', LiveListSchema);
