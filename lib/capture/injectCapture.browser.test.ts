import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { serveFixtures, type FixtureServer } from '../../test/helpers/serveFixtures';
import { runCapture } from './injectCapture';

/**
 * The fix this proves: before the exposeBinding rewrite, pushes lived only in a page-side
 * array that page.addInitScript recreates empty on every new document — so anything pushed
 * before a navigation was silently discarded by the time capture finished. This test drives
 * the real production runCapture() across a real full-page navigation (not a mock) and
 * asserts nothing from either document is lost.
 */

describe('runCapture across a full-page navigation', () => {
  let browser: Browser;
  let fixture: FixtureServer;

  beforeAll(async () => {
    browser = await chromium.launch();
    fixture = await serveFixtures();
  });

  afterAll(async () => {
    await browser.close();
    await fixture.close();
  });

  it('keeps pushes from before and after a real navigation, in order', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await runCapture(page, `${fixture.url}/nav-page-1.html`, {
      // Short window: the fixture's debounced second-page push fires at 1200ms, so this
      // just needs to comfortably clear that without waiting for the production 5000ms.
      settleQuietMs: 1500,
      hardTimeoutMs: 10_000,
    });

    await context.close();

    expect(result.timedOut).toBe(false);
    expect(result.events.map((e) => e.event)).toEqual(['nav_page_1_loaded', 'nav_page_2_loaded', 'nav_page_2_debounced']);
  }, 15_000);
});
