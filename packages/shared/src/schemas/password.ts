import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

// Small bundled list of very common passwords that are at least 10 characters long
// (shorter ones already fail the length rule). Compared case-insensitively.
const COMMON_PASSWORDS = new Set([
  '1234567890',
  '12345678910',
  '0123456789',
  '0987654321',
  '1111111111',
  '0000000000',
  '1234554321',
  '1122334455',
  '1q2w3e4r5t',
  '1qaz2wsx3edc',
  'qwertyuiop',
  'qwertyuiop123',
  'qwerty1234',
  'qwerty12345',
  'qwerty123456',
  'asdfghjkl1',
  'asdfghjkl123',
  'zxcvbnm123',
  'password12',
  'password123',
  'password1234',
  'password@123',
  'passw0rd123',
  'p@ssword123',
  'p@ssw0rd123',
  'iloveyou123',
  'abcdefghij',
  'abcd123456',
  'abc1234567',
  'abcdef123456',
  'welcome123',
  'welcome@123',
  'admin12345',
  'admin@1234',
  'administrator',
  'letmein123',
  'football123',
  'baseball123',
  'sunshine123',
  'princess123',
  'superman123',
  'starwars123',
  'monkey12345',
  'dragon12345',
  'master12345',
  'trustno1234',
  'whatever123',
  'computer123',
  'internet123',
  'changeme123',
  'india@1234',
  'india12345',
  'india123456',
  'mumbai1234',
  'krishna123',
  'ganesh1234',
  'jaishriram',
  'jaishreeram',
  'jaimatadi1',
  'cricket123',
  'sachin1234',
  'iloveindia',
  'leaderskey',
  'leaderskey1',
  'leaderskey123',
  'leaderskey@123',
]);

export type PasswordProblem = 'too_short' | 'too_long' | 'common' | 'contains_email';

/** Returns null when the password is acceptable, otherwise the first problem found. */
export function checkPassword(password: string, email?: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (password.length > PASSWORD_MAX_LENGTH) return 'too_long';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'common';
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return 'contains_email';
  return null;
}

export const PASSWORD_PROBLEM_MESSAGES: Record<PasswordProblem, string> = {
  too_short: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`,
  common: 'This password is too common. Choose another one.',
  contains_email: 'Password must not contain your email name.',
};

/** Shape-only check; `checkPassword` (with the email) runs in the service. */
export const PasswordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);
