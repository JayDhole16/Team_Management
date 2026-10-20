import { useEffect } from 'react';
import { SoundButton, useOpenAlertCount } from '../components/AlertViews';
import { ToastProvider } from '../components/Toasts';
import { useUnreadUpdates } from '../components/UpdateViews';
import { registerServiceWorker } from '../lib/push';
import { AlertSoundProvider } from '../realtime/AlertSoundProvider';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import { AppShell, type NavItem } from './AppShell';

export function OwnerLayout() {
  useEffect(() => registerServiceWorker(), []);
  return (
    <ToastProvider>
      <AlertSoundProvider>
        <RealtimeProvider role="OWNER">
          <OwnerShell />
        </RealtimeProvider>
      </AlertSoundProvider>
    </ToastProvider>
  );
}

function OwnerShell() {
  const unread = useUnreadUpdates().data?.count;
  const open = useOpenAlertCount().data?.count;
  const alerts: NavItem = { to: '/owner/alerts', label: 'Alerts', badge: open };
  const nav: NavItem[] = [
    { to: '/owner', label: 'Overview', end: true },
    { to: '/owner/live', label: 'Live status' },
    alerts,
    { to: '/owner/projects', label: 'Projects' },
    { to: '/owner/tasks', label: 'Tasks' },
    { to: '/owner/updates', label: 'Updates', badge: unread },
    { to: '/owner/employees', label: 'Employees' },
    { to: '/owner/invites', label: 'Invites' },
  ];
  // Phone tab bar (docs/SCREENS.md): Updates, Employees, Projects and Invites are under More,
  // whose badge counts unread updates.
  const tabs: NavItem[] = [
    { to: '/owner', label: 'Overview', end: true },
    { to: '/owner/live', label: 'Live' },
    alerts,
    { to: '/owner/tasks', label: 'Tasks' },
    { to: '/owner/more', label: 'More', badge: unread },
  ];
  return <AppShell nav={nav} tabs={tabs} headerExtra={<SoundButton compact />} />;
}
