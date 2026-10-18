import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useBlocker } from 'react-router';
import { ApiError } from '../../api/errors';
import { claimCode, completeRegistration, fetchConsent } from '../../api/register';
import { Button, ErrorBox, Field, Notice, SelectField, Spinner } from '../../components/ui';
import { formatTime } from '../../lib/time';
import { PublicLayout } from '../public/PublicLayout';
import { validateDetails, type DetailErrors } from './validateDetails';
import {
  STEP_ORDER,
  STEP_TITLES,
  buildCompleteBody,
  claimErrorMessage,
  initialWizard,
  wizardReducer,
  type Details,
  type WizardAction,
  type WizardState,
} from './wizardState';

/**
 * Employee registration (docs/ONBOARDING_FLOW.md): one step per screen. Everything typed stays
 * in this component's memory; nothing is saved on the server until the last step succeeds.
 */
export function RegisterPage() {
  const [state, dispatch] = useReducer(wizardReducer, initialWizard);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new step's heading so screen readers and keyboards follow along.
  useEffect(() => {
    headingRef.current?.focus();
  }, [state.step]);

  // Leaving the page mid-way loses the claimed code, so warn first.
  const inProgress = state.step !== 'code' && state.step !== 'done';
  useEffect(() => {
    if (!inProgress) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [inProgress]);

  // Leaving inside the app (Login tab, browser Back) also loses the code: ask first.
  const blocker = useBlocker(inProgress);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const leave = window.confirm(
      'Leave registration? Your code is already used, so you will need a new code from the owner.',
    );
    if (leave) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  const index = STEP_ORDER.indexOf(state.step) + 1;

  return (
    <PublicLayout>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
            Step {index} of {STEP_ORDER.length}
          </p>
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
            {STEP_TITLES[state.step]}
          </h2>
        </div>
        {state.claim && inProgress && (
          <p className="text-xs text-gray-600">
            Finish by {formatTime(state.claim.expiresAt)}. Do not refresh or close this page.
          </p>
        )}
        {state.step === 'code' && <CodeStep error={state.error} dispatch={dispatch} />}
        {state.step === 'details' && <DetailsStep state={state} dispatch={dispatch} />}
        {state.step === 'consent' && <ConsentStep state={state} dispatch={dispatch} />}
        {state.step === 'face' && <FaceStep state={state} dispatch={dispatch} />}
        {state.step === 'done' && <DoneStep state={state} />}
      </div>
    </PublicLayout>
  );
}

type StepProps = { state: WizardState; dispatch: Dispatch<WizardAction> };

function CodeStep({ error, dispatch }: { error: string | null; dispatch: Dispatch<WizardAction> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(error);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      dispatch({ type: 'claimed', claim: await claimCode(code) });
    } catch (err) {
      setMessage(claimErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
      <p className="text-sm text-gray-700">
        Enter the 8-character code the owner gave you. It works once and only for 10 minutes.
      </p>
      <Field
        label="Access code"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="XXXX-XXXX"
        className="font-mono"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <ErrorBox error={message} />
      <Button type="submit" className="w-full" loading={busy} disabled={code.trim().length === 0}>
        Continue
      </Button>
    </form>
  );
}

function DetailsStep({ state, dispatch }: StepProps) {
  const claim = state.claim;
  const [d, setD] = useState<Details>(state.details);
  const [errors, setErrors] = useState<DetailErrors>({});
  if (!claim) return null;

  const set =
    <K extends keyof Details>(key: K) =>
    (value: Details[K]) =>
      setD((prev) => ({ ...prev, [key]: value }));
  const roleLocked = claim.presetJobRoleId !== null;
  const isCompanyMac = claim.deviceMode === 'COMPANY_MACBOOK';

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problems = validateDetails(d);
    setErrors(problems);
    if (Object.keys(problems).length === 0) dispatch({ type: 'details', details: d });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <ErrorBox error={state.error} />
      <Field
        label="Full name"
        autoComplete="name"
        value={d.name}
        error={errors.name}
        onChange={(e) => set('name')(e.target.value)}
      />
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        value={d.email}
        error={errors.email}
        onChange={(e) => set('email')(e.target.value)}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters. Not a common password, and not your email name."
        value={d.password}
        error={errors.password}
        onChange={(e) => set('password')(e.target.value)}
      />
      <Field
        label="Password again"
        type="password"
        autoComplete="new-password"
        value={d.passwordConfirm}
        error={errors.passwordConfirm}
        onChange={(e) => set('passwordConfirm')(e.target.value)}
      />
      <SelectField
        label="Job role"
        value={d.jobRoleId}
        disabled={roleLocked}
        hint={roleLocked ? 'Set by the owner.' : undefined}
        error={errors.jobRoleId}
        onChange={(e) => set('jobRoleId')(e.target.value)}
      >
        <option value="">Choose your role</option>
        {claim.jobRoles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.label}
          </option>
        ))}
      </SelectField>
      <Field
        label="Phone"
        type="tel"
        autoComplete="tel"
        value={d.phone}
        error={errors.phone}
        onChange={(e) => set('phone')(e.target.value)}
      />
      <Field
        label="Emergency contact name"
        value={d.emergencyContactName}
        error={errors.emergencyContactName}
        onChange={(e) => set('emergencyContactName')(e.target.value)}
      />
      <Field
        label="Emergency contact phone"
        type="tel"
        value={d.emergencyContactPhone}
        error={errors.emergencyContactPhone}
        onChange={(e) => set('emergencyContactPhone')(e.target.value)}
      />
      <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-sm text-gray-800">
          Device type: <strong>{isCompanyMac ? 'Company MacBook' : 'Personal laptop'}</strong> (set
          by the owner)
        </p>
        <Checkbox
          checked={d.deviceConfirmed}
          onChange={set('deviceConfirmed')}
          error={errors.deviceConfirmed}
        >
          {isCompanyMac ? 'This is the MacBook Leaders Key gave me' : 'This is my own laptop'}
        </Checkbox>
      </div>
      <Button type="submit" className="w-full">
        Continue
      </Button>
    </form>
  );
}

