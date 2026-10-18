import type { UserRole } from '@lk/shared';
import type { AuthSnapshot } from './session';

/** Where each role lands after login. */
export function homeFor(role: UserRole): string {
  return role === 'OWNER' ? '/owner' : '/me';
}

export type AccessDecision =
  { kind: 'wait' } | { kind: 'offline' } | { kind: 'redirect'; to: string } | { kind: 'allow' };

/**
 * Who may see a page. `required` is the role a page needs, or 'public-only' for the login and
 * registration pages (signed-in users go to their home instead). While the user is still
 * unknown nothing is rendered, so owner pages never flash for an employee.
 */
export function decideAccess(
  snapshot: AuthSnapshot,
  required: UserRole | 'public-only',
): AccessDecision {
  if (snapshot.status === 'unknown') return { kind: 'wait' };
  if (snapshot.status === 'offline') return { kind: 'offline' };
  const user = snapshot.status === 'signed-in' ? snapshot.user : null;
  if (required === 'public-only') {
    return user ? { kind: 'redirect', to: homeFor(user.role) } : { kind: 'allow' };
  }
  if (!user) return { kind: 'redirect', to: '/login' };
  if (user.role !== required) return { kind: 'redirect', to: homeFor(user.role) };
  return { kind: 'allow' };
}
