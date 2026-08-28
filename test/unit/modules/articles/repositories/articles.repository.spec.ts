import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../../../../generated/prisma/client';
import { ArticleStatus } from '../../../../../generated/prisma/enums';
import { PrismaService } from '../../../../../src/database/prisma.service';
import { ArticlesRepository } from '../../../../../src/modules/articles/repositories/articles.repository';

type FindManyMock = jest.MockedFunction<
  (args: Prisma.ArticleFindManyArgs) => Promise<unknown[]>
>;
type CountMock = jest.MockedFunction<
  (args: Prisma.ArticleCountArgs) => Promise<number>
>;
type FindFirstMock = jest.MockedFunction<
  (args: Prisma.ArticleFindFirstArgs) => Promise<unknown>
>;
type CreateMock = jest.MockedFunction<
  (args: Prisma.ArticleCreateArgs) => Promise<unknown>
>;
type TransactionMock = jest.MockedFunction<
  (operations: Array<Promise<unknown>>) => Promise<unknown[]>
>;

describe('ArticlesRepository', () => {
  let repository: ArticlesRepository;
  let findMany: FindManyMock;
  let count: CountMock;
  let findFirst: FindFirstMock;
  let create: CreateMock;
  let transaction: TransactionMock;

  beforeEach(async () => {
    findMany = jest
      .fn<(args: Prisma.ArticleFindManyArgs) => Promise<unknown[]>>()
      .mockResolvedValue([]);
    count = jest
      .fn<(args: Prisma.ArticleCountArgs) => Promise<number>>()
      .mockResolvedValue(0);
    findFirst = jest
      .fn<(args: Prisma.ArticleFindFirstArgs) => Promise<unknown>>()
      .mockResolvedValue(null);
    create = jest
      .fn<(args: Prisma.ArticleCreateArgs) => Promise<unknown>>()
      .mockResolvedValue({ id: 'article-id' });
    transaction = jest.fn((operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesRepository,
        {
          provide: PrismaService,
          useValue: {
            article: { findMany, count, findFirst, create },
            $transaction: transaction,
          },
        },
      ],
    }).compile();

    repository = module.get(ArticlesRepository);
  });

  it('combines allowlisted filters in PostgreSQL and always requires PUBLISHED', async () => {
    await repository.findPublished({
      page: 2,
      limit: 10,
      q: 'learning',
      categorySlug: 'technology',
      cefrLevel: 'B1',
      sort: 'newest',
    });

    const query = findMany.mock.calls[0][0];
    expect(query).toMatchObject({
      where: {
        status: ArticleStatus.PUBLISHED,
        OR: [
          { title: { contains: 'learning', mode: 'insensitive' } },
          { summary: { contains: 'learning', mode: 'insensitive' } },
        ],
        category: { is: { slug: 'technology' } },
        cefrLevel: 'B1',
      },
      skip: 10,
      take: 10,
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    });
    expect(count).toHaveBeenCalledWith({ where: query.where });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['newest', 'desc'],
    ['oldest', 'asc'],
  ] as const)(
    'maps %s to a stable publishedAt and ID order',
    async (sort, direction) => {
      await repository.findPublished({ page: 1, limit: 20, sort });

      expect(findMany.mock.calls[0][0]).toMatchObject({
        where: { status: ArticleStatus.PUBLISHED },
        orderBy: [{ publishedAt: direction }, { id: 'asc' }],
      });
    },
  );

  it('looks up imported duplicates only by external identity', async () => {
    await repository.findImportedDuplicate({ externalId: 'external-id' });

    expect(findFirst.mock.calls.map(([query]) => query.where)).toEqual([
      { externalId: 'external-id' },
    ]);
  });

  it('forces imported articles to version-one draft state', async () => {
    await repository.createImported({
      categoryId: 'category-id',
      title: 'Imported report',
      slug: 'imported-report-abc123',
      summary: 'Summary',
      contentHtml: '<p>Article.</p>',
      cefrLevel: 'B1',
      sourceName: 'Example News',
      externalId: 'external-id',
      sourcePublishedAt: new Date('2026-07-30T00:00:00Z'),
      aiAnalysisStatus: 'PENDING',
    });

    const createCall = create.mock.calls.at(0);
    expect(createCall).toBeDefined();
    if (!createCall) throw new Error('Expected article creation');
    expect(createCall[0].data).toMatchObject({
      status: ArticleStatus.DRAFT,
      contentVersion: 1,
      publishedAt: null,
      archivedAt: null,
    });
  });

  it('makes manually created drafts eligible for analysis', async () => {
    await repository.create({
      categoryId: 'category-id',
      title: 'Manual report',
      slug: 'manual-report',
      summary: 'Summary',
      contentHtml: '<p>Article.</p>',
      cefrLevel: 'B1',
    });

    expect(create.mock.calls[0][0].data).toMatchObject({
      status: ArticleStatus.DRAFT,
      aiAnalysisStatus: 'PENDING',
      aiAnalysisError: null,
      contentVersion: 1,
    });
  });

  it('uses an explicit public card projection without content or audit fields', async () => {
    await repository.findPublished({ page: 1, limit: 20, sort: 'newest' });

    const query = findMany.mock.calls[0][0];
    expect(query.select).toEqual({
      id: true,
      title: true,
      slug: true,
      summary: true,
      thumbnailUrl: true,
      cefrLevel: true,
      publishedAt: true,
      category: { select: { id: true, name: true, slug: true } },
    });
    expect(JSON.stringify(query)).not.toContain('contentHtml');
    expect(JSON.stringify(query)).not.toContain('createdBy');
    expect(JSON.stringify(query)).not.toContain('updatedBy');
  });

  it('filters detail by slug and PUBLISHED', async () => {
    findFirst.mockResolvedValue({
      id: 'article-id',
      title: 'Article',
      slug: 'article',
      summary: 'Summary',
      sourceName: null,
      sourceUrl: null,
      authorName: null,
      thumbnailUrl: null,
      cefrLevel: 'B1',
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date('2026-07-22T10:00:00Z'),
      category: { id: 'category-id', name: 'Technology', slug: 'technology' },
    });

    await expect(repository.findPublishedBySlug('article')).resolves.toEqual({
      article: {
        id: 'article-id',
        title: 'Article',
        slug: 'article',
        summary: 'Summary',
        sourceName: null,
        sourceUrl: null,
        authorName: null,
        thumbnailUrl: null,
        cefrLevel: 'B1',
        status: ArticleStatus.PUBLISHED,
        publishedAt: new Date('2026-07-22T10:00:00Z'),
      },
      category: {
        id: 'category-id',
        name: 'Technology',
        slug: 'technology',
      },
    });
    const query = findFirst.mock.calls[0][0];
    expect(query).toMatchObject({
      where: { slug: 'article', status: ArticleStatus.PUBLISHED },
      select: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });
    expect(JSON.stringify(query)).not.toContain('contentHtml');
    expect(JSON.stringify(query)).not.toContain('include');
  });

  it('returns null for unknown, draft, or archived records hidden by the query', async () => {
    await expect(repository.findPublishedBySlug('hidden')).resolves.toBeNull();

    expect(findFirst.mock.calls[0][0].where).toEqual({
      slug: 'hidden',
      status: ArticleStatus.PUBLISHED,
    });
  });
});
