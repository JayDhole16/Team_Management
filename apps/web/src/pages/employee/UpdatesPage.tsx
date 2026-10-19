import { UPDATE_TEXT_MAX, type MyUpdate } from '@lk/shared';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useReducer, useState, type FormEvent } from 'react';
import { isAiFailure } from '../../api/ai';
import { ApiError } from '../../api/errors';
import { listMyUpdates, previewUpdate, sendUpdate } from '../../api/updates';
import {
  BlockerLines,
  ReadBadge,
  UpdateText,
  useInvalidateUpdates,
} from '../../components/UpdateViews';
import { PlainText } from '../../components/TaskViews';
import {
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Notice,
  PageHeader,
  SelectField,
  Spinner,
  TextAreaField,
} from '../../components/ui';
import { useAiHealth } from '../../hooks/useAiHealth';
import { sortTasks } from '../../lib/tasks';
import { formatDateTime } from '../../lib/time';
import { useMyTasks } from './MyTasksPage';
import {
  buildSendBody,
  initialUpdateDraft,
  updateDraftReducer,
  updateTextError,
} from './updateDraft';

/** E-4: write a technical update, preview the plain version for the owner, send. */
export function UpdatesPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Updates" />
      <SendUpdateForm />
      <PastUpdates />
    </div>
  );
}

function SendUpdateForm() {
  const [draft, dispatch] = useReducer(updateDraftReducer, initialUpdateDraft);
  const [textError, setTextError] = useState<string>();
  const [sentNote, setSentNote] = useState(false);
  const tasks = useMyTasks();
  const ai = useAiHealth();
  const invalidate = useInvalidateUpdates();

  const preview = useMutation({
    mutationFn: (text: string) => previewUpdate(text),
    onSuccess: (result, text) => dispatch({ type: 'previewed', forText: text, result }),
    onError: (err) => {
      if (isAiFailure(err)) dispatch({ type: 'preview-failed' });
    },
  });
  const send = useMutation({
    mutationFn: sendUpdate,
    onSuccess: async () => {
      dispatch({ type: 'sent' });
      preview.reset();
      setSentNote(true);
      await invalidate();
    },
    onError: (err) => {
      // The preview is too old (or the server refused it): show the Preview button again.
      if (err instanceof ApiError && err.code === 'PREVIEW_MISMATCH') {
        dispatch({ type: 'preview-expired' });
      }
    },
  });

  const aiOffline = ai.data !== undefined && ai.data.status !== 'ok';
  const canSendWithout = aiOffline || draft.aiFailed;

  function onPreview(e: FormEvent) {
    e.preventDefault();
    const error = updateTextError(draft.text);
    setTextError(error);
    setSentNote(false);
    if (!error) preview.mutate(draft.text.trim());
  }

  function onSend(withPreview: boolean) {
    const body = buildSendBody(draft, withPreview);
    if (!body) {
      setTextError(updateTextError(draft.text));
      return;
    }
    send.mutate(body);
  }

  // Open tasks first; completed ones can still be linked.
  const taskOptions = sortTasks(tasks.data ?? []);

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Send an update</h2>
      {sentNote && <Notice tone="green">Update sent to the owner.</Notice>}
      {aiOffline && (
        <Notice tone="amber">
          The AI assistant is offline, so no plain version can be made. You can still send your
          update; the owner will see your text as written.
        </Notice>
      )}
      <form onSubmit={onPreview} className="space-y-3" noValidate>
        <TextAreaField
          label="What did you do, what is next, is anything stopping you?"
          hint="Write it the way you would tell a colleague. The owner gets a plain-language version."
          rows={5}
          maxLength={UPDATE_TEXT_MAX}
          value={draft.text}
          disabled={send.isPending}
          error={textError}
          onChange={(e) => {
            dispatch({ type: 'text', value: e.target.value });
            setSentNote(false);
          }}
        />
        <SelectField
          label="Task (optional)"
          value={draft.taskId}
          disabled={send.isPending}
          onChange={(e) => dispatch({ type: 'task', value: e.target.value })}
        >
          <option value="">No task</option>
          {taskOptions.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </SelectField>
        <ErrorBox error={preview.error ?? send.error} />
        {!draft.preview && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={preview.isPending} disabled={aiOffline}>
              Preview plain version
            </Button>
            {canSendWithout && (
              <Button
                variant="secondary"
                loading={send.isPending}
                disabled={preview.isPending}
                onClick={() => onSend(false)}
              >
                Send without plain version
              </Button>
            )}
          </div>
        )}
      </form>
      {draft.preview && (
        <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs font-medium tracking-wide text-blue-900 uppercase">
            What the owner will read
          </p>
          <PlainText text={draft.preview.result.plain} className="text-gray-900" />
          <BlockerLines blockers={draft.preview.result.blockers} />
          <p className="text-xs text-gray-600">
            Not right? Change your text above and preview again.
          </p>
          <Button
            className="w-full sm:w-auto"
            loading={send.isPending}
            onClick={() => onSend(true)}
          >
            Send
          </Button>
        </div>
      )}
    </Card>
  );
}

function PastUpdates() {
  const updates = useInfiniteQuery({
    queryKey: ['my-updates'],
    queryFn: ({ pageParam }) => listMyUpdates(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: 60_000,
  });
  const items = updates.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">My past updates</h2>
      {updates.isPending && <Spinner label="Loading your updates…" />}
      <ErrorBox error={updates.error} />
      {updates.data && items.length === 0 && (
        <EmptyState title="No updates yet">Your sent updates appear here.</EmptyState>
      )}
      <ul className="space-y-3">
        {items.map((u) => (
          <li key={u.id}>
            <PastUpdateCard update={u} />
          </li>
        ))}
      </ul>
      {updates.hasNextPage && (
        <Button
          variant="secondary"
          loading={updates.isFetchingNextPage}
          onClick={() => void updates.fetchNextPage()}
        >
          Show older updates
        </Button>
      )}
    </section>
  );
}

function PastUpdateCard({ update }: { update: MyUpdate }) {
  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-gray-600">
          {formatDateTime(update.createdAt)}
          {update.task && <> · {update.task.title}</>}
        </span>
        <ReadBadge readAt={update.readByOwnerAt} />
      </div>
      <UpdateText update={update} originalLabel="Show what I wrote" />
    </Card>
  );
}
