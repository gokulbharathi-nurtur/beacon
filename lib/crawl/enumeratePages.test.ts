import { describe, expect, it } from 'vitest';
import { enumeratePages } from './enumeratePages';

/** Builds a fetchImpl backed by a plain url -> response-body map, mimicking fetch's shape
 * closely enough for enumeratePages' fetchText/AbortController usage. Missing urls 404. */
function fakeFetch(pages: Record<string, string>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = pages[url];
    if (body === undefined) {
      return { ok: false, text: async () => '' } as Response;
    }
    return { ok: true, text: async () => body } as Response;
  }) as typeof fetch;
}

describe('enumeratePages', () => {
  it('reads a direct <urlset> sitemap', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com/sitemap.xml': `<?xml version="1.0"?>
        <urlset>
          <url><loc>https://example.com/</loc></url>
          <url><loc>https://example.com/about</loc></url>
          <url><loc>https://example.com/property-for-sale/123</loc></url>
        </urlset>`,
    });

    const result = await enumeratePages('https://example.com/', { fetchImpl });
    expect(result.source).toBe('sitemap');
    expect(result.urls).toEqual(['https://example.com', 'https://example.com/about', 'https://example.com/property-for-sale/123']);
  });

  it('expands a <sitemapindex> into its sub-sitemaps', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com/sitemap.xml': `<sitemapindex>
        <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
        <sitemap><loc>https://example.com/sitemap-properties.xml</loc></sitemap>
      </sitemapindex>`,
      'https://example.com/sitemap-pages.xml': `<urlset><url><loc>https://example.com/about</loc></url></urlset>`,
      'https://example.com/sitemap-properties.xml': `<urlset><url><loc>https://example.com/property/1</loc></url></urlset>`,
    });

    const result = await enumeratePages('https://example.com/', { fetchImpl });
    expect(result.source).toBe('sitemap');
    expect(result.urls.sort()).toEqual(['https://example.com/about', 'https://example.com/property/1']);
  });

  it('deduplicates a trailing-slash variant of the same URL', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com/sitemap.xml': `<urlset>
        <url><loc>https://example.com/about</loc></url>
        <url><loc>https://example.com/about/</loc></url>
      </urlset>`,
    });

    const result = await enumeratePages('https://example.com/', { fetchImpl });
    expect(result.urls).toEqual(['https://example.com/about']);
  });

  it('drops cross-origin and non-page-extension entries from a sitemap', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com/sitemap.xml': `<urlset>
        <url><loc>https://example.com/about</loc></url>
        <url><loc>https://other-site.com/hijacked</loc></url>
        <url><loc>https://example.com/brochure.pdf</loc></url>
      </urlset>`,
    });

    const result = await enumeratePages('https://example.com/', { fetchImpl });
    expect(result.urls).toEqual(['https://example.com/about']);
  });

  it('falls back to crawling from the root when there is no sitemap', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com': `<html><body>
        <a href="/about">About</a>
        <a href="/property/1">Property 1</a>
        <a href="https://other-site.com/x">External</a>
      </body></html>`,
      'https://example.com/about': `<html><body><a href="/">Home</a></body></html>`,
      'https://example.com/property/1': `<html><body><a href="/property/2">Next</a></body></html>`,
    });

    const result = await enumeratePages('https://example.com/', { fetchImpl });
    expect(result.source).toBe('crawl');
    expect(result.urls.sort()).toEqual(['https://example.com', 'https://example.com/about', 'https://example.com/property/1', 'https://example.com/property/2']);
  });

  it('respects maxCrawlDepth — links found past the depth cap are not followed further', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com': `<a href="/depth1">d1</a>`,
      'https://example.com/depth1': `<a href="/depth2">d2</a>`,
      'https://example.com/depth2': `<a href="/depth3">d3</a>`,
    });

    const result = await enumeratePages('https://example.com/', { fetchImpl, maxCrawlDepth: 2 });
    // depth1 (found at depth 1) and depth2 (found at depth 2, from fetching depth1) are
    // discovered; depth2 is at the cap so it is never fetched, so depth3 is never found.
    expect(result.urls.sort()).toEqual(['https://example.com', 'https://example.com/depth1', 'https://example.com/depth2']);
  });

  it('respects maxCrawlFetches — stops expanding once the fetch budget runs out', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com': `<a href="/a">a</a><a href="/b">b</a>`,
      'https://example.com/a': `<a href="/from-a">x</a>`,
      'https://example.com/b': `<a href="/from-b">y</a>`,
    });

    // Only 1 fetch allowed beyond discovery of the root itself — root is fetched, /a and
    // /b are discovered but not fetched, so their children are never found.
    const result = await enumeratePages('https://example.com/', { fetchImpl, maxCrawlFetches: 1 });
    expect(result.urls.sort()).toEqual(['https://example.com', 'https://example.com/a', 'https://example.com/b']);
  });

  it('caps total URLs returned at maxUrls for either source', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com/sitemap.xml': `<urlset>
        <url><loc>https://example.com/1</loc></url>
        <url><loc>https://example.com/2</loc></url>
        <url><loc>https://example.com/3</loc></url>
      </urlset>`,
    });

    const result = await enumeratePages('https://example.com/', { fetchImpl, maxUrls: 2 });
    expect(result.urls).toHaveLength(2);
  });

  it('handles a malformed href without losing the rest of the page', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com': `<a href="/good">ok</a><a href="http://">bad</a>`,
    });

    const result = await enumeratePages('https://example.com/', { fetchImpl });
    expect(result.urls).toContain('https://example.com/good');
  });
});
