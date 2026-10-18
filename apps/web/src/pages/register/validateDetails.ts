import {
  EmailSchema,
  PASSWORD_PROBLEM_MESSAGES,
  PersonNameSchema,
  PhoneSchema,
  checkPassword,
} from '@lk/shared';
import type { Details } from './wizardState';

export type DetailErrors = Partial<Record<keyof Details, string>>;

/** The same rules the server applies, checked before sending so the employee sees them early. */
export function validateDetails(d: Details): DetailErrors {
  const errors: DetailErrors = {};
  if (!PersonNameSchema.safeParse(d.name).success)
    errors.name = 'Enter your full name (2 to 80 characters).';
  if (!EmailSchema.safeParse(d.email).success) errors.email = 'Enter a valid email address.';
  const problem = checkPassword(d.password, d.email.trim().toLowerCase());
  if (problem) errors.password = PASSWORD_PROBLEM_MESSAGES[problem];
  else if (d.password !== d.passwordConfirm)
    errors.passwordConfirm = 'The two passwords do not match.';
  if (!d.jobRoleId) errors.jobRoleId = 'Choose your job role.';
  if (!PhoneSchema.safeParse(d.phone).success) errors.phone = 'Enter a valid phone number.';
  if (!PersonNameSchema.safeParse(d.emergencyContactName).success)
    errors.emergencyContactName = "Enter the emergency contact's name.";
  if (!PhoneSchema.safeParse(d.emergencyContactPhone).success)
    errors.emergencyContactPhone = 'Enter a valid phone number.';
  if (!d.deviceConfirmed) errors.deviceConfirmed = 'Please confirm the device type.';
  return errors;
}

/** Same rules for the forgot-password form. */
export function validateNewPassword(
  email: string,
  password: string,
  confirm: string,
): { password?: string; confirm?: string } {
  const problem = checkPassword(password, email.trim().toLowerCase());
  if (problem) return { password: PASSWORD_PROBLEM_MESSAGES[problem] };
  if (password !== confirm) return { confirm: 'The two passwords do not match.' };
  return {};
}
