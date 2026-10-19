import type { Employee, MyTask, TaskPriority } from '@lk/shared';

const PRIORITY_RANK: Record<TaskPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

type Sortable = Pick<MyTask, 'priority' | 'status' | 'assignedAt' | 'completedAt' | 'updatedAt'>;

/**
 * Open tasks: high priority first, then the oldest assignment first.
 * Completed tasks: the most recently completed first.
 */
export function sortTasks<T extends Sortable>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (a.status === 'COMPLETED' && b.status === 'COMPLETED') {
      return (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt);
    }
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    return (a.assignedAt ?? '').localeCompare(b.assignedAt ?? '');
  });
}

/** My Day shortcut: carry on with work in progress, else the most urgent pending task. */
export function nextTask<T extends Sortable>(tasks: readonly T[]): T | undefined {
  return (
    sortTasks(tasks.filter((t) => t.status === 'IN_PROGRESS'))[0] ??
    sortTasks(tasks.filter((t) => t.status === 'PENDING'))[0]
  );
}

/**
 * The Assign search: active employees only, optionally one job role, matching the typed text
 * in the name or email (case-insensitive), sorted by name.
 */
export function filterAssignees(
  employees: readonly Employee[],
  filter: { jobRoleId: string; query: string },
): Employee[] {
  const query = filter.query.trim().toLowerCase();
  return employees
    .filter((e) => e.status === 'ACTIVE')
    .filter((e) => !filter.jobRoleId || e.jobRoleId === filter.jobRoleId)
    .filter((e) => !query || e.name.toLowerCase().includes(query) || e.email.includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
}
