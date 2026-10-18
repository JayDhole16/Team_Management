import { WorkSessionSchema, type WorkSession } from '@lk/shared';
import { apiPost } from './client';

/** Idempotent: returns the open session if there already is one. */
export const startSession = (): Promise<WorkSession> =>
  apiPost('/sessions/start', WorkSessionSchema);

/** Returns null when nothing was open. */
export const stopSession = (): Promise<WorkSession | null> =>
  apiPost('/sessions/stop', WorkSessionSchema.nullable());
