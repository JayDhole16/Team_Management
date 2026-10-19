import {
  BreakdownLlmOutputSchema,
  TranslateTaskLlmOutputSchema,
  TranslateUpdateLlmOutputSchema,
  type AiMeta,
  type BreakdownResult,
  type PlainLanguage,
  type TranslateTaskResult,
  type TranslateUpdateResult,
} from '@lk/shared';
import { z } from 'zod';
import { toOllamaFormat } from './format';
import * as breakdownPrompt from './prompts/breakdown';
import * as translateTaskPrompt from './prompts/translate-task';
import * as translateUpdatePrompt from './prompts/translate-update';
import {
  LlmError,
  type JsonSchema,
  type LlmChatResult,
  type LlmClient,
  type LlmMessage,
} from './types';

export interface PipelineDeps {
  client: LlmClient;
  /** Budget for the whole call, the retry included. */
  timeoutMs: number;
  language: PlainLanguage;
}

export const MAX_ATTEMPTS = 2;
export const RETRY_INSTRUCTION =
  'Your previous answer was not valid JSON for the required schema. Problems: ';

/** Generated-token caps: enough for a full answer, small enough to fit OLLAMA_NUM_CTX 4096. */
const NUM_PREDICT = { breakdown: 1500, translateTask: 700, translateUpdate: 600 } as const;

function parseAnswer<S extends z.ZodType>(
  schema: S,
  answer: LlmChatResult,
): { ok: true; data: z.infer<S> } | { ok: false; problems: string[] } {
  // A cut-off answer is invalid output too, so it gets the one retry.
  if (answer.truncated) {
    return {
      ok: false,
      problems: ['the answer was cut off because it was too long; keep it shorter'],
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(answer.content);
  } catch {
    return { ok: false, problems: ['the answer is not valid JSON'] };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    problems: result.error.issues
      .slice(0, 10)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
  };
}

/**
 * Calls the model and validates its answer. On invalid output it retries ONCE, showing the model
 * its answer and what was wrong; a second invalid answer is a `bad_output` error. The model's text
 * never leaves this function unvalidated.
 */
export async function runStructured<S extends z.ZodType>(
  deps: PipelineDeps,
  options: {
    promptVersion: string;
    messages: LlmMessage[];
    schema: S;
    format: JsonSchema;
    numPredict: number;
  },
): Promise<{ data: z.infer<S>; meta: AiMeta }> {
  const started = performance.now();
  const signal = AbortSignal.timeout(deps.timeoutMs);
  let messages = options.messages;
  let problems: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const answer = await deps.client.chat({
      messages,
      format: options.format,
      numPredict: options.numPredict,
      signal,
    });
    const parsed = parseAnswer(options.schema, answer);
    if (parsed.ok) {
      return {
        data: parsed.data,
        meta: {
          model: answer.model,
          promptVersion: options.promptVersion,
          attempts: attempt,
          durationMs: Math.round(performance.now() - started),
        },
      };
    }
    problems = parsed.problems;
    messages = [
      ...options.messages,
      { role: 'assistant', content: answer.content.slice(0, 6000) },
      {
        role: 'user',
        content: `${RETRY_INSTRUCTION}${problems.join('; ')}. Return only the corrected JSON.`,
      },
    ];
  }
  // Issue paths only: the messages can quote the model's text.
  throw new LlmError(
    'bad_output',
    'The AI answer could not be used.',
    problems.map((p) => p.split(':')[0] ?? p),
  );
}

export interface BreakdownRole {
  /** null in the eval script, which runs without a database. */
  id: string | null;
  key: string;
  label: string;
}

/** A vague brief must come back as questions, so an answer with neither is invalid. */
const BreakdownAnswerSchema = BreakdownLlmOutputSchema.refine(
  (out) => out.tasks.length > 0 || out.clarifyingQuestions.length > 0,
  { message: 'return tasks, or clarifyingQuestions when the brief is too vague' },
);

function breakdownFormat(roleKeys: string[]): JsonSchema {
  const [first, ...rest] = roleKeys;
  if (first === undefined) return toOllamaFormat(BreakdownLlmOutputSchema);
  // The role keys become an enum, so the sampler can only produce real keys. The service still
  // checks them, because the model may run without structured output support.
  const task = BreakdownLlmOutputSchema.shape.tasks.element.extend({
    roleKey: z.enum([first, ...rest]),
  });
  return toOllamaFormat(BreakdownLlmOutputSchema.extend({ tasks: z.array(task) }));
}

/** P1. A roleKey that is not in `roles` becomes null with needsReview = true. */
export async function runBreakdown(
  deps: PipelineDeps,
  input: { brief: string; roles: readonly BreakdownRole[] },
): Promise<BreakdownResult> {
  const { data, meta } = await runStructured(deps, {
    promptVersion: breakdownPrompt.PROMPT_VERSION,
    messages: breakdownPrompt.buildMessages({
      brief: input.brief,
      roles: input.roles,
      language: deps.language,
    }),
    schema: BreakdownAnswerSchema,
    format: breakdownFormat(input.roles.map((r) => r.key)),
    numPredict: NUM_PREDICT.breakdown,
  });

  const byKey = new Map(input.roles.map((r) => [r.key.toLowerCase(), r]));
  return {
    projectTitle: data.projectTitle,
    technicalSummary: data.technicalSummary,
    clarifyingQuestions: data.clarifyingQuestions,
    tasks: data.tasks.map((task) => {
      const role = byKey.get(task.roleKey.toLowerCase());
      return {
        title: task.title,
        description: task.description,
        priority: task.priority,
        roleKey: role?.key ?? null,
        jobRoleId: role?.id ?? null,
        needsReview: role === undefined,
      };
    }),
    meta,
  };
}

/** P2. `roleLabel` is the target employee's job role label, or null if they have none. */
export async function runTranslateTask(
  deps: PipelineDeps,
  input: { text: string; roleLabel: string | null },
): Promise<TranslateTaskResult> {
  const { data, meta } = await runStructured(deps, {
    promptVersion: translateTaskPrompt.PROMPT_VERSION,
    messages: translateTaskPrompt.buildMessages(input),
    schema: TranslateTaskLlmOutputSchema,
    format: toOllamaFormat(TranslateTaskLlmOutputSchema),
    numPredict: NUM_PREDICT.translateTask,
  });
  return { title: data.title, description: data.description, meta };
}

/** P3. Plain text is written in PLAIN_LANGUAGE. */
export async function runTranslateUpdate(
  deps: PipelineDeps,
  input: { text: string },
): Promise<TranslateUpdateResult> {
  const { data, meta } = await runStructured(deps, {
    promptVersion: translateUpdatePrompt.PROMPT_VERSION,
    messages: translateUpdatePrompt.buildMessages({ text: input.text, language: deps.language }),
    schema: TranslateUpdateLlmOutputSchema,
    format: toOllamaFormat(TranslateUpdateLlmOutputSchema),
    numPredict: NUM_PREDICT.translateUpdate,
  });
  return { plain: data.plain, blockers: data.blockers, meta };
}
