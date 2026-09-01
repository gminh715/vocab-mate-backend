import { Inject, Injectable } from '@nestjs/common';
import { DomUtils, parseDocument } from 'htmlparser2';
import type { NewsConfig } from '../../config/news.config';
import { NEWS_CONFIG } from '../../config/config.module';
import { readBoundedResponseBody } from './bounded-response.helper';
import { NewsIngestionError } from './news-ingestion.errors';
import { NEWS_FETCH, type NewsFetch } from './news-http.tokens';
import {
  GUARDIAN_ORDER_BY,
  type GuardianImportResult,
  type GuardianOrderBy,
  type GuardianSearchInput,
  type GuardianSearchResult,
  type NormalizedNewsArticle,
  type NormalizedNewsImportArticle,
} from './news-ingestion.types';
import {
  canonicalizeNewsUrl,
  tryCanonicalizeNewsUrl,
} from './url-canonicalizer';

const MAX_QUERY_LENGTH = 200;
const MAX_SECTION_LENGTH = 100;
const MAX_PAGE = 100;
const MAX_EXTERNAL_ID_LENGTH = 500;
const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_AUTHOR_LENGTH = 500;
const MAX_SECTION_NAME_LENGTH = 200;
const MAX_URL_LENGTH = 4_096;
const MAX_RAW_METADATA_LENGTH = 20_000;
const METADATA_FIELDS = 'headline,trailText,byline,thumbnail';
const IMPORT_FIELDS = `${METADATA_FIELDS},body`;
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const SECTION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PUBLICATION_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

type GuardianRequestMode = 'metadata' | 'draft-import';

interface GuardianFields {
  headline?: string | null;
  trailText?: string | null;
  byline?: string | null;
  thumbnail?: string | null;
  body?: string | null;
}

interface GuardianArticleValue {
  id: string;
  type: 'article';
  sectionId?: string | null;
  sectionName?: string | null;
  webPublicationDate: string;
  webTitle?: string | null;
  webUrl: string;
  fields?: GuardianFields;
}

interface GuardianResponseValue {
  status: 'ok';
  total: number;
  startIndex: number;
  pageSize: number;
  currentPage: number;
  pages: number;
  orderBy: GuardianOrderBy;
  results: GuardianArticleValue[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const invalidResponse = (message = 'News provider returned invalid data') =>
  new NewsIngestionError('NEWS_PROVIDER_INVALID_RESPONSE', message);

const normalizedText = (value: string, maximum: number): string =>
  value.replace(/\s+/gu, ' ').trim().slice(0, maximum).trim();

const htmlToPlainText = (value: string, maximum: number): string =>
  normalizedText(
    DomUtils.textContent(parseDocument(value, { decodeEntities: true })),
    maximum,
  );

const optionalExternalString = (
  value: unknown,
  maximum: number,
): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > maximum) {
    throw invalidResponse();
  }
  return value;
};

const requiredExternalString = (value: unknown, maximum: number): string => {
  if (typeof value !== 'string' || value.length > maximum || !value.trim()) {
    throw invalidResponse();
  }
  return value;
};

const nonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const positiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 1;

const validIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

const isTimeoutError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  (error.name === 'AbortError' || error.name === 'TimeoutError');

const isNetworkError = (error: unknown): boolean => {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return (
      message.startsWith('fetch failed') ||
      message.startsWith('failed to fetch')
    );
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    [
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
      'UND_ERR_CONNECT_TIMEOUT',
    ].includes(error.code.toUpperCase())
  );
};

@Injectable()
export class GuardianClient {
  private throttleTail: Promise<void> = Promise.resolve();
  private lastRequestStartedAt = 0;

  constructor(
    @Inject(NEWS_CONFIG) private readonly config: NewsConfig,
    @Inject(NEWS_FETCH) private readonly fetchImpl: NewsFetch,
  ) {}

  searchMetadata(input: GuardianSearchInput): Promise<GuardianSearchResult> {
    return this.request(input, 'metadata');
  }

  searchForImport(input: GuardianSearchInput): Promise<GuardianImportResult> {
    return this.request(input, 'draft-import');
  }

