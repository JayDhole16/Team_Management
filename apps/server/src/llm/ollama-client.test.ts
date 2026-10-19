import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toOllamaFormat } from './format';
import { createOllamaClient } from './ollama-client';
import { LlmError, type LlmChatRequest } from './types';

const env = {
  OLLAMA_BASE_URL: 'http://ollama.test:11434/',
  OLLAMA_MODEL: 'qwen3.5:4b',
  OLLAMA_NUM_CTX: 4096,
};
const clock = () => new Date('2026-10-19T05:00:00.000Z');

interface Call {
  url: string;
  body: Record<string, unknown> | null;
}

/** A fetch that answers from a list of handlers, one per call, and records the calls. */
function fakeFetch(...responses: ((call: Call) => Response | Promise<Response>)[]) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Call['body']) : null,
    };
    calls.push(call);
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next(call);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const chatOk = (content: string, extra: Record<string, unknown> = {}) =>
  json({ model: 'qwen3.5:4b', message: { role: 'assistant', content }, done: true, ...extra });

const request: LlmChatRequest = {
  messages: [{ role: 'user', content: 'hi' }],
  format: { type: 'object' },
  numPredict: 500,
};

async function chatError(impl: typeof fetch): Promise<LlmError> {
  const client = createOllamaClient(env, { fetchImpl: impl, clock });
  const err = await client.chat(request).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(LlmError);
  return err as LlmError;
}

describe('ollama client chat', () => {
  it('sends think:false, stream:false, the schema, temperature 0.2 and num_ctx', async () => {
    const { impl, calls } = fakeFetch(() => chatOk('{"a":1}'));
    const client = createOllamaClient(env, { fetchImpl: impl, clock });
    await expect(client.chat(request)).resolves.toEqual({
      content: '{"a":1}',
      model: 'qwen3.5:4b',
      truncated: false,
    });
    expect(calls[0]?.url).toBe('http://ollama.test:11434/api/chat');
    expect(calls[0]?.body).toEqual({
      model: 'qwen3.5:4b',
      messages: request.messages,
      stream: false,
      think: false,
      format: { type: 'object' },
      options: { temperature: 0.2, num_ctx: 4096, num_predict: 500 },
    });
  });

  it('drops `think` for a model without a thinking mode, and remembers it', async () => {
    const { impl, calls } = fakeFetch(
      () => json({ error: '"llama3.2:3b" does not support thinking' }, 400),
      () => chatOk('{}'),
      () => chatOk('{}'),
    );
    const client = createOllamaClient(env, { fetchImpl: impl, clock });
    await client.chat(request);
    await client.chat(request);
    expect(calls.map((c) => 'think' in (c.body ?? {}))).toEqual([true, false, false]);
  });

  it('maps a refused connection to unavailable', async () => {
    const impl = (() =>
      Promise.reject(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
      )) as typeof fetch;
    expect((await chatError(impl)).kind).toBe('unavailable');
  });

  it('maps an aborted request to timeout', async () => {
    const impl = (() =>
      Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'))) as typeof fetch;
    expect((await chatError(impl)).kind).toBe('timeout');
  });

  it('really aborts through the passed signal', async () => {
    const impl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as typeof fetch;
    const client = createOllamaClient(env, { fetchImpl: impl, clock });
    const err = await client
      .chat({ ...request, signal: AbortSignal.timeout(20) })
      .catch((e: unknown) => e);
    expect((err as LlmError).kind).toBe('timeout');
  });

  it('maps 404 to model_missing and other errors to bad_response', async () => {
    expect(
      (await chatError(fakeFetch(() => json({ error: "model 'x' not found" }, 404)).impl)).kind,
    ).toBe('model_missing');
    expect((await chatError(fakeFetch(() => json({ error: 'boom' }, 500)).impl)).kind).toBe(
      'bad_response',
    );
    expect((await chatError(fakeFetch(() => json({ error: 'bad' }, 400)).impl)).kind).toBe(
      'bad_response',
    );
  });

  it('flags an answer cut off at the token cap', async () => {
    const { impl } = fakeFetch(() => chatOk('{"a":', { done_reason: 'length' }));
    const client = createOllamaClient(env, { fetchImpl: impl, clock });
    await expect(client.chat(request)).resolves.toMatchObject({ truncated: true });
  });

  it('treats a malformed body as bad_response', async () => {
    expect((await chatError(fakeFetch(() => new Response('not json')).impl)).kind).toBe(
      'bad_response',
    );
    expect((await chatError(fakeFetch(() => json({ nothing: true })).impl)).kind).toBe(
      'bad_response',
    );
  });
});

describe('ollama client health', () => {
  const tags =
    (...names: string[]) =>
    () =>
      json({ models: names.map((name) => ({ name })) });

  it('is ok with the GPU share of the loaded model', async () => {
    const { impl, calls } = fakeFetch(tags('qwen3.5:4b', 'qwen3:8b'), () =>
      json({ models: [{ name: 'qwen3.5:4b', size: 3_000, size_vram: 2_250 }] }),
    );
    const client = createOllamaClient(env, { fetchImpl: impl, clock });
    await expect(client.health()).resolves.toEqual({
      status: 'ok',
      model: 'qwen3.5:4b',
      gpuPercent: 75,
      checkedAt: '2026-10-19T05:00:00.000Z',
    });
    expect(calls.map((c) => c.url)).toEqual([
      'http://ollama.test:11434/api/tags',
      'http://ollama.test:11434/api/ps',
    ]);
  });

  it('reports gpuPercent null when the model is not loaded', async () => {
    const { impl } = fakeFetch(tags('qwen3.5:4b'), () => json({ models: [] }));
    const client = createOllamaClient(env, { fetchImpl: impl, clock });
    expect((await client.health()).gpuPercent).toBeNull();
  });

  it('treats name and name:latest as the same model', async () => {
    const { impl } = fakeFetch(tags('phi4-mini:latest'), () => json({ models: [] }));
    const client = createOllamaClient(
      { ...env, OLLAMA_MODEL: 'phi4-mini' },
      { fetchImpl: impl, clock },
    );
    expect((await client.health()).status).toBe('ok');
  });

  it('reports model_missing and down', async () => {
    const missing = createOllamaClient(env, { fetchImpl: fakeFetch(tags('qwen3:8b')).impl, clock });
    expect((await missing.health()).status).toBe('model_missing');

    const refused = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    const down = createOllamaClient(env, { fetchImpl: refused, clock });
    await expect(down.health()).resolves.toMatchObject({ status: 'down', gpuPercent: null });
  });
});

describe('toOllamaFormat', () => {
  it('keeps types, enums and required but strips $schema and length limits', () => {
    const schema = z.object({
      title: z.string().min(1).max(200),
      tags: z.array(z.string().max(10)).max(5),
      priority: z.enum(['LOW', 'HIGH']),
    });
    const format = toOllamaFormat(schema);
    const text = JSON.stringify(format);
    expect(text).not.toMatch(/\$schema|minLength|maxLength|minItems|maxItems/);
    expect(format).toMatchObject({
      type: 'object',
      required: ['title', 'tags', 'priority'],
      properties: { priority: { enum: ['LOW', 'HIGH'] }, tags: { type: 'array' } },
    });
  });
});
