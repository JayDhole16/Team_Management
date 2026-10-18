import { ClaimBodySchema, RegisterCompleteBodySchema } from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors';
import { assertCodeAttemptAllowed, failCodeAttempt } from '../services/code-attempts';
import type { ServiceContext } from '../services/context';
import { claim, complete, getConsent } from '../services/registration.service';

export function registerRegisterRoutes(app: FastifyInstance, ctx: ServiceContext) {
  const pub = { config: { auth: 'public' as const } };

  app.post(
    '/api/v1/register/claim',
    {
      ...pub,
      // Unparseable JSON or a wrong content type fails before the handler runs. Treat it
      // like a wrong code: same error, counted as a failure. Server faults stay 500.
      errorHandler: async (error: unknown, request) => {
        const status = (error as { statusCode?: number }).statusCode ?? 500;
        if (error instanceof AppError || status >= 500) throw error;
        assertCodeAttemptAllowed(ctx, 'claim', request.ip);
        await failCodeAttempt(ctx, 'claim', request.ip);
      },
    },
    async (request) => {
      // A malformed body is treated like a wrong code: same error, counts as a failure.
      const parsed = ClaimBodySchema.safeParse(request.body);
      const code = parsed.success ? parsed.data.code : '';
      return { data: await claim(ctx, { code, ip: request.ip }) };
    },
  );

  app.get('/api/v1/register/consent', pub, async () => {
    return { data: getConsent() };
  });

  app.post('/api/v1/register/complete', pub, async (request, reply) => {
    const body = RegisterCompleteBodySchema.parse(request.body);
    return reply.code(201).send({ data: await complete(ctx, body) });
  });
}
