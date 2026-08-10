import PQueue from 'p-queue';

declare global {
  var __datalayerQaQueue: PQueue | undefined;
}

/** Bounds simultaneous Chromium pages so a small instance doesn't run out of memory. */
export function getQueue(): PQueue {
  if (!globalThis.__datalayerQaQueue) {
    globalThis.__datalayerQaQueue = new PQueue({ concurrency: 2 });
  }
  return globalThis.__datalayerQaQueue;
}
