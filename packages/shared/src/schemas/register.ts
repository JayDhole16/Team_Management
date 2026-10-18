import { z } from 'zod';
import { CodeInputSchema } from './codes';
import {
  DeviceModeSchema,
  EmailSchema,
  IdSchema,
  JobRoleSchema,
  PersonNameSchema,
  PhoneSchema,
} from './common';
import { PasswordSchema } from './password';

/**
 * A face template computed on the employee's own device. Only these numbers leave the
 * device; images never do (the one profile photo, PRD Q13, is a separate field from Phase 9). The exact descriptor length depends on the face library (Phase 9).
 */
export const FaceTemplateSchema = z
  .object({
    modelVersion: z.string().trim().min(1).max(64),
    descriptor: z.array(z.number().finite()).min(64).max(2048),
  })
  .strict();
export type FaceTemplate = z.infer<typeof FaceTemplateSchema>;

export const ClaimBodySchema = z.object({ code: CodeInputSchema }).strict();
export type ClaimBody = z.infer<typeof ClaimBodySchema>;

/** Everything the wizard's details step needs. Device mode is shown read-only. */
export const ClaimResponseSchema = z.object({
  registrationToken: z.string(),
  expiresAt: z.iso.datetime(),
  deviceMode: DeviceModeSchema,
  presetJobRoleId: IdSchema.nullable(),
  jobRoles: z.array(JobRoleSchema),
  faceEnrollmentRequired: z.boolean(),
});
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;

/**
 * Strict: unknown fields (e.g. `deviceMode`, `role`) are rejected. The server takes
 * device mode and everything else owner-only from the access code.
 */
export const RegisterCompleteBodySchema = z
  .object({
    token: z.string().min(1).max(200),
    name: PersonNameSchema,
    email: EmailSchema,
    password: PasswordSchema,
    jobRoleId: IdSchema,
    phone: PhoneSchema,
    emergencyContactName: PersonNameSchema,
    emergencyContactPhone: PhoneSchema,
    consentAccepted: z.literal(true),
    consentVersion: z.string().min(1).max(40),
    faceTemplate: FaceTemplateSchema.optional(),
  })
  .strict();
export type RegisterCompleteBody = z.infer<typeof RegisterCompleteBodySchema>;

export const RegisterCompleteResponseSchema = z.object({
  userId: IdSchema,
  deviceMode: DeviceModeSchema,
});
export type RegisterCompleteResponse = z.infer<typeof RegisterCompleteResponseSchema>;

/** Re-scan with an owner-issued FACE_RESCAN code. */
export const FaceTemplateUploadBodySchema = z
  .object({ code: CodeInputSchema, template: FaceTemplateSchema })
  .strict();
export type FaceTemplateUploadBody = z.infer<typeof FaceTemplateUploadBodySchema>;
