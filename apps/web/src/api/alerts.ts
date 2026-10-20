import {
  AckAllResultSchema,
  AlertPageSchema,
  AlertSchema,
  OpenAlertCountSchema,
  type AckAllResult,
  type Alert,
  type AlertKind,
  type AlertPage,
  type OpenAlertCount,
} from '@lk/shared';
import { apiGet, apiPatch, apiPost } from './client';
import { toQuery } from './query';

export interface AlertFilter {
  openOnly?: boolean;
  employeeId?: string | undefined;
  kind?: AlertKind | undefined;
  limit?: number;
}

export const listAlerts = (filter: AlertFilter, cursor?: string): Promise<AlertPage> =>
  apiGet(
    `/alerts${toQuery({
      status: filter.openOnly ? 'open' : 'all',
      employeeId: filter.employeeId,
      kind: filter.kind,
      limit: filter.limit?.toString(),
      cursor,
    })}`,
    AlertPageSchema,
  );

export const fetchOpenAlertCount = (): Promise<OpenAlertCount> =>
  apiGet('/alerts/open-count', OpenAlertCountSchema);

export const ackAlert = (id: string): Promise<Alert> =>
  apiPatch(`/alerts/${encodeURIComponent(id)}/ack`, AlertSchema, {});

export const ackAllAlerts = (upTo: string): Promise<AckAllResult> =>
  apiPost('/alerts/ack-all', AckAllResultSchema, { upTo });
