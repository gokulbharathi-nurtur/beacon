import { chromium, type Browser } from 'playwright';

declare global {
  var __datalayerQaBrowser: Promise<Browser> | undefined;
}

/**
 * One shared Chromium instance for the process lifetime — avoids the ~1-2s
 * process-launch cost on every run. Callers get their own context/page per run;
 * never close this shared Browser between runs.
 */
export function getBrowser(): Promise<Browser> {
  if (!globalThis.__datalayerQaBrowser) {
    globalThis.__datalayerQaBrowser = chromium.launch({ headless: true });
  }
  return globalThis.__datalayerQaBrowser;
}
