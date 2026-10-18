import type { UserRole } from '@lk/shared';
import { Navigate, Outlet } from 'react-router';
import { Button, FullPageSpinner } from '../components/ui';
import { decideAccess } from './access';
import { useAuth } from './AuthProvider';

function OfflineScreen() {
  const { retry } = useAuth();
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="max-w-sm space-y-3 rounded-xl bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Cannot reach the server</h1>
        <p className="text-sm text-gray-600">Check your internet connection and try again.</p>
        <Button onClick={retry}>Try again</Button>
      </div>
    </main>
  );
}

/** Renders the child routes only for `role` (or, for 'public-only', only when signed out). */
export function RequireAccess({ role }: { role: UserRole | 'public-only' }) {
  const { snapshot } = useAuth();
  const decision = decideAccess(snapshot, role);
  switch (decision.kind) {
    case 'wait':
      return <FullPageSpinner />;
    case 'offline':
      return <OfflineScreen />;
    case 'redirect':
      return <Navigate to={decision.to} replace />;
    case 'allow':
      return <Outlet />;
  }
}
