import { describe, expect, it } from 'vitest';
import {
  BreakdownBodySchema,
  BreakdownLlmOutputSchema,
  TranslateTaskBodySchema,
  TranslateUpdateBodySchema,
  TranslateUpdateLlmOutputSchema,
} from './ai';

describe('ai request bodies', () => {
  it('trims the brief and enforces its length', () => {
    expect(BreakdownBodySchema.parse({ brief: '  Ek landing page banao  ' })).toEqual({
      brief: 'Ek landing page banao',
    });
    expect(BreakdownBodySchema.safeParse({ brief: 'short' }).success).toBe(false);
    expect(BreakdownBodySchema.safeParse({ brief: 'x'.repeat(3001) }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(BreakdownBodySchema.safeParse({ brief: 'a'.repeat(20), model: 'x' }).success).toBe(
      false,
    );
    expect(TranslateUpdateBodySchema.safeParse({ text: 'Fixed it', lang: 'x' }).success).toBe(
      false,
    );
  });

  it('allows a missing or null job role on translate-task, but not a non-uuid', () => {
    expect(TranslateTaskBodySchema.safeParse({ text: 'Logo badlo' }).success).toBe(true);
    expect(TranslateTaskBodySchema.safeParse({ text: 'Logo badlo', jobRoleId: null }).success).toBe(
      true,
    );
    expect(
      TranslateTaskBodySchema.safeParse({ text: 'Logo badlo', jobRoleId: 'frontend' }).success,
    ).toBe(false);
  });
});

describe('LLM output schemas', () => {
  const task = { title: 'Build cart', description: 'Cart API', roleKey: 'x', priority: 'HIGH' };

  it('accepts a valid breakdown and a vague one (no tasks, questions only)', () => {
    const base = { projectTitle: 'Store', technicalSummary: 'An online store' };
    expect(
      BreakdownLlmOutputSchema.safeParse({ ...base, clarifyingQuestions: [], tasks: [task] })
        .success,
    ).toBe(true);
    expect(
      BreakdownLlmOutputSchema.safeParse({
        ...base,
        clarifyingQuestions: ['What business?'],
        tasks: [],
      }).success,
    ).toBe(true);
  });

  it('rejects a wrong priority, empty strings and missing fields', () => {
    const base = { projectTitle: 'Store', technicalSummary: 'x', clarifyingQuestions: [] };
    expect(
      BreakdownLlmOutputSchema.safeParse({ ...base, tasks: [{ ...task, priority: 'URGENT' }] })
        .success,
    ).toBe(false);
    expect(
      BreakdownLlmOutputSchema.safeParse({ ...base, tasks: [{ ...task, title: '  ' }] }).success,
    ).toBe(false);
    expect(TranslateUpdateLlmOutputSchema.safeParse({ plain: 'Done' }).success).toBe(false);
  });

  it('drops extra keys the model invents instead of passing them on', () => {
    const parsed = TranslateUpdateLlmOutputSchema.parse({
      plain: 'Done',
      blockers: [],
      html: '<b>x</b>',
    });
    expect(parsed).toEqual({ plain: 'Done', blockers: [] });
  });
});
