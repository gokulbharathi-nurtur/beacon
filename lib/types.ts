// Shared types for capture + template + diff. Kept framework-free so lib/ has no Next.js imports.

export type LeafType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
export type FieldClassification = 'exact' | 'structural';

/** A single push captured off window.dataLayer. Only pushes shaped like { event: string, ... } are events. */
export interface RawEvent {
  event: string;
  [key: string]: unknown;
}

export interface CaptureResult {
  url: string;
  startedAt: string;
  finishedAt: string;
  /** Every push captured, unfiltered — including non-event-shaped pushes like `{ search: null }`. */
  rawPushes: unknown[];
  /** Pushes shaped like { event: string, ... }, in push order. */
  events: RawEvent[];
  /** Count of pushes with no `event` string key (e.g. the null-clear pattern). */
  filteredPushCount: number;
  /** True if the hard ceiling fired instead of a natural quiet-period settle. */
  timedOut: boolean;
}

export interface TemplateFieldRule {
  /** Dot-path into the event object, e.g. "user.signed_in_status", "property_details.price". */
  path: string;
  classification: FieldClassification;
  /** Type captured at record time — basis for type-mismatch detection. */
  type: LeafType;
  /** Present only when classification === 'exact'. */
  exactValue?: string | number | boolean | null;
  /**
   * Only meaningful when classification === 'structural' and type is 'string' or
   * 'array' — some fields (e.g. page_referrer on direct navigation) are legitimately
   * empty, so the structural "non-empty" check must be skippable per field. Defaults to
   * false (must be non-empty) when absent.
   */
  allowEmpty?: boolean;
  /**
   * Only meaningful when type === 'array'. Optional — when set, the array must have
   * exactly this many items (e.g. a fixed "featured properties" carousel that always
   * shows 4); when absent (the default), the array is only checked for presence/type/
   * non-empty, since most lists (search results, etc.) legitimately vary in length.
   */
  expectedCount?: number;
  /**
   * Only meaningful when type === 'string'. Optional — when set, the value must contain
   * this substring (case-sensitive) rather than matching a fixed value exactly (e.g. a
   * click_url that should always point under "/properties/" even though the full URL
   * varies per listing); when absent (the default), no containment check runs.
   */
  containsText?: string;
  /**
   * Only meaningful when type === 'string'. Optional — when set, the value must match
   * this regex (tested via `new RegExp(pattern).test(value)`). More powerful than
   * `containsText` for shape checks (e.g. "The {name} Branch") — kept as a separate,
   * more advanced option since regex is easier to get subtly wrong than a plain substring.
   */
  matchesPattern?: string;
  /**
   * Only meaningful when type === 'string'. Optional — when set, the value must NOT
   * match this regex — e.g. catching a raw CRM branch code ("LSW,ROM") that leaked
   * through instead of the real branch name it should have been substituted with.
   */
  excludesPattern?: string;
  /**
   * Only meaningful when type === 'string'. Optional — when set, the value must exactly
   * equal one of these entries (e.g. `property_listing_type` should be "sales" or
   * "lettings", either is fine) — a generalization of `classification: 'exact'` from one
   * fixed value to a fixed set. Kept as a structural refinement rather than a third
   * classification: "any of a known set" is a shape constraint, same family as
   * containsText/matchesPattern, not a single pinned value.
   */
  oneOf?: string[];
  /**
   * Only meaningful when type === 'array'. Optional — when set, every item in the
   * captured array is checked against this shared rule set (same shape as a template
   * event's `fields`, one level deep — an item field that is itself an array does not
   * get its own itemFields), not just the array's own presence/type/count. One shared
   * rule set applies to every item (not per-position), since most lists are a series of
   * "the same kind of thing" (property cards, etc.) rather than fixed positional slots.
   */
  itemFields?: TemplateFieldRule[];
}

export interface TemplateEvent {
  /** Value of the event's `event` field, e.g. "property_click". */
  eventName: string;
  /** 0-based — which instance of this event name in the recording. */
  occurrenceIndex: number;
  fields: TemplateFieldRule[];
}

export interface TemplateDefinition {
  version: 1;
  events: TemplateEvent[];
}

export type FieldDiffKind =
  | 'missing_field'
  | 'type_mismatch'
  | 'value_mismatch'
  | 'structural_violation'
  | 'unexpected_field'
  | 'array_count_mismatch'
  | 'string_contains_mismatch'
  | 'pattern_mismatch'
  | 'value_not_in_set';

export interface FieldDiff {
  path: string;
  kind: FieldDiffKind;
  expectedType?: LeafType;
  actualType?: LeafType;
  expectedValue?: unknown;
  actualValue?: unknown;
  reason?: 'empty' | 'null' | 'pattern_not_matched' | 'pattern_excluded';
}

export interface EventMatchEntry {
  eventName: string;
  occurrenceIndex: number;
}

export interface EventMatchResult {
  matched: Array<EventMatchEntry & { templateEvent: TemplateEvent; capturedEvent: RawEvent }>;
  missing: Array<EventMatchEntry & { templateEvent: TemplateEvent }>;
  unexpected: Array<EventMatchEntry & { capturedEvent: RawEvent }>;
  countMismatches: Array<{ eventName: string; expectedCount: number; actualCount: number }>;
}

export interface DiffResult {
  summary: {
    missingCount: number;
    unexpectedCount: number;
    mismatchedCount: number;
    cleanCount: number;
    countMismatchCount: number;
  };
  missingEvents: EventMatchResult['missing'];
  unexpectedEvents: EventMatchResult['unexpected'];
  countMismatches: EventMatchResult['countMismatches'];
  matchedEvents: Array<{
    eventName: string;
    occurrenceIndex: number;
    fieldDiffs: FieldDiff[];
    status: 'clean' | 'mismatched';
    templateEvent: TemplateEvent;
    capturedEvent: RawEvent;
  }>;
}
