import type { Page } from 'playwright';
import { discoverClickableElements } from '../discoverClickables';
import type { Driver } from './types';

export interface CarouselControlTarget {
  selector: string;
  label: string;
}

/**
 * Matches the accessible label real carousel/gallery/accordion controls tend to carry —
 * "Next slide", "Previous", "View gallery", "Expand details" — whether that label comes
 * from visible text or an aria-label on an icon-only button. Doesn't see class names
 * (discoverClickableElements's ClickableElement doesn't carry them), so an icon button
 * with neither text nor an aria-label won't be found this way; that's a known gap, not a
 * silent failure — such a button already fails an accessibility check on its own merits.
 */
const CONTROL_HINT_PATTERN = /\b(next|prev(ious)?|slide|carousel|gallery|accordion|expand|collapse|show more|read more)\b/i;

/** Filters the elements the sweep already discovers down to ones that look like carousel
 * or accordion controls — no separate DOM scan needed, since discoverClickableElements
 * already did the real work (selector computation, visibility filtering) once. */
async function discover(page: Page): Promise<CarouselControlTarget[]> {
  const elements = await discoverClickableElements(page);
  return elements.filter((el) => CONTROL_HINT_PATTERN.test(el.label)).map((el) => ({ selector: el.selector, label: el.label }));
}

async function drive(page: Page, target: CarouselControlTarget): Promise<void> {
  await page.locator(target.selector).click();
}

export const carouselDriver: Driver<CarouselControlTarget> = { discover, drive };
export { discover, drive };
