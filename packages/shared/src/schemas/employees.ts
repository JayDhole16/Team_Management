import { z } from 'zod';
import { DateOnlySchema, DeviceModeSchema, IdSchema, UserStatusSchema } from './common';

export const IDLE_INTERVAL_MIN = 5;
export const IDLE_INTERVAL_MAX = 120;
export const IDLE_INTERVAL_DEFAULT = 20;

/** What the owner sees. Never contains the password hash or the face template. */
export const EmployeeSchema = z.object({
  id: IdSchema,
  email: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  joiningDate: DateOnlySchema,
  status: UserStatusSchema,
  jobRoleId: IdSchema.nullable(),
  deviceMode: DeviceModeSchema.nullable(),
  idleIntervalMin: z.number().int(),
  faceEnrolled: z.boolean(),
  faceModelVersion: z.string().nullable(),
  createdAt: z.iso.datetime(),
  deactivatedAt: z.iso.datetime().nullable(),
});
export type Employee = z.infer<typeof EmployeeSchema>;

export const EmployeeListQuerySchema = z
  .object({
    jobRoleId: IdSchema.optional(),
    status: UserStatusSchema.optional(),
  })
  .strict();
export type EmployeeListQuery = z.infer<typeof EmployeeListQuerySchema>;

/** Owner-only edits. Strict, and at least one field is required. */
export const EmployeePatchBodySchema = z
  .object({
    jobRoleId: IdSchema.nullable().optional(),
    deviceMode: DeviceModeSchema.optional(),
    idleIntervalMin: z.number().int().min(IDLE_INTERVAL_MIN).max(IDLE_INTERVAL_MAX).optional(),
    joiningDate: DateOnlySchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');
export type EmployeePatchBody = z.infer<typeof EmployeePatchBodySchema>;
