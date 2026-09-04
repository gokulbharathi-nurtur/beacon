import { describe, expect, it } from 'vitest';
import type { RawEvent } from '@/lib/types';
import { UNDEFINED_MARKER } from '@/lib/capture/undefinedMarker';
import { auditCapture } from './auditCapture';
import { findCatalogEvent } from './load';

/**
 * A click_button push satisfying every rule the catalog derives for it. click_button is the
 * fixture of choice because it has three harvested samples, so the catalog has real
 * evidence about which of its fields are always present — most events have only one sample
 * and therefore no required fields to test against.
 */
function validClickButton(overrides: Record<string, unknown> = {}): RawEvent {
  const entry = findCatalogEvent('click_button')!;
  const push: Record<string, unknown> = { event: 'click_button' };
  for (const field of entry.fields) {
    if (field.path === 'event' || field.seenIn < entry.sampleCount) continue;
    push[field.path] = field.types.includes('string') ? 'something' : UNDEFINED_MARKER;
  }
  return { ...push, ...overrides } as RawEvent;
}

describe('auditCapture', () => {
  it('reports the spec version it judged against', () => {
    const result = auditCapture([]);
    expect(result.packageName).toBe('@starberry/advanced-analytics-nextjs');
    expect(result.summary.total).toBe(0);
  });

  it('passes an event that matches its catalog entry', () => {
    const result = auditCapture([validClickButton()]);
    expect(result.events[0].status).toBe('clean');
    expect(result.events[0].fieldDiffs).toEqual([]);
    expect(result.summary.clean).toBe(1);
  });

  it('flags an event name the package cannot emit', () => {
    const result = auditCapture([{ event: 'click_futer', click_text: 'Privacy' }]);
    expect(result.events[0].status).toBe('unknown_event');
    expect(result.summary.unknownEvents).toBe(1);
  });

  it('does not flag a real event name that simply has no harvested sample', () => {
    // These are in EVENT_NAMES but the package's suite never pushes them end-to-end, so
    // there is no shape to check — reporting them as unknown would be a false positive.
    const unsampled = 'my_move_email_property_alert_no';
    const result = auditCapture([{ event: unsampled }]);
    expect(result.events[0].status).toBe('unchecked');
    expect(result.events[0].fieldDiffs).toEqual([]);
  });

  it('catches a misspelled field and names the field it meant', () => {
    // The legacy code really did ship `average_rental_yeild`. A recorded template would
    // have baked the typo in as the expected shape and reported it clean forever.
    const withTypo = { event: 'property_click', property_details: { average_rental_yeild: '4.5%' } } as RawEvent;
    const result = auditCapture([withTypo]);

    const misspelled = result.events[0].fieldDiffs.find((d) => d.kind === 'misspelled_field');
    expect(misspelled).toBeDefined();
    expect(misspelled!.path).toBe('property_details.average_rental_yeild');
    expect(misspelled!.expectedValue).toBe('property_details.average_rental_yield');
  });

  it('leaves a genuinely unrelated extra field as unexpected, not a misspelling', () => {
    const result = auditCapture([validClickButton({ totally_unrelated_key: 'x' })]);
    const diff = result.events[0].fieldDiffs.find((d) => d.path === 'totally_unrelated_key');
    expect(diff!.kind).toBe('unexpected_field');
  });

  it('accepts either type of a polymorphic field without a type mismatch', () => {
    // click_sidebar_id is string | undefined on click_button, depending on whether the
    // caller passed one — both are legitimate and neither is a type mismatch.
    expect(
      findCatalogEvent('click_button')!.fields.find((f) => f.path === 'click_sidebar_id')!.types
    ).toEqual(['string', 'undefined']);

    const asString = auditCapture([validClickButton({ click_sidebar_id: 'property sidebar' })]);
    const asUndefined = auditCapture([validClickButton({ click_sidebar_id: UNDEFINED_MARKER })]);

    for (const result of [asString, asUndefined]) {
      expect(result.events[0].fieldDiffs.filter((d) => d.kind === 'type_mismatch')).toEqual([]);
    }
  });

  it('reports a real type mismatch', () => {
    const result = auditCapture([validClickButton({ click_text: 42 })]);
    const diff = result.events[0].fieldDiffs.find((d) => d.path === 'click_text');
    expect(diff!.kind).toBe('type_mismatch');
    expect(diff!.actualType).toBe('number');
  });

  it('does not require fields the catalog only sometimes sees', () => {
    // `click_section` appears in two of click_button's three samples, so its absence is not
    // a finding — but its path is still known, so supplying it is not "unexpected" either.
    const without = auditCapture([validClickButton()]);
    expect(without.events[0].fieldDiffs.filter((d) => d.path === 'click_section')).toEqual([]);

    const with_ = auditCapture([validClickButton({ click_section: 'hero' })]);
    expect(with_.events[0].fieldDiffs.filter((d) => d.path === 'click_section')).toEqual([]);
  });

  it('reports a field the catalog always carries as missing', () => {
    const result = auditCapture([{ event: 'click_button' } as RawEvent]);
    const missing = result.events[0].fieldDiffs.filter((d) => d.kind === 'missing_field');
    expect(missing.map((d) => d.path)).toContain('click_text');
  });

  it('claims nothing is required when the catalog has only one sample of an event', () => {
    // 39 of the 60 catalogued events were sampled once, which is no evidence at all about
    // which fields are optional. Inventing requirements from that would produce noise.
    const singleSample = findCatalogEvent('click_share_property')!;
    expect(singleSample.sampleCount).toBe(1);

    const result = auditCapture([{ event: 'click_share_property' } as RawEvent]);
    expect(result.events[0].fieldDiffs.filter((d) => d.kind === 'missing_field')).toEqual([]);
  });

  it('does not constrain the type of a field the package only ever sampled as undefined', () => {
    // property_details.price is undefined in every harvested sample purely because the
    // package's fixtures are sparse — on a real site it is a number. Constraining it to
    // `undefined` would fail every genuine property_click.
    const priceField = findCatalogEvent('property_click')!.fields.find(
      (f) => f.path === 'property_details.price'
    );
    expect(priceField!.types).toEqual(['undefined']);

    const result = auditCapture([
      { event: 'property_click', property_details: { price: 450000 } } as RawEvent,
    ]);
    const priceDiffs = result.events[0].fieldDiffs.filter((d) => d.path === 'property_details.price');
    expect(priceDiffs).toEqual([]);
  });

  it('carries the sample count so weak evidence is visible', () => {
    const result = auditCapture([validClickButton()]);
    expect(result.events[0].sampleCount).toBe(findCatalogEvent('click_button')!.sampleCount);
  });

  it('audits each event independently, keeping push order', () => {
    const result = auditCapture([
      { event: 'not_a_real_event' } as RawEvent,
      validClickButton(),
    ]);
    expect(result.events.map((e) => e.index)).toEqual([0, 1]);
    expect(result.events.map((e) => e.status)).toEqual(['unknown_event', 'clean']);
  });
});
