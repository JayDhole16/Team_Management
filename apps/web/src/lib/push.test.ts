import { describe, expect, it } from 'vitest';
import { pushSupportFrom, vapidKeyBytes, type PushEnvironment } from './push';

const desktop: PushEnvironment = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0',
  maxTouchPoints: 0,
  standalone: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
};
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1';

describe('pushSupportFrom', () => {
  it('desktop and Android browsers with the APIs are supported', () => {
    expect(pushSupportFrom(desktop)).toBe('supported');
  });

  it('iPhone Safari needs Add to Home Screen first', () => {
    expect(pushSupportFrom({ ...desktop, userAgent: iphone, hasPushManager: false })).toBe(
      'ios-install',
    );
  });

  it('the installed iPhone app is supported', () => {
    expect(pushSupportFrom({ ...desktop, userAgent: iphone, standalone: true })).toBe('supported');
  });

  it('iPadOS (reports as a Mac with touch) needs the install too', () => {
    const ipad = {
      ...desktop,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari',
      maxTouchPoints: 5,
    };
    expect(pushSupportFrom(ipad)).toBe('ios-install');
    expect(pushSupportFrom({ ...ipad, maxTouchPoints: 0 })).toBe('supported');
  });

  it('a browser without service workers (or plain http) is unsupported', () => {
    expect(pushSupportFrom({ ...desktop, hasServiceWorker: false })).toBe('unsupported');
  });
});

describe('vapidKeyBytes', () => {
  it('decodes base64url without padding', () => {
    expect([...vapidKeyBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });
});
