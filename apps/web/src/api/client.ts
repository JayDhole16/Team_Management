import type { z } from 'zod';
import { authSession, type AuthSession } from '../auth/session';
import { noteServerDate } from './clock';
import { ApiError, networkError, parseEnvelope } from './errors';

export { ApiError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiRequestOptions {
  /** JSON request body. */
  body?: unknown;
  /** HTTP statuses whose body is still a `{ data }` payload (e.g. 503 from /health). */
  dataStatuses?: number[];
  /** false for public endpoints: no Bearer header and no refresh on 401. Default true. */
  auth?: boolean;
  fetchImpl?: typeof fetch;
  session?: AuthSession;
}

/**
 * Calls a `/api/v1` path and validates the `{ data }` envelope with Zod. Signed-in calls carry
 * the in-memory access token; on 401 the token is refreshed once and the call retried once.
 */
export async function apiRequest<T extends z.ZodType>(
  method: HttpMethod,
  path: string,
  schema: T,
  options: ApiRequestOptions = {},
): Promise<z.infer<T>> {
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const session = options.session ?? authSession;
  const useAuth = options.auth ?? true;

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const token = useAuth ? session.getToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const res = await fetchImpl(`/api/v1${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
      noteServerDate(res.headers.get('Date'));
      return res;
    } catch {
      throw networkError();
    }
  };

  let res = await send();
  if (useAuth && res.status === 401) {
    const refreshed = await session.refresh();
    if (!refreshed) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Your session has ended. Please log in again.');
    }
    res = await send();
  }
  return parseEnvelope(res, schema, options.dataStatuses);
}

type Opts = Omit<ApiRequestOptions, 'body'>;

export const apiGet = <T extends z.ZodType>(path: string, schema: T, options?: Opts) =>
  apiRequest('GET', path, schema, options);

export const apiPost = <T extends z.ZodType>(
  path: string,
  schema: T,
  body?: unknown,
  options?: Opts,
) => apiRequest('POST', path, schema, { ...options, body });

export const apiPatch = <T extends z.ZodType>(
  path: string,
  schema: T,
  body: unknown,
  options?: Opts,
) => apiRequest('PATCH', path, schema, { ...options, body });

export const apiDelete = <T extends z.ZodType>(path: string, schema: T, options?: Opts) =>
  apiRequest('DELETE', path, schema, options);
