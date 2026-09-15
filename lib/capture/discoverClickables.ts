import type { Page } from 'playwright';
import { acceptConsentBanner, CONSENT_ACCEPT_TIMEOUT_MS } from './injectCapture';

/** One clickable element found on a page — the raw material for choosing click steps. */
export interface Clickable {
  /** Visible text (or aria-label / title / href when there's no text), trimmed + truncated. */
  label: string;
  /** Lowercase tag name, e.g. 'a', 'button', 'div'. */
  tag: string;
  /** ARIA role attribute if set. */
  role: string | null;
  /** Best-effort unique CSS selector for the element on this page. */
  selector: string;
  /** href for anchors, else null. */
  href: string | null;
  /** Why it was picked up: a real interactive element, or just `cursor: pointer`. */
  reason: 'semantic' | 'pointer';
  /**
   * Where on the page this lives — "Header"/"Footer"/"Navigation"/"Sidebar" for a
   * landmark ancestor, else the nearest ancestor's own module/section classname
   * (verbatim, e.g. "image-cards"), else "Other".
   */
  section: string;
}

export interface DiscoverOptions {
  navTimeoutMs?: number;
  /** Extra settle after networkidle before scanning the DOM. */
  settleMs?: number;
  /** Hard cap on how many elements to return. */
  max?: number;
}

/**
 * Loads a page, accepts its cookie banner, and returns the elements a visitor could click —
 * every semantic control (`a`, `button`, `[role=button]`, …) plus anything the page styles
 * with `cursor: pointer`. Used to let a human pick click steps from a real list instead of
 * typing selectors.
 */
