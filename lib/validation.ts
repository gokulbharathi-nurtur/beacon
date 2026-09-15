import { z } from 'zod';
import type { TemplateFieldRule } from '@/lib/types';

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
    allowUndefined: z.boolean().optional(),
    allowNull: z.boolean().optional(),
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
  optional: z.boolean().optional(),
  fields: z.array(fieldRuleSchema),
});

// One interaction the capture performs after load. v1: click only.
export const interactionStepSchema = z.object({
  action: z.literal('click'),
  target: z.object({
    by: z.enum(['text', 'css']),
    value: z.string().min(1),
  }),
  label: z.string().max(120).optional(),
});

/**
 * Shared rule for the (kind, steps) pair on templates and runs: a 'click' needs at least
 * one step; a 'pageload' must not carry steps. Applied via superRefine so the error points
 * at `steps`.
 */
function refineKindSteps(
  data: { kind?: 'pageload' | 'click'; steps?: unknown[] | null },
  ctx: z.RefinementCtx
) {
  const kind = data.kind ?? 'pageload';
  const stepCount = data.steps?.length ?? 0;
  if (kind === 'click' && stepCount === 0) {
    ctx.addIssue({ code: 'custom', path: ['steps'], message: 'A click template needs at least one step.' });
  }
  if (kind === 'pageload' && stepCount > 0) {
    ctx.addIssue({ code: 'custom', path: ['steps'], message: 'A page-load template cannot have steps.' });
  }
}

// A hostname as stored in project_hostnames: lowercased, trimmed, and stripped of any
// scheme/path/port the user may have pasted in (so "https://www.foo.com/x" -> "www.foo.com").
const hostnameField = z
  .string()
  .min(1)
  .transform((raw) => {
    const trimmed = raw.trim().toLowerCase();
    try {
      return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname;
    } catch {
      return trimmed;
    }
  })
  .pipe(z.string().min(1));

export const createProjectSchema = z.object({
  name: z.string().min(1),
  hostnames: z.array(hostnameField).min(1),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  hostnames: z.array(hostnameField).min(1).optional(),
});

export const createTemplateSchema = z
  .object({
    // Omitted -> the server assigns the project by matching sourceUrl's hostname.
    // Explicit null -> deliberately unassigned. A string -> that project.
    projectId: z.string().min(1).nullable().optional(),
    name: z.string().min(1),
    sourceUrl: z.string().min(1),
    kind: z.enum(['pageload', 'click']).default('pageload'),
    steps: z.array(interactionStepSchema).optional(),
    events: z.array(templateEventSchema),
  })
  .superRefine(refineKindSteps);

export const updateTemplateSchema = z
  .object({
    name: z.string().min(1).optional(),
    projectId: z.string().min(1).nullable().optional(),
    kind: z.enum(['pageload', 'click']).optional(),
    steps: z.array(interactionStepSchema).optional(),
    events: z.array(templateEventSchema).optional(),
  })
  .superRefine((data, ctx) => {
    // Only validate the pair when this PATCH actually touches kind or steps.
    if (data.kind === undefined && data.steps === undefined) return;
    refineKindSteps(data, ctx);
  });

export const createRunSchema = z
  .object({
    // Required for 'diff' (the run lives under a project and rerun needs it); optional for
    // 'record', where the captured template carries the project instead.
    projectId: z.string().min(1).nullable().optional(),
    url: z.string().min(1),
    // A diff run compares against 1-2 templates. `templateId` is the legacy single-template
    // form still sent by the template editor's "Run against source URL" and by rerun of old
    // runs; `templateIds` is the current form from the run dashboard.
    templateId: z.string().optional(),
    templateIds: z.array(z.string().min(1)).min(1).max(2).optional(),
    mode: z.enum(['diff', 'record']),
    // Only honoured for 'record' runs (the record form sends what it's about to capture).
    // For 'diff' the server derives both from the primary template and ignores these.
    kind: z.enum(['pageload', 'click']).optional(),
    steps: z.array(interactionStepSchema).optional(),
    // Optional label; when blank the server derives one from the URL path.
    name: z.string().max(120).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === 'record') refineKindSteps(data, ctx);
  });

export const updateRunSchema = z.object({
  name: z.string().min(1).max(120),
});

export const createContentMapSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
});

export const createContentCheckSchema = z.object({
  projectId: z.string().min(1),
  contentMapId: z.string().min(1),
  baseUrl: z.string().min(1),
  mode: z.enum(['site', 'page']).default('site'),
});
