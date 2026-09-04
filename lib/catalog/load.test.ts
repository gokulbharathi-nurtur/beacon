import { describe, expect, it } from 'vitest';
import { UNDEFINED_MARKER } from '@/lib/capture/undefinedMarker';
import { findCatalogEvent, getCatalog, isKnownEventName } from './load';

describe('event catalog', () => {
  it('is a v1 catalog generated from the analytics package', () => {
    const catalog = getCatalog();
    expect(catalog.version).toBe(1);
    expect(catalog.packageName).toBe('@starberry/advanced-analytics-nextjs');
    expect(catalog.packageVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(catalog.events.length).toBeGreaterThan(50);
  });

  it('describes each event with dot-paths in flattenToPaths form', () => {
    const clickFooter = findCatalogEvent('click_footer');
    expect(clickFooter).toBeDefined();
    expect(clickFooter!.fields.map((f) => f.path)).toEqual(
      expect.arrayContaining(['event', 'click_text', 'click_url', 'navigation_header'])
    );

    // Nested objects flatten to dotted paths rather than nesting, which is what lets a
    // catalog entry be handed straight to compareFields.
    const pageLoaded = findCatalogEvent('page_loaded');
    expect(pageLoaded!.fields.map((f) => f.path)).toEqual(
      expect.arrayContaining(['page.content_group', 'user.signed_in_status'])
    );
  });

  it('records explicit-undefined fields as the undefined type, never as the marker string', () => {
    // Regression guard: the marker is wrapped in NUL bytes that render as ordinary spaces,
    // so a hand-copied literal in the harvest hook looks correct while silently failing to
    // match — which typed every `sidebar_open: undefined` field as a string.
    const serialized = JSON.stringify(getCatalog());
    expect(serialized).not.toContain(UNDEFINED_MARKER);
    expect(serialized).not.toContain('datalayerQaUndefined');

    const sidebarOpen = findCatalogEvent('click_footer')!.fields.find((f) => f.path === 'sidebar_open');
    expect(sidebarOpen!.types).toContain('undefined');
    expect(sidebarOpen!.sampleValues).toBeUndefined();
  });

  it('excludes the transport layer\'s synthetic fixture events', () => {
    // `test_event` exists only to prove trackToDataLayer works; no site should emit it.
    expect(findCatalogEvent('test_event')).toBeUndefined();
    expect(isKnownEventName('test_event')).toBe(false);
  });

  it('keeps caller-supplied event names, flagged as not fixed', () => {
    const dynamic = findCatalogEvent('arrange_a_viewing');
    expect(dynamic).toBeDefined();
    expect(dynamic!.fixedName).toBe(false);
    expect(findCatalogEvent('page_loaded')!.fixedName).toBe(true);
  });

  it('treats EVENT_NAMES keys with no harvested sample as known', () => {
    const { unsampledEventNames } = getCatalog();
    for (const name of unsampledEventNames) {
      expect(findCatalogEvent(name)).toBeUndefined();
      // Real events the package's own suite happens not to exercise end-to-end. Reporting
      // these as unknown during an audit would be a false positive.
      expect(isKnownEventName(name)).toBe(true);
    }
    expect(isKnownEventName('definitely_not_an_event')).toBe(false);
  });

  it('is stored in sorted order, which is what makes regeneration a clean diff', () => {
    const { events } = getCatalog();
    expect(events.map((e) => e.eventName)).toEqual([...events.map((e) => e.eventName)].sort());
    for (const event of events) {
      expect(event.fields.map((f) => f.path)).toEqual([...event.fields.map((f) => f.path)].sort());
    }
  });
});
