import type { LeafType } from '@/lib/types';

/**
 * One field of one event, as observed across every harvested sample of that event.
 *
 * Deliberately records *evidence* rather than rules: `seenIn`/`sampleCount` and the raw
 * `sampleValues` let lib/catalog/toFieldRules.ts decide how strict to be, and let a human
 * judge how much a given entry is worth trusting. Turning evidence straight into
 * constraints at generation time would bake the package's test fixtures into the catalog —
 * a `click_text` that happens to be "Open" in the only test covering it is not an enum.
 */
export interface CatalogFieldSpec {
  /** Dot-path in the same form flattenToPaths produces, so rules drop straight into compareFields. */
  path: string;
  /** Every leaf type observed at this path. More than one means the field is genuinely polymorphic. */
  types: LeafType[];
  /** How many samples of the parent event contained this path. */
  seenIn: number;
  /**
   * Distinct primitive values observed, capped and sorted. Informational — the basis for a
   * human (or a name-pattern heuristic like classify.ts's) to promote a field to `oneOf`,
   * never an automatic constraint.
   */
  sampleValues?: Array<string | number | boolean | null>;
  /** True when sampleValues was truncated, so nobody reads a partial list as exhaustive. */
  sampleValuesTruncated?: boolean;
}

export interface CatalogEvent {
  eventName: string;
  /** Number of harvested pushes of this event. Low counts mean weak evidence about optionality. */
  sampleCount: number;
  /** True when the name is a fixed key in EVENT_NAMES; false for the caller-supplied
   * ("dynamic") names the package documents, which sites may legitimately vary. */
  fixedName: boolean;
  fields: CatalogFieldSpec[];
}

export interface EventCatalog {
  version: 1;
  packageName: string;
  packageVersion: string;
  events: CatalogEvent[];
  /**
   * EVENT_NAMES keys the harvest never saw pushed. These are real events the package can
   * emit that its own suite doesn't cover end-to-end, so beacon must not treat their
   * absence from the catalog as "not a real event" when auditing a site.
   */
  unsampledEventNames: string[];
}
