import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { serveFixtures, type FixtureServer } from '../../../test/helpers/serveFixtures';
import { discover, drive } from './scroll';

describe('scroll driver', () => {
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

  it('discovers a card-list container by its class-name hint', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${fixture.url}/scroll-target.html`);

    const targets = await discover(page);
    await context.close();

    expect(targets.some((t) => t.selector.includes('property-list') || t.label.includes('property-list'))).toBe(true);
  });

  it('scrolling the target into view triggers its lazy IntersectionObserver push', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${fixture.url}/scroll-target.html`);

    const pushes: string[] = [];
    await page.exposeBinding('reportPush', (_source, event: string) => {
      pushes.push(event);
    });
    await page.evaluate(() => {
      const w = window as unknown as { dataLayer: unknown[] & { push: (...items: unknown[]) => number }; reportPush: (e: string) => void };
      const original = w.dataLayer.push.bind(w.dataLayer);
      w.dataLayer.push = (...items: unknown[]) => {
        for (const item of items) {
          const event = (item as { event?: string }).event;
          if (event) w.reportPush(event);
        }
        return original(...items);
      };
    });

    const [target] = await discover(page);
    expect(target).toBeDefined();

    // Not yet visible — the fixture has a 2000px spacer above the list.
    expect(pushes).not.toContain('view_property_list');

    await drive(page, target);
    await page.waitForTimeout(300);

    await context.close();
    expect(pushes).toContain('view_property_list');
  });
});
