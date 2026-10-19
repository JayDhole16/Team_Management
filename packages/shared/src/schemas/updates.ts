import { z } from 'zod';
import { TranslateUpdateLlmOutputSchema, TranslateUpdateResultSchema } from './ai';
import { IdSchema, safeText } from './common';
import { TaskStatusSchema } from './tasks';

/** Progress updates (PRD E-4, O-10). */

export const UPDATE_TEXT_MIN = 3;
export const UPDATE_TEXT_MAX = 3000;
export const UPDATES_PAGE_DEFAULT = 50;
export const UPDATES_PAGE_MAX = 100;

/** Shown to the owner when an update was sent without a plain version (decided 2026-10-20). */
export const NO_PLAIN_VERSION_MESSAGE = 'Plain version not available (the AI was offline).';

const UpdateTextSchema = safeText(UPDATE_TEXT_MIN, UPDATE_TEXT_MAX);

// --- Request bodies ---

export const UpdatePreviewBodySchema = z.object({ textTechnical: UpdateTextSchema }).strict();
export type UpdatePreviewBody = z.infer<typeof UpdatePreviewBodySchema>;

/** The preview exactly as the server returned it. The server checks the token, so the
 *  plain text cannot be changed in the browser (decided 2026-10-20). */
export const SignedUpdatePreviewSchema = TranslateUpdateLlmOutputSchema.extend({
  previewToken: z.string().min(1).max(200),
}).strict();
export type SignedUpdatePreview = z.infer<typeof SignedUpdatePreviewSchema>;

export const UpdateCreateBodySchema = z
  .object({
    textTechnical: UpdateTextSchema,
    /** One of the employee's own tasks. */
    taskId: IdSchema.nullable().optional(),
    /** Missing when the AI was offline: the update is sent without a plain version. */
    preview: SignedUpdatePreviewSchema.optional(),
  })
  .strict();
export type UpdateCreateBody = z.infer<typeof UpdateCreateBodySchema>;

const PageQueryShape = {
  /** Id of the last update of the previous page. */
  cursor: IdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(UPDATES_PAGE_MAX).default(UPDATES_PAGE_DEFAULT),
};

export const MyUpdatesQuerySchema = z.object(PageQueryShape).strict();
export type MyUpdatesQuery = z.infer<typeof MyUpdatesQuerySchema>;

export const UpdateListQuerySchema = z
  .object({
    ...PageQueryShape,
    employeeId: IdSchema.optional(),
    unread: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();
export type UpdateListQuery = z.infer<typeof UpdateListQuerySchema>;

export const MarkAllReadBodySchema = z
  .object({
    /** Only updates created up to this time, so one that arrived after the page loaded stays unread. */
    upTo: z.iso.datetime(),
    employeeId: IdSchema.optional(),
  })
  .strict();
export type MarkAllReadBody = z.infer<typeof MarkAllReadBodySchema>;

// --- Responses ---

export const UpdatePreviewSchema = TranslateUpdateResultSchema.extend({
  previewToken: z.string(),
});
export type UpdatePreview = z.infer<typeof UpdatePreviewSchema>;

/** What the employee sees of their own update. */
export const MyUpdateSchema = z.object({
  id: IdSchema,
  /** Null when no task was linked, or the task now belongs to someone else. */
  task: z.object({ id: IdSchema, title: z.string() }).nullable(),
  textTechnical: z.string(),
  /** Null when it was sent while the AI was offline. */
  textPlain: z.string().nullable(),
  blockers: z.array(z.string()),
  createdAt: z.iso.datetime(),
  readByOwnerAt: z.iso.datetime().nullable(),
});
export type MyUpdate = z.infer<typeof MyUpdateSchema>;

/** What the owner sees. */
export const UpdateSchema = MyUpdateSchema.extend({
  employeeId: IdSchema,
  employeeName: z.string(),
  task: z.object({ id: IdSchema, title: z.string(), status: TaskStatusSchema }).nullable(),
});
export type Update = z.infer<typeof UpdateSchema>;

export const MyUpdatePageSchema = z.object({
  items: z.array(MyUpdateSchema),
  nextCursor: IdSchema.nullable(),
});
export type MyUpdatePage = z.infer<typeof MyUpdatePageSchema>;

export const UpdatePageSchema = z.object({
  items: z.array(UpdateSchema),
  nextCursor: IdSchema.nullable(),
});
export type UpdatePage = z.infer<typeof UpdatePageSchema>;

export const UnreadCountSchema = z.object({ count: z.number().int().min(0) });
export type UnreadCount = z.infer<typeof UnreadCountSchema>;

export const MarkAllReadResultSchema = z.object({ marked: z.number().int().min(0) });
export type MarkAllReadResult = z.infer<typeof MarkAllReadResultSchema>;
