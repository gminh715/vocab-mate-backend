import { Test, TestingModule } from '@nestjs/testing';
import { LearningStatus } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../../src/database/prisma.service';
import { CollectionItemSort } from '../../../../src/modules/collections/dto/collection-request.dto';
import {
  CollectionsRepository,
  CollectionVocabulariesNotAccessibleError,
} from '../../../../src/modules/collections/repositories/collections.repository';

interface QueryArgs {
  where?: Record<string, unknown>;
  select?: Record<string, unknown>;
  data?: unknown;
  orderBy?: unknown;
  skip?: number;
  take?: number;
  skipDuplicates?: boolean;
}

type QueryMock = jest.MockedFunction<(args: QueryArgs) => Promise<unknown>>;

describe('CollectionsRepository', () => {
  const findMany: QueryMock = jest.fn();
  const count: QueryMock = jest.fn();
  const findFirst: QueryMock = jest.fn();
  const create: QueryMock = jest.fn();
  const updateManyAndReturn: QueryMock = jest.fn();
  const deleteMany: QueryMock = jest.fn();
  const itemFindMany: QueryMock = jest.fn();
  const itemCount: QueryMock = jest.fn();
  const itemCreateMany: QueryMock = jest.fn();
  const itemDeleteMany: QueryMock = jest.fn();
  const vocabularyFindMany: QueryMock = jest.fn();
  const transaction = jest.fn(
    (input: Promise<unknown>[] | ((client: object) => Promise<unknown>)) =>
      typeof input === 'function'
        ? input({
            vocabularyCollection: { findFirst },
            userVocabulary: { findMany: vocabularyFindMany },
            vocabularyCollectionItem: { createMany: itemCreateMany },
          })
        : Promise.all(input),
  );
  let repository: CollectionsRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    findFirst.mockResolvedValue(null);
    updateManyAndReturn.mockResolvedValue([]);
    deleteMany.mockResolvedValue({ count: 0 });
    itemFindMany.mockResolvedValue([]);
    itemCount.mockResolvedValue(0);
    itemCreateMany.mockResolvedValue({ count: 0 });
    itemDeleteMany.mockResolvedValue({ count: 0 });
    vocabularyFindMany.mockResolvedValue([]);
    transaction.mockImplementation(
      (input: Promise<unknown>[] | ((client: object) => Promise<unknown>)) =>
        typeof input === 'function'
          ? input({
              vocabularyCollection: { findFirst },
              userVocabulary: { findMany: vocabularyFindMany },
              vocabularyCollectionItem: { createMany: itemCreateMany },
            })
          : Promise.all(input),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectionsRepository,
        {
          provide: PrismaService,
          useValue: {
            vocabularyCollection: {
              findMany,
              count,
              findFirst,
              create,
              updateManyAndReturn,
              deleteMany,
            },
            vocabularyCollectionItem: {
              findMany: itemFindMany,
              count: itemCount,
              deleteMany: itemDeleteMany,
            },
            $transaction: transaction,
          },
        },
      ],
    }).compile();
    repository = module.get(CollectionsRepository);
  });

  it('paginates and searches in PostgreSQL with owner scope, stable order, and aggregate counts', async () => {
    await repository.list('owner-id', {
      page: 2,
      limit: 10,
      q: 'tech',
    });

    const query = findMany.mock.calls[0][0];
    expect(query).toMatchObject({
      where: {
        userId: 'owner-id',
        name: { contains: 'tech', mode: 'insensitive' },
      },
      skip: 10,
      take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { items: true } },
      },
    });
    expect(count).toHaveBeenCalledWith({ where: query.where });
    expect(JSON.stringify(query.select)).not.toMatch(/user|password|items":\{/);
  });

  it('scopes detail by owner and returns only a count instead of item rows', async () => {
    await repository.findOwnedDetail('owner-id', 'collection-id');

    const query = findFirst.mock.calls[0][0];
    expect(query.where).toEqual({
      id: 'collection-id',
      userId: 'owner-id',
    });
    expect(query.select).toMatchObject({
      _count: { select: { items: true } },
    });
    expect(query.select).not.toHaveProperty('items');
  });

  it('derives owner on create and preserves database uniqueness errors', async () => {
    const duplicate = Object.assign(new Error('unique'), { code: 'P2002' });
    create.mockRejectedValue(duplicate);

    await expect(
      repository.create('owner-id', { name: 'Technology' }),
    ).rejects.toBe(duplicate);
    expect(create).toHaveBeenCalledWith({
      data: { userId: 'owner-id', name: 'Technology' },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it('preserves a concurrent create duplicate for service-level conflict mapping', async () => {
    const duplicate = Object.assign(new Error('unique'), { code: 'P2002' });
    create
      .mockResolvedValueOnce({ id: 'first-collection-id' })
      .mockRejectedValueOnce(duplicate);

    await expect(
      Promise.all([
        repository.create('owner-id', { name: 'Technology' }),
        repository.create('owner-id', { name: 'Technology' }),
      ]),
    ).rejects.toBe(duplicate);
  });

  it('atomically scopes update to owner and returns null for non-owned records', async () => {
    updateManyAndReturn.mockResolvedValueOnce([{ id: 'collection-id' }]);
    await expect(
      repository.updateOwned('owner-id', 'collection-id', {
        name: 'Updated',
      }),
    ).resolves.toEqual({ id: 'collection-id' });
    expect(updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'collection-id', userId: 'owner-id' },
        data: { name: 'Updated' },
      }),
    );

    updateManyAndReturn.mockResolvedValueOnce([]);
    await expect(
      repository.updateOwned('other-owner', 'collection-id', {
        name: 'Hidden',
      }),
    ).resolves.toBeNull();
  });

  it('preserves a concurrent update duplicate for service-level conflict mapping', async () => {
    const duplicate = Object.assign(new Error('unique'), { code: 'P2002' });
    updateManyAndReturn.mockRejectedValue(duplicate);

    await expect(
      repository.updateOwned('owner-id', 'collection-id', {
        name: 'Technology',
      }),
    ).rejects.toBe(duplicate);
  });

  it('uses one owner-scoped delete and leaves cascade behavior to foreign keys', async () => {
    deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.deleteOwned('owner-id', 'collection-id'),
    ).resolves.toBe(true);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'collection-id', userId: 'owner-id' },
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('lists only owner-matched snapshot rows with database pagination, filters, and stable sorting', async () => {
    await repository.listItems('owner-id', 'collection-id', {
      page: 2,
      limit: 10,
      q: 'harm',
      learningStatus: LearningStatus.LEARNING,
      sort: CollectionItemSort.OLDEST,
    });

    const query = itemFindMany.mock.calls[0][0];
    expect(query).toMatchObject({
      where: {
        collectionId: 'collection-id',
        collection: { is: { userId: 'owner-id' } },
        userVocabulary: {
          is: {
            userId: 'owner-id',
            AND: [
              {
                OR: [
                  {
                    savedWordDisplay: {
                      contains: 'harm',
                      mode: 'insensitive',
                    },
                  },
                  {
                    savedLemma: {
                      contains: 'harm',
                      mode: 'insensitive',
                    },
                  },
                  {
                    savedMeaningVi: {
                      contains: 'harm',
                      mode: 'insensitive',
                    },
                  },
                  {
                    personalNote: {
                      contains: 'harm',
                      mode: 'insensitive',
                    },
                  },
                ],
              },
              { learningStatus: LearningStatus.LEARNING },
            ],
          },
        },
      },
      skip: 10,
      take: 10,
      orderBy: [{ addedAt: 'asc' }, { userVocabularyId: 'asc' }],
    });
    expect(itemCount).toHaveBeenCalledWith({ where: query.where });
    const projection = JSON.stringify(query.select);
    expect(projection).toContain('savedWordDisplay');
    expect(projection).not.toMatch(
      /"articleSentenceTerm":|savedContextSentence|userId|password|collectionItems/,
    );
  });

  it('validates collection and every unique vocabulary owner before one bulk insert', async () => {
    findFirst.mockResolvedValue({ id: 'collection-id' });
    vocabularyFindMany.mockResolvedValue([
      { id: 'vocabulary-a' },
      { id: 'vocabulary-b' },
    ]);
    itemCreateMany.mockResolvedValue({ count: 2 });

    await expect(
      repository.addItems('owner-id', 'collection-id', [
        'vocabulary-a',
        'vocabulary-b',
      ]),
    ).resolves.toEqual({ count: 2 });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'collection-id', userId: 'owner-id' },
      select: { id: true },
    });
    expect(vocabularyFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['vocabulary-a', 'vocabulary-b'] },
        userId: 'owner-id',
      },
      select: { id: true },
    });
    expect(itemCreateMany).toHaveBeenCalledWith({
      data: [
        {
          collectionId: 'collection-id',
          userVocabularyId: 'vocabulary-a',
        },
        {
          collectionId: 'collection-id',
          userVocabularyId: 'vocabulary-b',
        },
      ],
      skipDuplicates: true,
    });
  });

  it('rolls back before insert when any vocabulary is missing or non-owned', async () => {
    findFirst.mockResolvedValue({ id: 'collection-id' });
    vocabularyFindMany.mockResolvedValue([{ id: 'vocabulary-a' }]);

    await expect(
      repository.addItems('owner-id', 'collection-id', [
        'vocabulary-a',
        'vocabulary-b',
      ]),
    ).rejects.toBeInstanceOf(CollectionVocabulariesNotAccessibleError);
    expect(itemCreateMany).not.toHaveBeenCalled();
  });

  it('uses composite-key duplicate skipping for concurrent idempotent adds', async () => {
    findFirst.mockResolvedValue({ id: 'collection-id' });
    vocabularyFindMany.mockResolvedValue([{ id: 'vocabulary-id' }]);
    itemCreateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      Promise.all([
        repository.addItems('owner-id', 'collection-id', ['vocabulary-id']),
        repository.addItems('owner-id', 'collection-id', ['vocabulary-id']),
      ]),
    ).resolves.toEqual([{ count: 1 }, { count: 0 }]);
    expect(itemCreateMany).toHaveBeenNthCalledWith(1, {
      data: [
        {
          collectionId: 'collection-id',
          userVocabularyId: 'vocabulary-id',
        },
      ],
      skipDuplicates: true,
    });
  });

  it('deletes only a relation whose collection and vocabulary share the caller owner', async () => {
    itemDeleteMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.deleteOwnedItem('owner-id', 'collection-id', 'vocabulary-id'),
    ).resolves.toBe(true);
    expect(itemDeleteMany).toHaveBeenCalledWith({
      where: {
        collectionId: 'collection-id',
        userVocabularyId: 'vocabulary-id',
        collection: { is: { userId: 'owner-id' } },
        userVocabulary: { is: { userId: 'owner-id' } },
      },
    });
  });
});
