import { z } from 'zod';
import { TaskPrioritySchema } from './ai';
import { IdSchema } from './common';

export const TaskStatusSchema = z.enum(['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/** Board / tab order. */
export const TASK_STATUSES: readonly TaskStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETED',
];

/** AI_BREAKDOWN: from the AI breakdown of a brief. MANUAL: typed by the owner inside a
 *  project. DIRECT: a direct task to one employee, without a project. */
export const TaskSourceSchema = z.enum(['AI_BREAKDOWN', 'MANUAL', 'DIRECT']);
export type TaskSource = z.infer<typeof TaskSourceSchema>;

// --- Employee status changes (decided 2026-10-20: only the assignee changes the status) ---

export type TaskActionKey = 'start' | 'block' | 'resume' | 'complete' | 'reopen';

export interface TaskAction {
  key: TaskActionKey;
  label: string;
  to: TaskStatus;
}

const ACTIONS: Record<TaskActionKey, TaskAction> = {
  start: { key: 'start', label: 'Start', to: 'IN_PROGRESS' },
  block: { key: 'block', label: 'Mark blocked', to: 'BLOCKED' },
  resume: { key: 'resume', label: 'Resume', to: 'IN_PROGRESS' },
  complete: { key: 'complete', label: 'Complete', to: 'COMPLETED' },
  reopen: { key: 'reopen', label: 'Reopen', to: 'IN_PROGRESS' },
};

const ACTIONS_BY_STATUS: Record<TaskStatus, readonly TaskActionKey[]> = {
  PENDING: ['start', 'block', 'complete'],
  IN_PROGRESS: ['block', 'complete'],
  BLOCKED: ['resume', 'complete'],
  COMPLETED: ['reopen'],
};

/** The buttons the assigned employee sees for a task in `status`. */
export function employeeTaskActions(status: TaskStatus): TaskAction[] {
  return ACTIONS_BY_STATUS[status].map((key) => ACTIONS[key]);
}

/** The server accepts exactly the changes the buttons offer. */
export function canEmployeeSetStatus(from: TaskStatus, to: TaskStatus): boolean {
  return employeeTaskActions(from).some((action) => action.to === to);
}

// --- Request bodies ---

/**
 * Control characters (NUL cannot be stored in PostgreSQL text) and bidi overrides (they can make
 * text display misleadingly) are refused. Newlines and tabs are fine.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/;
export const hasUnsafeChars = (text: string): boolean => UNSAFE_CHARS.test(text);

/** Trimmed text with length limits and no unsafe characters. */
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !hasUnsafeChars(v), 'Remove the special (invisible) characters');

const TaskTitleSchema = text(2, 200);
const TaskDescriptionSchema = text(1, 4000);
const ProjectTitleSchema = text(2, 200);
const ProjectSummarySchema = text(1, 4000);
export const BLOCKED_REASON_MIN = 3;
export const BLOCKED_REASON_MAX = 500;
export const PROJECT_MAX_TASKS = 40;

export const TaskCreateBodySchema = z
  .object({
    title: TaskTitleSchema,
    descriptionTechnical: TaskDescriptionSchema,
    jobRoleId: IdSchema.nullable(),
    priority: TaskPrioritySchema,
    source: z.enum(['AI_BREAKDOWN', 'MANUAL']),
  })
  .strict();
export type TaskCreateBody = z.infer<typeof TaskCreateBodySchema>;

export const ProjectCreateBodySchema = z
  .object({
    title: ProjectTitleSchema,
    /** The owner's own words; optional for a project typed by hand. */
    briefOriginal: text(0, 3000).nullable().optional(),
    summaryTechnical: ProjectSummarySchema,
    tasks: z.array(TaskCreateBodySchema).max(PROJECT_MAX_TASKS),
  })
  .strict();
export type ProjectCreateBody = z.infer<typeof ProjectCreateBodySchema>;

export const ProjectPatchBodySchema = z
  .object({
    title: ProjectTitleSchema.optional(),
    summaryTechnical: ProjectSummarySchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');
export type ProjectPatchBody = z.infer<typeof ProjectPatchBodySchema>;

export const TaskPatchBodySchema = z
  .object({
    title: TaskTitleSchema.optional(),
    descriptionTechnical: TaskDescriptionSchema.optional(),
    jobRoleId: IdSchema.nullable().optional(),
    priority: TaskPrioritySchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');
export type TaskPatchBody = z.infer<typeof TaskPatchBodySchema>;

export const AssignBodySchema = z.object({ assigneeId: IdSchema }).strict();
export type AssignBody = z.infer<typeof AssignBodySchema>;

export const DirectTaskBodySchema = z
  .object({
    assigneeId: IdSchema,
    /** What the owner wrote in plain words. */
    textOriginal: text(3, 2000),
    title: TaskTitleSchema,
    descriptionTechnical: TaskDescriptionSchema,
    priority: TaskPrioritySchema,
  })
  .strict();
export type DirectTaskBody = z.infer<typeof DirectTaskBodySchema>;

export const TaskStatusBodySchema = z
  .object({
    status: TaskStatusSchema,
    reason: text(0, BLOCKED_REASON_MAX).optional(),
  })
  .strict()
  .refine((body) => body.status !== 'BLOCKED' || (body.reason?.length ?? 0) >= BLOCKED_REASON_MIN, {
    message: 'Say why the task is blocked',
    path: ['reason'],
  });
export type TaskStatusBody = z.infer<typeof TaskStatusBodySchema>;

export const TaskListQuerySchema = z
  .object({
    assigneeId: IdSchema.optional(),
    status: TaskStatusSchema.optional(),
    jobRoleId: IdSchema.optional(),
    projectId: IdSchema.optional(),
  })
  .strict();
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>;

// --- Responses ---

export const TaskProjectRefSchema = z.object({
  id: IdSchema,
  title: z.string(),
  summaryTechnical: z.string(),
});
export type TaskProjectRef = z.infer<typeof TaskProjectRefSchema>;

/** What the assigned employee sees. */
export const MyTaskSchema = z.object({
  id: IdSchema,
  title: z.string(),
  descriptionTechnical: z.string(),
  jobRoleId: IdSchema.nullable(),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
  source: TaskSourceSchema,
  blockedReason: z.string().nullable(),
  assignedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
  project: TaskProjectRefSchema.nullable(),
});
export type MyTask = z.infer<typeof MyTaskSchema>;

/** What the owner sees. */
export const TaskSchema = MyTaskSchema.extend({
  projectId: IdSchema.nullable(),
  descriptionOriginal: z.string().nullable(),
  assigneeId: IdSchema.nullable(),
  assigneeName: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskStatusCountsSchema = z.object({
  UNASSIGNED: z.number().int(),
  PENDING: z.number().int(),
  IN_PROGRESS: z.number().int(),
  BLOCKED: z.number().int(),
  COMPLETED: z.number().int(),
});
export type TaskStatusCounts = z.infer<typeof TaskStatusCountsSchema>;

export const ProjectSchema = z.object({
  id: IdSchema,
  title: z.string(),
  briefOriginal: z.string().nullable(),
  summaryTechnical: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  counts: TaskStatusCountsSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectDetailSchema = ProjectSchema.extend({ tasks: z.array(TaskSchema) });
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;
