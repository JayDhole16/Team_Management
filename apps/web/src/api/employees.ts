import {
  EmployeeSchema,
  type Employee,
  type EmployeeListQuery,
  type EmployeePatchBody,
} from '@lk/shared';
import { z } from 'zod';
import { apiGet, apiPatch, apiPost } from './client';
import { toQuery } from './query';

export const listEmployees = (query: EmployeeListQuery = {}): Promise<Employee[]> =>
  apiGet(`/employees${toQuery(query)}`, z.array(EmployeeSchema));

export const getEmployee = (id: string): Promise<Employee> =>
  apiGet(`/employees/${encodeURIComponent(id)}`, EmployeeSchema);

export const updateEmployee = (id: string, body: EmployeePatchBody): Promise<Employee> =>
  apiPatch(`/employees/${encodeURIComponent(id)}`, EmployeeSchema, body);

export const deactivateEmployee = (id: string): Promise<Employee> =>
  apiPost(`/employees/${encodeURIComponent(id)}/deactivate`, EmployeeSchema);

export const reactivateEmployee = (id: string): Promise<Employee> =>
  apiPost(`/employees/${encodeURIComponent(id)}/reactivate`, EmployeeSchema);
