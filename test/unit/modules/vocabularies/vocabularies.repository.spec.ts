import { Test, TestingModule } from '@nestjs/testing';
import { CefrLevel, LearningStatus } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../../src/database/prisma.service';
import { VocabularySort } from '../../../../src/modules/vocabularies/dto/vocabulary-request.dto';
import {
  type CreateVocabularySnapshotInput,
  InvalidVocabularyCollectionsError,
  VocabulariesRepository,
} from '../../../../src/modules/vocabularies/repositories/vocabularies.repository';

const TERM_ID = '11111111-1111-4111-8111-111111111111';
const COLLECTION_ID = '22222222-2222-4222-8222-222222222222';

interface QueryMockArgs {
  where?: Record<string, unknown>;
  select?: Record<string, unknown>;
  data?: Record<string, unknown>;
  skip?: number;
  take?: number;
  orderBy?: unknown;
}

type QueryMock = jest.MockedFunction<(args: QueryMockArgs) => Promise<unknown>>;

describe('VocabulariesRepository', () => {
  const vocabularyFindMany: QueryMock = jest.fn();
  const vocabularyCount: QueryMock = jest.fn();
  const vocabularyFindFirst: QueryMock = jest.fn();
  const vocabularyCreate: QueryMock = jest.fn();
  const vocabularyDeleteMany: QueryMock = jest.fn();
  const collectionFindMany: QueryMock = jest.fn();
  const transaction = jest.fn(
    (input: Promise<unknown>[] | ((client: object) => Promise<unknown>)) =>
      typeof input === 'function'
        ? input({
            vocabularyCollection: { findMany: collectionFindMany },
            userVocabulary: { create: vocabularyCreate },
          })
        : Promise.all(input),
  );
  let repository: VocabulariesRepository;

  const snapshotInput = (): CreateVocabularySnapshotInput => ({
    articleSentenceTermId: TERM_ID,
    learningStatus: LearningStatus.NEW,
    savedWordDisplay: 'harmful',
    savedLemma: 'harmful',
    savedPartOfSpeech: 'adjective',
    savedIpa: null,
    savedCefrLevel: CefrLevel.B1,
    savedContextSentence: 'Plastic is harmful.',
    savedContextTranslationVi: 'Nhựa có hại.',
    savedMeaningVi: 'có hại',
    savedExplanation: null,
    savedExamples: [],
    lastReviewedAt: null,
    nextReviewAt: null,
    reviewIntervalDays: null,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    vocabularyFindMany.mockResolvedValue([]);
    vocabularyCount.mockResolvedValue(0);
    vocabularyFindFirst.mockResolvedValue(null);
    vocabularyDeleteMany.mockResolvedValue({ count: 0 });
    collectionFindMany.mockResolvedValue([]);
    transaction.mockImplementation(
      (input: Promise<unknown>[] | ((client: object) => Promise<unknown>)) =>
        typeof input === 'function'
          ? input({
              vocabularyCollection: { findMany: collectionFindMany },
              userVocabulary: { create: vocabularyCreate },
            })
          : Promise.all(input),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VocabulariesRepository,
        {
          provide: PrismaService,
          useValue: {
            userVocabulary: {
              findMany: vocabularyFindMany,
              count: vocabularyCount,
              findFirst: vocabularyFindFirst,
              deleteMany: vocabularyDeleteMany,
            },
            $transaction: transaction,
          },
        },
      ],
    }).compile();
    repository = module.get(VocabulariesRepository);
  });

  it('applies owner scope, snapshot search, filters, pagination, and deterministic allowlisted sorting', async () => {
    const now = new Date('2026-07-23T05:00:00Z');

    await repository.list(
      'owner-id',
      {
        page: 2,
        limit: 10,
        q: 'harm',
        learningStatus: LearningStatus.LEARNING,
        cefrLevel: CefrLevel.B1,
        sort: VocabularySort.OLDEST,
      },
      now,
    );

    const query = vocabularyFindMany.mock.calls[0][0];
    expect(query).toMatchObject({
      skip: 10,
      take: 10,
      orderBy: [{ savedAt: 'asc' }, { id: 'asc' }],
    });
    expect(query.where).toMatchObject({
      userId: 'owner-id',
      AND: [
        {
          OR: [
            { savedWordDisplay: { contains: 'harm', mode: 'insensitive' } },
            { savedLemma: { contains: 'harm', mode: 'insensitive' } },
            { savedMeaningVi: { contains: 'harm', mode: 'insensitive' } },
          ],
        },
        { learningStatus: LearningStatus.LEARNING },
        { savedCefrLevel: CefrLevel.B1 },
      ],
    });
    expect(vocabularyCount).toHaveBeenCalledWith({ where: query.where });
    expect(query.select).not.toHaveProperty('articleSentenceTerm');
    expect(query.select).toMatchObject({
      collectionItems: {
        where: {
          collection: {
            is: {
              userId: 'owner-id',
            },
          },
        },
      },
    });
    expect(query.select).not.toHaveProperty('user');
  });

  it('filters collection membership through a collection owned by the caller', async () => {
    await repository.list(
      'owner-id',
      {
        page: 1,
        limit: 20,
        collectionId: COLLECTION_ID,
        sort: VocabularySort.NEWEST,
      },
      new Date(),
    );

    expect(vocabularyFindMany.mock.calls[0][0].where).toMatchObject({
      AND: [
        {
          collectionItems: {
            some: {
              collectionId: COLLECTION_ID,
              collection: { is: { userId: 'owner-id' } },
            },
          },
        },
      ],
    });
  });

  it('implements due-only policy in PostgreSQL filters', async () => {
    const now = new Date('2026-07-23T05:00:00Z');
    await repository.list(
      'owner-id',
      {
        page: 1,
        limit: 20,
        dueOnly: true,
        sort: VocabularySort.NEWEST,
      },
      now,
    );

    expect(vocabularyFindMany.mock.calls[0][0].where).toMatchObject({
      AND: [
        {
          learningStatus: {
            in: [
              LearningStatus.NEW,
              LearningStatus.LEARNING,
              LearningStatus.REVIEWING,
            ],
          },
          OR: [
            { nextReviewAt: { lte: now } },
            { learningStatus: LearningStatus.NEW, nextReviewAt: null },
          ],
        },
      ],
    });
  });

  it('scopes detail by both owner and vocabulary ID with safe source projection', async () => {
    await repository.findOwnedById('owner-id', 'vocabulary-id');

    const query = vocabularyFindFirst.mock.calls[0][0];
    expect(query.where).toEqual({
      id: 'vocabulary-id',
      userId: 'owner-id',
    });
    const serialized = JSON.stringify(query.select);
    expect(serialized).toContain('sourceUrl');
    expect(serialized).not.toMatch(
      /contentHtml|sentences|terms|createdBy|updatedBy|passwordHash/,
    );
  });

  it('validates all collection ownership and creates snapshot plus memberships in one transaction', async () => {
    collectionFindMany.mockResolvedValue([{ id: COLLECTION_ID }]);
    vocabularyCreate.mockResolvedValue({ id: 'vocabulary-id' });

    await repository.createWithCollections('owner-id', snapshotInput(), [
      COLLECTION_ID,
    ]);

    expect(transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(collectionFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: [COLLECTION_ID] },
        userId: 'owner-id',
      },
      select: { id: true },
    });
    const createQuery = vocabularyCreate.mock.calls[0][0];
    expect(createQuery.data).toMatchObject({
      userId: 'owner-id',
      articleSentenceTermId: TERM_ID,
      learningStatus: LearningStatus.NEW,
      lastReviewedAt: null,
      nextReviewAt: null,
      reviewIntervalDays: null,
      collectionItems: {
        create: [{ collectionId: COLLECTION_ID }],
      },
    });
  });

  it('aborts the transaction before insertion when any collection is inaccessible', async () => {
    collectionFindMany.mockResolvedValue([]);

    await expect(
      repository.createWithCollections('owner-id', snapshotInput(), [
        COLLECTION_ID,
      ]),
    ).rejects.toBeInstanceOf(InvalidVocabularyCollectionsError);
    expect(vocabularyCreate).not.toHaveBeenCalled();
  });

  it('preserves the database unique constraint error for concurrent duplicate mapping', async () => {
    const duplicate = Object.assign(new Error('unique'), { code: 'P2002' });
    vocabularyCreate.mockRejectedValue(duplicate);

    await expect(
      Promise.all([
        repository.createWithCollections('owner-id', snapshotInput(), []),
        repository.createWithCollections('owner-id', snapshotInput(), []),
      ]),
    ).rejects.toBe(duplicate);
  });

  it('deletes vocabulary atomically within the authenticated owner scope', async () => {
    vocabularyDeleteMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.deleteOwned('owner-id', 'vocabulary-id'),
    ).resolves.toBe(true);
    expect(vocabularyDeleteMany).toHaveBeenCalledWith({
      where: { id: 'vocabulary-id', userId: 'owner-id' },
    });
  });

  it('does not delete missing or non-owned vocabulary', async () => {
    await expect(
      repository.deleteOwned('owner-id', 'other-vocabulary-id'),
    ).resolves.toBe(false);
  });
});
