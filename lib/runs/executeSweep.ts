import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sweeps, sweepFindings } from '@/lib/db/schema';
import { getBrowser } from '@/lib/browser';
import { getQueue } from '@/lib/queue';
import { runCapture } from '@/lib/capture/injectCapture';
import { discoverClickableElements, type ClickableElement } from '@/lib/capture/discoverClickables';
import { enumeratePages } from '@/lib/sweep/enumeratePages';
import { classifyPages, sampleBucket } from '@/lib/sweep/classifyPages';
import { auditCapture } from '@/lib/catalog/auditCapture';
import { getCatalog } from '@/lib/catalog/load';
import type { RawEvent } from '@/lib/types';

const MAX_URLS = 300;
/** Test a few representative pages per bucket rather than every property listing —
 * classifyPages already grouped near-identical detail pages together. */
const MAX_PAGES_PER_BUCKET = 3;
const MAX_ELEMENTS_PER_PAGE = 20;
// Shorter than the 5000ms diff/record default: a sweep drives dozens of captures, so it
// trades a little recall on the slowest debounced events for throughput across the whole
// site. Tunable per call if a site's own findings turn out to need more headroom.
const SETTLE_QUIET_MS = 3000;
const HARD_TIMEOUT_MS = 15_000;

/**
 * Runs in the background, off the HTTP request/response cycle, same as executeRun. Not
 * itself wrapped in the shared queue (see lib/queue.ts) — it's a long-lived orchestrator,
 * not one browser operation, so wrapping it would hold a concurrency slot for the sweep's
 * entire duration and starve the queue for everything else, including its own per-page and
 * per-element sub-tasks. Only the actual browser-context work below goes through the queue.
 */
export async function executeSweep(sweepId: string): Promise<void> {
  await db.update(sweeps).set({ status: 'running', startedAt: new Date() }).where(eq(sweeps.id, sweepId));
  const [sweep] = await db.select().from(sweeps).where(eq(sweeps.id, sweepId));
  if (!sweep) return;

  try {
    const { urls, source } = await enumeratePages(sweep.baseUrl, { maxUrls: MAX_URLS });
    const buckets = classifyPages(urls);
    const samples = buckets.flatMap((bucket) =>
      sampleBucket(bucket.urls, MAX_PAGES_PER_BUCKET).map((url) => ({ url, pattern: bucket.pattern }))
    );

    await db
      .update(sweeps)
      .set({ pageSource: source, totalUrlsDiscovered: urls.length, bucketCount: buckets.length })
      .where(eq(sweeps.id, sweepId));

    const observedEventNames = new Set<string>();

    for (const sample of samples) {
      await sweepOnePage(sweepId, sample.url, sample.pattern, observedEventNames);
      await db
        .update(sweeps)
        .set({ pagesSweptCount: sql`${sweeps.pagesSweptCount} + 1` })
        .where(eq(sweeps.id, sweepId));
    }

    // Only meaningful once every sampled page has been through the loop above — a catalog
    // event is a coverage gap if nothing anywhere in the sweep produced it, which isn't
    // knowable until the last page has been checked.
    await recordCoverageGaps(sweepId, observedEventNames);

    await db.update(sweeps).set({ status: 'complete', finishedAt: new Date() }).where(eq(sweeps.id, sweepId));
  } catch (err) {
    await db
      .update(sweeps)
      .set({ status: 'error', errorMessage: err instanceof Error ? err.message : String(err), finishedAt: new Date() })
      .where(eq(sweeps.id, sweepId));
  }
}

/**
 * Captures load-time events once for the page, then drives every clickable element found
 * on it. One broken page (a 500, a redirect loop, a nav timeout) is not allowed to sink
 * the rest of the sweep — failures here are swallowed and just leave fewer findings for
 * this page, the same tolerance discoverClickableElements/describeClickTarget already
 * apply elsewhere in the capture layer.
 */
async function sweepOnePage(sweepId: string, url: string, pattern: string, observedEventNames: Set<string>): Promise<void> {
  let elements: ClickableElement[] = [];
  try {
    elements = await getQueue().add(() => runLoadPass(sweepId, url, pattern, observedEventNames));
  } catch {
    return;
  }

  await Promise.all(
    elements.map((element) =>
      getQueue()
        .add(() => sweepOneElement(sweepId, url, pattern, element, observedEventNames))
        .catch(() => {})
    )
  );
}

