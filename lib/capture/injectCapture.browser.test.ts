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
      networkIdleTimeoutMs: 0,
    });

    await context.close();

    expect(result.timedOut).toBe(false);
    expect(result.events.map((e) => e.event)).toEqual(['nav_page_1_loaded', 'nav_page_2_loaded', 'nav_page_2_debounced']);
  }, 15_000);
});

describe('runCapture waits out the page\'s own async fetch before settling', () => {
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

  it('captures an event pushed only after a ~1.5s data fetch', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await runCapture(page, `${fixture.url}/late-async-event.html`, {
      // Quiet window far shorter than the fetch — without the networkidle wait the capture
      // would settle during the fetch and miss the post-fetch push.
      settleQuietMs: 500,
      networkIdleTimeoutMs: 8000,
      hardTimeoutMs: 12_000,
    });

    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['list_page_loaded', 'view_list_loaded']);
  }, 20_000);

  it('misses that event when the networkidle wait is disabled — proving it is the guard', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await runCapture(page, `${fixture.url}/late-async-event.html`, {
      settleQuietMs: 500,
      networkIdleTimeoutMs: 0,
      hardTimeoutMs: 12_000,
      // Also disabled: its bounded wait for an "accept" button would otherwise give the
      // fetch enough time to finish, masking what this test is isolating.
      acceptCookieBanner: false,
    });

    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['list_page_loaded']);
  }, 20_000);
});

describe('runCapture performs interaction steps for click-event templates', () => {
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

  it('clicks a target matched by visible text and captures the event it triggers', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await runCapture(page, `${fixture.url}/click-event.html`, {
      settleQuietMs: 500,
      networkIdleTimeoutMs: 0,
      hardTimeoutMs: 12_000,
      steps: [{ action: 'click', target: { by: 'text', value: 'Book a viewing' } }],
    });

    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['page_loaded', 'cta_click']);
    expect(result.stepResults).toEqual([
      {
        index: 0,
        target: { by: 'text', value: 'Book a viewing' },
        label: undefined,
        status: 'ok',
        firedAt: expect.any(Number),
      },
    ]);
  }, 20_000);

  it('clicks a target matched by CSS selector', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await runCapture(page, `${fixture.url}/click-event.html`, {
      settleQuietMs: 500,
      networkIdleTimeoutMs: 0,
      hardTimeoutMs: 12_000,
      steps: [{ action: 'click', target: { by: 'css', value: '#book-viewing' } }],
    });

    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['page_loaded', 'cta_click']);
    expect(result.stepResults?.[0].status).toBe('ok');
  }, 20_000);

  it('records a soft failure (and captures nothing extra) when the target is missing', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await runCapture(page, `${fixture.url}/click-event.html`, {
      settleQuietMs: 500,
      networkIdleTimeoutMs: 0,
      hardTimeoutMs: 12_000,
      stepTimeoutMs: 1500,
      steps: [{ action: 'click', target: { by: 'text', value: 'Nonexistent button' } }],
    });

    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['page_loaded']);
    expect(result.stepResults?.[0].status).toBe('target_not_found');
  }, 20_000);
});

describe('runCapture attributes each captured event to the step that triggered it', () => {
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

  it('maps the first button\'s event to step 0 and the second\'s to step 1', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await runCapture(page, `${fixture.url}/click-two-steps.html`, {
      settleQuietMs: 800,
      networkIdleTimeoutMs: 0,
      hardTimeoutMs: 12_000,
      steps: [
        { action: 'click', target: { by: 'text', value: 'Step A' } },
        { action: 'click', target: { by: 'text', value: 'Step B' } },
      ],
    });

    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['page_loaded', 'step_a_clicked', 'step_b_clicked']);
    expect(result.eventStepIndex).toEqual([null, 0, 1]);
    expect(result.stepResults?.every((r) => r.status === 'ok')).toBe(true);
  }, 20_000);
});

describe('runCapture explains *why* a click step did not land', () => {
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

  it('reports a disabled control as target_disabled, not a generic "not found"', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await runCapture(page, `${fixture.url}/click-blocked-and-disabled.html`, {
      settleQuietMs: 500,
      networkIdleTimeoutMs: 0,
      hardTimeoutMs: 12_000,
      stepTimeoutMs: 1500,
      acceptCookieBanner: false,
      steps: [{ action: 'click', target: { by: 'css', value: '#prev' } }],
    });

    await context.close();

    expect(result.stepResults?.[0].status).toBe('target_disabled');
    expect(result.events.map((e) => e.event)).toEqual(['page_loaded']);
  }, 20_000);

  it('reports an overlay-intercepted click as click_blocked, naming the blocker', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Step 1 enables #prev *and* drops a full-screen overlay over the page — so step 2's
    // click is intercepted rather than missing or disabled.
    const result = await runCapture(page, `${fixture.url}/click-blocked-and-disabled.html`, {
      settleQuietMs: 500,
      networkIdleTimeoutMs: 0,
      hardTimeoutMs: 15_000,
      stepTimeoutMs: 1500,
      acceptCookieBanner: false,
      steps: [
        { action: 'click', target: { by: 'css', value: '#next' } },
        { action: 'click', target: { by: 'css', value: '#prev' } },
      ],
    });

    await context.close();

    expect(result.stepResults?.[0].status).toBe('ok');
    expect(result.stepResults?.[1].status).toBe('click_blocked');
    expect(result.stepResults?.[1].message).toContain('#overlay');
    expect(result.events.map((e) => e.event)).toEqual(['page_loaded', 'carousel_scroll']);
  }, 25_000);
});

describe('runCapture does not follow a click-triggered redirect', () => {
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

  it('captures the click event but never navigates to (or captures events from) the destination page', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await runCapture(page, `${fixture.url}/click-redirects.html`, {
      settleQuietMs: 800,
      networkIdleTimeoutMs: 0,
      hardTimeoutMs: 12_000,
      steps: [{ action: 'click', target: { by: 'text', value: 'View details' } }],
    });

    // Proves the browser genuinely stayed on the origin document — not just that the
    // destination's event happens to be absent from the capture.
    expect(page.url()).toBe(`${fixture.url}/click-redirects.html`);
    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['page_loaded', 'property_click']);
    expect(result.stepResults?.[0].status).toBe('ok');
  }, 20_000);
});

describe('runCapture accepts the cookie banner so consent-gated events fire', () => {
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

  it('clicks "accept all" and captures the event gated behind it (default)', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await runCapture(page, `${fixture.url}/consent-gated.html`, {
      settleQuietMs: 800,
      networkIdleTimeoutMs: 3000,
      hardTimeoutMs: 12_000,
    });

    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['page_loaded', 'consented_view']);
  }, 20_000);

  it('leaves the banner alone when acceptCookieBanner is false', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await runCapture(page, `${fixture.url}/consent-gated.html`, {
      settleQuietMs: 800,
      networkIdleTimeoutMs: 3000,
      hardTimeoutMs: 12_000,
      acceptCookieBanner: false,
    });

    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['page_loaded']);
  }, 20_000);
});
