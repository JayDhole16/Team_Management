import { createBrowserRouter, Navigate } from 'react-router';
import { homeFor } from '../auth/access';
import { useAuth } from '../auth/AuthProvider';
import { RequireAccess } from '../auth/guards';
import { FullPageSpinner } from '../components/ui';
import { EmployeeLayout } from '../layouts/EmployeeLayout';
import { OwnerLayout } from '../layouts/OwnerLayout';
import { MyDayPage } from '../pages/employee/MyDayPage';
import { MyHoursPage } from '../pages/employee/MyHoursPage';
import { MyTasksPage } from '../pages/employee/MyTasksPage';
import { ProfilePage } from '../pages/employee/ProfilePage';
import { UpdatesPage as MyUpdatesPage } from '../pages/employee/UpdatesPage';
import { HealthPage } from '../pages/HealthPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { AlertsPage } from '../pages/owner/AlertsPage';
import { EmployeeDetailPage } from '../pages/owner/EmployeeDetailPage';
import { EmployeesPage } from '../pages/owner/EmployeesPage';
import { InvitesPage } from '../pages/owner/InvitesPage';
import { LivePage } from '../pages/owner/LivePage';
import { MorePage } from '../pages/owner/MorePage';
import { OverviewPage } from '../pages/owner/OverviewPage';
import { NewProjectPage } from '../pages/owner/projects/NewProjectPage';
import { ProjectDetailPage } from '../pages/owner/projects/ProjectDetailPage';
import { ProjectsPage } from '../pages/owner/projects/ProjectsPage';
import { TasksPage } from '../pages/owner/TasksPage';
import { UpdatesPage } from '../pages/owner/UpdatesPage';
import { ForgotPasswordPage } from '../pages/public/ForgotPasswordPage';
import { LoginPage } from '../pages/public/LoginPage';
import { RegisterPage } from '../pages/register/RegisterPage';

/** "/" sends each user to their own home. */
function RootRedirect() {
  const { snapshot } = useAuth();
  if (snapshot.status === 'unknown') return <FullPageSpinner />;
  return <Navigate to={snapshot.user ? homeFor(snapshot.user.role) : '/login'} replace />;
}

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/status', element: <HealthPage /> },
  {
    element: <RequireAccess role="public-only" />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  {
    element: <RequireAccess role="OWNER" />,
    children: [
      {
        path: '/owner',
        element: <OwnerLayout />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'live', element: <LivePage /> },
          { path: 'alerts', element: <AlertsPage /> },
          { path: 'employees', element: <EmployeesPage /> },
          { path: 'employees/:id', element: <EmployeeDetailPage /> },
          { path: 'invites', element: <InvitesPage /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'projects/new', element: <NewProjectPage /> },
          { path: 'projects/:id', element: <ProjectDetailPage /> },
          { path: 'tasks', element: <TasksPage /> },
          { path: 'updates', element: <UpdatesPage /> },
          { path: 'more', element: <MorePage /> },
        ],
      },
    ],
  },
  {
    element: <RequireAccess role="EMPLOYEE" />,
    children: [
      {
        path: '/me',
        element: <EmployeeLayout />,
        children: [
          { index: true, element: <MyDayPage /> },
          { path: 'tasks', element: <MyTasksPage /> },
          { path: 'updates', element: <MyUpdatesPage /> },
          { path: 'hours', element: <MyHoursPage /> },
          { path: 'profile', element: <ProfilePage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
