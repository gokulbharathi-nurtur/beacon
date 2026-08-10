import { describe, it, expect } from 'vitest';
import { buildExpectedJson } from './buildExpectedJson';
import type { TemplateEvent } from '@/lib/types';

describe('buildExpectedJson', () => {
  it('reconstructs nested objects from dot-paths, mixing exact values and structural placeholders', () => {
    const templateEvent: TemplateEvent = {
      eventName: 'page_loaded',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'page_loaded' },
        { path: 'page.content_group', classification: 'exact', type: 'string', exactValue: 'Home page' },
        { path: 'page.page_referrer', classification: 'structural', type: 'string' },
        { path: 'user.signed_in_status', classification: 'exact', type: 'string', exactValue: 'signed out' },
        { path: 'user.internal_traffic', classification: 'exact', type: 'boolean', exactValue: false },
      ],
    };

    expect(buildExpectedJson(templateEvent)).toEqual({
      event: 'page_loaded',
      page: { content_group: 'Home page', page_referrer: '<string>' },
      user: { signed_in_status: 'signed out', internal_traffic: false },
    });
  });

  it('uses type-appropriate placeholders for structural fields of every type', () => {
    const templateEvent: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'property_list_name', classification: 'structural', type: 'string' },
        { path: 'property_details.price', classification: 'structural', type: 'number' },
        { path: 'property_details.position', classification: 'structural', type: 'number' },
        { path: 'property_list_details', classification: 'structural', type: 'array' },
        { path: 'search', classification: 'structural', type: 'null' },
      ],
    };

    expect(buildExpectedJson(templateEvent)).toEqual({
      property_list_name: '<string>',
      property_details: { price: '<number>', position: '<number>' },
      property_list_details: '<array, non-empty>',
      search: null,
    });
  });

  it('shows the expected count in the placeholder when an array field has one set', () => {
    const templateEvent: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'property_list_details', classification: 'structural', type: 'array', expectedCount: 4 },
        { path: 'featured', classification: 'structural', type: 'array', expectedCount: 1 },
      ],
    };
    expect(buildExpectedJson(templateEvent)).toEqual({
      property_list_details: '<array, exactly 4 items>',
      featured: '<array, exactly 1 item>',
    });
  });

  it('shows the expected substring in the placeholder when a string field has containsText set', () => {
    const templateEvent: TemplateEvent = {
      eventName: 'property_click',
      occurrenceIndex: 0,
      fields: [{ path: 'click_url', classification: 'structural', type: 'string', containsText: '/properties/' }],
    };
    expect(buildExpectedJson(templateEvent)).toEqual({ click_url: '<string, contains "/properties/">' });
  });

  it('shows the allowed set in the placeholder when a string field has oneOf set', () => {
    const templateEvent: TemplateEvent = {
      eventName: 'property_click',
      occurrenceIndex: 0,
      fields: [
        { path: 'property_details.property_listing_type', classification: 'structural', type: 'string', oneOf: ['sales', 'lettings'] },
      ],
    };
    expect(buildExpectedJson(templateEvent)).toEqual({
      property_details: { property_listing_type: '<string, one of "sales" | "lettings">' },
    });
  });

  it('composes multiple text-shape clauses in the placeholder when a string field has several rules set', () => {
    const templateEvent: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        {
          path: 'estate_agent_branch',
          classification: 'structural',
          type: 'string',
          matchesPattern: '^The .+ Branch$',
          excludesPattern: '^The [A-Z]{3}(,[A-Z]{3})*\\s+Branch$',
        },
      ],
    };
    expect(buildExpectedJson(templateEvent)).toEqual({
      estate_agent_branch: '<string, matches /^The .+ Branch$/, excludes /^The [A-Z]{3}(,[A-Z]{3})*\\s+Branch$/>',
    });
  });

  it('renders a one-item array of the expected item shape when itemFields is set, taking precedence over expectedCount', () => {
    const templateEvent: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        {
          path: 'property_list_details',
          classification: 'structural',
          type: 'array',
          expectedCount: 4,
          itemFields: [
            { path: 'property_listing_type', classification: 'exact', type: 'string', exactValue: 'sales' },
            { path: 'price', classification: 'structural', type: 'number' },
          ],
        },
      ],
    };
    expect(buildExpectedJson(templateEvent)).toEqual({
      property_list_details: [{ property_listing_type: 'sales', price: '<number>' }],
    });
  });

  it('does not invent a fake value for exact fields with no stored exactValue', () => {
    const templateEvent: TemplateEvent = {
      eventName: 'click_button',
      occurrenceIndex: 0,
      fields: [{ path: 'click_text', classification: 'exact', type: 'string' }],
    };
    expect(buildExpectedJson(templateEvent)).toEqual({ click_text: null });
  });
});
