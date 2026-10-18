import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="max-w-sm space-y-3 rounded-xl bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <Link to="/" className="inline-flex min-h-11 items-center text-blue-800">
          Go to the start page
        </Link>
      </div>
    </main>
  );
}
