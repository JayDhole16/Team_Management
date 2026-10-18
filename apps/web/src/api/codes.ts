import {
  CodeCreatedSchema,
  CodeListItemSchema,
  type CodeCreated,
  type CodeListItem,
  type InviteBody,
} from '@lk/shared';
import { z } from 'zod';
import { apiDelete, apiGet, apiPost } from './client';

export const createInvite = (body: InviteBody): Promise<CodeCreated> =>
  apiPost('/codes/invite', CodeCreatedSchema, body);

export const createPasswordResetCode = (userId: string): Promise<CodeCreated> =>
  apiPost(`/codes/password-reset/${encodeURIComponent(userId)}`, CodeCreatedSchema);

export const createFaceRescanCode = (userId: string): Promise<CodeCreated> =>
  apiPost(`/codes/face-rescan/${encodeURIComponent(userId)}`, CodeCreatedSchema);

export const listCodes = (): Promise<CodeListItem[]> =>
  apiGet('/codes', z.array(CodeListItemSchema));

export const revokeCode = (id: string) =>
  apiDelete(`/codes/${encodeURIComponent(id)}`, z.object({ ok: z.literal(true) }));
