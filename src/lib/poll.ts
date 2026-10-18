import { ApiError } from "@/lib/client";

export type PollOptions = {
  /** Delay after a success when the server gives no hint. */
  baseMs: number;
  /** Floor for the delay while the tab is hidden. */
  hiddenMs: number;
  /** Return false to keep the normal pace while hidden (e.g. a tab that is playing audio). */
  slowWhenHidden?: () => boolean;
};

// A run that answers 0 asks to go again at once (a long poll that already waited on the server).
// Network callbacks are not throttled in a hidden tab, timers are, so no timer sits in that loop.
// Three answers in a row that came back faster than this are not really waiting: fall back to a timer.
const QUICK_MS = 250;

const BACKOFF_START_MS = 2000;
const BACKOFF_MAX_MS = 6000;
const MIN_MS = 800;

/**
 * Self-pacing poll loop (one request in flight, ever). It slows down on its own: the server can
 * hint a longer delay, a hidden tab polls rarely, errors back off exponentially, and a 429 waits
 * for exactly as long as the server asked. `nudge()` reads now (e.g. when the tab comes back).
 * `run` returns the server's suggested delay for the next round, if any.
 */
export function startPolling(run: () => Promise<number | void>, options: PollOptions) {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let quick = 0;

  const hidden = () =>
    typeof document !== "undefined" && document.hidden && (options.slowWhenHidden?.() ?? true);

  const schedule = (ms: number) => {
    if (stopped) return;
    clearTimeout(timer);
    let delay = Math.max(MIN_MS, ms);
    if (hidden()) delay = Math.max(delay, options.hiddenMs);
    // ±15% so clients that opened together don't keep hitting the server in the same instant
    delay *= 0.85 + Math.random() * 0.3;
    timer = setTimeout(tick, delay);
  };

  const tick = async () => {
    if (stopped || running) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      schedule(3000);
      return;
    }
    running = true;
    const startedAt = performance.now();
    try {
      const hint = await run();
      failures = 0;
      running = false;
      if (hint === 0) {
        quick = performance.now() - startedAt < QUICK_MS ? quick + 1 : 0;
        if (quick < 3) {
          void tick();
          return;
        }
        quick = 0;
        schedule(1000);
        return;
      }
      quick = 0;
      schedule(typeof hint === "number" ? hint : options.baseMs);
    } catch (error) {
      running = false;
      failures += 1;
      if (error instanceof ApiError && error.status === 429) {
        schedule(Math.max(error.retryAfterMs ?? 0, options.baseMs));
      } else {
        schedule(Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** (failures - 1)));
      }
    }
  };

  void tick();

  return {
    nudge() {
      if (stopped || running) return;
      clearTimeout(timer);
      void tick();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
