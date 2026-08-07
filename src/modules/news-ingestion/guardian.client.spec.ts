import { Test, type TestingModule } from '@nestjs/testing';
import type { NewsConfig } from '../../config/news.config';
import { NEWS_CONFIG } from '../../config/config.module';
import { GuardianClient } from './guardian.client';
import { NewsIngestionError } from './news-ingestion.errors';
import { NEWS_FETCH, type NewsFetch } from './news-http.tokens';

const config: NewsConfig = {
  guardianApiKey: 'secret-test-key',
  guardianBaseUrl: 'https://content.guardianapis.com',
  requestTimeoutMs: 1000,
  maxResponseBytes: 100000,
  minArticleCharacters: 200,
  minRequestIntervalMs: 0,
  defaultPageSize: 5,
  maxPageSize: 10,
};

const article = {
  id: 'technology/2026/jul/30/test-story',
  type: 'article',
  sectionId: 'technology',
  sectionName: 'Technology',
  webPublicationDate: '2026-07-30T10:00:00Z',
  webTitle: 'Fallback web title',
  webUrl:
    'https://www.TheGuardian.com/technology/2026/jul/30/test-story?utm_source=test#top',
  fields: {
    headline: '  <strong>Test &amp; trusted</strong> headline ',
    trailText: '<p>A <em>useful</em> description &amp; context.</p>',
    byline: '<a href="/profile/reporter">Example Reporter</a>',
    thumbnail: 'https://media.guim.co.uk/image.jpg?utm_campaign=test',
    body: `<p>${'Complete Guardian article body. '.repeat(20)}</p>`,
  },
};

const responseBody = (
  results: unknown[] = [article],
  override: Record<string, unknown> = {},
) => ({
  response: {
    status: 'ok',
    userTier: 'developer',
    total: results.length,
    startIndex: results.length > 0 ? 1 : 0,
    pageSize: 5,
    currentPage: 1,
    pages: results.length > 0 ? 1 : 0,
    orderBy: 'newest',
    results,
    ...override,
  },
});

