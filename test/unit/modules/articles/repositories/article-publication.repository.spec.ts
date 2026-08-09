import { ArticleStatus, CefrLevel } from '../../../../../generated/prisma/enums';
import { PrismaService } from '../../../../../src/database/prisma.service';
import {
  ArticleStatusTransitionConflictError,
  ArticlesRepository,
} from '../../../../../src/modules/articles/repositories/articles.repository';

describe('ArticlesRepository publication operations', () => {
  const article = {
    findUnique: jest.fn<Promise<unknown>, [unknown]>(),
    updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
  };
  const articleSentence = {
    findMany: jest.fn<Promise<unknown[]>, [unknown]>(),
  };
  const transactionClient = { article, articleSentence };
  const prisma = {
    ...transactionClient,
    $transaction: jest.fn(
      (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    ),
  };
  const repository = new ArticlesRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    articleSentence.findMany.mockResolvedValue([]);
    article.updateMany.mockResolvedValue({ count: 1 });
  });

  it('loads only current-version sentences and their projected terms', async () => {
    article.findUnique.mockResolvedValue({
      id: 'article-id',
      contentVersion: 4,
    });

    await repository.findPublicationSnapshot('article-id');

    const findManyInput = articleSentence.findMany.mock.calls[0][0] as {
      where: object;
      orderBy: object[];
      select: {
        id: boolean;
        sentenceText: boolean;
        isActive: boolean;
        terms: { orderBy: object[]; select: Record<string, boolean> };
      };
    };
    expect(findManyInput.where).toEqual({
      articleId: 'article-id',
      contentVersion: 4,
    });
    expect(findManyInput.orderBy).toEqual([
      { sentenceOrder: 'asc' },
      { id: 'asc' },
    ]);
    expect(findManyInput.select).toMatchObject({
      id: true,
      sentenceText: true,
      isActive: true,
    });
    expect(findManyInput.select.terms.orderBy).toEqual([
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
    expect(findManyInput.select.terms.select).toMatchObject({
      id: true,
      sentenceId: true,
      value: true,
      cefrLevel: true,
      isLookupEnabled: true,
      isActive: true,
    });
  });

  it('publishes with a conditional status/version/HTML/category update', async () => {
    const publishedAt = new Date('2026-07-23T00:00:00Z');
    article.findUnique.mockResolvedValue({
      id: 'article-id',
      status: ArticleStatus.PUBLISHED,
      publishedAt,
      archivedAt: null,
    });

    await repository.transitionArticleStatus({
      articleId: 'article-id',
      expectedStatus: ArticleStatus.DRAFT,
      expectedContentVersion: 4,
      expectedContentHtml: '<p>source</p>',
      requireActiveCategory: true,
      status: ArticleStatus.PUBLISHED,
      publishedAt,
      archivedAt: null,
      updatedByUserId: 'admin-id',
    });

    expect(article.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'article-id',
        status: ArticleStatus.DRAFT,
        contentVersion: 4,
        contentHtml: '<p>source</p>',
        category: { is: { isActive: true } },
      },
      data: {
        status: ArticleStatus.PUBLISHED,
        publishedAt,
        archivedAt: null,
        updatedByUserId: 'admin-id',
      },
    });
  });

  it('does not overwrite publishedAt when archiving', async () => {
    article.findUnique.mockResolvedValue({
      id: 'article-id',
      status: ArticleStatus.ARCHIVED,
      publishedAt: new Date('2026-07-20T00:00:00Z'),
      archivedAt: new Date('2026-07-23T00:00:00Z'),
      cefrLevel: CefrLevel.B1,
    });

    await repository.transitionArticleStatus({
      articleId: 'article-id',
      expectedStatus: ArticleStatus.PUBLISHED,
      expectedContentVersion: 4,
      expectedContentHtml: '<p>source</p>',
      status: ArticleStatus.ARCHIVED,
      archivedAt: new Date('2026-07-23T00:00:00Z'),
      updatedByUserId: 'admin-id',
    });

    const updateInput = article.updateMany.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateInput.data).not.toHaveProperty('publishedAt');
  });

  it('raises a domain conflict when the conditional update loses a race', async () => {
    article.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.transitionArticleStatus({
        articleId: 'article-id',
        expectedStatus: ArticleStatus.DRAFT,
        expectedContentVersion: 4,
        expectedContentHtml: '<p>source</p>',
        status: ArticleStatus.ARCHIVED,
        archivedAt: new Date(),
        updatedByUserId: 'admin-id',
      }),
    ).rejects.toBeInstanceOf(ArticleStatusTransitionConflictError);
    expect(article.findUnique).not.toHaveBeenCalled();
  });
});
