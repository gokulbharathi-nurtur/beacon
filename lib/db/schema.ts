import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type {
  TemplateEvent,
  RawEvent,
  FieldDiff,
  ContentCheckResultStatus,
  InteractionStep,
  StepResult,
} from '@/lib/types';

// A project groups all the work for one site — its templates, diff runs, content maps and
// content checks. Which project a URL belongs to is decided by matching the URL's hostname
// against projectHostnames (see lib/projects/matchProject.ts).
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// One hostname that belongs to a project, e.g. "linleyandsimpson2.q.starberry.com" or the
// production "www.linleyandsimpson.co.uk". Unique so a hostname maps to exactly one
// project — that's what makes the auto-suggest lookup unambiguous.
export const projectHostnames = sqliteTable('project_hostnames', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  hostname: text('hostname').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').references(() => projects.id),
  name: text('name').notNull().unique(),
  sourceUrl: text('source_url').notNull(),
  // What the template's events are triggered by. 'pageload' = capture on navigation (the
  // original and only pre-existing behaviour); 'click' = capture after performing `steps`.
  kind: text('kind', { enum: ['pageload', 'click'] }).notNull().default('pageload'),
  // Ordered interactions performed after load before the capture settles. Null/empty for
  // 'pageload'; at least one entry for 'click'.
  steps: text('steps', { mode: 'json' }).$type<InteractionStep[]>(),
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
  projectId: text('project_id').references(() => projects.id),
  // Human label. User-supplied when given, otherwise derived from the target URL's path
  // (see lib/runs/deriveRunName.ts) at creation time.
  name: text('name'),
  targetUrl: text('target_url').notNull(),
  // Primary template = templateIds[0]; kept as a real FK so deleting a template can null
  // it out and legacy rows (pre-multi-template) still resolve.
  templateId: text('template_id').references(() => templates.id),
  // The full ordered list a diff run is compared against (1-2 entries). Null on rows
  // created before multi-template support — readers fall back to [templateId].
  templateIds: text('template_ids', { mode: 'json' }).$type<string[]>(),
  // 'record' captures a fresh golden template; 'diff' checks a live page against one or two.
  mode: text('mode', { enum: ['diff', 'record'] }).notNull(),
  // Mirrors the template's `kind`. A diff run copies this + `steps` from its primary
  // template at creation; a record run gets them from the record form. Legacy rows are
  // 'pageload' via the column default.
  kind: text('kind', { enum: ['pageload', 'click'] }).notNull().default('pageload'),
  // Snapshot of the interaction steps this run actually executed — copied at creation so a
  // later edit to the source template doesn't rewrite run history.
  steps: text('steps', { mode: 'json' }).$type<InteractionStep[]>(),
  // One entry per step attempted, filled in by the capture. Null for 'pageload' runs.
  stepResults: text('step_results', { mode: 'json' }).$type<StepResult[]>(),
  // Parallel to capturedEvents — eventStepIndex[i] is the step index that triggered
  // capturedEvents[i], or null if it fired before any step (page load). Null for
  // 'pageload' runs, which have no steps to attribute against.
  eventStepIndex: text('event_step_index', { mode: 'json' }).$type<(number | null)[]>(),
  status: text('status', { enum: ['queued', 'running', 'complete', 'error'] })
    .notNull()
    .default('queued'),
  errorMessage: text('error_message'),
  capturedEvents: text('captured_events', { mode: 'json' }).$type<RawEvent[]>(),
  rawPushCount: integer('raw_push_count'),
  nonEventPushCount: integer('non_event_push_count'),
  nonEventPushes: text('non_event_pushes', { mode: 'json' }).$type<unknown[]>(),
  // True when the settle logic hit its hard ceiling instead of a natural quiet period —
  // pushes may still have been arriving, so late events could be missing.
  timedOut: integer('timed_out', { mode: 'boolean' }),
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
  projectId: text('project_id').references(() => projects.id),
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
  projectId: text('project_id').references(() => projects.id),
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

export type ProjectRow = typeof projects.$inferSelect;
export type ProjectHostnameRow = typeof projectHostnames.$inferSelect;
export type TemplateRow = typeof templates.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type ContentMapRow = typeof contentMaps.$inferSelect;
export type ContentMapRuleRow = typeof contentMapRules.$inferSelect;
export type ContentCheckRow = typeof contentChecks.$inferSelect;
export type ContentCheckResultRow = typeof contentCheckResults.$inferSelect;
