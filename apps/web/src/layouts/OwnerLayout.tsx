import { AppShell, type NavItem } from './AppShell';

const nav: NavItem[] = [
  { to: '/owner', label: 'Overview', end: true },
  { to: '/owner/employees', label: 'Employees' },
  { to: '/owner/invites', label: 'Invites' },
];

// Later phases add Live status, Tasks, Alerts and the rest (docs/SCREENS.md).
const tabs: NavItem[] = [...nav, { to: '/owner/more', label: 'More' }];

export function OwnerLayout() {
  return <AppShell nav={nav} tabs={tabs} />;
}
