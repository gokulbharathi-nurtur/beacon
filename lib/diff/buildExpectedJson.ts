import type { TemplateEvent, TemplateFieldRule } from '@/lib/types';

/**
 * Reconstructs a nested "expected" object from a template event's flat dot-path field
 * rules, for the JSON compare view. Exact fields render their stored value; structural
 * fields render a readable type placeholder since there's no single canonical value to
 * show — consistent with the tool's exact-vs-structural philosophy (present/type/non-empty,
 * not a fixed value), so this never invents fake content.
 */
export function buildExpectedJson(templateEvent: TemplateEvent): Record<string, unknown> {
  return buildExpectedObject(templateEvent.fields);
}

function buildExpectedObject(fields: TemplateFieldRule[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = field.classification === 'exact' ? (field.exactValue ?? null) : placeholderFor(field);
    setDeep(result, field.path, value);
  }
  return result;
}

function placeholderFor(field: TemplateFieldRule): unknown {
  switch (field.type) {
    case 'string': {
      const clauses: string[] = [];
      if (field.containsText !== undefined) clauses.push(`contains "${field.containsText}"`);
      if (field.matchesPattern !== undefined) clauses.push(`matches /${field.matchesPattern}/`);
      if (field.excludesPattern !== undefined) clauses.push(`excludes /${field.excludesPattern}/`);
      if (field.oneOf !== undefined && field.oneOf.length > 0) clauses.push(`one of ${field.oneOf.map((v) => `"${v}"`).join(' | ')}`);
      return clauses.length > 0 ? `<string, ${clauses.join(', ')}>` : '<string>';
    }
    case 'number':
      return '<number>';
    case 'boolean':
      return '<boolean>';
    case 'array':
      // Item rules take precedence over the count-only placeholder — showing what one
      // item should look like is more informative than a bare count.
      if (field.itemFields && field.itemFields.length > 0) {
        return [buildExpectedObject(field.itemFields)];
      }
      return field.expectedCount !== undefined
        ? `<array, exactly ${field.expectedCount} item${field.expectedCount === 1 ? '' : 's'}>`
        : '<array, non-empty>';
    case 'null':
      return null;
    case 'object':
    default:
      return '<object>';
  }
}

function setDeep(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const existing = cur[key];
    if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}
