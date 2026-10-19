import {
  IDLE_INTERVAL_MAX,
  IDLE_INTERVAL_MIN,
  type CodeCreated,
  type DeviceMode,
  type Employee,
  type EmployeePatchBody,
  type JobRole,
} from '@lk/shared';
import { buildEmployeePatch } from './employeePatch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { serverNow } from '../../api/clock';
import { createPasswordResetCode, revokeCode } from '../../api/codes';
import {
  deactivateEmployee,
  getEmployee,
  reactivateEmployee,
  updateEmployee,
} from '../../api/employees';
import { listJobRoles } from '../../api/jobRoles';
import { listTasks } from '../../api/tasks';
import { TaskStatusBadge } from '../../components/TaskViews';
import { sortTasks } from '../../lib/tasks';
import { fetchMonthHours, fetchTodayHours } from '../../api/reports';
import { CodePanel } from '../../components/CodePanel';
import { MonthHoursView, MonthPicker, SessionList, Stat } from '../../components/HoursViews';
import {
  Button,
  Card,
  ErrorBox,
  Field,
  Modal,
  Notice,
  PageHeader,
  SelectField,
  Spinner,
} from '../../components/ui';
import { DEVICE_MODE_LABEL, roleLabel } from '../../lib/labels';
import { formatDay, formatHours, istMonth } from '../../lib/time';
import { StatusBadge } from './EmployeesPage';

export function EmployeeDetailPage() {
  const { id = '' } = useParams();
  const employee = useQuery({ queryKey: ['employee', id], queryFn: () => getEmployee(id) });
  const roles = useQuery({ queryKey: ['job-roles'], queryFn: listJobRoles });

  if (employee.isPending) return <Spinner label="Loading…" />;
  if (!employee.data) return <ErrorBox error={employee.error} />;
  const emp = employee.data;

  return (
    <div className="space-y-4">
      <Link
        to="/owner/employees"
        className="inline-flex min-h-11 items-center text-sm text-blue-800"
      >
        ‹ All employees
      </Link>
      <PageHeader title={emp.name} actions={<StatusBadge status={emp.status} />} />
      <Profile emp={emp} roles={roles.data} />
      <Hours userId={emp.id} />
      <Tasks userId={emp.id} />
      {emp.status === 'ACTIVE' && <Settings key={emp.id} emp={emp} roles={roles.data ?? []} />}
      <Actions emp={emp} />
    </div>
  );
}

