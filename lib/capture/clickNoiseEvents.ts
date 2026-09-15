/**
 * True for pushes that are page-load/consent-platform lifecycle noise, not a real
 * business event — pre-excluded by default when reviewing a click-template recording, so
 * the template naturally keeps just the click's own events (re-includable per event).
 */
export function isNoiseEvent(name: string): boolean {
  return (
    name.startsWith('gtm.') ||
    name === 'page_loaded' ||
    /^(onetrust|optanon)/i.test(name) ||
    /consent/i.test(name)
  );
}
