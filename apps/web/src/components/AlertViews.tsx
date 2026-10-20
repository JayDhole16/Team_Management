import { describeAlert, IDLE_REASON_LABELS, quietReason, type Alert } from '@lk/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ackAlert, fetchOpenAlertCount } from '../api/alerts';
import { fetchLive } from '../api/live';
import { formatDateTime } from '../lib/time';
import { useAlertSound } from '../realtime/AlertSoundProvider';
import { ALERTS_KEY, LIVE_KEY, OPEN_ALERTS_KEY } from '../realtime/effects';
import { Badge, Button, Card, ErrorBox } from './ui';

/** Owner: number of open (unacknowledged) alerts. Live events refresh it; polling is a fallback. */
export function useOpenAlertCount() {
  return useQuery({
    queryKey: OPEN_ALERTS_KEY,
    queryFn: fetchOpenAlertCount,
    refetchInterval: 60_000,
  });
}

/** Owner: the live board. Live events refresh it; polling catches anything missed. */
export function useLive() {
  return useQuery({ queryKey: LIVE_KEY, queryFn: fetchLive, refetchInterval: 30_000 });
}

export function useInvalidateAlerts() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all(
        [ALERTS_KEY[0], OPEN_ALERTS_KEY[0]].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
    [queryClient],
  );
}

/** What happened, in plain words (server text only, rendered as text). */
function alertHeadline(alert: Alert): string {
  if (alert.kind === 'IDLE') return alert.employeeName ?? 'An employee';
  return 'Security alert';
}

function alertDetail(alert: Alert): string {
  if (alert.kind === 'IDLE' && alert.idleReason) {
    const reason = IDLE_REASON_LABELS[alert.idleReason];
    return reason.charAt(0).toUpperCase() + reason.slice(1);
  }
  return describeAlert(alert);
}

export function AlertCard({ alert }: { alert: Alert }) {
  const invalidate = useInvalidateAlerts();
  const ack = useMutation({ mutationFn: () => ackAlert(alert.id), onSuccess: invalidate });
  const open = alert.ownerAckAt === null;
  return (
    <Card className={`space-y-2 ${open ? 'border-l-4 border-l-amber-500' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-words text-gray-900">{alertHeadline(alert)}</p>
          <p className="text-sm break-words text-gray-800">{alertDetail(alert)}</p>
          <p className="text-xs text-gray-600">{formatDateTime(alert.at)}</p>
          {quietReason(alert) && <p className="text-xs text-gray-600">{quietReason(alert)}</p>}
        </div>
        {open ? (
          <Badge tone="amber">{alert.kind === 'IDLE' ? 'Idle' : 'Security'}</Badge>
        ) : (
          <Badge tone="grey">Acknowledged</Badge>
        )}
      </div>
      <ErrorBox error={ack.error} />
      {open && (
        <Button variant="secondary" loading={ack.isPending} onClick={() => ack.mutate()}>
          Acknowledge
        </Button>
      )}
    </Card>
  );
}

/**
 * The header control: browsers play sound only after a click on the page, so the owner taps
 * "Enable alerts" once per page load (it says "Tap to turn sound back on" after a reload).
 */
export function SoundButton({ compact = false }: { compact?: boolean }) {
  const sound = useAlertSound();
  const [failed, setFailed] = useState(false);
  const enable = () => {
    void sound.enable().then((ok) => setFailed(!ok));
  };
  if (sound.state === 'on') {
    return (
      <button
        type="button"
        onClick={sound.test}
        className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-green-800 hover:bg-green-50"
        title="Alert sound is on. Tap to hear a test beep."
        data-testid="sound-on"
      >
        Sound on{compact ? '' : ' · Test'}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant={sound.state === 'wanted' ? 'primary' : 'secondary'}
        onClick={enable}
        className={compact ? 'px-3' : ''}
      >
        {sound.state === 'wanted' ? 'Tap to turn sound back on' : 'Enable alerts'}
      </Button>
      {failed && <span className="text-xs text-red-700">This browser cannot play sound.</span>}
    </span>
  );
}

/** Larger version for the Live and Alerts pages, with what it does and a way to turn it off. */
export function SoundPanel() {
  const sound = useAlertSound();
  return (
    <Card className="space-y-2">
      <h2 className="font-semibold">Alert sound</h2>
      {sound.state === 'on' ? (
        <>
          <p className="text-sm text-gray-700">
            On. This page beeps when an idle or security alert comes in, while it is open (and the
            phone is unlocked).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={sound.test}>
              Test sound
            </Button>
            <Button variant="ghost" onClick={sound.disable}>
              Turn sound off
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-700">
            Browsers play sound only after you tap the page. Tap once to hear alerts here; set your
            volume with the test beep.
          </p>
          <SoundButton />
        </>
      )}
    </Card>
  );
}
