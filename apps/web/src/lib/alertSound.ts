/**
 * The owner's alert beep (PRD O-8). Browsers block audio until the page has been clicked, so
 * "Enable alerts" unlocks a Web Audio context; after a reload it must be clicked again.
 * The wish is remembered (localStorage, a convenience only) so the button then says
 * "Tap to turn sound back on" instead of starting from scratch.
 */

/** off: never enabled · wanted: enabled before, needs a tap on this page load · on: beeps. */
export type SoundState = 'off' | 'wanted' | 'on';

const STORAGE_KEY = 'lk-alert-sound';

export function storedSoundWish(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberSoundWish(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: the button simply starts as "Enable alerts".
  }
}

export const initialSoundState = (wished: boolean): SoundState => (wished ? 'wanted' : 'off');

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

let context: AudioContext | null = null;

/** Call from a click handler. Resolves false when the browser has no Web Audio. */
export async function unlockAudio(): Promise<boolean> {
  const Ctor = audioContextCtor();
  if (!Ctor) return false;
  context ??= new Ctor();
  if (context.state === 'suspended') await context.resume();
  return context.state === 'running';
}

/**
 * Two short high tones. Does nothing until `unlockAudio` has run. Phones suspend audio when the
 * page goes to the background or the screen locks; then it tries to resume, and resolves false
 * if the browser still refuses (the owner must tap again).
 */
export async function playBeep(volume = 0.4): Promise<boolean> {
  if (!context) return false;
  if (context.state !== 'running') await context.resume().catch(() => undefined);
  if (context.state !== 'running') return false;
  const start = context.currentTime;
  for (const offset of [0, 0.25]) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(volume, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.18);
    osc.connect(gain).connect(context.destination);
    osc.start(start + offset);
    osc.stop(start + offset + 0.2);
  }
  return true;
}
