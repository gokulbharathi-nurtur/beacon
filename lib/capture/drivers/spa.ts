import type { Page } from 'playwright';
import { discoverClickableElements } from '../discoverClickables';
import type { Driver } from './types';

export interface SpaLinkTarget {
  selector: string;
  label: string;
  href: string;
}

export interface SpaDriveResult {
  /** True when the click transitioned without a full document reload — i.e. a client-side
   * router actually intercepted it, which is the thing this driver exists to prove. False
   * means the link fell back to (or always was) a plain navigation. */
  sameDocument: boolean;
}

/**
 * Candidate in-app links a client-side router might intercept: same-origin, and not just
 * a link back to the page we're already on (which proves nothing about client-side
 * routing). Reuses discoverClickableElements rather than re-scanning the DOM — it already
 * finds every `a[href]` with a computed selector, which is all this needs.
 */
async function discover(page: Page): Promise<SpaLinkTarget[]> {
  const elements = await discoverClickableElements(page);
  const currentUrl = new URL(page.url());

  const targets: SpaLinkTarget[] = [];
  for (const el of elements) {
    if (!el.href) continue;
    let resolved: URL;
    try {
      resolved = new URL(el.href, page.url());
    } catch {
      continue;
    }
    if (resolved.origin !== currentUrl.origin) continue;
    if (resolved.href === currentUrl.href) continue;
    targets.push({ selector: el.selector, label: el.label, href: el.href });
  }
  return targets;
}

/**
 * Clicks the link and reports whether the transition stayed client-side. A marker set via
 * a one-off evaluate (not addInitScript) only survives if the same document is still
 * alive afterward — a full reload replaces the document and the marker with it, exactly
 * the signal needed without depending on any capture-layer internals.
 */
async function drive(page: Page, target: SpaLinkTarget): Promise<SpaDriveResult> {
  const marker = `__beaconSpaMarker_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await page.evaluate((key) => {
    (window as unknown as Record<string, unknown>)[key] = true;
  }, marker);

  await page.locator(target.selector).click();

  const sameDocument = await page
    .evaluate((key) => Boolean((window as unknown as Record<string, unknown>)[key]), marker)
    .catch(() => false);

  return { sameDocument };
}

export const spaDriver: Driver<SpaLinkTarget, SpaDriveResult> = { discover, drive };
export { discover, drive };
