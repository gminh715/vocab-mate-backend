import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { ImportedArticleDuplicateLookup } from '../../../../src/modules/articles/repositories/articles.repository';
import { ArticleSentencesService } from '../../../../src/modules/articles/services/article-sentences.service';
import {
  ArticlesService,
  ImportedArticleDuplicateError,
  type ImportedDraftInput,
} from '../../../../src/modules/articles/services/articles.service';
import { CategoriesService } from '../../../../src/modules/categories/services/categories.service';
import { GuardianClient } from '../../../../src/modules/news-ingestion/guardian.client';
import { NewsContentService } from '../../../../src/modules/news-ingestion/services/news-content.service';
import { NewsIngestionError } from '../../../../src/modules/news-ingestion/news-ingestion.errors';
import { NewsIngestionService } from '../../../../src/modules/news-ingestion/services/news-ingestion.service';
import type {
  ExtractedArticleContent,
  NormalizedNewsImportArticle,
} from '../../../../src/modules/news-ingestion/news-ingestion.types';

const categoryId = '550e8400-e29b-41d4-a716-446655440000';
const article = (
  externalId: string,
  title = 'A useful technology report',
): NormalizedNewsImportArticle => ({
  externalId,
  title,
  description: 'A concise Guardian description.',
  providerContent: `<p>${'Complete Guardian article content. '.repeat(20)}</p>`,
  url: `https://www.theguardian.com/${externalId}`,
  imageUrl: 'https://media.guim.co.uk/image.jpg',
  sourceName: 'The Guardian',
  publishedAt: new Date('2026-07-30T10:00:00Z'),
  authorName: 'Guardian Reporter',
  sectionId: 'technology',
  sectionName: 'Technology',
});
const extracted = (
  source: NormalizedNewsImportArticle,
): ExtractedArticleContent => ({
  contentHtml: '<p>A complete sentence for the imported article.</p>',
  plainText: 'A complete sentence for the imported article.',
  canonicalUrl: source.url,
});

type ClientMock = {
  searchMetadata: jest.MockedFunction<GuardianClient['searchMetadata']>;
  searchForImport: jest.MockedFunction<GuardianClient['searchForImport']>;
};

type ContentMock = {
  resolve: jest.MockedFunction<NewsContentService['resolve']>;
};

type ArticlesMock = {
  findImportedDuplicate: jest.MockedFunction<
    (lookup: ImportedArticleDuplicateLookup) => Promise<{ id: string } | null>
  >;
  createImportedDraft: jest.MockedFunction<
    (
      adminId: string,
      input: ImportedDraftInput,
    ) => Promise<{ article: { id: string } }>
  >;
  delete: jest.MockedFunction<
    (adminId: string, articleId: string) => Promise<void>
  >;
};

type CategoriesMock = {
  requireActiveCategory: jest.MockedFunction<(id: string) => Promise<void>>;
  resolveOrCreateImportCategory: jest.MockedFunction<
    (
      adminId: string,
      sectionId?: string | null,
      sectionName?: string | null,
    ) => Promise<string>
  >;
};

type SentencesMock = {
  parseContent: jest.MockedFunction<
    (
      adminId: string,
      articleId: string,
      input: Record<string, never>,
    ) => Promise<unknown>
  >;
};

