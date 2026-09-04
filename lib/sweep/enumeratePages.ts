export interface EnumeratePagesResult {
  urls: string[];
  /** 'sitemap' when sitemap.xml (or an index of sub-sitemaps) yielded at least one URL;
   * 'crawl' when beacon had to fall back to following links from the root page. */
  source: 'sitemap' | 'crawl';
}

export interface EnumeratePagesOptions {
  /** Hard ceiling on distinct URLs returned, from either source. */
  maxUrls?: number;
  /** How many pages the crawl fetches to keep discovering more links. Links found on the
   * last-fetched page are still returned even though beacon doesn't fetch them in turn. */
  maxCrawlFetches?: number;
  /** Hops from the root the crawl will follow before it stops expanding the frontier. */
  maxCrawlDepth?: number;
  /** How many sub-sitemaps a sitemap index will be expanded into. */
  maxSitemapFiles?: number;
  /** Per-request abort timeout. */
  requestTimeoutMs?: number;
  /** Injectable for tests — defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const DEFAULTS = {
  maxUrls: 500,
  maxCrawlFetches: 200,
  maxCrawlDepth: 3,
  maxSitemapFiles: 20,
  requestTimeoutMs: 8000,
};

/** Path extensions that are a link target but never a page beacon should sweep. */
const NON_PAGE_EXTENSIONS = new Set([
  'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'css', 'js', 'json', 'xml',
  'zip', 'doc', 'docx', 'xls', 'xlsx', 'mp4', 'mp3', 'woff', 'woff2', 'ttf',
]);

/**
 * Discovers the set of pages a sweep should visit. Tries sitemap.xml first — cheap, and
 * already the site's own declaration of what it considers a real page — then falls back to
 * a same-origin BFS crawl from the root when no sitemap exists (or it's empty), since a
 * site with no sitemap is not a site with no pages.
 */
export async function enumeratePages(baseUrl: string, options: EnumeratePagesOptions = {}): Promise<EnumeratePagesResult> {
  const opts = { ...DEFAULTS, ...options };
  const fetchImpl = opts.fetchImpl ?? fetch;
  const origin = new URL(baseUrl).origin;

  const sitemapUrls = await fetchSitemapUrls(origin, opts, fetchImpl);
  if (sitemapUrls.length > 0) {
    return { urls: sitemapUrls.slice(0, opts.maxUrls), source: 'sitemap' };
  }

  const crawledUrls = await crawlSameOrigin(baseUrl, opts, fetchImpl);
  return { urls: crawledUrls.slice(0, opts.maxUrls), source: 'crawl' };
}

async function fetchText(url: string, timeoutMs: number, fetchImpl: typeof fetch): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const LOC_PATTERN = /<loc>\s*([^<]+?)\s*<\/loc>/gi;

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(LOC_PATTERN)].map((m) => m[1].trim());
}

/** Handles both a direct <urlset> sitemap and a <sitemapindex> that points at sub-sitemaps
 * (next-sitemap's generateIndexSitemap pattern, and the general convention for large sites). */
async function fetchSitemapUrls(
  origin: string,
  opts: Required<Pick<EnumeratePagesOptions, 'maxSitemapFiles' | 'requestTimeoutMs'>>,
  fetchImpl: typeof fetch
): Promise<string[]> {
  const rootXml = await fetchText(`${origin}/sitemap.xml`, opts.requestTimeoutMs, fetchImpl);
  if (!rootXml) return [];

  const isIndex = /<sitemapindex/i.test(rootXml);
  if (!isIndex) {
    return dedupeSameOrigin(extractLocs(rootXml), origin);
  }

  const subSitemaps = extractLocs(rootXml).slice(0, opts.maxSitemapFiles);
  const urls: string[] = [];
  for (const sitemapUrl of subSitemaps) {
    const xml = await fetchText(sitemapUrl, opts.requestTimeoutMs, fetchImpl);
    if (xml) urls.push(...extractLocs(xml));
  }
  return dedupeSameOrigin(urls, origin);
}

function dedupeSameOrigin(urls: string[], origin: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of urls) {
    const normalized = normalizeUrl(raw, origin);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

/** Same-origin, http(s) only, non-page extensions rejected. */
function normalizeUrl(raw: string, origin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw, origin);
  } catch {
    return null;
  }
  if (parsed.origin !== origin) return null;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const ext = parsed.pathname.split('.').pop()?.toLowerCase();
  if (ext && NON_PAGE_EXTENSIONS.has(ext)) return null;

  parsed.hash = '';
  // Trailing slash stripped so "/about" and "/about/" collapse to one entry — including
  // the root, which normalizes to the bare origin rather than "origin/".
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${path}${parsed.search}`;
}

const HREF_PATTERN = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;

function extractLinks(html: string, pageUrl: string, origin: string): string[] {
  // Relative hrefs resolve against pageUrl, not origin — dedupeSameOrigin only needs
  // origin afterward to filter/dedupe the resolved absolute URLs. A malformed href (stray
  // whitespace, an unencoded character) throws from `new URL` — skip just that one link
  // rather than losing every link found on the page.
  const resolved: string[] = [];
  for (const [, href] of html.matchAll(HREF_PATTERN)) {
    try {
      resolved.push(new URL(href, pageUrl).href);
    } catch {
      // Not a usable link — ignore.
    }
  }
  return dedupeSameOrigin(resolved, origin);
}

async function crawlSameOrigin(
  startUrl: string,
  opts: Required<Pick<EnumeratePagesOptions, 'maxCrawlFetches' | 'maxCrawlDepth' | 'maxUrls' | 'requestTimeoutMs'>>,
  fetchImpl: typeof fetch
): Promise<string[]> {
  const origin = new URL(startUrl).origin;
  const root = normalizeUrl(startUrl, origin) ?? startUrl;

  const discovered = new Set<string>([root]);
  const queue: Array<{ url: string; depth: number }> = [{ url: root, depth: 0 }];
  let fetches = 0;

  while (queue.length > 0 && fetches < opts.maxCrawlFetches && discovered.size < opts.maxUrls) {
    const next = queue.shift()!;
    if (next.depth >= opts.maxCrawlDepth) continue;

    fetches += 1;
    const html = await fetchText(next.url, opts.requestTimeoutMs, fetchImpl);
    if (!html) continue;

    for (const link of extractLinks(html, next.url, origin)) {
      if (discovered.has(link)) continue;
      discovered.add(link);
      queue.push({ url: link, depth: next.depth + 1 });
      if (discovered.size >= opts.maxUrls) break;
    }
  }

  return [...discovered];
}
