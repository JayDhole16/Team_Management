import type { MonthHours } from '@lk/shared';
import { DAY_FLAG_TEXT, END_REASON_LABEL } from '../lib/labels';
import {
  formatDateTime,
  formatDay,
  formatHours,
  formatMonth,
  formatTime,
  shiftMonth,
} from '../lib/time';
import { Button, EmptyState } from './ui';

export function MonthPicker({
  month,
  maxMonth,
  onChange,
}: {
  month: string;
  maxMonth: string;
  onChange: (month: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        aria-label="Previous month"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        ‹
      </Button>
      <span className="min-w-36 text-center font-medium">{formatMonth(month)}</span>
      <Button
        variant="secondary"
        aria-label="Next month"
        disabled={month >= maxMonth}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        ›
      </Button>
    </div>
  );
}

/** Month summary and per-day list. Idle time is shown separately, never deducted (PRD Q1). */
export function MonthHoursView({ data }: { data: MonthHours }) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Total" value={formatHours(data.totalSec)} />
        <Stat label="Idle (included)" value={formatHours(data.idleSec)} />
        <Stat label="Days worked" value={String(data.workDays)} />
      </dl>
      {data.days.length === 0 ? (
        <EmptyState title="No time logged this month" />
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {data.days.map((day) => (
            <li key={day.date} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-gray-800">{formatDay(day.date)}</span>
                <span className="text-sm font-medium">
                  {formatHours(day.workedSec)}
                  {day.idleSec > 0 && (
                    <span className="ml-2 font-normal text-gray-500">
                      idle {formatHours(day.idleSec)}
                    </span>
                  )}
                </span>
              </div>
              {day.flags.map((flag) => (
                <p key={flag} className="mt-1 text-xs text-amber-800">
                  ⚠ {DAY_FLAG_TEXT[flag]}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Sessions of the month, newest first; the gaps between them are the breaks. */
export function SessionList({ data }: { data: MonthHours }) {
  if (data.sessions.length === 0) return null;
  const sessions = [...data.sessions].reverse();
  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white text-sm">
      {sessions.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span>
            {formatDateTime(s.startedAt)} – {s.endedAt ? formatTime(s.endedAt) : 'now'}
          </span>
          <span className="text-gray-600">
            {formatHours(s.workedSec)}
            {s.endReason && ` · ${END_REASON_LABEL[s.endReason]}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <dt className="text-xs text-gray-600">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-gray-900">{value}</dd>
    </div>
  );
}
