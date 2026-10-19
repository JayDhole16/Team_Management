import { Link } from 'react-router';
import { useUser } from '../../auth/AuthProvider';
import { Card, PageHeader } from '../../components/ui';
import { LogoutButton } from '../../layouts/AppShell';

/** The phone tab bar's "More": account and links that do not fit in the tab bar. */
export function MorePage() {
  const user = useUser();
  return (
    <div className="space-y-4">
      <PageHeader title="More" />
      <Card>
        <p className="font-medium">{user.name}</p>
        <p className="text-sm text-gray-600">{user.email}</p>
      </Card>
      {[
        { to: '/owner/projects', label: 'Projects' },
        { to: '/owner/invites', label: 'Invites and codes' },
      ].map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm"
        >
          {item.label}
        </Link>
      ))}
      <Link
        to="/status"
        className="flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm"
      >
        System status
      </Link>
      <div className="md:hidden">
        <LogoutButton />
      </div>
    </div>
  );
}
