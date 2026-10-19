import type { TaskStatusCounts } from '@lk/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { listProjects } from '../../../api/projects';
import { EmptyState, ErrorBox, PageHeader, Spinner } from '../../../components/ui';
import { formatDateTime } from '../../../lib/time';

export const NEW_PROJECT_LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800';

export function ProjectsPage() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects });

  return (
    <div>
      <PageHeader
        title="Projects"
        actions={
          <Link to="/owner/projects/new" className={NEW_PROJECT_LINK_CLASS}>
            New project
          </Link>
        }
      />
      {projects.isPending && <Spinner label="Loading projects…" />}
      <ErrorBox error={projects.error} />
      {projects.data?.length === 0 && (
        <EmptyState title="No projects yet">
          Press “New project”, describe what you want in your own words, and the AI suggests the
          tasks.
        </EmptyState>
      )}
      {projects.data && projects.data.length > 0 && (
        <ul className="space-y-2">
          {projects.data.map((p) => (
            <li key={p.id}>
              <Link
                to={`/owner/projects/${p.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:bg-gray-50"
              >
                <span className="block font-medium text-gray-900">{p.title}</span>
                <span className="mt-1 block text-sm text-gray-600">{countsText(p.counts)}</span>
                <span className="mt-1 block text-xs text-gray-500">
                  Created {formatDateTime(p.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function countsText(c: TaskStatusCounts): string {
  const total = c.UNASSIGNED + c.PENDING + c.IN_PROGRESS + c.BLOCKED + c.COMPLETED;
  if (total === 0) return 'No tasks';
  const parts = [
    c.UNASSIGNED && `${c.UNASSIGNED} not sent`,
    c.PENDING && `${c.PENDING} pending`,
    c.IN_PROGRESS && `${c.IN_PROGRESS} in progress`,
    c.BLOCKED && `${c.BLOCKED} blocked`,
    c.COMPLETED && `${c.COMPLETED} completed`,
  ].filter(Boolean);
  return `${total} ${total === 1 ? 'task' : 'tasks'}: ${parts.join(', ')}`;
}
