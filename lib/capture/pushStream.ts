import { EventEmitter } from 'node:events';

export interface StreamedPush {
  push: unknown;
  receivedAt: number;
}

/**
 * Node-side sink for dataLayer pushes, fed by page.exposeBinding rather than by polling a
 * page-side array. Because it lives in Node, not in the page's JS realm, it survives
 * navigation — the in-page accumulator captureInitScript recreates on every new document
 * does not (see injectCapture.ts for the reconciliation sweep that catches the gap between
 * a push landing in-page and its binding call being delivered).
 */
export class PushStream extends EventEmitter {
  readonly pushes: StreamedPush[] = [];

  record(push: unknown): void {
    const entry: StreamedPush = { push, receivedAt: Date.now() };
    this.pushes.push(entry);
    this.emit('push', entry);
  }
}
