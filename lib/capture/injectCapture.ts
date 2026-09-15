import type { Locator, Page, Route } from 'playwright';
import type { CaptureResult, InteractionStep, StepResult } from '@/lib/types';
import { PushStream, type StreamedPush } from './pushStream';
import { waitUntilQuiet } from './settle';
import { partitionPushes, isEventShaped } from './filterEvents';
import { markUndefinedDeep } from './undefinedMarker';

export const CAPTURE_KEY = '__datalayerQaCapture';
export const CAPTURE_BINDING = '__datalayerQaEmit';
/** Sentinel object shape sent once per document, before anything else — see
 * captureInitScript and runCapture's exposeBinding callback below. */
const RESET_SIGNAL_KEY = '__datalayerQaReset';

// Comfortably above the longest known real-world debounce. The reference implementation's
// "viewed this list" event uses a plain 2000ms setTimeout, but on real production sites
// (chartersestateagents.co.uk, kfh.co.uk) the equivalent event fires several seconds after
// page_loaded — the list waits on an async data fetch before pushing. A too-short quiet
// window makes the settle logic declare "settled" before that late push arrives, producing
// a false "missing event". Two guards work together: the networkidle wait below lets the
// list's own fetch finish before the quiet clock starts, and this window then only has to
// absorb the post-fetch debounce.
const DEFAULT_QUIET_MS = 6000;
const DEFAULT_HARD_TIMEOUT_MS = 45_000;
const DEFAULT_NAV_TIMEOUT_MS = 30_000;
// Bounded wait for the page's own XHR/fetch traffic to drain after domcontentloaded, so
// data-driven content (property lists, search results) has pushed before we start timing
// the quiet window. Chatty pages (ads, chat widgets, polling) never fully idle — the wait
// just times out and we fall through to the quiet-window logic.
const DEFAULT_NETWORK_IDLE_TIMEOUT_MS = 12_000;
// How long to wait for a consent "accept all" control to appear and be clickable. Real
// banners (OneTrust) render 2-4s in; this runs in parallel with the networkidle wait, so
// on a site with no banner it costs at most this much extra before the quiet window.
export const CONSENT_ACCEPT_TIMEOUT_MS = 5000;
// Per-step ceiling for resolving and clicking an interaction target. Generous because a
// click template's target (a CTA below the fold, a lazy-rendered card) may not be present
// the instant the page loads.
const DEFAULT_STEP_TIMEOUT_MS = 8000;
// Pause between successive steps (not after the last one) so a slightly-debounced push
// from step N has landed before step N+1 fires — otherwise runCapture's step→event
// attribution below could credit it to the wrong step.
const INTER_STEP_DELAY_MS = 1200;
// Shorter than the up-front pass: between steps this is a "just in case a banner turned
// up" check on a page that usually has none, so it shouldn't cost seconds per step.
const LATE_CONSENT_ACCEPT_TIMEOUT_MS = 2000;

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
  /** Bounded wait for the page's own fetch/XHR traffic to drain before the quiet window
   * starts. 0 skips it. */
  networkIdleTimeoutMs?: number;
  /** Click the cookie-consent "accept all" button after load. On by default: most
   * analytics — GA4 ecommerce views, list-impression events — is consent-gated, so a
   * capture with the banner still up sees far less than a real returning visitor. Set
   * false to capture the pre-consent state instead. */
  acceptCookieBanner?: boolean;
  /** Ordered interactions to perform after load (and after consent) but before the quiet
   * window — for click-event templates. Omitted/empty = today's load-only capture. */
  steps?: InteractionStep[];
  /** Per-step resolve+click ceiling. */
  stepTimeoutMs?: number;
}

// "Accept all" controls for the common consent platforms, by stable id/class, plus a
// role+name fallback for everything else. Tried as one bounded click attempt — if none
// match (no banner, or already accepted) the capture just proceeds.
const CONSENT_ACCEPT_CSS = [
  '#onetrust-accept-btn-handler', // OneTrust / OptanonWrapper
  '#truste-consent-button', // TrustArc
  '#didomi-notice-agree-button', // Didomi
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', // Cookiebot
  '#CybotCookiebotDialogBodyButtonAccept',
  '.cc-btn.cc-allow', // Osano / cookieconsent
  '.js-accept-all-cookies',
  '[data-testid="uc-accept-all-button"]', // Usercentrics
].join(', ');

