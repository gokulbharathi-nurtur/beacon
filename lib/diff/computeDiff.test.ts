import { describe, it, expect } from 'vitest';
import { computeDiff } from './computeDiff';
import { buildTemplateFromCapture } from './buildTemplateFromCapture';
import type { RawEvent, TemplateDefinition } from '@/lib/types';

const goldenCapture: RawEvent[] = [
  {
    event: 'page_loaded',
    page: { content_group: 'Home page', currency: 'GBP' },
    user: { signed_in_status: 'signed out', internal_traffic: false },
  },
  { event: 'property_click', click_text: 'Nice Street', property_details: { price: 250000, property_listing_type: 'sales' } },
  { event: 'property_click', click_text: 'Other Road', property_details: { price: 310000, property_listing_type: 'sales' } },
  { event: 'view_property_list', property_list_name: 'search results', property_list_details: [{ id: 1 }, { id: 2 }] },
];

function template(): TemplateDefinition {
  return buildTemplateFromCapture(goldenCapture);
}

describe('computeDiff', () => {
  it('recording then diffing the exact same capture comes back fully clean', () => {
    const result = computeDiff(goldenCapture, template());
    expect(result.summary).toEqual({
      missingCount: 0,
      unexpectedCount: 0,
      mismatchedCount: 0,
      cleanCount: 4,
      countMismatchCount: 0,
    });
  });

  it('a later run with legitimately different content (price, click text) still comes back clean', () => {
    const laterCapture: RawEvent[] = [
      {
        event: 'page_loaded',
        page: { content_group: 'Home page', currency: 'GBP' },
        user: { signed_in_status: 'signed out', internal_traffic: false },
      },
      { event: 'property_click', click_text: 'A Totally Different Street', property_details: { price: 999000, property_listing_type: 'sales' } },
      { event: 'property_click', click_text: 'Yet Another Road', property_details: { price: 120000, property_listing_type: 'sales' } },
      { event: 'view_property_list', property_list_name: 'search results', property_list_details: [{ id: 9 }] },
    ];
    const result = computeDiff(laterCapture, template());
    expect(result.summary.missingCount).toBe(0);
    expect(result.summary.unexpectedCount).toBe(0);
    expect(result.summary.countMismatchCount).toBe(0);
    expect(result.summary.mismatchedCount).toBe(0);
  });

  it('flags a missing event when the capture drops one entirely', () => {
    const capture = goldenCapture.filter((e) => e.event !== 'view_property_list');
    const result = computeDiff(capture, template());
    expect(result.summary.missingCount).toBe(1);
    expect(result.missingEvents[0].eventName).toBe('view_property_list');
  });

  it('flags an unexpected event not present in the template', () => {
    const capture = [...goldenCapture, { event: 'click_map_pin', click_text: 'Pin 1' }];
    const result = computeDiff(capture, template());
    expect(result.summary.unexpectedCount).toBe(1);
    expect(result.unexpectedEvents[0].eventName).toBe('click_map_pin');
  });

  it('flags a count mismatch separately from field mismatches when occurrence counts differ', () => {
    const capture = [...goldenCapture, { event: 'property_click', click_text: 'Third Street', property_details: { price: 400000, property_listing_type: 'sales' } }];
    const result = computeDiff(capture, template());
    expect(result.summary.countMismatchCount).toBe(1);
    expect(result.countMismatches).toEqual([{ eventName: 'property_click', expectedCount: 2, actualCount: 3 }]);
    // the first two property_click occurrences still pair up and compare cleanly
    expect(result.summary.mismatchedCount).toBe(0);
  });

  it('flags a value mismatch when an exact-classified enum field changes (regression the tool exists to catch)', () => {
    const brokenCapture = goldenCapture.map((e) =>
      e.event === 'page_loaded' ? { ...e, user: { signed_in_status: 'broken', internal_traffic: false } } : e
    );
    const result = computeDiff(brokenCapture, template());
    expect(result.summary.mismatchedCount).toBe(1);
    const pageLoaded = result.matchedEvents.find((m) => m.eventName === 'page_loaded')!;
    expect(pageLoaded.fieldDiffs).toEqual([
      { path: 'user.signed_in_status', kind: 'value_mismatch', expectedValue: 'signed out', actualValue: 'broken' },
    ]);
  });
});
