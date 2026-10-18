import type { FaceTemplate } from '@lk/shared';
import { decodeDescriptor, decrypt, encodeDescriptor, encrypt } from '../lib/crypto';

/**
 * AES-256-GCM with the user id as associated data: a template copied onto another user's
 * row fails to decrypt.
 */
export function encryptFaceTemplate(
  keyHex: string,
  userId: string,
  template: FaceTemplate,
): Uint8Array<ArrayBuffer> {
  return new Uint8Array(encrypt(keyHex, encodeDescriptor(template.descriptor), userId));
}

/** Throws if the template was tampered with or belongs to another user. */
export function decryptFaceTemplate(keyHex: string, userId: string, stored: Uint8Array): number[] {
  return decodeDescriptor(decrypt(keyHex, Buffer.from(stored), userId));
}
import { hashCode } from './access-code.service';
import { assertCodeAttemptAllowed, failCodeAttempt, type CodeFlow } from './code-attempts';
import type { ServiceContext } from './context';

const FLOW: CodeFlow = 'recovery';

/** Replaces the signed-in employee's face template, authorised by a FACE_RESCAN code. */
export async function rescanFaceTemplate(
  ctx: ServiceContext,
  input: { userId: string; code: string; template: FaceTemplate; ip: string },
): Promise<void> {
  assertCodeAttemptAllowed(ctx, FLOW, input.ip);
  const now = ctx.clock();
  const encrypted = encryptFaceTemplate(ctx.env.FACE_ENCRYPTION_KEY, input.userId, input.template);

  const done = await ctx.data.transaction(async (repos) => {
    const code = await repos.accessCodes.consumeForUser({
      codeHash: hashCode(ctx, input.code),
      purpose: 'FACE_RESCAN',
      targetUserId: input.userId,
      now,
    });
    if (!code) return false;
    // (R) Duplicate-face check against other employees goes here in Phase 9.
    await repos.users.update(input.userId, {
      faceTemplate: encrypted,
      faceModelVersion: input.template.modelVersion,
      faceEnrolledAt: now,
    });
    await repos.audit.record({
      actorUserId: input.userId,
      action: 'face.rescanned',
      entity: 'user',
      entityId: input.userId,
      meta: { accessCodeId: code.id, faceModelVersion: input.template.modelVersion },
      at: now,
    });
    return true;
  });
  if (!done) await failCodeAttempt(ctx, FLOW, input.ip);
}
