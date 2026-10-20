import { NO_PLAIN_VERSION_MESSAGE, type MyUpdate, type Update } from '@lk/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Link } from 'react-router';
import { fetchUnreadCount } from '../api/updates';
import { formatDateTime } from '../lib/time';
import { PlainText } from './TaskViews';
import { Badge, Notice } from './ui';

export const UNREAD_UPDATES_KEY = ['updates-unread'] as const;

/** Owner: number of unread updates. Live events refresh it; polling is a fallback. */
export function useUnreadUpdates() {
  return useQuery({
    queryKey: UNREAD_UPDATES_KEY,
    queryFn: fetchUnreadCount,
    refetchInterval: 30_000,
  });
}

/** After sending or reading updates: refresh every list and the unread badge. */
export function useInvalidateUpdates() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all(
        ['updates', UNREAD_UPDATES_KEY[0], 'my-updates'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
    [queryClient],
  );
}

/** Blockers found by the AI, each as a highlighted line. */
export function BlockerLines({ blockers }: { blockers: readonly string[] }) {
  if (blockers.length === 0) return null;
  return (
    <ul className="space-y-1" aria-label="Blockers">
      {blockers.map((blocker, i) => (
        <li
          key={i}
          className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm break-words whitespace-pre-wrap text-amber-900"
        >
          <span className="font-semibold">Blocker: </span>
          {blocker}
        </li>
      ))}
    </ul>
  );
}

/**
 * The plain version first, blockers highlighted, the technical original behind a toggle. An
 * update sent while the AI was offline shows a note and the original directly. All of it is
 * plain text (LLM output is untrusted).
 */
export function UpdateText({
  update,
  originalLabel,
}: {
  update: Pick<MyUpdate, 'textPlain' | 'textTechnical' | 'blockers'>;
  originalLabel: string;
}) {
  if (update.textPlain === null) {
    return (
      <div className="space-y-2">
        <Notice tone="grey">{NO_PLAIN_VERSION_MESSAGE}</Notice>
        <PlainText text={update.textTechnical} className="text-sm text-gray-900" />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">AI summary in plain words</p>
      <PlainText text={update.textPlain} className="text-gray-900" />
      <BlockerLines blockers={update.blockers} />
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center text-sm text-blue-800">
          {originalLabel}
        </summary>
        <PlainText
          text={update.textTechnical}
          className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700"
        />
      </details>
    </div>
  );
}

export function ReadBadge({ readAt }: { readAt: string | null }) {
  return readAt ? <Badge tone="grey">Read</Badge> : <Badge tone="blue">Unread</Badge>;
}

/** A short list for the Overview and the employee page; the full text is in the inbox. */
export function RecentUpdates({ updates, showName }: { updates: Update[]; showName: boolean }) {
  return (
    <ul className="divide-y divide-gray-100">
      {updates.map((u) => (
        <li key={u.id} className="space-y-1 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
            <span>
              {showName && <span className="font-medium text-gray-900">{u.employeeName} · </span>}
              {formatDateTime(u.createdAt)}
            </span>
            <ReadBadge readAt={u.readByOwnerAt} />
          </div>
          {u.textPlain === null && (
            <p className="text-xs text-gray-500">{NO_PLAIN_VERSION_MESSAGE}</p>
          )}
          <p className="line-clamp-2 text-sm break-words text-gray-900">
            {u.textPlain ?? u.textTechnical}
          </p>
          {u.blockers.length > 0 && (
            <p className="text-xs font-medium text-amber-900">
              {u.blockers.length === 1 ? '1 blocker' : `${u.blockers.length} blockers`}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function InboxLink({ employeeId, children }: { employeeId?: string; children: string }) {
  return (
    <Link
      to={
        employeeId
          ? `/owner/updates?employeeId=${encodeURIComponent(employeeId)}`
          : '/owner/updates'
      }
      className="inline-flex min-h-11 items-center text-sm text-blue-800 underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}
