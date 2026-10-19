import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth, useUser } from '../auth/AuthProvider';
import { Button, ErrorBox } from '../components/ui';

export interface NavItem {
  to: string;
  label: string;
  /** Match only this exact path (for the section home). */
  end?: boolean;
  /** A count shown next to the label (e.g. unread updates); hidden when 0 or missing. */
  badge?: number | undefined;
}

function NavBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <span
      className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-blue-700 px-1.5 text-xs font-semibold text-white"
      aria-label={`${count} new`}
      data-testid="nav-badge"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Left menu from 768 px up; a bottom tab bar on phones. Only pages that exist are listed.
 */
export function AppShell({
  nav,
  tabs,
  logoutWarning,
}: {
  nav: NavItem[];
  tabs: NavItem[];
  logoutWarning?: string;
}) {
  const user = useUser();
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
        <span className="font-semibold">Leaders Key</span>
        <span className="truncate pl-4 text-sm text-gray-600">{user.name}</span>
      </header>
      <div className="mx-auto flex max-w-6xl">
        <nav
          aria-label="Main"
          className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col gap-1 border-r border-gray-200 bg-white p-3 md:flex"
        >
          {nav.map((item) => (
            <SideLink key={item.to} item={item} />
          ))}
          <div className="mt-auto">
            <LogoutButton warning={logoutWarning} />
          </div>
        </nav>
        <main className="min-w-0 flex-1 px-4 pt-4 pb-24 md:px-6 md:pb-8">
          <Outlet />
        </main>
      </div>
      <nav
        aria-label="Tabs"
        className="fixed inset-x-0 bottom-0 z-10 grid border-t border-gray-200 bg-white md:hidden"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        data-testid="tab-bar"
      >
        {tabs.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? false}
            className={({ isActive }) =>
              `flex min-h-14 items-center justify-center px-1 text-sm ${isActive ? 'font-semibold text-blue-800' : 'text-gray-600'}`
            }
          >
            {item.label}
            <NavBadge count={item.badge} />
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      className={({ isActive }) =>
        `flex min-h-11 items-center rounded-lg px-3 text-sm ${isActive ? 'bg-blue-50 font-semibold text-blue-800' : 'text-gray-700 hover:bg-gray-50'}`
      }
    >
      {item.label}
      <NavBadge count={item.badge} />
    </NavLink>
  );
}

export function LogoutButton({
  warning,
  children,
}: {
  warning?: string | undefined;
  children?: ReactNode;
}) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function onClick() {
    if (warning && !window.confirm(warning)) return;
    setBusy(true);
    setFailed(false);
    try {
      await logout();
      void navigate('/login', { replace: true });
    } catch {
      // Still signed in on the server: do not pretend otherwise on a shared laptop.
      setFailed(true);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      {failed && (
        <ErrorBox error="Could not log out: the server cannot be reached. Check your connection and press Log out again." />
      )}
      <Button variant="secondary" className="w-full" loading={busy} onClick={() => void onClick()}>
        {children ?? 'Log out'}
      </Button>
    </div>
  );
}
