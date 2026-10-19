import { LLM_UNAVAILABLE_MESSAGE, type TaskPriority } from '@lk/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useReducer, useRef, useState, type Dispatch } from 'react';
import { Link, useBlocker, useNavigate } from 'react-router';
import { breakdownBrief, isAiFailure } from '../../../api/ai';
import { listJobRoles } from '../../../api/jobRoles';
import { createProject } from '../../../api/projects';
import { PlainText, useInvalidateTasks } from '../../../components/TaskViews';
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Field,
  Notice,
  PageHeader,
  SelectField,
  Spinner,
  TextAreaField,
} from '../../../components/ui';
import { useAiHealth } from '../../../hooks/useAiHealth';
import { PRIORITY_OPTIONS } from '../../../lib/labels';
import {
  draftReducer,
  hasErrors,
  hasUnsavedWork,
  initialDraft,
  toCreateBody,
  validateDraft,
  type DraftAction,
  type DraftErrors,
  type DraftTask,
  type DraftTaskPatch,
  type ProjectDraft,
} from './projectDraft';

/**
 * O-1: the owner describes the project in their own words, the AI suggests a summary and
 * tasks, the owner edits them and saves. Works without the AI: "Write it by hand".
 */
export function NewProjectPage() {
  const [draft, dispatch] = useReducer(draftReducer, initialDraft);
  const [errors, setErrors] = useState<DraftErrors | null>(null);
  const navigate = useNavigate();
  const invalidate = useInvalidateTasks();
  const ai = useAiHealth();
  const roles = useQuery({ queryKey: ['job-roles'], queryFn: listJobRoles });
  const aiOffline = ai.data !== undefined && ai.data.status !== 'ok';

  const generate = useMutation({
    mutationFn: () => breakdownBrief(draft.brief.trim()),
    onSuccess: (result) => {
      setErrors(null);
      dispatch({ type: 'generated', result });
    },
  });

  // Saving navigates away on purpose: no "unsaved work" question then.
  const leavingAfterSave = useRef(false);
  const save = useMutation({
    mutationFn: () => createProject(toCreateBody(draft)),
    onSuccess: async (project) => {
      leavingAfterSave.current = true;
      await invalidate();
      await navigate(`/owner/projects/${project.id}`);
    },
  });

  const unsaved = hasUnsavedWork(draft);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);
  const blocker = useBlocker(() => unsaved && !leavingAfterSave.current);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Leave this page? The project is not saved yet.')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  const briefTooShort = draft.brief.trim().length < 10;

  function onGenerate() {
    if (
      draft.mode !== null &&
      !window.confirm(
        'Ask the AI again? This replaces the summary and tasks below, including your edits.',
      )
    ) {
      return;
    }
    generate.mutate();
  }

  function onSave() {
    const found = validateDraft(draft);
    setErrors(found);
    if (!hasErrors(found)) save.mutate();
  }

  return (
    <div className="space-y-4">
      <Link
        to="/owner/projects"
        className="inline-flex min-h-11 items-center text-sm text-blue-800"
      >
        ‹ All projects
      </Link>
      <PageHeader title="New project" />

      <Card className="space-y-3">
        <TextAreaField
          label="Describe the project in your own words"
          hint="Hindi, English or Hinglish. Say what you want made, for whom, and anything important (deadline, pages, style)."
          rows={7}
          maxLength={3000}
          value={draft.brief}
          onChange={(e) => dispatch({ type: 'brief', value: e.target.value })}
        />
        {aiOffline && <Notice tone="amber">{LLM_UNAVAILABLE_MESSAGE}</Notice>}
        {generate.isPending && (
          <Spinner label="The AI is reading your description… this can take up to a minute." />
        )}
        {generate.error && (
          <ErrorBox error={generate.error}>
            {isAiFailure(generate.error) && draft.mode === null && (
              <span className="mt-1 block">
                Press “Write it by hand” to continue without the AI.
              </span>
            )}
          </ErrorBox>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onGenerate} disabled={briefTooShort} loading={generate.isPending}>
            {draft.mode === 'ai' ? 'Generate again' : 'Generate tasks with AI'}
          </Button>
          {draft.mode === null && (
            <Button variant="secondary" onClick={() => dispatch({ type: 'manual' })}>
              Write it by hand
            </Button>
          )}
        </div>
        {briefTooShort && draft.brief.length > 0 && (
          <p className="text-xs text-gray-600">
            Write a little more (at least 10 letters) to use the AI.
          </p>
        )}
      </Card>

      {draft.mode !== null && (
        <DraftEditor draft={draft} dispatch={dispatch} errors={errors} roles={roles.data ?? []} />
      )}

      {draft.mode !== null && (
        <Card className="space-y-3">
          {errors && hasErrors(errors) && (
            <ErrorBox error="Some fields need attention (marked in red above)." />
          )}
          <ErrorBox error={save.error} />
          <Button className="w-full md:w-auto" loading={save.isPending} onClick={onSave}>
            Save project
          </Button>
          <p className="text-xs text-gray-600">
            Nothing is sent to employees yet. After saving, assign each task from the project page.
          </p>
        </Card>
      )}
    </div>
  );
}

