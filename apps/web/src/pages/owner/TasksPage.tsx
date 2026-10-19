import { TASK_STATUSES, type JobRole, type Task, type TaskStatus } from '@lk/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { listEmployees } from '../../api/employees';
import { listJobRoles } from '../../api/jobRoles';
import { listProjects } from '../../api/projects';
import { listTasks } from '../../api/tasks';
import { PlainText, PriorityBadge, TaskStatusBadge } from '../../components/TaskViews';
import {
  Button,
  EmptyState,
  ErrorBox,
  PageHeader,
  SelectField,
  Spinner,
} from '../../components/ui';
import { TASK_STATUS, roleLabel } from '../../lib/labels';
import { sortTasks } from '../../lib/tasks';
import { formatDateTime } from '../../lib/time';
import { AssignTaskModal } from './AssignTaskModal';
import { DirectTaskModal } from './DirectTaskModal';
import { TaskFormModal, type TaskFormTarget } from './projects/TaskFormModal';

/** O-4: every sent task by status, with filters. Columns on a computer, one status at a time on a phone. */
export function TasksPage() {
  const [assigneeId, setAssigneeId] = useState('');
  const [jobRoleId, setJobRoleId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [phoneStatus, setPhoneStatus] = useState<TaskStatus>('PENDING');
  const [direct, setDirect] = useState(false);
  const [assigning, setAssigning] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskFormTarget | null>(null);

  const filter = {
    assigneeId: assigneeId || undefined,
    jobRoleId: jobRoleId || undefined,
    projectId: projectId || undefined,
  };
  const tasks = useQuery({
    queryKey: ['tasks', filter],
    queryFn: () => listTasks(filter),
    refetchInterval: 30_000,
  });
  // All employees: deactivated ones may still have tasks on the board.
  const employees = useQuery({ queryKey: ['employees', {}], queryFn: () => listEmployees() });
  const roles = useQuery({ queryKey: ['job-roles'], queryFn: listJobRoles });
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects });

  const byStatus = (status: TaskStatus) =>
    sortTasks((tasks.data ?? []).filter((t) => t.status === status));
  const actions = {
    onAssign: setAssigning,
    onEdit: (task: Task) => setForm({ kind: 'edit', task }),
  };

  return (
    <div>
      <PageHeader
        title="Tasks"
        actions={<Button onClick={() => setDirect(true)}>Direct task</Button>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <SelectField
          label="Employee"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
        >
          <option value="">Everyone</option>
          {employees.data?.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
              {emp.status === 'DEACTIVATED' ? ' (deactivated)' : ''}
            </option>
          ))}
        </SelectField>
        <SelectField label="Role" value={jobRoleId} onChange={(e) => setJobRoleId(e.target.value)}>
          <option value="">All roles</option>
          {roles.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Project"
          value={projectId}
          className="col-span-2 md:col-span-1"
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </SelectField>
      </div>
      {tasks.isPending && <Spinner label="Loading tasks…" />}
      <ErrorBox error={tasks.error} />
      {tasks.data?.length === 0 && (
        <EmptyState title="No tasks here">
          Send tasks from a{' '}
          <Link to="/owner/projects" className="text-blue-800 underline">
            project
          </Link>
          , or press “Direct task”.
        </EmptyState>
      )}
      {tasks.data && tasks.data.length > 0 && (
        <>
          {/* Phones: one status at a time. */}
          <div className="space-y-3 md:hidden">
            <SelectField
              label="Show"
              value={phoneStatus}
              onChange={(e) => setPhoneStatus(e.target.value as TaskStatus)}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS[s].label} ({byStatus(s).length})
                </option>
              ))}
            </SelectField>
            <TaskList tasks={byStatus(phoneStatus)} roles={roles.data} {...actions} />
          </div>
          {/* Wider screens: the four columns. */}
          <div className="hidden gap-3 md:grid md:grid-cols-4">
            {TASK_STATUSES.map((status) => (
              <section
                key={status}
                aria-label={TASK_STATUS[status].label}
                className="min-w-0 space-y-2"
              >
                <h2 className="text-sm font-semibold text-gray-700">
                  {TASK_STATUS[status].label} ({byStatus(status).length})
                </h2>
                <TaskList tasks={byStatus(status)} roles={roles.data} {...actions} />
              </section>
            ))}
          </div>
        </>
      )}
      <DirectTaskModal open={direct} onClose={() => setDirect(false)} />
      <AssignTaskModal task={assigning} onClose={() => setAssigning(null)} />
      <TaskFormModal target={form} onClose={() => setForm(null)} />
    </div>
  );
}

function TaskList({
  tasks,
  roles,
  onAssign,
  onEdit,
}: {
  tasks: Task[];
  roles: JobRole[] | undefined;
  onAssign: (task: Task) => void;
  onEdit: (task: Task) => void;
}) {
  if (tasks.length === 0) return <p className="text-sm text-gray-500">None</p>;
  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <li
          key={task.id}
          data-testid="board-task"
          className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
        >
          <p className="font-medium break-words text-gray-900">{task.title}</p>
          <p className="mt-1 text-sm text-gray-700">{task.assigneeName ?? '—'}</p>
          <p className="text-xs text-gray-600">
            {task.project ? (
              <Link
                to={`/owner/projects/${task.project.id}`}
                className="text-blue-800 underline-offset-2 hover:underline"
              >
                {task.project.title}
              </Link>
            ) : (
              'Direct task'
            )}
            {' · '}
            {roleLabel(roles, task.jobRoleId)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <TaskStatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
          {task.status === 'BLOCKED' && task.blockedReason && (
            <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">
              Blocked: {task.blockedReason}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-500">
            {task.completedAt
              ? `Completed ${formatDateTime(task.completedAt)}`
              : task.assignedAt && `Sent ${formatDateTime(task.assignedAt)}`}
          </p>
          <details className="mt-1">
            <summary className="min-h-11 cursor-pointer content-center text-sm text-blue-800">
              Details
            </summary>
            <PlainText text={task.descriptionTechnical} className="text-sm text-gray-800" />
            {task.descriptionOriginal && (
              <p className="mt-2 text-xs text-gray-600">You wrote: {task.descriptionOriginal}</p>
            )}
            {task.status !== 'COMPLETED' && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => onEdit(task)}>
                  Edit
                </Button>
                <Button variant="secondary" onClick={() => onAssign(task)}>
                  Send to someone else
                </Button>
              </div>
            )}
          </details>
        </li>
      ))}
    </ul>
  );
}
