import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { contentChecks, contentCheckResults, contentMapRules } from '@/lib/db/schema';
import { getBrowser } from '@/lib/browser';
import { getQueue } from '@/lib/queue';
import { runCapture } from '@/lib/capture/injectCapture';
import { enumeratePages } from '@/lib/crawl/enumeratePages';
import { sampleBucket } from '@/lib/crawl/sampleBucket';
import { compileContentRule, buildFieldRules } from '@/lib/content/contentRules';
import { findMatchingRule, type CompiledContentRule } from '@/lib/content/patternMatch';
import { compareFieldsAgainstObject } from '@/lib/diff/compareFields';
import type { ContentCheckResultStatus } from '@/lib/types';

const MAX_URLS = 300;
// One sample per matched rule, not several: every page a rule matches renders off the same
// template and is expected to carry the same content_group/content_id/content_type, so a
// second or third sample of the same rule tells you nothing a first one didn't (a detail-page
// family — property listings, news articles, branch pages, area guides — can be hundreds of
// URLs behind one rule). A rule that only ever matches one real URL (a static page like
// "/about-charters/") is unaffected either way, since sampleBucket already returns
// everything when the bucket is within budget.
const MAX_PAGES_PER_RULE = 1;
// A handful of examples is enough to show "this part of the site has no matching row in
// the reference table" without flooding results on a large, mostly-uncovered site.
const MAX_UNMATCHED_SAMPLES = 10;
// A content check does one load pass per page, so it reuses runCapture's own proven
// defaults (not passing settleQuietMs/hardTimeoutMs at all) rather than a shortened
// quiet window. Cutting the margin here caused real misses: on a real production site
// (chartersestateagents.co.uk — see injectCapture.ts's own DEFAULT_QUIET_MS comment for
// this site's previously-measured timing), page_loaded was observed firing ~2.3-2.7s
// after navigation with a single uncontended browser context; under this pipeline's real
// concurrency (two pages loading at once through the shared queue), that regularly crept
// past a 3000ms quiet window and got cut off before the page_loaded push ever arrived — a
// false "no page_load event" on pages that do fire it.

/**
 * Runs in the background, off the HTTP request/response cycle. Stays outside the shared
 * browser-context queue: a long-lived orchestrator holding a concurrency slot for its
 * entire duration would starve the queue for its own per-page sub-tasks.
 */
export async function executeContentCheck(contentCheckId: string): Promise<void> {
  await db.update(contentChecks).set({ status: 'running', startedAt: new Date() }).where(eq(contentChecks.id, contentCheckId));
  const [check] = await db.select().from(contentChecks).where(eq(contentChecks.id, contentCheckId));
  if (!check) return;

  try {
    const ruleRows = await db
      .select()
      .from(contentMapRules)
      .where(eq(contentMapRules.contentMapId, check.contentMapId));
    const rules = ruleRows
      .map((row) => compileContentRule(row))
      .sort((a, b) => a.rowOrder - b.rowOrder);

    let samples: Array<{ url: string; rule: CompiledContentRule | null }>;
    if (check.mode === 'page') {
      // No crawl in this mode — set totalUrlsDiscovered immediately so the detail page
      // shows "checking" rather than sitting on "discovering pages" for a step that never
      // happens.
      await db.update(contentChecks).set({ totalUrlsDiscovered: 1 }).where(eq(contentChecks.id, contentCheckId));
      samples = [{ url: check.baseUrl, rule: findMatchingRule(check.baseUrl, rules) }];
    } else {
      samples = await discoverSiteSamples(contentCheckId, check.baseUrl, rules);
    }

    for (const sample of samples) {
      await getQueue()
        .add(() => checkOnePage(contentCheckId, sample.url, sample.rule))
        .catch(() => {});
      await db
        .update(contentChecks)
        .set({ pagesCheckedCount: sql`${contentChecks.pagesCheckedCount} + 1` })
        .where(eq(contentChecks.id, contentCheckId));
    }

    await db.update(contentChecks).set({ status: 'complete', finishedAt: new Date() }).where(eq(contentChecks.id, contentCheckId));
  } catch (err) {
    await db
      .update(contentChecks)
      .set({ status: 'error', errorMessage: err instanceof Error ? err.message : String(err), finishedAt: new Date() })
      .where(eq(contentChecks.id, contentCheckId));
  }
}

