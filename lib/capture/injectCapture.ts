import type { Page } from 'playwright';
import type { CaptureResult } from '@/lib/types';
import { pollUntilSettled } from './settle';
import { partitionPushes } from './filterEvents';

export const CAPTURE_KEY = '__datalayerQaCapture';

// Comfortably above the longest known real-world debounce. The reference implementation's
// "viewed this list" event uses a plain 2000ms setTimeout, but on a real production site
// (chartersestateagents.co.uk) the equivalent event was empirically observed firing
// 3-6s after page_loaded — the list waits on an async data fetch before starting its own
// debounce, unlike a bare setTimeout. A too-short quiet window makes the poller declare
// "settled" before that late push arrives, producing a false "missing event" in the diff —
// confirmed by testing quietMs=2300 (missed it) vs quietMs=4000/8000 (both caught it).
const DEFAULT_QUIET_MS = 5000;
const DEFAULT_HARD_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_NAV_TIMEOUT_MS = 30_000;

/**
 * Runs inside the browser via page.addInitScript, so it executes before any page JS —
 * critical, since GTM/most tracking libs bootstrap with a
 * `dataLayer.push = dataLayer.push || []`-style check and will happily reuse an
 * already-patched array/function rather than clobbering it.
 *
 * Must be self-contained: Playwright serializes this via toString() and re-evaluates it
 * in the page context, so it cannot close over anything from the calling scope.
 */
export function captureInitScript(captureKey: string): void {
  const w = window as unknown as Record<string, unknown>;
  w[captureKey] = [];
  w.dataLayer = Array.isArray(w.dataLayer) ? w.dataLayer : [];
  const dataLayer = w.dataLayer as unknown[] & { push: (...items: unknown[]) => number };
  const original = dataLayer.push.bind(dataLayer);
  dataLayer.push = (...items: unknown[]) => {
    (w[captureKey] as unknown[]).push(...items);
    return original(...items);
  };
}

export interface RunCaptureOptions {
  settleQuietMs?: number;
  hardTimeoutMs?: number;
  pollIntervalMs?: number;
  navTimeoutMs?: number;
}

export async function runCapture(page: Page, url: string, opts: RunCaptureOptions = {}): Promise<CaptureResult> {
  const quietMs = opts.settleQuietMs ?? DEFAULT_QUIET_MS;
  const hardTimeoutMs = opts.hardTimeoutMs ?? DEFAULT_HARD_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const navTimeoutMs = opts.navTimeoutMs ?? DEFAULT_NAV_TIMEOUT_MS;

  const startedAt = new Date().toISOString();

  await page.addInitScript(captureInitScript, CAPTURE_KEY);

  // 'domcontentloaded', not the Playwright default 'load' — marketing pages have external
  // assets (S3 images, embed widgets, fonts) that can hang 'load' well past the point the
  // page has already finished pushing everything to dataLayer.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeoutMs });

  const { settledNaturally } = await pollUntilSettled(page, CAPTURE_KEY, {
    quietMs,
    hardTimeoutMs,
    pollIntervalMs,
  });

  const rawPushes = await page.evaluate((key) => {
    const arr = (window as unknown as Record<string, unknown[]>)[key];
    return Array.isArray(arr) ? arr : [];
  }, CAPTURE_KEY);

  const { events, nonEvents } = partitionPushes(rawPushes);

  return {
    url,
    startedAt,
    finishedAt: new Date().toISOString(),
    rawPushes,
    events,
    filteredPushCount: nonEvents.length,
    timedOut: !settledNaturally,
  };
}
