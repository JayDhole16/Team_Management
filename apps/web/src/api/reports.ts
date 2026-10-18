import {
  MonthHoursSchema,
  TodayHoursSchema,
  type HoursQuery,
  type MonthHours,
  type TodayHours,
  type TodayHoursQuery,
} from '@lk/shared';
import { apiGet } from './client';
import { toQuery } from './query';

/** The owner must pass `userId`; an employee reads their own hours. */
export const fetchTodayHours = (query: TodayHoursQuery = {}): Promise<TodayHours> =>
  apiGet(`/reports/hours/today${toQuery(query)}`, TodayHoursSchema);

export const fetchMonthHours = (query: HoursQuery = {}): Promise<MonthHours> =>
  apiGet(`/reports/hours${toQuery(query)}`, MonthHoursSchema);
