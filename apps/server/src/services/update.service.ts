import {
  stripUnsafeChars,
  type MarkAllReadBody,
  type MarkAllReadResult,
  type MyUpdate,
  type MyUpdatePage,
  type MyUpdatesQuery,
  type UnreadCount,
  type Update,
  type UpdateCreateBody,
  type UpdateListQuery,
  type UpdatePage,
  type UpdatePreview,
  type UpdatePreviewBody,
} from '@lk/shared';
import type { Prisma } from '../generated/prisma/client';
import { AppError, badRequest, notFound, rateLimited } from '../lib/errors';
import { previewTokenMac, signUpdatePreview, verifyUpdatePreview } from '../lib/preview-token';
import { isUniqueViolation } from '../repositories';
import { translateUpdate, type AiLog } from './ai.service';
import type { ServiceContext } from './context';
import { toMyUpdate, toUpdate } from './mappers';

const invalidCursor = () =>
  badRequest('This page is no longer available. Reload.', 'INVALID_CURSOR');

/** LLM output is untrusted: invisible control and bidi characters are dropped before signing. */
function cleanLlmText(text: string): string {
  return stripUnsafeChars(text).trim();
}

/** E-4: the plain version the employee previews. Signed, so exactly this is what gets saved. */
export async function previewUpdate(
  ctx: ServiceContext,
  userId: string,
  body: UpdatePreviewBody,
  log: AiLog,
): Promise<UpdatePreview> {
  const result = await translateUpdate(ctx, userId, { text: body.textTechnical }, log);
  const plain = cleanLlmText(result.plain);
  const blockers = result.blockers.map(cleanLlmText).filter((b) => b.length > 0);
  if (plain.length === 0) {
    throw new AppError(
      502,
      'LLM_BAD_OUTPUT',
      'The AI gave an answer that could not be used. Try again, or send without a plain version.',
    );
  }
  const previewToken = signUpdatePreview(
    ctx.env.CODE_HASH_SECRET,
    { userId, textTechnical: body.textTechnical, plain, blockers },
    ctx.clock(),
  );
  return { ...result, plain, blockers, previewToken };
}

/**
 * E-4: send an update. With a preview, the token must match the text exactly (decided
 * 2026-10-20). Without one (the AI was offline) the owner gets the technical text only.
 */
export async function sendUpdate(
  ctx: ServiceContext,
  userId: string,
  body: UpdateCreateBody,
): Promise<MyUpdate> {
  if (ctx.limiters.updates.isBlocked(userId)) throw rateLimited();
  // Counted before any await, so parallel requests cannot all slip under the limit.
  ctx.limiters.updates.recordFailure(userId);
  const now = ctx.clock();
  const { repos } = ctx.data;

  if (
    body.preview &&
    !verifyUpdatePreview(
      ctx.env.CODE_HASH_SECRET,
      body.preview.previewToken,
      {
        userId,
        textTechnical: body.textTechnical,
        plain: body.preview.plain,
        blockers: body.preview.blockers,
      },
      now,
    )
  ) {
    throw badRequest(
      'Your text changed after the preview, or the preview is too old. Preview again.',
      'PREVIEW_MISMATCH',
    );
  }

  const taskId = body.taskId ?? null;
  if (taskId !== null) {
    const task = await repos.tasks.findById(taskId);
    // Someone else's task looks exactly like a missing one.
    if (!task || task.assigneeId !== userId) throw notFound('Task');
  }

  // The MAC binds this employee, so a repeated send of the same preview (a double click, a
  // retry) returns the update already saved instead of a second copy.
  const previewMac = body.preview ? previewTokenMac(body.preview.previewToken) : null;
  let row;
  try {
    row = await repos.updates.create({
      employeeId: userId,
      taskId,
      textTechnical: body.textTechnical,
      textPlain: body.preview?.plain ?? null,
      blockers: body.preview ? [...body.preview.blockers] : [],
      previewMac,
      createdAt: now,
    });
  } catch (err) {
    const existing =
      previewMac && isUniqueViolation(err)
        ? await repos.updates.findByPreviewMac(previewMac)
        : null;
    if (!existing || existing.employeeId !== userId) throw err;
    return toMyUpdate(existing);
  }
  ctx.bus.emit('update:sent', {
    updateId: row.id,
    employeeId: userId,
    at: now.toISOString(),
  });
  return toMyUpdate(row);
}

/** The employee's own updates only. */
export async function listMyUpdates(
  ctx: ServiceContext,
  userId: string,
  query: MyUpdatesQuery,
): Promise<MyUpdatePage> {
  const page = await ctx.data.repos.updates.page(
    { employeeId: userId },
    {},
    query.cursor,
    query.limit,
  );
  if (!page) throw invalidCursor();
  return { items: page.rows.map(toMyUpdate), nextCursor: page.nextCursor };
}

/** O-10: the owner's inbox, newest first. */
export async function listUpdates(
  ctx: ServiceContext,
  query: UpdateListQuery,
): Promise<UpdatePage> {
  const scope: Prisma.ProgressUpdateWhereInput = query.employeeId
    ? { employeeId: query.employeeId }
    : {};
  const filter: Prisma.ProgressUpdateWhereInput = query.unread ? { readByOwnerAt: null } : {};
  const page = await ctx.data.repos.updates.page(scope, filter, query.cursor, query.limit);
  if (!page) throw invalidCursor();
  return { items: page.rows.map(toUpdate), nextCursor: page.nextCursor };
}

export async function unreadUpdateCount(ctx: ServiceContext): Promise<UnreadCount> {
  return { count: await ctx.data.repos.updates.countUnread() };
}

export async function markUpdateRead(ctx: ServiceContext, id: string): Promise<Update> {
  const { repos } = ctx.data;
  await repos.updates.markRead(id, ctx.clock());
  const row = await repos.updates.findById(id);
  if (!row) throw notFound('Update');
  return toUpdate(row);
}

export async function markAllUpdatesRead(
  ctx: ServiceContext,
  body: MarkAllReadBody,
): Promise<MarkAllReadResult> {
  const marked = await ctx.data.repos.updates.markAllRead(
    { upTo: new Date(body.upTo), employeeId: body.employeeId },
    ctx.clock(),
  );
  return { marked };
}
