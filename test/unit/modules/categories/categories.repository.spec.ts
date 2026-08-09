import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../../src/database/prisma.service';
import { CategoriesRepository } from '../../../../src/modules/categories/categories.repository';

describe('CategoriesRepository', () => {
  const findMany: jest.MockedFunction<(query: object) => Promise<unknown>> =
    jest.fn();
  const findFirst: jest.MockedFunction<(query: object) => Promise<unknown>> =
    jest.fn();
  const findUnique: jest.MockedFunction<(query: object) => Promise<unknown>> =
    jest.fn();
  const count: jest.MockedFunction<(query: object) => Promise<number>> =
    jest.fn();
  const create: jest.MockedFunction<(query: object) => Promise<unknown>> =
    jest.fn();
  const update: jest.MockedFunction<(query: object) => Promise<unknown>> =
    jest.fn();
  const deleteCategory: jest.MockedFunction<
    (query: object) => Promise<unknown>
  > = jest.fn();
  const transaction = jest.fn((queries: Promise<unknown>[]) =>
    Promise.all(queries),
  );
  let repository: CategoriesRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
    findMany.mockResolvedValue([]);
    findFirst.mockResolvedValue(null);
    findUnique.mockResolvedValue(null);
    count.mockResolvedValue(0);
    deleteCategory.mockResolvedValue({ id: 'category-id' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesRepository,
        {
          provide: PrismaService,
          useValue: {
            category: {
              findMany,
              findFirst,
              findUnique,
              count,
              create,
              update,
              delete: deleteCategory,
            },
            $transaction: transaction,
          },
        },
      ],
    }).compile();

    repository = module.get(CategoriesRepository);
  });

  it('always filters active categories with deterministic ordering and a safe projection', async () => {
    await repository.findActive({});

    expect(findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, slug: true },
    });
    expect(JSON.stringify(findMany.mock.calls[0][0])).not.toContain(
      'description',
    );
  });

  it('searches category names at database level', async () => {
    await repository.findActive({ q: 'tech' });

    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: {
        isActive: true,
        name: { contains: 'tech', mode: 'insensitive' },
      },
    });
  });

  it('finds an active slug with the same safe projection', async () => {
    await repository.findActiveBySlug('technology');

    expect(findFirst).toHaveBeenCalledWith({
      where: { slug: 'technology', isActive: true },
      select: { id: true, name: true, slug: true },
    });
  });

  it('finds an active category by ID for article mutations', async () => {
    await repository.findActiveById('category-id');

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'category-id', isActive: true },
      select: { id: true, name: true, slug: true },
    });
  });

  it('paginates and counts all matching admin categories with stable sorting', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(21);

    await expect(
      repository.findAdminCategories({
        page: 2,
        limit: 10,
        q: 'tech',
        isActive: false,
      }),
    ).resolves.toEqual({ items: [], total: 21 });

    const pageQuery = findMany.mock.calls[0][0];
    expect(pageQuery).toMatchObject({
      where: {
        isActive: false,
        name: { contains: 'tech', mode: 'insensitive' },
      },
      skip: 10,
      take: 10,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    expect(count).toHaveBeenCalledWith({
      where: (pageQuery as { where: unknown }).where,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(pageQuery)).not.toContain('articles');
  });

  it('does not apply an active filter when the admin query omits it', async () => {
    await repository.findAdminCategories({ page: 1, limit: 20 });

    expect(findMany.mock.calls[0][0]).toMatchObject({ where: {} });
  });

  it('returns an aggregate article count without loading article rows', async () => {
    findUnique.mockResolvedValue({
      id: 'category-id',
      name: 'Technology',
      slug: 'technology',
      description: null,
      isActive: true,
      displayOrder: 1,
      createdAt: new Date('2026-07-22T10:00:00Z'),
      updatedAt: new Date('2026-07-22T10:00:00Z'),
      _count: { articles: 4 },
    });

    await expect(
      repository.findAdminCategoryDetail('category-id'),
    ).resolves.toMatchObject({ articleCount: 4 });
    const query = findUnique.mock.calls[0][0];
    expect(query).toMatchObject({
      where: { id: 'category-id' },
      select: { _count: { select: { articles: true } } },
    });
    expect(JSON.stringify(query)).not.toContain('include');
  });

  it('writes defaults and both audit IDs atomically on create', async () => {
    create.mockResolvedValue({
      id: 'category-id',
      name: 'Technology',
      slug: 'technology',
    });

    await repository.create({
      name: 'Technology',
      slug: 'technology',
      isActive: true,
      displayOrder: 0,
      createdByUserId: 'admin-id',
      updatedByUserId: 'admin-id',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        name: 'Technology',
        slug: 'technology',
        isActive: true,
        displayOrder: 0,
        createdByUserId: 'admin-id',
        updatedByUserId: 'admin-id',
      },
      select: { id: true, name: true, slug: true },
    });
  });

  it('performs a partial update with only the supplied field and updater audit ID', async () => {
    update.mockResolvedValue({
      id: 'category-id',
      name: 'Updated',
      slug: 'technology',
    });

    await repository.update('category-id', {
      name: 'Updated',
      updatedByUserId: 'admin-id',
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'category-id' },
      data: { name: 'Updated', updatedByUserId: 'admin-id' },
      select: { id: true, name: true, slug: true },
    });
  });

  it('atomically updates only status and the updater audit field', async () => {
    update.mockResolvedValue({ id: 'category-id', isActive: false });

    await expect(
      repository.updateStatus('category-id', {
        isActive: false,
        updatedByUserId: 'admin-id',
      }),
    ).resolves.toEqual({ id: 'category-id', isActive: false });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'category-id' },
      data: { isActive: false, updatedByUserId: 'admin-id' },
      select: { id: true, isActive: true },
    });
    expect(JSON.stringify(update.mock.calls[0][0])).not.toContain('articles');
  });

  it('checks category usage with an aggregate projection only', async () => {
    findUnique.mockResolvedValue({
      id: 'category-id',
      _count: { articles: 2 },
    });

    await expect(repository.findCategoryUsage('category-id')).resolves.toEqual({
      id: 'category-id',
      articleCount: 2,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'category-id' },
      select: { id: true, _count: { select: { articles: true } } },
    });
  });

  it('deletes with an explicit ID-only projection', async () => {
    await expect(repository.delete('category-id')).resolves.toBeUndefined();

    expect(deleteCategory).toHaveBeenCalledWith({
      where: { id: 'category-id' },
      select: { id: true },
    });
  });
});
