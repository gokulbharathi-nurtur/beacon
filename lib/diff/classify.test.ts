import { describe, it, expect } from 'vitest';
import { inferDefaultClassification, inferAllowEmpty } from './classify';

// Fixtures grounded in a real reference implementation of this team's dataLayer contract.
describe('inferDefaultClassification', () => {
  const exactCases: Array<[path: string, value: unknown, type: 'string' | 'boolean']> = [
    ['event', 'page_loaded', 'string'],
    ['user.signed_in_status', 'signed out', 'string'],
    ['page.content_type', 'buyers', 'string'],
    ['property_details.property_listing_type', 'sales', 'string'],
    ['form_validation', 'success', 'string'],
    ['click_accordion_action', 'opened', 'string'],
    ['sidebar_event', 'opened', 'string'],
    ['page.currency', 'GBP', 'string'],
    ['search.format', 'Map', 'string'],
    ['user.internal_traffic', false, 'boolean'],
  ];

  it.each(exactCases)('classifies %s as exact', (path, value, type) => {
    const result = inferDefaultClassification(path, value, type);
    expect(result.classification).toBe('exact');
    expect(result.exactValue).toBe(value);
  });

  const structuralCases: Array<[path: string, value: unknown, type: 'string' | 'number']> = [
    ['property_details.property_id', 'CRM123', 'string'],
    ['click_url', 'https://example.com/branches/', 'string'],
    ['click_text', 'Book a viewing', 'string'],
    ['search.search_term', 'SW1A 1AA', 'string'],
    ['page.page_referrer', 'https://google.com', 'string'],
    ['property_details.price', 250000, 'number'],
    ['property_details.postcode', 'SW1A 1AA', 'string'],
    ['property_details.position', 2, 'number'],
    ['property_details.index', 1029, 'number'],
    ['property_details.published_date', '2026-01-01', 'string'],
    ['search.search_results', 42, 'number'],
    ['property_details.bedrooms', 3, 'number'],
    ['property_details.bathrooms', 2, 'number'],
    ['property_details.reception_rooms', 1, 'number'],
    ['property_details.average_rental_price', 1500, 'number'],
    ['property_details.average_rental_yield', '4.5%', 'string'],
    // Id-like field must win over the broad `_type`/`_status`-style enum patterns.
    ['page.content_id', 'cat-123', 'string'],
  ];

  it.each(structuralCases)('classifies %s as structural', (path, value, type) => {
    const result = inferDefaultClassification(path, value, type);
    expect(result.classification).toBe('structural');
    expect(result.exactValue).toBeUndefined();
  });

  it('falls back to structural for an unrecognized number field', () => {
    expect(inferDefaultClassification('some_count', 7, 'number').classification).toBe('structural');
  });

  it('falls back to structural for an unrecognized string field (safer default)', () => {
    expect(inferDefaultClassification('some_label', 'foo', 'string').classification).toBe('structural');
  });

  it('falls back to exact for an unrecognized boolean field (2-value enum)', () => {
    expect(inferDefaultClassification('some_flag', true, 'boolean').classification).toBe('exact');
  });

  it('classifies arrays as structural (presence/type/non-empty only)', () => {
    expect(inferDefaultClassification('property_list_details', [1, 2], 'array').classification).toBe('structural');
  });

  it('classifies null as structural', () => {
    expect(inferDefaultClassification('search', null, 'null').classification).toBe('structural');
  });
});

describe('inferAllowEmpty', () => {
  it('allows empty for referrer-style fields (document.referrer is "" on direct navigation)', () => {
    expect(inferAllowEmpty('page.page_referrer', 'string')).toBe(true);
    expect(inferAllowEmpty('referrer', 'string')).toBe(true);
  });

  it('does not allow empty for real content fields by default', () => {
    expect(inferAllowEmpty('click_text', 'string')).toBe(false);
    expect(inferAllowEmpty('property_details.property_name', 'string')).toBe(false);
  });

  it('is always false for non-string/array types (no "empty" concept applies)', () => {
    expect(inferAllowEmpty('page.page_referrer', 'number')).toBe(false);
    expect(inferAllowEmpty('page.page_referrer', 'boolean')).toBe(false);
  });
});
