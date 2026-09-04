import type { AuditEventResult, AuditResult, FieldDiff, RawEvent } from '@/lib/types';
import { compareFieldsAgainstObject } from '@/lib/diff/compareFields';
import { flattenToPaths } from '@/lib/diff/flatten';
import { findCatalogEvent, getCatalog, isKnownEventName } from './load';
import { catalogEventToFieldRules } from './toFieldRules';

/**
 * Checks a capture against the canonical catalog instead of a recorded template.
 *
 * This is the check a recorded template structurally cannot perform: a template only knows
 * what one page did on one day, so a field that has always been wrong looks correct to it.
 * The catalog knows what the analytics package is capable of emitting, so a typo'd field
 * name or a drifted event name is visible on the first run, with nothing authored up front.
 *
 * Pure and synchronous, like computeDiff — cheap enough to recompute per request rather
 * than persist, which keeps results current as the catalog is regenerated.
 */
export function auditCapture(capturedEvents: RawEvent[]): AuditResult {
  const catalog = getCatalog();
  const events = capturedEvents.map((capturedEvent, index) => auditEvent(capturedEvent, index));

  return {
    packageName: catalog.packageName,
    packageVersion: catalog.packageVersion,
    summary: {
      total: events.length,
      clean: events.filter((e) => e.status === 'clean').length,
      violations: events.filter((e) => e.status === 'violations').length,
      unknownEvents: events.filter((e) => e.status === 'unknown_event').length,
      unchecked: events.filter((e) => e.status === 'unchecked').length,
    },
    events,
  };
}

function auditEvent(capturedEvent: RawEvent, index: number): AuditEventResult {
  const eventName = capturedEvent.event;
  const entry = findCatalogEvent(eventName);

  if (!entry) {
    return {
      index,
      eventName,
      // A name in EVENT_NAMES with no harvested sample is a real event we simply can't
      // check the shape of. Reporting it as unknown would be a false positive.
      status: isKnownEventName(eventName) ? 'unchecked' : 'unknown_event',
      fieldDiffs: [],
      capturedEvent,
    };
  }

  const rules = catalogEventToFieldRules(entry);
  const rawDiffs = compareFieldsAgainstObject(rules, capturedEvent, { checkUnexpected: true });
  const fieldDiffs = flagLikelyMisspellings(rawDiffs, rules.map((rule) => rule.path), capturedEvent);

  return {
    index,
    eventName,
    status: fieldDiffs.length === 0 ? 'clean' : 'violations',
    fieldDiffs,
    capturedEvent,
    sampleCount: entry.sampleCount,
  };
}

/** Shortest name worth spell-checking — below this, an edit distance of 2 is most of the word. */
const MIN_LENGTH_FOR_SUGGESTION = 5;
const MAX_EDIT_DISTANCE = 2;

/**
 * Upgrades `unexpected_field` to `misspelled_field` when the stray path is a near-miss for
 * a real one that the capture is *also* missing. That pairing is what makes it a typo
 * rather than an extra field: `average_rental_yeild` shipped in the legacy code for real,
 * and against a recorded template it looks like a perfectly ordinary value.
 */
function flagLikelyMisspellings(diffs: FieldDiff[], knownPaths: string[], capturedEvent: RawEvent): FieldDiff[] {
  const capturedPaths = new Set(flattenToPaths(capturedEvent).map((leaf) => leaf.path));
  const candidates = knownPaths.filter((path) => !capturedPaths.has(path));
  if (candidates.length === 0) return diffs;

  return diffs.map((diff) => {
    if (diff.kind !== 'unexpected_field') return diff;

    const suggestion = closestPath(diff.path, candidates);
    return suggestion ? { ...diff, kind: 'misspelled_field', expectedValue: suggestion } : diff;
  });
}

function closestPath(path: string, candidates: string[]): string | undefined {
  const parent = parentOf(path);
  const segment = leafOf(path);
  if (segment.length < MIN_LENGTH_FOR_SUGGESTION) return undefined;

  let best: { path: string; distance: number } | undefined;
  for (const candidate of candidates) {
    // Same parent only: a stray `user.emial` should be matched against the other `user.*`
    // fields, never against an unrelated `page.*` one that happens to look similar.
    if (parentOf(candidate) !== parent) continue;

    const candidateSegment = leafOf(candidate);
    if (candidateSegment.length < MIN_LENGTH_FOR_SUGGESTION) continue;

    const distance = editDistance(segment, candidateSegment);
    if (distance > 0 && distance <= MAX_EDIT_DISTANCE && (!best || distance < best.distance)) {
      best = { path: candidate, distance };
    }
  }
  return best?.path;
}

function parentOf(path: string): string {
  const index = path.lastIndexOf('.');
  return index === -1 ? '' : path.slice(0, index);
}

function leafOf(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1);
}

/** Plain Levenshtein distance, two rows rather than a full matrix — field names are short. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(substitution, previous[j] + 1, current[j - 1] + 1);
    }
    previous = current;
  }

  return previous[b.length];
}
