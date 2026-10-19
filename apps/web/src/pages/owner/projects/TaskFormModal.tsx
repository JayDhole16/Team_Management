import type { Task, TaskPatchBody, TaskPriority } from '@lk/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { listJobRoles } from '../../../api/jobRoles';
import { addProjectTask } from '../../../api/projects';
import { updateTask } from '../../../api/tasks';
import { useInvalidateTasks } from '../../../components/TaskViews';
import { Button, ErrorBox, Field, Modal, SelectField, TextAreaField } from '../../../components/ui';
import { PRIORITY_OPTIONS } from '../../../lib/labels';

export type TaskFormTarget = { kind: 'add'; projectId: string } | { kind: 'edit'; task: Task };

/** Add a task to a saved project by hand, or edit a task that is not completed. */
export function TaskFormModal({
  target,
  onClose,
}: {
  target: TaskFormTarget | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={target !== null}
      title={target?.kind === 'edit' ? 'Edit task' : 'Add task'}
      onClose={onClose}
    >
      {target && (
        <TaskForm
          key={target.kind === 'edit' ? target.task.id : target.projectId}
          target={target}
          onDone={onClose}
        />
      )}
    </Modal>
  );
}

function TaskForm({ target, onDone }: { target: TaskFormTarget; onDone: () => void }) {
  const task = target.kind === 'edit' ? target.task : null;
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.descriptionTechnical ?? '');
  const [jobRoleId, setJobRoleId] = useState(task?.jobRoleId ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'MEDIUM');
  const [errors, setErrors] = useState<{ title?: string; description?: string }>({});
  const roles = useQuery({ queryKey: ['job-roles'], queryFn: listJobRoles });
  const invalidate = useInvalidateTasks();

  const save = useMutation({
    mutationFn: async () => {
      if (target.kind === 'add') {
        return addProjectTask(target.projectId, {
          title: title.trim(),
          descriptionTechnical: description.trim(),
          jobRoleId: jobRoleId || null,
          priority,
          source: 'MANUAL',
        });
      }
      const t = target.task;
      // Only what changed.
      const patch: TaskPatchBody = {};
      if (title.trim() !== t.title) patch.title = title.trim();
      if (description.trim() !== t.descriptionTechnical)
        patch.descriptionTechnical = description.trim();
      if ((jobRoleId || null) !== t.jobRoleId) patch.jobRoleId = jobRoleId || null;
      if (priority !== t.priority) patch.priority = priority;
      return Object.keys(patch).length > 0 ? updateTask(t.id, patch) : t;
    },
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (title.trim().length < 2) next.title = 'Give the task a title.';
    if (!description.trim()) next.description = 'Describe the task.';
    setErrors(next);
    if (!next.title && !next.description) save.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      {task?.assigneeName && (
        <p className="text-sm text-gray-600">
          {task.assigneeName} sees your changes in their task list.
        </p>
      )}
      <Field
        label="Task title"
        value={title}
        maxLength={200}
        error={errors.title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <TextAreaField
        label="Task description"
        rows={6}
        maxLength={4000}
        value={description}
        error={errors.description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Role" value={jobRoleId} onChange={(e) => setJobRoleId(e.target.value)}>
          <option value="">No role</option>
          {roles.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </SelectField>
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
      </div>
      <ErrorBox error={save.error} />
      <Button type="submit" className="w-full" loading={save.isPending}>
        {target.kind === 'add' ? 'Add task' : 'Save changes'}
      </Button>
    </form>
  );
}
