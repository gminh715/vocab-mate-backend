import { Prisma } from '../../../../../generated/prisma/client';
import { ArticleStatus } from '../../../../../generated/prisma/enums';
import { PrismaService } from '../../../../../src/database/prisma.service';
import { ArticlesRepository } from '../../../../../src/modules/articles/repositories/articles.repository';

type FindManyMock = jest.MockedFunction<
  (args: Prisma.ArticleFindManyArgs) => Promise<unknown[]>
>;
type ArticleCountMock = jest.MockedFunction<
  (args: Prisma.ArticleCountArgs) => Promise<number>
>;
type FindUniqueMock = jest.MockedFunction<
  (args: Prisma.ArticleFindUniqueArgs) => Promise<unknown>
>;
type CreateMock = jest.MockedFunction<
  (args: Prisma.ArticleCreateArgs) => Promise<unknown>
>;
type UpdateMock = jest.MockedFunction<
  (args: Prisma.ArticleUpdateArgs) => Promise<unknown>
>;
type DeleteMock = jest.MockedFunction<
  (args: Prisma.ArticleDeleteArgs) => Promise<unknown>
>;
type SentenceCountMock = jest.MockedFunction<
  (args: Prisma.ArticleSentenceCountArgs) => Promise<number>
>;
type SentenceUpdateManyMock = jest.MockedFunction<
  (args: Prisma.ArticleSentenceUpdateManyArgs) => Promise<unknown>
>;
type TermCountMock = jest.MockedFunction<
  (args: Prisma.ArticleSentenceTermCountArgs) => Promise<number>
>;
type QuizCountMock = jest.MockedFunction<
  (args: Prisma.QuizCountArgs) => Promise<number>
>;
type ProgressCountMock = jest.MockedFunction<
  (args: Prisma.UserArticleProgressCountArgs) => Promise<number>
>;
type VocabularyCountMock = jest.MockedFunction<
  (args: Prisma.UserVocabularyCountArgs) => Promise<number>
>;
type ReviewSessionCountMock = jest.MockedFunction<
  (args: Prisma.ReviewSessionCountArgs) => Promise<number>
>;
type ReviewAnswerCountMock = jest.MockedFunction<
  (args: Prisma.ReviewAnswerCountArgs) => Promise<number>
>;

