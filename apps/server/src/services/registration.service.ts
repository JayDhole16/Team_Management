import {
  checkPassword,
  CONSENT_TEXT,
  CONSENT_VERSION,
  PASSWORD_PROBLEM_MESSAGES,
  type ClaimResponse,
  type ConsentResponse,
  type RegisterCompleteBody,
  type RegisterCompleteResponse,
} from '@lk/shared';
import { randomUUID } from 'node:crypto';
import type { AccessCode } from '../generated/prisma/client';
import { addMinutes, dateOnlyToDb, istDateString } from '../lib/clock';
import { keyedHash, randomToken } from '../lib/crypto';
import { AppError, badRequest, invalidCode } from '../lib/errors';
import { hashPassword } from '../lib/passwords';
import { isUniqueViolation } from '../repositories';
import { hashCode } from './access-code.service';
import { assertCodeAttemptAllowed, failCodeAttempt, type CodeFlow } from './code-attempts';
import type { ServiceContext } from './context';
import { encryptFaceTemplate } from './face-template.service';

const FLOW: CodeFlow = 'claim';

const emailTaken = () =>
  new AppError(
    409,
    'EMAIL_TAKEN',
    'This email is already registered. Contact the owner if you need help.',
  );

export function getConsent(): ConsentResponse {
  return { version: CONSENT_VERSION, text: CONSENT_TEXT };
}

/** Step 1: exchange an INVITE code for a registration token (ACTIVE -> CLAIMED). */
export async function claim(
  ctx: ServiceContext,
  input: { code: string; ip: string },
): Promise<ClaimResponse> {
  assertCodeAttemptAllowed(ctx, FLOW, input.ip);
  const now = ctx.clock();
  const registrationToken = randomToken();
  const claimExpiresAt = addMinutes(now, ctx.env.REGISTRATION_WINDOW_MIN);
  const claimTokenHash = keyedHash(ctx.env.CODE_HASH_SECRET, registrationToken);

  const won = await ctx.data.repos.accessCodes.claimInvite({
    codeHash: hashCode(ctx, input.code),
    now,
    claimTokenHash,
    claimExpiresAt,
  });
  if (won !== 1) return failCodeAttempt(ctx, FLOW, input.ip);

  const code = await ctx.data.repos.accessCodes.findByClaimTokenHash(claimTokenHash);
  if (!code?.deviceMode) throw new Error('Claimed invite has no device mode');
  await ctx.data.repos.audit.record({
    action: 'access_code.claimed',
    entity: 'access_code',
    entityId: code.id,
    meta: { ip: input.ip },
    at: now,
  });

  return {
    registrationToken,
    expiresAt: claimExpiresAt.toISOString(),
    deviceMode: code.deviceMode,
    presetJobRoleId: code.presetJobRoleId,
    jobRoles: await ctx.data.repos.jobRoles.list(),
    faceEnrollmentRequired: ctx.env.FACE_ENROLLMENT_REQUIRED,
  };
}

/** Field checks that do not depend on the database state of the code. */
async function validateDetails(
  ctx: ServiceContext,
  code: AccessCode,
  body: RegisterCompleteBody,
): Promise<void> {
  if (body.consentVersion !== CONSENT_VERSION) {
    throw badRequest(
      'The consent text has changed. Please read it again and accept.',
      'CONSENT_OUTDATED',
    );
  }
  const problem = checkPassword(body.password, body.email);
  if (problem) throw badRequest(PASSWORD_PROBLEM_MESSAGES[problem], 'WEAK_PASSWORD');

  if (code.presetJobRoleId && body.jobRoleId !== code.presetJobRoleId) {
    throw badRequest('The job role was set by the owner and cannot be changed.', 'JOB_ROLE_LOCKED');
  }
  if (!(await ctx.data.repos.jobRoles.findById(body.jobRoleId))) {
    throw badRequest('Unknown job role', 'UNKNOWN_JOB_ROLE');
  }
  if (ctx.env.FACE_ENROLLMENT_REQUIRED && !body.faceTemplate) {
    throw badRequest('The face scan is required to finish registration.', 'FACE_REQUIRED');
  }
  if (await ctx.data.repos.users.findByEmail(body.email)) throw emailTaken();
}

