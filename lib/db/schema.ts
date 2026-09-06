import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { TemplateEvent, RawEvent, FieldDiff, ContentCheckResultStatus } from '@/lib/types';

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull().unique(),
  sourceUrl: text('source_url').notNull(),
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
  // 'record' captures a fresh golden template; 'diff' checks a live page against one.
  mode: text('mode', { enum: ['diff', 'record'] }).notNull(),
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

// One uploaded reference spreadsheet — the site-specific, user-supplied URL-pattern ->
// expected content_group/content_id/content_type table the content check validates against.
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
  // 'site' crawls from this as a root (sitemap.xml, or same-origin BFS); 'page' checks this
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
export type ContentMapRow = typeof contentMaps.$inferSelect;
export type ContentMapRuleRow = typeof contentMapRules.$inferSelect;
export type ContentCheckRow = typeof contentChecks.$inferSelect;
export type ContentCheckResultRow = typeof contentCheckResults.$inferSelect;
