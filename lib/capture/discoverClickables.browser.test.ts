import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { serveFixtures, type FixtureServer } from '../../test/helpers/serveFixtures';
import { describeClickTarget } from './discoverClickables';

describe('describeClickTarget', () => {
  let browser: Browser;
  let fixture: FixtureServer;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    fixture = await serveFixtures();
    page = await browser.newPage();
    await page.goto(`${fixture.url}/click-target.html`);
  });

  afterAll(async () => {
    await browser.close();
    await fixture.close();
  });

  it('resolves a unique button to its text label with no href', async () => {
    const result = await describeClickTarget(page, '#unique-btn');
    expect(result).toEqual({ label: 'Save changes', href: undefined, resolvedCount: 1 });
  });

  it('resolves a unique link to its text label and href', async () => {
    const result = await describeClickTarget(page, '#unique-link');
    expect(result).toEqual({ label: 'Read the docs', href: '/docs', resolvedCount: 1 });
  });

  it('reports resolvedCount 0 as null — nothing to describe', async () => {
    const result = await describeClickTarget(page, '#does-not-exist');
    expect(result).toBeNull();
  });

  it('reports an ambiguous selector via resolvedCount, describing the first match', async () => {
    const result = await describeClickTarget(page, '.dup');
    expect(result?.resolvedCount).toBe(2);
    expect(result?.label).toBe('Click me');
  });
});
