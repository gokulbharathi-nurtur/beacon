/**
 * Picks up to `maxSamples` URLs from a bucket, spread evenly across it rather than just
 * the first few — a sitemap or crawl order is often clustered (e.g. alphabetical, or by
 * category), so an even spread gives a better-diversified sample for the same budget.
 */
export function sampleBucket(urls: string[], maxSamples: number): string[] {
  if (maxSamples <= 0) return [];
  if (urls.length <= maxSamples) return urls;

  const step = urls.length / maxSamples;
  const sampled: string[] = [];
  for (let i = 0; i < maxSamples; i += 1) {
    sampled.push(urls[Math.floor(i * step)]);
  }
  return sampled;
}
