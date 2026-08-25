import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../../../generated/prisma/client';
import {
  ArticleStatus,
  ReadingStatus,
  TermReviewStatus,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../../src/database/prisma.service';
import { ContextualTermsRepository } from '../../../../src/modules/reading/contextual-terms.repository';
import { ReadingRepository } from '../../../../src/modules/reading/reading.repository';

interface QueryMockArgs {
  where?: Record<string, unknown>;
  select?: unknown;
  orderBy?: unknown;
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
  skip?: number;
  take?: number;
}

type QueryMock = jest.MockedFunction<(args: QueryMockArgs) => Promise<unknown>>;

describe('ReadingRepository', () => {
  const articleFindFirst: QueryMock = jest.fn();
  const profileFindUnique: QueryMock = jest.fn();
  const termFindMany: QueryMock = jest.fn();
  const termFindFirst: QueryMock = jest.fn();
  const progressFindUnique: QueryMock = jest.fn();
  const progressFindMany: QueryMock = jest.fn();
  const progressCount: QueryMock = jest.fn();
  const progressUpsert: QueryMock = jest.fn();
  const progressDeleteMany: QueryMock = jest.fn();
  const vocabularyFindUnique: QueryMock = jest.fn();
  const transactionClient = {
    article: { findFirst: articleFindFirst },
    userProfile: { findUnique: profileFindUnique },
    articleSentenceTerm: {
      findMany: termFindMany,
      findFirst: termFindFirst,
    },
    userArticleProgress: {
      findUnique: progressFindUnique,
      findMany: progressFindMany,
      count: progressCount,
      upsert: progressUpsert,
      deleteMany: progressDeleteMany,
    },
    userVocabulary: { findUnique: vocabularyFindUnique },
  };
  type TransactionInput =
    | Promise<unknown>[]
    | ((client: typeof transactionClient) => Promise<unknown>);
  const transaction = jest.fn((input: TransactionInput) =>
    Array.isArray(input) ? Promise.all(input) : input(transactionClient),
  );
  let repository: ReadingRepository;
  let contextualTermsRepository: ContextualTermsRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    transaction.mockImplementation((input: TransactionInput) =>
      Array.isArray(input) ? Promise.all(input) : input(transactionClient),
    );
    profileFindUnique.mockResolvedValue({
      currentCefrLevel: 'B1',
      learningGoal: 'C1',
    });
    termFindMany.mockResolvedValue([]);
    progressFindUnique.mockResolvedValue(null);
    progressFindMany.mockResolvedValue([]);
    progressCount.mockResolvedValue(0);
    progressUpsert.mockResolvedValue(null);
    progressDeleteMany.mockResolvedValue({ count: 0 });
    vocabularyFindUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadingRepository,
        {
          provide: PrismaService,
          useValue: {
            article: { findFirst: articleFindFirst },
            articleSentenceTerm: { findFirst: termFindFirst },
            userArticleProgress: {
              findMany: progressFindMany,
              count: progressCount,
              deleteMany: progressDeleteMany,
            },
            $transaction: transaction,
          },
        },
      ],
    }).compile();

    repository = module.get(ReadingRepository);
    contextualTermsRepository = new ContextualTermsRepository({
      articleSentenceTerm: { findFirst: termFindFirst },
      $transaction: transaction,
    } as unknown as PrismaService);
  });

  it('selects only approved active current-version lookup terms for readers', async () => {
    articleFindFirst.mockResolvedValue({
      id: 'article-id',
      title: 'Article',
      slug: 'article',
      summary: 'Summary',
      contentHtml: '<p>Safe</p>',
      contentVersion: 7,
      sourceName: null,
      sourceUrl: null,
      authorName: null,
      thumbnailUrl: null,
      cefrLevel: 'B1',
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date(),
      category: { id: 'category-id', name: 'News', slug: 'news' },
    });

    const result = await repository.findReaderArticle('user-id', 'article');

    expect(articleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'article', status: ArticleStatus.PUBLISHED },
      }),
    );
    expect(profileFindUnique).toHaveBeenCalledWith({
      where: { userId: 'user-id' },
      select: { currentCefrLevel: true, learningGoal: true },
    });
    expect(result).toMatchObject({
      userCefrLevel: 'B1',
      userTargetCefrLevel: 'C1',
    });
    expect(termFindMany).toHaveBeenCalledWith({
      where: {
        reviewStatus: TermReviewStatus.APPROVED,
        isActive: true,
        isLookupEnabled: true,
        sentence: {
          is: {
            articleId: 'article-id',
            contentVersion: 7,
            isActive: true,
          },
        },
      },
      orderBy: { id: 'asc' },
      select: { id: true, cefrLevel: true },
    });
  });

  it('serializes queries on the interactive transaction client', async () => {
    articleFindFirst.mockResolvedValue({
      id: 'article-id',
      title: 'Article',
      slug: 'article',
      summary: 'Summary',
      contentHtml: '<p>Safe</p>',
      contentVersion: 7,
      sourceName: null,
      sourceUrl: null,
      authorName: null,
      thumbnailUrl: null,
      cefrLevel: 'B1',
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date(),
      category: { id: 'category-id', name: 'News', slug: 'news' },
    });
    let resolveProfile!: (value: {
      currentCefrLevel: string;
      learningGoal: string;
    }) => void;
    profileFindUnique.mockReturnValue(
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
    );

    const result = repository.findReaderArticle('user-id', 'article');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(profileFindUnique).toHaveBeenCalledTimes(1);
    expect(termFindMany).not.toHaveBeenCalled();
    expect(progressFindUnique).not.toHaveBeenCalled();

    resolveProfile({ currentCefrLevel: 'B1', learningGoal: 'C1' });
    await result;

    expect(termFindMany).toHaveBeenCalledTimes(1);
    expect(progressFindUnique).toHaveBeenCalledTimes(1);
  });

  it('reads progress by authenticated user and article without any mutation', async () => {
    articleFindFirst.mockResolvedValue({
      id: 'article-id',
      title: 'Article',
      slug: 'article',
      summary: 'Summary',
      contentHtml: '<p>Safe</p>',
      contentVersion: 2,
      sourceName: null,
      sourceUrl: null,
      authorName: null,
      thumbnailUrl: null,
      cefrLevel: 'B1',
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date(),
      category: { id: 'category-id', name: 'News', slug: 'news' },
    });

    await repository.findReaderArticle('owner-id', 'article');

    expect(progressFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_articleId: {
            userId: 'owner-id',
            articleId: 'article-id',
          },
        },
      }),
    );
    expect(JSON.stringify(transactionClient)).not.toMatch(
      /create|update|upsert/i,
    );
  });

  it('rejects pending, rejected, inactive, and stale lookup rows while preserving approved disabled state for 403 mapping', async () => {
    articleFindFirst.mockResolvedValue({
      id: 'article-id',
      contentVersion: 9,
    });
    termFindFirst.mockResolvedValue(null);

    await contextualTermsRepository.findContextualTerm(
      'user-id',
      'article-id',
      'term-id',
    );

    const query = termFindFirst.mock.calls[0][0];
    expect(query.where).toEqual({
      id: 'term-id',
      reviewStatus: TermReviewStatus.APPROVED,
      isActive: true,
      sentence: {
        is: {
          articleId: 'article-id',
          contentVersion: 9,
          isActive: true,
        },
      },
    });
    expect(query.where).not.toHaveProperty('isLookupEnabled');
  });

  it('isolates exact contextual save state by authenticated user ID', async () => {
    articleFindFirst.mockResolvedValue({
      id: 'article-id',
      contentVersion: 3,
    });
    termFindFirst.mockResolvedValue({
      id: 'term-id',
      value: 'harmful',
      wordDisplay: 'harmful',
      lemma: 'harmful',
      unitType: 'WORD',
      partOfSpeech: 'adjective',
      ipa: null,
      cefrLevel: 'B1',
      contextualMeaningVi: 'có hại',
      definitionEn: null,
      contextualExplanation: null,
      synonyms: [],
      antonyms: [],
      collocations: [],
      relatedTerms: [],
      vocabularyTopic: null,
      examples: [],
      skill: null,
      isLookupEnabled: true,
      sentence: {
        id: 'sentence-id',
        sentenceOrder: 1,
        sentenceText: 'It is harmful.',
        translationVi: null,
        explanationVi: null,
        referenceExplanation: null,
        skill: null,
      },
    });

    await contextualTermsRepository.findContextualTerm(
      'owner-id',
      'article-id',
      'term-id',
    );

    expect(vocabularyFindUnique).toHaveBeenCalledWith({
      where: {
        userId_articleSentenceTermId: {
          userId: 'owner-id',
          articleSentenceTermId: 'term-id',
        },
      },
      select: { id: true, learningStatus: true },
    });
    expect(JSON.stringify(termFindFirst.mock.calls[0][0].select)).not.toMatch(
      /createdAt|updatedAt|createdBy|updatedBy|normalizedLemma/,
    );
  });

  it('does not query save state when contextual lookup is disabled', async () => {
    articleFindFirst.mockResolvedValue({
      id: 'article-id',
      contentVersion: 3,
    });
    termFindFirst.mockResolvedValue({
      id: 'term-id',
      isLookupEnabled: false,
      sentence: { id: 'sentence-id' },
    });

    await contextualTermsRepository.findContextualTerm(
      'owner-id',
      'article-id',
      'term-id',
    );

    expect(vocabularyFindUnique).not.toHaveBeenCalled();
  });

  it('paginates and filters owner history in the database while retaining archived articles', async () => {
    const archived = {
      articleId: 'article-id',
      status: ReadingStatus.READING,
      progressPercent: new Prisma.Decimal('25'),
      lastBlockKey: null,
      completedAt: null,
      firstOpenedAt: new Date('2026-07-20T01:00:00Z'),
      lastReadAt: new Date('2026-07-23T01:00:00Z'),
      article: {
        id: 'article-id',
        title: 'Archived history',
        slug: 'archived-history',
        summary: 'Historical article',
        thumbnailUrl: null,
        cefrLevel: 'B1',
        status: ArticleStatus.ARCHIVED,
        publishedAt: new Date('2026-07-01T01:00:00Z'),
        category: { id: 'category-id', name: 'News', slug: 'news' },
      },
    };
    progressFindMany.mockResolvedValue([archived]);
    progressCount.mockResolvedValue(1);

    await expect(
      repository.listUserHistory('owner-id', {
        page: 2,
        limit: 10,
        status: ReadingStatus.READING,
        sort: 'oldest',
      }),
    ).resolves.toEqual({ items: [archived], total: 1 });

    const query = progressFindMany.mock.calls[0][0];
    expect(query).toMatchObject({
      where: { userId: 'owner-id', status: ReadingStatus.READING },
      skip: 10,
      take: 10,
      orderBy: [{ lastReadAt: 'asc' }, { id: 'asc' }],
    });
    expect(JSON.stringify(query)).not.toContain('contentHtml');
    expect(JSON.stringify(query.where)).not.toContain(ArticleStatus.PUBLISHED);
    expect(progressCount).toHaveBeenCalledWith({ where: query.where });
  });

  it('gets owner progress through a published article projection without writing', async () => {
    articleFindFirst.mockResolvedValue({
      id: 'article-id',
      readerProgress: [],
    });

    await expect(
      repository.findUserArticleProgress('owner-id', 'article-id'),
    ).resolves.toEqual({ articleId: 'article-id', progress: null });

    expect(articleFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'article-id',
        status: ArticleStatus.PUBLISHED,
      },
      select: {
        id: true,
        readerProgress: {
          where: { userId: 'owner-id' },
          take: 1,
          select: {
            articleId: true,
            status: true,
            progressPercent: true,
            lastBlockKey: true,
            completedAt: true,
          },
        },
      },
    });
    expect(progressUpsert).not.toHaveBeenCalled();
  });

  it('uses native compound-key upsert so concurrent first writes converge on one user/article row', async () => {
    articleFindFirst.mockResolvedValue({ id: 'article-id' });
    progressFindUnique.mockResolvedValue(null);
    progressUpsert.mockResolvedValue({
      articleId: 'article-id',
      status: ReadingStatus.READING,
      progressPercent: new Prisma.Decimal('100'),
      lastBlockKey: null,
      completedAt: null,
    });

    await Promise.all([
      repository.upsertUserArticleProgress('owner-id', 'article-id', {
        progressPercent: 100,
      }),
      repository.upsertUserArticleProgress('owner-id', 'article-id', {
        progressPercent: 100,
      }),
    ]);

    expect(progressUpsert).toHaveBeenCalledTimes(2);
    for (const [query] of progressUpsert.mock.calls) {
      expect(query).toMatchObject({
        where: {
          userId_articleId: {
            userId: 'owner-id',
            articleId: 'article-id',
          },
        },
        create: {
          userId: 'owner-id',
          articleId: 'article-id',
          status: ReadingStatus.READING,
          progressPercent: 100,
          completedAt: null,
        },
      });
    }
    expect(transaction.mock.calls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('preserves omitted fields during a READING partial upsert', async () => {
    articleFindFirst.mockResolvedValue({ id: 'article-id' });
    progressFindUnique.mockResolvedValue({
      status: ReadingStatus.READING,
      completedAt: null,
    });
    progressUpsert.mockResolvedValue({
      articleId: 'article-id',
      status: ReadingStatus.READING,
      progressPercent: new Prisma.Decimal('40'),
      lastBlockKey: 'paragraph-4',
      completedAt: null,
    });

    await repository.upsertUserArticleProgress('owner-id', 'article-id', {
      lastBlockKey: 'paragraph-4',
    });

    expect(progressUpsert.mock.calls[0][0].update).toMatchObject({
      status: ReadingStatus.READING,
      completedAt: null,
      lastBlockKey: 'paragraph-4',
    });
    expect(progressUpsert.mock.calls[0][0].update).not.toHaveProperty(
      'progressPercent',
    );
  });

  it('does not silently reopen a COMPLETED row through REA-005', async () => {
    const completedAt = new Date('2026-07-23T03:00:00Z');
    articleFindFirst.mockResolvedValue({ id: 'article-id' });
    progressFindUnique.mockResolvedValue({
      status: ReadingStatus.COMPLETED,
      completedAt,
    });
    progressUpsert.mockResolvedValue({
      articleId: 'article-id',
      status: ReadingStatus.COMPLETED,
      progressPercent: new Prisma.Decimal('100'),
      lastBlockKey: null,
      completedAt,
    });

    await repository.upsertUserArticleProgress('owner-id', 'article-id', {
      progressPercent: 20,
    });

    expect(progressUpsert.mock.calls[0][0].update).toMatchObject({
      status: ReadingStatus.COMPLETED,
      progressPercent: 100,
      completedAt,
    });
  });

  it('completes atomically and preserves completedAt on repeated calls', async () => {
    const completedAt = new Date('2026-07-23T03:00:00Z');
    articleFindFirst.mockResolvedValue({ id: 'article-id' });
    progressFindUnique.mockResolvedValue({ completedAt });
    progressUpsert.mockResolvedValue({
      articleId: 'article-id',
      status: ReadingStatus.COMPLETED,
      progressPercent: new Prisma.Decimal('100'),
      lastBlockKey: null,
      completedAt,
    });

    await repository.completeUserArticleProgress('owner-id', 'article-id');

    expect(progressUpsert.mock.calls[0][0]).toMatchObject({
      where: {
        userId_articleId: {
          userId: 'owner-id',
          articleId: 'article-id',
        },
      },
      update: {
        status: ReadingStatus.COMPLETED,
        progressPercent: 100,
        completedAt,
      },
    });
  });

  it('deletes only the authenticated user/article progress row', async () => {
    progressDeleteMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.deleteUserArticleProgress('owner-id', 'article-id'),
    ).resolves.toBe(true);

    expect(progressDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'owner-id', articleId: 'article-id' },
    });
  });

  it('projects the published active source needed for an immutable vocabulary snapshot', async () => {
    termFindFirst.mockResolvedValue({
      id: 'term-id',
      value: 'harmful',
      wordDisplay: 'harmful',
      lemma: 'harmful',
      unitType: 'WORD',
      partOfSpeech: 'adjective',
      ipa: null,
      cefrLevel: 'B1',
      contextualMeaningVi: 'có hại',
      definitionEn: null,
      contextualExplanation: null,
      synonyms: [],
      antonyms: [],
      collocations: [],
      relatedTerms: [],
      vocabularyTopic: null,
      examples: [],
      skill: null,
      isLookupEnabled: true,
      sentence: {
        id: 'sentence-id',
        sentenceOrder: 1,
        sentenceText: 'It is harmful.',
        translationVi: 'Điều đó có hại.',
        explanationVi: null,
        referenceExplanation: null,
        skill: null,
        contentVersion: 4,
        article: { id: 'article-id', contentVersion: 4 },
      },
    });

    await expect(
      contextualTermsRepository.findContextualTermForSave('term-id'),
    ).resolves.toMatchObject({
      term: { id: 'term-id' },
      parentSentence: { id: 'sentence-id', contentVersion: 4 },
      sourceArticle: { id: 'article-id', contentVersion: 4 },
      isLookupEnabled: true,
    });

    const query = termFindFirst.mock.calls[0][0];
    expect(query.where).toEqual({
      id: 'term-id',
      reviewStatus: TermReviewStatus.APPROVED,
      isActive: true,
      sentence: {
        is: {
          isActive: true,
          article: { is: { status: ArticleStatus.PUBLISHED } },
        },
      },
    });
    expect(JSON.stringify(query.select)).not.toMatch(
      /createdAt|updatedAt|createdBy|updatedBy|contentHtml/,
    );
  });
});
