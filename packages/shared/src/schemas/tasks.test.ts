const randomUUID = () => '3f1c2a9e-7b4d-4c1e-9a2b-5d6e7f8a9b0c';
import { describe, expect, it } from 'vitest';
import {
  canEmployeeSetStatus,
  DirectTaskBodySchema,
  employeeTaskActions,
  PROJECT_MAX_TASKS,
  ProjectCreateBodySchema,
  TASK_STATUSES,
  TaskPatchBodySchema,
  TaskStatusBodySchema,
  type TaskStatus,
} from './tasks';

describe('employee task actions', () => {
  it('offers the agreed buttons for each status', () => {
    const labels = (s: TaskStatus) => employeeTaskActions(s).map((a) => a.label);
    expect(labels('PENDING')).toEqual(['Start', 'Mark blocked', 'Complete']);
    expect(labels('IN_PROGRESS')).toEqual(['Mark blocked', 'Complete']);
    expect(labels('BLOCKED')).toEqual(['Resume', 'Complete']);
    expect(labels('COMPLETED')).toEqual(['Reopen']);
  });

  it('allows exactly the changes the buttons offer, never a no-op', () => {
    const allowed: string[] = [];
    for (const from of TASK_STATUSES) {
      for (const to of TASK_STATUSES) {
        if (canEmployeeSetStatus(from, to)) allowed.push(`${from}>${to}`);
      }
    }
    expect(allowed.sort()).toEqual(
      [
        'PENDING>IN_PROGRESS',
        'PENDING>BLOCKED',
        'PENDING>COMPLETED',
        'IN_PROGRESS>BLOCKED',
        'IN_PROGRESS>COMPLETED',
        'BLOCKED>IN_PROGRESS',
        'BLOCKED>COMPLETED',
        'COMPLETED>IN_PROGRESS',
      ].sort(),
    );
  });
});

describe('task status body', () => {
  it('needs a reason for BLOCKED', () => {
    expect(TaskStatusBodySchema.safeParse({ status: 'BLOCKED' }).success).toBe(false);
    expect(TaskStatusBodySchema.safeParse({ status: 'BLOCKED', reason: '  ab ' }).success).toBe(
      false,
    );
    expect(
      TaskStatusBodySchema.parse({ status: 'BLOCKED', reason: ' Waiting for logo files ' }),
    ).toEqual({ status: 'BLOCKED', reason: 'Waiting for logo files' });
    expect(TaskStatusBodySchema.safeParse({ status: 'COMPLETED' }).success).toBe(true);
  });

  it('rejects NUL, other control characters and bidi overrides, keeps newlines', () => {
    for (const bad of ['Waiting\u0000 here', 'Wait\u0007ing', 'Wait \u202Eereh']) {
      expect(TaskStatusBodySchema.safeParse({ status: 'BLOCKED', reason: bad }).success).toBe(
        false,
      );
    }
    expect(
      TaskStatusBodySchema.safeParse({ status: 'BLOCKED', reason: 'Line one\n\tLine two' }).success,
    ).toBe(true);
  });

  it('rejects unknown statuses and fields', () => {
    expect(TaskStatusBodySchema.safeParse({ status: 'DONE' }).success).toBe(false);
    expect(
      TaskStatusBodySchema.safeParse({ status: 'COMPLETED', assigneeId: randomUUID() }).success,
    ).toBe(false);
  });
});

describe('project and task bodies', () => {
  const task = {
    title: 'Cart page',
    descriptionTechnical: 'Build the cart.',
    jobRoleId: null,
    priority: 'HIGH',
    source: 'MANUAL',
  };

  it('accepts a project typed by hand without a brief', () => {
    const body = ProjectCreateBodySchema.parse({
      title: ' Store ',
      summaryTechnical: 'Online store',
      tasks: [task],
    });
    expect(body.title).toBe('Store');
    expect(body.briefOriginal).toBeUndefined();
  });

  it('caps the number of tasks and rejects DIRECT as a project task source', () => {
    const many = Array.from({ length: PROJECT_MAX_TASKS + 1 }, () => task);
    expect(
      ProjectCreateBodySchema.safeParse({ title: 'Store', summaryTechnical: 'x', tasks: many })
        .success,
    ).toBe(false);
    expect(
      ProjectCreateBodySchema.safeParse({
        title: 'Store',
        summaryTechnical: 'x',
        tasks: [{ ...task, source: 'DIRECT' }],
      }).success,
    ).toBe(false);
  });

  it('task patch needs at least one field and cannot set the status or assignee', () => {
    expect(TaskPatchBodySchema.safeParse({}).success).toBe(false);
    expect(TaskPatchBodySchema.safeParse({ status: 'COMPLETED' }).success).toBe(false);
    expect(TaskPatchBodySchema.safeParse({ assigneeId: randomUUID() }).success).toBe(false);
    expect(TaskPatchBodySchema.safeParse({ priority: 'LOW' }).success).toBe(true);
  });

  it('direct task needs the plain text and the technical version', () => {
    const base = {
      assigneeId: randomUUID(),
      textOriginal: 'Login page theek karo',
      title: 'Fix login',
      descriptionTechnical: 'Steps',
      priority: 'MEDIUM',
    };
    expect(DirectTaskBodySchema.safeParse(base).success).toBe(true);
    expect(DirectTaskBodySchema.safeParse({ ...base, textOriginal: '' }).success).toBe(false);
    expect(DirectTaskBodySchema.safeParse({ ...base, descriptionTechnical: ' ' }).success).toBe(
      false,
    );
  });
});
