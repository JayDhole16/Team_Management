import type { CodeListItem } from '@lk/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { serverNow } from '../../api/clock';
import { listCodes, revokeCode } from '../../api/codes';
import { listEmployees } from '../../api/employees';
import { listJobRoles } from '../../api/jobRoles';
import { Badge, Button, EmptyState, ErrorBox, PageHeader, Spinner } from '../../components/ui';
import { useNow } from '../../hooks/useNow';
import { CODE_PURPOSE_LABEL, CODE_STATUS, DEVICE_MODE_LABEL, roleLabel } from '../../lib/labels';
import { formatCountdown, formatDateTime } from '../../lib/time';
import { remainingSec } from '../../lib/timer';
import { AddEmployeeModal } from './AddEmployeeModal';

/**
 * Open codes and those of the last 24 hours. The codes themselves are never shown here: only a
 * hash is stored. Refreshes every 10 s so a finished registration shows as "Used".
 */
export function InvitesPage() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const codes = useQuery({ queryKey: ['codes'], queryFn: listCodes, refetchInterval: 10_000 });
  const employees = useQuery({ queryKey: ['employees', {}], queryFn: () => listEmployees() });
  const roles = useQuery({ queryKey: ['job-roles'], queryFn: listJobRoles });
  const revoke = useMutation({
    mutationFn: revokeCode,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['codes'] }),
  });
  const now = serverNow(useNow());

  const nameOf = (id: string | null) =>
    id ? (employees.data?.find((e) => e.id === id)?.name ?? 'Employee') : null;

  function onRevoke(code: CodeListItem) {
    if (window.confirm('Revoke this code? It will stop working immediately.'))
      revoke.mutate(code.id);
  }

  return (
    <div>
      <PageHeader
        title="Invites and codes"
        actions={<Button onClick={() => setAdding(true)}>Add new employee</Button>}
      />
      {codes.isPending && <Spinner label="Loading…" />}
      <ErrorBox error={codes.error ?? revoke.error} />
      {codes.data?.length === 0 && (
        <EmptyState title="No codes in the last 24 hours">
          Codes you create appear here with their status.
        </EmptyState>
      )}
      <ul className="space-y-2" data-testid="code-list">
        {codes.data?.map((code) => {
          const due =
            code.status === 'ACTIVE'
              ? code.expiresAt
              : code.status === 'CLAIMED'
                ? code.claimExpiresAt
                : null;
          // Between polls a code can run out: show it as expired straight away.
          const timedOut = due !== null && remainingSec(due, now) === 0;
          const status = timedOut ? CODE_STATUS.EXPIRED : CODE_STATUS[code.status];
          const deadline = timedOut ? null : due;
          const person = nameOf(code.registeredUserId ?? code.targetUserId);
          return (
            <li key={code.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {CODE_PURPOSE_LABEL[code.purpose]}
                  {person && <span className="font-normal text-gray-700"> · {person}</span>}
                </span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                {[
                  code.note,
                  code.deviceMode && DEVICE_MODE_LABEL[code.deviceMode],
                  code.presetJobRoleId && roleLabel(roles.data, code.presetJobRoleId),
                  `created ${formatDateTime(code.createdAt)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {deadline && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-800">
                    {code.status === 'CLAIMED' ? 'Registration must finish in ' : 'Expires in '}
                    {formatCountdown(remainingSec(deadline, now))}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => onRevoke(code)}
                    loading={revoke.isPending && revoke.variables === code.id}
                  >
                    Revoke
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <AddEmployeeModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
