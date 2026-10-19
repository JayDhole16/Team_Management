import {
  BreakdownBodySchema,
  TranslateTaskBodySchema,
  TranslateUpdateBodySchema,
} from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { currentUser } from '../plugins/auth';
import { aiHealth, breakdownBrief, translateTask, translateUpdate } from '../services/ai.service';
import type { ServiceContext } from '../services/context';

export function registerAiRoutes(app: FastifyInstance, ctx: ServiceContext) {
  const owner = { config: { auth: ['OWNER'] as const } };

  app.post('/api/v1/ai/breakdown', owner, async (request) => {
    const body = BreakdownBodySchema.parse(request.body);
    return { data: await breakdownBrief(ctx, currentUser(request).id, body, request.log) };
  });

  app.post('/api/v1/ai/translate-task', owner, async (request) => {
    const body = TranslateTaskBodySchema.parse(request.body);
    return { data: await translateTask(ctx, currentUser(request).id, body, request.log) };
  });

  // Owner only. Employees preview their update through POST /updates/preview, which signs the
  // result so exactly that version is saved (PRD E-4, decided 2026-10-20).
  app.post('/api/v1/ai/translate-update', owner, async (request) => {
    const body = TranslateUpdateBodySchema.parse(request.body);
    return { data: await translateUpdate(ctx, currentUser(request).id, body, request.log) };
  });

  // Always 200, so a page can show "AI offline" instead of an error.
  app.get('/api/v1/ai/health', { config: { auth: ['OWNER', 'EMPLOYEE'] } }, async () => {
    return { data: await aiHealth(ctx) };
  });
}
