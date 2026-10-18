import {
  AuthTokenResponseSchema,
  type AuthTokenResponse,
  type LoginBody,
  type PasswordResetCompleteBody,
} from '@lk/shared';
import { z } from 'zod';
import { apiPost } from './client';

const OkSchema = z.object({ ok: z.literal(true) });

export const login = (body: LoginBody): Promise<AuthTokenResponse> =>
  apiPost('/auth/login', AuthTokenResponseSchema, body, { auth: false });

/** Public: the server reads the httpOnly refresh cookie. Also ends an open work session. */
export const logout = () => apiPost('/auth/logout', OkSchema, undefined, { auth: false });

export const completePasswordReset = (body: PasswordResetCompleteBody) =>
  apiPost('/auth/password-reset/complete', OkSchema, body, { auth: false });
