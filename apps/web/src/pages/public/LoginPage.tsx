import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { homeFor } from '../../auth/access';
import { useAuth } from '../../auth/AuthProvider';
import { Button, ErrorBox, Field, Notice } from '../../components/ui';
import { PublicLayout } from './PublicLayout';

export function LoginPage() {
  const { login, snapshot } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await login(email, password);
      void navigate(homeFor(user.role), { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <PublicLayout>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
        <h2 className="text-lg font-semibold">Log in</h2>
        {snapshot.notice && <Notice tone="amber">{snapshot.notice}</Notice>}
        <Field
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <ErrorBox error={error} />
        <Button type="submit" className="w-full" loading={busy} disabled={!email || !password}>
          Log in
        </Button>
      </form>
    </PublicLayout>
  );
}
