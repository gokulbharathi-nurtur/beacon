import type { FieldDiff, RawEvent, TemplateEvent, TemplateFieldRule } from '@/lib/types';
import { flattenToPaths, leavesToMap } from './flatten';

/**
 * Compares one matched (template, captured) event pair field-by-field, per the
 * template's per-path exact/structural rules. `missing_field` and `type_mismatch` are
 * always distinguishable from `value_mismatch`/`structural_violation` — a template
 * expecting a number where the capture has a string must not be silently treated as
 * "just a different value."
 */
export function compareEventFields(templateEvent: TemplateEvent, capturedEvent: RawEvent): FieldDiff[] {
  return compareFieldsAgainstObject(templateEvent.fields, capturedEvent, { checkUnexpected: true });
}

/**
 * The reusable core: compares a flat rule list against any object — a whole captured
 * event at the top level, or (recursively, one level deep) a single item inside an
 * array field that has `itemFields` set. Item-level callers rewrite the returned
 * `path`s to include the item's index (e.g. `property_list_details[2].property_type`)
 * before merging them into the parent diff list.
 *
 * `checkUnexpected` gates the "extra captured field with no rule" pass — on for the
 * top-level event (existing "nice-to-have" behavior), off for item-level checks: an
 * item's rules are deliberately a subset of its real fields (e.g. only `price` and
 * `property_listing_type` out of a dozen fields on a property card), so every other
 * real field would otherwise get wrongly flagged as "unexpected" on every run.
 */
