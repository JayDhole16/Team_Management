import type { Employee, TaskPriority, TaskStatus } from '@lk/shared';
import { describe, expect, it } from 'vitest';
import { filterAssignees, nextTask, sortTasks } from './tasks';

const task = (
  id: string,
  status: TaskStatus,
  priority: TaskPriority,
  assignedAt: string,
  completedAt: string | null = null,
) => ({ id, status, priority, assignedAt, completedAt, updatedAt: assignedAt });

describe('sortTasks', () => {
  it('open tasks: high priority first, then oldest first', () => {
    const sorted = sortTasks([
      task('low-old', 'PENDING', 'LOW', '2026-10-01T00:00:00.000Z'),
      task('high-new', 'PENDING', 'HIGH', '2026-10-05T00:00:00.000Z'),
      task('high-old', 'PENDING', 'HIGH', '2026-10-02T00:00:00.000Z'),
      task('medium', 'PENDING', 'MEDIUM', '2026-10-01T00:00:00.000Z'),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['high-old', 'high-new', 'medium', 'low-old']);
  });

  it('completed tasks: most recently completed first', () => {
    const sorted = sortTasks([
      task('a', 'COMPLETED', 'HIGH', '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z'),
      task('b', 'COMPLETED', 'LOW', '2026-10-01T00:00:00.000Z', '2026-10-09T00:00:00.000Z'),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('nextTask', () => {
  it('prefers work in progress, then the most urgent pending task', () => {
    const pendingHigh = task('p', 'PENDING', 'HIGH', '2026-10-01T00:00:00.000Z');
    const inProgressLow = task('i', 'IN_PROGRESS', 'LOW', '2026-10-03T00:00:00.000Z');
    const blocked = task('b', 'BLOCKED', 'HIGH', '2026-10-01T00:00:00.000Z');
    expect(nextTask([pendingHigh, inProgressLow, blocked])?.id).toBe('i');
    expect(nextTask([pendingHigh, blocked])?.id).toBe('p');
    expect(nextTask([blocked])).toBeUndefined();
  });
});

describe('filterAssignees', () => {
  const emp = (name: string, jobRoleId: string, status: 'ACTIVE' | 'DEACTIVATED' = 'ACTIVE') =>
    ({ id: name, name, email: `${name.toLowerCase()}@x.com`, jobRoleId, status }) as Employee;
  const list = [
    emp('Rahul', 'dev'),
    emp('Priya', 'design'),
    emp('Amit', 'dev'),
    emp('Old', 'dev', 'DEACTIVATED'),
  ];

  it('filters by role (pre-set from the task) and hides deactivated employees', () => {
    expect(filterAssignees(list, { jobRoleId: 'dev', query: '' }).map((e) => e.name)).toEqual([
      'Amit',
      'Rahul',
    ]);
    expect(filterAssignees(list, { jobRoleId: '', query: '' })).toHaveLength(3);
  });

  it('matches the typed text in the name or email, ignoring case', () => {
    expect(filterAssignees(list, { jobRoleId: '', query: ' PRI ' }).map((e) => e.name)).toEqual([
      'Priya',
    ]);
    expect(filterAssignees(list, { jobRoleId: 'design', query: 'rahul' })).toEqual([]);
  });
});
