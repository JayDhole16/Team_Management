import { describe, expect, it } from 'vitest';
import { stripUnsafeChars } from './common';
import {
  MarkAllReadBodySchema,
  UPDATE_TEXT_MAX,
  UpdateCreateBodySchema,
  UpdateListQuerySchema,
  UpdatePreviewBodySchema,
} from './updates';

const id = '3f1c2a9e-7b4d-4c1e-9a2b-5d6e7f8a9b0c';
const preview = { plain: 'Login page is done.', blockers: [], previewToken: 'v1.1.abc' };

describe('update bodies', () => {
  it('trims the text and enforces the length limits', () => {
    expect(UpdatePreviewBodySchema.parse({ textTechnical: '  Fixed the API  ' })).toEqual({
      textTechnical: 'Fixed the API',
    });
    expect(UpdatePreviewBodySchema.safeParse({ textTechnical: 'ab' }).success).toBe(false);
    expect(
      UpdatePreviewBodySchema.safeParse({ textTechnical: 'x'.repeat(UPDATE_TEXT_MAX + 1) }).success,
    ).toBe(false);
  });

  it('refuses control and bidi characters in the technical text', () => {
    expect(UpdatePreviewBodySchema.safeParse({ textTechnical: 'abc\u0000def' }).success).toBe(
      false,
    );
    expect(UpdatePreviewBodySchema.safeParse({ textTechnical: 'abc\u202Edef' }).success).toBe(
      false,
    );
    expect(UpdatePreviewBodySchema.safeParse({ textTechnical: 'line 1\nline 2' }).success).toBe(
      true,
    );
  });

  it('accepts an update with or without a preview and a task link', () => {
    expect(UpdateCreateBodySchema.safeParse({ textTechnical: 'Fixed the API' }).success).toBe(true);
    expect(
      UpdateCreateBodySchema.safeParse({ textTechnical: 'Fixed the API', taskId: id, preview })
        .success,
    ).toBe(true);
    expect(
      UpdateCreateBodySchema.safeParse({ textTechnical: 'Fixed the API', taskId: null }).success,
    ).toBe(true);
  });

  it('refuses a half preview and unknown fields', () => {
    const { previewToken: _token, ...noToken } = preview;
    expect(
      UpdateCreateBodySchema.safeParse({ textTechnical: 'Fixed the API', preview: noToken })
        .success,
    ).toBe(false);
    expect(
      UpdateCreateBodySchema.safeParse({
        textTechnical: 'Fixed the API',
        preview: { ...preview, extra: 1 },
      }).success,
    ).toBe(false);
    expect(
      UpdateCreateBodySchema.safeParse({ textTechnical: 'Fixed the API', employeeId: id }).success,
    ).toBe(false);
  });
});

describe('update queries', () => {
  it('parses the inbox filters from query strings', () => {
    expect(UpdateListQuerySchema.parse({ unread: 'true', limit: '20', employeeId: id })).toEqual({
      unread: true,
      limit: 20,
      employeeId: id,
    });
    expect(UpdateListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(UpdateListQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
    expect(UpdateListQuerySchema.safeParse({ unread: 'yes' }).success).toBe(false);
  });

  it('needs an upTo time to mark all as read', () => {
    expect(MarkAllReadBodySchema.safeParse({}).success).toBe(false);
    expect(MarkAllReadBodySchema.safeParse({ upTo: '2026-10-20T10:00:00.000Z' }).success).toBe(
      true,
    );
  });
});

describe('stripUnsafeChars', () => {
  it('removes every unsafe character and keeps newlines', () => {
    expect(stripUnsafeChars('a\u0000b\u202Ec\u2066d\ne')).toBe('abcd\ne');
  });

  it('removes invisible marks and lone surrogates, keeps ZWJ, Hindi and emoji', () => {
    expect(stripUnsafeChars('a\u200Eb\u200Bc\uFEFFd\u2028e\u061Cf')).toBe('abcdef');
    expect(stripUnsafeChars('x\uD800y\uDC00z')).toBe('xyz');
    const hindi = 'काम पूरा हुआ';
    const family = '👨\u200D👩\u200D👧';
    expect(stripUnsafeChars(`${hindi} ${family} क्\u200Cष`)).toBe(`${hindi} ${family} क्\u200Cष`);
  });
});
