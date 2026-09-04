import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { serveFixtures, type FixtureServer } from '../../test/helpers/serveFixtures';
import { runCapture } from './injectCapture';

/**
 * What the sweep (lib/runs/executeSweep.ts) depends on: telling "the click caused this
 * event" apart from "this event fires on every load of this page regardless of the
 * click" — without it, every element on a page would get credited with that page's
 * ambient load-time events, and a genuinely silent element (one wired to nothing) would
 * look identical to one that works. The same boundary applies to the general `interact`
 * hook the drivers (lib/capture/drivers/) use for non-click interactions.
 */

describe('runCapture interaction/load event boundary', () => {
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

  it('reports eventsAfterInteractionIndex null on a load-only capture', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const result = await runCapture(page, `${fixture.url}/sweep-target.html`, { settleQuietMs: 500 });
    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['page_loaded']);
    expect(result.eventsAfterInteractionIndex).toBeNull();
  });

  it('separates the load event from the one the click caused', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const result = await runCapture(page, `${fixture.url}/sweep-target.html`, {
      clickSelector: '#track-btn',
      settleQuietMs: 500,
    });
    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['page_loaded', 'button_clicked']);
    expect(result.eventsAfterInteractionIndex).toBe(1);
    // What a sweep actually uses: only the click-attributable slice.
    expect(result.events.slice(result.eventsAfterInteractionIndex!).map((e) => e.event)).toEqual(['button_clicked']);
  });

  it('marks a genuinely silent element correctly — nothing after the click', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const result = await runCapture(page, `${fixture.url}/sweep-target.html`, {
      clickSelector: '#silent-btn',
      settleQuietMs: 500,
    });
    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['page_loaded']);
    // eventsAfterInteractionIndex equals events.length — the slice a sweep takes is empty,
    // which is exactly the "silent element" signal.
    expect(result.eventsAfterInteractionIndex).toBe(result.events.length);
    expect(result.events.slice(result.eventsAfterInteractionIndex!)).toEqual([]);
  });

  it('applies the same boundary to a general interact hook, not just clickSelector', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const result = await runCapture(page, `${fixture.url}/sweep-target.html`, {
      settleQuietMs: 500,
      interact: async (p) => {
        await p.locator('#track-btn').click();
      },
    });
    await context.close();

    expect(result.events.map((e) => e.event)).toEqual(['page_loaded', 'button_clicked']);
    expect(result.eventsAfterInteractionIndex).toBe(1);
  });

  it('ignores interact when clickSelector is also given', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    let interactCalled = false;
    const result = await runCapture(page, `${fixture.url}/sweep-target.html`, {
      clickSelector: '#track-btn',
      settleQuietMs: 500,
      interact: async () => {
        interactCalled = true;
      },
    });
    await context.close();

    expect(interactCalled).toBe(false);
    expect(result.events.map((e) => e.event)).toEqual(['page_loaded', 'button_clicked']);
  });
});
