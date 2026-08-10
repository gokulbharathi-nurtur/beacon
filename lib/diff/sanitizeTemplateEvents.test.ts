import { describe, it, expect } from 'vitest';
import { sanitizeTemplateEvents } from './sanitizeTemplateEvents';
import type { TemplateEvent } from '@/lib/types';

describe('sanitizeTemplateEvents', () => {
  it('strips an empty-string containsText/matchesPattern/excludesPattern (chip added but never filled in)', () => {
    const events: TemplateEvent[] = [
      {
        eventName: 'property_click',
        occurrenceIndex: 0,
        fields: [
          { path: 'a', classification: 'structural', type: 'string', containsText: '' },
          { path: 'b', classification: 'structural', type: 'string', matchesPattern: '' },
          { path: 'c', classification: 'structural', type: 'string', excludesPattern: '' },
        ],
      },
    ];
    const [sanitized] = sanitizeTemplateEvents(events);
    expect(sanitized.fields).toEqual([
      { path: 'a', classification: 'structural', type: 'string' },
      { path: 'b', classification: 'structural', type: 'string' },
      { path: 'c', classification: 'structural', type: 'string' },
    ]);
  });

  it('strips an empty oneOf array, and filters out blank entries within a partially-filled one', () => {
    const events: TemplateEvent[] = [
      {
        eventName: 'property_click',
        occurrenceIndex: 0,
        fields: [
          { path: 'empty', classification: 'structural', type: 'string', oneOf: [] },
          { path: 'trailingComma', classification: 'structural', type: 'string', oneOf: ['sales', 'lettings', ''] },
          { path: 'whitespaceOnly', classification: 'structural', type: 'string', oneOf: ['  '] },
        ],
      },
    ];
    const [sanitized] = sanitizeTemplateEvents(events);
    expect(sanitized.fields).toEqual([
      { path: 'empty', classification: 'structural', type: 'string' },
      { path: 'trailingComma', classification: 'structural', type: 'string', oneOf: ['sales', 'lettings'] },
      { path: 'whitespaceOnly', classification: 'structural', type: 'string' },
    ]);
  });

  it('leaves filled-in rule values untouched', () => {
    const events: TemplateEvent[] = [
      {
        eventName: 'property_click',
        occurrenceIndex: 0,
        fields: [
          { path: 'a', classification: 'structural', type: 'string', containsText: '/properties/' },
          { path: 'b', classification: 'structural', type: 'string', oneOf: ['sales', 'lettings'] },
        ],
      },
    ];
    expect(sanitizeTemplateEvents(events)).toEqual(events);
  });

  it('recurses one level into itemFields', () => {
    const events: TemplateEvent[] = [
      {
        eventName: 'view_property_list',
        occurrenceIndex: 0,
        fields: [
          {
            path: 'property_list_details',
            classification: 'structural',
            type: 'array',
            itemFields: [{ path: 'property_listing_type', classification: 'structural', type: 'string', oneOf: [] }],
          },
        ],
      },
    ];
    const [sanitized] = sanitizeTemplateEvents(events);
    expect(sanitized.fields[0].itemFields).toEqual([{ path: 'property_listing_type', classification: 'structural', type: 'string' }]);
  });
});
