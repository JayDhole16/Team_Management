import { EventEmitter } from 'node:events';
import type { Alert, DeviceMode, LiveStatus, SecurityAlertKind, TaskStatus } from '@lk/shared';

/**
 * In-process events. `realtime/socket.ts` forwards the owner/employee ones over Socket.IO
 * (ids and names only), `services/push.service.ts` turns `alert:created` into phone pushes.
 */
export interface AppEvents {
  'employee:registered': {
    userId: string;
    name: string;
    email: string;
    phone: string;
    jobRoleId: string;
    deviceMode: DeviceMode;
    at: string;
  };
  /** Raised by the code, login and registration services. Stored as an alert, then
   *  announced as `alert:created`. `message` is written by the server, never user text. */
  'security:alert': {
    kind: SecurityAlertKind;
    message: string;
    at: string;
  };
  /** A task was sent (or re-sent) to an employee. Phase 7 shows the employee a toast. */
  'task:assigned': {
    taskId: string;
    assigneeId: string;
    previousAssigneeId: string | null;
    at: string;
  };
  /** The employee changed a task's status. Phase 7 updates the owner's board live. */
  'task:status-changed': {
    taskId: string;
    assigneeId: string;
    from: TaskStatus;
    to: TaskStatus;
    at: string;
  };
  /** An employee sent a progress update. Phase 7 refreshes the owner's unread count live.
   *  Ids only: the text never goes on the bus. */
  'update:sent': {
    updateId: string;
    employeeId: string;
    at: string;
  };
  /** A new idle or security alert was stored (owner toast, beep, push). */
  'alert:created': { alert: Alert };
  /** The owner acknowledged alerts (other owner tabs and phones update). */
  'alert:acked': { at: string };
  /** Something that can change an employee's live status happened (session, heartbeat,
   *  idle alert). The live tracker recomputes and emits `status:changed` if it changed. */
  'presence:changed': { userId: string };
  'status:changed': { userId: string; status: LiveStatus; agentRunning: boolean; at: string };
  /** Their open sockets are closed at once. */
  'employee:deactivated': { userId: string };
}

export interface EventBus {
  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void;
  on<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void): () => void;
}

export function createEventBus(): EventBus {
  const emitter = new EventEmitter();
  return {
    emit(event, payload) {
      emitter.emit(event, payload);
    },
    on(event, listener) {
      emitter.on(event, listener);
      return () => emitter.off(event, listener);
    },
  };
}
