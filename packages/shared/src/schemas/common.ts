import { z } from 'zod';

export const UserRoleSchema = z.enum(['OWNER', 'EMPLOYEE']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(['ACTIVE', 'DEACTIVATED']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

/** Set only by the owner. Restricted mode applies only to COMPANY_MACBOOK. */
export const DeviceModeSchema = z.enum(['COMPANY_MACBOOK', 'PERSONAL']);
export type DeviceMode = z.infer<typeof DeviceModeSchema>;

export const IdSchema = z.uuid();

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
