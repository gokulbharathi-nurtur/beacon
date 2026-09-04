import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { serveFixtures, type FixtureServer } from '../../../test/helpers/serveFixtures';
import { runCapture } from '../injectCapture';
import { discover, drive } from './form';

describe('form driver', () => {
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

  it('discovers the form, its fillable fields, and its submit control', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${fixture.url}/form-target.html`);

    const [target] = await discover(page);
    await context.close();

    expect(target).toBeDefined();
    expect(target.allowSubmit).toBe(false);
    expect(target.submitSelector).not.toBeNull();
    // Hidden and submit inputs are excluded — only genuinely fillable fields are targets.
    const names = target.fields.map((f) => f.name).sort();
    expect(names).toEqual(['agree_terms', 'branch', 'email', 'first_name', 'last_name', 'message', 'newsletter', 'phone']);
  });

  it('fills every field type without submitting by default', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${fixture.url}/form-target.html`);
    const [target] = await discover(page);

    const result = await drive(page, target);

    expect(result).toEqual({ filled: true, submitted: false });
    expect(await page.locator('[name="first_name"]').inputValue()).toBe('Beacon');
    expect(await page.locator('[name="last_name"]').inputValue()).toBe('Test');
    expect(await page.locator('[name="email"]').inputValue()).toBe('beacon-test@example.com');
    expect(await page.locator('[name="phone"]').inputValue()).toBe('07700 900000');
    expect(await page.locator('[name="message"]').inputValue()).toContain('automated test submission');
    expect(await page.locator('[name="branch"]').inputValue()).toBe('leeds');
    // Required checkbox gets ticked (needed to submit); optional marketing one does not.
    expect(await page.locator('[name="agree_terms"]').isChecked()).toBe(true);
    expect(await page.locator('[name="newsletter"]').isChecked()).toBe(false);

    await context.close();
  });

  it('never submits when allowSubmit is left false, even via runCapture', async () => {
    const context = await browser.newContext();
    const discoveryPage = await context.newPage();
    await discoveryPage.goto(`${fixture.url}/form-target.html`);
    const [target] = await discover(discoveryPage);
    await discoveryPage.close();

    const page = await context.newPage();
    const result = await runCapture(page, `${fixture.url}/form-target.html`, {
      settleQuietMs: 500,
      interact: (p) => drive(p, target).then(() => undefined),
    });
    await context.close();

    expect(result.events).toEqual([]);
  });

  it('submits only when the caller explicitly sets allowSubmit on that target', async () => {
    const context = await browser.newContext();
    const discoveryPage = await context.newPage();
    await discoveryPage.goto(`${fixture.url}/form-target.html`);
    const [target] = await discover(discoveryPage);
    await discoveryPage.close();

    const page = await context.newPage();
    const result = await runCapture(page, `${fixture.url}/form-target.html`, {
      settleQuietMs: 500,
      interact: (p) => drive(p, { ...target, allowSubmit: true }).then(() => undefined),
    });
    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['form_submit']);
  });
});
