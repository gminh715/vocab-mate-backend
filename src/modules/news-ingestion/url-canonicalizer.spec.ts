import { canonicalizeNewsUrl } from './url-canonicalizer';

describe('canonicalizeNewsUrl', () => {
  it('removes tracking and fragments while preserving identifying parameters', () => {
    expect(
      canonicalizeNewsUrl(
        'HTTPS://Example.COM:443/story?id=42&utm_source=x&fbclid=y&edition=us#section',
      ),
    ).toBe('https://example.com/story?edition=us&id=42');
  });

  it('normalizes default HTTP ports', () => {
    expect(canonicalizeNewsUrl('http://EXAMPLE.com:80/story')).toBe(
      'http://example.com/story',
    );
  });

  it.each([
    'ftp://example.com/story',
    'https://user:pass@example.com/story',
    'not a URL',
  ])('rejects unsafe URL %s', (value) => {
    expect(() => canonicalizeNewsUrl(value)).toThrow();
  });
});
