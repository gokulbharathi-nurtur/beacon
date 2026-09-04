import { z } from 'zod';
import type { TemplateFieldRule } from '@/lib/types';
import { EVENT_CATEGORY_VALUES } from '@/lib/eventCategories';

// A pattern only needs to fail fast at save time — the diff engine has its own runtime
// try/catch fallback (lib/diff/compareFields.ts's safeTest) as a defensive backstop.
const isValidRegex = (pattern: string) => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

// Self-referential (a rule can carry itemFields, an array of rules) — z.lazy() needs an
// explicit type annotation since TypeScript can't infer through the recursion itself.
export const fieldRuleSchema: z.ZodType<TemplateFieldRule> = z.lazy(() =>
  z.object({
    path: z.string().min(1),
    classification: z.enum(['exact', 'structural']),
    type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'null', 'undefined']),
    exactValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    allowEmpty: z.boolean().optional(),
    expectedCount: z.number().int().min(0).optional(),
    containsText: z.string().min(1).optional(),
    matchesPattern: z.string().min(1).refine(isValidRegex, 'Must be a valid regular expression').optional(),
    excludesPattern: z.string().min(1).refine(isValidRegex, 'Must be a valid regular expression').optional(),
    oneOf: z.array(z.string().min(1)).min(1).optional(),
    itemFields: z.array(fieldRuleSchema).optional(),
  })
);

export const templateEventSchema = z.object({
  eventName: z.string().min(1),
  occurrenceIndex: z.number().int().min(0),
  fields: z.array(fieldRuleSchema),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1),
  sourceUrl: z.string().min(1),
  category: z.enum(EVENT_CATEGORY_VALUES),
  clickSelector: z.string().min(1).optional(),
  clickLabel: z.string().min(1).optional(),
  clickHref: z.string().min(1).optional(),
  events: z.array(templateEventSchema),
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  events: z.array(templateEventSchema).optional(),
});

export const createRunSchema = z.object({
  url: z.string().min(1),
  templateId: z.string().optional(),
  mode: z.enum(['diff', 'record', 'audit']),
  clickSelector: z.string().min(1).optional(),
  // Record mode only — see the doc comment on runs.formSelector in lib/db/schema.ts for
  // why this never persists onto a template for automatic reuse.
  formSelector: z.string().min(1).optional(),
  // Defaults closed; see the doc comment on FormTarget.allowSubmit in
  // lib/capture/drivers/form.ts. The client must explicitly set this true, and only when
  // a human has already decided this specific submission is safe to send.
  formAllowSubmit: z.boolean().optional(),
});

export const discoverElementsSchema = z.object({
  url: z.string().min(1),
});

export const createSweepSchema = z.object({
  baseUrl: z.string().min(1),
});

export const createContentMapSchema = z.object({
  name: z.string().min(1),
});

export const createContentCheckSchema = z.object({
  contentMapId: z.string().min(1),
  baseUrl: z.string().min(1),
  mode: z.enum(['site', 'page']).default('site'),
});
