import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushStream } from './pushStream';
import { waitUntilQuiet } from './settle';

describe('waitUntilQuiet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('settles naturally once the quiet window elapses with no pushes', async () => {
    const stream = new PushStream();
    const resultPromise = waitUntilQuiet(stream, { quietMs: 1000, hardTimeoutMs: 30_000 });

    await vi.advanceTimersByTimeAsync(1000);
    await expect(resultPromise).resolves.toEqual({ settledNaturally: true });
  });

  it('resets the quiet window on every push, so a late push is not missed', async () => {
    const stream = new PushStream();
    const resultPromise = waitUntilQuiet(stream, { quietMs: 1000, hardTimeoutMs: 30_000 });

    // A push just before the quiet window would have elapsed pushes it back out.
    await vi.advanceTimersByTimeAsync(900);
    stream.record({ event: 'late_push' });
    await vi.advanceTimersByTimeAsync(900);
    // Still not quiet — only 900ms have passed since the last push.
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(100);
    await expect(resultPromise).resolves.toEqual({ settledNaturally: true });
  });

  it('bails at the hard timeout even while pushes keep arriving', async () => {
    const stream = new PushStream();
    const resultPromise = waitUntilQuiet(stream, { quietMs: 1000, hardTimeoutMs: 2500 });

    // A push every 400ms forever would never go quiet on its own.
    const interval = setInterval(() => stream.record({ event: 'chatty' }), 400);
    await vi.advanceTimersByTimeAsync(2500);
    clearInterval(interval);

    await expect(resultPromise).resolves.toEqual({ settledNaturally: false });
  });

  it('does not touch the stream after resolving — no leaked listeners', async () => {
    const stream = new PushStream();
    await Promise.all([waitUntilQuiet(stream, { quietMs: 100, hardTimeoutMs: 5000 }), vi.advanceTimersByTimeAsync(100)]);

    expect(stream.listenerCount('push')).toBe(0);
  });
});