  private async request(
    input: GuardianSearchInput,
    mode: 'metadata',
  ): Promise<GuardianSearchResult>;
  private async request(
    input: GuardianSearchInput,
    mode: 'draft-import',
  ): Promise<GuardianImportResult>;
  private async request(
    input: GuardianSearchInput,
    mode: GuardianRequestMode,
  ): Promise<GuardianSearchResult | GuardianImportResult> {
    const query = this.validateInput(input);
    const url = new URL('/search', this.config.guardianBaseUrl);
    if (query.articleIds && query.articleIds.length > 0) {
      url.searchParams.set('ids', query.articleIds.join(','));
    } else {
      if (query.q) url.searchParams.set('q', query.q);
      if (query.section) url.searchParams.set('section', query.section);
    }
    if (query.fromDate) url.searchParams.set('from-date', query.fromDate);
    if (query.toDate) url.searchParams.set('to-date', query.toDate);
    url.searchParams.set('page', String(query.page));
    url.searchParams.set('page-size', String(query.pageSize));
    url.searchParams.set('order-by', query.orderBy);
    url.searchParams.set('type', 'article');
    url.searchParams.set('format', 'json');
    url.searchParams.set(
      'show-fields',
      mode === 'metadata' ? METADATA_FIELDS : IMPORT_FIELDS,
    );
    url.searchParams.set('api-key', this.config.guardianApiKey);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.waitForRequestSlot();
        const response = await this.fetchImpl(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(this.config.requestTimeoutMs),
        });

        if (RETRYABLE_STATUSES.has(response.status) && attempt === 0) {
          await response.body?.cancel();
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw this.statusError(response.status);
        }

