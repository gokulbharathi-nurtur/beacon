import type { Page } from 'playwright';

/**
 * Common shape every trigger-specific driver implements, so a caller (RecordFlow, a
 * future sweep integration) can treat "click a link", "scroll a list into view", and
 * "fill a form" uniformly: find candidates on the current page, then act on one.
 * `Result` defaults to void for drivers with nothing to report beyond having run; spa.ts
 * and form.ts use it to report what actually happened (a same-document transition, a
 * gated submit), which the caller needs to interpret the resulting capture correctly.
 */
export interface Driver<Target, Result = void> {
  discover(page: Page): Promise<Target[]>;
  drive(page: Page, target: Target): Promise<Result>;
}
