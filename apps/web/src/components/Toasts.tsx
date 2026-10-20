import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';

export interface ToastSpec {
  title: string;
  body: string;
  tone: 'alert' | 'info';
  link?: { to: string; label: string } | undefined;
  /** Stays until closed (alerts); others disappear after 8 s. */
  sticky: boolean;
}

interface Toast extends ToastSpec {
  id: number;
}

interface ToastApi {
  show(toast: ToastSpec): void;
}

const ToastContext = createContext<ToastApi | null>(null);
const AUTO_CLOSE_MS = 8000;
const MAX_TOASTS = 5;

/** At most MAX_TOASTS; info toasts make room first, so an open alert is not pushed out. */
export function keepNewest<T extends { sticky: boolean }>(toasts: T[]): T[] {
  const list = [...toasts];
  while (list.length > MAX_TOASTS) {
    const info = list.findIndex((t) => !t.sticky);
    list.splice(info === -1 ? 0 : info, 1);
  }
  return list;
}

/** Small pop-up messages (new alert, new task). Text only, never HTML. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, []);

  const show = useCallback(
    (spec: ToastSpec) => {
      const id = nextId.current++;
      setToasts((all) => keepNewest([...all, { ...spec, id }]));
      if (!spec.sticky) {
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          dismiss(id);
        }, AUTO_CLOSE_MS);
        timers.current.add(timer);
      }
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-3 md:right-4 md:left-auto md:w-96 md:items-stretch"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'alert' ? 'alert' : 'status'}
            data-testid="toast"
            className={`pointer-events-auto w-full max-w-md rounded-xl border p-3 shadow-lg ${t.tone === 'alert' ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{t.title}</p>
                <p className="text-sm break-words text-gray-800">{t.body}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="-m-1 min-h-11 min-w-11 shrink-0 rounded-lg text-sm text-gray-600 hover:bg-black/5"
                aria-label="Close message"
              >
                ✕
              </button>
            </div>
            {t.link && (
              <Link
                to={t.link.to}
                onClick={() => dismiss(t.id)}
                className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-blue-800 underline-offset-2 hover:underline"
              >
                {t.link.label}
              </Link>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToasts outside ToastProvider');
  return api;
}
