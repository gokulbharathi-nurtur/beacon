import type { Page } from 'playwright';

export interface PollUntilSettledOptions {
  /** How long the captured array must stop growing before we call it settled. */
  quietMs: number;
  /** Absolute ceiling — fires even if pushes are still arriving, so a broken page can't hang forever. */
  hardTimeoutMs: number;
  pollIntervalMs: number;
}

/**
 * Polls the captured-pushes array length until it stops growing for `quietMs`,
 * or bails at `hardTimeoutMs`. This is a heuristic, not a fixed wait: some events
 * fire immediately, others (debounced ones — a real one waits ~2000ms) fire late,
 * so `quietMs` must be measured *after* the last observed push, not from navigation start.
 */
export async function pollUntilSettled(
  page: Page,
  captureKey: string,
  opts: PollUntilSettledOptions
): Promise<{ settledNaturally: boolean }> {
  const { quietMs, hardTimeoutMs, pollIntervalMs } = opts;
  const start = Date.now();
  let lastLength = await readCaptureLength(page, captureKey);
  let lastChangeAt = Date.now();

  while (true) {
    const now = Date.now();
    if (now - lastChangeAt >= quietMs) {
      return { settledNaturally: true };
    }
    if (now - start >= hardTimeoutMs) {
      return { settledNaturally: false };
    }

    await page.waitForTimeout(pollIntervalMs);

    let currentLength: number;
    try {
      currentLength = await readCaptureLength(page, captureKey);
    } catch {
      // Page navigated away/closed mid-poll — treat as settled with whatever we last saw.
      return { settledNaturally: true };
    }

    if (currentLength !== lastLength) {
      lastLength = currentLength;
      lastChangeAt = Date.now();
    }
  }
}

async function readCaptureLength(page: Page, captureKey: string): Promise<number> {
  return page.evaluate((key) => {
    const arr = (window as unknown as Record<string, unknown[]>)[key];
    return Array.isArray(arr) ? arr.length : 0;
  }, captureKey);
}
