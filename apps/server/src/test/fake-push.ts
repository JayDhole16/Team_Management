import type { PushSender, PushSendResult, PushTarget } from '../lib/push-sender';

/** Records pushes instead of sending them. `answer` decides the push service's reply. */
export function fakePushSender(
  answer: (target: PushTarget) => PushSendResult = () => ({ ok: true }),
) {
  const sent: { endpoint: string; payload: unknown }[] = [];
  const sender: PushSender = {
    publicKey: 'BFakePublicKeyForTestsOnly',
    send(target, payload) {
      sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload) as unknown });
      return Promise.resolve(answer(target));
    },
  };
  return { sender, sent };
}
