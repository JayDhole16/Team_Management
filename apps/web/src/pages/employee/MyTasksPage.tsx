import {
  BLOCKED_REASON_MAX,
  BLOCKED_REASON_MIN,
  employeeTaskActions,
  TASK_STATUSES,
  type MyTask,
  type TaskStatus,
  type TaskStatusBody,
} from '@lk/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { listMyTasks, setTaskStatus } from '../../api/tasks';
import {
  PlainText,
  PriorityBadge,
  TaskStatusBadge,
  useInvalidateTasks,
} from '../../components/TaskViews';
import {
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Modal,
  Spinner,
  TextAreaField,
} from '../../components/ui';
import { TASK_STATUS } from '../../lib/labels';
import { sortTasks } from '../../lib/tasks';
import { formatDateTime } from '../../lib/time';

export const MY_TASKS_KEY = ['my-tasks'] as const;

export function useMyTasks() {
  return useQuery({ queryKey: MY_TASKS_KEY, queryFn: listMyTasks, refetchInterval: 30_000 });
}

/** E-3: tabs by status; Start, Mark blocked (with a reason), Resume, Complete, Reopen. */
export function MyTasksPage() {
  const [tab, setTab] = useState<TaskStatus>('PENDING');
  const [blocking, setBlocking] = useState<MyTask | null>(null);
  const tasks = useMyTasks();
  const invalidate = useInvalidateTasks();
  const change = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TaskStatusBody }) => setTaskStatus(id, body),
    onSuccess: invalidate,
  });

  const inTab = (status: TaskStatus) =>
    sortTasks((tasks.data ?? []).filter((t) => t.status === status));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My tasks</h1>
      <div role="tablist" aria-label="Task status" className="grid grid-cols-2 gap-2 md:flex">
        {TASK_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={tab === status}
            onClick={() => setTab(status)}
            className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${tab === status ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-300 bg-white text-gray-800'}`}
          >
            {TASK_STATUS[status].label} ({tasks.data ? inTab(status).length : '…'})
          </button>
        ))}
      </div>
      {tasks.isPending && <Spinner label="Loading your tasks…" />}
      <ErrorBox error={tasks.error ?? change.error} />
      {tasks.data && inTab(tab).length === 0 && (
        <EmptyState title={`No ${TASK_STATUS[tab].label.toLowerCase()} tasks`}>
          {tab === 'PENDING' ? 'New tasks from the owner appear here.' : null}
        </EmptyState>
      )}
      <ul role="tabpanel" className="space-y-3">
        {inTab(tab).map((task) => (
          <li key={task.id}>
            <TaskCard
              task={task}
              busy={change.isPending && change.variables.id === task.id}
              onAction={(to) => {
                if (to === 'BLOCKED') setBlocking(task);
                else change.mutate({ id: task.id, body: { status: to } });
              }}
            />
          </li>
        ))}
      </ul>
      <BlockedModal task={blocking} onClose={() => setBlocking(null)} />
    </div>
  );
}

function TaskCard({
  task,
  busy,
  onAction,
}: {
  task: MyTask;
  busy: boolean;
  onAction: (to: TaskStatus) => void;
}) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-semibold break-words text-gray-900">{task.title}</h2>
        <div className="flex flex-wrap gap-1">
          <TaskStatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
        </div>
      </div>
      {task.assignedAt && (
        <p className="text-xs text-gray-500">Assigned {formatDateTime(task.assignedAt)}</p>
      )}
      <PlainText text={task.descriptionTechnical} className="text-sm text-gray-800" />
      {task.status === 'BLOCKED' && task.blockedReason && (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
          Blocked: {task.blockedReason}
        </p>
      )}
      {task.project ? (
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
            Project: {task.project.title}
          </p>
          <PlainText text={task.project.summaryTechnical} className="mt-1 text-sm text-gray-700" />
        </div>
      ) : (
        <p className="text-xs text-gray-500">Direct task from the owner</p>
      )}
      <div className="flex flex-wrap gap-2">
        {employeeTaskActions(task.status).map((action) => (
          <Button
            key={action.key}
            variant={action.key === 'complete' || action.key === 'start' ? 'primary' : 'secondary'}
            disabled={busy}
            onClick={() => onAction(action.to)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function BlockedModal({ task, onClose }: { task: MyTask | null; onClose: () => void }) {
  return (
    <Modal open={task !== null} title="Mark blocked" onClose={onClose}>
      {task && <BlockedForm key={task.id} task={task} onDone={onClose} />}
    </Modal>
  );
}

function BlockedForm({ task, onDone }: { task: MyTask; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const invalidate = useInvalidateTasks();
  const block = useMutation({
    mutationFn: () => setTaskStatus(task.id, { status: 'BLOCKED', reason: reason.trim() }),
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (reason.trim().length < BLOCKED_REASON_MIN) {
      setError('Say what is stopping you, so the owner can help.');
      return;
    }
    setError(undefined);
    block.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <p className="font-medium">{task.title}</p>
      <TextAreaField
        label="What is stopping you?"
        rows={4}
        maxLength={BLOCKED_REASON_MAX}
        value={reason}
        error={error}
        onChange={(e) => setReason(e.target.value)}
      />
      <ErrorBox error={block.error} />
      <Button type="submit" className="w-full" loading={block.isPending}>
        Mark blocked
      </Button>
    </form>
  );
}
