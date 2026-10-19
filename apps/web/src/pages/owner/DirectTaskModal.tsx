import { LLM_UNAVAILABLE_MESSAGE, type TaskPriority } from '@lk/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { isAiFailure, translateTask } from '../../api/ai';
import { listEmployees } from '../../api/employees';
import { listJobRoles } from '../../api/jobRoles';
import { createDirectTask } from '../../api/tasks';
import { useInvalidateTasks } from '../../components/TaskViews';
import {
  Button,
  ErrorBox,
  Field,
  Modal,
  Notice,
  SelectField,
  Spinner,
  TextAreaField,
} from '../../components/ui';
import { useAiHealth } from '../../hooks/useAiHealth';
import { PRIORITY_OPTIONS, roleLabel } from '../../lib/labels';
import { filterAssignees } from '../../lib/tasks';

/**
 * O-3: pick an employee, write the task in plain words, let the AI write the technical version
 * (or write it yourself), check it, send.
 */
export function DirectTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Direct task" onClose={onClose}>
      {open && <DirectTaskForm onDone={onClose} />}
    </Modal>
  );
}

interface Errors {
  assignee?: string;
  text?: string;
  title?: string;
  description?: string;
}

function DirectTaskForm({ onDone }: { onDone: () => void }) {
  const [assigneeId, setAssigneeId] = useState('');
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  /** The technical version is shown once the AI wrote it or the owner chose to write it. */
  const [technical, setTechnical] = useState<null | { title: string; description: string }>(null);
  const [errors, setErrors] = useState<Errors>({});
  const employees = useQuery({
    queryKey: ['employees', { status: 'ACTIVE' }],
    queryFn: () => listEmployees({ status: 'ACTIVE' }),
  });
  const roles = useQuery({ queryKey: ['job-roles'], queryFn: listJobRoles });
  const ai = useAiHealth();
  const aiOffline = ai.data !== undefined && ai.data.status !== 'ok';
  const invalidate = useInvalidateTasks();

  const choices = filterAssignees(employees.data ?? [], { jobRoleId: '', query: '' });
  const employee = choices.find((e) => e.id === assigneeId);

  const translate = useMutation({
    mutationFn: () => translateTask(text.trim(), employee?.jobRoleId ?? null),
    onSuccess: (result) => setTechnical({ title: result.title, description: result.description }),
  });
  const send = useMutation({
    mutationFn: () =>
      createDirectTask({
        assigneeId,
        textOriginal: text.trim(),
        title: technical?.title.trim() ?? '',
        descriptionTechnical: technical?.description.trim() ?? '',
        priority,
      }),
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
  });

  function checkFirstPart(): boolean {
    const next: Errors = {};
    if (!assigneeId) next.assignee = 'Choose who should do it.';
    if (text.trim().length < 3) next.text = 'Write what needs to be done.';
    setErrors(next);
    return !next.assignee && !next.text;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!checkFirstPart() || !technical) return;
    const next: Errors = {};
    if (technical.title.trim().length < 2) next.title = 'Give the task a title.';
    if (!technical.description.trim()) next.description = 'Describe the task.';
    setErrors(next);
    if (!next.title && !next.description) send.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      {employees.isPending && <Spinner label="Loading employees…" />}
      <ErrorBox error={employees.error} />
      <SelectField
        label="Employee"
        value={assigneeId}
        error={errors.assignee}
        onChange={(e) => setAssigneeId(e.target.value)}
      >
        <option value="">Choose an employee</option>
        {choices.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.name} ({roleLabel(roles.data, emp.jobRoleId)})
          </option>
        ))}
      </SelectField>
      <TextAreaField
        label="What needs to be done? (plain words)"
        rows={4}
        maxLength={2000}
        value={text}
        error={errors.text}
        onChange={(e) => setText(e.target.value)}
      />
      <SelectField
        label="Priority"
        value={priority}
        onChange={(e) => setPriority(e.target.value as TaskPriority)}
      >
        {PRIORITY_OPTIONS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </SelectField>

      {aiOffline && !technical && <Notice tone="amber">{LLM_UNAVAILABLE_MESSAGE}</Notice>}
      {translate.isPending && <Spinner label="The AI is writing the technical version…" />}
      <ErrorBox error={translate.error}>
        {isAiFailure(translate.error) && (
          <span className="mt-1 block">Press “Write it myself” to continue without the AI.</span>
        )}
      </ErrorBox>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={technical ? 'secondary' : 'primary'}
          loading={translate.isPending}
          onClick={() => {
            if (!checkFirstPart()) return;
            if (technical && !window.confirm('Replace the technical version below?')) return;
            translate.mutate();
          }}
        >
          {technical ? 'Make it again with AI' : 'Make technical version'}
        </Button>
        {!technical && (
          <Button variant="secondary" onClick={() => setTechnical({ title: '', description: '' })}>
            Write it myself
          </Button>
        )}
      </div>

      {technical && (
        <div className="space-y-3 border-t border-gray-200 pt-3">
          <p className="text-sm text-gray-600">
            This is what {employee?.name ?? 'the employee'} will see. Check and edit it.
          </p>
          <Field
            label="Task title"
            value={technical.title}
            maxLength={200}
            error={errors.title}
            onChange={(e) => setTechnical({ ...technical, title: e.target.value })}
          />
          <TextAreaField
            label="Task description"
            rows={6}
            maxLength={4000}
            value={technical.description}
            error={errors.description}
            onChange={(e) => setTechnical({ ...technical, description: e.target.value })}
          />
          <ErrorBox error={send.error} />
          <Button type="submit" className="w-full" loading={send.isPending}>
            Send task
          </Button>
        </div>
      )}
    </form>
  );
}
