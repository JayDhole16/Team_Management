import type { ProjectDetail, Task } from '@lk/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { listJobRoles } from '../../../api/jobRoles';
import { getProject, updateProject } from '../../../api/projects';
import { deleteTask } from '../../../api/tasks';
import {
  PlainText,
  PriorityBadge,
  TaskStatusBadge,
  useInvalidateTasks,
} from '../../../components/TaskViews';
import {
  Button,
  Card,
  ErrorBox,
  Field,
  PageHeader,
  Spinner,
  TextAreaField,
} from '../../../components/ui';
import { roleLabel } from '../../../lib/labels';
import { formatDateTime } from '../../../lib/time';
import { AssignTaskModal } from '../AssignTaskModal';
import { countsText } from './ProjectsPage';
import { TaskFormModal, type TaskFormTarget } from './TaskFormModal';

/** Summary, every task with its status, and per task: Assign, Edit, Delete. */
export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const project = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id),
    refetchInterval: 30_000,
  });
  const roles = useQuery({ queryKey: ['job-roles'], queryFn: listJobRoles });
  const [assigning, setAssigning] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskFormTarget | null>(null);
  const invalidate = useInvalidateTasks();
  const remove = useMutation({ mutationFn: deleteTask, onSuccess: invalidate });

  if (project.isPending) return <Spinner label="Loading project…" />;
  if (!project.data) return <ErrorBox error={project.error} />;
  const p = project.data;

  return (
    <div className="space-y-4">
      <Link
        to="/owner/projects"
        className="inline-flex min-h-11 items-center text-sm text-blue-800"
      >
        ‹ All projects
      </Link>
      <PageHeader title={p.title} />
      <SummaryCard key={p.updatedAt} project={p} />

      <section className="space-y-3" aria-label="Tasks">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Tasks</h2>
            <p className="text-sm text-gray-600">{countsText(p.counts)}</p>
          </div>
          <Button variant="secondary" onClick={() => setForm({ kind: 'add', projectId: p.id })}>
            Add task
          </Button>
        </div>
        <ErrorBox error={remove.error} />
        {p.tasks.map((task) => {
          const unsent = task.assigneeId === null;
          const open = task.status !== 'COMPLETED';
          return (
            <Card key={task.id} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-medium text-gray-900">{task.title}</h3>
                <div className="flex flex-wrap gap-1">
                  <TaskStatusBadge status={task.status} unsent={unsent} />
                  <PriorityBadge priority={task.priority} />
                </div>
              </div>
              <p className="text-sm text-gray-600">
                {roleLabel(roles.data, task.jobRoleId)}
                {task.assigneeName && ` · ${task.assigneeName}`}
                {task.assignedAt && ` · sent ${formatDateTime(task.assignedAt)}`}
              </p>
              <PlainText text={task.descriptionTechnical} className="text-sm text-gray-800" />
              {task.status === 'BLOCKED' && task.blockedReason && (
                <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
                  Blocked: {task.blockedReason}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {open && (
                  <Button
                    variant={unsent ? 'primary' : 'secondary'}
                    onClick={() => setAssigning(task)}
                  >
                    {unsent ? 'Assign' : 'Send to someone else'}
                  </Button>
                )}
                {open && (
                  <Button variant="secondary" onClick={() => setForm({ kind: 'edit', task })}>
                    Edit
                  </Button>
                )}
                {unsent && (
                  <Button
                    variant="ghost"
                    loading={remove.isPending && remove.variables === task.id}
                    onClick={() => {
                      if (window.confirm(`Delete the task “${task.title}”?`))
                        remove.mutate(task.id);
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </section>

      {p.briefOriginal && (
        <details className="rounded-xl border border-gray-200 bg-white p-4">
          <summary className="min-h-11 cursor-pointer content-center font-medium">
            Your original description
          </summary>
          <PlainText text={p.briefOriginal} className="mt-2 text-sm text-gray-800" />
        </details>
      )}

      <AssignTaskModal task={assigning} onClose={() => setAssigning(null)} />
      <TaskFormModal target={form} onClose={() => setForm(null)} />
    </div>
  );
}

function SummaryCard({ project }: { project: ProjectDetail }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(project.title);
  const [summary, setSummary] = useState(project.summaryTechnical);
  const invalidate = useInvalidateTasks();
  const save = useMutation({
    mutationFn: () =>
      updateProject(project.id, { title: title.trim(), summaryTechnical: summary.trim() }),
    onSuccess: async () => {
      await invalidate();
      setEditing(false);
    },
  });

  if (!editing) {
    return (
      <Card className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Summary for employees</h2>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        <PlainText text={project.summaryTechnical} className="text-sm text-gray-800" />
      </Card>
    );
  }
  const invalid = title.trim().length < 2 || !summary.trim();
  return (
    <Card className="space-y-3">
      <Field
        label="Project name"
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
      />
      <TextAreaField
        label="Summary for employees"
        rows={5}
        maxLength={4000}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      <ErrorBox error={save.error} />
      <div className="flex gap-2">
        <Button disabled={invalid} loading={save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
        <Button variant="secondary" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
