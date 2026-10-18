import { describe, expect, it } from 'vitest';
import {
  decodeDescriptor,
  decrypt,
  encodeDescriptor,
  encrypt,
  keyedHash,
  randomToken,
} from './crypto';

const KEY = 'a1'.repeat(32);

describe('keyedHash', () => {
  it('is deterministic for the same secret and value', () => {
    expect(keyedHash('s1', 'K7M4Q9XB')).toBe(keyedHash('s1', 'K7M4Q9XB'));
  });

  it('changes with the secret, so a leaked DB alone cannot be brute-forced offline', () => {
    expect(keyedHash('s1', 'K7M4Q9XB')).not.toBe(keyedHash('s2', 'K7M4Q9XB'));
  });

  it('never contains the input', () => {
    expect(keyedHash('s1', 'K7M4Q9XB')).not.toContain('K7M4Q9XB');
  });
});

describe('randomToken', () => {
  it('is url-safe and unique', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });
});

describe('AES-256-GCM', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const plain = Buffer.from('face template bytes');
    const a = encrypt(KEY, plain);
    const b = encrypt(KEY, plain);
    expect(a.equals(b)).toBe(false);
    expect(decrypt(KEY, a).toString()).toBe('face template bytes');
    expect(a.includes(plain)).toBe(false);
  });

  it('detects tampering', () => {
    const payload = encrypt(KEY, Buffer.from('x'.repeat(32)));
    payload[payload.length - 1] = (payload[payload.length - 1] ?? 0) ^ 0xff;
    expect(() => decrypt(KEY, payload)).toThrow();
  });

  it('fails with the wrong key', () => {
    const payload = encrypt(KEY, Buffer.from('secret'));
    expect(() => decrypt('b2'.repeat(32), payload)).toThrow();
  });

  it('binds the ciphertext to its associated data (a template copied to another user fails)', () => {
    const payload = encrypt(KEY, Buffer.from('template'), 'user-a');
    expect(decrypt(KEY, payload, 'user-a').toString()).toBe('template');
    expect(() => decrypt(KEY, payload, 'user-b')).toThrow();
  });
});

describe('descriptor encoding', () => {
  it('round-trips float32 values', () => {
    const values = [0.5, -1.25, 0, 3.75];
    expect(decodeDescriptor(encodeDescriptor(values))).toEqual(values);
  });
});
