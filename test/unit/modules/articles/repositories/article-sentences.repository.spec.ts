import {
  AiGenerationStatus,
  ArticleStatus,
} from '../../../../../generated/prisma/enums';
import { PrismaService } from '../../../../../src/database/prisma.service';
import { ArticleSentencesRepository } from '../../../../../src/modules/articles/repositories/article-sentences.repository';

describe('ArticleSentencesRepository', () => {
  const article = {
    findUnique: jest.fn<Promise<unknown>, [unknown]>(),
    updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
  };
  const articleSentence = {
    count: jest.fn<Promise<number>, [unknown]>(),
    deleteMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
    createMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
    findMany: jest.fn<Promise<unknown[]>, [unknown]>(),
    findFirst: jest.fn<Promise<unknown>, [unknown]>(),
    updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
    findUnique: jest.fn<Promise<unknown>, [unknown]>(),
  };
  const transactionClient = { article, articleSentence };
  const prisma = {
    ...transactionClient,
    $transaction: jest.fn(
      (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    ),
  };
  const repository = new ArticleSentencesRepository(
    prisma as unknown as PrismaService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    article.updateMany.mockResolvedValue({ count: 1 });
    articleSentence.deleteMany.mockResolvedValue({ count: 0 });
    articleSentence.createMany.mockResolvedValue({ count: 2 });
  });

  it('updates matching HTML and replaces current-version rows in one transaction', async () => {
    await repository.replaceParsedContent({
      articleId: 'article-id',
      contentVersion: 3,
      sourceContentHtml: '<p>Source.</p>',
      annotatedContentHtml:
        '<p><span data-sentence-id="sentence-1">Source.</span></p>',
      actingAdminId: 'admin-id',
      resetAiAnalysis: true,
      sentences: [
        { id: 'sentence-1', sentenceOrder: 1, sentenceText: 'Source.' },
      ],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(article.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'article-id',
        contentVersion: 3,
        contentHtml: '<p>Source.</p>',
        status: { not: ArticleStatus.ARCHIVED },
      },
      data: {
        contentHtml:
          '<p><span data-sentence-id="sentence-1">Source.</span></p>',
        updatedByUserId: 'admin-id',
        aiAnalysisStatus: AiGenerationStatus.PENDING,
        aiAnalysisError: null,
      },
    });
    expect(articleSentence.deleteMany).toHaveBeenCalledWith({
      where: { articleId: 'article-id', contentVersion: 3 },
    });
    expect(articleSentence.createMany).toHaveBeenCalledWith({
      data: [
        {
          id: 'sentence-1',
          sentenceOrder: 1,
          sentenceText: 'Source.',
          articleId: 'article-id',
          contentVersion: 3,
          createdByUserId: 'admin-id',
          updatedByUserId: 'admin-id',
        },
      ],
    });
  });

  it('paginates current-version rows in stable sentence order', async () => {
    article.findUnique.mockResolvedValue({ contentVersion: 5 });
    articleSentence.findMany.mockResolvedValue([]);
    articleSentence.count.mockResolvedValue(0);

    await repository.findSentences('article-id', {
      page: 2,
      limit: 10,
      isActive: false,
    });

    expect(articleSentence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          articleId: 'article-id',
          contentVersion: 5,
          isActive: false,
        },
        skip: 10,
        take: 10,
        orderBy: [{ sentenceOrder: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('scopes detail and metadata updates to article and current version', async () => {
    article.findUnique.mockResolvedValue({ contentVersion: 2 });
    articleSentence.findFirst.mockResolvedValue(null);
    await repository.findSentenceDetail('article-id', 'sentence-id');
    const detailQuery = articleSentence.findFirst.mock.calls[0][0] as {
      where: object;
      select: { terms: { orderBy: unknown } };
    };
    expect(detailQuery.where).toEqual({
      id: 'sentence-id',
      articleId: 'article-id',
      contentVersion: 2,
    });
    expect(detailQuery.select.terms.orderBy).toEqual([
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);

    articleSentence.updateMany.mockResolvedValue({ count: 1 });
    articleSentence.findUnique.mockResolvedValue({ id: 'sentence-id' });
    await repository.updateSentence('article-id', 'sentence-id', {
      translationVi: 'Bản dịch',
      updatedByUserId: 'admin-id',
    });
    expect(articleSentence.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'sentence-id',
        articleId: 'article-id',
        contentVersion: 2,
      },
      data: { translationVi: 'Bản dịch', updatedByUserId: 'admin-id' },
    });
  });
});
