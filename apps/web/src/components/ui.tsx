import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { errorMessage } from '../api/errors';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-blue-700 text-white hover:bg-blue-800 disabled:bg-blue-300',
  secondary:
    'border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 disabled:text-gray-400',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-300',
  ghost: 'text-blue-800 hover:bg-blue-50 disabled:text-gray-400',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

/** At least 44 px tall so it is easy to tap on a phone. */
export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed ${buttonVariants[variant]} ${className}`}
      {...rest}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
}

export function Field({ label, error, hint, className = '', ...rest }: FieldProps) {
  const id = useId();
  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-800">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`block min-h-11 w-full rounded-lg border px-3 text-base text-gray-900 read-only:bg-gray-100 disabled:bg-gray-100 ${error ? 'border-red-500' : 'border-gray-300'}`}
        {...rest}
      />
      {hint && !error && <p className="text-xs text-gray-600">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
}

export function TextAreaField({ label, error, hint, className = '', ...rest }: TextAreaFieldProps) {
  const id = useId();
  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-800">
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`block w-full rounded-lg border px-3 py-2 text-base text-gray-900 disabled:bg-gray-100 ${error ? 'border-red-500' : 'border-gray-300'}`}
        {...rest}
      />
      {hint && !error && <p className="text-xs text-gray-600">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  children: ReactNode;
}

export function SelectField({
  label,
  error,
  hint,
  className = '',
  children,
  ...rest
}: SelectFieldProps) {
  const id = useId();
  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-800">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className={`block min-h-11 w-full rounded-lg border bg-white px-3 text-base text-gray-900 disabled:bg-gray-100 ${error ? 'border-red-500' : 'border-gray-300'}`}
        {...rest}
      >
        {children}
      </select>
      {hint && !error && <p className="text-xs text-gray-600">{hint}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export type Tone = 'green' | 'amber' | 'blue' | 'grey' | 'red';

const badgeTones: Record<Tone, string> = {
  green: 'bg-green-50 text-green-800 border-green-200',
  amber: 'bg-amber-50 text-amber-900 border-amber-300',
  blue: 'bg-blue-50 text-blue-800 border-blue-200',
  grey: 'bg-gray-100 text-gray-700 border-gray-200',
  red: 'bg-red-50 text-red-800 border-red-300',
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ small = false, label }: { small?: boolean; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-gray-600">
      <span
        aria-hidden
        className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-4 w-4' : 'h-6 w-6'}`}
      />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <Spinner label="Loading…" />
    </div>
  );
}

/** Shows an error from the api layer (or a plain string) in a red box. */
export function ErrorBox({ error, children }: { error?: unknown; children?: ReactNode }) {
  if (!error && !children) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      {typeof error === 'string' ? error : error ? errorMessage(error) : null}
      {children}
    </div>
  );
}

export function Notice({ children, tone = 'blue' }: { children: ReactNode; tone?: Tone }) {
  return (
    <div className={`rounded-lg border p-3 text-sm ${badgeTones[tone]}`} role="note">
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
      <p className="font-medium text-gray-900">{title}</p>
      {children && <div className="mt-2 text-sm text-gray-600">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A native <dialog>. Full screen on phones, a centred box from 768 px up.
 * Esc and the Close button call `onClose`.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // If the browser closes the dialog by itself, keep React in step.
      onClose={() => {
        if (open) onClose();
      }}
      className="m-0 h-full max-h-none w-full max-w-none bg-white p-0 backdrop:bg-black/40 md:m-auto md:h-auto md:max-h-[90vh] md:max-w-lg md:rounded-xl"
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
            <h2 id={titleId} className="text-lg font-semibold text-gray-900">
              {title}
            </h2>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
