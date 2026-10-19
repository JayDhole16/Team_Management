import type { Update } from '@lk/shared';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { listEmployees } from '../../api/employees';
import {
  listUpdates,
  markAllUpdatesRead,
  markUpdateRead,
  type InboxFilter,
} from '../../api/updates';
import { TaskStatusBadge } from '../../components/TaskViews';
import {
  ReadBadge,
  UpdateText,
  useInvalidateUpdates,
  useUnreadUpdates,
} from '../../components/UpdateViews';
import {
  Button,
  Card,
  EmptyState,
  ErrorBox,
  PageHeader,
  SelectField,
  Spinner,
} from '../../components/ui';
import { formatDateTime } from '../../lib/time';

/** O-10: employee updates in plain language; the technical original is one tap away. */
export function UpdatesPage() {
  const [params, setParams] = useSearchParams();
  const filter: InboxFilter = {
    employeeId: params.get('employeeId') ?? undefined,
    unreadOnly: params.get('unread') === '1',
  };
  const setFilter = (next: InboxFilter) => {
    const search = new URLSearchParams();
    if (next.employeeId) search.set('employeeId', next.employeeId);
    if (next.unreadOnly) search.set('unread', '1');
    setParams(search, { replace: true });
  };

  const employees = useQuery({ queryKey: ['employees', {}], queryFn: () => listEmployees() });
  const unread = useUnreadUpdates();
  const updates = useInfiniteQuery({
    queryKey: ['updates', 'inbox', filter],
    queryFn: ({ pageParam }) => listUpdates(filter, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: 30_000,
  });
  const items = updates.data?.pages.flatMap((p) => p.items) ?? [];
  const invalidate = useInvalidateUpdates();

  const markAll = useMutation({
    // Only up to the newest update on screen: one that arrives meanwhile stays unread.
    mutationFn: (upTo: string) => markAllUpdatesRead({ upTo, employeeId: filter.employeeId }),
    onSuccess: invalidate,
  });
  const newest = items[0];
  const unreadShown = items.some((u) => u.readByOwnerAt === null);

  return (
    <div className="space-y-4">
      <PageHeader
        title={unread.data ? `Updates (${unread.data.count} unread)` : 'Updates'}
        actions={
          newest &&
          unreadShown && (
            <Button
              variant="secondary"
              loading={markAll.isPending}
              onClick={() => markAll.mutate(newest.createdAt)}
            >
              Mark all as read
            </Button>
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 md:max-w-2xl">
        <SelectField
          label="Employee"
          value={filter.employeeId ?? ''}
          onChange={(e) => setFilter({ ...filter, employeeId: e.target.value || undefined })}
        >
          <option value="">Everyone</option>
          {(employees.data ?? []).map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </SelectField>
        <label className="flex min-h-11 items-center gap-3 self-end text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={filter.unreadOnly ?? false}
            onChange={(e) => setFilter({ ...filter, unreadOnly: e.target.checked })}
          />
          Unread only
        </label>
      </div>
      {updates.isPending && <Spinner label="Loading updates…" />}
      <ErrorBox error={updates.error ?? markAll.error ?? employees.error} />
      {updates.data && items.length === 0 && (
        <EmptyState title={filter.unreadOnly ? 'No unread updates' : 'No updates yet'}>
          Updates from employees appear here.
        </EmptyState>
      )}
      <ul className="space-y-3">
        {items.map((u) => (
          <li key={u.id}>
            <InboxCard update={u} />
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
    </div>
  );
}

function InboxCard({ update }: { update: Update }) {
  const invalidate = useInvalidateUpdates();
  const read = useMutation({ mutationFn: () => markUpdateRead(update.id), onSuccess: invalidate });
  const isUnread = update.readByOwnerAt === null;
  return (
    <Card className={`space-y-2 ${isUnread ? 'border-l-4 border-l-blue-700' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-words text-gray-900">{update.employeeName}</p>
          <p className="text-xs text-gray-600">{formatDateTime(update.createdAt)}</p>
        </div>
        <ReadBadge readAt={update.readByOwnerAt} />
      </div>
      {update.task && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
          <span className="break-words">Task: {update.task.title}</span>
          <TaskStatusBadge status={update.task.status} />
        </p>
      )}
      <UpdateText update={update} originalLabel="Show original (technical)" />
      <ErrorBox error={read.error} />
      {isUnread && (
        <Button variant="secondary" loading={read.isPending} onClick={() => read.mutate()}>
          Mark as read
        </Button>
      )}
    </Card>
  );
}
