import { describe, expect, it } from 'vitest';
import { computeClickDrift } from './clickDrift';

function baseRun(overrides: Partial<Parameters<typeof computeClickDrift>[0]> = {}) {
  return {
    mode: 'diff' as const,
    clickSelector: '#footer-privacy',
    clickLabel: 'Privacy policy',
    clickHref: '/privacy',
    clickTargetLabel: 'Privacy policy',
    clickTargetHref: '/privacy',
    clickTargetResolvedCount: 1,
    ...overrides,
  };
}

describe('computeClickDrift', () => {
  it('reports nothing when the resolved target matches what the template recorded', () => {
    expect(computeClickDrift(baseRun())).toBeNull();
  });

  it('is only meaningful for diff-mode runs', () => {
    expect(computeClickDrift(baseRun({ mode: 'record', clickTargetLabel: 'Something else' }))).toBeNull();
    expect(computeClickDrift(baseRun({ mode: 'audit', clickTargetLabel: 'Something else' }))).toBeNull();
  });

  it('has nothing to compare when there is no clickSelector at all', () => {
    expect(computeClickDrift(baseRun({ clickSelector: null }))).toBeNull();
  });

  it('has nothing to compare when the run never reached the live check', () => {
    expect(computeClickDrift(baseRun({ clickTargetResolvedCount: null }))).toBeNull();
  });

  it('flags a selector that no longer matches anything', () => {
    const drift = computeClickDrift(baseRun({ clickTargetResolvedCount: 0, clickTargetLabel: null, clickTargetHref: null }));
    expect(drift?.kind).toBe('gone');
    expect(drift?.message).toContain('Privacy policy');
  });

  it('flags a selector that has become ambiguous', () => {
    const drift = computeClickDrift(baseRun({ clickTargetResolvedCount: 3 }));
    expect(drift?.kind).toBe('ambiguous');
    expect(drift?.message).toContain('3 elements');
  });

  it('flags a selector that now resolves to a different label', () => {
    const drift = computeClickDrift(baseRun({ clickTargetLabel: 'Cookie settings', clickTargetHref: '/cookies' }));
    expect(drift?.kind).toBe('changed');
    expect(drift?.message).toContain('Cookie settings');
    expect(drift?.message).toContain('Privacy policy');
  });

  it('flags a same-label element whose href moved', () => {
    // Two "Learn more" links on the page — label alone doesn't catch this, href does.
    const drift = computeClickDrift(baseRun({ clickTargetHref: '/different-page' }));
    expect(drift?.kind).toBe('changed');
  });

  it('does not compare when the template predates clickLabel being recorded', () => {
    // Older templates saved before this field existed have clickLabel: null — nothing to
    // diff against, so silence is correct rather than a false "changed" on every run.
    const drift = computeClickDrift(baseRun({ clickLabel: null, clickHref: null, clickTargetLabel: 'Whatever is there now' }));
    expect(drift).toBeNull();
  });
});
