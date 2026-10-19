import type { BreakdownResult } from '@lk/shared';
import { describe, expect, it } from 'vitest';
import {
  draftReducer,
  hasErrors,
  hasUnsavedWork,
  initialDraft,
  toCreateBody,
  validateDraft,
  type ProjectDraft,
} from './projectDraft';

const ROLE = '11111111-1111-4111-8111-111111111111';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing test fixture');
  return value;
}

const result = (over: Partial<BreakdownResult> = {}): BreakdownResult => ({
  projectTitle: 'Clothing store',
  technicalSummary: 'Online store with cart.',
  clarifyingQuestions: [],
  tasks: [
    {
      title: 'Cart page',
      description: 'Build the cart.',
      priority: 'HIGH',
      roleKey: 'frontend_developer',
      jobRoleId: ROLE,
      needsReview: false,
    },
    {
      title: 'Promo video',
      description: 'Edit a promo.',
      priority: 'LOW',
      roleKey: null,
      jobRoleId: null,
      needsReview: true,
    },
  ],
  meta: { model: 'm', promptVersion: 'breakdown@1', attempts: 1, durationMs: 10 },
  ...over,
});

const run = (...actions: Parameters<typeof draftReducer>[1][]): ProjectDraft =>
  actions.reduce(draftReducer, initialDraft);

describe('project draft', () => {
  it('loads an AI breakdown as editable tasks', () => {
    const state = run(
      { type: 'brief', value: 'Ek store banao' },
      { type: 'generated', result: result() },
    );
    expect(state).toMatchObject({
      mode: 'ai',
      title: 'Clothing store',
      summary: 'Online store with cart.',
    });
    expect(state.tasks.map((t) => [t.title, t.jobRoleId, t.source, t.needsReview])).toEqual([
      ['Cart page', ROLE, 'AI_BREAKDOWN', false],
      ['Promo video', '', 'AI_BREAKDOWN', true],
    ]);
    expect(new Set(state.tasks.map((t) => t.key)).size).toBe(2);
  });

  it('a vague brief gives questions and no tasks', () => {
    const state = run({
      type: 'generated',
      result: result({ tasks: [], clarifyingQuestions: ['Kis cheez ki website?'] }),
    });
    expect(state.tasks).toEqual([]);
    expect(state.questions).toEqual(['Kis cheez ki website?']);
  });

  it('edits, removes and adds tasks; picking a role clears the review flag', () => {
    let state = run({ type: 'generated', result: result() });
    const cart = must(state.tasks[0]);
    const promo = must(state.tasks[1]);
    state = draftReducer(state, { type: 'task', key: promo.key, patch: { jobRoleId: ROLE } });
    expect(state.tasks[1]?.needsReview).toBe(false);
    state = draftReducer(state, {
      type: 'task',
      key: cart.key,
      patch: { title: 'Cart and checkout' },
    });
    state = draftReducer(state, { type: 'remove-task', key: promo.key });
    state = draftReducer(state, { type: 'add-task' });
    expect(state.tasks.map((t) => [t.title, t.source])).toEqual([
      ['Cart and checkout', 'AI_BREAKDOWN'],
      ['', 'MANUAL'],
    ]);
    expect(state.tasks[1]?.key).not.toBe(promo.key); // keys are never reused
  });

  it('regenerate replaces the earlier draft', () => {
    let state = run({ type: 'generated', result: result() }, { type: 'add-task' });
    state = draftReducer(state, {
      type: 'generated',
      result: result({ projectTitle: 'Store v2', tasks: result().tasks.slice(0, 1) }),
    });
    expect(state.title).toBe('Store v2');
    expect(state.tasks).toHaveLength(1);
  });

  it('manual mode starts with one empty task and keeps an existing draft', () => {
    const manual = run({ type: 'manual' });
    expect(manual.mode).toBe('manual');
    expect(manual.tasks).toHaveLength(1);
    const kept = run({ type: 'generated', result: result() }, { type: 'manual' });
    expect(kept.mode).toBe('ai');
    expect(kept.tasks).toHaveLength(2);
  });

  it('validates before save and builds the request body', () => {
    let state = run({ type: 'manual' });
    const errors = validateDraft(state);
    expect(hasErrors(errors)).toBe(true);
    expect(errors.title).toBeDefined();
    expect(errors.summary).toBeDefined();
    expect(Object.keys(errors.tasks)).toHaveLength(1);

    const key = must(state.tasks[0]).key;
    state = run(
      { type: 'manual' },
      { type: 'field', field: 'title', value: ' Logo refresh ' },
      { type: 'field', field: 'summary', value: 'New logo.' },
      { type: 'task', key, patch: { title: 'Logo', descriptionTechnical: ' 3 options ' } },
    );
    expect(hasErrors(validateDraft(state))).toBe(false);
    expect(toCreateBody(state)).toEqual({
      title: 'Logo refresh',
      briefOriginal: null,
      summaryTechnical: 'New logo.',
      tasks: [
        {
          title: 'Logo',
          descriptionTechnical: '3 options',
          jobRoleId: null,
          priority: 'MEDIUM',
          source: 'MANUAL',
        },
      ],
    });
  });

  it('knows when leaving would lose work', () => {
    expect(hasUnsavedWork(initialDraft)).toBe(false);
    expect(hasUnsavedWork(run({ type: 'brief', value: '  ' }))).toBe(false);
    expect(hasUnsavedWork(run({ type: 'brief', value: 'Ek store' }))).toBe(true);
    expect(hasUnsavedWork(run({ type: 'manual' }))).toBe(true);
  });
});
