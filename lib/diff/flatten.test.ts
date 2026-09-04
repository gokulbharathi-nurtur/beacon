import { describe, it, expect } from 'vitest';
import { flattenToPaths } from './flatten';
import { UNDEFINED_MARKER } from '@/lib/capture/undefinedMarker';

describe('flattenToPaths', () => {
  it('flattens nested objects into dot-paths', () => {
    const leaves = flattenToPaths({
      event: 'page_loaded',
      page: { content_group: 'Home page', currency: 'GBP' },
      user: { signed_in_status: 'signed out' },
    });

    expect(leaves).toEqual(
      expect.arrayContaining([
        { path: 'event', value: 'page_loaded', type: 'string' },
        { path: 'page.content_group', value: 'Home page', type: 'string' },
        { path: 'page.currency', value: 'GBP', type: 'string' },
        { path: 'user.signed_in_status', value: 'signed out', type: 'string' },
      ])
    );
    expect(leaves).toHaveLength(4);
  });

  it('treats arrays as a single leaf, not recursed', () => {
    const leaves = flattenToPaths({
      property_list_details: [
        { property_id: 'P1', price: 1 },
        { property_id: 'P2', price: 2 },
      ],
    });
    expect(leaves).toEqual([
      { path: 'property_list_details', value: expect.any(Array), type: 'array' },
    ]);
  });

  it('treats null as its own leaf type, distinct from object', () => {
    const leaves = flattenToPaths({ search: null });
    expect(leaves).toEqual([{ path: 'search', value: null, type: 'null' }]);
  });

  it('keeps an explicit undefined value as its own leaf, distinct from a missing key', () => {
    const withUndefined = flattenToPaths({ sidebar_open: undefined, click_text: 'Home' });
    const withoutKey = flattenToPaths({ click_text: 'Home' });
    expect(withUndefined).toEqual(
      expect.arrayContaining([
        { path: 'sidebar_open', value: undefined, type: 'undefined' },
        { path: 'click_text', value: 'Home', type: 'string' },
      ])
    );
    expect(withUndefined).toHaveLength(withoutKey.length + 1);
  });

  it('treats the JSON-safe undefined marker the same as a real undefined value', () => {
    const leaves = flattenToPaths({ sidebar_open: UNDEFINED_MARKER });
    expect(leaves).toEqual([{ path: 'sidebar_open', value: undefined, type: 'undefined' }]);
  });

  it('returns nothing for a wholly absent object, not a phantom top-level leaf', () => {
    expect(flattenToPaths(undefined)).toEqual([]);
  });

  it('handles a fully flat event with only primitives', () => {
    const leaves = flattenToPaths({ event: 'click_button', click_text: 'Book now', click_section: undefined });
    expect(leaves).toEqual([
      { path: 'event', value: 'click_button', type: 'string' },
      { path: 'click_text', value: 'Book now', type: 'string' },
      { path: 'click_section', value: undefined, type: 'undefined' },
    ]);
  });
});
