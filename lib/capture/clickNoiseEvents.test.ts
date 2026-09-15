import { describe, it, expect } from 'vitest';
import { isNoiseEvent } from './clickNoiseEvents';

describe('isNoiseEvent', () => {
  it.each([
    'OneTrustLoaded',
    'OptanonLoaded',
    'OneTrustGroupsUpdated',
    'OptanonWrapper',
    'gtm.js',
    'gtm.dom',
    'page_loaded',
    'cookie_consent_given',
  ])('treats %s as noise, pre-excluded by default', (name) => {
    expect(isNoiseEvent(name)).toBe(true);
  });

  it.each(['form_start', 'cta_click', 'view_property_list', 'add_to_wishlist'])(
    'does not treat %s as noise',
    (name) => {
      expect(isNoiseEvent(name)).toBe(false);
    }
  );
});