describe('GuardianClient', () => {
  let client: GuardianClient;
  let fetchMock: jest.MockedFunction<NewsFetch>;

  beforeEach(async () => {
    fetchMock = jest.fn<NewsFetch>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuardianClient,
        { provide: NEWS_CONFIG, useValue: config },
        { provide: NEWS_FETCH, useValue: fetchMock },
      ],
    }).compile();
    client = module.get(GuardianClient);
  });

  it('validates and normalizes metadata without exposing fields.body', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(responseBody()), { status: 200 }),
    );

    const result = await client.searchMetadata({
      q: ' climate policy ',
      section: 'Technology',
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
      page: 2,
      pageSize: 10,
      orderBy: 'relevance',
    });

    expect(result).toEqual({
      totalArticles: 1,
      articles: [
        {
          externalId: article.id,
          title: 'Test & trusted headline',
          description: 'A useful description & context.',
          url: 'https://www.theguardian.com/technology/2026/jul/30/test-story',
          imageUrl: 'https://media.guim.co.uk/image.jpg',
          sourceName: 'The Guardian',
          publishedAt: new Date('2026-07-30T10:00:00Z'),
          authorName: 'Example Reporter',
          sectionId: 'technology',
          sectionName: 'Technology',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('Complete Guardian');

    const firstCall = fetchMock.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    if (!firstCall) throw new Error('Expected a Guardian request');
    const [requestUrl, init] = firstCall;
    expect(requestUrl).toBeInstanceOf(URL);
    if (!(requestUrl instanceof URL)) throw new Error('Expected a URL');
    expect(requestUrl.pathname).toBe('/search');
    expect(requestUrl.searchParams.get('q')).toBe('climate policy');
    expect(requestUrl.searchParams.get('section')).toBe('technology');
    expect(requestUrl.searchParams.get('from-date')).toBe('2026-07-01');
    expect(requestUrl.searchParams.get('to-date')).toBe('2026-07-31');
    expect(requestUrl.searchParams.get('page')).toBe('2');
    expect(requestUrl.searchParams.get('page-size')).toBe('10');
    expect(requestUrl.searchParams.get('order-by')).toBe('relevance');
    expect(requestUrl.searchParams.get('type')).toBe('article');
    expect(requestUrl.searchParams.get('format')).toBe('json');
    expect(requestUrl.searchParams.get('show-fields')).toBe(
      'headline,trailText,byline,thumbnail',
    );
    expect(requestUrl.searchParams.get('api-key')).toBe('secret-test-key');
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: { Accept: 'application/json' },
    });
  });

  it('uses webTitle when fields.headline is absent or empty', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(
          responseBody([
            { ...article, fields: { ...article.fields, headline: '<b> </b>' } },
          ]),
        ),
      ),
    );

    await expect(
      client.searchMetadata({ section: 'technology' }),
    ).resolves.toMatchObject({
      articles: [{ title: 'Fallback web title' }],
    });
  });

  it('returns body only from explicit draft-import mode', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(responseBody()), { status: 200 }),
    );

    const result = await client.searchForImport({
      q: 'learning',
      pageSize: 5,
    });

    expect(result.articles[0]).toMatchObject({
      providerContent: article.fields.body,
    });
    const firstCall = fetchMock.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    if (!firstCall || !(firstCall[0] instanceof URL)) {
      throw new Error('Expected a Guardian URL');
    }
    expect(firstCall[0].searchParams.get('show-fields')).toBe(
      'headline,trailText,byline,thumbnail,body',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    responseBody([], { status: 'error' }),
    { response: { status: 'ok', results: [] } },
    responseBody([{ ...article, id: '' }]),
  ])('rejects invalid Guardian response shapes', async (body) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));
    const error: unknown = await client
      .searchMetadata({ q: 'test' })
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(NewsIngestionError);
    if (!(error instanceof NewsIngestionError)) {
      throw new Error('Expected a news ingestion error');
    }
    expect(error.code).toBe('NEWS_PROVIDER_INVALID_RESPONSE');
    expect(error.message).toContain('News provider');
  });

  it.each<[Record<string, unknown>, string]>([
    [{ ...article, webUrl: 'javascript:alert(1)' }, 'invalid URL'],
    [{ ...article, webPublicationDate: 'not-a-date' }, 'invalid date'],
  ])('rejects invalid normalized article values', async (result, message) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(responseBody([result]))),
    );
    const error: unknown = await client
      .searchMetadata({ q: 'test' })
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(NewsIngestionError);
    if (!(error instanceof NewsIngestionError)) {
      throw new Error('Expected a news ingestion error');
    }
    expect(error.code).toBe('NEWS_PROVIDER_INVALID_RESPONSE');
    expect(error.message).toContain(message);
  });

  it.each([
    [400, 'NEWS_PROVIDER_BAD_REQUEST'],
    [401, 'NEWS_PROVIDER_AUTHENTICATION'],
    [403, 'NEWS_PROVIDER_QUOTA'],
    [429, 'NEWS_PROVIDER_RATE_LIMIT'],
  ])('maps status %i without retrying', async (status, code) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(client.searchMetadata({ q: 'test' })).rejects.toMatchObject({
      code,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries exactly once for retryable 5xx and network failures', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(responseBody([])), { status: 200 }),
      );
    await expect(client.searchMetadata({ q: 'test' })).resolves.toMatchObject({
      articles: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(
      new TypeError('fetch failed for api-key=secret-test-key'),
    );
    await expect(client.searchMetadata({ q: 'test' })).rejects.toMatchObject({
      code: 'NEWS_PROVIDER_NETWORK',
      message: 'News provider network request failed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps a repeated retryable 5xx after exactly one retry', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));

    await expect(client.searchMetadata({ q: 'test' })).rejects.toMatchObject({
      code: 'NEWS_PROVIDER_UPSTREAM',
      message: 'News provider is temporarily unavailable',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry timeout failures and redacts the API key', async () => {
    fetchMock.mockRejectedValue(
      new DOMException(
        'https://content.guardianapis.com/search?api-key=secret-test-key',
        'TimeoutError',
      ),
    );

    const error = await client
      .searchMetadata({ q: 'test' })
      .catch((value: unknown) => value);
    expect(error).toMatchObject({
      code: 'NEWS_PROVIDER_TIMEOUT',
      message: 'News provider request timed out',
    });
    expect(JSON.stringify(error)).not.toContain('secret-test-key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized and invalid JSON responses safely', async () => {
    const smallLimitClient = new GuardianClient(
      { ...config, maxResponseBytes: 100 },
      fetchMock,
    );
    fetchMock.mockResolvedValueOnce(new Response('x'.repeat(101)));
    await expect(
      smallLimitClient.searchMetadata({ q: 'test' }),
    ).rejects.toMatchObject({
      code: 'NEWS_PROVIDER_RESPONSE_TOO_LARGE',
    });

    fetchMock.mockResolvedValueOnce(new Response('{invalid'));
    await expect(client.searchMetadata({ q: 'test' })).rejects.toMatchObject({
      code: 'NEWS_PROVIDER_INVALID_RESPONSE',
      message: 'News provider returned invalid JSON',
    });
  });

  it('enforces request and configured page-size bounds before HTTP', async () => {
    await expect(
      client.searchMetadata({ q: 'test', page: 0 }),
    ).rejects.toMatchObject({ code: 'NEWS_PROVIDER_BAD_REQUEST' });
    await expect(
      client.searchMetadata({ q: 'test', pageSize: 11 }),
    ).rejects.toMatchObject({ code: 'NEWS_PROVIDER_BAD_REQUEST' });
    await expect(
      client.searchMetadata({
        q: 'test',
        fromDate: '2026-08-01',
        toDate: '2026-07-01',
      }),
    ).rejects.toMatchObject({ code: 'NEWS_PROVIDER_BAD_REQUEST' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a response that exceeds the requested page size', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(
          responseBody([article, { ...article, id: `${article.id}-two` }], {
            pageSize: 2,
          }),
        ),
      ),
    );

    await expect(
      client.searchMetadata({ q: 'test', pageSize: 1 }),
    ).rejects.toMatchObject({ code: 'NEWS_PROVIDER_INVALID_RESPONSE' });
  });

  it('serializes process-local request starts at the configured interval', async () => {
    const starts: number[] = [];
    fetchMock.mockImplementation(() => {
      starts.push(Date.now());
      return Promise.resolve(new Response(JSON.stringify(responseBody([]))));
    });
    const throttledClient = new GuardianClient(
      { ...config, minRequestIntervalMs: 20 },
      fetchMock,
    );

    await Promise.all([
      throttledClient.searchMetadata({ q: 'first' }),
      throttledClient.searchMetadata({ q: 'second' }),
    ]);

    expect(starts).toHaveLength(2);
    expect((starts[1] ?? 0) - (starts[0] ?? 0)).toBeGreaterThanOrEqual(18);
  });
});
