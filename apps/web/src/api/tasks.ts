import {
  MyTaskSchema,
  TaskSchema,
  type DirectTaskBody,
  type MyTask,
  type Task,
  type TaskListQuery,
  type TaskPatchBody,
  type TaskStatusBody,
} from '@lk/shared';
import { z } from 'zod';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import { toQuery } from './query';

const path = (id: string) => `/tasks/${encodeURIComponent(id)}`;

/** Owner board: sent tasks only. */
export const listTasks = (query: TaskListQuery = {}): Promise<Task[]> =>
  apiGet(`/tasks${toQuery(query)}`, z.array(TaskSchema));

export const listMyTasks = (): Promise<MyTask[]> => apiGet('/tasks/mine', z.array(MyTaskSchema));

export const createDirectTask = (body: DirectTaskBody): Promise<Task> =>
  apiPost('/tasks/direct', TaskSchema, body);

export const updateTask = (id: string, body: TaskPatchBody): Promise<Task> =>
  apiPatch(path(id), TaskSchema, body);

export const deleteTask = (id: string): Promise<{ ok: true }> =>
  apiDelete(path(id), z.object({ ok: z.literal(true) }));

export const assignTask = (id: string, assigneeId: string): Promise<Task> =>
  apiPost(`${path(id)}/assign`, TaskSchema, { assigneeId });

export const setTaskStatus = (id: string, body: TaskStatusBody): Promise<MyTask> =>
  apiPost(`${path(id)}/status`, MyTaskSchema, body);
