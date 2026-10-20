import { ToastProvider } from '../components/Toasts';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import { AppShell, type NavItem } from './AppShell';

const nav: NavItem[] = [
  { to: '/me', label: 'My Day', end: true },
  { to: '/me/tasks', label: 'My tasks' },
  { to: '/me/updates', label: 'Updates' },
  { to: '/me/hours', label: 'My hours' },
  { to: '/me/profile', label: 'Profile' },
];

export const EMPLOYEE_LOGOUT_WARNING = 'Logging out ends your work session. Log out now?';

export function EmployeeLayout() {
  return (
    <ToastProvider>
      <RealtimeProvider role="EMPLOYEE">
        <AppShell nav={nav} tabs={nav} logoutWarning={EMPLOYEE_LOGOUT_WARNING} />
      </RealtimeProvider>
    </ToastProvider>
  );
}
