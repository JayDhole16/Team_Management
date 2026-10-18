import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { completePasswordReset } from '../../api/auth';
import { Button, ErrorBox, Field, Notice } from '../../components/ui';
import { validateNewPassword } from '../register/validateDetails';
import { PublicLayout } from './PublicLayout';

/** No email server: the owner issues a PASSWORD_RESET code and the employee enters it here. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);
  // gcTime 0 and reset() on success: the new password does not linger in the mutation cache.
  const reset = useMutation({ mutationFn: completePasswordReset, gcTime: 0 });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problems = validateNewPassword(email, password, confirm);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    reset.mutate(
      { email, code, newPassword: password },
      {
        onSuccess: () => {
          setDone(true);
          reset.reset();
        },
        onSettled: () => {
          setPassword('');
          setConfirm('');
        },
      },
    );
  }

  if (done) {
    return (
      <PublicLayout>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Password changed</h2>
          <p className="text-sm text-gray-700">
            You can now log in with your new password. You were signed out on every device.
          </p>
          <Link
            to="/login"
            className="flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-medium text-white"
          >
            Log in
          </Link>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <h2 className="text-lg font-semibold">Forgot password</h2>
        <Notice>Ask the owner for a reset code. It works once and only for 10 minutes.</Notice>
        <Field
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Reset code"
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters. Not a common password."
          value={password}
          error={errors.password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          label="New password again"
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <ErrorBox error={reset.error} />
        <Button
          type="submit"
          className="w-full"
          loading={reset.isPending}
          disabled={!email || !code || !password}
        >
          Change password
        </Button>
      </form>
    </PublicLayout>
  );
}
