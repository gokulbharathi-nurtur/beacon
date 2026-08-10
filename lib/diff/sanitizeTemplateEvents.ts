import type { TemplateEvent, TemplateFieldRule } from '@/lib/types';

/**
 * Drops rule options left empty — e.g. a Rules-menu chip ("Contains text…", "Matches
 * pattern…", "One of…") added via the dropdown but never filled in before save. An empty
 * value there means "no rule", not "match the empty string"/"match nothing"; sending it
 * through as `''`/`[]` would fail the schema's non-empty validation
 * (containsText/matchesPattern/excludesPattern/oneOf are all `.min(1)`) with a confusing
 * error at save time instead of just being ignored.
 */
export function sanitizeTemplateEvents(events: TemplateEvent[]): TemplateEvent[] {
  return events.map((ev) => ({ ...ev, fields: sanitizeFieldRules(ev.fields) }));
}

function sanitizeFieldRules(fields: TemplateFieldRule[]): TemplateFieldRule[] {
  return fields.map((f) => {
    const clean: TemplateFieldRule = { ...f };
    if (clean.containsText === '') delete clean.containsText;
    if (clean.matchesPattern === '') delete clean.matchesPattern;
    if (clean.excludesPattern === '') delete clean.excludesPattern;
    if (clean.oneOf) {
      const filtered = clean.oneOf.map((v) => v.trim()).filter((v) => v !== '');
      if (filtered.length === 0) delete clean.oneOf;
      else clean.oneOf = filtered;
    }
    if (clean.itemFields) clean.itemFields = sanitizeFieldRules(clean.itemFields);
    return clean;
  });
}
