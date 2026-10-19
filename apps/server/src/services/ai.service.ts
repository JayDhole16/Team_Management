import {
  LLM_UNAVAILABLE_MESSAGE,
  type AiHealth,
  type BreakdownBody,
  type BreakdownResult,
  type TranslateTaskBody,
  type TranslateTaskResult,
  type TranslateUpdateBody,
  type TranslateUpdateResult,
} from '@lk/shared';
import { AppError, notFound, rateLimited } from '../lib/errors';
import {
  runBreakdown,
  runTranslateTask,
  runTranslateUpdate,
  type PipelineDeps,
} from '../llm/pipelines';
import { LlmError } from '../llm/types';
import type { ServiceContext } from './context';

/** Pino-compatible. Only metadata is logged: never the brief, update text or model answer. */
export interface AiLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

const MANUAL_HINT = 'You can still write tasks by hand.';

function toAppError(err: LlmError): AppError {
  switch (err.kind) {
    case 'unavailable':
      return new AppError(503, 'LLM_UNAVAILABLE', LLM_UNAVAILABLE_MESSAGE);
    case 'timeout':
      return new AppError(
        503,
        'LLM_TIMEOUT',
        `The AI assistant took too long to answer. Try again later. ${MANUAL_HINT}`,
      );
    case 'model_missing':
      return new AppError(
        503,
        'LLM_MODEL_MISSING',
        `The AI model is not installed on the server. ${MANUAL_HINT}`,
      );
    case 'bad_response':
    case 'bad_output':
      return new AppError(
        502,
        'LLM_BAD_OUTPUT',
        `The AI gave an answer that could not be used. Try again. ${MANUAL_HINT}`,
      );
  }
}

function pipelineDeps(ctx: ServiceContext): PipelineDeps {
  return {
    client: ctx.llm,
    timeoutMs: ctx.env.OLLAMA_TIMEOUT_MS,
    language: ctx.env.PLAIN_LANGUAGE,
  };
}

async function run<T extends { meta: { attempts: number; durationMs: number; model: string } }>(
  ctx: ServiceContext,
  userId: string,
  log: AiLog,
  pipeline: string,
  call: (deps: PipelineDeps) => Promise<T>,
): Promise<T> {
  if (ctx.limiters.ai.isBlocked(userId)) throw rateLimited();
  ctx.limiters.ai.recordFailure(userId);
  try {
    const result = await call(pipelineDeps(ctx));
    log.info(
      {
        pipeline,
        model: result.meta.model,
        attempts: result.meta.attempts,
        ms: result.meta.durationMs,
      },
      'llm call ok',
    );
    return result;
  } catch (err) {
    if (err instanceof LlmError) {
      log.warn(
        { pipeline, model: ctx.llm.model, kind: err.kind, issues: err.issues },
        'llm call failed',
      );
      throw toAppError(err);
    }
    throw err;
  }
}

/** P1 (owner). Tasks use the current job roles; an unknown role comes back for review. */
export async function breakdownBrief(
  ctx: ServiceContext,
  userId: string,
  body: BreakdownBody,
  log: AiLog,
): Promise<BreakdownResult> {
  const roles = await ctx.data.repos.jobRoles.list();
  return run(ctx, userId, log, 'breakdown', (deps) =>
    runBreakdown(deps, {
      brief: body.brief,
      roles: roles.map((r) => ({ id: r.id, key: r.key, label: r.label })),
    }),
  );
}

/** P2 (owner). */
export async function translateTask(
  ctx: ServiceContext,
  userId: string,
  body: TranslateTaskBody,
  log: AiLog,
): Promise<TranslateTaskResult> {
  let roleLabel: string | null = null;
  if (body.jobRoleId) {
    const role = await ctx.data.repos.jobRoles.findById(body.jobRoleId);
    if (!role) throw notFound('Job role');
    roleLabel = role.label;
  }
  return run(ctx, userId, log, 'translate-task', (deps) =>
    runTranslateTask(deps, { text: body.text, roleLabel }),
  );
}

/** P3 (employee preview before sending an update; Phase 6 also calls it when saving). */
export function translateUpdate(
  ctx: ServiceContext,
  userId: string,
  body: TranslateUpdateBody,
  log: AiLog,
): Promise<TranslateUpdateResult> {
  return run(ctx, userId, log, 'translate-update', (deps) =>
    runTranslateUpdate(deps, { text: body.text }),
  );
}

/** Never fails: an unreachable Ollama is reported as `down`. Not rate-limited (cheap). */
export function aiHealth(ctx: ServiceContext): Promise<AiHealth> {
  return ctx.llm.health();
}
