export class InvalidTargetUrlError extends Error {}

/**
 * Rejects anything that isn't http(s). Optionally enforces a hostname allow-list via
 * ALLOWED_URL_HOSTS (comma-separated) — left unset by default so localhost/dev URLs keep
 * working; the team can turn it on once their domains are known.
 */
export function assertValidTargetUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new InvalidTargetUrlError('Not a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidTargetUrlError('Only http:// and https:// URLs are allowed.');
  }

  const allowList = (process.env.ALLOWED_URL_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

  if (allowList.length > 0 && !allowList.includes(url.hostname)) {
    throw new InvalidTargetUrlError(`Host "${url.hostname}" is not in the allowed hosts list.`);
  }

  return url;
}
