import {
  MarkAllReadResultSchema,
  MyUpdatePageSchema,
  MyUpdateSchema,
  UnreadCountSchema,
  UpdatePageSchema,
  UpdatePreviewSchema,
  UpdateSchema,
  type MarkAllReadBody,
  type MarkAllReadResult,
  type MyUpdate,
  type MyUpdatePage,
  type UnreadCount,
  type Update,
  type UpdateCreateBody,
  type UpdatePage,
  type UpdatePreview,
} from '@lk/shared';
import { apiGet, apiPatch, apiPost } from './client';
import { toQuery } from './query';

// --- Employee ---

/** P3 preview. The result carries a token: send it back unchanged with the update. */
export const previewUpdate = (textTechnical: string): Promise<UpdatePreview> =>
  apiPost('/updates/preview', UpdatePreviewSchema, { textTechnical });

export const sendUpdate = (body: UpdateCreateBody): Promise<MyUpdate> =>
  apiPost('/updates', MyUpdateSchema, body);

export const listMyUpdates = (cursor?: string): Promise<MyUpdatePage> =>
  apiGet(`/updates/mine${toQuery({ cursor })}`, MyUpdatePageSchema);

// --- Owner ---

export interface InboxFilter {
  employeeId?: string | undefined;
  unreadOnly?: boolean;
  limit?: number;
}

export const listUpdates = (filter: InboxFilter, cursor?: string): Promise<UpdatePage> =>
  apiGet(
    `/updates${toQuery({
      employeeId: filter.employeeId,
      unread: filter.unreadOnly ? 'true' : undefined,
      limit: filter.limit?.toString(),
      cursor,
    })}`,
    UpdatePageSchema,
  );

export const fetchUnreadCount = (): Promise<UnreadCount> =>
  apiGet('/updates/unread-count', UnreadCountSchema);

export const markUpdateRead = (id: string): Promise<Update> =>
  apiPatch(`/updates/${encodeURIComponent(id)}/read`, UpdateSchema, {});

export const markAllUpdatesRead = (body: MarkAllReadBody): Promise<MarkAllReadResult> =>
  apiPost('/updates/read-all', MarkAllReadResultSchema, body);