function Profile({ emp, roles }: { emp: Employee; roles: JobRole[] | undefined }) {
  const rows: [string, string][] = [
    ['Email', emp.email],
    ['Phone', emp.phone ?? '—'],
    [
      'Emergency contact',
      [emp.emergencyContactName, emp.emergencyContactPhone].filter(Boolean).join(', ') || '—',
    ],
    ['Job role', roleLabel(roles, emp.jobRoleId)],
    ['Device type', emp.deviceMode ? DEVICE_MODE_LABEL[emp.deviceMode] : '—'],
    ['Idle check', `every ${emp.idleIntervalMin} min`],
    ['Joined', formatDay(emp.joiningDate)],
    ['Face scan', emp.faceEnrolled ? 'Enrolled' : 'Not enrolled yet'],
  ];
  return (
    <Card>
      <h2 className="mb-2 font-semibold">Profile</h2>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-gray-600">{label}</dt>
            <dd className="text-gray-900 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Hours({ userId }: { userId: string }) {
  const [month, setMonth] = useState(() => istMonth(serverNow()));
  const today = useQuery({
    queryKey: ['hours-today', userId],
    queryFn: () => fetchTodayHours({ userId }),
    refetchInterval: 60_000,
  });
  const monthly = useQuery({
    queryKey: ['hours-month', userId, month],
    queryFn: () => fetchMonthHours({ userId, month }),
  });
  return (
    <Card>
      <h2 className="mb-2 font-semibold">Hours</h2>
      <dl className="mb-4 grid grid-cols-2 gap-2">
        <Stat label="Today" value={today.data ? formatHours(today.data.todaySec) : '…'} />
        <Stat label="This month" value={today.data ? formatHours(today.data.monthSec) : '…'} />
      </dl>
      <div className="mb-3">
        <MonthPicker month={month} maxMonth={istMonth(serverNow())} onChange={setMonth} />
      </div>
      <ErrorBox error={today.error ?? monthly.error} />
      {monthly.data && (
        <div className="space-y-4">
          <MonthHoursView data={monthly.data} />
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center text-sm text-blue-800">
              Sessions and breaks
            </summary>
            <SessionList data={monthly.data} />
          </details>
        </div>
      )}
    </Card>
  );
}

function Tasks({ userId }: { userId: string }) {
  const tasks = useQuery({
    queryKey: ['tasks', { assigneeId: userId }],
    queryFn: () => listTasks({ assigneeId: userId }),
  });
  return (
    <Card>
      <h2 className="mb-2 font-semibold">Tasks</h2>
      {tasks.isPending && <Spinner label="Loading tasks…" />}
      <ErrorBox error={tasks.error} />
      {tasks.data?.length === 0 && <p className="text-sm text-gray-600">No tasks sent yet.</p>}
      {tasks.data && tasks.data.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {sortTasks(tasks.data).map((task) => (
            <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 break-words">
                <span className="block text-sm font-medium">{task.title}</span>
                <span className="block text-xs text-gray-600">
                  {task.project?.title ?? 'Direct task'}
                </span>
              </span>
              <TaskStatusBadge status={task.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Settings({ emp, roles }: { emp: Employee; roles: JobRole[] }) {
  const queryClient = useQueryClient();
  const [jobRoleId, setJobRoleId] = useState(emp.jobRoleId ?? '');
  const [deviceMode, setDeviceMode] = useState<DeviceMode | ''>(emp.deviceMode ?? '');
  const [idle, setIdle] = useState(String(emp.idleIntervalMin));
  const [joiningDate, setJoiningDate] = useState(emp.joiningDate);
  const [idleError, setIdleError] = useState<string | undefined>();
  const [noChanges, setNoChanges] = useState(false);
  const save = useMutation({
    mutationFn: (body: EmployeePatchBody) => updateEmployee(emp.id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(['employee', emp.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = buildEmployeePatch(emp, { jobRoleId, deviceMode, idle, joiningDate });
    if (!result.ok) {
      setIdleError(result.idleError);
      return;
    }
    setIdleError(undefined);
    if (Object.keys(result.body).length === 0) {
      setNoChanges(true);
      return;
    }
    if (
      result.body.deviceMode === 'COMPANY_MACBOOK' &&
      !window.confirm(
        `Mark this as a Company MacBook? Only approved apps and websites will work on ${emp.name}'s MacBook once restricted mode is available.`,
      )
    ) {
      return;
    }
    save.mutate(result.body);
  }

  /** Editing again hides an old "Saved." or "No changes" message. */
  const edited =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setNoChanges(false);
      save.reset();
    };

  return (
    <Card>
      <h2 className="mb-2 font-semibold">Settings</h2>
      <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2" noValidate>
        <SelectField
          label="Job role"
          value={jobRoleId}
          onChange={(e) => edited(setJobRoleId)(e.target.value)}
        >
          <option value="">No role</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Device type"
          value={deviceMode}
          onChange={(e) => edited(setDeviceMode)(e.target.value as DeviceMode)}
          hint="Only a Company MacBook is ever restricted."
        >
          {(Object.keys(DEVICE_MODE_LABEL) as DeviceMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {DEVICE_MODE_LABEL[mode]}
            </option>
          ))}
        </SelectField>
        <Field
          label="Idle check every (minutes)"
          type="number"
          inputMode="numeric"
          min={IDLE_INTERVAL_MIN}
          max={IDLE_INTERVAL_MAX}
          value={idle}
          error={idleError}
          onChange={(e) => edited(setIdle)(e.target.value)}
        />
        <Field
          label="Joining date"
          type="date"
          value={joiningDate}
          onChange={(e) => edited(setJoiningDate)(e.target.value)}
        />
        <div className="space-y-2 md:col-span-2">
          <ErrorBox error={save.error} />
          {save.isSuccess && <Notice tone="green">Saved.</Notice>}
          {noChanges && <Notice>Nothing has changed.</Notice>}
          <Button type="submit" loading={save.isPending}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Actions({ emp }: { emp: Employee }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState<CodeCreated | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(name: string, action: () => Promise<unknown>) {
    setBusy(name);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  const refresh = (updated: Employee) => {
    queryClient.setQueryData(['employee', emp.id], updated);
    void queryClient.invalidateQueries({ queryKey: ['employees'] });
    // Deactivation closes the open work session.
    void queryClient.invalidateQueries({ queryKey: ['hours-today', emp.id] });
    void queryClient.invalidateQueries({ queryKey: ['hours-month', emp.id] });
  };

  const issue = (name: string, create: (id: string) => Promise<CodeCreated>) =>
    run(name, async () => setCode(await create(emp.id)));

  function deactivate() {
    const ok = window.confirm(
      `Deactivate ${emp.name}? They are signed out everywhere, their work session ends and their face scan is deleted. Their hours and history are kept.`,
    );
    if (ok) void run('deactivate', async () => refresh(await deactivateEmployee(emp.id)));
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold">Actions</h2>
      <ErrorBox error={error} />
      {emp.status === 'ACTIVE' ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            variant="secondary"
            loading={busy === 'reset'}
            onClick={() => void issue('reset', createPasswordResetCode)}
          >
            Issue password-reset code
          </Button>
          {/* No screen accepts a FACE_RESCAN code until the face-scan update (Phase 9). */}
          <Button variant="secondary" disabled title="Available after the face-scan update">
            Issue face re-scan code (coming soon)
          </Button>
          <Button variant="danger" loading={busy === 'deactivate'} onClick={deactivate}>
            Deactivate
          </Button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-gray-700">
            They can log in again after reactivating. Once the face-scan update is installed, also
            give them a face re-scan code.
          </p>
          <Button
            loading={busy === 'reactivate'}
            onClick={() =>
              void run('reactivate', async () => refresh(await reactivateEmployee(emp.id)))
            }
          >
            Reactivate
          </Button>
        </div>
      )}
      <Modal open={code !== null} title="One-time code" onClose={() => setCode(null)}>
        {code && (
          <CodePanel
            created={code}
            onRevoke={() => revokeCode(code.id)}
            onDone={() => setCode(null)}
          />
        )}
      </Modal>
    </Card>
  );
}
