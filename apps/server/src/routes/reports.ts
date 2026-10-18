import { HoursQuerySchema, TodayHoursQuerySchema } from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { currentUser } from '../plugins/auth';
import type { ServiceContext } from '../services/context';
import { monthHours, todayHours } from '../services/report.service';

export function registerReportRoutes(app: FastifyInstance, ctx: ServiceContext) {
  // Both roles; report.service limits an employee to their own hours.
  const signedIn = { config: { auth: ['OWNER', 'EMPLOYEE'] as const } };

  app.get('/api/v1/reports/hours', signedIn, async (request) => {
    const query = HoursQuerySchema.parse(request.query);
    return { data: await monthHours(ctx, currentUser(request), query) };
  });

  app.get('/api/v1/reports/hours/today', signedIn, async (request) => {
    const query = TodayHoursQuerySchema.parse(request.query);
    return { data: await todayHours(ctx, currentUser(request), query) };
  });
}
