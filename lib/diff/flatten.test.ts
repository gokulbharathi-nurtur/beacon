import { describe, it, expect } from 'vitest';
import { flattenToPaths } from './flatten';

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

  it('drops explicit undefined values entirely, same as a missing key', () => {
    const withUndefined = flattenToPaths({ sidebar_open: undefined, click_text: 'Home' });
    const withoutKey = flattenToPaths({ click_text: 'Home' });
    expect(withUndefined).toEqual(withoutKey);
  });

  it('handles a fully flat event with only primitives', () => {
    const leaves = flattenToPaths({ event: 'click_button', click_text: 'Book now', click_section: undefined });
    expect(leaves).toEqual([
      { path: 'event', value: 'click_button', type: 'string' },
      { path: 'click_text', value: 'Book now', type: 'string' },
    ]);
  });
});
