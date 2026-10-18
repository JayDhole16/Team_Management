import { z } from 'zod';
import { CodeInputSchema } from './codes';
import {
  DeviceModeSchema,
  EmailSchema,
  IdSchema,
  UserRoleSchema,
  UserStatusSchema,
} from './common';
import { PasswordSchema } from './password';

export const LoginBodySchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
  })
  .strict();
export type LoginBody = z.infer<typeof LoginBodySchema>;

export const MeSchema = z.object({
  id: IdSchema,
  email: z.string(),
  name: z.string(),
  role: UserRoleSchema,
  status: UserStatusSchema,
  jobRoleId: IdSchema.nullable(),
  deviceMode: DeviceModeSchema.nullable(),
  idleIntervalMin: z.number().int(),
  faceEnrolled: z.boolean(),
});
export type Me = z.infer<typeof MeSchema>;

/** Login and refresh both return a short-lived access token; the refresh token is an httpOnly cookie. */
export const AuthTokenResponseSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
  user: MeSchema,
});
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;

export const PasswordResetCompleteBodySchema = z
  .object({
    email: EmailSchema,
    code: CodeInputSchema,
    newPassword: PasswordSchema,
  })
  .strict();
export type PasswordResetCompleteBody = z.infer<typeof PasswordResetCompleteBodySchema>;
