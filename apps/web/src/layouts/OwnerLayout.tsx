import { useUnreadUpdates } from '../components/UpdateViews';
import { AppShell, type NavItem } from './AppShell';

export function OwnerLayout() {
  const unread = useUnreadUpdates().data?.count;
  const updates: NavItem = { to: '/owner/updates', label: 'Updates', badge: unread };
  const nav: NavItem[] = [
    { to: '/owner', label: 'Overview', end: true },
    { to: '/owner/projects', label: 'Projects' },
    { to: '/owner/tasks', label: 'Tasks' },
    updates,
    { to: '/owner/employees', label: 'Employees' },
    { to: '/owner/invites', label: 'Invites' },
  ];
  // Phone tab bar (docs/SCREENS.md): Live status and Alerts join in Phase 7 (Updates may then
  // move under More). Projects and Invites are under More.
  const tabs: NavItem[] = [
    { to: '/owner', label: 'Overview', end: true },
    { to: '/owner/tasks', label: 'Tasks' },
    updates,
    { to: '/owner/employees', label: 'Employees' },
    { to: '/owner/more', label: 'More' },
  ];
  return <AppShell nav={nav} tabs={tabs} />;
}
