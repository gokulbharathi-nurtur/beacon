import type { Page } from 'playwright';
import type { Driver } from './types';

export type FormFieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox' | 'radio';

export interface FormFieldTarget {
  selector: string;
  name: string;
  fieldType: FormFieldType;
  required: boolean;
}

export interface FormTarget {
  selector: string;
  label: string;
  fields: FormFieldTarget[];
  submitSelector: string | null;
  /**
   * Always false out of discover() — sending a real submission to a real site (a real
   * enquiry, a real valuation request) is exactly the kind of hard-to-reverse, external
   * side effect this tool should never cause by default. A caller must explicitly set
   * this to true on a specific target it has independent authorization to submit (a
   * staging host, a form on an allowlist a human configured); drive() only ever clicks
   * the submit control when it sees this already set to true on the target it was given.
   */
  allowSubmit: boolean;
}

export interface FormDriveResult {
  filled: boolean;
  submitted: boolean;
}

interface RawFormTarget {
  selector: string;
  label: string;
  fields: { selector: string; name: string; fieldType: FormFieldType; required: boolean }[];
  submitSelector: string | null;
}

/**
 * Runs inside the browser via page.evaluate — self-contained per the same constraint as
 * every other in-page script in lib/capture/ (Playwright serializes via toString(), so it
 * cannot close over anything from the calling scope). Password fields are deliberately
 * excluded: this driver targets enquiry/valuation/contact-style forms, and there is no
 * value (only confusion) in typing a fake password into an unrelated login form.
 */
function discoverFormsScript(): RawFormTarget[] {
  function cssEscape(value: string): string {
    return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function computeSelector(el: Element): string {
    if (el.id) {
      const candidate = `#${cssEscape(el.id)}`;
      if (document.querySelectorAll(candidate).length === 1) return candidate;
    }
    const name = el.getAttribute('name');
    if (name) {
      const candidate = `[name="${cssEscape(name)}"]`;
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

  function isVisible(el: Element): boolean {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function fieldType(el: Element): FormFieldType | null {
    if (el.tagName === 'TEXTAREA') return 'textarea';
    if (el.tagName === 'SELECT') return 'select';
    if (el.tagName !== 'INPUT') return null;

    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'password', 'file', 'image'].includes(type)) return null;
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'email') return 'email';
    if (type === 'tel') return 'tel';
    return 'text';
  }

  return Array.from(document.querySelectorAll('form'))
    .map((form, formIndex) => {
      const fields = Array.from(form.querySelectorAll('input, select, textarea'))
        .filter(isVisible)
        .map((el) => {
          const type = fieldType(el);
          if (!type) return null;
          return {
            selector: computeSelector(el),
            name: el.getAttribute('name') || el.id || `field_${formIndex}`,
            fieldType: type,
            required: el.hasAttribute('required'),
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null);

      const submitEl = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');

      return {
        selector: computeSelector(form),
        label: form.getAttribute('aria-label') || form.id || form.getAttribute('name') || `Form ${formIndex + 1}`,
        fields,
        submitSelector: submitEl ? computeSelector(submitEl) : null,
      };
    })
    .filter((f) => f.fields.length > 0);
}

async function discover(page: Page): Promise<FormTarget[]> {
  const raw = await page.evaluate(discoverFormsScript);
  return raw.map((form) => ({ ...form, allowSubmit: false }));
}

/** Per-field test values. Keyed by name/id keyword rather than by exact field name, since
 * sites don't agree on naming — "postcode", "post_code", and "zip" all mean the same
 * thing to a form. Order matters: more specific patterns (first/last name) are checked
 * before the generic "name" catch-all so they win. */
const NAME_HINTS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /postcode|zip/i, value: 'SW1A 1AA' },
  { pattern: /first.?name|fname/i, value: 'Beacon' },
  { pattern: /last.?name|lname|surname/i, value: 'Test' },
  { pattern: /name/i, value: 'Beacon Test' },
  { pattern: /message|comment|enquiry|notes?/i, value: 'This is an automated test submission from Beacon — please disregard.' },
];
const DEFAULT_TEXT_VALUE = 'Beacon test value';

function pickValue(field: FormFieldTarget): string {
  if (field.fieldType === 'email') return 'beacon-test@example.com';
  if (field.fieldType === 'tel') return '07700 900000';
  return NAME_HINTS.find((hint) => hint.pattern.test(field.name))?.value ?? DEFAULT_TEXT_VALUE;
}

/**
 * Fills every field via Playwright's locator API (fill/selectOption/check), not a raw
 * page.evaluate DOM write — a React-controlled input only picks up a value through the
 * native input/change events Playwright's fill() dispatches; setting `.value` directly in
 * page-evaluated script leaves React's own state stale even though the DOM shows the
 * typed value. Only submits when the caller has already set target.allowSubmit — see the
 * doc comment on FormTarget for why that defaults closed.
 */
async function drive(page: Page, target: FormTarget): Promise<FormDriveResult> {
  for (const field of target.fields) {
    const locator = page.locator(field.selector);
    switch (field.fieldType) {
      case 'text':
      case 'email':
      case 'tel':
      case 'textarea':
        await locator.fill(pickValue(field));
        break;
      case 'select':
        // Index 1 first: index 0 is very often a disabled "Please select…" placeholder.
        // Falls back to index 0 for a genuinely single-option select.
        await locator.selectOption({ index: 1 }).catch(() => locator.selectOption({ index: 0 }).catch(() => {}));
        break;
      case 'checkbox':
        // Only ticks a checkbox the form actually requires to submit (typically "I agree
        // to the terms") — never an optional one (typically marketing consent), which
        // this tool has no business opting a test run into.
        if (field.required) await locator.check();
        break;
      case 'radio':
        // Each radio in a group is discovered as its own field target, so a group of N
        // options gets N redundant check() calls here; harmless (radios are mutually
        // exclusive, so the last one processed simply wins) and not worth deduping for
        // what is otherwise an arbitrary choice of option anyway.
        await locator.check();
        break;
    }
  }

  if (target.allowSubmit && target.submitSelector) {
    await page.locator(target.submitSelector).click();
    return { filled: true, submitted: true };
  }
  return { filled: true, submitted: false };
}

export const formDriver: Driver<FormTarget, FormDriveResult> = { discover, drive };
export { discover, drive };
