import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { fetchTodayHours } from '../../api/reports';
import { startSession, stopSession } from '../../api/sessions';
import { useAuth, useUser } from '../../auth/AuthProvider';
import { authSession } from '../../auth/session';
import { Stat } from '../../components/HoursViews';
import { Badge, Button, Card, ErrorBox, Notice, Spinner } from '../../components/ui';
import { useNow } from '../../hooks/useNow';
import { formatClock, formatHours, istDate } from '../../lib/time';
import { nextTask } from '../../lib/tasks';
import { agentRunning, liveTotals, serverNowFrom } from '../../lib/timer';
import { PriorityBadge, TaskStatusBadge } from '../../components/TaskViews';
import { useMyTasks } from './MyTasksPage';

export const MY_TODAY_KEY = ['my-today'] as const;

/**
 * Large session timer with Stop (break) and Resume. The timer is derived from the server's
 * `startedAt` and `serverTime`; a page reload shows the same time.
 */
export function MyDayPage() {
  const user = useUser();
  const queryClient = useQueryClient();
  const { notice } = useAuth().snapshot;
  const today = useQuery({
    queryKey: MY_TODAY_KEY,
    queryFn: () => fetchTodayHours(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const now = useNow();

  const afterChange = () => queryClient.invalidateQueries({ queryKey: MY_TODAY_KEY });
  const stop = useMutation({
    mutationFn: stopSession,
    onSuccess: async () => {
      resume.reset();
      await afterChange();
    },
  });
  const resume = useMutation({
    mutationFn: startSession,
    onSuccess: async () => {
      stop.reset();
      authSession.clearNotice();
      await afterChange();
    },
  });

  // After India midnight "today" is a new day: fetch fresh totals instead of growing old ones.
  const reportDate = today.data?.date;
  const currentDate = today.data
    ? istDate(serverNowFrom(today.data.serverTime, today.dataUpdatedAt, now))
    : undefined;
  const { refetch } = today;
  useEffect(() => {
    if (reportDate && currentDate && reportDate !== currentDate) void refetch();
  }, [reportDate, currentDate, refetch]);

  if (today.isPending) return <Spinner label="Loading your day…" />;
  // A failed background refetch keeps the last data: keep the timer and show a small warning.
  if (!today.data) return <ErrorBox error={today.error} />;

  const report = today.data;
  const totals = liveTotals(report, today.dataUpdatedAt, now);
  const working = totals.sessionSec !== null;
  const serverNowMs = serverNowFrom(report.serverTime, today.dataUpdatedAt, now);
  const agentOk = agentRunning(report.openSession?.lastHeartbeatAt ?? null, serverNowMs);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My Day</h1>
      {notice && <Notice tone="amber">{notice}</Notice>}
      {today.isError && (
        <Notice tone="amber">Could not refresh your hours. Retrying automatically.</Notice>
      )}
      <Card className="text-center">
        <div className="mb-2 flex flex-wrap justify-center gap-2">
          {working ? <Badge tone="green">Working</Badge> : <Badge tone="blue">On break</Badge>}
          {working &&
            (agentOk ? (
              <Badge tone="green">Agent running</Badge>
            ) : (
              <Badge tone="amber">Desktop agent not running</Badge>
            ))}
          {user.faceEnrolled ? (
            <Badge tone="green">Face enrolled</Badge>
          ) : (
            <Badge tone="grey">Face not enrolled yet</Badge>
          )}
        </div>
        <p className="text-sm text-gray-600">
          {working ? 'This session' : 'Your session is stopped'}
        </p>
        <p
          data-testid="session-timer"
          className="my-2 font-mono text-5xl font-bold text-gray-900 tabular-nums"
          aria-live="off"
        >
          {working ? formatClock(totals.sessionSec ?? 0) : '--:--:--'}
        </p>
        <ErrorBox error={stop.error ?? resume.error} />
        <div className="mx-auto mt-3 max-w-xs">
          {working ? (
            <Button
              variant="secondary"
              className="w-full"
              loading={stop.isPending}
              onClick={() => stop.mutate()}
            >
              Stop session (break)
            </Button>
          ) : (
            <Button className="w-full" loading={resume.isPending} onClick={() => resume.mutate()}>
              Resume
            </Button>
          )}
        </div>
        {working && !agentOk && (
          <p className="mt-3 text-xs text-gray-600">
            The desktop agent is not available yet. Your time is still counted while this session is
            open.
          </p>
        )}
      </Card>
      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Today" value={formatHours(totals.todaySec)} />
        <Stat label="This month" value={formatHours(totals.monthSec)} />
      </dl>
      <NextTask />
    </div>
  );
}

/** Shortcut to the task to work on next (docs/SCREENS.md, My Day). */
function NextTask() {
  const tasks = useMyTasks();
  if (!tasks.data) return null;
  const task = nextTask(tasks.data);
  return (
    <Card>
      <h2 className="mb-2 font-semibold">Next task</h2>
      {task ? (
        <Link
          to="/me/tasks"
          className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
        >
          <span className="block font-medium break-words text-gray-900">{task.title}</span>
          <span className="mt-2 flex flex-wrap gap-1">
            <TaskStatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </span>
        </Link>
      ) : (
        <p className="text-sm text-gray-600">
          Nothing waiting.{' '}
          <Link to="/me/tasks" className="text-blue-800 underline">
            See all my tasks
          </Link>
        </p>
      )}
    </Card>
  );
}
