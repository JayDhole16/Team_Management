import { z } from 'zod';

export const UserRoleSchema = z.enum(['OWNER', 'EMPLOYEE']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(['ACTIVE', 'DEACTIVATED']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

/** Set only by the owner. Restricted mode applies only to COMPANY_MACBOOK. */
export const DeviceModeSchema = z.enum(['COMPANY_MACBOOK', 'PERSONAL']);
export type DeviceMode = z.infer<typeof DeviceModeSchema>;

export const IdSchema = z.uuid();

/**
 * Control characters (NUL cannot be stored in PostgreSQL text) and bidi overrides (they can make
 * text display misleadingly) are refused. Newlines and tabs are fine.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/;
export const hasUnsafeChars = (text: string): boolean => UNSAFE_CHARS.test(text);
/**
 * Also invisible in LLM output: bidi marks, zero-width space, line/paragraph separators, BOM,
 * interlinear annotation marks. (Not refused in user text: ZWJ/ZWNJ are needed for Hindi
 * script and emoji, so U+200C/U+200D are kept.)
 */
const INVISIBLE_IN_LLM_TEXT = /[\u061C\u200B\u200E\u200F\u2028\u2029\uFEFF\uFFF9-\uFFFB]/g;
/** A surrogate half without its pair (PostgreSQL would store it as U+FFFD). */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** For text we do not control (LLM output): drop unsafe and invisible characters instead of refusing. */
export const stripUnsafeChars = (text: string): string =>
  text
    .replace(new RegExp(UNSAFE_CHARS.source, 'g'), '')
    .replace(INVISIBLE_IN_LLM_TEXT, '')
    .replace(LONE_SURROGATE, '');

/** Trimmed text with length limits and no unsafe characters (user-written text). */
export const safeText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !hasUnsafeChars(v), 'Remove the special (invisible) characters');

/** Emails are compared case-insensitively, so they are always stored lowercased. */
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Loose phone check: digits with optional +, spaces, dashes, brackets; 7-15 digits. */
export const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number')
  .refine((v) => {
    const digits = v.replace(/\D/g, '').length;
    return digits >= 7 && digits <= 15;
  }, 'Enter a valid phone number');

export const PersonNameSchema = z.string().trim().min(2).max(80);

/** Calendar date without time, e.g. 2026-10-18 (interpreted in Asia/Kolkata). */
export const DateOnlySchema = z.iso.date();

export const JobRoleSchema = z.object({
  id: IdSchema,
  key: z.string(),
  label: z.string(),
});
export type JobRole = z.infer<typeof JobRoleSchema>;

export const CreateJobRoleBodySchema = z
  .object({
    key: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9_]{1,39}$/, 'Use lowercase letters, digits and _'),
    label: z.string().trim().min(2).max(60),
  })
  .strict();
export type CreateJobRoleBody = z.infer<typeof CreateJobRoleBodySchema>;
