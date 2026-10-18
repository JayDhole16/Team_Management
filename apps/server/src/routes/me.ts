import { FaceTemplateUploadBodySchema } from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { currentUser } from '../plugins/auth';
import type { ServiceContext } from '../services/context';
import { rescanFaceTemplate } from '../services/face-template.service';

export function registerMeRoutes(app: FastifyInstance, ctx: ServiceContext) {
  app.post('/api/v1/me/face-template', { config: { auth: ['EMPLOYEE'] } }, async (request) => {
    const body = FaceTemplateUploadBodySchema.parse(request.body);
    await rescanFaceTemplate(ctx, {
      userId: currentUser(request).id,
      code: body.code,
      template: body.template,
      ip: request.ip,
    });
    return { data: { ok: true } };
  });
}
