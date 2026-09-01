export interface NewsConfig {
  guardianApiKey: string;
  guardianBaseUrl: string;
  requestTimeoutMs: number;
  maxResponseBytes: number;
  minArticleCharacters: number;
  minRequestIntervalMs: number;
  defaultPageSize: number;
  maxPageSize: number;
}

const OFFICIAL_BASE_URL = 'https://content.guardianapis.com';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MIN_ARTICLE_CHARACTERS = 500;
const MIN_REQUEST_INTERVAL_MS = 1_000;
const DEFAULT_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 10;

const requiredValue = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const newsConfig = (): NewsConfig => {
  const guardianApiKey = requiredValue('GUARDIAN_API_KEY');
  if (guardianApiKey.length > 500 || /[\r\n]/u.test(guardianApiKey)) {
    throw new Error(
      'GUARDIAN_API_KEY must be a single line of at most 500 characters',
    );
  }

  return {
    guardianApiKey,
    guardianBaseUrl: OFFICIAL_BASE_URL,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxResponseBytes: MAX_RESPONSE_BYTES,
    minArticleCharacters: MIN_ARTICLE_CHARACTERS,
    minRequestIntervalMs: MIN_REQUEST_INTERVAL_MS,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  };
};
