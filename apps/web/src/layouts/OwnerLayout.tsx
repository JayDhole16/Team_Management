import { AppShell, type NavItem } from './AppShell';

const nav: NavItem[] = [
  { to: '/owner', label: 'Overview', end: true },
  { to: '/owner/projects', label: 'Projects' },
  { to: '/owner/tasks', label: 'Tasks' },
  { to: '/owner/employees', label: 'Employees' },
  { to: '/owner/invites', label: 'Invites' },
];

// Phone tab bar (docs/SCREENS.md): Live status and Alerts join in Phase 7. Projects and
// Invites are under More.
const tabs: NavItem[] = [
  { to: '/owner', label: 'Overview', end: true },
  { to: '/owner/tasks', label: 'Tasks' },
  { to: '/owner/employees', label: 'Employees' },
  { to: '/owner/more', label: 'More' },
];

export function OwnerLayout() {
  return <AppShell nav={nav} tabs={tabs} />;
}
