import { describe, expect, it } from 'vitest';
import { PushStream } from './pushStream';

describe('PushStream', () => {
  it('records pushes in order with a receivedAt timestamp', () => {
    const stream = new PushStream();
    stream.record({ event: 'a' });
    stream.record({ event: 'b' });

    expect(stream.pushes.map((p) => p.push)).toEqual([{ event: 'a' }, { event: 'b' }]);
    expect(stream.pushes.every((p) => typeof p.receivedAt === 'number')).toBe(true);
  });

  it('survives across what a page navigation would wipe — it is not page state', () => {
    // The whole reason this exists instead of the in-page array: a Node-side object has no
    // notion of "the page navigated" at all, so there is nothing to lose.
    const stream = new PushStream();
    stream.record({ event: 'before_nav' });
    stream.record({ event: 'after_nav' });
    expect(stream.pushes).toHaveLength(2);
  });

  it('emits a push event for each record call, carrying the same entry', () => {
    const stream = new PushStream();
    const seen: unknown[] = [];
    stream.on('push', (entry) => seen.push(entry.push));

    stream.record({ event: 'x' });
    stream.record({ event: 'y' });

    expect(seen).toEqual([{ event: 'x' }, { event: 'y' }]);
  });
});
