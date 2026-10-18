import { JobRoleSchema, type JobRole } from '@lk/shared';
import { z } from 'zod';
import { apiGet } from './client';

export const listJobRoles = (): Promise<JobRole[]> => apiGet('/job-roles', z.array(JobRoleSchema));
