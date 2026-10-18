import { z } from 'zod';
import { DeviceModeSchema, IdSchema } from './common';

/** No 0/O and no 1/I/L: easy to read aloud and type. 31 symbols. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 8;
export const CODE_TTL_MINUTES = 10;

/** Uppercases and strips dashes/spaces so `k7m4-q9xb` matches `K7M4Q9XB`. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

/** `K7M4Q9XB` -> `K7M4-Q9XB` */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export const CodePurposeSchema = z.enum(['INVITE', 'PASSWORD_RESET', 'FACE_RESCAN']);
export type CodePurpose = z.infer<typeof CodePurposeSchema>;

export const CodeStatusSchema = z.enum(['ACTIVE', 'CLAIMED', 'USED', 'EXPIRED', 'REVOKED']);
export type CodeStatus = z.infer<typeof CodeStatusSchema>;

/** Accepts any short string; the server decides validity and answers with one generic error. */
export const CodeInputSchema = z.string().max(32).transform(normalizeCode);

export const InviteBodySchema = z
  .object({
    deviceMode: DeviceModeSchema,
    presetJobRoleId: IdSchema.optional(),
    note: z.string().trim().max(120).optional(),
  })
  .strict();
export type InviteBody = z.infer<typeof InviteBodySchema>;

/** Returned once, at creation. The plain code is never stored or shown again. */
export const CodeCreatedSchema = z.object({
  id: IdSchema,
  purpose: CodePurposeSchema,
  code: z.string(),
  expiresAt: z.iso.datetime(),
});
export type CodeCreated = z.infer<typeof CodeCreatedSchema>;

export const CodeListItemSchema = z.object({
  id: IdSchema,
  purpose: CodePurposeSchema,
  status: CodeStatusSchema,
  deviceMode: DeviceModeSchema.nullable(),
  presetJobRoleId: IdSchema.nullable(),
  note: z.string().nullable(),
  targetUserId: IdSchema.nullable(),
  registeredUserId: IdSchema.nullable(),
  expiresAt: z.iso.datetime(),
  claimExpiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type CodeListItem = z.infer<typeof CodeListItemSchema>;
