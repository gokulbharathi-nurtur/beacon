import type { ContentMapRuleRow } from '@/lib/db/schema';
import type { TemplateFieldRule } from '@/lib/types';
import { compilePagePattern, type CompiledContentRule } from './patternMatch';

/** Recompiles a stored content_map_rules row's pattern strings back into matchers.
 * compilePagePattern is a pure function of the pattern text alone, so this reproduces the
 * exact same regexes parseContentMap derived at upload time — nothing but strings need to
 * survive the DB round trip. */
export function compileContentRule(row: ContentMapRuleRow): CompiledContentRule {
  return {
    id: row.id,
    rowOrder: row.rowOrder,
    rawPagesText: row.rawPagesText,
    matchers: row.patterns.map((p) => compilePagePattern(p)).filter((m): m is NonNullable<typeof m> => m !== null),
    contentGroup: row.contentGroup,
    contentId: row.contentId,
    contentType: row.contentType,
  };
}

const FIELD_KEYS = [
  ['contentGroup', 'content_group'],
  ['contentId', 'content_id'],
  ['contentType', 'content_type'],
] as const;

/**
 * Builds the three-field rule set for one matched page, reusing compareFieldsAgainstObject
 * (lib/diff/compareFields.ts) unchanged rather than writing a second comparator — a blank
 * reference cell (null) means "not specified in the sheet," so that field is simply left
 * out of the rule set rather than compared. The literal string 'undefined' is checked
 * against a real `undefined` leaf (type: 'undefined', no exactValue) exactly the way a
 * recorded template already distinguishes "key present but its value is undefined" from
 * "key absent" — see lib/diff/flatten.ts and lib/capture/undefinedMarker.ts.
 */
export function buildFieldRules(rule: CompiledContentRule): TemplateFieldRule[] {
  const fields: TemplateFieldRule[] = [];
  for (const [prop, jsonKey] of FIELD_KEYS) {
    const value = rule[prop];
    if (value === null) continue;
    const path = `page.${jsonKey}`;
    fields.push(
      value === 'undefined'
        ? { path, classification: 'exact', type: 'undefined' }
        : { path, classification: 'exact', type: 'string', exactValue: value }
    );
  }
  return fields;
}
