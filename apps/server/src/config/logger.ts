import type { FastifyServerOptions } from 'fastify';

/**
 * Fastify never logs request bodies by default (passwords, codes, templates stay out).
 * The redact list also covers headers that carry tokens, in case logging is extended.
 */
export function loggerOptions(
  level: string,
  stream?: { write(msg: string): void },
): FastifyServerOptions['logger'] {
  return {
    level,
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'req.body',
    ],
    ...(stream ? { stream } : {}),
  };
}
