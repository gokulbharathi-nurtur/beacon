import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { TemplateEvent, RawEvent, FieldDiff, ContentCheckResultStatus } from '@/lib/types';
import { EVENT_CATEGORY_VALUES } from '@/lib/eventCategories';

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull().unique(),
  sourceUrl: text('source_url').notNull(),
  category: text('category', { enum: EVENT_CATEGORY_VALUES }).notNull().default('click'),
  clickSelector: text('click_selector'),
  // Snapshot of the clicked element at record time — the only evidence a later diff run has
  // to tell "this selector still points at the same button" from "the DOM reshuffled and it
  // now silently resolves to something else" (see lib/capture/discoverClickables.ts).
  clickLabel: text('click_label'),
  clickHref: text('click_href'),
  events: text('events', { mode: 'json' }).$type<TemplateEvent[]>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  targetUrl: text('target_url').notNull(),
  templateId: text('template_id').references(() => templates.id),
  // 'audit' checks the capture against the canonical event catalog instead of a template,
  // so it carries no templateId.
  mode: text('mode', { enum: ['diff', 'record', 'audit'] }).notNull(),
  clickSelector: text('click_selector'),
  // For a diff run, copied from the template at creation — what the recording expected to
  // click. Compared at read time (see app/api/runs/[id]/route.ts) against clickTarget*
  // below — what runCapture actually found live — to warn on drift.
  clickLabel: text('click_label'),
  clickHref: text('click_href'),
  clickTargetLabel: text('click_target_label'),
  clickTargetHref: text('click_target_href'),
  clickTargetResolvedCount: integer('click_target_resolved_count'),
  // Record-mode only (see lib/capture/drivers/form.ts) — a diff run never carries these,
  // since automatically re-submitting a form on every future check is exactly the
  // repeated real-world side effect this tool must never cause on its own.
  formSelector: text('form_selector'),
  // SQLite has no boolean type; drizzle's integer 'boolean' mode maps 0/1 to false/true.
  formAllowSubmit: integer('form_allow_submit', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: ['queued', 'running', 'complete', 'error'] })
    .notNull()
    .default('queued'),
  errorMessage: text('error_message'),
  capturedEvents: text('captured_events', { mode: 'json' }).$type<RawEvent[]>(),
  rawPushCount: integer('raw_push_count'),
  nonEventPushCount: integer('non_event_push_count'),
  nonEventPushes: text('non_event_pushes', { mode: 'json' }).$type<unknown[]>(),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sweeps = sqliteTable('sweeps', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  baseUrl: text('base_url').notNull(),
  status: text('status', { enum: ['queued', 'running', 'complete', 'error'] })
    .notNull()
    .default('queued'),
  errorMessage: text('error_message'),
  // How enumeratePages found its URLs — informational, surfaced in the UI so a "crawl"
  // result (a same-origin BFS, weaker coverage than a real sitemap) reads as such.
  pageSource: text('page_source', { enum: ['sitemap', 'crawl'] }),
  totalUrlsDiscovered: integer('total_urls_discovered'),
  bucketCount: integer('bucket_count'),
  // Updated as the sweep runs, not just at the end — the coverage page polls a running
  // sweep the same way RunDetail already polls a run, so progress is visible live.
  pagesSweptCount: integer('pages_swept_count').notNull().default(0),
  elementsSweptCount: integer('elements_swept_count').notNull().default(0),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sweepFindings = sqliteTable('sweep_findings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sweepId: text('sweep_id')
    .notNull()
    .references(() => sweeps.id),
  // 'clean'/'silent_element'/'schema_violation' are per-page findings; 'coverage_gap' is
  // sweep-wide (a catalog event never observed on any page), so pageUrl/pagePattern are
  // null on those rows.
  kind: text('kind', { enum: ['clean', 'silent_element', 'schema_violation', 'coverage_gap'] }).notNull(),
  pageUrl: text('page_url'),
  pagePattern: text('page_pattern'),
  // Null means this row is about the page's load-time events rather than a clicked
  // element — the "page load" row of the coverage matrix.
  elementSelector: text('element_selector'),
  elementLabel: text('element_label'),
  // Set for schema_violation (the event that failed) and coverage_gap (the catalog event
  // never seen); absent for silent_element, which is defined by firing nothing at all.
  eventName: text('event_name'),
  fieldDiffs: text('field_diffs', { mode: 'json' }).$type<FieldDiff[]>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// One uploaded reference spreadsheet — the URL-pattern -> expected content_group/
// content_id/content_type table (see AGENTS.md-adjacent feature doc: "content checker").
// Unlike the catalog (package-wide event shapes), this is site-specific and user-supplied.
export const contentMaps = sqliteTable('content_maps', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  sourceFilename: text('source_filename'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const contentMapRules = sqliteTable('content_map_rules', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  contentMapId: text('content_map_id')
    .notNull()
    .references(() => contentMaps.id),
  // Preserves the sheet's row order — matching tries rules in this order and takes the
  // first one whose pattern matches, so a specific row ahead of a catch-all row (e.g.
  // "/property-for-sale/selling/" before "/property-for-sale/*") wins as the sheet intends.
  rowOrder: integer('row_order').notNull(),
  // Original "pages" cell text, kept verbatim for display/debugging alongside the
  // normalized patterns actually used to match.
  rawPagesText: text('raw_pages_text').notNull(),
  patterns: text('patterns', { mode: 'json' }).$type<string[]>().notNull(),
  // null = blank cell, not checked. The literal string 'undefined' is checked against a
  // real JS undefined value rather than skipped — see ContentMapRuleData's doc comment.
  contentGroup: text('content_group'),
  contentId: text('content_id'),
  contentType: text('content_type'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const contentChecks = sqliteTable('content_checks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  contentMapId: text('content_map_id')
    .notNull()
    .references(() => contentMaps.id),
  // 'site' crawls from this as a root (sitemap/BFS, like Coverage); 'page' checks this
  // exact URL alone, with no crawl — same column either way, since both modes ultimately
  // just need one URL to start from and the meaning is unambiguous given `mode`.
  baseUrl: text('base_url').notNull(),
  mode: text('mode', { enum: ['site', 'page'] }).notNull().default('site'),
  status: text('status', { enum: ['queued', 'running', 'complete', 'error'] })
    .notNull()
    .default('queued'),
  errorMessage: text('error_message'),
  // Null for 'page' mode — there's no crawl to have a source or a discovered-URL count.
  pageSource: text('page_source', { enum: ['sitemap', 'crawl'] }),
  totalUrlsDiscovered: integer('total_urls_discovered'),
  pagesCheckedCount: integer('pages_checked_count').notNull().default(0),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const contentCheckResults = sqliteTable('content_check_results', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  contentCheckId: text('content_check_id')
    .notNull()
    .references(() => contentChecks.id),
  pageUrl: text('page_url').notNull(),
  // Null on a 'no_rule' result — no content-map row matched this URL at all.
  matchedPattern: text('matched_pattern'),
  status: text('status', { enum: ['pass', 'fail', 'no_rule', 'no_page_load_event'] })
    .notNull()
    .$type<ContentCheckResultStatus>(),
  expected: text('expected', { mode: 'json' }).$type<{
    contentGroup: string | null;
    contentId: string | null;
    contentType: string | null;
  } | null>(),
  // The captured page_loaded event's `page` object, verbatim (undefined-marked — see
  // lib/capture/undefinedMarker.ts). Null when no page_loaded event fired at all.
  actual: text('actual', { mode: 'json' }).$type<unknown>(),
  fieldDiffs: text('field_diffs', { mode: 'json' }).$type<FieldDiff[]>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type TemplateRow = typeof templates.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type SweepRow = typeof sweeps.$inferSelect;
export type SweepFindingRow = typeof sweepFindings.$inferSelect;
export type ContentMapRow = typeof contentMaps.$inferSelect;
export type ContentMapRuleRow = typeof contentMapRules.$inferSelect;
export type ContentCheckRow = typeof contentChecks.$inferSelect;
export type ContentCheckResultRow = typeof contentCheckResults.$inferSelect;
