import type { AiHealth } from '@lk/shared';
import { z } from 'zod';
import type { LlmEnv } from '../config/env';
import { systemClock, type Clock } from '../lib/clock';
import { LlmError, type LlmChatRequest, type LlmChatResult, type LlmClient } from './types';

export const OLLAMA_TEMPERATURE = 0.2;
export const HEALTH_TIMEOUT_MS = 3000;

const ChatResponseSchema = z.object({
  model: z.string().optional(),
  message: z.object({ content: z.string() }),
  done_reason: z.string().optional(),
});

const TagsResponseSchema = z.object({
  models: z.array(z.object({ name: z.string(), model: z.string().optional() })),
});

const PsResponseSchema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      model: z.string().optional(),
      size: z.number(),
      size_vram: z.number(),
    }),
  ),
});

/** "qwen3" and "qwen3:latest" are the same model. */
function sameModel(a: string, b: string): boolean {
  const norm = (name: string) => (name.includes(':') ? name : `${name}:latest`);
  return norm(a) === norm(b);
}

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

export interface OllamaClientOptions {
  fetchImpl?: typeof fetch;
  clock?: Clock;
}

/** Ollama REST client (POST /api/chat, GET /api/tags, GET /api/ps). The model has no tools. */
export function createOllamaClient(
  env: Pick<LlmEnv, 'OLLAMA_BASE_URL' | 'OLLAMA_MODEL' | 'OLLAMA_NUM_CTX'>,
  options: OllamaClientOptions = {},
): LlmClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const clock = options.clock ?? systemClock;
  const base = env.OLLAMA_BASE_URL.replace(/\/+$/, '');
  const model = env.OLLAMA_MODEL;
  // Thinking is disabled. A model without a thinking mode may refuse the `think` field; then it
  // is left out from that point on.
  let sendThink = true;

  async function post(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    try {
      return await fetchImpl(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: signal ?? null,
      });
    } catch (err) {
      if (isTimeout(err)) throw new LlmError('timeout', 'The AI model took too long to answer.');
      throw new LlmError('unavailable', 'Ollama cannot be reached.');
    }
  }

  async function readBody(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch (err) {
      if (isTimeout(err)) throw new LlmError('timeout', 'The AI model took too long to answer.');
      throw new LlmError('bad_response', 'Ollama sent an answer that is not JSON.');
    }
  }

  async function chat(request: LlmChatRequest): Promise<LlmChatResult> {
    const body = (withThink: boolean) => ({
      model,
      messages: request.messages,
      stream: false,
      ...(withThink ? { think: false } : {}),
      format: request.format,
      options: {
        temperature: OLLAMA_TEMPERATURE,
        num_ctx: env.OLLAMA_NUM_CTX,
        num_predict: request.numPredict,
      },
    });

    let res = await post(body(sendThink), request.signal);
    if (res.status === 400 && sendThink) {
      const text = await res.text().catch(() => '');
      if (/think/i.test(text)) {
        sendThink = false;
        res = await post(body(false), request.signal);
      } else {
        throw new LlmError('bad_response', 'Ollama rejected the request (400).');
      }
    }
    if (res.status === 404) {
      throw new LlmError('model_missing', `The AI model ${model} is not installed in Ollama.`);
    }
    if (!res.ok) throw new LlmError('bad_response', `Ollama answered with status ${res.status}.`);

    const parsed = ChatResponseSchema.safeParse(await readBody(res));
    if (!parsed.success) throw new LlmError('bad_response', 'Ollama sent an unexpected answer.');
    return {
      content: parsed.data.message.content,
      model: parsed.data.model ?? model,
      truncated: parsed.data.done_reason === 'length',
    };
  }

  async function getJson(path: string): Promise<unknown> {
    const res = await fetchImpl(`${base}${path}`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json();
  }

  async function health(): Promise<AiHealth> {
    const checkedAt = clock().toISOString();
    let tags: z.infer<typeof TagsResponseSchema>;
    try {
      tags = TagsResponseSchema.parse(await getJson('/api/tags'));
    } catch {
      return { status: 'down', model, gpuPercent: null, checkedAt };
    }
    const installed = tags.models.some(
      (m) => sameModel(m.name, model) || (m.model !== undefined && sameModel(m.model, model)),
    );
    if (!installed) return { status: 'model_missing', model, gpuPercent: null, checkedAt };

    let gpuPercent: number | null = null;
    try {
      const ps = PsResponseSchema.parse(await getJson('/api/ps'));
      const loaded = ps.models.find(
        (m) => sameModel(m.name, model) || (m.model !== undefined && sameModel(m.model, model)),
      );
      if (loaded && loaded.size > 0) {
        gpuPercent = Math.min(100, Math.round((loaded.size_vram / loaded.size) * 100));
      }
    } catch {
      // Load info is optional; the model is installed, so the LLM counts as ok.
    }
    return { status: 'ok', model, gpuPercent, checkedAt };
  }

  return { model, chat, health };
}
