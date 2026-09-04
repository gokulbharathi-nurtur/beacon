import type { PushStream } from './pushStream';

export interface WaitUntilQuietOptions {
  /** How long the stream must go without a new push before we call it settled. */
  quietMs: number;
  /** Absolute ceiling — fires even if pushes are still arriving, so a broken page can't hang forever. */
  hardTimeoutMs: number;
}

/**
 * Resolves once `quietMs` has passed with no push on `stream`, or `hardTimeoutMs` total has
 * elapsed, whichever comes first — a heuristic, not a fixed wait: some events fire
 * immediately, others (debounced ones — a real one waits ~2000ms) fire late, so the quiet
 * window is measured after the last observed push, not from navigation start.
 *
 * Driven by the stream's 'push' event rather than polling a page-side value: with pushes
 * streamed to Node via exposeBinding (see injectCapture.ts), there is nothing left on the
 * page to poll, and this function never touches the page at all, so — unlike the old
 * page.evaluate-based poll — it cannot throw because the page navigated or closed mid-wait.
 */
export function waitUntilQuiet(stream: PushStream, opts: WaitUntilQuietOptions): Promise<{ settledNaturally: boolean }> {
  const { quietMs, hardTimeoutMs } = opts;

  return new Promise((resolve) => {
    let quietTimer: ReturnType<typeof setTimeout>;

    function armQuietTimer() {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => finish(true), quietMs);
    }

    function finish(settledNaturally: boolean) {
      clearTimeout(quietTimer);
      clearTimeout(hardTimer);
      stream.off('push', armQuietTimer);
      resolve({ settledNaturally });
    }

    const hardTimer = setTimeout(() => finish(false), hardTimeoutMs);
    armQuietTimer();
    stream.on('push', armQuietTimer);
  });
}
