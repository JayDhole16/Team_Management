import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { listCodes } from '../../api/codes';
import { listEmployees } from '../../api/employees';
import { useUser } from '../../auth/AuthProvider';
import { Stat } from '../../components/HoursViews';
import { Button, ErrorBox, PageHeader } from '../../components/ui';
import { AddEmployeeModal } from './AddEmployeeModal';

/** Phase 3 version: more cards (live status, alerts, tasks, updates) come in later phases. */
export function OverviewPage() {
  const user = useUser();
  const [adding, setAdding] = useState(false);
  const employees = useQuery({
    queryKey: ['employees', { status: 'ACTIVE' }],
    queryFn: () => listEmployees({ status: 'ACTIVE' }),
  });
  const codes = useQuery({ queryKey: ['codes'], queryFn: listCodes, refetchInterval: 10_000 });
  const waiting = codes.data?.filter((c) => c.status === 'ACTIVE' || c.status === 'CLAIMED').length;

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
      <ErrorBox error={employees.error ?? codes.error} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setAdding(true)}>Add new employee</Button>
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
