import {
  UPDATE_TEXT_MAX,
  UPDATE_TEXT_MIN,
  type UpdateCreateBody,
  type UpdatePreview,
} from '@lk/shared';

/**
 * The Send update form (E-4): write -> Preview plain version -> Send. What is sent is exactly
 * the preview (decided 2026-10-20), so changing the text afterwards drops the preview. When
 * the AI is offline or the preview failed, the update can go without a plain version.
 */

export interface UpdateDraft {
  text: string;
  /** '' = no task linked. */
  taskId: string;
  /** The preview and the (trimmed) text it was made for. */
  preview: { forText: string; result: UpdatePreview } | null;
  /** The last preview attempt failed because of the AI (offline, too slow, bad answer, busy). */
  aiFailed: boolean;
}

export type UpdateDraftAction =
  | { type: 'text'; value: string }
  | { type: 'task'; value: string }
  | { type: 'previewed'; forText: string; result: UpdatePreview }
  | { type: 'preview-failed' }
  /** The server refused the preview (older than an hour): preview again. */
  | { type: 'preview-expired' }
  | { type: 'sent' };

export const initialUpdateDraft: UpdateDraft = {
  text: '',
  taskId: '',
  preview: null,
  aiFailed: false,
};

export function updateDraftReducer(state: UpdateDraft, action: UpdateDraftAction): UpdateDraft {
  switch (action.type) {
    case 'text': {
      const stale = state.preview !== null && state.preview.forText !== action.value.trim();
      return { ...state, text: action.value, preview: stale ? null : state.preview };
    }
    case 'task':
      return { ...state, taskId: action.value };
    case 'previewed':
      // The text may have changed while the AI was answering.
      if (action.forText !== state.text.trim()) return state;
      return {
        ...state,
        preview: { forText: action.forText, result: action.result },
        aiFailed: false,
      };
    case 'preview-failed':
      return { ...state, preview: null, aiFailed: true };
    case 'preview-expired':
      return { ...state, preview: null };
    case 'sent':
      return initialUpdateDraft;
  }
}

/** A message for the text box, or undefined when the text can be previewed or sent. */
export function updateTextError(text: string): string | undefined {
  const length = text.trim().length;
  if (length < UPDATE_TEXT_MIN) return 'Write what you did, what is next or what is stopping you.';
  if (length > UPDATE_TEXT_MAX) return `Keep it under ${UPDATE_TEXT_MAX} characters.`;
  return undefined;
}

/** The body for Send: with the preview (and its token) unchanged, or without one. */
export function buildSendBody(state: UpdateDraft, withPreview: boolean): UpdateCreateBody | null {
  const taskId = state.taskId || null;
  if (withPreview) {
    if (!state.preview) return null;
    const { plain, blockers, previewToken } = state.preview.result;
    return {
      textTechnical: state.preview.forText,
      taskId,
      preview: { plain, blockers, previewToken },
    };
  }
  if (updateTextError(state.text)) return null;
  return { textTechnical: state.text.trim(), taskId };
}
