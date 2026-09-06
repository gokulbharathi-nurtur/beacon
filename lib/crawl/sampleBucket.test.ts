import { describe, expect, it } from 'vitest';
import { sampleBucket } from './sampleBucket';

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
