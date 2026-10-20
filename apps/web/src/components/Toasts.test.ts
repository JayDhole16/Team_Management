import { describe, expect, it } from 'vitest';
import { initialSoundState, storedSoundWish } from '../lib/alertSound';
import { keepNewest } from './Toasts';

describe('keepNewest', () => {
  it('drops the oldest info toast first, keeping open alerts', () => {
    const toasts = [
      { id: 1, sticky: true },
      { id: 2, sticky: false },
      { id: 3, sticky: false },
      { id: 4, sticky: true },
      { id: 5, sticky: false },
      { id: 6, sticky: false },
    ];
    expect(keepNewest(toasts).map((t) => t.id)).toEqual([1, 3, 4, 5, 6]);
  });

  it('drops the oldest alert only when all are alerts', () => {
    const toasts = [1, 2, 3, 4, 5, 6].map((id) => ({ id, sticky: true }));
    expect(keepNewest(toasts).map((t) => t.id)).toEqual([2, 3, 4, 5, 6]);
  });
});

describe('alert sound state', () => {
  it('starts as "Enable alerts", or "Tap to turn sound back on" after it was enabled before', () => {
    expect(initialSoundState(false)).toBe('off');
    expect(initialSoundState(true)).toBe('wanted');
  });

  it('works without browser storage (private mode, tests)', () => {
    expect(storedSoundWish()).toBe(false);
  });
});
