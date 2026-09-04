export interface CompiledPagePattern {
  /** Original line text (annotations intact), for display next to a match. */
  raw: string;
  test: (url: URL) => boolean;
}

const TRAILING_ETC = /\s+etc\.?\s*$/i;
const TRAILING_PAREN_NOTE = /\s*\([^)]*\)\s*$/;

/**
 * Turns one line of a content-map "pages" cell into a matcher. A line may already be an
 * explicit glob (`/property-for-sale/*`) or a single concrete example URL representing a
 * whole family of pages (`/property-for-sale/4-bedroom-...-51371/ etc.`) — the latter is
 * auto-generalized via looksLikeContentIdentifier below, so a sheet author doesn't have to
 * hand-write a pattern for every detail-page example. Returns null for a blank line
 * (nothing to match).
 */
export function compilePagePattern(rawLine: string): CompiledPagePattern | null {
  const raw = rawLine.trim();
  if (!raw) return null;

  // Human annotations in the source table ("... etc.", "(investment)") describe the row
  // to a reader, not the URL itself — stripped before any pattern logic sees the text.
  const cleaned = raw.replace(TRAILING_PAREN_NOTE, '').replace(TRAILING_ETC, '').trim();
  if (!cleaned) return null;

  const queryIdx = cleaned.indexOf('?');
  const pathPart = queryIdx === -1 ? cleaned : cleaned.slice(0, queryIdx);
  const queryPart = queryIdx === -1 ? null : cleaned.slice(queryIdx + 1);

  const globPath = pathPart.includes('*') ? pathPart : generalizePath(pathPart);
  const pathRegex = globToRegex(normalizePathForMatch(globPath));

  return {
    raw,
    test: (url) => {
      if (!pathRegex.test(normalizePathForMatch(url.pathname))) return false;
      if (queryPart === null) return true;
      // A pattern with a query string only asserts that query is present somewhere in the
      // real URL's search string — real query params can appear in any order or alongside
      // others the sheet doesn't mention.
      return url.search.slice(1).includes(queryPart);
    },
  };
}

/** Strips a trailing slash (but never collapses the bare root) so a pattern authored with
 * or without one, and a real URL with or without one, always compare equal. */
function normalizePathForMatch(path: string): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : withLeadingSlash;
}

/** Collapses a concrete example page into a pattern by replacing per-record-identifier
 * segments with a wildcard. */
function generalizePath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return '/' + segments.map((seg) => (looksLikeContentIdentifier(seg) ? '*' : seg)).join('/');
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A hyphenated slug needs this many words before word-count alone (no digit) is enough to
 * read it as an identifier — see the doc comment below for why. */
const MIN_SLUG_WORD_COUNT = 4;

/**
 * Deliberately more conservative than classifyPages' looksLikeIdentifier
 * (lib/sweep/classifyPages.ts), which this started as a copy of. A false positive there
 * just merges two page types into one sweep bucket — low stakes. A false positive here
 * silently turns an authored content-map row into an unintended catch-all that steals
 * matches from a later, more specific row (e.g. "/our-services/land-and-new-homes/" is a
 * real static route — 4 hyphenated words, "land"/"and"/"new"/"homes" — that used to
 * collapse to "/our-services/*" and swallow every other /our-services/ row below it in the
 * sheet). A real per-record slug (a property listing, a job posting) reliably carries a
 * digit somewhere — bed count, price, postcode, an internal id, as in the reference
 * "4-bedroom-...-raynes-park-london-sw20-51371" example — while a static editorial route
 * name essentially never does, so requiring one for the word-count path rules out static
 * routes without narrowing the case this exists for. Pure numeric segments and UUIDs are
 * unambiguous either way and need no digit check of their own.
 */
function looksLikeContentIdentifier(segment: string): boolean {
  if (/^\d+$/.test(segment)) return true;
  if (UUID_PATTERN.test(segment)) return true;
  if (segment.split('-').length >= MIN_SLUG_WORD_COUNT && /\d/.test(segment)) return true;
  return false;
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export interface CompiledContentRule {
  id: string;
  rowOrder: number;
  rawPagesText: string;
  matchers: CompiledPagePattern[];
  contentGroup: string | null;
  contentId: string | null;
  contentType: string | null;
}

/**
 * First rule (in sheet row order) with any pattern matching the URL wins — lets a sheet
 * author put a specific row ahead of a generic catch-all (e.g. "/property-for-sale/selling/"
 * before "/property-for-sale/*"), the same convention a real routing table would use.
 * Returns null when no rule's patterns match — the URL isn't covered by the reference table.
 */
export function findMatchingRule(url: string, rules: CompiledContentRule[]): CompiledContentRule | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  for (const rule of rules) {
    if (rule.matchers.some((m) => m.test(parsed))) return rule;
  }
  return null;
}
