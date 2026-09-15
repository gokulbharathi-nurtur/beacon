/**
 * A short, human label for a run when the user didn't type one. Uses the first up-to-two
 * path segments, hyphens turned to spaces and title-cased; a segment that looks like a
 * per-record slug (has a digit, is very long, or is many words) collapses to "Details".
 * Falls back to the hostname for the site root.
 *
 *   /our-services/                              -> "Our Services"
 *   /our-services/furnishing-solutions/         -> "Our Services - Furnishing Solutions"
 *   /property/for-sale/in-south-east-england/   -> "Property - For Sale"
 *   /property-for-sale/4-bedroom-...-so51/      -> "Property For Sale - Details"
 *   /area-guides/alresford                      -> "Area Guides - Alresford"
 *   /                                           -> "Homepage"
 */
export function deriveRunName(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const segments = parsed.pathname.split('/').map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return 'Homepage';

  const parts = segments.slice(0, 2).map((seg) => (looksLikeRecordSlug(seg) ? 'Details' : titleCaseSlug(seg)));
  // Never "Details - Details".
  const collapsed = parts.filter((p, i) => !(p === 'Details' && parts[i - 1] === 'Details'));
  return collapsed.join(' - ');
}

function looksLikeRecordSlug(seg: string): boolean {
  if (/\d/.test(seg)) return true;
  if (seg.length > 40) return true;
  return seg.split('-').filter(Boolean).length >= 5;
}

function titleCaseSlug(seg: string): string {
  return seg
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
