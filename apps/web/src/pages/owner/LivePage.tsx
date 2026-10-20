import { IDLE_REASON_LABELS, type LiveEmployee } from '@lk/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { listAlerts } from '../../api/alerts';
import { AlertCard, SoundPanel, useLive, useOpenAlertCount } from '../../components/AlertViews';
import {
  Badge,
  Card,
  EmptyState,
  ErrorBox,
  Notice,
  PageHeader,
  Spinner,
} from '../../components/ui';
import { useNow } from '../../hooks/useNow';
import {
  agentMissing,
  countByStatus,
  grownSinceLoad,
  LIVE_STATUS,
  LIVE_STATUS_ORDER,
  lastSeenText,
  sortLive,
} from '../../lib/liveStatus';
import { elapsedSec, serverNowFrom } from '../../lib/timer';
import { formatClock, formatHours, formatTime } from '../../lib/time';
import { useRealtimeConnected } from '../../realtime/RealtimeProvider';
import { ALERTS_KEY } from '../../realtime/effects';

const OPEN_PANEL_LIMIT = 5;

/** O-6: one card per employee, newest status from Socket.IO; idle employees first. */
export function LivePage() {
  const live = useLive();
  const connected = useRealtimeConnected();
  const openCount = useOpenAlertCount();
  const openAlerts = useQuery({
    queryKey: [ALERTS_KEY[0], 'open-panel'],
    queryFn: () => listAlerts({ openOnly: true, limit: OPEN_PANEL_LIMIT }),
  });
  const now = useNow();
  const serverNow = live.data ? serverNowFrom(live.data.serverTime, live.dataUpdatedAt, now) : now;
  const grown = live.data ? grownSinceLoad(live.data.serverTime, serverNow) : 0;
  const employees = live.data ? sortLive(live.data.employees) : [];
  const counts = countByStatus(employees);

  return (
    <div className="space-y-4">
      <PageHeader title="Live status" />
      {!connected && live.data && (
        <Notice tone="grey">
          Live updates paused. Reconnecting… (the page still refreshes every 30 s)
        </Notice>
      )}
      <dl
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:max-w-2xl"
        aria-label="Employees by status"
      >
        {LIVE_STATUS_ORDER.map((status) => (
          <div key={status} className="rounded-lg border border-gray-200 bg-white p-3">
            <dt className="text-xs text-gray-600">{LIVE_STATUS[status].label}</dt>
            <dd
              className="mt-1 text-lg font-semibold text-gray-900"
              data-testid={`count-${status}`}
            >
              {live.data ? counts[status] : '…'}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 lg:grid-cols-2">
        <SoundPanel />
        <Card className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">
              Open alerts{openCount.data ? ` (${openCount.data.count})` : ''}
            </h2>
            <Link
              to="/owner/alerts"
              className="inline-flex min-h-11 items-center text-sm text-blue-800"
            >
              All alerts
            </Link>
          </div>
          {openAlerts.data?.items.length === 0 && (
            <p className="text-sm text-gray-600">No open alerts.</p>
          )}
          <ul className="space-y-2">
            {openAlerts.data?.items.map((a) => (
              <li key={a.id}>
                <AlertCard alert={a} />
              </li>
            ))}
          </ul>
          <ErrorBox error={openAlerts.error} />
        </Card>
      </div>
      {live.isPending && <Spinner label="Loading live status…" />}
      <ErrorBox error={live.error ?? openCount.error} />
      {live.data && employees.length === 0 && (
        <EmptyState title="No active employees yet">
          Add an employee from the Employees page; they appear here once registered.
        </EmptyState>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {employees.map((e) => (
          <li key={e.userId}>
            <LiveCard employee={e} serverNow={serverNow} grown={grown} now={now} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function LiveCard({
  employee: e,
  serverNow,
  grown,
  now,
}: {
  employee: LiveEmployee;
  serverNow: number;
  grown: number;
  now: number;
}) {
  const missing = agentMissing(e);
  const status = LIVE_STATUS[e.status];
  return (
    <Link
      to={`/owner/employees/${e.userId}`}
      data-testid="live-card"
      data-status={e.status}
      className={`block rounded-xl border bg-white p-3 shadow-sm ${missing ? 'border-red-400 ring-1 ring-red-400' : 'border-gray-200'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-words text-gray-900">{e.name}</p>
          <p className="text-sm text-gray-600">{e.jobRole ?? 'No role'}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      {missing && <p className="mt-2 text-sm font-medium text-red-800">Agent not running</p>}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-gray-600">Session</dt>
        <dd className="font-mono text-gray-900">
          {e.session ? formatClock(elapsedSec(e.session.startedAt, serverNow)) : '—'}
        </dd>
        <dt className="text-gray-600">Today</dt>
        <dd className="text-gray-900">{formatHours(e.todaySec + (e.session ? grown : 0))}</dd>
        <dt className="text-gray-600">Last seen</dt>
        <dd className="text-gray-900">{lastSeenText(e.lastSeenAt, now)}</dd>
        {e.lastIdle && (
          <>
            <dt className="text-gray-600">Last idle</dt>
            <dd className="text-gray-900">
              {IDLE_REASON_LABELS[e.lastIdle.reason]} ({formatTime(e.lastIdle.at)})
            </dd>
          </>
        )}
      </dl>
    </Link>
  );
}
