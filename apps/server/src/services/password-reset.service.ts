import {
  checkPassword,
  PASSWORD_PROBLEM_MESSAGES,
  type PasswordResetCompleteBody,
} from '@lk/shared';
import { badRequest } from '../lib/errors';
import { hashPassword } from '../lib/passwords';
import { hashCode } from './access-code.service';
import { assertCodeAttemptAllowed, failCodeAttempt, type CodeFlow } from './code-attempts';
import type { ServiceContext } from './context';

const FLOW: CodeFlow = 'recovery';
const DUMMY_ID = '00000000-0000-4000-8000-000000000000';

/**
 * Employee sets a new password with an owner-issued PASSWORD_RESET code (no email server).
 * Unknown email, wrong code, expired code: all the same generic error.
 */
export async function completePasswordReset(
  ctx: ServiceContext,
  input: PasswordResetCompleteBody & { ip: string },
): Promise<void> {
  assertCodeAttemptAllowed(ctx, FLOW, input.ip);
  // The password rule does not depend on the code, so checking it first reveals nothing.
  const problem = checkPassword(input.newPassword, input.email);
  if (problem) throw badRequest(PASSWORD_PROBLEM_MESSAGES[problem], 'WEAK_PASSWORD');

  const user = await ctx.data.repos.users.findByEmail(input.email);
  if (!user || user.role !== 'EMPLOYEE' || user.status !== 'ACTIVE') {
    // Same argon2 work and a similar DB round trip as the real path, so timing does not
    // reveal which emails exist.
    await hashPassword(input.newPassword);
    await ctx.data.repos.accessCodes.findById(DUMMY_ID);
    return failCodeAttempt(ctx, FLOW, input.ip);
  }

  const now = ctx.clock();
  const passwordHash = await hashPassword(input.newPassword);
  const done = await ctx.data.transaction(async (repos) => {
    const code = await repos.accessCodes.consumeForUser({
      codeHash: hashCode(ctx, input.code),
      purpose: 'PASSWORD_RESET',
      targetUserId: user.id,
      now,
    });
    if (!code) return false;
    await repos.users.update(user.id, { passwordHash });
    // Every existing login ends; the employee signs in again with the new password.
    await repos.refreshTokens.revokeAllForUser(user.id, now);
    await repos.audit.record({
      actorUserId: user.id,
      action: 'auth.password_reset',
      entity: 'user',
      entityId: user.id,
      meta: { accessCodeId: code.id },
      at: now,
    });
    return true;
  });
  if (!done) await failCodeAttempt(ctx, FLOW, input.ip);
}
