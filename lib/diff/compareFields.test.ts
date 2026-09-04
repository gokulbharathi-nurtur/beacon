import { describe, it, expect } from 'vitest';
import { compareEventFields } from './compareFields';
import type { RawEvent, TemplateEvent } from '@/lib/types';

describe('compareEventFields', () => {
  it('returns no diffs for a clean match', () => {
    const template: TemplateEvent = {
      eventName: 'page_loaded',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'page_loaded' },
        { path: 'page.content_group', classification: 'exact', type: 'string', exactValue: 'Home page' },
        { path: 'user.signed_in_status', classification: 'exact', type: 'string', exactValue: 'signed out' },
        { path: 'property_details.price', classification: 'structural', type: 'number' },
      ],
    };
    const captured: RawEvent = {
      event: 'page_loaded',
      page: { content_group: 'Home page' },
      user: { signed_in_status: 'signed out' },
      property_details: { price: 999999 }, // different value, fine — structural
    };
    expect(compareEventFields(template, captured)).toEqual([]);
  });

  it('flags a missing field when the path is entirely absent', () => {
    const template: TemplateEvent = {
      eventName: 'page_loaded',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'page_loaded' },
        { path: 'user.signed_in_status', classification: 'exact', type: 'string', exactValue: 'signed out' },
      ],
    };
    const captured: RawEvent = { event: 'page_loaded' };
    expect(compareEventFields(template, captured)).toEqual([
      { path: 'user.signed_in_status', kind: 'missing_field', expectedType: 'string', expectedValue: 'signed out' },
    ]);
  });

  it('flags a type mismatch (not a missing field) when the template expects a value but the field is explicitly undefined', () => {
    // Distinct from the path being entirely absent (tested above) — the key was pushed,
    // it just evaluated to undefined, which is worth telling apart from "never fired".
    const template: TemplateEvent = {
      eventName: 'click_button',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'click_button' },
        { path: 'click_section', classification: 'structural', type: 'string' },
      ],
    };
    const captured: RawEvent = { event: 'click_button', click_section: undefined };
    expect(compareEventFields(template, captured)).toEqual([
      {
        path: 'click_section',
        kind: 'type_mismatch',
        expectedType: 'string',
        actualType: 'undefined',
        expectedValue: undefined,
        actualValue: undefined,
      },
    ]);
  });

  it('passes when a template explicitly expects a field to be undefined and it is', () => {
    const template: TemplateEvent = {
      eventName: 'click_button',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'click_button' },
        { path: 'click_section', classification: 'structural', type: 'undefined' },
      ],
    };
    const captured: RawEvent = { event: 'click_button', click_section: undefined };
    expect(compareEventFields(template, captured)).toEqual([]);
  });

  it('flags a type mismatch distinctly from a value mismatch', () => {
    const template: TemplateEvent = {
      eventName: 'property_click',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'property_click' },
        { path: 'property_details.price', classification: 'structural', type: 'number' },
      ],
    };
    const captured: RawEvent = { event: 'property_click', property_details: { price: '250000' } };
    expect(compareEventFields(template, captured)).toEqual([
      {
        path: 'property_details.price',
        kind: 'type_mismatch',
        expectedType: 'number',
        actualType: 'string',
        expectedValue: undefined,
        actualValue: '250000',
      },
    ]);
  });

  it('flags a value mismatch for an exact field with a different value', () => {
    const template: TemplateEvent = {
      eventName: 'page_loaded',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'page_loaded' },
        { path: 'user.signed_in_status', classification: 'exact', type: 'string', exactValue: 'signed out' },
      ],
    };
    const captured: RawEvent = { event: 'page_loaded', user: { signed_in_status: 'signed in' } };
    expect(compareEventFields(template, captured)).toEqual([
      { path: 'user.signed_in_status', kind: 'value_mismatch', expectedValue: 'signed out', actualValue: 'signed in' },
    ]);
  });

  it('flags a structural violation for an empty string', () => {
    const template: TemplateEvent = {
      eventName: 'click_button',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'click_button' },
        { path: 'click_text', classification: 'structural', type: 'string' },
      ],
    };
    const captured: RawEvent = { event: 'click_button', click_text: '' };
    expect(compareEventFields(template, captured)).toEqual([
      { path: 'click_text', kind: 'structural_violation', actualType: 'string', actualValue: '', reason: 'empty' },
    ]);
  });

  it('does not flag an empty string as a violation when the field is marked allowEmpty', () => {
    const template: TemplateEvent = {
      eventName: 'page_loaded',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'page_loaded' },
        { path: 'page.page_referrer', classification: 'structural', type: 'string', allowEmpty: true },
      ],
    };
    // document.referrer is legitimately "" on direct navigation — not broken tracking.
    const captured: RawEvent = { event: 'page_loaded', page: { page_referrer: '' } };
    expect(compareEventFields(template, captured)).toEqual([]);
  });

  it('still flags an empty array as a violation when allowEmpty is absent, even for other structural fields', () => {
    const template: TemplateEvent = {
      eventName: 'page_loaded',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'page_loaded' },
        { path: 'page.page_referrer', classification: 'structural', type: 'string', allowEmpty: true },
        { path: 'click_text', classification: 'structural', type: 'string' },
      ],
    };
    const captured: RawEvent = { event: 'page_loaded', page: { page_referrer: '' }, click_text: '' };
    expect(compareEventFields(template, captured)).toEqual([
      { path: 'click_text', kind: 'structural_violation', actualType: 'string', actualValue: '', reason: 'empty' },
    ]);
  });

  it('flags a structural violation for an empty array', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        { path: 'property_list_details', classification: 'structural', type: 'array' },
      ],
    };
    const captured: RawEvent = { event: 'view_property_list', property_list_details: [] };
    expect(compareEventFields(template, captured)).toEqual([
      {
        path: 'property_list_details',
        kind: 'structural_violation',
        actualType: 'array',
        actualValue: [],
        reason: 'empty',
      },
    ]);
  });

  it('does not flag a non-empty array or a legitimately different number as violations', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        { path: 'property_list_details', classification: 'structural', type: 'array' },
        { path: 'search_results', classification: 'structural', type: 'number' },
      ],
    };
    const captured: RawEvent = { event: 'view_property_list', property_list_details: [{ id: 1 }], search_results: 12 };
    expect(compareEventFields(template, captured)).toEqual([]);
  });

  it('does not flag a field recorded and recurring as null (structural)', () => {
    const template: TemplateEvent = {
      eventName: 'page_loaded',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'page_loaded' },
        { path: 'search', classification: 'structural', type: 'null' },
      ],
    };
    const captured: RawEvent = { event: 'page_loaded', search: null };
    expect(compareEventFields(template, captured)).toEqual([]);
  });

  it('flags an array_count_mismatch when expectedCount is set and the length differs', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        { path: 'property_list_details', classification: 'structural', type: 'array', expectedCount: 4 },
      ],
    };
    const captured: RawEvent = {
      event: 'view_property_list',
      property_list_details: [{ id: 1 }, { id: 2 }],
    };
    expect(compareEventFields(template, captured)).toEqual([
      { path: 'property_list_details', kind: 'array_count_mismatch', expectedValue: 4, actualValue: 2 },
    ]);
  });

  it('does not flag an array when expectedCount matches the actual length exactly', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        { path: 'property_list_details', classification: 'structural', type: 'array', expectedCount: 2 },
      ],
    };
    const captured: RawEvent = {
      event: 'view_property_list',
      property_list_details: [{ id: 1 }, { id: 2 }],
    };
    expect(compareEventFields(template, captured)).toEqual([]);
  });

  it('flags array_count_mismatch (not structural_violation) when expectedCount is 0 but the array is non-empty', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        { path: 'property_list_details', classification: 'structural', type: 'array', expectedCount: 0 },
      ],
    };
    const captured: RawEvent = { event: 'view_property_list', property_list_details: [{ id: 1 }] };
    expect(compareEventFields(template, captured)).toEqual([
      { path: 'property_list_details', kind: 'array_count_mismatch', expectedValue: 0, actualValue: 1 },
    ]);
  });

  it('does not double-report an empty array as both count_mismatch and structural_violation when expectedCount is set', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        { path: 'property_list_details', classification: 'structural', type: 'array', expectedCount: 3 },
      ],
    };
    const captured: RawEvent = { event: 'view_property_list', property_list_details: [] };
    expect(compareEventFields(template, captured)).toEqual([
      { path: 'property_list_details', kind: 'array_count_mismatch', expectedValue: 3, actualValue: 0 },
    ]);
  });

  it('flags a string_contains_mismatch when containsText is set and the value lacks the substring', () => {
    const template: TemplateEvent = {
      eventName: 'property_click',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'property_click' },
        { path: 'click_url', classification: 'structural', type: 'string', containsText: '/properties/' },
      ],
    };
    const captured: RawEvent = { event: 'property_click', click_url: 'https://example.com/branches/leeds' };
    expect(compareEventFields(template, captured)).toEqual([
      {
        path: 'click_url',
        kind: 'string_contains_mismatch',
        expectedValue: '/properties/',
        actualValue: 'https://example.com/branches/leeds',
      },
    ]);
  });

  it('does not flag a string when it contains the expected substring', () => {
    const template: TemplateEvent = {
      eventName: 'property_click',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'property_click' },
        { path: 'click_url', classification: 'structural', type: 'string', containsText: '/properties/' },
      ],
    };
    const captured: RawEvent = { event: 'property_click', click_url: 'https://example.com/properties/123-main-st' };
    expect(compareEventFields(template, captured)).toEqual([]);
  });

  it('flags string_contains_mismatch (not structural_violation) for an empty string when containsText is set', () => {
    const template: TemplateEvent = {
      eventName: 'property_click',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'property_click' },
        { path: 'click_url', classification: 'structural', type: 'string', containsText: '/properties/' },
      ],
    };
    const captured: RawEvent = { event: 'property_click', click_url: '' };
    expect(compareEventFields(template, captured)).toEqual([
      { path: 'click_url', kind: 'string_contains_mismatch', expectedValue: '/properties/', actualValue: '' },
    ]);
  });

  it('flags a pattern_mismatch when matchesPattern is set and the value does not match', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        { path: 'estate_agent_branch', classification: 'structural', type: 'string', matchesPattern: '^The .+ Branch$' },
      ],
    };
    const captured: RawEvent = { event: 'view_property_list', estate_agent_branch: 'Romsey' };
    expect(compareEventFields(template, captured)).toEqual([
      {
        path: 'estate_agent_branch',
        kind: 'pattern_mismatch',
        expectedValue: '/^The .+ Branch$/',
        actualValue: 'Romsey',
        reason: 'pattern_not_matched',
      },
    ]);
  });

  it('does not flag a value that matches the required matchesPattern', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        { path: 'estate_agent_branch', classification: 'structural', type: 'string', matchesPattern: '^The .+ Branch$' },
      ],
    };
    const captured: RawEvent = { event: 'view_property_list', estate_agent_branch: 'The Romsey Branch' };
    expect(compareEventFields(template, captured)).toEqual([]);
  });

  it('flags a pattern_mismatch when excludesPattern is set and a raw CRM code leaks through', () => {
    // Real motivating case: estate_agent_branch is built as "The {name} Branch" server-side;
    // when the substitution fails, the raw CRM code (3-letter uppercase, comma-joined for
    // multi-branch listings) leaks through instead of the human-readable branch name.
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        {
          path: 'estate_agent_branch',
          classification: 'structural',
          type: 'string',
          excludesPattern: '^The [A-Z]{3}(,[A-Z]{3})*\\s+Branch$',
        },
      ],
    };
    const captured: RawEvent = { event: 'view_property_list', estate_agent_branch: 'The LSW,ROM Branch' };
    expect(compareEventFields(template, captured)).toEqual([
      {
        path: 'estate_agent_branch',
        kind: 'pattern_mismatch',
        expectedValue: 'not /^The [A-Z]{3}(,[A-Z]{3})*\\s+Branch$/',
        actualValue: 'The LSW,ROM Branch',
        reason: 'pattern_excluded',
      },
    ]);
  });

  it('does not flag a real branch name against the excludesPattern CRM-code check', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        {
          path: 'estate_agent_branch',
          classification: 'structural',
          type: 'string',
          excludesPattern: '^The [A-Z]{3}(,[A-Z]{3})*\\s+Branch$',
        },
      ],
    };
    const captured: RawEvent = { event: 'view_property_list', estate_agent_branch: 'The Romsey Branch' };
    expect(compareEventFields(template, captured)).toEqual([]);
  });

  it('checks matchesPattern and excludesPattern independently, surfacing only the one actually violated', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        {
          path: 'estate_agent_branch',
          classification: 'structural',
          type: 'string',
          matchesPattern: '^The .+ Branch$',
          excludesPattern: '^The [A-Z]{3}(,[A-Z]{3})*\\s+Branch$',
        },
      ],
    };
    // Matches the required wrapper shape (passes matchesPattern) but is also a bare CRM code (fails excludesPattern).
    const captured: RawEvent = { event: 'view_property_list', estate_agent_branch: 'The LSW Branch' };
    expect(compareEventFields(template, captured)).toEqual([
      {
        path: 'estate_agent_branch',
        kind: 'pattern_mismatch',
        expectedValue: 'not /^The [A-Z]{3}(,[A-Z]{3})*\\s+Branch$/',
        actualValue: 'The LSW Branch',
        reason: 'pattern_excluded',
      },
    ]);
  });

  it('does not flag a value that is one of the allowed oneOf set', () => {
    const template: TemplateEvent = {
      eventName: 'property_click',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'property_click' },
        { path: 'property_details.property_listing_type', classification: 'structural', type: 'string', oneOf: ['sales', 'lettings'] },
      ],
    };
    const captured: RawEvent = { event: 'property_click', property_details: { property_listing_type: 'lettings' } };
    expect(compareEventFields(template, captured)).toEqual([]);
  });

  it('flags value_not_in_set when the value is not one of the allowed oneOf set', () => {
    const template: TemplateEvent = {
      eventName: 'property_click',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'property_click' },
        { path: 'property_details.property_listing_type', classification: 'structural', type: 'string', oneOf: ['sales', 'lettings'] },
      ],
    };
    const captured: RawEvent = { event: 'property_click', property_details: { property_listing_type: 'auction' } };
    expect(compareEventFields(template, captured)).toEqual([
      {
        path: 'property_details.property_listing_type',
        kind: 'value_not_in_set',
        expectedValue: ['sales', 'lettings'],
        actualValue: 'auction',
      },
    ]);
  });

  it('flags value_not_in_set (not structural_violation) for an empty string when oneOf is set', () => {
    const template: TemplateEvent = {
      eventName: 'property_click',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'property_click' },
        { path: 'property_listing_type', classification: 'structural', type: 'string', oneOf: ['sales', 'lettings'] },
      ],
    };
    const captured: RawEvent = { event: 'property_click', property_listing_type: '' };
    expect(compareEventFields(template, captured)).toEqual([
      { path: 'property_listing_type', kind: 'value_not_in_set', expectedValue: ['sales', 'lettings'], actualValue: '' },
    ]);
  });

  it('returns no diffs when every item in the array matches the shared itemFields rules', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        {
          path: 'property_list_details',
          classification: 'structural',
          type: 'array',
          itemFields: [
            { path: 'property_listing_type', classification: 'exact', type: 'string', exactValue: 'sales' },
            { path: 'price', classification: 'structural', type: 'number' },
          ],
        },
      ],
    };
    const captured: RawEvent = {
      event: 'view_property_list',
      property_list_details: [
        { property_listing_type: 'sales', price: 250000 },
        { property_listing_type: 'sales', price: 375000 },
      ],
    };
    expect(compareEventFields(template, captured)).toEqual([]);
  });

  it('does not flag an item field with no itemFields rule as unexpected (unlike the top-level event check)', () => {
    // Regression: a real property card has a dozen+ fields (property_type, tenure,
    // bedrooms, postcode, ...) even when the template only checks a couple of them —
    // those extras must not get swept up by the top-level "unexpected_field" pass.
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        {
          path: 'property_list_details',
          classification: 'structural',
          type: 'array',
          itemFields: [{ path: 'property_listing_type', classification: 'exact', type: 'string', exactValue: 'sales' }],
        },
      ],
    };
    const captured: RawEvent = {
      event: 'view_property_list',
      property_list_details: [
        { property_listing_type: 'sales', property_type: 'Detached House', bedrooms: 4, postcode: 'SO51 6FX' },
      ],
    };
    expect(compareEventFields(template, captured)).toEqual([]);
  });

  it('flags a violation for the specific item that fails an itemFields rule, indexed in the path', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        {
          path: 'property_list_details',
          classification: 'structural',
          type: 'array',
          itemFields: [{ path: 'property_listing_type', classification: 'exact', type: 'string', exactValue: 'sales' }],
        },
      ],
    };
    const captured: RawEvent = {
      event: 'view_property_list',
      property_list_details: [
        { property_listing_type: 'sales' },
        { property_listing_type: 'lettings' },
        { property_listing_type: 'sales' },
      ],
    };
    expect(compareEventFields(template, captured)).toEqual([
      {
        path: 'property_list_details[1].property_listing_type',
        kind: 'value_mismatch',
        expectedValue: 'sales',
        actualValue: 'lettings',
      },
    ]);
  });

  it('flags multiple items independently, each keeping its own index', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        {
          path: 'property_list_details',
          classification: 'structural',
          type: 'array',
          itemFields: [{ path: 'price', classification: 'structural', type: 'number' }],
        },
      ],
    };
    const captured: RawEvent = {
      event: 'view_property_list',
      property_list_details: [{ price: 'not a number' }, { price: 250000 }, { price: NaN }],
    };
    expect(compareEventFields(template, captured)).toEqual([
      {
        path: 'property_list_details[0].price',
        kind: 'type_mismatch',
        expectedType: 'number',
        actualType: 'string',
        expectedValue: undefined,
        actualValue: 'not a number',
      },
      {
        path: 'property_list_details[2].price',
        kind: 'structural_violation',
        actualType: 'number',
        actualValue: NaN,
        reason: 'empty',
      },
    ]);
  });

  it('produces no item-level diffs for an empty array even when itemFields is set', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        {
          path: 'property_list_details',
          classification: 'structural',
          type: 'array',
          allowEmpty: true,
          itemFields: [{ path: 'price', classification: 'structural', type: 'number' }],
        },
      ],
    };
    const captured: RawEvent = { event: 'view_property_list', property_list_details: [] };
    expect(compareEventFields(template, captured)).toEqual([]);
  });

  it('surfaces expectedCount mismatches and item-shape failures independently on the same run', () => {
    const template: TemplateEvent = {
      eventName: 'view_property_list',
      occurrenceIndex: 0,
      fields: [
        { path: 'event', classification: 'exact', type: 'string', exactValue: 'view_property_list' },
        {
          path: 'property_list_details',
          classification: 'structural',
          type: 'array',
          expectedCount: 3,
          itemFields: [{ path: 'property_listing_type', classification: 'exact', type: 'string', exactValue: 'sales' }],
        },
      ],
    };
    const captured: RawEvent = {
      event: 'view_property_list',
      property_list_details: [{ property_listing_type: 'sales' }, { property_listing_type: 'lettings' }],
    };
    expect(compareEventFields(template, captured)).toEqual([
      { path: 'property_list_details', kind: 'array_count_mismatch', expectedValue: 3, actualValue: 2 },
      {
        path: 'property_list_details[1].property_listing_type',
        kind: 'value_mismatch',
        expectedValue: 'sales',
        actualValue: 'lettings',
      },
    ]);
  });

  it('surfaces a captured field with no template rule as unexpected_field', () => {
    const template: TemplateEvent = {
      eventName: 'click_button',
      occurrenceIndex: 0,
      fields: [{ path: 'event', classification: 'exact', type: 'string', exactValue: 'click_button' }],
    };
    const captured: RawEvent = { event: 'click_button', click_section: 'hero' };
    expect(compareEventFields(template, captured)).toEqual([
      { path: 'click_section', kind: 'unexpected_field', actualType: 'string', actualValue: 'hero' },
    ]);
  });
});
