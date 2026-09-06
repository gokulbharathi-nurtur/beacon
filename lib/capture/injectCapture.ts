import type { Page } from 'playwright';
import type { CaptureResult } from '@/lib/types';
import { PushStream } from './pushStream';
import { waitUntilQuiet } from './settle';
import { partitionPushes } from './filterEvents';
import { markUndefinedDeep } from './undefinedMarker';

export const CAPTURE_KEY = '__datalayerQaCapture';
export const CAPTURE_BINDING = '__datalayerQaEmit';
/** Sentinel object shape sent once per document, before anything else — see
 * captureInitScript and runCapture's exposeBinding callback below. */
const RESET_SIGNAL_KEY = '__datalayerQaReset';

// Comfortably above the longest known real-world debounce. The reference implementation's
// "viewed this list" event uses a plain 2000ms setTimeout, but on a real production site
// (chartersestateagents.co.uk) the equivalent event was empirically observed firing
// 3-6s after page_loaded — the list waits on an async data fetch before starting its own
// debounce, unlike a bare setTimeout. A too-short quiet window makes the settle logic
// declare "settled" before that late push arrives, producing a false "missing event" in
// the diff — confirmed by testing quietMs=2300 (missed it) vs quietMs=4000/8000 (both
// caught it).
const DEFAULT_QUIET_MS = 5000;
const DEFAULT_HARD_TIMEOUT_MS = 30_000;
const DEFAULT_NAV_TIMEOUT_MS = 30_000;

/**
 * Runs inside the browser via page.addInitScript, so it executes before any page JS —
 * critical, since GTM/most tracking libs bootstrap with a
 * `dataLayer.push = dataLayer.push || []`-style check and will happily reuse an
 * already-patched array/function rather than clobbering it.
 *
 * Every push is forwarded to `bindingName` (wired up via page.exposeBinding — see
 * runCapture) so it streams to a Node-side PushStream that survives navigation. The
 * in-page array is kept too, but only as material for runCapture's teardown-time
 * reconciliation sweep — addInitScript reruns this on every new document, so the array
 * itself is wiped by navigation exactly like before.
 *
 * The very first thing this does, before touching dataLayer at all, is emit a reset
 * signal over the same binding — the one reliable way to tell Node "a new document's
 * capture array was just created" at the exact moment it happens. Playwright's own
 * navigation events don't work for this: 'framenavigated' also fires for a same-document
 * History API transition (which does *not* reset the array), and 'load' can fire well
 * after this script — and real pushes with it — already ran, since runCapture only waits
 * for 'domcontentloaded'. Both false signals corrupted the reconciliation sweep below into
 * treating an already-correctly-streamed push as missing and duplicating it.
 *
 * Must be self-contained: Playwright serializes this via toString() and re-evaluates it
 * in the page context, so it cannot close over anything from the calling scope.
 */
export function captureInitScript(keys: { captureKey: string; bindingName: string; resetSignalKey: string }): void {
  const { captureKey, bindingName, resetSignalKey } = keys;
  const w = window as unknown as Record<string, unknown>;
  const emitEarly = w[bindingName] as ((item: unknown) => void) | undefined;
  if (typeof emitEarly === 'function') emitEarly({ [resetSignalKey]: true });

  w[captureKey] = [];
  w.dataLayer = Array.isArray(w.dataLayer) ? w.dataLayer : [];
  const dataLayer = w.dataLayer as unknown[] & { push: (...items: unknown[]) => number };
  const original = dataLayer.push.bind(dataLayer);
  dataLayer.push = (...items: unknown[]) => {
    (w[captureKey] as unknown[]).push(...items);
    const emit = w[bindingName] as ((item: unknown) => void) | undefined;
    if (typeof emit === 'function') {
      for (const item of items) emit(item);
    }
    return original(...items);
  };
}

export interface RunCaptureOptions {
  settleQuietMs?: number;
  hardTimeoutMs?: number;
  navTimeoutMs?: number;
}

export async function runCapture(page: Page, url: string, opts: RunCaptureOptions = {}): Promise<CaptureResult> {
  const quietMs = opts.settleQuietMs ?? DEFAULT_QUIET_MS;
  const hardTimeoutMs = opts.hardTimeoutMs ?? DEFAULT_HARD_TIMEOUT_MS;
  const navTimeoutMs = opts.navTimeoutMs ?? DEFAULT_NAV_TIMEOUT_MS;

  const startedAt = new Date().toISOString();
  const stream = new PushStream();

  // Tracks which document the reconciliation sweep's in-page read belongs to, since that
  // read only ever sees whatever document is current at the time it runs — set from the
  // reset signal captureInitScript emits as the very first thing it does on each new
  // document (see that function's doc comment for why Playwright's navigation events
  // aren't reliable enough for this).
  let lastNavAt = Date.now();

  // Both must be registered before goto — exposeBinding and addInitScript each attach to
  // every future document on this page regardless of which was called first, but only for
  // navigations that start after they're set up.
  await page.exposeBinding(CAPTURE_BINDING, (_source, item: unknown) => {
    if (isResetSignal(item)) {
      lastNavAt = Date.now();
      return;
    }
    stream.record(markUndefinedDeep(item));
  });
  await page.addInitScript(captureInitScript, {
    captureKey: CAPTURE_KEY,
    bindingName: CAPTURE_BINDING,
    resetSignalKey: RESET_SIGNAL_KEY,
  });

  // 'domcontentloaded', not the Playwright default 'load' — marketing pages have external
  // assets (S3 images, embed widgets, fonts) that can hang 'load' well past the point the
  // page has already finished pushing everything to dataLayer.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeoutMs });

  const { settledNaturally } = await waitUntilQuiet(stream, { quietMs, hardTimeoutMs });

  await reconcileFromInPageArray(page, stream, lastNavAt);

  const rawPushes = stream.pushes.map((p) => p.push);
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

function isResetSignal(item: unknown): boolean {
  return typeof item === 'object' && item !== null && (item as Record<string, unknown>)[RESET_SIGNAL_KEY] === true;
}

/**
 * Binding delivery is async relative to the in-page push that triggers it, so a push that
 * lands in the page's own accumulator right before the quiet window fires can, in rare
 * cases, not yet have reached Node. This reads the *current* document's in-page array (the
 * one no navigation has since destroyed) and appends whatever tail count-comparison says
 * the stream is missing — the two lists are built by the same synchronous loop in
 * captureInitScript, so if the stream is short, the gap is the most-recently-pushed items.
 */
async function reconcileFromInPageArray(page: Page, stream: PushStream, lastNavAt: number): Promise<void> {
  let inPageArray: unknown[];
  try {
    inPageArray = await page.evaluate((key) => {
      const arr = (window as unknown as Record<string, unknown[]>)[key];
      return Array.isArray(arr) ? arr : [];
    }, CAPTURE_KEY);
  } catch {
    // Page closed/navigated away between the quiet window firing and this read — nothing
    // left to reconcile against.
    return;
  }

  const receivedSinceNav = stream.pushes.filter((p) => p.receivedAt >= lastNavAt).length;
  const missing = inPageArray.length - receivedSinceNav;
  if (missing <= 0) return;

  for (const item of inPageArray.slice(inPageArray.length - missing)) {
    stream.record(markUndefinedDeep(item));
  }
}
