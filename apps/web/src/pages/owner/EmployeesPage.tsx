import type { Employee, JobRole, UserStatus } from '@lk/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { listEmployees } from '../../api/employees';
import { listJobRoles } from '../../api/jobRoles';
import { fetchTodayHours } from '../../api/reports';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBox,
  PageHeader,
  SelectField,
  Spinner,
} from '../../components/ui';
import { DEVICE_MODE_LABEL, roleLabel } from '../../lib/labels';
import { formatHours } from '../../lib/time';
import { AddEmployeeModal } from './AddEmployeeModal';

export function EmployeesPage() {
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('ACTIVE');
  const [adding, setAdding] = useState(false);
  const roles = useQuery({ queryKey: ['job-roles'], queryFn: listJobRoles });
  const filter = { jobRoleId: roleId || undefined, status: status || undefined };
  const employees = useQuery({
    queryKey: ['employees', filter],
    queryFn: () => listEmployees(filter),
  });

  return (
    <div>
      <PageHeader
        title="Employees"
        actions={
          <>
            <Link
              to="/owner/invites"
              className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium"
            >
              Pending invites
            </Link>
            <Button onClick={() => setAdding(true)}>Add new employee</Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:max-w-md">
        <SelectField label="Role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">All roles</option>
          {roles.data?.map((role) => (
            <option key={role.id} value={role.id}>
              {role.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as UserStatus | '')}
        >
          <option value="ACTIVE">Active</option>
          <option value="DEACTIVATED">Deactivated</option>
          <option value="">All</option>
        </SelectField>
      </div>
      {employees.isPending && <Spinner label="Loading employees…" />}
      <ErrorBox error={employees.error} />
      {employees.data?.length === 0 && (
        <EmptyState title="No employees here yet">
          Press &ldquo;Add new employee&rdquo; to create a code for a new person.
        </EmptyState>
      )}
      {employees.data && employees.data.length > 0 && (
        <>
          {/* Phones: cards. */}
          <ul className="space-y-2 md:hidden">
            {employees.data.map((emp) => (
              <li key={emp.id}>
                <EmployeeCard employee={emp} roles={roles.data} />
              </li>
            ))}
          </ul>
          {/* Wider screens: a table. */}
          <table className="hidden w-full overflow-hidden rounded-xl bg-white text-left text-sm shadow-sm md:table">
            <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Device</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Idle check</th>
                <th className="px-3 py-2">Today</th>
                <th className="px-3 py-2">This month</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.data.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link
                      to={`/owner/employees/${emp.id}`}
                      className="font-medium text-blue-800 underline-offset-2 hover:underline"
                    >
                      {emp.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{roleLabel(roles.data, emp.jobRoleId)}</td>
                  <td className="px-3 py-2">
                    {emp.deviceMode ? DEVICE_MODE_LABEL[emp.deviceMode] : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={emp.status} />
                  </td>
                  <td className="px-3 py-2">every {emp.idleIntervalMin} min</td>
                  <HoursCells employee={emp} />
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <AddEmployeeModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

export function StatusBadge({ status }: { status: UserStatus }) {
  return status === 'ACTIVE' ? (
    <Badge tone="green">Active</Badge>
  ) : (
    <Badge tone="grey">Deactivated</Badge>
  );
}

function useTodayHours(userId: string) {
  return useQuery({
    queryKey: ['hours-today', userId],
    queryFn: () => fetchTodayHours({ userId }),
  });
}

function HoursCells({ employee }: { employee: Employee }) {
  const hours = useTodayHours(employee.id);
  return (
    <>
      <td className="px-3 py-2">{hours.data ? formatHours(hours.data.todaySec) : '…'}</td>
      <td className="px-3 py-2">{hours.data ? formatHours(hours.data.monthSec) : '…'}</td>
    </>
  );
}

function EmployeeCard({ employee, roles }: { employee: Employee; roles: JobRole[] | undefined }) {
  const hours = useTodayHours(employee.id);
  return (
    <Link
      to={`/owner/employees/${employee.id}`}
      className="block rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-gray-900">{employee.name}</span>
        <StatusBadge status={employee.status} />
      </div>
      <p className="mt-1 text-sm text-gray-600">
        {roleLabel(roles, employee.jobRoleId)} ·{' '}
        {employee.deviceMode ? DEVICE_MODE_LABEL[employee.deviceMode] : '—'}
      </p>
      <p className="mt-1 text-sm text-gray-800">
        Today {hours.data ? formatHours(hours.data.todaySec) : '…'} · Month{' '}
        {hours.data ? formatHours(hours.data.monthSec) : '…'}
      </p>
    </Link>
  );
}
