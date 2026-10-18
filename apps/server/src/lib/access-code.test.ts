import { CODE_ALPHABET } from '@lk/shared';
import { describe, expect, it } from 'vitest';
import { generateAccessCode } from './access-code';

describe('generateAccessCode', () => {
  it('returns 8 symbols from the unambiguous alphabet', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateAccessCode();
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('skips bytes that would bias the distribution', () => {
    // 248 is the first rejected byte (8 * 31); then bytes 0..7 map to the first 8 symbols.
    let call = 0;
    const fake = (size: number) => {
      call++;
      return call === 1
        ? Buffer.from([248, 255, 0, 1, 2, 3, 4, 5, 6, 7, ...new Array(size - 10).fill(250)])
        : Buffer.alloc(size, 0);
    };
    expect(generateAccessCode(fake)).toBe(CODE_ALPHABET.slice(0, 8));
  });

  it('uses every symbol of the alphabet (sanity check of randomness)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) for (const ch of generateAccessCode()) seen.add(ch);
    expect(seen.size).toBe(CODE_ALPHABET.length);
  });
});
