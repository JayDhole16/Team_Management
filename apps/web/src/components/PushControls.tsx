import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPushConfig } from '../api/push';
import {
  currentPushEnvironment,
  disablePush,
  enablePush,
  isPushSubscribed,
  pushSupportFrom,
} from '../lib/push';
import { Button, Card, ErrorBox, Notice } from './ui';

const PUSH_STATE_KEY = ['push-state'] as const;

/**
 * "Enable notifications" (PRD O-14): idle and security alerts reach this phone or computer
 * even when the page is closed. On iPhone it works only for the installed app, so the hint
 * comes first.
 */
export function PushControls() {
  const queryClient = useQueryClient();
  const support = pushSupportFrom(currentPushEnvironment());
  const config = useQuery({
    queryKey: ['push-config'],
    queryFn: fetchPushConfig,
    staleTime: Infinity,
  });
  const subscribed = useQuery({
    queryKey: PUSH_STATE_KEY,
    queryFn: isPushSubscribed,
    enabled: support === 'supported',
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: PUSH_STATE_KEY });
  const turnOn = useMutation({
    mutationFn: () => enablePush(config.data?.publicKey ?? ''),
    onSettled: refresh,
  });
  const turnOff = useMutation({ mutationFn: disablePush, onSettled: refresh });

  if (config.data && !config.data.enabled) {
    return (
      <Card className="space-y-2">
        <h2 className="font-semibold">Phone notifications</h2>
        <p className="text-sm text-gray-700">
          Not set up on the server yet (VAPID keys missing). The in-page beep still works.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-2">
      <h2 className="font-semibold">Phone notifications</h2>
      <p className="text-sm text-gray-700">
        Get idle and security alerts on this device even when this page is closed.
      </p>
      {support === 'ios-install' && (
        <Notice tone="amber">
          On iPhone or iPad, add this site to your Home Screen first: tap the Share button, then
          &ldquo;Add to Home Screen&rdquo;. Open Leaders Key from the new icon and come back here.
        </Notice>
      )}
      {support === 'unsupported' && (
        <Notice tone="grey">
          This browser cannot show notifications (or the page is not on https).
        </Notice>
      )}
      {turnOn.data === 'denied' && (
        <Notice tone="amber">
          Notifications are blocked for this site. Allow them in the browser&rsquo;s site settings,
          then try again.
        </Notice>
      )}
      <ErrorBox error={config.error ?? turnOn.error ?? turnOff.error} />
      {support === 'supported' &&
        (subscribed.data ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-green-800">On for this device.</span>
            <Button variant="ghost" loading={turnOff.isPending} onClick={() => turnOff.mutate()}>
              Turn off notifications
            </Button>
          </div>
        ) : (
          <Button
            loading={turnOn.isPending}
            disabled={!config.data?.publicKey}
            onClick={() => turnOn.mutate()}
          >
            Enable notifications
          </Button>
        ))}
    </Card>
  );
}