describe('NewsIngestionService', () => {
  let service: NewsIngestionService;
  let client: ClientMock;
  let content: ContentMock;
  let articles: ArticlesMock;
  let sentences: SentencesMock;
  let categories: CategoriesMock;

  beforeEach(async () => {
    client = {
      searchMetadata: jest.fn<GuardianClient['searchMetadata']>(),
      searchForImport: jest.fn<GuardianClient['searchForImport']>(),
    };
    content = { resolve: jest.fn<NewsContentService['resolve']>() };
    articles = {
      findImportedDuplicate: jest
        .fn<
          (
            lookup: ImportedArticleDuplicateLookup,
          ) => Promise<{ id: string } | null>
        >()
        .mockResolvedValue(null),
      createImportedDraft:
        jest.fn<
          (
            adminId: string,
            input: ImportedDraftInput,
          ) => Promise<{ article: { id: string } }>
        >(),
      delete: jest
        .fn<(adminId: string, articleId: string) => Promise<void>>()
        .mockResolvedValue(undefined),
    };
    categories = {
      requireActiveCategory: jest
        .fn<(id: string) => Promise<void>>()
        .mockResolvedValue(undefined),
      resolveOrCreateImportCategory: jest
        .fn<
          (
            adminId: string,
            sectionId?: string | null,
            sectionName?: string | null,
          ) => Promise<string>
        >()
        .mockResolvedValue(categoryId),
    };
    sentences = {
      parseContent:
        jest.fn<
          (
            adminId: string,
            articleId: string,
            input: Record<string, never>,
          ) => Promise<unknown>
        >(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewsIngestionService,
        { provide: GuardianClient, useValue: client },
        { provide: NewsContentService, useValue: content },
        { provide: ArticlesService, useValue: articles },
        { provide: ArticleSentencesService, useValue: sentences },
        { provide: CategoriesService, useValue: categories },
      ],
    }).compile();
    service = module.get(NewsIngestionService);
  });

  it('uses metadata mode for search and maps the Guardian criteria unchanged', async () => {
    client.searchMetadata.mockResolvedValue({
      totalArticles: 0,
      articles: [],
    });
    const query = {
      q: 'technology',
      section: 'science',
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
      page: 2,
      pageSize: 5,
      orderBy: 'relevance' as const,
    };

    await service.search(query);

    expect(client.searchMetadata).toHaveBeenCalledWith(query);
    expect(client.searchForImport).not.toHaveBeenCalled();
  });

  it('rejects invalid sync criteria before category or provider calls', async () => {
    await expect(
      service.sync('admin-id', {
        defaultCategoryId: categoryId,
        pageSize: 11,
        orderBy: 'newest',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(categories.requireActiveCategory).not.toHaveBeenCalled();
    expect(client.searchForImport).not.toHaveBeenCalled();
  });

  it('creates and parses a deterministic Guardian draft with one provider request', async () => {
    const source = article('technology/2026/jul/30/external-1');
    client.searchForImport.mockResolvedValue({
      totalArticles: 1,
      articles: [source],
    });
    content.resolve.mockReturnValue(extracted(source));
    articles.createImportedDraft.mockResolvedValue({
      article: { id: 'created-article-id' },
    });

    const result = await service.sync('admin-id', {
      q: 'learning',
      defaultCategoryId: categoryId,
      pageSize: 5,
      orderBy: 'newest',
    });

    expect(result).toEqual({
      counts: {
        discovered: 1,
        imported: 1,
        skippedDuplicate: 0,
        failed: 0,
      },
      items: [
        expect.objectContaining({
          status: 'imported',
          articleId: 'created-article-id',
        }),
      ],
    });
    expect(client.searchForImport).toHaveBeenCalledTimes(1);
    expect(client.searchForImport).toHaveBeenCalledWith({
      q: 'learning',
      section: undefined,
      fromDate: undefined,
      toDate: undefined,
      pageSize: 5,
      orderBy: 'newest',
    });
    expect(categories.requireActiveCategory).toHaveBeenCalledWith(categoryId);
    const createCall = articles.createImportedDraft.mock.calls.at(0);
    expect(createCall).toBeDefined();
    if (!createCall) throw new Error('Expected an imported draft');
    const [adminId, createInput] = createCall;
    expect(adminId).toBe('admin-id');
    expect(createInput).toMatchObject({
      categoryId,
      importSource: 'guardian',
      externalId: source.externalId,
      canonicalUrl: source.url,
      sourceName: 'The Guardian',
      sourceUrl: source.url,
      thumbnailUrl: source.imageUrl,
      authorName: source.authorName,
    });
    expect(createInput.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(createInput.slug).toMatch(
      /^a-useful-technology-report-[a-f0-9]{12}$/u,
    );
    expect(sentences.parseContent).toHaveBeenCalledWith(
      'admin-id',
      'created-article-id',
      {},
    );
  });

  it.each([
    ['external identity', 0],
    ['canonical URL', 1],
    ['content hash', 2],
  ])('skips a duplicate by %s in precedence order', async (_name, index) => {
    const source = article('technology/2026/jul/30/duplicate');
    client.searchForImport.mockResolvedValue({
      totalArticles: 1,
      articles: [source],
    });
    articles.findImportedDuplicate.mockImplementation(() =>
      Promise.resolve(
        articles.findImportedDuplicate.mock.calls.length - 1 === index
          ? { id: 'existing-id' }
          : null,
      ),
    );
    content.resolve.mockReturnValue(extracted(source));

    const result = await service.sync('admin-id', {
      section: 'technology',
      defaultCategoryId: categoryId,
      pageSize: 5,
      orderBy: 'newest',
    });

    expect(result.counts.skippedDuplicate).toBe(1);
    expect(result.items[0]?.status).toBe('skippedDuplicate');
    expect(articles.createImportedDraft).not.toHaveBeenCalled();
    if (index < 2) expect(content.resolve).not.toHaveBeenCalled();
    const calls = articles.findImportedDuplicate.mock.calls;
    expect(calls[0]?.[0]).toEqual({
      importSource: 'guardian',
      externalId: source.externalId,
    });
    if (index >= 1) {
      expect(calls[1]?.[0]).toEqual({ canonicalUrl: source.url });
    }
    if (index >= 2) {
      expect(calls[2]?.[0].contentHash).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it('derives collision-resistant slugs from the Guardian external identity', async () => {
    const first = article('technology/2026/jul/30/external-a', 'Same title');
    const second = article('technology/2026/jul/30/external-b', 'Same title');
    client.searchForImport.mockResolvedValue({
      totalArticles: 2,
      articles: [first, second],
    });
    content.resolve.mockImplementation((source) => extracted(source));
    articles.createImportedDraft
      .mockResolvedValueOnce({ article: { id: 'article-a' } })
      .mockResolvedValueOnce({ article: { id: 'article-b' } });

    await service.sync('admin-id', {
      q: 'same',
      defaultCategoryId: categoryId,
      pageSize: 5,
      orderBy: 'newest',
    });

    const firstCall = articles.createImportedDraft.mock.calls.at(0);
    const secondCall = articles.createImportedDraft.mock.calls.at(1);
    expect(firstCall?.[1].slug).not.toBe(secondCall?.[1].slug);
  });

  it('keeps later imports after one item fails and compensates parse failure', async () => {
    const first = article('technology/2026/jul/30/first');
    const second = article('technology/2026/jul/30/second');
    client.searchForImport.mockResolvedValue({
      totalArticles: 2,
      articles: [first, second],
    });
    content.resolve.mockImplementation((source) => extracted(source));
    articles.createImportedDraft
      .mockResolvedValueOnce({ article: { id: 'first-id' } })
      .mockResolvedValueOnce({ article: { id: 'second-id' } });
    sentences.parseContent
      .mockRejectedValueOnce(new Error('parse failed'))
      .mockResolvedValueOnce({ sentenceCount: 1 });

    const result = await service.sync('admin-id', {
      q: 'batch',
      defaultCategoryId: categoryId,
      pageSize: 5,
      orderBy: 'newest',
    });

    expect(result.counts).toEqual({
      discovered: 2,
      imported: 1,
      skippedDuplicate: 0,
      failed: 1,
    });
    expect(articles.delete).toHaveBeenCalledWith('admin-id', 'first-id');
    expect(result.items[1]).toMatchObject({
      status: 'imported',
      articleId: 'second-id',
    });
  });

  it('returns a safe failed item for an unavailable body and continues', async () => {
    const first = article('technology/2026/jul/30/missing');
    const second = article('technology/2026/jul/30/usable');
    client.searchForImport.mockResolvedValue({
      totalArticles: 2,
      articles: [first, second],
    });
    content.resolve
      .mockImplementationOnce(() => {
        throw new NewsIngestionError(
          'GUARDIAN_BODY_UNAVAILABLE',
          'Guardian article body is unavailable',
        );
      })
      .mockReturnValueOnce(extracted(second));
    articles.createImportedDraft.mockResolvedValue({
      article: { id: 'second-id' },
    });

    const result = await service.sync('admin-id', {
      q: 'batch',
      defaultCategoryId: categoryId,
      pageSize: 5,
      orderBy: 'newest',
    });

    expect(result.items[0]).toMatchObject({
      status: 'failed',
      errorCode: 'GUARDIAN_BODY_UNAVAILABLE',
      errorMessage: 'Guardian article body is unavailable',
    });
    expect(result.items[1]).toMatchObject({ status: 'imported' });
  });

  it('maps a database uniqueness race to skippedDuplicate', async () => {
    const source = article('technology/2026/jul/30/race');
    client.searchForImport.mockResolvedValue({
      totalArticles: 1,
      articles: [source],
    });
    content.resolve.mockReturnValue(extracted(source));
    articles.createImportedDraft.mockRejectedValue(
      new ImportedArticleDuplicateError(),
    );

    const result = await service.sync('admin-id', {
      q: 'race',
      defaultCategoryId: categoryId,
      pageSize: 5,
      orderBy: 'newest',
    });

    expect(result.counts.skippedDuplicate).toBe(1);
    expect(result.items[0]?.status).toBe('skippedDuplicate');
    expect(articles.delete).not.toHaveBeenCalled();
  });
});
