import {
  ProjectDetailSchema,
  ProjectSchema,
  TaskSchema,
  type Project,
  type ProjectCreateBody,
  type ProjectDetail,
  type ProjectPatchBody,
  type Task,
  type TaskCreateBody,
} from '@lk/shared';
import { z } from 'zod';
import { apiGet, apiPatch, apiPost } from './client';

const path = (id: string) => `/projects/${encodeURIComponent(id)}`;

export const listProjects = (): Promise<Project[]> => apiGet('/projects', z.array(ProjectSchema));

export const getProject = (id: string): Promise<ProjectDetail> =>
  apiGet(path(id), ProjectDetailSchema);

export const createProject = (body: ProjectCreateBody): Promise<ProjectDetail> =>
  apiPost('/projects', ProjectDetailSchema, body);

export const updateProject = (id: string, body: ProjectPatchBody): Promise<ProjectDetail> =>
  apiPatch(path(id), ProjectDetailSchema, body);

export const addProjectTask = (id: string, body: TaskCreateBody): Promise<Task> =>
  apiPost(`${path(id)}/tasks`, TaskSchema, body);
