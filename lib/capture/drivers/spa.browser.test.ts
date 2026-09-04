import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { serveFixtures, type FixtureServer } from '../../../test/helpers/serveFixtures';
import { runCapture } from '../injectCapture';
import { discover, drive } from './spa';

describe('spa driver', () => {
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

  it('discovers same-origin links other than the current page', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${fixture.url}/spa-site/index.html`);

    const targets = await discover(page);
    await context.close();

    expect(targets.map((t) => t.label).sort()).toEqual(['Client-side nav', 'Hard nav']);
  });

  it('reports sameDocument true for a pushState-based client-side transition', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${fixture.url}/spa-site/index.html`);
    const targets = await discover(page);
    const spaLink = targets.find((t) => t.label === 'Client-side nav')!;

    const result = await drive(page, spaLink);
    await context.close();

    expect(result.sameDocument).toBe(true);
  });

  it('reports sameDocument false for a real navigation', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${fixture.url}/spa-site/index.html`);
    const targets = await discover(page);
    const hardLink = targets.find((t) => t.label === 'Hard nav')!;

    const result = await drive(page, hardLink);
    await context.close();

    expect(result.sameDocument).toBe(false);
  });

  it('captures both the pre- and post-transition page_loaded through runCapture', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const targetsPage = await context.newPage();
    await targetsPage.goto(`${fixture.url}/spa-site/index.html`);
    const targets = await discover(targetsPage);
    const spaLink = targets.find((t) => t.label === 'Client-side nav')!;
    await targetsPage.close();

    const result = await runCapture(page, `${fixture.url}/spa-site/index.html`, {
      settleQuietMs: 500,
      interact: (p) => drive(p, spaLink).then(() => undefined),
    });
    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['page_loaded', 'page_loaded']);
    expect(result.eventsAfterInteractionIndex).toBe(1);
  });
});
