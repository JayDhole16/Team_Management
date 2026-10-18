import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/** Keyed hash for values we must look up but never store in plain form (codes, tokens). */
export function keyedHash(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/** URL-safe random token with 256 bits of entropy by default. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function aesKey(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');
  return key;
}

/**
 * AES-256-GCM. Output layout: iv (12) | auth tag (16) | ciphertext.
 * `aad` (associated data, e.g. the owner's user id) is authenticated but not stored;
 * decrypt must be given the same value.
 */
export function encrypt(keyHex: string, plaintext: Buffer, aad = ''): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', aesKey(keyHex), iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/** Throws if the data was tampered with, the key is wrong or the aad differs. */
export function decrypt(keyHex: string, payload: Buffer, aad = ''): Buffer {
  if (payload.length < IV_LENGTH + TAG_LENGTH) throw new Error('Encrypted payload too short');
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', aesKey(keyHex), iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Face descriptors are stored as little-endian float32 before encryption. */
export function encodeDescriptor(descriptor: readonly number[]): Buffer {
  const buf = Buffer.alloc(descriptor.length * 4);
  descriptor.forEach((value, i) => buf.writeFloatLE(value, i * 4));
  return buf;
}

export function decodeDescriptor(buf: Buffer): number[] {
  const out: number[] = [];
  for (let offset = 0; offset + 4 <= buf.length; offset += 4) out.push(buf.readFloatLE(offset));
  return out;
}
