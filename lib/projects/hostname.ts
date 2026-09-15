/**
 * The hostname a project match is keyed on — lowercased, no port, exact (no www-stripping,
 * since a project's hostname list is explicit and a staging subdomain like
 * `linleyandsimpson2.q.starberry.com` must stay distinct from anything else under
 * `starberry.com`). Returns null for anything that isn't a parseable absolute URL.
 */
export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}
