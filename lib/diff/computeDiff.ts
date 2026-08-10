import type { DiffResult, RawEvent, TemplateDefinition } from '@/lib/types';
import { matchEventsByNameAndPosition } from './matchEvents';
import { compareEventFields } from './compareFields';

/** Pure, synchronous — cheap enough to recompute on every read rather than persist. */
export function computeDiff(capturedEvents: RawEvent[], template: TemplateDefinition): DiffResult {
  const matchResult = matchEventsByNameAndPosition(template.events, capturedEvents);

  const matchedEvents = matchResult.matched.map((m) => {
    const fieldDiffs = compareEventFields(m.templateEvent, m.capturedEvent);
    return {
      eventName: m.eventName,
      occurrenceIndex: m.occurrenceIndex,
      fieldDiffs,
      status: (fieldDiffs.length === 0 ? 'clean' : 'mismatched') as 'clean' | 'mismatched',
      templateEvent: m.templateEvent,
      capturedEvent: m.capturedEvent,
    };
  });

  const mismatchedCount = matchedEvents.filter((e) => e.status === 'mismatched').length;
  const cleanCount = matchedEvents.filter((e) => e.status === 'clean').length;

  return {
    summary: {
      missingCount: matchResult.missing.length,
      unexpectedCount: matchResult.unexpected.length,
      mismatchedCount,
      cleanCount,
      countMismatchCount: matchResult.countMismatches.length,
    },
    missingEvents: matchResult.missing,
    unexpectedEvents: matchResult.unexpected,
    countMismatches: matchResult.countMismatches,
    matchedEvents,
  };
}
