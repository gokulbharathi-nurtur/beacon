export interface PageBucket {
  /** Normalized URL shape used as the bucket key, e.g. "/property-for-sale/:1". */
  pattern: string;
  urls: string[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * A hyphenated slug reads as a per-record identifier once it strings together enough
 * words to be describing something specific ("how-to-sell-your-house-fast",
 * "3-bed-detached-house-leeds"), as opposed to a fixed multi-word route name
 * ("property-for-sale", "new-developments", "guides-and-resources") — those stay under
 * this count in practice. Length alone doesn't work as the signal: "property-for-sale" is
 * already 17 characters despite being a completely static route.
 */
const MIN_SLUG_WORD_COUNT = 4;

/**
 * Whether a single path segment looks like a per-record identifier rather than a fixed
 * route name. Content-based rather than population-based (comparing siblings would need
 * the whole URL set and still can't tell "/about" from a 3-post blog apart from "/blog"
 * having 3 children too) — a numeric id, a UUID, or a long hyphenated slug is what real
 * CMS/e-commerce routing actually produces for dynamic segments, and short static words
 * like "about" or "careers" reliably don't match any of the three.
 */
export function looksLikeIdentifier(segment: string): boolean {
  if (/^\d+$/.test(segment)) return true;
  if (UUID_PATTERN.test(segment)) return true;
  if (segment.split('-').length >= MIN_SLUG_WORD_COUNT) return true;
  return false;
}

/** The bucket key for one URL — pure function of that URL alone, so unlike a
 * population-based grouper it needs no pass over the rest of the set first. */
export function classifyPageUrl(url: string): string {
  const { pathname } = new URL(url);
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/';

  return '/' + segments.map((seg, i) => (looksLikeIdentifier(seg) ? `:${i}` : seg)).join('/');
}

/** Groups a flat list of URLs into page-type buckets by shared pattern. Insertion order
 * within a bucket is preserved from the input, and buckets appear in first-seen order. */
export function classifyPages(urls: string[]): PageBucket[] {
  const byPattern = new Map<string, string[]>();
  for (const url of urls) {
    const pattern = classifyPageUrl(url);
    const bucket = byPattern.get(pattern);
    if (bucket) bucket.push(url);
    else byPattern.set(pattern, [url]);
  }
  return [...byPattern.entries()].map(([pattern, bucketUrls]) => ({ pattern, urls: bucketUrls }));
}

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
