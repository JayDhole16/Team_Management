import type { BreakdownResult, ProjectCreateBody, TaskPriority } from '@lk/shared';

/**
 * The New project page: brief -> AI breakdown (or typed by hand) -> the owner edits the
 * draft -> Save. Nothing is on the server until Save, so this lives in memory only.
 */

export interface DraftTask {
  /** Local key for React lists; never sent. */
  key: number;
  title: string;
  descriptionTechnical: string;
  /** '' = no role. */
  jobRoleId: string;
  priority: TaskPriority;
  source: 'AI_BREAKDOWN' | 'MANUAL';
  /** The AI named a role that does not exist: the owner should pick one. */
  needsReview: boolean;
}

export type DraftTaskPatch = Partial<Omit<DraftTask, 'key' | 'source' | 'needsReview'>>;

export interface ProjectDraft {
  brief: string;
  /** null until the owner pressed Generate (and it worked) or chose to write by hand. */
  mode: null | 'ai' | 'manual';
  title: string;
  summary: string;
  questions: string[];
  tasks: DraftTask[];
  nextKey: number;
}

export type DraftAction =
  | { type: 'brief'; value: string }
  | { type: 'generated'; result: BreakdownResult }
  | { type: 'manual' }
  | { type: 'field'; field: 'title' | 'summary'; value: string }
  | { type: 'task'; key: number; patch: DraftTaskPatch }
  | { type: 'remove-task'; key: number }
  | { type: 'add-task' };

export const initialDraft: ProjectDraft = {
  brief: '',
  mode: null,
  title: '',
  summary: '',
  questions: [],
  tasks: [],
  nextKey: 1,
};

const emptyTask = (key: number): DraftTask => ({
  key,
  title: '',
  descriptionTechnical: '',
  jobRoleId: '',
  priority: 'MEDIUM',
  source: 'MANUAL',
  needsReview: false,
});

export function draftReducer(state: ProjectDraft, action: DraftAction): ProjectDraft {
  switch (action.type) {
    case 'brief':
      return { ...state, brief: action.value };
    case 'generated': {
      // A new answer replaces the earlier draft (the page asks before that).
      const { result } = action;
      const tasks = result.tasks.map((t, i): DraftTask => ({
        key: state.nextKey + i,
        title: t.title,
        descriptionTechnical: t.description,
        jobRoleId: t.jobRoleId ?? '',
        priority: t.priority,
        source: 'AI_BREAKDOWN',
        needsReview: t.needsReview,
      }));
      return {
        ...state,
        mode: 'ai',
        title: result.projectTitle,
        summary: result.technicalSummary,
        questions: result.clarifyingQuestions,
        tasks,
        nextKey: state.nextKey + tasks.length,
      };
    }
    case 'manual':
      // Keep anything already there (e.g. the AI failed on a regenerate).
      if (state.mode !== null) return { ...state, mode: state.mode };
      return {
        ...state,
        mode: 'manual',
        tasks: [emptyTask(state.nextKey)],
        nextKey: state.nextKey + 1,
      };
    case 'field':
      return { ...state, [action.field]: action.value };
    case 'task':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.key === action.key
            ? {
                ...t,
                ...action.patch,
                // Picking a role answers the "check the role" flag.
                needsReview: action.patch.jobRoleId !== undefined ? false : t.needsReview,
              }
            : t,
        ),
      };
    case 'remove-task':
      return { ...state, tasks: state.tasks.filter((t) => t.key !== action.key) };
    case 'add-task':
      return {
        ...state,
        tasks: [...state.tasks, emptyTask(state.nextKey)],
        nextKey: state.nextKey + 1,
      };
  }
}

/** Something would be lost by leaving the page. */
export function hasUnsavedWork(state: ProjectDraft): boolean {
  return state.mode !== null || state.brief.trim().length > 0;
}

export interface DraftErrors {
  title?: string;
  summary?: string;
  /** By task key. */
  tasks: Record<number, { title?: string; descriptionTechnical?: string }>;
}

export function validateDraft(state: ProjectDraft): DraftErrors {
  const errors: DraftErrors = { tasks: {} };
  if (state.title.trim().length < 2) errors.title = 'Give the project a name.';
  if (!state.summary.trim())
    errors.summary = 'Write a short summary. Employees see it with each task.';
  for (const task of state.tasks) {
    const e: { title?: string; descriptionTechnical?: string } = {};
    if (task.title.trim().length < 2) e.title = 'Give the task a title.';
    if (!task.descriptionTechnical.trim()) e.descriptionTechnical = 'Describe the task.';
    if (e.title || e.descriptionTechnical) errors.tasks[task.key] = e;
  }
  return errors;
}

export function hasErrors(errors: DraftErrors): boolean {
  return Boolean(errors.title || errors.summary || Object.keys(errors.tasks).length > 0);
}

export function toCreateBody(state: ProjectDraft): ProjectCreateBody {
  return {
    title: state.title.trim(),
    briefOriginal: state.brief.trim() || null,
    summaryTechnical: state.summary.trim(),
    tasks: state.tasks.map((t) => ({
      title: t.title.trim(),
      descriptionTechnical: t.descriptionTechnical.trim(),
      jobRoleId: t.jobRoleId || null,
      priority: t.priority,
      source: t.source,
    })),
  };
}
