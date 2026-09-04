import type { CatalogEvent, EventCatalog } from './types';
import catalogJson from './event-catalog.json';

/**
 * The generated catalog, imported statically so it is bundled rather than read off disk —
 * this has to work inside a Next.js route handler, where the filesystem layout at runtime
 * is not the repo layout.
 *
 * The cast is unavoidable: TypeScript infers the JSON's literal shape (`types: string[]`),
 * which is structurally wider than `LeafType[]`. scripts/generate-catalog.ts is the only
 * writer and lib/catalog/load.test.ts pins the invariants that matter.
 */
const catalog = catalogJson as unknown as EventCatalog;

export function getCatalog(): EventCatalog {
  return catalog;
}

const eventsByName = new Map(catalog.events.map((event) => [event.eventName, event]));

/** The catalog entry for an event name, or undefined when the harvest never sampled it. */
export function findCatalogEvent(eventName: string): CatalogEvent | undefined {
  return eventsByName.get(eventName);
}

const knownNames = new Set([...eventsByName.keys(), ...catalog.unsampledEventNames]);

/**
 * Whether the package can legitimately emit this event name.
 *
 * Deliberately broader than `findCatalogEvent`: a name in EVENT_NAMES that the package's
 * suite never pushes end-to-end is still a real event, so auditing must not report it as
 * unknown just because there is no shape to check it against. Only names in neither set
 * are candidates for "this is a typo or has drifted from the spec".
 */
export function isKnownEventName(eventName: string): boolean {
  return knownNames.has(eventName);
}
