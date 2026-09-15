import { describe, expect, it } from 'vitest';
import { deriveRunName } from './deriveRunName';

describe('deriveRunName', () => {
  const cases: Array<[string, string]> = [
    ['https://www.chartersestateagents.co.uk/our-services/', 'Our Services'],
    ['https://www.chartersestateagents.co.uk/about-charters/', 'About Charters'],
    ['https://www.chartersestateagents.co.uk/our-services/furnishing-solutions/', 'Our Services - Furnishing Solutions'],
    ['https://www.chartersestateagents.co.uk/property/for-sale/in-south-east-england/', 'Property - For Sale'],
    [
      'https://www.chartersestateagents.co.uk/property-for-sale/4-bedroom-detached-house-for-sale-in-bryces-lane-sherfield-english-romsey-hampshire-so51/',
      'Property For Sale - Details',
    ],
    ['https://www.chartersestateagents.co.uk/area-guides/alresford', 'Area Guides - Alresford'],
  ];

  it.each(cases)('%s -> %s', (url, expected) => {
    expect(deriveRunName(url)).toBe(expected);
  });

  it('names the site root "Homepage"', () => {
    expect(deriveRunName('https://www.example.com/')).toBe('Homepage');
    expect(deriveRunName('https://staging.example.com')).toBe('Homepage');
    expect(deriveRunName('https://linleyandsimpson2.q.starberry.com/')).toBe('Homepage');
  });

  it('ignores the query string and hash', () => {
    expect(deriveRunName('https://x.com/blog/?page=2#top')).toBe('Blog');
  });

  it('returns the input unchanged when it is not a URL', () => {
    expect(deriveRunName('not a url')).toBe('not a url');
  });
});
