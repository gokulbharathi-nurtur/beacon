/**
 * Vitest setup file injected into @starberry/advanced-analytics-nextjs's own test run
 * (see scripts/generate-catalog.ts) to harvest every payload its tracking functions push.
 *
 * The package's 168 tests already call every builder with realistic arguments and assert
 * the exact resulting object, so the suite is the most complete, actively-maintained
 * description of each event's payload shape that exists. Reading the pushes back out of it
 * gives beacon a canonical catalog for free rather than hand-transcribing docs/events/README.md.
 *
 * Runs inside the *package's* vitest, not beacon's, so it must not import anything from
 * beacon — hence the inlined undefined-marking below. Only `vitest` and node builtins are
 * safe to import here.
 */
import { afterEach, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = process.env.BEACON_HARVEST_DIR;
if (!OUT_DIR) {
  throw new Error('BEACON_HARVEST_DIR must be set — run this via scripts/generate-catalog.ts.');
}

// Test files run across parallel workers, and several test files share one worker
// sequentially. One file per worker keeps appends race-free without forcing vitest into
// single-fork mode; generate-catalog.ts merges them.
const SINK = join(OUT_DIR, `harvest-${process.pid}-${Math.random().toString(36).slice(2, 10)}.jsonl`);

/**
 * A field pushed as an explicit `undefined` (the `sidebar_open: undefined` pattern used
 * throughout the package) is real signal, but JSON.stringify drops those keys and this
 * record is written as JSON — so undefined has to travel as a sentinel string.
 *
 * The literal below is substituted with the real value from lib/capture/undefinedMarker.ts
 * when generate-catalog.ts stages this file, and that script fails loudly if the
 * placeholder no longer matches. Hand-copying the constant here instead would look
 * harmless and be wrong: the real marker is wrapped in NUL bytes, which most editors and
 * file viewers render as ordinary spaces.
 */
const UNDEFINED_MARKER = '__BEACON_UNDEFINED_MARKER__';

function markUndefinedDeep(value) {
  if (Array.isArray(value)) return value;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, v === undefined ? UNDEFINED_MARKER : markUndefinedDeep(v)])
    );
  }
  return value;
}

/** Mirrors lib/capture/filterEvents.ts — the null-clear pushes trackingLoadEvent emits
 * (`{ search: null }` and friends) aren't events and would otherwise pollute the catalog. */
function isEventShaped(push) {
  return typeof push === 'object' && push !== null && typeof push.event === 'string';
}

afterEach(() => {
  // Every test file's own `beforeEach` resets `window.dataLayer = []`, so whatever is here
  // now was pushed by the test that just finished, and nothing clears it before this hook.
  const pushes = typeof window === 'undefined' ? [] : window.dataLayer;
  if (!Array.isArray(pushes) || pushes.length === 0) return;

  let testName = '';
  let testFile = '';
  try {
    const state = expect.getState();
    testName = state.currentTestName ?? '';
    // Which file a sample came from is what lets generate-catalog.ts drop event names that
    // only ever appear as fixtures of the transport layer's own tests.
    testFile = (state.testPath ?? '').replace(/\\/g, '/');
  } catch {
    // Provenance only — never fail the package's own suite over it.
  }

  const lines = pushes
    .filter(isEventShaped)
    .map((push) => JSON.stringify({ event: push.event, payload: markUndefinedDeep(push), testName, testFile }));

  if (lines.length > 0) appendFileSync(SINK, `${lines.join('\n')}\n`, 'utf8');
});
