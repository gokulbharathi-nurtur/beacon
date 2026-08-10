import type { FieldClassification, LeafType } from '@/lib/types';

/**
 * Pre-fills the exact/structural checkbox during the record flow — a human confirms or
 * overrides it before saving, so this only needs to be a good starting point, not perfect.
 *
 * Rule order (first match wins), grounded in a real reference implementation of this
 * team's dataLayer contract:
 *   1. Name patterns that mean "real content" (id/url/text/price/position/...) → structural.
 *      Checked first so id-like fields (e.g. `content_id`) can't get swept up by the
 *      broader enum-ish name patterns in rule 2 (e.g. a generic `_type`/`_status` check).
 *   2. Name patterns that mean "known enum/constant" (event, *_status, *_type, currency...) → exact.
 *   3. Type fallback when no name pattern matches.
 */
export function inferDefaultClassification(
  path: string,
  value: unknown,
  type: LeafType
): { classification: FieldClassification; exactValue?: unknown } {
  const key = lastSegment(path);

  if (matchesStructuralName(key)) {
    return { classification: 'structural' };
  }
  if (matchesExactName(key)) {
    return { classification: 'exact', exactValue: value as string | number | boolean | null };
  }

  switch (type) {
    case 'boolean':
      // Inherently a 2-value enum.
      return { classification: 'exact', exactValue: value as boolean };
    case 'number':
    case 'string':
    case 'array':
    case 'null':
      // Safer default: prices/positions/counts/timestamps/free text all vary run-to-run.
      // Enum-like strings are expected to be caught by name patterns above, not guessed
      // from value shape.
      return { classification: 'structural' };
    case 'object':
    default:
      // flatten() never emits a leaf for a plain object — only its leaves are classified.
      return { classification: 'structural' };
  }
}

/**
 * Default for the "allow empty" toggle on structural string/array fields. Only a couple
 * of field shapes are legitimately empty in normal traffic — e.g. `document.referrer` is
 * `""` on direct navigation (typed URL, bookmark, stripped referrer policy), not a sign
 * tracking broke. Everything else defaults to "must be non-empty" (false).
 */
export function inferAllowEmpty(path: string, type: LeafType): boolean {
  if (type !== 'string' && type !== 'array') return false;
  const key = lastSegment(path);
  return key === 'referrer' || key.endsWith('_referrer');
}

function lastSegment(path: string): string {
  const idx = path.lastIndexOf('.');
  return idx === -1 ? path : path.slice(idx + 1);
}

function matchesStructuralName(key: string): boolean {
  return (
    key === 'id' ||
    key.endsWith('_id') ||
    key === 'url' ||
    key.endsWith('_url') ||
    key.endsWith('_text') ||
    key.endsWith('_term') ||
    key.endsWith('name') ||
    key === 'price' ||
    key.endsWith('_price') ||
    key === 'postcode' ||
    key === 'position' ||
    key === 'index' ||
    key.endsWith('_date') ||
    key === 'referrer' ||
    key.endsWith('_referrer') ||
    key.endsWith('_results') ||
    key === 'bedrooms' ||
    key === 'bathrooms' ||
    key === 'reception_rooms' ||
    key.endsWith('_yield')
  );
}

function matchesExactName(key: string): boolean {
  return (
    key === 'event' ||
    key.endsWith('_status') ||
    key.endsWith('_action') ||
    key.endsWith('_event') ||
    key.includes('validation') ||
    key.endsWith('_type') ||
    key === 'currency' ||
    key === 'format'
  );
}
