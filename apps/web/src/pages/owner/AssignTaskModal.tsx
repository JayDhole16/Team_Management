import type { Task } from '@lk/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { listEmployees } from '../../api/employees';
import { listJobRoles } from '../../api/jobRoles';
import { assignTask } from '../../api/tasks';
import { useInvalidateTasks } from '../../components/TaskViews';
import {
  Button,
  EmptyState,
  ErrorBox,
  Field,
  Modal,
  Notice,
  SelectField,
  Spinner,
} from '../../components/ui';
import { roleLabel } from '../../lib/labels';
import { filterAssignees } from '../../lib/tasks';

/**
 * O-2: pick an employee (the role filter starts at the task's role) and send the task with
 * its project summary. Also used to move a sent task to someone else.
 */
export function AssignTaskModal({ task, onClose }: { task: Task | null; onClose: () => void }) {
  return (
    <Modal
      open={task !== null}
      title={task?.assigneeId ? 'Send to someone else' : 'Assign task'}
      onClose={onClose}
    >
      {task && <AssignForm key={task.id} task={task} onDone={onClose} />}
    </Modal>
  );
}

function AssignForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const [jobRoleId, setJobRoleId] = useState(task.jobRoleId ?? '');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const employees = useQuery({
    queryKey: ['employees', { status: 'ACTIVE' }],
    queryFn: () => listEmployees({ status: 'ACTIVE' }),
  });
  const roles = useQuery({ queryKey: ['job-roles'], queryFn: listJobRoles });
  const invalidate = useInvalidateTasks();
  const send = useMutation({
    mutationFn: () => assignTask(task.id, selected),
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
  });

  const matches = filterAssignees(employees.data ?? [], { jobRoleId, query }).filter(
    (e) => e.id !== task.assigneeId,
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium text-gray-900">{task.title}</p>
        {task.assigneeName && (
          <p className="text-sm text-gray-600">
            Now with {task.assigneeName}. Sending it to someone else starts it again as Pending.
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Role" value={jobRoleId} onChange={(e) => setJobRoleId(e.target.value)}>
          <option value="">All roles</option>
          {roles.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </SelectField>
        <Field label="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {employees.isPending && <Spinner label="Loading employees…" />}
      <ErrorBox error={employees.error} />
      {employees.data && matches.length === 0 && (
        <EmptyState title="No matching employee">
          {jobRoleId
            ? 'Nobody active has this role. Choose “All roles” to see everyone.'
            : 'Try another name.'}
        </EmptyState>
      )}
      {matches.length > 0 && (
        <fieldset>
          <legend className="sr-only">Employee</legend>
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {matches.map((emp) => (
              <li key={emp.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50">
                  <input
                    type="radio"
                    name="assignee"
                    value={emp.id}
                    checked={selected === emp.id}
                    onChange={() => setSelected(emp.id)}
                    className="h-5 w-5"
                  />
                  <span>
                    <span className="block font-medium">{emp.name}</span>
                    <span className="block text-xs text-gray-600">
                      {roleLabel(roles.data, emp.jobRoleId)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {task.project && (
        <Notice>The project summary of “{task.project.title}” is sent with the task.</Notice>
      )}
      <ErrorBox error={send.error} />
      <Button
        className="w-full"
        disabled={!selected}
        loading={send.isPending}
        onClick={() => send.mutate()}
      >
        {task.project ? 'Send with project summary' : 'Send task'}
      </Button>
    </div>
  );
}
