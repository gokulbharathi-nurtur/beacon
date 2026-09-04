import type { Page } from 'playwright';
import type { Driver } from './types';

export interface ScrollTarget {
  selector: string;
  label: string;
}

const MIN_REPEATED_CHILDREN = 3;
const MAX_TARGETS = 10;

/**
 * Runs inside the browser via page.evaluate — self-contained per the same constraint as
 * discoverClickablesScript in discoverClickables.ts: Playwright serializes this via
 * toString(), so it cannot close over anything from the calling scope, and needs its own
 * (deliberately simpler) copy of selector computation rather than importing
 * discoverClickables.ts's — a scroll target only ever needs id/data-testid/nth-of-type,
 * none of the click-specific role/aria-label fallbacks that exist there for button/link
 * disambiguation.
 *
 * List containers (property search results, a card grid) aren't interactive elements, so
 * discoverClickableElements can't find them — this scans for two independent signals:
 * an explicit naming hint (class/id/data-testid containing "list", "grid", "results", …)
 * or, failing that, a structural one (many same-tag children, the shape a repeated card
 * list actually has). Either alone is enough; requiring both would miss containers that
 * are unlabeled but obviously list-shaped, or labeled but with mixed child markup.
 */
function discoverScrollTargetsScript(opts: { minRepeatedChildren: number; maxTargets: number }): { selector: string; label: string }[] {
  const { minRepeatedChildren, maxTargets } = opts;
  const NAME_HINT = /list|grid|results|properties|cards|carousel|gallery/i;

  function cssEscape(value: string): string {
    return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function computeSelector(el: Element): string {
    if (el.id) {
      const candidate = `#${cssEscape(el.id)}`;
      if (document.querySelectorAll(candidate).length === 1) return candidate;
    }
    for (const attr of ['data-testid', 'data-test', 'data-cy']) {
      const value = el.getAttribute(attr);
      if (value) {
        const candidate = `[${attr}="${cssEscape(value)}"]`;
        if (document.querySelectorAll(candidate).length === 1) return candidate;
      }
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

  function classNameOf(el: Element): string {
    // SVGAnimatedString on SVG elements doesn't stringify usefully — only HTML elements'
    // plain-string className is worth reading here.
    return typeof el.className === 'string' ? el.className : '';
  }

  function buildLabel(el: Element): string {
    const hint =
      el.getAttribute('aria-label') ||
      el.getAttribute('data-testid') ||
      classNameOf(el)
        .split(/\s+/)
        .find((c) => NAME_HINT.test(c)) ||
      '';
    return (hint || el.tagName.toLowerCase()).slice(0, 80);
  }

  const candidates: Element[] = [];
  const seen = new Set<Element>();

  document.querySelectorAll('[class], [id], [data-testid]').forEach((el) => {
    const haystack = `${classNameOf(el)} ${el.id} ${el.getAttribute('data-testid') ?? ''}`;
    if (NAME_HINT.test(haystack) && el.children.length >= minRepeatedChildren) {
      candidates.push(el);
      seen.add(el);
    }
  });

  // Structural fallback — same-tag children repeated enough times to look like a card
  // list rather than incidental markup. Scans every element, so on a very large page this
  // is the most expensive part of discovery; acceptable for a sweep's per-page budget.
  document.querySelectorAll('body *').forEach((el) => {
    if (seen.has(el) || el.children.length < minRepeatedChildren) return;
    const tagCounts = new Map<string, number>();
    Array.from(el.children).forEach((c) => tagCounts.set(c.tagName, (tagCounts.get(c.tagName) ?? 0) + 1));
    if (Math.max(...tagCounts.values()) >= minRepeatedChildren) {
      candidates.push(el);
      seen.add(el);
    }
  });

  return candidates.slice(0, maxTargets).map((el) => ({ selector: computeSelector(el), label: buildLabel(el) }));
}

async function discover(page: Page): Promise<ScrollTarget[]> {
  return page.evaluate(discoverScrollTargetsScript, { minRepeatedChildren: MIN_REPEATED_CHILDREN, maxTargets: MAX_TARGETS });
}

async function drive(page: Page, target: ScrollTarget): Promise<void> {
  await page.locator(target.selector).scrollIntoViewIfNeeded();
}

export const scrollDriver: Driver<ScrollTarget> = { discover, drive };
export { discover, drive };
