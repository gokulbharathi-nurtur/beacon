import { describe, it, expect } from 'vitest';
import { fieldRuleSchema } from './validation';

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