/**
 * Final step: creates the employee in ONE transaction (code USED, user, face template,
 * consent, audit). Any failure leaves nothing behind and the code stays CLAIMED, so the
 * employee can fix the form and retry. A retry after success returns the same result.
 */
export async function complete(
  ctx: ServiceContext,
  body: RegisterCompleteBody,
): Promise<RegisterCompleteResponse> {
  const now = ctx.clock();
  const tokenHash = keyedHash(ctx.env.CODE_HASH_SECRET, body.token);
  const code = await ctx.data.repos.accessCodes.findByClaimTokenHash(tokenHash);
  if (!code || code.purpose !== 'INVITE' || !code.deviceMode) throw invalidCode();

  const replay = replayResult(code);
  if (replay) return replay;
  if (code.status !== 'CLAIMED' || !code.claimExpiresAt || code.claimExpiresAt <= now) {
    throw invalidCode();
  }

  await validateDetails(ctx, code, body);
  const passwordHash = await hashPassword(body.password);
  const deviceMode = code.deviceMode;

  const result = await ctx.data
    .transaction(async (repos) => {
      // Guard against two submits racing: only one can move CLAIMED -> USED.
      if ((await repos.accessCodes.useClaimed({ id: code.id, now })) !== 1) {
        const current = await repos.accessCodes.findById(code.id);
        const again = current && replayResult(current);
        if (again) return { ...again, created: false };
        throw invalidCode();
      }

      // (R) Duplicate-face check against active employees goes here in Phase 9.

      // The id is chosen here so the face template can be bound to it (AES-GCM associated data).
      const userId = randomUUID();
      const user = await repos.users.create({
        id: userId,
        email: body.email,
        name: body.name,
        phone: body.phone,
        emergencyContactName: body.emergencyContactName,
        emergencyContactPhone: body.emergencyContactPhone,
        joiningDate: dateOnlyToDb(istDateString(now)),
        passwordHash,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        jobRoleId: body.jobRoleId,
        // Always the owner's choice from the code; the request cannot carry this field.
        deviceMode,
        ...(body.faceTemplate
          ? {
              faceTemplate: encryptFaceTemplate(
                ctx.env.FACE_ENCRYPTION_KEY,
                userId,
                body.faceTemplate,
              ),
              faceModelVersion: body.faceTemplate.modelVersion,
              faceEnrolledAt: now,
            }
          : {}),
        createdAt: now,
      });
      await repos.consent.create({
        userId: user.id,
        consentVersion: body.consentVersion,
        acceptedAt: now,
      });
      await repos.accessCodes.setRegisteredUser(code.id, user.id);
      await repos.audit.record({
        actorUserId: user.id,
        action: 'access_code.used',
        entity: 'access_code',
        entityId: code.id,
        at: now,
      });
      await repos.audit.record({
        actorUserId: user.id,
        action: 'registration.completed',
        entity: 'user',
        entityId: user.id,
        meta: {
          jobRoleId: body.jobRoleId,
          deviceMode,
          faceEnrolled: Boolean(body.faceTemplate),
          consentVersion: body.consentVersion,
        },
        at: now,
      });
      return { userId: user.id, deviceMode, created: true };
    })
    .catch((err: unknown) => {
      if (isUniqueViolation(err)) throw emailTaken();
      throw err;
    });

  if (result.created) {
    ctx.bus.emit('employee:registered', {
      userId: result.userId,
      name: body.name,
      email: body.email,
      phone: body.phone,
      jobRoleId: body.jobRoleId,
      deviceMode,
      at: now.toISOString(),
    });
  }
  return { userId: result.userId, deviceMode: result.deviceMode };
}

/** A code already USED by this token returns the original result (network-retry safe). */
function replayResult(code: AccessCode): RegisterCompleteResponse | null {
  if (code.status === 'USED' && code.registeredUserId && code.deviceMode) {
    return { userId: code.registeredUserId, deviceMode: code.deviceMode };
  }
  return null;
}
