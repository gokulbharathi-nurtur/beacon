import { describe, it, expect } from 'vitest';
import { matchEventsByNameAndPosition } from './matchEvents';
import type { RawEvent, TemplateEvent } from '@/lib/types';

function templateEvent(eventName: string, occurrenceIndex: number): TemplateEvent {
  return { eventName, occurrenceIndex, fields: [] };
}
function capturedEvent(event: string, extra: Record<string, unknown> = {}): RawEvent {
  return { event, ...extra };
}

describe('matchEventsByNameAndPosition', () => {
  it('pairs a single matching event by name with no mismatches', () => {
    const result = matchEventsByNameAndPosition([templateEvent('page_loaded', 0)], [capturedEvent('page_loaded')]);
    expect(result.matched).toHaveLength(1);
    expect(result.missing).toHaveLength(0);
    expect(result.unexpected).toHaveLength(0);
    expect(result.countMismatches).toHaveLength(0);
  });

  it('flags an event in the template but absent from the capture as missing', () => {
    const result = matchEventsByNameAndPosition([templateEvent('page_loaded', 0)], []);
    expect(result.missing).toEqual([
      { eventName: 'page_loaded', occurrenceIndex: 0, templateEvent: templateEvent('page_loaded', 0) },
    ]);
    expect(result.countMismatches).toEqual([{ eventName: 'page_loaded', expectedCount: 1, actualCount: 0 }]);
  });

  it('flags an event in the capture but absent from the template as unexpected', () => {
    const result = matchEventsByNameAndPosition([], [capturedEvent('click_button')]);
    expect(result.unexpected).toHaveLength(1);
    expect(result.unexpected[0].eventName).toBe('click_button');
    expect(result.countMismatches).toEqual([{ eventName: 'click_button', expectedCount: 0, actualCount: 1 }]);
  });

  it('pairs multiple instances of the same event name by position', () => {
    const template = [templateEvent('property_click', 0), templateEvent('property_click', 1)];
    const captured = [
      capturedEvent('property_click', { click_text: 'First' }),
      capturedEvent('property_click', { click_text: 'Second' }),
    ];
    const result = matchEventsByNameAndPosition(template, captured);
    expect(result.matched).toHaveLength(2);
    expect(result.matched[0].capturedEvent.click_text).toBe('First');
    expect(result.matched[1].capturedEvent.click_text).toBe('Second');
    expect(result.countMismatches).toHaveLength(0);
  });

  it('records a count mismatch (not a field mismatch) when capture has extra occurrences', () => {
    const template = [templateEvent('property_click', 0), templateEvent('property_click', 1)];
    const captured = [capturedEvent('property_click'), capturedEvent('property_click'), capturedEvent('property_click')];
    const result = matchEventsByNameAndPosition(template, captured);
    expect(result.matched).toHaveLength(2);
    expect(result.unexpected).toEqual([
      expect.objectContaining({ eventName: 'property_click', occurrenceIndex: 2 }),
    ]);
    expect(result.countMismatches).toEqual([{ eventName: 'property_click', expectedCount: 2, actualCount: 3 }]);
  });

  it('records a count mismatch when capture has fewer occurrences than expected', () => {
    const template = [templateEvent('property_click', 0), templateEvent('property_click', 1)];
    const captured = [capturedEvent('property_click')];
    const result = matchEventsByNameAndPosition(template, captured);
    expect(result.matched).toHaveLength(1);
    expect(result.missing).toEqual([
      expect.objectContaining({ eventName: 'property_click', occurrenceIndex: 1 }),
    ]);
    expect(result.countMismatches).toEqual([{ eventName: 'property_click', expectedCount: 2, actualCount: 1 }]);
  });
});
