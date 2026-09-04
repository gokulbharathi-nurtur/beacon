import type { Page } from 'playwright';

export interface ClickableElement {
  selector: string;
  tag: string;
  label: string;
  href?: string;
}

const DEFAULT_MAX_ELEMENTS = 150;

/**
 * Runs inside the browser via page.evaluate, so — like captureInitScript in
 * injectCapture.ts — it must be self-contained: Playwright serializes it via toString(),
 * so it cannot close over anything from the calling scope. Helper functions are nested
 * inside for the same reason.
 */
function discoverClickablesScript(maxElements: number): ClickableElement[] {
  function isVisible(el: Element): boolean {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function cssEscape(value: string): string {
    return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  // Tries progressively less-stable strategies, keeping the first that resolves to
  // exactly one element. The nth-of-type fallback is deliberately last: unlike the
  // others, it doesn't fail loud when the DOM changes before a later capture load — it
  // can silently resolve to a *different* element at the same structural position.
  function computeSelector(el: Element): string {
    for (const attr of ['data-testid', 'data-test', 'data-cy']) {
      const value = el.getAttribute(attr);
      if (value) {
        const candidate = `[${attr}="${cssEscape(value)}"]`;
        if (document.querySelectorAll(candidate).length === 1) return candidate;
      }
    }

    if (el.id) {
      const candidate = `#${cssEscape(el.id)}`;
      if (document.querySelectorAll(candidate).length === 1) return candidate;
    }

    if (el.tagName === 'A') {
      const href = el.getAttribute('href');
      if (href) {
        const candidate = `a[href="${cssEscape(href)}"]`;
        if (document.querySelectorAll(candidate).length === 1) return candidate;
      }
    }

    const role = el.getAttribute('role') ?? (el.tagName === 'BUTTON' ? 'button' : el.tagName === 'A' ? 'link' : null);
    const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
    if (role && name) {
      return `role=${role}[name="${name.replace(/"/g, '\\"')}"]`;
    }

    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node !== document.body && node.parentElement) {
      const current: Element = node;
      const parent: Element = node.parentElement;
      const siblings = Array.from(parent.children).filter((c) => c.tagName === current.tagName);
      parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`);
      node = parent;
    }
    parts.unshift('body');
    return parts.join(' > ');
  }

  function buildLabel(el: Element): string {
    const text = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
    return (text.length > 0 ? text : el.tagName.toLowerCase()).slice(0, 80);
  }

  const candidates = new Set<Element>();
  document.querySelectorAll('button, a[href], [role="button"], [onclick], [tabindex]').forEach((el) => candidates.add(el));

  // Only pay for a computed-style read on elements the cheap attribute selectors above
  // didn't already catch — getComputedStyle forces a style recalc per call.
  const cheapMatches = candidates;
  document.querySelectorAll('*').forEach((el) => {
    if (cheapMatches.has(el)) return;
    if (window.getComputedStyle(el).cursor === 'pointer') candidates.add(el);
  });

  const results: ClickableElement[] = [];
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    results.push({
      selector: computeSelector(el),
      tag: el.tagName.toLowerCase(),
      label: buildLabel(el),
      href: el.tagName === 'A' ? (el.getAttribute('href') ?? undefined) : undefined,
    });
    if (results.length >= maxElements) break;
  }
  return results;
}

export async function discoverClickableElements(page: Page, maxElements = DEFAULT_MAX_ELEMENTS): Promise<ClickableElement[]> {
  return page.evaluate(discoverClickablesScript, maxElements);
}

export interface ClickTargetDescription {
  label: string;
  href?: string;
  /** How many elements the selector currently resolves to — 1 is healthy; 0 means the
   * element is gone, >1 means it has become ambiguous. Either is drift worth surfacing. */
  resolvedCount: number;
}

/** Truncation length and aria-label-or-text fallback intentionally mirror `buildLabel`
 * inside discoverClickablesScript above — same rule, applied here via Playwright's locator
 * API instead of an injected script, since this runs against an already-loaded page rather
 * than needing to be serialized for addInitScript/evaluate. */
const LABEL_MAX_LENGTH = 80;

/**
 * Re-resolves a stored selector against the *current* DOM, e.g. right before runCapture
 * clicks it. Uses page.locator() rather than document.querySelectorAll so it also handles
 * Playwright's own selector engines (computeSelector's `role=button[name="..."]` fallback),
 * which raw DOM APIs can't parse at all.
 */
export async function describeClickTarget(page: Page, selector: string): Promise<ClickTargetDescription | null> {
  const locator = page.locator(selector);
  const resolvedCount = await locator.count();
  if (resolvedCount === 0) return null;

  const first = locator.first();
  const [ariaLabel, text, tagName, href] = await Promise.all([
    first.getAttribute('aria-label'),
    first.textContent(),
    first.evaluate((el) => el.tagName),
    first.getAttribute('href'),
  ]);
  const raw = (ariaLabel ?? text ?? '').trim().replace(/\s+/g, ' ');

  return {
    label: (raw.length > 0 ? raw : tagName.toLowerCase()).slice(0, LABEL_MAX_LENGTH),
    href: tagName === 'A' && href ? href : undefined,
    resolvedCount,
  };
}