export async function acceptConsentBanner(page: Page, timeoutMs: number): Promise<void> {
  const button = page
    .locator(CONSENT_ACCEPT_CSS)
    .or(page.getByRole('button', { name: /^\s*(accept all|allow all|accept all cookies|i accept|agree|got it)\b/i }))
    .first();
  try {
    await button.click({ timeout: timeoutMs });
  } catch {
    // No banner, hidden, or already dismissed — nothing to do.
  }
}

/**
 * Turns a step target into a Playwright locator. `css` is passed straight through; `text`
 * matches the common clickable roles by accessible name, then falls back to any element
 * containing the text — same resilient-union style as acceptConsentBanner above.
 */
function resolveStepLocator(page: Page, target: InteractionStep['target']): Locator {
  if (target.by === 'css') return page.locator(target.value).first();
  // Case-insensitive substring match on the accessible name, so "Book a viewing" still
  // finds a button labelled "Book a Viewing" or "Book a viewing today".
  const name = new RegExp(target.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return page
    .getByRole('button', { name })
    .or(page.getByRole('link', { name }))
    .or(page.getByRole('menuitem', { name }))
    .or(page.getByText(target.value, { exact: false }))
    .first();
}

/**
 * Works out why a click didn't land, so the run can say something more useful than
 * "target not found" — the two cases that actually come up are a control that's disabled
 * in its current state, and a click intercepted by an overlay sitting on top of it.
 */
async function diagnoseClickFailure(
  locator: Locator,
  rawMessage: string
): Promise<{ status: StepResult['status']; message: string }> {
  try {
    if ((await locator.count()) === 0) {
      return { status: 'target_not_found', message: 'No element on the page matched this target.' };
    }
    if (await locator.isDisabled({ timeout: 1000 }).catch(() => false)) {
      return {
        status: 'target_disabled',
        message: 'The element is disabled right now — an earlier step may need to enable it first.',
      };
    }
    const blocker = await locator
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!at || at === el || el.contains(at)) return null;
        const id = at.id ? `#${at.id}` : '';
        const cls = typeof at.className === 'string' && at.className ? `.${at.className.trim().split(/\s+/).join('.')}` : '';
        return `${at.tagName.toLowerCase()}${id}${cls}`.slice(0, 120);
      })
      .catch(() => null);
    if (blocker) {
      return { status: 'click_blocked', message: `Another element is covering it: ${blocker}` };
    }
  } catch {
    /* fall through to the raw Playwright message */
  }
  return { status: 'target_not_found', message: rawMessage.split('\n')[0].slice(0, 300) };
}

/**
 * Performs the interaction steps in order. A step that can't be resolved/clicked is
 * recorded as a failure and stops the sequence (later steps almost always depend on an
 * earlier one) — but never throws: the caller still gets whatever was captured up to that
 * point, and the StepResult list explains what happened.
 */
async function runInteractionSteps(
  page: Page,
  steps: InteractionStep[],
  stepTimeoutMs: number,
  acceptCookieBanner: boolean
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    // Re-run the consent dismissal before every step, not just once after load. Plenty of
    // sites lazy-load their CMP on first interaction, so the banner doesn't exist yet when
    // runCapture's up-front pass looks for it — it appears *because* of step 1's click,
    // then its full-screen backdrop intercepts every click after that. Cheap and
    // non-fatal: on a page with no banner this just finds nothing.
    if (acceptCookieBanner && index > 0) {
      await acceptConsentBanner(page, LATE_CONSENT_ACCEPT_TIMEOUT_MS);
    }
    // Recorded before the click, not after it resolves: click-resolution and the
    // exposeBinding delivery for whatever push it triggers travel over separate async
    // channels with no guaranteed relative order, so "resolved" is not a safe boundary.
    // "Initiated" is — Node's own control flow guarantees nothing from this step's click
    // (or the next step's) can happen before this line runs.
    const firedAt = Date.now();
    const locator = resolveStepLocator(page, step.target);
    try {
      await locator.click({ timeout: stepTimeoutMs });
      results.push({ index, target: step.target, label: step.label, status: 'ok', firedAt });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const isTimeout = /Timeout .*exceeded|waiting for locator/i.test(raw);
      const { status, message } = isTimeout
        ? await diagnoseClickFailure(locator, raw)
        : { status: 'error' as const, message: raw.split('\n')[0].slice(0, 300) };
      results.push({ index, target: step.target, label: step.label, status, message });
      break;
    }
    if (index < steps.length - 1) {
      await page.waitForTimeout(INTER_STEP_DELAY_MS);
    }
  }
  return results;
}

