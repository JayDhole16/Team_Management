import { randomBytes } from 'node:crypto';
import { CODE_ALPHABET, CODE_LENGTH } from '@lk/shared';

// Largest multiple of the alphabet size that fits in a byte; bytes above it are discarded
// so every symbol is equally likely (no modulo bias).
const ACCEPT_BELOW = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;

/** 8 crypto-random symbols from the unambiguous alphabet, e.g. `K7M4Q9XB`. */
export function generateAccessCode(random: (size: number) => Buffer = randomBytes): string {
  let code = '';
  while (code.length < CODE_LENGTH) {
    for (const byte of random(CODE_LENGTH * 2)) {
      if (byte >= ACCEPT_BELOW) continue;
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === CODE_LENGTH) break;
    }
  }
  return code;
}
