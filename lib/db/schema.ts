import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { TemplateEvent, RawEvent } from '@/lib/types';

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

export type TemplateRow = typeof templates.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
