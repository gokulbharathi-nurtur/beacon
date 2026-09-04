import { describe, expect, it } from 'vitest';
import { compilePagePattern, findMatchingRule, type CompiledContentRule } from './patternMatch';

describe('compilePagePattern', () => {
  it('returns null for a blank line', () => {
    expect(compilePagePattern('')).toBeNull();
    expect(compilePagePattern('   ')).toBeNull();
  });

  it('matches a literal path exactly, ignoring trailing slash on either side', () => {
    const p = compilePagePattern('/property/for-sale/in-london/')!;
    expect(p.test(new URL('https://example.com/property/for-sale/in-london'))).toBe(true);
    expect(p.test(new URL('https://example.com/property/for-sale/in-london/'))).toBe(true);
    expect(p.test(new URL('https://example.com/property/for-sale/in-manchester'))).toBe(false);
  });

  it('strips a trailing " etc." annotation before matching', () => {
    const p = compilePagePattern('/property/sold-in-london/ etc.')!;
    expect(p.raw).toBe('/property/sold-in-london/ etc.');
    expect(p.test(new URL('https://example.com/property/sold-in-london'))).toBe(true);
  });

  it('auto-generalizes a concrete example detail-page URL via the identifier heuristic', () => {
    const p = compilePagePattern(
      '/property-for-sale/4-bedroom-semi-detached-house-for-sale-in-taunton-avenue-raynes-park-london-sw20-51371/ etc.'
    )!;
    expect(
      p.test(
        new URL(
          'https://example.com/property-for-sale/3-bedroom-terraced-house-for-sale-in-some-other-street-leeds-ls1-12345/'
        )
      )
    ).toBe(true);
    expect(p.test(new URL('https://example.com/contact'))).toBe(false);
  });

  it('does not auto-generalize a static multi-word route name with no digit in it', () => {
    // Regression: this real route ("land"/"and"/"new"/"homes" — 4 hyphenated words, same
    // as the old threshold) used to collapse to "/our-services/*" and silently swallow
    // every other /our-services/ row below it in a sheet, including its own siblings.
    const p = compilePagePattern('/our-services/land-and-new-homes/')!;
    expect(p.test(new URL('https://example.com/our-services/land-and-new-homes'))).toBe(true);
    expect(p.test(new URL('https://example.com/our-services/marketing'))).toBe(false);
    expect(p.test(new URL('https://example.com/our-services/report-a-repair'))).toBe(false);
    expect(p.test(new URL('https://example.com/our-services/mover-essentials'))).toBe(false);
  });

  it('does not auto-generalize other real static multi-word route names from the reference table', () => {
    for (const route of [
      '/our-services/property-management-services/',
      '/our-services/selling-at-auction/',
      '/our-services/furnishing-solutions/',
      '/renters-rights-act/',
    ]) {
      const p = compilePagePattern(route)!;
      expect(p.test(new URL(`https://example.com${route}`))).toBe(true);
      expect(p.test(new URL('https://example.com/our-services/some-other-page'))).toBe(false);
    }
  });

  it('honors an explicit wildcard glob', () => {
    const p = compilePagePattern('/property-for-sale/*')!;
    expect(p.test(new URL('https://example.com/property-for-sale/selling'))).toBe(true);
    expect(p.test(new URL('https://example.com/property-for-sale/anything/nested'))).toBe(true);
    expect(p.test(new URL('https://example.com/property-to-rent/anything'))).toBe(false);
  });

  it('strips a trailing parenthetical annotation and requires the query substring separately', () => {
    const p = compilePagePattern('/property-for-sale/in-south-manchester/?show=investment')!;
    expect(p.test(new URL('https://example.com/property-for-sale/in-south-manchester/?show=investment'))).toBe(true);
    expect(p.test(new URL('https://example.com/property-for-sale/in-south-manchester/?show=investment&page=2'))).toBe(
      true
    );
    expect(p.test(new URL('https://example.com/property-for-sale/in-south-manchester/'))).toBe(false);
  });

  it('strips a trailing "(investment)" note so it does not become part of the pattern', () => {
    const p = compilePagePattern('/property-for-sale/* (investment)')!;
    expect(p.raw).toBe('/property-for-sale/* (investment)');
    expect(p.test(new URL('https://example.com/property-for-sale/anything'))).toBe(true);
  });
});

describe('findMatchingRule', () => {
  function rule(id: string, rowOrder: number, page: string, extra: Partial<CompiledContentRule> = {}): CompiledContentRule {
    return {
      id,
      rowOrder,
      rawPagesText: page,
      matchers: [compilePagePattern(page)!],
      contentGroup: null,
      contentId: null,
      contentType: null,
      ...extra,
    };
  }

  it('returns null when nothing matches', () => {
    const rules = [rule('a', 0, '/about')];
    expect(findMatchingRule('https://example.com/contact', rules)).toBeNull();
  });

  it('returns null for an unparseable URL rather than throwing', () => {
    const rules = [rule('a', 0, '/about')];
    expect(findMatchingRule('not-a-url', rules)).toBeNull();
  });

  it('prefers an earlier, more specific rule over a later catch-all', () => {
    const specific = rule('specific', 0, '/property-for-sale/selling/');
    const catchAll = rule('catch-all', 1, '/property-for-sale/*');
    const match = findMatchingRule('https://example.com/property-for-sale/selling/', [specific, catchAll]);
    expect(match?.id).toBe('specific');
  });

  it('falls through to a later catch-all when no earlier rule matches', () => {
    const specific = rule('specific', 0, '/property-for-sale/selling/');
    const catchAll = rule('catch-all', 1, '/property-for-sale/*');
    const match = findMatchingRule('https://example.com/property-for-sale/some-4-bed-house-98765/', [
      specific,
      catchAll,
    ]);
    expect(match?.id).toBe('catch-all');
  });
});
