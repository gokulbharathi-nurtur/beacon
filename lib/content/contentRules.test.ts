import { describe, expect, it } from 'vitest';
import { buildFieldRules } from './contentRules';
import { compareFieldsAgainstObject } from '@/lib/diff/compareFields';
import { UNDEFINED_MARKER } from '@/lib/capture/undefinedMarker';
import type { CompiledContentRule } from './patternMatch';

function rule(overrides: Partial<CompiledContentRule>): CompiledContentRule {
  return {
    id: 'r1',
    rowOrder: 0,
    rawPagesText: '/example',
    matchers: [],
    contentGroup: null,
    contentId: null,
    contentType: null,
    ...overrides,
  };
}

describe('buildFieldRules + compareFieldsAgainstObject', () => {
  it('skips fields the sheet left blank', () => {
    const fields = buildFieldRules(rule({ contentGroup: 'homepage' }));
    expect(fields).toHaveLength(1);
    expect(fields[0].path).toBe('page.content_group');
  });

  it('passes when actual values exactly match', () => {
    const fields = buildFieldRules(rule({ contentGroup: 'search results', contentType: 'buyers, sellers' }));
    const diffs = compareFieldsAgainstObject(fields, {
      event: 'page_loaded',
      page: { content_group: 'search results', content_type: 'buyers, sellers' },
    });
    expect(diffs).toEqual([]);
  });

  it('flags a mismatched value', () => {
    const fields = buildFieldRules(rule({ contentGroup: 'search results' }));
    const diffs = compareFieldsAgainstObject(fields, { event: 'page_loaded', page: { content_group: 'homepage' } });
    expect(diffs).toHaveLength(1);
    expect(diffs[0].kind).toBe('value_mismatch');
  });

  it('flags a field the sheet expects but the page never pushed', () => {
    const fields = buildFieldRules(rule({ contentId: 'residential' }));
    const diffs = compareFieldsAgainstObject(fields, { event: 'page_loaded', page: {} });
    expect(diffs).toHaveLength(1);
    expect(diffs[0].kind).toBe('missing_field');
  });

  it('treats the literal "undefined" cell as an expectation of a real undefined value, not a skip', () => {
    const fields = buildFieldRules(rule({ contentType: 'undefined' }));

    const presentButUndefined = compareFieldsAgainstObject(fields, {
      event: 'page_loaded',
      page: { content_type: UNDEFINED_MARKER },
    });
    expect(presentButUndefined).toEqual([]);

    const actuallyMissing = compareFieldsAgainstObject(fields, { event: 'page_loaded', page: {} });
    expect(actuallyMissing).toHaveLength(1);
    expect(actuallyMissing[0].kind).toBe('missing_field');

    const wrongType = compareFieldsAgainstObject(fields, {
      event: 'page_loaded',
      page: { content_type: 'brand' },
    });
    expect(wrongType).toHaveLength(1);
    expect(wrongType[0].kind).toBe('type_mismatch');
  });
});
