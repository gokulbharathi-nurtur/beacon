import { describe, it, expect } from 'vitest';
import { fieldRuleSchema, createTemplateSchema, createRunSchema } from './validation';

describe('fieldRuleSchema', () => {
  it('accepts a valid matchesPattern/excludesPattern regex', () => {
    const result = fieldRuleSchema.safeParse({
      path: 'estate_agent_branch',
      classification: 'structural',
      type: 'string',
      matchesPattern: '^The .+ Branch$',
      excludesPattern: '^The [A-Z]{3}(,[A-Z]{3})*\\s+Branch$',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid matchesPattern regex with a clear error', () => {
    const result = fieldRuleSchema.safeParse({
      path: 'estate_agent_branch',
      classification: 'structural',
      type: 'string',
      matchesPattern: '(unclosed',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('matchesPattern'))).toBe(true);
    }
  });

  it('rejects an invalid excludesPattern regex with a clear error', () => {
    const result = fieldRuleSchema.safeParse({
      path: 'estate_agent_branch',
      classification: 'structural',
      type: 'string',
      excludesPattern: '[a-',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('excludesPattern'))).toBe(true);
    }
  });

  it('accepts a non-empty oneOf list', () => {
    const result = fieldRuleSchema.safeParse({
      path: 'property_listing_type',
      classification: 'structural',
      type: 'string',
      oneOf: ['sales', 'lettings'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty oneOf list with a clear error', () => {
    const result = fieldRuleSchema.safeParse({
      path: 'property_listing_type',
      classification: 'structural',
      type: 'string',
      oneOf: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('oneOf'))).toBe(true);
    }
  });

  it('rejects a oneOf list containing an empty string entry', () => {
    const result = fieldRuleSchema.safeParse({
      path: 'property_listing_type',
      classification: 'structural',
      type: 'string',
      oneOf: ['sales', ''],
    });
    expect(result.success).toBe(false);
  });

  it("accepts type 'undefined' for a field that's explicitly present-but-undefined", () => {
    const result = fieldRuleSchema.safeParse({
      path: 'sidebar_open',
      classification: 'structural',
      type: 'undefined',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a rule with nested itemFields carrying their own valid patterns', () => {
    const result = fieldRuleSchema.safeParse({
      path: 'property_list_details',
      classification: 'structural',
      type: 'array',
      itemFields: [
        {
          path: 'estate_agent_branch',
          classification: 'structural',
          type: 'string',
          excludesPattern: '^The [A-Z]{3}(,[A-Z]{3})*\\s+Branch$',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('createTemplateSchema kind/steps pairing', () => {
  const base = { name: 'T', sourceUrl: 'https://x.test/', events: [] };

  it('defaults kind to pageload and accepts no steps', () => {
    const result = createTemplateSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe('pageload');
  });

  it('rejects a click template with no steps', () => {
    const result = createTemplateSchema.safeParse({ ...base, kind: 'click' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((i) => i.path.includes('steps'))).toBe(true);
  });

  it('rejects a pageload template that carries steps', () => {
    const result = createTemplateSchema.safeParse({
      ...base,
      kind: 'pageload',
      steps: [{ action: 'click', target: { by: 'text', value: 'Go' } }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a click template with at least one step', () => {
    const result = createTemplateSchema.safeParse({
      ...base,
      kind: 'click',
      steps: [{ action: 'click', target: { by: 'text', value: 'Book a viewing' }, label: 'Open form' }],
    });
    expect(result.success).toBe(true);
  });
});

describe('createRunSchema', () => {
  it('only enforces kind/steps pairing for record runs', () => {
    // diff runs derive kind/steps server-side, so a bare diff body is fine
    expect(createRunSchema.safeParse({ url: 'https://x.test/', mode: 'diff', templateIds: ['a'] }).success).toBe(true);
    // a record run declaring click must carry steps
    expect(createRunSchema.safeParse({ url: 'https://x.test/', mode: 'record', kind: 'click' }).success).toBe(false);
  });
});