function ConsentStep({ state, dispatch }: StepProps) {
  const consent = useQuery({ queryKey: ['consent'], queryFn: fetchConsent, staleTime: Infinity });
  const [accepted, setAccepted] = useState(false);

  if (consent.isPending) return <Spinner label="Loading…" />;
  if (consent.isError) {
    return (
      <div className="space-y-3">
        <ErrorBox error={consent.error} />
        <Button variant="secondary" onClick={() => void consent.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  const { version, text } = consent.data;

  return (
    <div className="space-y-4">
      <ErrorBox error={state.error} />
      <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
        {/* Plain text paragraphs, never HTML. */}
        {text.split('\n\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
      <Checkbox checked={accepted} onChange={setAccepted}>
        I have read this and I agree
      </Checkbox>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => dispatch({ type: 'back' })}>
          Back
        </Button>
        <Button disabled={!accepted} onClick={() => dispatch({ type: 'consent', version })}>
          Continue
        </Button>
      </div>
    </div>
  );
}

function FaceStep({ state, dispatch }: StepProps) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const required = state.claim?.faceEnrollmentRequired ?? false;

  async function finish() {
    setBusy(true);
    try {
      const result = await completeRegistration(buildCompleteBody(state));
      dispatch({ type: 'registered', deviceMode: result.deviceMode });
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Something went wrong.');
      // The consent text changed on the server: load the new version, not the cached one.
      if (e.code === 'CONSENT_OUTDATED') queryClient.removeQueries({ queryKey: ['consent'] });
      dispatch({ type: 'failed', code: e.code, message: e.message });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* PLACEHOLDER until Phase 9 (packages/face): the real guided face scan goes here. */}
      <div
        data-testid="face-placeholder"
        className="rounded-lg border-2 border-dashed border-gray-300 p-4 text-sm text-gray-700"
      >
        <p className="font-medium text-gray-900">Face scan is not available yet</p>
        {required ? (
          <p className="mt-1">
            Registration needs a face scan, but this version cannot do one yet. Please ask the owner
            for help.
          </p>
        ) : (
          <p className="mt-1">
            It will be added in a later update. The owner will then give you a re-scan code. No
            camera is used now.
          </p>
        )}
      </div>
      <ErrorBox error={state.error} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => dispatch({ type: 'back' })} disabled={busy}>
          Back
        </Button>
        <Button onClick={() => void finish()} loading={busy} disabled={required}>
          Finish registration
        </Button>
      </div>
    </div>
  );
}

function DoneStep({ state }: { state: WizardState }) {
  const device =
    state.registeredDeviceMode === 'COMPANY_MACBOOK' ? 'your company MacBook' : 'your laptop';
  return (
    <div className="space-y-4">
      <Notice tone="green">You are registered.</Notice>
      <p className="text-sm text-gray-700">
        Next, install the Leaders Key desktop agent on {device}. Download links will appear here
        when the agent is ready; the owner will share it with you until then.
      </p>
      <Link
        to="/login"
        className="flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-medium text-white"
      >
        Log in
      </Link>
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  error,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-gray-900">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{children}</span>
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
