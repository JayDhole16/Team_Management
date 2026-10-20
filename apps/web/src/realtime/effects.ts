import {
  IDLE_REASON_LABELS,
  type EmployeeSocketEventMap,
  type OwnerSocketEventMap,
} from '@lk/shared';
import type { ToastSpec } from '../components/Toasts';
import { DEVICE_MODE_LABEL } from '../lib/labels';

/** Query keys refreshed by live events (first key element; TanStack matches by prefix). */
export const LIVE_KEY = ['live'] as const;
export const ALERTS_KEY = ['alerts'] as const;
export const OPEN_ALERTS_KEY = ['alerts-open'] as const;

/** What the page does for one socket event. Pure, so the mapping has unit tests. */
export interface RealtimeEffects {
  invalidate: string[];
  toast: ToastSpec | null;
  beep: boolean;
}

const none = (...invalidate: string[]): RealtimeEffects => ({
  invalidate,
  toast: null,
  beep: false,
});

type OwnerEvent = {
  [K in keyof OwnerSocketEventMap]: { event: K; payload: OwnerSocketEventMap[K] };
}[keyof OwnerSocketEventMap];

type EmployeeEvent = {
  [K in keyof EmployeeSocketEventMap]: { event: K; payload: EmployeeSocketEventMap[K] };
}[keyof EmployeeSocketEventMap];

export function ownerEffects(e: OwnerEvent): RealtimeEffects {
  switch (e.event) {
    case 'status:changed':
      return none('live');
    case 'idle:alert':
      return {
        invalidate: ['live', 'alerts', 'alerts-open'],
        toast: {
          title: 'Idle alert',
          body: `${e.payload.name}: ${IDLE_REASON_LABELS[e.payload.reason]}`,
          tone: 'alert',
          link: { to: '/owner/alerts', label: 'Open alerts' },
          sticky: true,
        },
        beep: true,
      };
    case 'security:alert':
      return {
        invalidate: ['alerts', 'alerts-open'],
        toast: {
          title: 'Security alert',
          body: e.payload.message,
          tone: 'alert',
          link: { to: '/owner/alerts', label: 'Open alerts' },
          sticky: true,
        },
        beep: true,
      };
    case 'employee:registered':
      return {
        invalidate: ['employees', 'live'],
        toast: {
          title: 'New employee registered',
          body: `${e.payload.name} · ${e.payload.jobRole ?? 'No role'} · ${DEVICE_MODE_LABEL[e.payload.deviceMode]}`,
          tone: 'info',
          link: { to: `/owner/employees/${e.payload.userId}`, label: 'See employee' },
          sticky: false,
        },
        beep: false,
      };
    case 'update:new':
      return none('updates', 'updates-unread');
    case 'task:status-changed':
      return none('tasks', 'projects', 'project');
    case 'alert:acked':
      return none('alerts', 'alerts-open');
    case 'alert:stored':
      return none('alerts', 'alerts-open', 'live');
  }
}

/** After a reconnect: events may have been missed while the socket was down. */
export function reconnectKeys(role: 'OWNER' | 'EMPLOYEE'): string[] {
  return role === 'OWNER'
    ? ['live', 'alerts', 'alerts-open', 'updates', 'updates-unread', 'tasks']
    : ['my-tasks'];
}

export function employeeEffects(e: EmployeeEvent): RealtimeEffects {
  switch (e.event) {
    case 'task:assigned':
      return {
        invalidate: ['my-tasks'],
        toast: {
          title: 'New task assigned',
          body: 'The owner sent you a task.',
          tone: 'info',
          link: { to: '/me/tasks', label: 'Open My tasks' },
          sticky: false,
        },
        beep: false,
      };
  }
}
