import { randomUUID } from 'node:crypto';
import {
  AiHealthSchema,
  ApiErrorSchema,
  BreakdownResultSchema,
  LLM_UNAVAILABLE_MESSAGE,
  TranslateTaskResultSchema,
  TranslateUpdateResultSchema,
} from '@lk/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { LlmError } from '../llm/types';
import { AI_CALLS_PER_USER } from '../services/context';
import { bearer, createHarness, type Harness } from '../test/helpers';
import { mockLlm } from '../test/mock-llm';

const BRIEF = 'Mujhe ek online store banwana hai jaha log kapde khareed sake. SECRET-BRIEF-MARKER';

const breakdownAnswer = JSON.stringify({
  projectTitle: 'Clothing store',
  technicalSummary: 'Online store with cart and UPI payment.',
  clarifyingQuestions: [],
  tasks: [
    {
      title: 'Cart page',
      description: 'Build the cart.',
      roleKey: 'frontend_developer',
      priority: 'HIGH',
    },
    {
      title: 'Promo video',
      description: 'Edit a promo.',
      roleKey: 'video_wizard',
      priority: 'LOW',
    },
  ],
});

describe('AI routes', () => {
  let h: Harness;
  let llm: ReturnType<typeof mockLlm>;
  let owner: string;

  beforeEach(async () => {
    llm = mockLlm();
    h = await createHarness({ llm, captureLogs: true });
    owner = await h.ownerToken();
  });

  const post = (url: string, token: string, payload: Record<string, unknown>) =>
    h.app.inject({ method: 'POST', url: `/api/v1/ai/${url}`, headers: bearer(token), payload });

  it('breakdown returns validated tasks with job role ids; unknown roles need review', async () => {
    llm.answers.push(breakdownAnswer);
    const res = await post('breakdown', owner, { brief: BRIEF });
    expect(res.statusCode).toBe(200);
    const data = BreakdownResultSchema.parse(res.json<{ data: unknown }>().data);
    expect(data.tasks).toEqual([
      expect.objectContaining({
        roleKey: 'frontend_developer',
        jobRoleId: h.role('frontend_developer').id,
        needsReview: false,
      }),
      expect.objectContaining({ roleKey: null, jobRoleId: null, needsReview: true }),
    ]);
    expect(data.meta).toMatchObject({ promptVersion: 'breakdown@1', attempts: 1 });
    // The seeded job role keys were offered to the model.
    expect(llm.requests[0]?.messages.at(-1)?.content).toContain(
      '- graphic_designer: Graphic Designer',
    );
  });

  it('translate-task uses the target job role label', async () => {
    llm.answers.push(JSON.stringify({ title: 'Fix reset', description: 'Steps.' }));
    const res = await post('translate-task', owner, {
      text: 'Forgot password kaam nahi kar raha',
      jobRoleId: h.role('backend_developer').id,
    });
    expect(res.statusCode).toBe(200);
    expect(TranslateTaskResultSchema.parse(res.json<{ data: unknown }>().data).title).toBe(
      'Fix reset',
    );
    expect(llm.requests[0]?.messages.at(-1)?.content).toContain('Target role: Backend Developer');
  });

  it('translate-task with an unknown job role is 404 and never calls the model', async () => {
    const res = await post('translate-task', owner, {
      text: 'Logo badlo',
      jobRoleId: randomUUID(),
    });
    expect(res.statusCode).toBe(404);
    expect(llm.requests).toHaveLength(0);
  });

  it('translate-update works for the owner (employees use the signed /updates/preview)', async () => {
    llm.answers.push(
      JSON.stringify({ plain: 'Server is ready.', blockers: ['Waiting for domain.'] }),
    );
    const res = await post('translate-update', owner, {
      text: 'Dockerized the API. Blocked on SSL.',
    });
    expect(res.statusCode).toBe(200);
    expect(TranslateUpdateResultSchema.parse(res.json<{ data: unknown }>().data)).toMatchObject({
      plain: 'Server is ready.',
      blockers: ['Waiting for domain.'],
    });
  });

  it('an employee gets 403 on breakdown, translate-task and translate-update', async () => {
    const employee = await h.registerEmployee();
    for (const url of ['breakdown', 'translate-task', 'translate-update']) {
      const res = await post(url, employee.accessToken, { brief: BRIEF, text: 'x' });
      expect(res.statusCode, url).toBe(403);
    }
    expect(llm.requests).toHaveLength(0);
  });

  it('with Ollama stopped every endpoint returns a clean 503 LLM_UNAVAILABLE', async () => {
    const calls = [
      post('breakdown', owner, { brief: BRIEF }),
      post('translate-task', owner, { text: 'Logo badlo' }),
      post('translate-update', owner, { text: 'Fixed the bug' }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.statusCode).toBe(503);
      expect(ApiErrorSchema.parse(res.json())).toEqual({
        error: { code: 'LLM_UNAVAILABLE', message: LLM_UNAVAILABLE_MESSAGE },
      });
    }
  });

  it('maps timeout and missing model to 503 with their own codes', async () => {
    llm.answers.push(new LlmError('timeout', 't'), new LlmError('model_missing', 'm'));
    const timeout = await post('breakdown', owner, { brief: BRIEF });
    const missing = await post('breakdown', owner, { brief: BRIEF });
    expect([timeout.statusCode, ApiErrorSchema.parse(timeout.json()).error.code]).toEqual([
      503,
      'LLM_TIMEOUT',
    ]);
    expect([missing.statusCode, ApiErrorSchema.parse(missing.json()).error.code]).toEqual([
      503,
      'LLM_MODEL_MISSING',
    ]);
    expect(ApiErrorSchema.parse(missing.json()).error.message).toMatch(/by hand/);
  });

  it('invalid model output twice gives 502 and never reaches the client', async () => {
    const evil = '<script>alert(1)</script> not json';
    llm.answers.push(evil, evil);
    const res = await post('breakdown', owner, { brief: BRIEF });
    expect(res.statusCode).toBe(502);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('LLM_BAD_OUTPUT');
    expect(res.body).not.toContain('script');
    expect(llm.requests).toHaveLength(2);
  });

  it('validates the body', async () => {
    const short = await post('breakdown', owner, { brief: 'hi' });
    const extra = await post('breakdown', owner, { brief: BRIEF, model: 'big' });
    const noText = await post('translate-update', owner, {});
    for (const res of [short, extra, noText]) {
      expect(res.statusCode).toBe(400);
      expect(ApiErrorSchema.parse(res.json()).error.code).toBe('VALIDATION_ERROR');
    }
    expect(llm.requests).toHaveLength(0);
  });

  it(`rate-limits AI calls to ${AI_CALLS_PER_USER} per user per 15 min`, async () => {
    for (let i = 0; i < AI_CALLS_PER_USER; i++) {
      expect((await post('translate-update', owner, { text: 'Fixed it' })).statusCode).toBe(503);
    }
    const blocked = await post('translate-update', owner, { text: 'Fixed it' });
    expect(blocked.statusCode).toBe(429);
    expect(llm.requests).toHaveLength(AI_CALLS_PER_USER);

    // The window slides; the access token (15 min) has expired too, so log in again.
    h.clock.advanceMinutes(16);
    const fresh = await h.ownerToken();
    expect((await post('translate-update', fresh, { text: 'Fixed it' })).statusCode).toBe(503);
  });

  it('logs metadata only: never the brief or the model answer', async () => {
    llm.answers.push(breakdownAnswer, 'not json', 'still not json');
    await post('breakdown', owner, { brief: BRIEF });
    await post('breakdown', owner, { brief: BRIEF });
    const logs = h.logs.join('\n');
    expect(logs).toContain('llm call ok');
    expect(logs).toContain('llm call failed');
    expect(logs).not.toContain('SECRET-BRIEF-MARKER');
    expect(logs).not.toContain('Cart page');
    expect(logs).not.toContain('still not json');
  });

  it('health is 200 for owner and employee, and reports down / ok', async () => {
    const employee = await h.registerEmployee();
    const get = (token: string) =>
      h.app.inject({ method: 'GET', url: '/api/v1/ai/health', headers: bearer(token) });

    const down = await get(owner);
    expect(down.statusCode).toBe(200);
    expect(AiHealthSchema.parse(down.json<{ data: unknown }>().data)).toMatchObject({
      status: 'down',
      gpuPercent: null,
    });

    llm.setHealth('ok');
    const ok = await get(employee.accessToken);
    expect(ok.statusCode).toBe(200);
    expect(AiHealthSchema.parse(ok.json<{ data: unknown }>().data)).toMatchObject({
      status: 'ok',
      model: 'mock-model',
    });
  });
});