describe('ArticlesRepository admin queries', () => {
  const articleFindMany: FindManyMock = jest.fn();
  const articleCount: ArticleCountMock = jest.fn();
  const articleFindUnique: FindUniqueMock = jest.fn();
  const articleCreate: CreateMock = jest.fn();
  const articleUpdate: UpdateMock = jest.fn();
  const articleDelete: DeleteMock = jest.fn();
  const sentenceCount: SentenceCountMock = jest.fn();
  const sentenceUpdateMany: SentenceUpdateManyMock = jest.fn();
  const termCount: TermCountMock = jest.fn();
  const quizCount: QuizCountMock = jest.fn();
  const progressCount: ProgressCountMock = jest.fn();
  const vocabularyCount: VocabularyCountMock = jest.fn();
  const reviewSessionCount: ReviewSessionCountMock = jest.fn();
  const reviewAnswerCount: ReviewAnswerCountMock = jest.fn();
  const prismaModels = {
    article: {
      findMany: articleFindMany,
      count: articleCount,
      findUnique: articleFindUnique,
      create: articleCreate,
      update: articleUpdate,
      delete: articleDelete,
    },
    articleSentence: { count: sentenceCount, updateMany: sentenceUpdateMany },
    articleSentenceTerm: { count: termCount },
    quiz: { count: quizCount },
    userArticleProgress: { count: progressCount },
    userVocabulary: { count: vocabularyCount },
    reviewSession: { count: reviewSessionCount },
    reviewAnswer: { count: reviewAnswerCount },
  };
  type PrismaMock = typeof prismaModels & {
    $transaction: TransactionMock;
  };
  type TransactionArgument =
    Promise<unknown>[] | ((tx: PrismaMock) => Promise<unknown>);
  type TransactionMock = jest.MockedFunction<
    (argument: TransactionArgument) => Promise<unknown>
  >;
  const transaction: TransactionMock = jest.fn((argument) =>
    typeof argument === 'function' ? argument(prisma) : Promise.all(argument),
  );
  const prisma: PrismaMock = { ...prismaModels, $transaction: transaction };
  const repository = new ArticlesRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    articleFindMany.mockResolvedValue([]);
    articleCount.mockResolvedValue(0);
    sentenceCount.mockResolvedValue(0);
    termCount.mockResolvedValue(0);
    quizCount.mockResolvedValue(0);
    progressCount.mockResolvedValue(0);
    vocabularyCount.mockResolvedValue(0);
    reviewSessionCount.mockResolvedValue(0);
    reviewAnswerCount.mockResolvedValue(0);
  });

  it('combines admin filters in PostgreSQL and excludes content from list projection', async () => {
    await repository.findAdminArticles({
      page: 2,
      limit: 10,
      q: 'learning',
      categoryId: 'category-id',
      cefrLevel: 'B2',
      status: ArticleStatus.ARCHIVED,
      sort: 'newest',
    });

    const query = articleFindMany.mock.calls[0][0];
    expect(query).toMatchObject({
      where: {
        OR: [
          { title: { contains: 'learning', mode: 'insensitive' } },
          { summary: { contains: 'learning', mode: 'insensitive' } },
        ],
        categoryId: 'category-id',
        cefrLevel: 'B2',
        status: ArticleStatus.ARCHIVED,
      },
      skip: 10,
      take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    expect(JSON.stringify(query.select)).not.toContain('contentHtml');
    expect(JSON.stringify(query.select)).not.toContain('quizzes');
    expect(JSON.stringify(query.select)).not.toContain('sentences');
    expect(articleCount).toHaveBeenCalledWith({ where: query.where });
  });

  it.each([
    ['newest', 'desc'],
    ['oldest', 'asc'],
  ] as const)(
    'maps %s to stable createdAt and ID ordering',
    async (sort, direction) => {
      await repository.findAdminArticles({ page: 1, limit: 20, sort });
      expect(articleFindMany.mock.calls[0][0].orderBy).toEqual([
        { createdAt: direction },
        { id: 'asc' },
      ]);
    },
  );

  it('counts active sentences and terms from only the current content version', async () => {
    articleFindUnique.mockResolvedValue({
      id: 'article-id',
      contentVersion: 3,
      title: 'Article',
    });
    sentenceCount.mockResolvedValue(4);
    termCount.mockResolvedValue(9);
    quizCount.mockResolvedValue(2);

    await expect(
      repository.findAdminArticleDetail('article-id'),
    ).resolves.toMatchObject({ sentenceCount: 4, termCount: 9, quizCount: 2 });
    const currentWhere = {
      articleId: 'article-id',
      contentVersion: 3,
      isActive: true,
    };
    expect(sentenceCount).toHaveBeenCalledWith({ where: currentWhere });
    expect(termCount).toHaveBeenCalledWith({
      where: {
        isActive: true,
        sentence: { is: currentWhere },
      },
    });
    expect(quizCount).toHaveBeenCalledWith({
      where: { articleId: 'article-id' },
    });
    expect(JSON.stringify(articleFindUnique.mock.calls[0][0])).not.toContain(
      'createdBy',
    );
  });

  it('serializes count queries on the interactive transaction client', async () => {
    articleFindUnique.mockResolvedValue({
      id: 'article-id',
      contentVersion: 3,
      title: 'Article',
    });
    let resolveSentenceCount!: (value: number) => void;
    sentenceCount.mockReturnValue(
      new Promise((resolve) => {
        resolveSentenceCount = resolve;
      }),
    );

    const result = repository.findAdminArticleDetail('article-id');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(sentenceCount).toHaveBeenCalledTimes(1);
    expect(termCount).not.toHaveBeenCalled();
    expect(quizCount).not.toHaveBeenCalled();

    resolveSentenceCount(4);
    await result;

    expect(termCount).toHaveBeenCalledTimes(1);
    expect(quizCount).toHaveBeenCalledTimes(1);
  });

  it('forces draft/version/timestamps and trusted audits on create', async () => {
    articleCreate.mockResolvedValue({ id: 'article-id' });

    await repository.create({
      categoryId: 'category-id',
      title: 'Article',
      slug: 'article',
      summary: 'Summary',
      contentHtml: '<p>Content</p>',
      cefrLevel: 'B1',
      createdByUserId: 'admin-id',
      updatedByUserId: 'admin-id',
    });

    expect(articleCreate.mock.calls[0][0].data).toMatchObject({
      status: ArticleStatus.DRAFT,
      contentVersion: 1,
      publishedAt: null,
      archivedAt: null,
      createdByUserId: 'admin-id',
      updatedByUserId: 'admin-id',
    });
  });

  it('increments contentVersion once and invalidates the previous cache atomically', async () => {
    articleUpdate.mockResolvedValue({ id: 'article-id', contentVersion: 4 });
    sentenceUpdateMany.mockResolvedValue({ count: 5 });

    await repository.updateContent('article-id', 3, {
      contentHtml: '<p>New</p>',
      updatedByUserId: 'admin-id',
    });

    expect(articleUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: 'article-id' },
      data: {
        contentHtml: '<p>New</p>',
        updatedByUserId: 'admin-id',
        contentVersion: { increment: 1 },
      },
    });
    expect(sentenceUpdateMany).toHaveBeenCalledWith({
      where: {
        articleId: 'article-id',
        contentVersion: 3,
        isActive: true,
      },
      data: { isActive: false, updatedByUserId: 'admin-id' },
    });
  });

  it('checks every user-facing reference before hard deletion', async () => {
    articleFindUnique.mockResolvedValue({
      id: 'article-id',
      status: ArticleStatus.DRAFT,
    });

    await repository.findDeleteSafety('article-id');

    expect(progressCount).toHaveBeenCalledWith({
      where: { articleId: 'article-id' },
    });
    expect(vocabularyCount).toHaveBeenCalledWith({
      where: {
        articleSentenceTerm: {
          is: { sentence: { is: { articleId: 'article-id' } } },
        },
      },
    });
    expect(quizCount).toHaveBeenCalledWith({
      where: { articleId: 'article-id' },
    });
    expect(reviewSessionCount).toHaveBeenCalledWith({
      where: { articleId: 'article-id' },
    });
    expect(reviewAnswerCount).toHaveBeenCalled();
  });
});