async function runLoadPass(sweepId: string, url: string, pattern: string, observedEventNames: Set<string>): Promise<ClickableElement[]> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const result = await runCapture(page, url, { settleQuietMs: SETTLE_QUIET_MS, hardTimeoutMs: HARD_TIMEOUT_MS });
    for (const event of result.events) {
      observedEventNames.add(event.event);
      await recordEventFinding(sweepId, { pageUrl: url, pagePattern: pattern, elementSelector: null, elementLabel: null, event });
    }
    return await discoverClickableElements(page, MAX_ELEMENTS_PER_PAGE);
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Isolation is the point of a fresh context per element (per the plan): one element's side
 * effects — a form submit, a modal, a route change — can never contaminate the next
 * element's result the way reusing a single page across clicks would.
 */
async function sweepOneElement(
  sweepId: string,
  url: string,
  pattern: string,
  element: ClickableElement,
  observedEventNames: Set<string>
): Promise<void> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const result = await runCapture(page, url, {
      clickSelector: element.selector,
      settleQuietMs: SETTLE_QUIET_MS,
      hardTimeoutMs: HARD_TIMEOUT_MS,
    });

    // Only what the click itself caused (see indexOfFirstEventAtOrAfter in
    // injectCapture.ts) — everything before that index is the page's own load-time events,
    // re-triggered by the navigation the click caused, not something this element did.
    const clickEvents =
      result.eventsAfterInteractionIndex === null ? [] : result.events.slice(result.eventsAfterInteractionIndex);

    if (clickEvents.length === 0) {
      await db.insert(sweepFindings).values({
        sweepId,
        kind: 'silent_element',
        pageUrl: url,
        pagePattern: pattern,
        elementSelector: element.selector,
        elementLabel: element.label,
      });
    } else {
      for (const event of clickEvents) {
        observedEventNames.add(event.event);
        await recordEventFinding(sweepId, {
          pageUrl: url,
          pagePattern: pattern,
          elementSelector: element.selector,
          elementLabel: element.label,
          event,
        });
      }
    }
  } finally {
    await context.close().catch(() => {});
  }

  await db
    .update(sweeps)
    .set({ elementsSweptCount: sql`${sweeps.elementsSweptCount} + 1` })
    .where(eq(sweeps.id, sweepId));
}

/** Judges one captured event against the catalog (reusing the Stage 2 audit engine
 * unchanged) and records the verdict as a finding row. 'unchecked' — a real event name
 * with no harvested sample to validate shape against — reads as clean: there is no
 * evidence of a problem, only an absence of evidence either way. 'unknown_event' is folded
 * into schema_violation with no fieldDiffs; the UI treats an empty fieldDiffs list on a
 * violation as "event name not recognized" rather than a shape mismatch. */
async function recordEventFinding(
  sweepId: string,
  args: { pageUrl: string; pagePattern: string; elementSelector: string | null; elementLabel: string | null; event: RawEvent }
): Promise<void> {
  const verdict = auditCapture([args.event]).events[0];
  const clean = verdict.status === 'clean' || verdict.status === 'unchecked';

  await db.insert(sweepFindings).values({
    sweepId,
    kind: clean ? 'clean' : 'schema_violation',
    pageUrl: args.pageUrl,
    pagePattern: args.pagePattern,
    elementSelector: args.elementSelector,
    elementLabel: args.elementLabel,
    eventName: args.event.event,
    fieldDiffs: verdict.fieldDiffs.length > 0 ? verdict.fieldDiffs : null,
  });
}

/** A fixed-name catalog event (one of EVENT_NAMES, not a caller-supplied "dynamic" one —
 * see CatalogEvent.fixedName) that this sweep never observed anywhere. Soft evidence, not
 * proof: a site may legitimately not use every feature the package supports. Still worth
 * surfacing, since the alternative — tracking that was simply never wired up — is
 * otherwise invisible to a tool that only checks events it actually receives. */
async function recordCoverageGaps(sweepId: string, observedEventNames: Set<string>): Promise<void> {
  const catalog = getCatalog();
  for (const event of catalog.events) {
    if (!event.fixedName) continue;
    if (observedEventNames.has(event.eventName)) continue;
    await db.insert(sweepFindings).values({ sweepId, kind: 'coverage_gap', eventName: event.eventName });
  }
}
