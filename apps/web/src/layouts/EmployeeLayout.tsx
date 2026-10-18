import { AppShell, type NavItem } from './AppShell';

const nav: NavItem[] = [
  { to: '/me', label: 'My Day', end: true },
  { to: '/me/hours', label: 'My hours' },
  { to: '/me/profile', label: 'Profile' },
];

export const EMPLOYEE_LOGOUT_WARNING = 'Logging out ends your work session. Log out now?';

export function EmployeeLayout() {
  return <AppShell nav={nav} tabs={nav} logoutWarning={EMPLOYEE_LOGOUT_WARNING} />;
}
