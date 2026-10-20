/**
 * Work started by event listeners (store a security alert, recompute live status, send
 * pushes), so a request never waits for it and a failure never breaks the request.
 * - `run`: one task at a time per lane, in order (e.g. an older status computation can never
 *   overwrite a newer one). Lanes do not wait for each other, so a busy live-status lane never
 *   delays a security alert.
 * - `spawn`: in parallel (pushes may wait on a slow push service).
 * A failing task is reported and does not stop the queue. Tests call `drain()` to wait until
 * everything started so far (and anything it started) has finished.
 */
export interface BackgroundQueue {
  run(name: string, task: () => Promise<unknown>, lane?: string): void;
  spawn(name: string, task: () => Promise<unknown>): void;
  drain(): Promise<void>;
}

export function createBackgroundQueue(
  onError: (name: string, err: unknown) => void,
): BackgroundQueue {
  const tails = new Map<string, Promise<void>>();
  const pending = new Set<Promise<void>>();
  const guarded = (name: string, task: () => Promise<unknown>) => async () => {
    try {
      await task();
    } catch (err) {
      try {
        onError(name, err);
      } catch {
        // Reporting must never break the queue.
      }
    }
  };
  return {
    run(name, task, lane = 'default') {
      tails.set(lane, (tails.get(lane) ?? Promise.resolve()).then(guarded(name, task)));
    },
    spawn(name, task) {
      const p = guarded(name, task)();
      pending.add(p);
      void p.finally(() => pending.delete(p));
    },
    async drain() {
      for (;;) {
        const seen = [...tails.values()];
        await Promise.all([...seen, ...pending]);
        const now = [...tails.values()];
        if (
          pending.size === 0 &&
          now.length === seen.length &&
          now.every((t, i) => t === seen[i])
        ) {
          return;
        }
      }
    },
  };
}
