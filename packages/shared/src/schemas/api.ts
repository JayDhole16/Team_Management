import { z } from 'zod';

/** Every error response: `{ error: { code, message } }`. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;

/** Every success response: `{ data }`. */
export function apiSuccess<T extends z.ZodType>(data: T) {
  return z.object({ data });
}
