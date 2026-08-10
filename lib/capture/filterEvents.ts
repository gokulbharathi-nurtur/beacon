import type { RawEvent } from '@/lib/types';

/** True for pushes shaped like `{ event: string, ... }`. Excludes non-event pushes like `{ search: null }`. */
export function isEventShaped(push: unknown): push is RawEvent {
  return typeof push === 'object' && push !== null && typeof (push as { event?: unknown }).event === 'string';
}

export function partitionPushes(rawPushes: unknown[]): { events: RawEvent[]; nonEvents: unknown[] } {
  const events: RawEvent[] = [];
  const nonEvents: unknown[] = [];
  for (const push of rawPushes) {
    if (isEventShaped(push)) {
      events.push(push);
    } else {
      nonEvents.push(push);
    }
  }
  return { events, nonEvents };
}
