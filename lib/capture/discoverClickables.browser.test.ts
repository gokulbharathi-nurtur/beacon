import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { serveFixtures, type FixtureServer } from '../../test/helpers/serveFixtures';
import { discoverClickables } from './discoverClickables';

describe('discoverClickables', () => {
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

  it('lists visible buttons, links and pointer elements — and skips hidden / non-clickable ones', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const found = await discoverClickables(page, `${fixture.url}/clickables.html`);
    await context.close();

    const labels = found.map((c) => c.label);
    expect(labels).toContain('Book a viewing');
    expect(labels).toContain('Call the Leeds branch');
    expect(labels).toContain('Save property');
    expect(labels).toContain('Share');
    expect(labels).not.toContain('Never visible');
    expect(labels).not.toContain('Just some text, not clickable');

    const bookViewing = found.find((c) => c.label === 'Book a viewing')!;
    expect(bookViewing.selector).toBe('#book-viewing');
    expect(bookViewing.reason).toBe('semantic');

    const share = found.find((c) => c.label === 'Share')!;
    expect(share.reason).toBe('pointer');
  }, 20_000);

  it('gives two structurally-identical elements in separate containers distinct, individually-resolving selectors', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const found = await discoverClickables(page, `${fixture.url}/clickables-duplicate-structure.html`);

    const a = found.find((c) => c.label === '123 Example Street');
    const b = found.find((c) => c.label === '456 Example Avenue');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a!.selector).not.toBe(b!.selector);

    // Not just different strings — each must resolve to exactly its own element.
    expect(await page.locator(a!.selector).count()).toBe(1);
    expect(await page.locator(b!.selector).count()).toBe(1);
    expect(await page.locator(a!.selector).getAttribute('href')).toBe('/a');
    expect(await page.locator(b!.selector).getAttribute('href')).toBe('/b');

    await context.close();
  }, 20_000);

  it('labels each clickable with its section — landmark tag, or the nearest module classname verbatim', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const found = await discoverClickables(page, `${fixture.url}/clickables-sections.html`);
    await context.close();

    expect(found.find((c) => c.label === 'Home link')?.section).toBe('Header');
    expect(found.find((c) => c.label === 'Footer link')?.section).toBe('Footer');
    // First non-utility class, verbatim — "bg_color_white"/"spacing_top_none" are utility
    // classes and must be skipped in favour of the real module class "image-cards".
    expect(found.find((c) => c.label === 'Module link')?.section).toBe('image-cards');
  }, 20_000);
});
