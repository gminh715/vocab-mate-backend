import { NewsIngestionError } from './news-ingestion.errors';

const TRACKING_PARAMETERS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
]);

export const canonicalizeNewsUrl = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new NewsIngestionError('INVALID_URL', 'News URL is invalid');
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password
  ) {
    throw new NewsIngestionError(
      'INVALID_URL',
      'News URL must use HTTP or HTTPS without credentials',
    );
  }

  url.hostname = url.hostname.toLowerCase().replace(/\.$/u, '');
  url.hash = '';

  for (const key of [...url.searchParams.keys()]) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.startsWith('utm_') ||
      TRACKING_PARAMETERS.has(normalizedKey)
    ) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();

  return url.toString();
};

export const tryCanonicalizeNewsUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return canonicalizeNewsUrl(value.trim());
  } catch {
    return null;
  }
};