        const body = await readBoundedResponseBody(
          response,
          this.config.maxResponseBytes,
        );
        const parsed = this.parseResponse(
          new TextDecoder().decode(body),
          query.pageSize,
        );
        if (mode === 'metadata') {
          return {
            totalArticles: parsed.total,
            articles: parsed.results.map((article) =>
              this.normalizeMetadata(article),
            ),
          };
        }
        return {
          totalArticles: parsed.total,
          articles: parsed.results.map((article) =>
            this.normalizeForImport(article),
          ),
        };
      } catch (error: unknown) {
        if (error instanceof NewsIngestionError) throw error;
        if (isTimeoutError(error)) {
          throw new NewsIngestionError(
            'NEWS_PROVIDER_TIMEOUT',
            'News provider request timed out',
          );
        }
        if (isNetworkError(error)) {
          if (attempt === 0) continue;
          throw new NewsIngestionError(
            'NEWS_PROVIDER_NETWORK',
            'News provider network request failed',
          );
        }
        throw invalidResponse();
      }
    }

    throw new NewsIngestionError(
      'NEWS_PROVIDER_UPSTREAM',
      'News provider is temporarily unavailable',
    );
  }

  private validateInput(input: GuardianSearchInput): {
    q?: string;
    section?: string;
    fromDate?: string;
    toDate?: string;
    page: number;
    pageSize: number;
    orderBy: GuardianOrderBy;
    articleIds?: string[];
  } {
    const q = input.q?.trim();
    const section = input.section?.trim().toLowerCase();
    const articleIds = Array.isArray(input.articleIds)
      ? input.articleIds.filter(
          (id) => typeof id === 'string' && Boolean(id.trim()),
        )
      : undefined;

    if (q && q.length > MAX_QUERY_LENGTH) {
      throw new NewsIngestionError(
        'NEWS_PROVIDER_BAD_REQUEST',
        'News query must contain at most 200 characters',
      );
    }
    if (
      section &&
      (section.length > MAX_SECTION_LENGTH || !SECTION_ID_PATTERN.test(section))
    ) {
      throw new NewsIngestionError(
        'NEWS_PROVIDER_BAD_REQUEST',
        'News section is invalid',
      );
    }
    if (input.fromDate && !validIsoDate(input.fromDate)) {
      throw new NewsIngestionError(
        'NEWS_PROVIDER_BAD_REQUEST',
        'News fromDate must be a valid ISO date',
      );
    }
    if (input.toDate && !validIsoDate(input.toDate)) {
      throw new NewsIngestionError(
        'NEWS_PROVIDER_BAD_REQUEST',
        'News toDate must be a valid ISO date',
      );
    }
    if (
      input.fromDate &&
      input.toDate &&
      input.fromDate.localeCompare(input.toDate) > 0
    ) {
      throw new NewsIngestionError(
        'NEWS_PROVIDER_BAD_REQUEST',
        'News fromDate must not be after toDate',
      );
    }

    const page = input.page ?? 1;
    const pageSize =
      articleIds?.length ?? input.pageSize ?? this.config.defaultPageSize;
    const orderBy = input.orderBy ?? 'newest';
    if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
      throw new NewsIngestionError(
        'NEWS_PROVIDER_BAD_REQUEST',
        'News page must be between 1 and 100',
      );
    }
    if (
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > this.config.maxPageSize
    ) {
      throw new NewsIngestionError(
        'NEWS_PROVIDER_BAD_REQUEST',
        `News pageSize must be between 1 and ${this.config.maxPageSize}`,
      );
    }
    if (!GUARDIAN_ORDER_BY.includes(orderBy)) {
      throw new NewsIngestionError(
        'NEWS_PROVIDER_BAD_REQUEST',
        'News orderBy is invalid',
      );
    }

    return {
      ...(q ? { q } : {}),
      ...(section ? { section } : {}),
      ...(input.fromDate ? { fromDate: input.fromDate } : {}),
      ...(input.toDate ? { toDate: input.toDate } : {}),
      ...(articleIds?.length ? { articleIds } : {}),
      page,
      pageSize,
      orderBy,
    };
  }

  private parseResponse(
    body: string,
    requestedPageSize: number,
  ): GuardianResponseValue {
    let value: unknown;
    try {
      value = JSON.parse(body);
    } catch {
      throw invalidResponse('News provider returned invalid JSON');
    }
    if (!isRecord(value) || !isRecord(value.response)) {
      throw invalidResponse();
    }

    const response = value.response;
    if (response.status !== 'ok') {
      throw invalidResponse('News provider returned an unsuccessful status');
    }
    if (
      !nonNegativeInteger(response.total) ||
      !nonNegativeInteger(response.startIndex) ||
      !positiveInteger(response.pageSize) ||
      !positiveInteger(response.currentPage) ||
      !nonNegativeInteger(response.pages) ||
      typeof response.orderBy !== 'string' ||
      !GUARDIAN_ORDER_BY.includes(response.orderBy as GuardianOrderBy) ||
      !Array.isArray(response.results) ||
      response.pageSize > requestedPageSize ||
      response.results.length > requestedPageSize ||
      response.results.length > response.pageSize ||
      response.results.length > response.total
    ) {
      throw invalidResponse();
    }

    const results = response.results.map((result) =>
      this.validateArticle(result),
    );
    return {
      status: 'ok',
      total: response.total,
      startIndex: response.startIndex,
      pageSize: response.pageSize,
      currentPage: response.currentPage,
      pages: response.pages,
      orderBy: response.orderBy as GuardianOrderBy,
      results,
    };
  }

  private validateArticle(value: unknown): GuardianArticleValue {
    if (!isRecord(value) || value.type !== 'article') {
      throw invalidResponse('News provider returned an invalid article');
    }

    let fields: GuardianFields | undefined;
    if (value.fields !== undefined) {
      if (!isRecord(value.fields)) throw invalidResponse();
      fields = {
        headline: optionalExternalString(
          value.fields.headline,
          MAX_RAW_METADATA_LENGTH,
        ),
        trailText: optionalExternalString(
          value.fields.trailText,
          MAX_RAW_METADATA_LENGTH,
        ),
        byline: optionalExternalString(
          value.fields.byline,
          MAX_RAW_METADATA_LENGTH,
        ),
        thumbnail: optionalExternalString(
          value.fields.thumbnail,
          MAX_URL_LENGTH,
        ),
        body: optionalExternalString(
          value.fields.body,
          this.config.maxResponseBytes,
        ),
      };
    }

    return {
      id: requiredExternalString(value.id, MAX_EXTERNAL_ID_LENGTH),
      type: 'article',
      sectionId: optionalExternalString(value.sectionId, MAX_SECTION_LENGTH),
      sectionName: optionalExternalString(
        value.sectionName,
        MAX_SECTION_NAME_LENGTH,
      ),
      webPublicationDate: requiredExternalString(value.webPublicationDate, 100),
      webTitle: optionalExternalString(value.webTitle, MAX_RAW_METADATA_LENGTH),
      webUrl: requiredExternalString(value.webUrl, MAX_URL_LENGTH),
      ...(fields ? { fields } : {}),
    };
  }

  private normalizeMetadata(
    value: GuardianArticleValue,
  ): NormalizedNewsArticle {
    const externalId = normalizedText(value.id, MAX_EXTERNAL_ID_LENGTH);
    const headline = value.fields?.headline
      ? htmlToPlainText(value.fields.headline, MAX_TITLE_LENGTH)
      : '';
    const webTitle = value.webTitle
      ? htmlToPlainText(value.webTitle, MAX_TITLE_LENGTH)
      : '';
    const title = headline || webTitle;
    if (!externalId || !title) {
      throw invalidResponse('News provider returned an invalid article');
    }

    const publishedAt = new Date(value.webPublicationDate);
    if (
      !PUBLICATION_DATE_TIME.test(value.webPublicationDate) ||
      Number.isNaN(publishedAt.getTime())
    ) {
      throw invalidResponse('News provider returned an invalid date');
    }

    let url: string;
    try {
      url = canonicalizeNewsUrl(value.webUrl);
    } catch {
      throw invalidResponse('News provider returned an invalid URL');
    }

    const trailText = value.fields?.trailText;
    const byline = value.fields?.byline;
    const sectionId = value.sectionId
      ? normalizedText(value.sectionId, MAX_SECTION_LENGTH).toLowerCase()
      : '';
    if (sectionId && !SECTION_ID_PATTERN.test(sectionId)) {
      throw invalidResponse('News provider returned an invalid section');
    }
    return {
      externalId,
      title,
      description: trailText
        ? htmlToPlainText(trailText, MAX_DESCRIPTION_LENGTH)
        : '',
      url,
      imageUrl: tryCanonicalizeNewsUrl(value.fields?.thumbnail),
      sourceName: 'The Guardian',
      publishedAt,
      authorName: byline
        ? htmlToPlainText(byline, MAX_AUTHOR_LENGTH) || null
        : null,
      sectionId: sectionId || null,
      sectionName: value.sectionName
        ? htmlToPlainText(value.sectionName, MAX_SECTION_NAME_LENGTH) || null
        : null,
    };
  }

  private normalizeForImport(
    value: GuardianArticleValue,
  ): NormalizedNewsImportArticle {
    return {
      ...this.normalizeMetadata(value),
      providerContent: value.fields?.body ?? null,
    };
  }

  private statusError(status: number): NewsIngestionError {
    if (status === 400) {
      return new NewsIngestionError(
        'NEWS_PROVIDER_BAD_REQUEST',
        'News provider rejected the request',
      );
    }
    if (status === 401) {
      return new NewsIngestionError(
        'NEWS_PROVIDER_AUTHENTICATION',
        'News provider authentication failed',
      );
    }
    if (status === 403) {
      return new NewsIngestionError(
        'NEWS_PROVIDER_QUOTA',
        'News provider access or quota is unavailable',
      );
    }
    if (status === 429) {
      return new NewsIngestionError(
        'NEWS_PROVIDER_RATE_LIMIT',
        'News provider rate limit was exceeded',
      );
    }
    if (status >= 500) {
      return new NewsIngestionError(
        'NEWS_PROVIDER_UPSTREAM',
        'News provider is temporarily unavailable',
      );
    }
    return new NewsIngestionError(
      'NEWS_PROVIDER_BAD_REQUEST',
      'News provider request failed',
    );
  }

  private async waitForRequestSlot(): Promise<void> {
    let release: () => void = () => undefined;
    const previous = this.throttleTail;
    this.throttleTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      const waitMs = Math.max(
        0,
        this.lastRequestStartedAt +
          this.config.minRequestIntervalMs -
          Date.now(),
      );
      if (waitMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, waitMs);
        });
      }
      this.lastRequestStartedAt = Date.now();
    } finally {
      release();
    }
  }
}
