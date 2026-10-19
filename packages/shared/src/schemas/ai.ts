import { z } from 'zod';
import { IdSchema } from './common';

/** Shown whenever Ollama cannot be reached; manual entry keeps working (PRD L-3). */
export const LLM_UNAVAILABLE_MESSAGE =
  'The AI assistant is not available right now. You can still write tasks by hand.';

export const PlainLanguageSchema = z.enum(['english', 'hinglish']);
export type PlainLanguage = z.infer<typeof PlainLanguageSchema>;

export const TaskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

// --- Request bodies ---

export const BreakdownBodySchema = z
  .object({ brief: z.string().trim().min(10).max(3000) })
  .strict();
export type BreakdownBody = z.infer<typeof BreakdownBodySchema>;

export const TranslateTaskBodySchema = z
  .object({
    text: z.string().trim().min(3).max(2000),
    /** The target employee's job role; null or missing for an employee without one. */
    jobRoleId: IdSchema.nullable().optional(),
  })
  .strict();
export type TranslateTaskBody = z.infer<typeof TranslateTaskBodySchema>;

export const TranslateUpdateBodySchema = z
  .object({ text: z.string().trim().min(3).max(3000) })
  .strict();
export type TranslateUpdateBody = z.infer<typeof TranslateUpdateBodySchema>;

// --- What the model must return (LLM output is untrusted: always validated against these) ---

const llmText = (max: number) => z.string().trim().min(1).max(max);

export const BreakdownLlmOutputSchema = z.object({
  projectTitle: llmText(200),
  technicalSummary: llmText(4000),
  clarifyingQuestions: z.array(llmText(500)).max(10),
  tasks: z
    .array(
      z.object({
        title: llmText(200),
        description: llmText(4000),
        roleKey: z.string().trim().max(60),
        priority: TaskPrioritySchema,
      }),
    )
    .max(40),
});
export type BreakdownLlmOutput = z.infer<typeof BreakdownLlmOutputSchema>;

export const TranslateTaskLlmOutputSchema = z.object({
  title: llmText(200),
  description: llmText(4000),
});
export type TranslateTaskLlmOutput = z.infer<typeof TranslateTaskLlmOutputSchema>;

export const TranslateUpdateLlmOutputSchema = z.object({
  plain: llmText(4000),
  blockers: z.array(llmText(500)).max(20),
});
export type TranslateUpdateLlmOutput = z.infer<typeof TranslateUpdateLlmOutputSchema>;

// --- API responses ---

export const AiMetaSchema = z.object({
  model: z.string(),
  promptVersion: z.string(),
  /** 1, or 2 when the first answer was invalid and the one retry was used. */
  attempts: z.number().int().min(1),
  durationMs: z.number().int().min(0),
});
export type AiMeta = z.infer<typeof AiMetaSchema>;

export const BreakdownTaskSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: TaskPrioritySchema,
  /** null when the model named a role that does not exist; then needsReview is true. */
  roleKey: z.string().nullable(),
  jobRoleId: IdSchema.nullable(),
  needsReview: z.boolean(),
});
export type BreakdownTask = z.infer<typeof BreakdownTaskSchema>;

export const BreakdownResultSchema = z.object({
  projectTitle: z.string(),
  technicalSummary: z.string(),
  clarifyingQuestions: z.array(z.string()),
  tasks: z.array(BreakdownTaskSchema),
  meta: AiMetaSchema,
});
export type BreakdownResult = z.infer<typeof BreakdownResultSchema>;

export const TranslateTaskResultSchema = TranslateTaskLlmOutputSchema.extend({
  meta: AiMetaSchema,
});
export type TranslateTaskResult = z.infer<typeof TranslateTaskResultSchema>;

export const TranslateUpdateResultSchema = TranslateUpdateLlmOutputSchema.extend({
  meta: AiMetaSchema,
});
export type TranslateUpdateResult = z.infer<typeof TranslateUpdateResultSchema>;

export const AiHealthSchema = z.object({
  /** ok: Ollama answers and the model is installed. */
  status: z.enum(['ok', 'down', 'model_missing']),
  model: z.string(),
  /** Share of the loaded model held in GPU memory (100 = all on GPU); null when not loaded. */
  gpuPercent: z.number().min(0).max(100).nullable(),
  checkedAt: z.iso.datetime(),
});
export type AiHealth = z.infer<typeof AiHealthSchema>;
