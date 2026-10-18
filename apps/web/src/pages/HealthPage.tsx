import { useHealth } from '../hooks/useHealth';

type Tone = 'ok' | 'bad' | 'wait';

const toneClasses: Record<Tone, string> = {
  ok: 'bg-green-50 text-green-800 border-green-200',
  bad: 'bg-red-50 text-red-800 border-red-200',
  wait: 'bg-gray-50 text-gray-700 border-gray-200',
};

function StatusRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div
      className={`flex min-h-11 items-center justify-between rounded-lg border px-4 py-3 ${toneClasses[tone]}`}
    >
      <span className="font-medium">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function HealthPage() {
  const { data, error, isPending, isFetching, refetch } = useHealth();

  const server: [string, Tone] = isPending
    ? ['Checking…', 'wait']
    : error
      ? ['Not reachable', 'bad']
      : ['OK', 'ok'];

  const database: [string, Tone] = isPending
    ? ['Checking…', 'wait']
    : data?.db === 'ok'
      ? ['OK', 'ok']
      : ['Down', 'bad'];

  let hint = '';
  if (error) hint = 'The server is not running. Start it with "pnpm dev".';
  else if (data?.db === 'down')
    hint = 'The database is not reachable. Is Docker running? Try "docker compose up -d db".';

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8 text-gray-900">
      <div className="mx-auto max-w-md space-y-4 rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Leaders Key Workforce</h1>
        <p className="text-sm text-gray-600">System status</p>
        <div className="space-y-2">
          <StatusRow label="Server" value={server[0]} tone={server[1]} />
          <StatusRow label="Database" value={database[0]} tone={database[1]} />
        </div>
        {hint && <p className="text-sm text-red-700">{hint}</p>}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{data ? `Last checked ${new Date(data.time).toLocaleTimeString()}` : ''}</span>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="min-h-11 rounded-lg border border-gray-300 px-4 text-sm text-gray-800 disabled:opacity-50"
          >
            {isFetching ? 'Checking…' : 'Check again'}
          </button>
        </div>
      </div>
    </main>
  );
}