export function compareFieldsAgainstObject(
  fields: TemplateFieldRule[],
  obj: unknown,
  options: { checkUnexpected?: boolean } = {}
): FieldDiff[] {
  const { checkUnexpected = false } = options;
  const capturedLeaves = leavesToMap(flattenToPaths(obj));
  const diffs: FieldDiff[] = [];
  const templatePaths = new Set(fields.map((f) => f.path));

  for (const rule of fields) {
    const leaf = capturedLeaves.get(rule.path);

    if (!leaf) {
      // An optional rule exists to mark the path as *known* (so it isn't reported as an
      // unexpected field), not to require it.
      if (rule.optional) continue;
      diffs.push({
        path: rule.path,
        kind: 'missing_field',
        expectedType: rule.type,
        expectedValue: rule.exactValue,
      });
      continue;
    }

    const allowedTypes = rule.anyOfTypes ?? [rule.type];
    // A structural 'undefined' rule that also carries a string-shape check (contains/
    // matches/excludes/one-of) or allowEmpty is opting in to "usually undefined, but
    // when it's actually a string, constrain it" — setting any of those is what turns
    // that acceptance on, so a plain undefined-typed rule with no such option keeps its
    // original strict "must stay undefined (or null, with allowNull)" meaning.
    const undefinedMayBeString =
      rule.type === 'undefined' &&
      (rule.allowEmpty ||
        rule.containsText !== undefined ||
        rule.matchesPattern !== undefined ||
        rule.excludesPattern !== undefined ||
        (rule.oneOf?.length ?? 0) > 0);
    // When a structural field is marked allowUndefined/allowNull, those types are also allowed
    if (rule.classification === 'structural') {
      if ((rule.allowUndefined ?? false) && leaf.type === 'undefined') {
        // undefined is allowed; continue to validation
      } else if ((rule.allowNull ?? false) && leaf.type === 'null') {
        // null is allowed; continue to validation
      } else if (undefinedMayBeString && leaf.type === 'string') {
        // a real string turned up where undefined was recorded, and this rule opted in
        // to allowing that — continue to the string-shape checks below
      } else if (!allowedTypes.includes(leaf.type)) {
        diffs.push({
          path: rule.path,
          kind: 'type_mismatch',
          expectedType: rule.type,
          actualType: leaf.type,
          expectedValue: rule.exactValue,
          actualValue: leaf.value,
        });
        continue;
      }
    } else if (!allowedTypes.includes(leaf.type)) {
      diffs.push({
        path: rule.path,
        kind: 'type_mismatch',
        expectedType: rule.type,
        actualType: leaf.type,
        expectedValue: rule.exactValue,
        actualValue: leaf.value,
      });
      continue;
    }

    if (rule.classification === 'exact') {
      if (leaf.value !== rule.exactValue) {
        diffs.push({
          path: rule.path,
          kind: 'value_mismatch',
          expectedValue: rule.exactValue,
          actualValue: leaf.value,
        });
      }
      continue;
    }

    // Array with an expected count fully constrains size (including emptiness), so it
    // replaces rather than adds to the generic non-empty check below.
    if (rule.type === 'array' && rule.expectedCount !== undefined) {
      const actualCount = Array.isArray(leaf.value) ? leaf.value.length : 0;
      if (actualCount !== rule.expectedCount) {
        diffs.push({
          path: rule.path,
          kind: 'array_count_mismatch',
          expectedValue: rule.expectedCount,
          actualValue: actualCount,
        });
      }
    }

    // Any targeted text-shape rule (contains / matches / excludes / one-of-a-set) is
    // strictly more informative than the generic non-empty check, so it replaces it —
    // same reasoning as the array/expectedCount case above. Rules are independent: a
    // field can have any combination, and each violated one produces its own diff.
    if (
      (rule.type === 'string' || (undefinedMayBeString && leaf.type === 'string')) &&
      (rule.containsText !== undefined ||
        rule.matchesPattern !== undefined ||
        rule.excludesPattern !== undefined ||
        (rule.oneOf !== undefined && rule.oneOf.length > 0))
    ) {
      const value = leaf.value;
      if (rule.containsText !== undefined && (typeof value !== 'string' || !value.includes(rule.containsText))) {
        diffs.push({
          path: rule.path,
          kind: 'string_contains_mismatch',
          expectedValue: rule.containsText,
          actualValue: value,
        });
      }
      if (rule.matchesPattern !== undefined && !(typeof value === 'string' && safeTest(rule.matchesPattern, value))) {
        diffs.push({
          path: rule.path,
          kind: 'pattern_mismatch',
          expectedValue: `/${rule.matchesPattern}/`,
          actualValue: value,
          reason: 'pattern_not_matched',
        });
      }
      if (rule.excludesPattern !== undefined && typeof value === 'string' && safeTest(rule.excludesPattern, value)) {
        diffs.push({
          path: rule.path,
          kind: 'pattern_mismatch',
          expectedValue: `not /${rule.excludesPattern}/`,
          actualValue: value,
          reason: 'pattern_excluded',
        });
      }
      if (rule.oneOf !== undefined && rule.oneOf.length > 0 && !(typeof value === 'string' && rule.oneOf.includes(value))) {
        diffs.push({
          path: rule.path,
          kind: 'value_not_in_set',
          expectedValue: rule.oneOf,
          actualValue: value,
        });
      }
      continue;
    }

    // Per-item field rules: check every item in the array against the same shared rule
    // set, independent of whether expectedCount also matches — these are orthogonal
    // findings. Runs against whatever items are actually present.
    if (rule.type === 'array' && rule.itemFields && rule.itemFields.length > 0) {
      const items = Array.isArray(leaf.value) ? leaf.value : [];
      items.forEach((item, index) => {
        for (const itemDiff of compareFieldsAgainstObject(rule.itemFields!, item)) {
          diffs.push({ ...itemDiff, path: `${rule.path}[${index}].${itemDiff.path}` });
        }
      });
    }

    if (rule.type === 'array' && rule.expectedCount !== undefined) {
      continue;
    }

    // Structural: present + correct type (already confirmed) + non-empty, unless the
    // field is marked allowEmpty (e.g. page_referrer, legitimately "" on direct nav).
    const violation = checkStructuralValidity(leaf.value, leaf.type, rule.allowEmpty ?? false);
    if (violation) {
      diffs.push({
        path: rule.path,
        kind: 'structural_violation',
        actualType: leaf.type,
        actualValue: leaf.value,
        reason: violation,
      });
    }
  }

  // Optional nice-to-have: surface captured fields the template has no rule for at all.
  // Item-level checks skip this — an item's rules are deliberately a subset of its fields.
  if (checkUnexpected) {
    for (const leaf of capturedLeaves.values()) {
      if (!templatePaths.has(leaf.path)) {
        diffs.push({
          path: leaf.path,
          kind: 'unexpected_field',
          actualType: leaf.type,
          actualValue: leaf.value,
        });
      }
    }
  }

  return diffs;
}

/**
 * Defensive runtime guard — the real protection against a malformed pattern is save-time
 * validation (lib/validation.ts's isValidRegex refine), so this should be unreachable in
 * practice. An invalid pattern here fails the check rather than throwing mid-diff.
 */
function safeTest(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

function checkStructuralValidity(
  value: unknown,
  type: FieldDiff['actualType'],
  allowEmpty: boolean
): 'empty' | 'null' | undefined {
  switch (type) {
    case 'string':
      return !allowEmpty && value === '' ? 'empty' : undefined;
    case 'array':
      return !allowEmpty && Array.isArray(value) && value.length === 0 ? 'empty' : undefined;
    case 'number':
      return typeof value === 'number' && Number.isNaN(value) ? 'empty' : undefined;
    case 'null':
      // Reaching here means the rule's type is also 'null' (type match already checked
      // upstream) — i.e. the template explicitly recorded this field as null-valued, so
      // seeing null again is expected, not a violation.
      return undefined;
    case 'boolean':
    case 'object':
    default:
      return undefined;
  }
}
