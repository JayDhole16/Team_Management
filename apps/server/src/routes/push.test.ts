import { ApiErrorSchema, PushConfigSchema } from '@lk/shared';
import { describe, expect, it } from 'vitest';
import { isAllowedPushEndpoint, MAX_PUSH_SUBSCRIPTIONS } from '../services/push.service';
import { fakePushSender } from '../test/fake-push';
import { bearer, createHarness, type Harness } from '../test/helpers';

const KEYS = {
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};
const FCM = 'https://fcm.googleapis.com/fcm/send/abc123';

describe('isAllowedPushEndpoint', () => {
  it.each([
    FCM,
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/QGuQyavXutnMH4nhXxuN',
  ])('accepts %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(true));

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://127.0.0.1/push',
    'https://localhost:4000/api/v1/employees',
    'https://fcm.googleapis.com.evil.example/x',
    'https://evil.example/fcm.googleapis.com',
    'https://user:pw@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x',
    'not a url',
  ])('refuses %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(false));
});

describe('push subscriptions and alert pushes', () => {
  async function setup(push = fakePushSender()) {
    const h = await createHarness({ push: push.sender });
    const e = await h.registerEmployee();
    return { h, push, ...e };
  }
  const subscribe = (h: Harness, token: string, endpoint = FCM) =>
    h.app.inject({
      method: 'POST',
      url: '/api/v1/push/subscribe',
      headers: bearer(token),
      payload: { endpoint, keys: KEYS, expirationTime: null },
    });

  it('is off without VAPID keys: config says so and subscribe gives 503', async () => {
    const h = await createHarness();
    const owner = await h.ownerToken();
    const config = await h.app.inject({
      method: 'GET',
      url: '/api/v1/push/config',
      headers: bearer(owner),
    });
    expect(PushConfigSchema.parse(config.json<{ data: unknown }>().data)).toEqual({
      enabled: false,
      publicKey: null,
    });
    const res = await subscribe(h, owner);
    expect(res.statusCode).toBe(503);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('PUSH_DISABLED');
  });

  it('the owner subscribes; an idle alert is pushed with the name and reason', async () => {
    const { h, push, ownerToken, accessToken } = await setup();
    const config = await h.app.inject({
      method: 'GET',
      url: '/api/v1/push/config',
      headers: bearer(ownerToken),
    });
    expect(PushConfigSchema.parse(config.json<{ data: unknown }>().data).enabled).toBe(true);
    expect((await subscribe(h, ownerToken)).statusCode).toBe(200);
    // Subscribing again from the same browser keeps one row.
    expect((await subscribe(h, ownerToken)).statusCode).toBe(200);
    expect(await h.db.pushSubscription.count()).toBe(1);

    await h.app.inject({
      method: 'POST',
      url: '/api/v1/sessions/start',
      headers: bearer(accessToken),
    });
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/agent/idle-event',
      headers: bearer(accessToken),
      payload: { at: h.clock.now().toISOString(), reason: 'NO_FACE' },
    });
    await h.drain();
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]).toMatchObject({
      endpoint: FCM,
      payload: {
        title: 'Idle alert',
        // The test clock is 2026-10-18 05:00 UTC = 10:30 in India.
        body: 'Rahul Sharma: nobody at the camera (18 Oct, 10:30)',
        url: '/owner/alerts',
      },
    });
  });

  it('does not push a quiet idle alert (no work session open)', async () => {
    const { h, push, ownerToken, accessToken } = await setup();
    await subscribe(h, ownerToken);
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/agent/idle-event',
      headers: bearer(accessToken),
      payload: { at: h.clock.now().toISOString(), reason: 'NO_FACE' },
    });
    await h.drain();
    expect(push.sent).toHaveLength(0);
  });

  it('pushes security alerts too', async () => {
    const { h, push, ownerToken } = await setup();
    await subscribe(h, ownerToken);
    for (let i = 0; i < 5; i += 1) await h.claim('AAAA-AAAA', '10.9.9.9');
    await h.drain();
    const payload = push.sent.find(
      (p) => (p.payload as { title: string }).title === 'Security alert',
    )?.payload as { body: string } | undefined;
    // A generic line on the lock screen: no address or name.
    expect(payload?.body).toBe(
      'Wrong access codes from one address (18 Oct, 10:30). Open the dashboard.',
    );
  });

  it('refuses endpoints that are not a browser push service', async () => {
    const { h, ownerToken } = await setup();
    const res = await subscribe(h, ownerToken, 'https://169.254.169.254/latest/meta-data');
    expect(res.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('PUSH_ENDPOINT_REFUSED');
    expect((await subscribe(h, ownerToken, 'http://fcm.googleapis.com/x')).statusCode).toBe(400);
  });

  it(`allows at most ${MAX_PUSH_SUBSCRIPTIONS} devices`, async () => {
    const { h, ownerToken } = await setup();
    for (let i = 0; i < MAX_PUSH_SUBSCRIPTIONS; i += 1) {
      expect((await subscribe(h, ownerToken, `${FCM}-${i}`)).statusCode).toBe(200);
    }
    const res = await subscribe(h, ownerToken, `${FCM}-extra`);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('PUSH_LIMIT');
  });

  it('deletes a subscription the push service says is gone (410)', async () => {
    const push = fakePushSender(() => ({ ok: false, gone: true, statusCode: 410 }));
    const { h, ownerToken, accessToken } = await setup(push);
    await subscribe(h, ownerToken);
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/sessions/start',
      headers: bearer(accessToken),
    });
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/agent/idle-event',
      headers: bearer(accessToken),
      payload: { at: h.clock.now().toISOString(), reason: 'NO_ACTIVITY' },
    });
    await h.drain();
    expect(await h.db.pushSubscription.count()).toBe(0);
  });

  it('unsubscribe removes only the caller’s own subscription', async () => {
    const { h, ownerToken } = await setup();
    await subscribe(h, ownerToken);
    const res = await h.app.inject({
      method: 'DELETE',
      url: '/api/v1/push/subscribe',
      headers: bearer(ownerToken),
      payload: { endpoint: FCM },
    });
    expect(res.json<{ data: { removed: boolean } }>().data.removed).toBe(true);
    expect(await h.db.pushSubscription.count()).toBe(0);
  });

  it('never logs endpoints or keys', async () => {
    const push = fakePushSender();
    const h = await createHarness({ push: push.sender, captureLogs: true });
    const owner = await h.ownerToken();
    await subscribe(h, owner);
    await subscribe(h, owner, 'https://169.254.169.254/x');
    const logs = h.logs.join('\n');
    expect(logs).not.toContain('abc123');
    expect(logs).not.toContain(KEYS.auth);
    expect(logs).not.toContain(KEYS.p256dh);
  });
});
