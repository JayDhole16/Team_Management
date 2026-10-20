import { TASK_STATUSES } from '@lk/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { listAlerts } from '../../api/alerts';
import { listCodes } from '../../api/codes';
import { listEmployees } from '../../api/employees';
import { listTasks } from '../../api/tasks';
import { listUpdates } from '../../api/updates';
import { useUser } from '../../auth/AuthProvider';
import { AlertCard, useLive, useOpenAlertCount } from '../../components/AlertViews';
import { Stat } from '../../components/HoursViews';
import { InboxLink, RecentUpdates, useUnreadUpdates } from '../../components/UpdateViews';
import { Button, Card, ErrorBox, PageHeader } from '../../components/ui';
import { useNow } from '../../hooks/useNow';
import { TASK_STATUS } from '../../lib/labels';
import {
  countByStatus,
  grownSinceLoad,
  LIVE_STATUS,
  LIVE_STATUS_ORDER,
  teamTodaySec,
} from '../../lib/liveStatus';
import { formatHours } from '../../lib/time';
import { serverNowFrom } from '../../lib/timer';
import { ALERTS_KEY } from '../../realtime/effects';
import { AddEmployeeModal } from './AddEmployeeModal';
import { NEW_PROJECT_LINK_CLASS } from './projects/ProjectsPage';

export function OverviewPage() {
  const user = useUser();
  const [adding, setAdding] = useState(false);
  const live = useLive();
  const openAlerts = useOpenAlertCount();
  const recentAlerts = useQuery({
    queryKey: [ALERTS_KEY[0], 'recent'],
    queryFn: () => listAlerts({ limit: 3 }),
  });
  const now = useNow(30_000);
  const counts = live.data ? countByStatus(live.data.employees) : null;
  const teamToday = live.data
    ? teamTodaySec(
        live.data.employees,
        grownSinceLoad(
          live.data.serverTime,
          serverNowFrom(live.data.serverTime, live.dataUpdatedAt, now),
        ),
      )
    : null;
  const employees = useQuery({
    queryKey: ['employees', { status: 'ACTIVE' }],
    queryFn: () => listEmployees({ status: 'ACTIVE' }),
  });
  const codes = useQuery({ queryKey: ['codes'], queryFn: listCodes, refetchInterval: 10_000 });
  const waiting = codes.data?.filter((c) => c.status === 'ACTIVE' || c.status === 'CLAIMED').length;
  const tasks = useQuery({
    queryKey: ['tasks', {}],
    queryFn: () => listTasks(),
    refetchInterval: 30_000,
  });
  const unread = useUnreadUpdates();
  const recent = useQuery({
    queryKey: ['updates', 'recent'],
    queryFn: () => listUpdates({ limit: 3 }),
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader title={`Hello, ${user.name}`} />
      <h2 className="mb-2 font-semibold">
        <Link to="/owner/live" className="text-blue-800 underline-offset-2 hover:underline">
          Live status
        </Link>
      </h2>
      <dl className="mb-4 grid grid-cols-2 gap-3 md:max-w-2xl md:grid-cols-4">
        {LIVE_STATUS_ORDER.map((status) => (
          <Stat
            key={status}
            label={LIVE_STATUS[status].label}
            value={counts ? String(counts[status]) : '…'}
          />
        ))}
      </dl>
      <dl className="mb-4 grid grid-cols-2 gap-3 md:max-w-2xl md:grid-cols-4">
        <Stat label="Team hours today" value={teamToday === null ? '…' : formatHours(teamToday)} />
        <Stat label="Open alerts" value={openAlerts.data ? String(openAlerts.data.count) : '…'} />
        <Stat
          label="Active employees"
          value={employees.data ? String(employees.data.length) : '…'}
        />
        <Stat label="Invites waiting" value={waiting === undefined ? '…' : String(waiting)} />
        <Stat label="Unread updates" value={unread.data ? String(unread.data.count) : '…'} />
      </dl>
      <h2 className="mb-2 font-semibold">
        <Link to="/owner/tasks" className="text-blue-800 underline-offset-2 hover:underline">
          Tasks
        </Link>
      </h2>
      <dl className="mb-4 grid grid-cols-2 gap-3 md:max-w-2xl md:grid-cols-4">
        {TASK_STATUSES.map((status) => (
          <Stat
            key={status}
            label={TASK_STATUS[status].label}
            value={tasks.data ? String(tasks.data.filter((t) => t.status === status).length) : '…'}
          />
        ))}
      </dl>
      {recentAlerts.data && recentAlerts.data.items.length > 0 && (
        <Card className="mb-4 space-y-2 md:max-w-2xl">
          <h2 className="font-semibold">Recent alerts</h2>
          <ul className="space-y-2">
            {recentAlerts.data.items.map((a) => (
              <li key={a.id}>
                <AlertCard alert={a} />
              </li>
            ))}
          </ul>
          <Link
            to="/owner/alerts"
            className="inline-flex min-h-11 items-center text-sm text-blue-800"
          >
            Open alerts
          </Link>
        </Card>
      )}
      {recent.data && recent.data.items.length > 0 && (
        <Card className="mb-4 md:max-w-2xl">
          <h2 className="font-semibold">Recent updates</h2>
          <RecentUpdates updates={recent.data.items} showName />
          <InboxLink>Open updates</InboxLink>
        </Card>
      )}
      <ErrorBox
        error={
          live.error ??
          openAlerts.error ??
          recentAlerts.error ??
          employees.error ??
          codes.error ??
          tasks.error ??
          recent.error ??
          unread.error
        }
      />
      <div className="flex flex-wrap gap-2">
        <Link to="/owner/projects/new" className={NEW_PROJECT_LINK_CLASS}>
          New project
        </Link>
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Add new employee
        </Button>
        <Link
          to="/owner/employees"
          className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium"
        >
          See employees
        </Link>
      </div>
      <AddEmployeeModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
