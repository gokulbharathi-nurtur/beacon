import { describe, expect, it } from 'vitest';
import { classifyPageUrl, classifyPages, sampleBucket } from './classifyPages';

describe('classifyPageUrl', () => {
  it('keeps short static route names as distinct patterns', () => {
    expect(classifyPageUrl('https://example.com/about')).toBe('/about');
    expect(classifyPageUrl('https://example.com/contact')).toBe('/contact');
    expect(classifyPageUrl('https://example.com/careers')).toBe('/careers');
  });

  it('treats the root as its own pattern', () => {
    expect(classifyPageUrl('https://example.com/')).toBe('/');
    expect(classifyPageUrl('https://example.com')).toBe('/');
  });

  it('collapses a numeric id segment', () => {
    expect(classifyPageUrl('https://example.com/property/123')).toBe('/property/:1');
    expect(classifyPageUrl('https://example.com/property/456')).toBe('/property/:1');
  });

  it('collapses a UUID segment', () => {
    expect(classifyPageUrl('https://example.com/orders/550e8400-e29b-41d4-a716-446655440000')).toBe('/orders/:1');
  });

  it('collapses a long hyphenated slug but keeps a short one literal', () => {
    expect(classifyPageUrl('https://example.com/blog/how-to-sell-your-house-fast')).toBe('/blog/:1');
    expect(classifyPageUrl('https://example.com/new-developments')).toBe('/new-developments');
  });

  it('classifies each segment of a multi-level dynamic path independently', () => {
    expect(classifyPageUrl('https://example.com/property-for-sale/3-bed-detached-house-leeds')).toBe(
      '/property-for-sale/:1'
    );
  });

  it('ignores the query string when building the pattern', () => {
    expect(classifyPageUrl('https://example.com/search?page=2')).toBe('/search');
    expect(classifyPageUrl('https://example.com/search?page=3')).toBe('/search');
  });
});

describe('classifyPages', () => {
  it('groups distinct static pages into their own single-URL buckets', () => {
    const buckets = classifyPages(['https://example.com/about', 'https://example.com/contact', 'https://example.com/careers']);
    expect(buckets).toHaveLength(3);
    expect(buckets.map((b) => b.pattern).sort()).toEqual(['/about', '/careers', '/contact']);
  });

  it('groups many property detail pages into one bucket', () => {
    const urls = Array.from({ length: 50 }, (_, i) => `https://example.com/property-for-sale/${1000 + i}`);
    const buckets = classifyPages(urls);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].pattern).toBe('/property-for-sale/:1');
    expect(buckets[0].urls).toHaveLength(50);
  });

  it('preserves first-seen bucket order and per-bucket URL order', () => {
    // /b/2's numeric segment is a distinct pattern from bare /b — three buckets, not two.
    const buckets = classifyPages(['https://example.com/b', 'https://example.com/a', 'https://example.com/b/2']);
    expect(buckets.map((b) => b.pattern)).toEqual(['/b', '/a', '/b/:1']);
  });
});

describe('sampleBucket', () => {
  it('returns everything when the bucket is within budget', () => {
    expect(sampleBucket(['a', 'b'], 5)).toEqual(['a', 'b']);
  });

  it('returns an empty array for a non-positive budget', () => {
    expect(sampleBucket(['a', 'b', 'c'], 0)).toEqual([]);
  });

  it('spreads the sample across the whole list rather than taking only the head', () => {
    const urls = Array.from({ length: 10 }, (_, i) => `url-${i}`);
    const sample = sampleBucket(urls, 3);
    expect(sample).toHaveLength(3);
    // Not clustered at the start — the sample should reach into the back half too.
    const indices = sample.map((u) => Number(u.split('-')[1]));
    expect(Math.max(...indices)).toBeGreaterThanOrEqual(6);
  });
});
