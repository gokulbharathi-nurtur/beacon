import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { serveFixtures, type FixtureServer } from '../../../test/helpers/serveFixtures';
import { runCapture } from '../injectCapture';
import { discover, drive } from './carousel';

describe('carousel driver', () => {
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

  it('finds the aria-labeled "Next slide" control but not an unrelated button', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${fixture.url}/carousel-target.html`);

    const targets = await discover(page);
    await context.close();

    expect(targets.map((t) => t.label)).toContain('Next slide');
    expect(targets.map((t) => t.label)).not.toContain('Save changes');
  });

  it('driving the control clicks it, via runCapture\'s interact hook', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${fixture.url}/carousel-target.html`);
    const [target] = await discover(page);
    await context.close();

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    const result = await runCapture(page2, `${fixture.url}/carousel-target.html`, {
      settleQuietMs: 500,
      interact: (p) => drive(p, target),
    });
    await context2.close();

    expect(result.events.map((e) => e.event)).toEqual(['carousel_scroll']);
  });
});
