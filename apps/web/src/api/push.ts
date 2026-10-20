import { PushConfigSchema, type PushConfig, type PushSubscribeBody } from '@lk/shared';
import { z } from 'zod';
import { apiGet, apiPost, apiRequest } from './client';

export const fetchPushConfig = (): Promise<PushConfig> => apiGet('/push/config', PushConfigSchema);

export const savePushSubscription = (body: PushSubscribeBody): Promise<PushConfig> =>
  apiPost('/push/subscribe', PushConfigSchema, body);

export const deletePushSubscription = (endpoint: string) =>
  apiRequest('DELETE', '/push/subscribe', z.object({ removed: z.boolean() }), {
    body: { endpoint },
  });
