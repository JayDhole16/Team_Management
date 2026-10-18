import { EmployeeListQuerySchema, EmployeePatchBodySchema, IdSchema } from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../plugins/auth';
import type { ServiceContext } from '../services/context';
import {
  deactivateEmployee,
  getEmployee,
  listEmployees,
  reactivateEmployee,
  updateEmployee,
} from '../services/employee.service';

const IdParams = z.object({ id: IdSchema });

export function registerEmployeeRoutes(app: FastifyInstance, ctx: ServiceContext) {
  const owner = { config: { auth: ['OWNER'] as const } };

  app.get('/api/v1/employees', owner, async (request) => {
    const query = EmployeeListQuerySchema.parse(request.query);
    return { data: await listEmployees(ctx, query) };
  });

  app.get('/api/v1/employees/:id', owner, async (request) => {
    const { id } = IdParams.parse(request.params);
    return { data: await getEmployee(ctx, id) };
  });

  app.patch('/api/v1/employees/:id', owner, async (request) => {
    const { id } = IdParams.parse(request.params);
    const body = EmployeePatchBodySchema.parse(request.body);
    return { data: await updateEmployee(ctx, currentUser(request).id, id, body) };
  });

  app.post('/api/v1/employees/:id/deactivate', owner, async (request) => {
    const { id } = IdParams.parse(request.params);
    return { data: await deactivateEmployee(ctx, currentUser(request).id, id) };
  });

  app.post('/api/v1/employees/:id/reactivate', owner, async (request) => {
    const { id } = IdParams.parse(request.params);
    return { data: await reactivateEmployee(ctx, currentUser(request).id, id) };
  });
}
