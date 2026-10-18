import { EventEmitter } from 'node:events';
import type { DeviceMode } from '@lk/shared';

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
