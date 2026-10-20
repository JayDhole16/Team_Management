import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  initialSoundState,
  playBeep,
  rememberSoundWish,
  storedSoundWish,
  unlockAudio,
  type SoundState,
} from '../lib/alertSound';

interface AlertSoundApi {
  state: SoundState;
  /** From a click: unlocks audio and plays one beep so the owner can set the volume. */
  enable(): Promise<boolean>;
  disable(): void;
  test(): void;
  beep(): void;
}

const AlertSoundContext = createContext<AlertSoundApi | null>(null);

export function AlertSoundProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SoundState>(() => initialSoundState(storedSoundWish()));

  const enable = useCallback(async () => {
    const ok = await unlockAudio().catch(() => false);
    if (ok) {
      setState('on');
      rememberSoundWish(true);
      void playBeep();
    }
    return ok;
  }, []);

  const disable = useCallback(() => {
    setState('off');
    rememberSoundWish(false);
  }, []);

  const beep = useCallback(() => {
    if (state !== 'on') return;
    // Sound was stopped by the phone (background, lock screen): ask for a tap again instead of
    // showing "Sound on" while nothing plays.
    void playBeep().then((played) => {
      if (!played) setState('wanted');
    });
  }, [state]);

  const api = useMemo(
    () => ({ state, enable, disable, test: () => void playBeep(), beep }),
    [state, enable, disable, beep],
  );
  return <AlertSoundContext.Provider value={api}>{children}</AlertSoundContext.Provider>;
}

export function useAlertSound(): AlertSoundApi {
  const api = useContext(AlertSoundContext);
  if (!api) throw new Error('useAlertSound outside AlertSoundProvider');
  return api;
}

/** Null outside the owner pages (employees have no beep). */
export function useAlertSoundOptional(): AlertSoundApi | null {
  return useContext(AlertSoundContext);
}
