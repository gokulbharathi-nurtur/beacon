import type { EventMatchResult, RawEvent, TemplateEvent } from '@/lib/types';

/**
 * Matches template events to captured events primarily by `event` name; multiple
 * instances of the same event name are paired by order (position). Count mismatches
 * (template expects 2 of an event, capture has 0 or 3) are recorded as their own
 * category, independent of and in addition to per-event field comparisons.
 */
export function matchEventsByNameAndPosition(
  templateEvents: TemplateEvent[],
  capturedEvents: RawEvent[]
): EventMatchResult {
  const templateByName = groupByName(templateEvents, (e) => e.eventName);
  const capturedByName = groupByName(capturedEvents, (e) => e.event);

  const allNames = new Set<string>([...templateByName.keys(), ...capturedByName.keys()]);

  const result: EventMatchResult = {
    matched: [],
    missing: [],
    unexpected: [],
    countMismatches: [],
  };

  for (const eventName of allNames) {
    const templateGroup = templateByName.get(eventName) ?? [];
    const capturedGroup = capturedByName.get(eventName) ?? [];

    // Optional template events may legitimately not fire, so the required count is the
    // number of non-optional ones; anything from there up to the full template count is
    // acceptable. Only a shortfall below required, or more than expected, is a mismatch.
    const requiredCount = templateGroup.filter((e) => !e.optional).length;
    if (capturedGroup.length < requiredCount || capturedGroup.length > templateGroup.length) {
      result.countMismatches.push({
        eventName,
        expectedCount: templateGroup.length,
        actualCount: capturedGroup.length,
      });
    }

    const pairedCount = Math.min(templateGroup.length, capturedGroup.length);
    for (let i = 0; i < pairedCount; i++) {
      result.matched.push({
        eventName,
        occurrenceIndex: i,
        templateEvent: templateGroup[i],
        capturedEvent: capturedGroup[i],
      });
    }
    for (let i = pairedCount; i < templateGroup.length; i++) {
      if (templateGroup[i].optional) continue;
      result.missing.push({ eventName, occurrenceIndex: i, templateEvent: templateGroup[i] });
    }
    for (let i = pairedCount; i < capturedGroup.length; i++) {
      result.unexpected.push({ eventName, occurrenceIndex: i, capturedEvent: capturedGroup[i] });
    }
  }

  return result;
}

function groupByName<T>(items: T[], nameOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const name = nameOf(item);
    const group = map.get(name);
    if (group) {
      group.push(item);
    } else {
      map.set(name, [item]);
    }
  }
  return map;
}
