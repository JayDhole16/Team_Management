import { EmployeeSocketEvents, OwnerSocketEvents, type UserRole } from '@lk/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { authSession } from '../auth/session';
import { useToasts } from '../components/Toasts';
import { useAlertSoundOptional } from './AlertSoundProvider';
import { employeeEffects, ownerEffects, reconnectKeys, type RealtimeEffects } from './effects';
import { connectRealtime } from './socket';

const ConnectedContext = createContext(false);

/** True while the live connection is up (pages show "Live updates paused" otherwise). */
export function useRealtimeConnected(): boolean {
  return useContext(ConnectedContext);
}

/**
 * Connects Socket.IO for the signed-in user and turns events into refreshed data, toasts and
 * (owner) a beep. Polling on the pages stays as a fallback.
 */
export function RealtimeProvider({ role, children }: { role: UserRole; children: ReactNode }) {
  const queryClient = useQueryClient();
  const toasts = useToasts();
  const sound = useAlertSoundOptional();
  const [connected, setConnected] = useState(false);
  // The handlers change on every render; the connection must not.
  const handle = useRef<(fx: RealtimeEffects) => void>(() => undefined);
  useEffect(() => {
    handle.current = (fx) => {
      for (const key of fx.invalidate) void queryClient.invalidateQueries({ queryKey: [key] });
      if (fx.toast) toasts.show(fx.toast);
      if (fx.beep) sound?.beep();
    };
  });

  useEffect(() => {
    let everConnected = false;
    const disconnect = connectRealtime({
      events: role === 'OWNER' ? OwnerSocketEvents : EmployeeSocketEvents,
      getToken: () => authSession.getToken(),
      refresh: () => authSession.refresh(),
      onConnectedChange: (up) => {
        setConnected(up);
        if (!up) return;
        // Back after a gap (token renewal every 15 min, network): catch up on missed events.
        if (everConnected) {
          handle.current({ invalidate: reconnectKeys(role), toast: null, beep: false });
        }
        everConnected = true;
      },
      onEvent: (event, payload) => {
        // The payload passed its schema in connectRealtime.
        const fx =
          role === 'OWNER'
            ? ownerEffects({ event, payload } as Parameters<typeof ownerEffects>[0])
            : employeeEffects({ event, payload } as Parameters<typeof employeeEffects>[0]);
        handle.current(fx);
      },
    });
    return disconnect;
  }, [role]);

  return <ConnectedContext.Provider value={connected}>{children}</ConnectedContext.Provider>;
}
