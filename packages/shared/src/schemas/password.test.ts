import { describe, expect, it } from 'vitest';
import { checkPassword } from './password';

describe('checkPassword', () => {
  it('accepts a long, uncommon password', () => {
    expect(checkPassword('Mango-River-Lamp-73', 'rahul@example.com')).toBeNull();
  });

  it('requires at least 10 characters', () => {
    expect(checkPassword('Short1!xy')).toBe('too_short');
  });

  it('rejects very long passwords', () => {
    expect(checkPassword('a'.repeat(129))).toBe('too_long');
  });

  it('rejects common passwords case-insensitively', () => {
    expect(checkPassword('Password123')).toBe('common');
    expect(checkPassword('QWERTYUIOP')).toBe('common');
  });

  it('rejects passwords containing the email name', () => {
    expect(checkPassword('rahul-is-great-2026', 'Rahul@example.com')).toBe('contains_email');
  });
});
