import {
  AiGenerationStatus,
  ArticleStatus,
  TermOrigin,
  TermReviewStatus,
} from '../../../../../generated/prisma/enums';
import { PrismaService } from '../../../../../src/database/prisma.service';
import {
  ArticleTermReferencedError,
  ArticleTermStateConflictError,
  type CreateArticleTermInput,
  type TermMarkerWriteInput,
  ArticleTermsRepository,
} from '../../../../../src/modules/articles/repositories/article-terms.repository';

describe('ArticleTermsRepository', () => {
  const article = {
    findUnique: jest.fn<Promise<unknown>, [unknown]>(),
    updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
  };
  const articleSentence = {
    count: jest.fn<Promise<number>, [unknown]>(),
  };
  const articleSentenceTerm = {
    create: jest.fn<Promise<unknown>, [unknown]>(),
    findMany: jest.fn<Promise<unknown[]>, [unknown]>(),
    findUnique: jest.fn<Promise<unknown>, [unknown]>(),
    count: jest.fn<Promise<number>, [unknown]>(),
    updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
    deleteMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
  };
  const userVocabulary = {
    count: jest.fn<Promise<number>, [unknown]>(),
  };
  const quizQuestion = {
    count: jest.fn<Promise<number>, [unknown]>(),
  };
  const reviewAnswer = {
    count: jest.fn<Promise<number>, [unknown]>(),
  };
  const transactionClient = {
    article,
    articleSentence,
    articleSentenceTerm,
    userVocabulary,
    quizQuestion,
    reviewAnswer,
  };
  const prisma = {
    ...transactionClient,
    $transaction: jest.fn(
      (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    ),
  };
  const repository = new ArticleTermsRepository(
    prisma as unknown as PrismaService,
  );
  const marker: TermMarkerWriteInput = {
    articleId: 'article-id',
    sentenceId: 'sentence-id',
    termId: 'term-id',
    contentVersion: 3,
    sourceContentHtml: '<p>old</p>',
    updatedContentHtml: '<p>new</p>',
    actingAdminId: 'admin-id',
  };
  const termInput: CreateArticleTermInput = {
    id: 'term-id',
    sentenceId: 'sentence-id',
    value: 'term',
    wordDisplay: 'term',
    lemma: 'term',
    normalizedLemma: 'term',
    unitType: 'WORD',
    partOfSpeech: 'noun',
    cefrLevel: 'B1',
    contextualMeaningVi: 'nghĩa',
    synonyms: [],
    antonyms: [],
    collocations: [],
    relatedTerms: [],
    examples: [],
    isLookupEnabled: true,
    isActive: true,
    createdByUserId: 'admin-id',
    updatedByUserId: 'admin-id',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    article.updateMany.mockResolvedValue({ count: 1 });
    articleSentence.count.mockResolvedValue(1);
    articleSentenceTerm.count.mockResolvedValue(1);
    articleSentenceTerm.create.mockResolvedValue({ id: 'term-id' });
    articleSentenceTerm.findUnique.mockResolvedValue({ id: 'term-id' });
    articleSentenceTerm.updateMany.mockResolvedValue({ count: 1 });
    articleSentenceTerm.deleteMany.mockResolvedValue({ count: 1 });
    userVocabulary.count.mockResolvedValue(0);
    quizQuestion.count.mockResolvedValue(0);
    reviewAnswer.count.mockResolvedValue(0);
  });

  it('creates a term and updates matching current HTML in one transaction', async () => {
    await repository.createTermWithMarker(marker, termInput);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(articleSentence.count).toHaveBeenCalledWith({
      where: {
        id: 'sentence-id',
        articleId: 'article-id',
        contentVersion: 3,
        isActive: true,
      },
    });
    expect(article.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'article-id',
        contentVersion: 3,
        contentHtml: '<p>old</p>',
        status: { not: ArticleStatus.ARCHIVED },
      },
      data: { contentHtml: '<p>new</p>', updatedByUserId: 'admin-id' },
    });
    expect(articleSentenceTerm.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          ...termInput,
          origin: TermOrigin.MANUAL,
          reviewStatus: TermReviewStatus.APPROVED,
          explanationStatus: AiGenerationStatus.READY,
        },
      }),
    );
  });

  it('paginates and filters terms through current-version sentence ownership', async () => {
    article.findUnique.mockResolvedValue({ contentVersion: 4 });
    articleSentenceTerm.findMany.mockResolvedValue([]);
    articleSentenceTerm.count.mockResolvedValue(0);

    await repository.findTerms('article-id', {
      page: 2,
      limit: 10,
      sentenceId: 'sentence-id',
      cefrLevel: 'B2',
      unitType: 'PHRASE',
      origin: TermOrigin.AI,
      reviewStatus: TermReviewStatus.PENDING,
      explanationStatus: AiGenerationStatus.FAILED,
      isActive: false,
      q: 'digital',
    });

    const findManyInput = articleSentenceTerm.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      skip: number;
      take: number;
      orderBy: object[];
    };
    expect(findManyInput.where).toMatchObject({
      sentenceId: 'sentence-id',
      cefrLevel: 'B2',
      unitType: 'PHRASE',
      origin: TermOrigin.AI,
      reviewStatus: TermReviewStatus.PENDING,
      explanationStatus: AiGenerationStatus.FAILED,
      isActive: false,
      sentence: {
        is: { articleId: 'article-id', contentVersion: 4 },
      },
    });
    expect(findManyInput).toMatchObject({
      skip: 10,
      take: 10,
      orderBy: [
        { sentence: { sentenceOrder: 'asc' } },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });
  });

  it('atomically updates HTML and approves only a pending AI candidate', async () => {
    await repository.approveAiTermWithMarker(marker);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(article.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'article-id',
        status: ArticleStatus.DRAFT,
        contentVersion: 3,
        contentHtml: '<p>old</p>',
      },
      data: {
        contentHtml: '<p>new</p>',
        updatedByUserId: 'admin-id',
      },
    });
    expect(articleSentenceTerm.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'term-id',
        sentenceId: 'sentence-id',
        origin: TermOrigin.AI,
        reviewStatus: TermReviewStatus.PENDING,
        isActive: false,
        isLookupEnabled: false,
      },
      data: {
        reviewStatus: TermReviewStatus.APPROVED,
        isActive: true,
        isLookupEnabled: true,
        updatedByUserId: 'admin-id',
      },
    });
  });

  it('does not update a candidate when the article HTML or version is stale', async () => {
    article.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      repository.approveAiTermWithMarker(marker),
    ).rejects.toBeInstanceOf(ArticleTermStateConflictError);
    expect(articleSentenceTerm.updateMany).not.toHaveBeenCalled();
  });

  it('atomically rejects a pending AI candidate without changing HTML', async () => {
    await repository.rejectAiTerm('article-id', 3, 'term-id', 'admin-id');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(article.updateMany).not.toHaveBeenCalled();
    expect(articleSentenceTerm.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'term-id',
        origin: TermOrigin.AI,
        reviewStatus: TermReviewStatus.PENDING,
        sentence: {
          is: {
            articleId: 'article-id',
            contentVersion: 3,
            article: {
              is: {
                contentVersion: 3,
                status: ArticleStatus.DRAFT,
              },
            },
          },
        },
      },
      data: {
        reviewStatus: TermReviewStatus.REJECTED,
        isActive: false,
        isLookupEnabled: false,
        updatedByUserId: 'admin-id',
      },
    });
  });

  it('rejects a stale candidate transition before returning a partial result', async () => {
    articleSentenceTerm.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      repository.rejectAiTerm('article-id', 3, 'term-id', 'admin-id'),
    ).rejects.toBeInstanceOf(ArticleTermStateConflictError);
    expect(articleSentenceTerm.findUnique).not.toHaveBeenCalled();
  });

  it('checks all historical references before changing HTML or deleting', async () => {
    quizQuestion.count.mockResolvedValue(1);

    await expect(
      repository.deleteTermWithMarker(marker),
    ).rejects.toBeInstanceOf(ArticleTermReferencedError);
    expect(article.updateMany).not.toHaveBeenCalled();
    expect(articleSentenceTerm.deleteMany).not.toHaveBeenCalled();
  });

  it('scopes an unused delete to the current article, version, and sentence', async () => {
    await repository.deleteTermWithMarker(marker);

    const currentWhere = {
      id: 'term-id',
      sentenceId: 'sentence-id',
      sentence: {
        is: { articleId: 'article-id', contentVersion: 3 },
      },
    };
    expect(articleSentenceTerm.count).toHaveBeenCalledWith({
      where: currentWhere,
    });
    expect(articleSentenceTerm.deleteMany).toHaveBeenCalledWith({
      where: currentWhere,
    });
  });
});
