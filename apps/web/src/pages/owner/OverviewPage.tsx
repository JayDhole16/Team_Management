import { TASK_STATUSES } from '@lk/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { listCodes } from '../../api/codes';
import { listEmployees } from '../../api/employees';
import { listTasks } from '../../api/tasks';
import { useUser } from '../../auth/AuthProvider';
import { Stat } from '../../components/HoursViews';
import { Button, ErrorBox, PageHeader } from '../../components/ui';
import { TASK_STATUS } from '../../lib/labels';
import { AddEmployeeModal } from './AddEmployeeModal';
import { NEW_PROJECT_LINK_CLASS } from './projects/ProjectsPage';

/** More cards (live status, alerts, updates) come in later phases. */
export function OverviewPage() {
  const user = useUser();
  const [adding, setAdding] = useState(false);
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

  return (
    <div>
      <PageHeader title={`Hello, ${user.name}`} />
      <dl className="mb-4 grid grid-cols-2 gap-3 md:max-w-md">
        <Stat
          label="Active employees"
          value={employees.data ? String(employees.data.length) : '…'}
        />
        <Stat label="Invites waiting" value={waiting === undefined ? '…' : String(waiting)} />
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
      <ErrorBox error={employees.error ?? codes.error ?? tasks.error} />
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
