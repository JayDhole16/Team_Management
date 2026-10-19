import { EventEmitter } from 'node:events';
import type { DeviceMode, TaskStatus } from '@lk/shared';

/**
 * In-process events for the owner. Socket.IO (Phase 7) subscribes to this bus and pushes
 * them to the owner room; until then they are only logged and kept in audit_log.
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
  'security:alert': {
    kind:
      | 'CLAIM_FAILURE_CAP'
      | 'CLAIM_IP_BLOCKED'
      | 'RECOVERY_IP_BLOCKED'
      | 'LOGIN_ACCOUNT_LOCKED'
      | 'REFRESH_TOKEN_REUSE'
      | 'DUPLICATE_FACE';
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