/**
 * Attributes each event-shaped push to whichever step was "current" when it arrived —
 * the last step whose click had already resolved by that push's receivedAt, or `null` if
 * it arrived before any step fired (during the initial page load). Parallel to the
 * `events` array `partitionPushes` derives from the same `pushes` list, so the two stay
 * in lockstep as long as both walk it in the same order.
 */
function attributeEventsToSteps(pushes: StreamedPush[], stepResults: StepResult[]): (number | null)[] {
  const fired = stepResults.filter((r) => r.status === 'ok' && r.firedAt !== undefined);
  const indexes: (number | null)[] = [];
  for (const p of pushes) {
    if (!isEventShaped(p.push)) continue;
    let stepIndex: number | null = null;
    for (const r of fired) {
      if (r.firedAt! <= p.receivedAt) stepIndex = r.index;
      else break;
    }
    indexes.push(stepIndex);
  }
  return indexes;
}

export async function runCapture(page: Page, url: string, opts: RunCaptureOptions = {}): Promise<CaptureResult> {
  const quietMs = opts.settleQuietMs ?? DEFAULT_QUIET_MS;
  const hardTimeoutMs = opts.hardTimeoutMs ?? DEFAULT_HARD_TIMEOUT_MS;
  const navTimeoutMs = opts.navTimeoutMs ?? DEFAULT_NAV_TIMEOUT_MS;
  const networkIdleTimeoutMs = opts.networkIdleTimeoutMs ?? DEFAULT_NETWORK_IDLE_TIMEOUT_MS;
  const acceptCookieBanner = opts.acceptCookieBanner ?? true;
  const steps = opts.steps ?? [];
  const stepTimeoutMs = opts.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;

  const startedAt = new Date().toISOString();
  const captureStartMs = Date.now();
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

  // In parallel:
  //  - accept the cookie banner, so consent-gated analytics actually fire (its own burst
  //    of pushes then keeps the quiet window alive);
  //  - let the page's own data fetches (property lists, search results) drain, so their
  //    late pushes land before we start timing the quiet window.
  // Both are bounded and non-fatal: chatty pages (ads, chat, polling) never fully idle,
  // and a page with no banner just moves on.
  await Promise.all([
    acceptCookieBanner ? acceptConsentBanner(page, CONSENT_ACCEPT_TIMEOUT_MS) : Promise.resolve(),
    networkIdleTimeoutMs > 0
      ? page.waitForLoadState('networkidle', { timeout: networkIdleTimeoutMs }).catch(() => {})
      : Promise.resolve(),
  ]);

  // Interaction phase (click-event templates): perform the steps now, so the pushes each
  // click triggers land while the stream is recording and the quiet window below then
  // absorbs their async tail. Load-only captures pass no steps and skip this entirely.
  let stepResults: StepResult[] | undefined;
  if (steps.length > 0) {
    // A click step is very often a plain <a href> or a form submit that navigates to
    // another page (a property card -> its detail page). We only care what the click
    // itself pushes, not the destination's own page-load noise — and since
    // exposeBinding/addInitScript are deliberately built to survive navigation, without
    // this guard the capture would happily keep recording straight into that page's
    // page_loaded/GTM boot. Abort the navigation request itself: the click's JS handler
    // (and any dataLayer.push it does) still runs first, only the browser's actual
    // document-replace never completes, so this stays the same document throughout — no
    // new document, no captureInitScript re-run. A same-document SPA route change isn't
    // a network request at all, so it's unaffected either way.
    const blockNavigation = (route: Route) => {
      const req = route.request();
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
        route.abort('aborted').catch(() => {});
      } else {
        route.continue().catch(() => {});
      }
    };
    await page.route('**/*', blockNavigation);
    try {
      stepResults = await runInteractionSteps(page, steps, stepTimeoutMs, acceptCookieBanner);
    } finally {
      await page.unroute('**/*', blockNavigation).catch(() => {});
    }
  }

  // Keep the hard ceiling anchored to capture start, so the networkidle wait above doesn't
  // stack on top of a full hardTimeoutMs quiet phase.
  const remainingHardMs = Math.max(quietMs, hardTimeoutMs - (Date.now() - captureStartMs));
  const { settledNaturally } = await waitUntilQuiet(stream, { quietMs, hardTimeoutMs: remainingHardMs });

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
    ...(stepResults ? { stepResults, eventStepIndex: attributeEventsToSteps(stream.pushes, stepResults) } : {}),
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