export async function discoverClickables(page: Page, url: string, opts: DiscoverOptions = {}): Promise<Clickable[]> {
  const navTimeoutMs = opts.navTimeoutMs ?? 30_000;
  const max = opts.max ?? 80;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeoutMs });
  await acceptConsentBanner(page, CONSENT_ACCEPT_TIMEOUT_MS);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(opts.settleMs ?? 500);

  const raw: Clickable[] = await page.evaluate((maxItems) => {
    const cssEscape = (s: string) =>
      window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);

    // Short, readable, class-based climb — cheap and works for the vast majority of
    // controls, but capped at 6 ancestor levels so it can bottom out without ever
    // confirming the result is actually unique on the page.
    function smartPath(node: Element): string {
      const parts: string[] = [];
      let cur: Element | null = node;
      while (cur && cur.nodeType === 1 && parts.length < 6) {
        let sel = cur.nodeName.toLowerCase();
        const classes = Array.from(cur.classList)
          .filter((c) => !/(^|-)(active|open|hover|focus|selected|current|is-|has-|js-)/i.test(c))
          .slice(0, 2);
        if (classes.length) sel += '.' + classes.map(cssEscape).join('.');
        const parent: Element | null = cur.parentElement;
        if (parent) {
          const sibs = Array.from(parent.children).filter((c) => c.nodeName === cur!.nodeName);
          if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
        }
        parts.unshift(sel);
        try {
          if (document.querySelectorAll(parts.join(' > ')).length === 1) break;
        } catch {
          break;
        }
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    }

    // Unconditional nth-of-type chain from <body> down to the node — no early exit, no
    // class shortcuts. Sibling order is always well-defined, so this always identifies
    // exactly one element; used only when smartPath can't confirm uniqueness (e.g. two
    // structurally-identical repeated blocks — two carousels sharing the same card
    // markup — deeper than smartPath's cap).
    function absolutePath(node: Element): string {
      const parts: string[] = [];
      let cur: Element | null = node;
      while (cur && cur !== document.body && cur.parentElement) {
        const parent: Element = cur.parentElement;
        const sibs = Array.from(parent.children).filter((c) => c.nodeName === cur!.nodeName);
        const sel = cur.nodeName.toLowerCase() + (sibs.length > 1 ? ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')' : '');
        parts.unshift(sel);
        cur = parent;
      }
      parts.unshift('body');
      return parts.join(' > ');
    }

    function uniquePath(node: Element): string {
      if (node.id && document.querySelectorAll('#' + cssEscape(node.id)).length === 1) {
        return '#' + cssEscape(node.id);
      }
      const smart = smartPath(node);
      try {
        if (smart && document.querySelectorAll(smart).length === 1) return smart;
      } catch {
        /* fall through to the guaranteed-unique path */
      }
      return absolutePath(node);
    }

    // Style-utility class prefixes/names — never a meaningful section/module name, even
    // though they're often the *first* class on an element (e.g. "bg_color_white
    // spacing_top_none" ahead of the real module class "image-cards").
    const UTILITY_CLASS = /^(bg[-_]|color[-_]|text[-_]|spacing[-_]|margin[-_]|padding[-_]|border[-_]|d[-_](flex|none|block|grid|inline)|col(-\d+)?$|row$|container(-fluid)?$|wrapper$|is[-_]|has[-_]|js[-_]|active$|hidden$|visible$)/i;

    function sectionFor(node: Element): string {
      let cur: Element | null = node.parentElement;
      let moduleGuess: string | null = null;
      let depth = 0;
      while (cur && cur !== document.body && depth < 12) {
        const tag = cur.nodeName.toLowerCase();
        if (tag === 'header') return 'Header';
        if (tag === 'footer') return 'Footer';
        if (tag === 'nav') return 'Navigation';
        if (tag === 'aside') return 'Sidebar';
        if (!moduleGuess) {
          const cls = Array.from(cur.classList).find((c) => c.length > 2 && !UTILITY_CLASS.test(c));
          if (cls) moduleGuess = cls;
        }
        cur = cur.parentElement;
        depth++;
      }
      return moduleGuess ?? 'Other';
    }

    function labelFor(el: Element): string {
      const text = ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) return text.slice(0, 80);
      const attr =
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el as HTMLInputElement).value ||
        '';
      return attr.replace(/\s+/g, ' ').trim().slice(0, 80);
    }

    function visible(el: Element): boolean {
      if (!el.getClientRects().length) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0;
    }

    const seen = new Set<Element>();
    const out: Clickable[] = [];

    function consider(el: Element, reason: 'semantic' | 'pointer') {
      if (seen.has(el) || !visible(el)) return;
      const label = labelFor(el);
      const href = el.getAttribute('href');
      if (!label && !href) return;
      if (label.length > 80) return;
      seen.add(el);
      out.push({
        label: label || href || '',
        tag: el.nodeName.toLowerCase(),
        role: el.getAttribute('role'),
        selector: uniquePath(el),
        href: href || null,
        reason,
        section: sectionFor(el),
      });
    }

    document
      .querySelectorAll(
        'a[href], button, [role="button"], [role="link"], [role="menuitem"], [role="tab"], input[type="submit"], input[type="button"], [onclick]'
      )
      .forEach((el) => consider(el, 'semantic'));

    if (out.length < maxItems) {
      const all = document.querySelectorAll('body *');
      for (let i = 0; i < all.length && out.length < maxItems; i++) {
        const el = all[i];
        if (seen.has(el)) continue;
        if (getComputedStyle(el).cursor !== 'pointer') continue;
        // Skip pointer wrappers that contain an element we've already listed.
        let containsListed = false;
        for (const s of seen) {
          if (el !== s && el.contains(s)) {
            containsListed = true;
            break;
          }
        }
        if (containsListed) continue;
        consider(el, 'pointer');
      }
    }

    return out;
  }, max);

  // Collapse repeats (a search page has one "Book a viewing" per card) and rank the real
  // controls above pointer-only guesses. Section is part of the key so the same label in
  // two different sections (a nav "Book a viewing" vs. one in page content) stays distinct.
  const byLabel = new Map<string, Clickable>();
  for (const c of raw) {
    const key = `${c.reason === 'semantic' ? 's' : 'p'}|${c.tag}|${c.section}|${c.label.toLowerCase()}`;
    if (!byLabel.has(key)) byLabel.set(key, c);
  }
  return [...byLabel.values()]
    .sort((a, b) => (a.reason === b.reason ? 0 : a.reason === 'semantic' ? -1 : 1))
    .slice(0, max);
}
