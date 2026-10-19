import type { UpdatePreview } from '@lk/shared';
import { describe, expect, it } from 'vitest';
import {
  buildSendBody,
  initialUpdateDraft,
  updateDraftReducer,
  updateTextError,
  type UpdateDraft,
  type UpdateDraftAction,
} from './updateDraft';

const result: UpdatePreview = {
  plain: 'The login problem is fixed.',
  blockers: ['Waiting for the server password'],
  previewToken: 'v1.123.abc',
  meta: { model: 'm', promptVersion: 'translate-update@1', attempts: 1, durationMs: 10 },
};

const run = (...actions: UpdateDraftAction[]): UpdateDraft =>
  actions.reduce(updateDraftReducer, initialUpdateDraft);

describe('update draft', () => {
  it('keeps the preview while the text only changes by spaces, drops it on a real edit', () => {
    const previewed = run(
      { type: 'text', value: 'Fixed the JWT bug' },
      { type: 'previewed', forText: 'Fixed the JWT bug', result },
    );
    expect(previewed.preview?.result).toBe(result);
    expect(
      updateDraftReducer(previewed, { type: 'text', value: 'Fixed the JWT bug  ' }).preview,
    ).not.toBeNull();
    expect(
      updateDraftReducer(previewed, { type: 'text', value: 'Fixed the JWT bugs' }).preview,
    ).toBeNull();
  });

  it('ignores a preview that arrives after the text changed', () => {
    const state = run(
      { type: 'text', value: 'Fixed the JWT bug' },
      { type: 'text', value: 'Fixed the JWT bug and the cart' },
      { type: 'previewed', forText: 'Fixed the JWT bug', result },
    );
    expect(state.preview).toBeNull();
  });

  it('remembers an AI failure until a preview works', () => {
    const failed = run({ type: 'text', value: 'Fixed the JWT bug' }, { type: 'preview-failed' });
    expect(failed.aiFailed).toBe(true);
    const ok = updateDraftReducer(failed, {
      type: 'previewed',
      forText: 'Fixed the JWT bug',
      result,
    });
    expect(ok.aiFailed).toBe(false);
  });

  it('sends the preview exactly as received, with the text it was made for', () => {
    const state = run(
      { type: 'text', value: '  Fixed the JWT bug  ' },
      { type: 'task', value: 'task-1' },
      { type: 'previewed', forText: 'Fixed the JWT bug', result },
    );
    expect(buildSendBody(state, true)).toEqual({
      textTechnical: 'Fixed the JWT bug',
      taskId: 'task-1',
      preview: {
        plain: result.plain,
        blockers: result.blockers,
        previewToken: result.previewToken,
      },
    });
  });

  it('without a preview: sends the trimmed text only, never a plain version', () => {
    const state = run({ type: 'text', value: ' Fixed the JWT bug ' });
    expect(buildSendBody(state, true)).toBeNull();
    expect(buildSendBody(state, false)).toEqual({
      textTechnical: 'Fixed the JWT bug',
      taskId: null,
    });
    expect(buildSendBody(run({ type: 'text', value: 'ab' }), false)).toBeNull();
  });

  it('drops a preview the server refused, keeping the text and task', () => {
    const state = run(
      { type: 'text', value: 'Fixed the JWT bug' },
      { type: 'task', value: 'task-1' },
      { type: 'previewed', forText: 'Fixed the JWT bug', result },
      { type: 'preview-expired' },
    );
    expect(state).toMatchObject({ text: 'Fixed the JWT bug', taskId: 'task-1', preview: null });
    expect(state.aiFailed).toBe(false);
  });

  it('starts over after sending', () => {
    const state = run(
      { type: 'text', value: 'Fixed the JWT bug' },
      { type: 'task', value: 'task-1' },
      { type: 'sent' },
    );
    expect(state).toEqual(initialUpdateDraft);
  });

  it('checks the text length', () => {
    expect(updateTextError('  ab ')).toBeDefined();
    expect(updateTextError('abc')).toBeUndefined();
    expect(updateTextError('x'.repeat(3001))).toBeDefined();
  });
});
