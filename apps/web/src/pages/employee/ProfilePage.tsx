import { useQuery } from '@tanstack/react-query';
import { listJobRoles } from '../../api/jobRoles';
import { useUser } from '../../auth/AuthProvider';
import { Card, Notice, PageHeader } from '../../components/ui';
import { EMPLOYEE_LOGOUT_WARNING } from '../../layouts/EmployeeLayout';
import { LogoutButton } from '../../layouts/AppShell';
import { DEVICE_MODE_LABEL, roleLabel } from '../../lib/labels';

export function ProfilePage() {
  const user = useUser();
  const roles = useQuery({ queryKey: ['job-roles'], queryFn: listJobRoles });
  const rows: [string, string][] = [
    ['Name', user.name],
    ['Email', user.email],
    ['Job role', roleLabel(roles.data, user.jobRoleId)],
    ['Device type', user.deviceMode ? DEVICE_MODE_LABEL[user.deviceMode] : '—'],
    ['Face scan', user.faceEnrolled ? 'Enrolled' : 'Not enrolled yet'],
    ['Idle check', `every ${user.idleIntervalMin} min`],
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Profile" />
      <Card>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-gray-600">{label}</dt>
              <dd className="break-words text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Notice>
        To change your password, ask the owner for a reset code and use &ldquo;Forgot
        password&rdquo; on the login page. The desktop agent download comes in a later update.
      </Notice>
      <div className="md:hidden">
        <LogoutButton warning={EMPLOYEE_LOGOUT_WARNING} />
      </div>
    </div>
  );
}
