import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

const links = [
  { to: '/login', label: 'Login' },
  { to: '/register', label: 'Register as employee' },
  { to: '/forgot-password', label: 'Forgot password' },
];

/** The login page's three links (docs/SCREENS.md §0) around one card. */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8 text-gray-900">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-center text-2xl font-semibold">Leaders Key</h1>
        <nav
          aria-label="Account"
          className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 shadow-sm"
        >
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex min-h-11 items-center justify-center rounded-lg px-2 text-center text-sm ${isActive ? 'bg-blue-700 font-medium text-white' : 'text-gray-700 hover:bg-gray-50'}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="rounded-xl bg-white p-5 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
