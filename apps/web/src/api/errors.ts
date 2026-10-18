import { ApiErrorSchema, apiSuccess } from '@lk/shared';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const networkError = () => new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server.');

/** Reads a fetch Response and validates the `{ data }` / `{ error }` envelope with Zod. */
export async function parseEnvelope<T extends z.ZodType>(
  res: Response,
  schema: T,
  dataStatuses: readonly number[] = [],
): Promise<z.infer<T>> {
  const body: unknown = await res.json().catch(() => undefined);

  if (res.ok || dataStatuses.includes(res.status)) {
    const envelope = apiSuccess(z.unknown()).safeParse(body);
    const parsed = envelope.success ? schema.safeParse(envelope.data.data) : undefined;
    if (parsed?.success) return parsed.data;
    throw new ApiError(res.status, 'INVALID_RESPONSE', 'The server sent an unexpected response.');
  }

  const err = ApiErrorSchema.safeParse(body);
  if (err.success) throw new ApiError(res.status, err.data.error.code, err.data.error.message);
  throw new ApiError(res.status, 'HTTP_ERROR', `Request failed (${res.status}).`);
}

/** A readable message for any error thrown by the api layer. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Please try again.';
}