function DraftEditor({
  draft,
  dispatch,
  errors,
  roles,
}: {
  draft: ProjectDraft;
  dispatch: Dispatch<DraftAction>;
  errors: DraftErrors | null;
  roles: { id: string; label: string }[];
}) {
  return (
    <>
      {draft.questions.length > 0 && (
        <Card className="space-y-2 border-amber-300 bg-amber-50">
          <h2 className="font-semibold text-amber-900">The AI needs more details</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
            {draft.questions.map((q, i) => (
              <li key={i}>
                <PlainText text={q} />
              </li>
            ))}
          </ul>
          <p className="text-sm text-amber-900">
            Add the answers to your description and press “Generate again”, or add tasks by hand
            below.
          </p>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">Project</h2>
        <Field
          label="Project name"
          value={draft.title}
          maxLength={200}
          error={errors?.title}
          onChange={(e) => dispatch({ type: 'field', field: 'title', value: e.target.value })}
        />
        <TextAreaField
          label="Summary for employees"
          hint="Employees see this summary with every task of the project."
          rows={5}
          maxLength={4000}
          value={draft.summary}
          error={errors?.summary}
          onChange={(e) => dispatch({ type: 'field', field: 'summary', value: e.target.value })}
        />
      </Card>

      <section className="space-y-3" aria-label="Tasks">
        <h2 className="font-semibold">Tasks ({draft.tasks.length})</h2>
        {draft.tasks.length === 0 && (
          <p className="text-sm text-gray-600">No tasks yet. Add one below.</p>
        )}
        {draft.tasks.map((task, index) => (
          <DraftTaskCard
            key={task.key}
            number={index + 1}
            task={task}
            dispatch={dispatch}
            errors={errors?.tasks[task.key]}
            roles={roles}
          />
        ))}
        <Button variant="secondary" onClick={() => dispatch({ type: 'add-task' })}>
          Add a task
        </Button>
      </section>
    </>
  );
}

function DraftTaskCard({
  number,
  task,
  dispatch,
  errors,
  roles,
}: {
  number: number;
  task: DraftTask;
  dispatch: Dispatch<DraftAction>;
  errors: { title?: string; descriptionTechnical?: string } | undefined;
  roles: { id: string; label: string }[];
}) {
  const update = (patch: DraftTaskPatch) => dispatch({ type: 'task', key: task.key, patch });

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Task {number}</h3>
        <div className="flex items-center gap-2">
          {task.needsReview && <Badge tone="amber">Check the role</Badge>}
          <Button
            variant="ghost"
            aria-label={`Remove task ${number}`}
            onClick={() => dispatch({ type: 'remove-task', key: task.key })}
          >
            Remove
          </Button>
        </div>
      </div>
      <Field
        label="Task title"
        value={task.title}
        maxLength={200}
        error={errors?.title}
        onChange={(e) => update({ title: e.target.value })}
      />
      <TextAreaField
        label="Task description"
        rows={4}
        maxLength={4000}
        value={task.descriptionTechnical}
        error={errors?.descriptionTechnical}
        onChange={(e) => update({ descriptionTechnical: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Role"
          value={task.jobRoleId}
          onChange={(e) => update({ jobRoleId: e.target.value })}
        >
          <option value="">No role</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Priority"
          value={task.priority}
          onChange={(e) => update({ priority: e.target.value as TaskPriority })}
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </SelectField>
      </div>
    </Card>
  );
}
