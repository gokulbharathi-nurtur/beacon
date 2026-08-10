import type { RawEvent, TemplateDefinition, TemplateEvent, TemplateFieldRule } from '@/lib/types';
import { flattenToPaths } from './flatten';
import { inferDefaultClassification, inferAllowEmpty } from './classify';

/**
 * Turns a fresh capture into a starting TemplateDefinition using the default
 * exact/structural heuristic. This is what the record flow shows the user before they
 * confirm/override individual fields and save.
 */
export function buildTemplateFromCapture(events: RawEvent[]): TemplateDefinition {
  const occurrenceCounters = new Map<string, number>();

  const templateEvents: TemplateEvent[] = events.map((event) => {
    const occurrenceIndex = occurrenceCounters.get(event.event) ?? 0;
    occurrenceCounters.set(event.event, occurrenceIndex + 1);

    const fields: TemplateFieldRule[] = flattenToPaths(event).map((leaf) => {
      const inferred = inferDefaultClassification(leaf.path, leaf.value, leaf.type);
      const rule: TemplateFieldRule = { path: leaf.path, classification: inferred.classification, type: leaf.type };
      if (inferred.classification === 'exact') {
        rule.exactValue = inferred.exactValue as string | number | boolean | null;
      } else {
        rule.allowEmpty = inferAllowEmpty(leaf.path, leaf.type);
      }
      return rule;
    });

    return { eventName: event.event, occurrenceIndex, fields };
  });

  return { version: 1, events: templateEvents };
}