/** 'site' mode's path: crawl the whole site, then bucket+sample the result. Records
 * pageSource/totalUrlsDiscovered as soon as the crawl finishes, so a still-running check
 * already shows how many pages it found. */
async function discoverSiteSamples(
  contentCheckId: string,
  baseUrl: string,
  rules: CompiledContentRule[]
): Promise<Array<{ url: string; rule: CompiledContentRule | null }>> {
  const { urls, source } = await enumeratePages(baseUrl, { maxUrls: MAX_URLS });
  await db
    .update(contentChecks)
    .set({ pageSource: source, totalUrlsDiscovered: urls.length })
    .where(eq(contentChecks.id, contentCheckId));

  return pickSamples(urls, rules);
}

/**
 * Groups discovered URLs by which content-map rule (if any) matches them, then samples one
 * per group (MAX_UNMATCHED_SAMPLES for URLs no rule covers), bucketed by the user-supplied
 * reference rows.
 */
function pickSamples(urls: string[], rules: CompiledContentRule[]): Array<{ url: string; rule: CompiledContentRule | null }> {
  const byRule = new Map<string | null, string[]>();
  for (const url of urls) {
    const rule = findMatchingRule(url, rules);
    const key = rule?.id ?? null;
    const bucket = byRule.get(key);
    if (bucket) bucket.push(url);
    else byRule.set(key, [url]);
  }

  const samples: Array<{ url: string; rule: CompiledContentRule | null }> = [];
  for (const [key, bucketUrls] of byRule) {
    const rule = key === null ? null : (rules.find((r) => r.id === key) ?? null);
    const cap = rule === null ? MAX_UNMATCHED_SAMPLES : MAX_PAGES_PER_RULE;
    for (const url of sampleBucket(bucketUrls, cap)) {
      samples.push({ url, rule });
    }
  }
  return samples;
}

async function checkOnePage(contentCheckId: string, url: string, rule: CompiledContentRule | null): Promise<void> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const result = await runCapture(page, url);
    const pageLoadEvent = result.events.find((e) => e.event === 'page_loaded');

    if (!rule) {
      await insertResult(contentCheckId, {
        pageUrl: url,
        matchedPattern: null,
        status: 'no_rule',
        expected: null,
        actual: pageLoadEvent?.page ?? null,
        fieldDiffs: [],
      });
      return;
    }

    const expected = { contentGroup: rule.contentGroup, contentId: rule.contentId, contentType: rule.contentType };

    if (!pageLoadEvent) {
      await insertResult(contentCheckId, {
        pageUrl: url,
        matchedPattern: rule.rawPagesText,
        status: 'no_page_load_event',
        expected,
        actual: null,
        fieldDiffs: [],
      });
      return;
    }

    const fieldDiffs = compareFieldsAgainstObject(buildFieldRules(rule), pageLoadEvent, { checkUnexpected: false });
    const status: ContentCheckResultStatus = fieldDiffs.length === 0 ? 'pass' : 'fail';
    await insertResult(contentCheckId, {
      pageUrl: url,
      matchedPattern: rule.rawPagesText,
      status,
      expected,
      actual: pageLoadEvent.page ?? null,
      fieldDiffs,
    });
  } finally {
    await context.close().catch(() => {});
  }
}

async function insertResult(
  contentCheckId: string,
  values: Omit<typeof contentCheckResults.$inferInsert, 'id' | 'contentCheckId' | 'createdAt'>
): Promise<void> {
  await db.insert(contentCheckResults).values({ contentCheckId, ...values });
}
