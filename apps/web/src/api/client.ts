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

export interface ApiGetOptions {
  /** HTTP statuses whose body is still a `{ data }` payload (e.g. 503 from /health). */
  dataStatuses?: number[];
  fetchImpl?: typeof fetch;
}

/** GET a `/api/v1` path and validate the `{ data }` envelope with Zod. */
export async function apiGet<T extends z.ZodType>(
  path: string,
  schema: T,
  options: ApiGetOptions = {},
): Promise<z.infer<T>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(`/api/v1${path}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server.');
  }

  const body: unknown = await res.json().catch(() => undefined);

  if (res.ok || options.dataStatuses?.includes(res.status)) {
    const envelope = apiSuccess(z.unknown()).safeParse(body);
    const parsed = envelope.success ? schema.safeParse(envelope.data.data) : undefined;
    if (parsed?.success) return parsed.data;
    throw new ApiError(res.status, 'INVALID_RESPONSE', 'The server sent an unexpected response.');
  }

  const err = ApiErrorSchema.safeParse(body);
  if (err.success) throw new ApiError(res.status, err.data.error.code, err.data.error.message);
  throw new ApiError(res.status, 'HTTP_ERROR', `Request failed (${res.status}).`);
}
