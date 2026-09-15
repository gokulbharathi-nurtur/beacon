// Shared types for capture + template + diff. Kept framework-free so lib/ has no Next.js imports.

export type LeafType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'undefined';
export type FieldClassification = 'exact' | 'structural';

/**
 * What triggers the events a template/run is about. `pageload` is the original behaviour —
 * capture whatever fires on navigation. `click` performs an ordered list of interaction
 * steps after the page loads and captures what those trigger. The enum is left open for
 * future kinds (scroll, fill, …) — adding one needs no migration.
 */
export type TemplateKind = 'pageload' | 'click';

/** One interaction the capture engine performs after the page has loaded. v1: click only. */
export interface InteractionStep {
  action: 'click';
  target: {
    /** `text` matches the control's visible label via a role/text locator; `css` is a raw selector. */
    by: 'text' | 'css';
    value: string;
  };
  /** Optional human note shown in the UI, e.g. "Open the viewing form". */
  label?: string;
}

/** Outcome of one InteractionStep during a capture — surfaced on the run, never fatal. */
export interface StepResult {
  index: number;
  target: InteractionStep['target'];
  label?: string;
  /**
   * Why a step didn't run, when it didn't. `target_disabled` and `click_blocked` are
   * split out from the generic `target_not_found` because they're the common real-world
   * cases and each points at a different fix: a disabled control usually means the step
   * order is wrong (a carousel's "previous" arrow is disabled until you've gone forward),
   * while a blocked click usually means an overlay — very often a consent banner that
   * only appeared once the page was first interacted with — is sitting on top of it.
   */
  status: 'ok' | 'target_not_found' | 'target_disabled' | 'click_blocked' | 'error';
  message?: string;
  /**
   * Epoch ms when this step's click was *initiated* (not when it resolved — a resolved
   * click and the exposeBinding delivery for the push it triggered race over separate
   * async channels, so "resolved" isn't a safe ordering boundary). Only set when status
   * is 'ok'. Every push from this moment until the next step's click starts is
   * attributed to this step.
   */
  firedAt?: number;
}

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
  /** Present only when interaction steps ran — one entry per step attempted, in order. */
  stepResults?: StepResult[];
  /**
   * Present only when interaction steps ran — parallel to `events`: `eventStepIndex[i]`
   * is the `StepResult.index` of the step that (most likely) triggered `events[i]`, or
   * `null` if it arrived before any step fired (i.e. during the initial page load).
   */
  eventStepIndex?: (number | null)[];
}

export interface TemplateFieldRule {
  /** Dot-path into the event object, e.g. "user.signed_in_status", "property_details.price". */
  path: string;
  classification: FieldClassification;
  /** Type captured at record time — basis for type-mismatch detection. */
  type: LeafType;
  /**
   * Optional — when set, the field may hold any of these types and `type` is only the
   * primary one (used for display). Recorded templates never set this: a single recording
   * observes one type per field. Catalog-derived rules do, because a field like
   * `click_url` is genuinely `string | undefined` depending on whether the caller passed
   * it, and collapsing that to one type would report a type mismatch on every legitimate
   * omission.
   */
  anyOfTypes?: LeafType[];
  /**
   * Optional — when true, the field's absence is not a `missing_field`; every other check
   * still applies when it *is* present. Recorded templates leave this unset (a field that
   * was there at record time is expected to be there again). Catalog-derived rules set it
   * for fields the package emits only sometimes, so those paths are still *known* — and
   * therefore not reported as `unexpected_field` — without being required.
   */
  optional?: boolean;
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
   * Only meaningful when classification === 'structural' — when true, the field is allowed
   * to be `undefined`. Defaults to false when absent. Use this when a field is sometimes
   * absent/undefined but sometimes present.
   */
  allowUndefined?: boolean;
  /**
   * Only meaningful when classification === 'structural' — when true, the field is allowed
   * to be `null`. Defaults to false when absent. Use this when a field is sometimes null
   * but sometimes has a real value.
   */
  allowNull?: boolean;
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
  /**
   * When true, a captured run that doesn't contain this event is not reported as a
   * `missing` event, and the shortfall doesn't count toward this name's count mismatch.
   * Every other check still applies when the event *is* present.
   */
  optional?: boolean;
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

/**
 * One row parsed from an uploaded content-map spreadsheet — the reference table mapping a
 * family of URLs to the `page.content_group`/`content_id`/`content_type` values the
 * `page_loaded` event should carry there. `null` on any expected* field means that cell was
 * blank in the sheet ("not specified" — not checked); the literal string `'undefined'`
 * means the cell said so verbatim, which is checked against a real JS `undefined` value
 * (see lib/capture/undefinedMarker.ts) rather than skipped.
 */
export interface ContentMapRuleData {
  rawPagesText: string;
  patterns: string[];
  contentGroup: string | null;
  contentId: string | null;
  contentType: string | null;
}

export type ContentCheckResultStatus = 'pass' | 'fail' | 'no_rule' | 'no_page_load_event';

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
