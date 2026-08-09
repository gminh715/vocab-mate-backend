import { newsConfig } from '../../../src/config/news.config';

describe('newsConfig', () => {
  const originalApiKey = process.env.GUARDIAN_API_KEY;

  beforeEach(() => {
    process.env.GUARDIAN_API_KEY = 'test-key';
  });

  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.GUARDIAN_API_KEY;
    else process.env.GUARDIAN_API_KEY = originalApiKey;
  });

  it('uses fixed safe Guardian developer-access settings', () => {
    expect(newsConfig()).toEqual({
      guardianApiKey: 'test-key',
      guardianBaseUrl: 'https://content.guardianapis.com',
      requestTimeoutMs: 10000,
      maxResponseBytes: 2000000,
      minArticleCharacters: 500,
      minRequestIntervalMs: 1000,
      defaultPageSize: 5,
      maxPageSize: 10,
    });
  });

  it('requires the API key without exposing its value', () => {
    delete process.env.GUARDIAN_API_KEY;
    expect(() => newsConfig()).toThrow('GUARDIAN_API_KEY is required');
  });

  it('rejects an unsafe API key without exposing its value', () => {
    process.env.GUARDIAN_API_KEY = 'secret\r\nInjected: true';
    expect(() => newsConfig()).toThrow(
      'GUARDIAN_API_KEY must be a single line of at most 500 characters',
    );
    expect(() => newsConfig()).not.toThrow('secret');
  });
});
