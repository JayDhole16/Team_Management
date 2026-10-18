import type { Me } from '@lk/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import * as authApi from '../api/auth';
import { errorMessage } from '../api/errors';
import { startSession } from '../api/sessions';
import { authSession, type AuthSnapshot } from './session';

export interface LoginResult {
  user: Me;
  /** Set when the work session could not be started automatically after an employee login. */
  sessionWarning: string | null;
}

interface AuthApi {
  snapshot: AuthSnapshot;
  login(email: string, password: string): Promise<LoginResult>;
  logout(): Promise<void>;
  retry(): void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const snapshot = useSyncExternalStore(authSession.subscribe, authSession.getSnapshot);

  useEffect(() => {
    void authSession.bootstrap();
  }, []);

  // Never keep one user's data in the cache after they sign out or another user signs in
  // (shared office laptops).
  const userId = snapshot.user?.id ?? null;
  const previousUserId = useRef(userId);
  useEffect(() => {
    if (userId === null || userId !== previousUserId.current) queryClient.clear();
    previousUserId.current = userId;
  }, [userId, queryClient]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const session = await authApi.login({ email, password });
    let sessionWarning: string | null = null;
    if (session.user.role === 'EMPLOYEE') {
      // E-1: logging in starts the work session. Start it before the pages render, so My Day
      // shows the running timer straight away.
      authSession.stage(session);
      try {
        await startSession();
      } catch (err) {
        sessionWarning = `Your work session did not start: ${errorMessage(err)} Press Resume.`;
      }
    }
    authSession.setSession(session, sessionWarning);
    return { user: session.user, sessionWarning };
  }, []);

  // Throws if the server could not be reached; the user then stays signed in (see AuthSession.logout).
  const logout = useCallback(() => authSession.logout(() => authApi.logout()), []);

  const retry = useCallback(() => void authSession.bootstrap(), []);

  const value = useMemo(
    () => ({ snapshot, login, logout, retry }),
    [snapshot, login, logout, retry],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The signed-in user. Only call this inside a page guarded by RequireRole. */
export function useUser(): Me {
  const { snapshot } = useAuth();
  if (!snapshot.user) throw new Error('useUser called without a signed-in user');
  return snapshot.user;
}
