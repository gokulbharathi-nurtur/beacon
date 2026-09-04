import type { LeafType, TemplateFieldRule } from '@/lib/types';
import type { CatalogEvent } from './types';

/**
 * Below this many samples the catalog has no evidence about which fields are optional — a
 * field seen in the only sample there is tells us nothing — so everything becomes optional
 * and the audit reports shape problems without claiming anything is missing.
 */
const MIN_SAMPLES_FOR_REQUIRED = 2;

/**
 * Exhaustive by construction — `Record<LeafType, true>` fails to compile if LeafType grows
 * a member that isn't listed, so "no type constraint" can never silently become "every
 * type except the new one".
 */
const LEAF_TYPE_PRESENCE: Record<LeafType, true> = {
  string: true,
  number: true,
  boolean: true,
  object: true,
  array: true,
  null: true,
  undefined: true,
};
const ALL_LEAF_TYPES = Object.keys(LEAF_TYPE_PRESENCE) as LeafType[];

/**
 * Turns a catalog entry into rules the existing compareFields engine can run.
 *
 * The translation is deliberately permissive, because the catalog describes what the
 * package *can* emit rather than what a specific page did emit:
 *
 * - Never `exact`. Harvested values are the package's own test fixtures, so pinning them
 *   would fail on every real site.
 * - Always `allowEmpty`. An empty string is a content problem, not a schema violation, and
 *   the catalog cannot tell a legitimately-empty field from a broken one.
 * - Every catalog field gets a rule, including optional ones, so its path is *known* and
 *   does not come back as `unexpected_field`. Optionality is carried by the rule instead.
 * - A field only ever observed as `undefined` gets no type constraint at all. The package
 *   builds its payloads from object literals, so such a key is always *pushed* — but the
 *   tests simply never supplied a value for it. `property_details.price` is undefined in
 *   every harvested sample and a number on any real site; constraining it to `undefined`
 *   would fail every genuine property_click. Presence is still required, since the package
 *   really does always emit the key.
 */
export function catalogEventToFieldRules(
  event: CatalogEvent,
  options: { minSamplesForRequired?: number } = {}
): TemplateFieldRule[] {
  const minSamples = options.minSamplesForRequired ?? MIN_SAMPLES_FOR_REQUIRED;
  const haveOptionalityEvidence = event.sampleCount >= minSamples;

  return event.fields.map((field) => {
    const rule: TemplateFieldRule = {
      path: field.path,
      classification: 'structural',
      type: primaryType(field.types),
      allowEmpty: true,
    };

    if (isUndefinedOnly(field.types)) rule.anyOfTypes = ALL_LEAF_TYPES;
    else if (field.types.length > 1) rule.anyOfTypes = [...field.types];

    if (!haveOptionalityEvidence || field.seenIn < event.sampleCount) rule.optional = true;

    return rule;
  });
}

/** True when the harvest only ever saw this field as an explicit `undefined`, so it taught
 * us the key exists but nothing about the type its value takes on a real site. */
function isUndefinedOnly(types: LeafType[]): boolean {
  return types.length === 1 && types[0] === 'undefined';
}

/**
 * The type to show when a field is polymorphic. `undefined` and `null` are picked last:
 * for a `string | undefined` field, "string" is what a reader needs to see, and the full
 * set still travels on `anyOfTypes`.
 */
function primaryType(types: LeafType[]): LeafType {
  return types.find((type) => type !== 'undefined' && type !== 'null') ?? types[0];
}
