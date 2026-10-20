import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { ackAllAlerts, listAlerts, type AlertFilter } from '../../api/alerts';
import { listEmployees } from '../../api/employees';
import {
  AlertCard,
  SoundPanel,
  useInvalidateAlerts,
  useOpenAlertCount,
} from '../../components/AlertViews';
import { PushControls } from '../../components/PushControls';
import {
  Button,
  EmptyState,
  ErrorBox,
  PageHeader,
  SelectField,
  Spinner,
} from '../../components/ui';
import { ALERTS_KEY } from '../../realtime/effects';

/** O-8: idle and security alerts; they stay open until acknowledged. */
export function AlertsPage() {
  const [params, setParams] = useSearchParams();
  const filter: AlertFilter = {
    // Open alerts first: that is what needs attention.
    openOnly: params.get('show') !== 'all',
    employeeId: params.get('employeeId') ?? undefined,
  };
  const setFilter = (next: AlertFilter) => {
    const search = new URLSearchParams();
    if (!next.openOnly) search.set('show', 'all');
    if (next.employeeId) search.set('employeeId', next.employeeId);
    setParams(search, { replace: true });
  };

  const employees = useQuery({ queryKey: ['employees', {}], queryFn: () => listEmployees() });
  const openCount = useOpenAlertCount();
  const alerts = useInfiniteQuery({
    queryKey: [ALERTS_KEY[0], 'list', filter],
    queryFn: ({ pageParam }) => listAlerts(filter, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: 60_000,
  });
  const items = alerts.data?.pages.flatMap((p) => p.items) ?? [];
  const invalidate = useInvalidateAlerts();
  const ackAll = useMutation({ mutationFn: ackAllAlerts, onSuccess: invalidate });
  // Only up to the newest alert on screen (by arrival): one that arrives meanwhile stays open.
  const newestOpen = items.find((a) => a.ownerAckAt === null);
  const newestReceived = items.reduce<string | undefined>(
    (max, a) => (max === undefined || a.receivedAt > max ? a.receivedAt : max),
    undefined,
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={openCount.data ? `Alerts (${openCount.data.count} open)` : 'Alerts'}
        actions={
          newestOpen &&
          !filter.employeeId && (
            <Button
              variant="secondary"
              loading={ackAll.isPending}
              onClick={() => newestReceived && ackAll.mutate(newestReceived)}
            >
              Acknowledge all
            </Button>
          )
        }
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Which alerts">
        {[
          { open: true, label: 'Open' },
          { open: false, label: 'All' },
        ].map((opt) => (
          <Button
            key={opt.label}
            variant={filter.openOnly === opt.open ? 'primary' : 'secondary'}
            aria-pressed={filter.openOnly === opt.open}
            onClick={() => setFilter({ ...filter, openOnly: opt.open })}
          >
            {opt.label}
          </Button>
        ))}
      </div>
      <div className="md:max-w-sm">
        <SelectField
          label="Employee"
          value={filter.employeeId ?? ''}
          onChange={(e) => setFilter({ ...filter, employeeId: e.target.value || undefined })}
        >
          <option value="">Everyone</option>
          {(employees.data ?? []).map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </SelectField>
      </div>
      {alerts.isPending && <Spinner label="Loading alerts…" />}
      <ErrorBox error={alerts.error ?? ackAll.error ?? employees.error ?? openCount.error} />
      {alerts.data && items.length === 0 && (
        <EmptyState title={filter.openOnly ? 'No open alerts' : 'No alerts yet'}>
          Idle checks that fail and security warnings appear here.
        </EmptyState>
      )}
      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a.id}>
            <AlertCard alert={a} />
          </li>
        ))}
      </ul>
      {alerts.hasNextPage && (
        <Button
          variant="secondary"
          loading={alerts.isFetchingNextPage}
          onClick={() => void alerts.fetchNextPage()}
        >
          Show older alerts
        </Button>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <SoundPanel />
        <PushControls />
      </div>
    </div>
  );
}
