import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../../../generated/prisma/client';
import {
  ArticleStatus,
  CefrLevel,
  ReadingStatus,
} from '../../../../generated/prisma/enums';
import { ArticleContentService } from '../../../../src/modules/articles/services/article-content.service';
import {
  type ReaderArticleRecord,
  ReadingRepository,
} from '../../../../src/modules/reading/repositories/reading.repository';
import { ReadingService } from '../../../../src/modules/reading/services/reading.service';

const articleId = '550e8400-e29b-41d4-a716-446655440000';

const readerRecord = (
  overrides: Partial<ReaderArticleRecord> = {},
): ReaderArticleRecord => ({
  article: {
    id: articleId,
    title: 'How Technology Changes Learning',
    slug: 'how-technology-changes-learning',
    summary: 'A concise introduction.',
    sourceName: 'Vocab Mate News',
    sourceUrl: null,
    authorName: 'Jane Doe',
    thumbnailUrl: null,
    cefrLevel: CefrLevel.B1,
    status: ArticleStatus.PUBLISHED,
    publishedAt: new Date('2026-07-22T10:00:00Z'),
    category: {
      id: '550e8400-e29b-41d4-a716-446655440010',
      name: 'Technology',
      slug: 'technology',
    },
  },
  contentHtml: '<p>Safe content</p>',
  userCefrLevel: CefrLevel.B1,
  userTargetCefrLevel: CefrLevel.C1,
  termCandidates: [],
  progress: null,
  ...overrides,
});

describe('ReadingService', () => {
  let service: ReadingService;
  let repository: {
    findReaderArticle: jest.Mock;
    listUserHistory: jest.Mock;
    findUserArticleProgress: jest.Mock;
    upsertUserArticleProgress: jest.Mock;
    completeUserArticleProgress: jest.Mock;
    deleteUserArticleProgress: jest.Mock;
  };
  let contentService: { sanitize: jest.Mock };

  beforeEach(async () => {
    repository = {
      findReaderArticle: jest.fn(),
      listUserHistory: jest.fn(),
      findUserArticleProgress: jest.fn(),
      upsertUserArticleProgress: jest.fn(),
      completeUserArticleProgress: jest.fn(),
      deleteUserArticleProgress: jest.fn(),
    };
    contentService = { sanitize: jest.fn((html: string) => html) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadingService,
        { provide: ReadingRepository, useValue: repository },
        { provide: ArticleContentService, useValue: contentService },
      ],
    }).compile();

    service = module.get(ReadingService);
  });

  it('highlights terms from the current CEFR through the target CEFR', async () => {
    repository.findReaderArticle.mockResolvedValue(
      readerRecord({
        userCefrLevel: CefrLevel.B1,
        userTargetCefrLevel: CefrLevel.C1,
        termCandidates: [
          { id: 'below', cefrLevel: CefrLevel.A2 },
          { id: 'same', cefrLevel: CefrLevel.B1 },
          { id: 'within', cefrLevel: CefrLevel.B2 },
          { id: 'target', cefrLevel: CefrLevel.C1 },
          { id: 'above-target', cefrLevel: CefrLevel.C2 },
          { id: 'unknown', cefrLevel: null },
        ],
      }),
    );

    await expect(
      service.getReaderArticle('user-id', 'article'),
    ).resolves.toMatchObject({
      highlightedTermIds: ['same', 'within', 'target'],
    });
  });

  it('returns no highlights when the user has no target CEFR', async () => {
    repository.findReaderArticle.mockResolvedValue(
      readerRecord({
        userTargetCefrLevel: null,
        termCandidates: [{ id: 'above', cefrLevel: CefrLevel.B2 }],
      }),
    );

    await expect(
      service.getReaderArticle('user-id', 'article'),
    ).resolves.toMatchObject({ highlightedTermIds: [] });
  });

  it('returns a read-only in-memory progress default', async () => {
    repository.findReaderArticle.mockResolvedValue(readerRecord());

    const result = await service.getReaderArticle('user-id', 'article');

    expect(result.progress).toEqual({
      articleId,
      status: ReadingStatus.READING,
      progressPercent: 0,
      lastBlockKey: null,
      completedAt: null,
    });
    expect(repository.findReaderArticle).toHaveBeenCalledTimes(1);
  });

  it('maps existing progress without changing timestamps', async () => {
    const completedAt = new Date('2026-07-23T02:00:00Z');
    repository.findReaderArticle.mockResolvedValue(
      readerRecord({
        progress: {
          articleId,
          status: ReadingStatus.COMPLETED,
          progressPercent: new Prisma.Decimal('100'),
          lastBlockKey: 'sentence-12',
          completedAt,
        },
      }),
    );

    const result = await service.getReaderArticle('user-id', 'article');

    expect(result.progress).toEqual({
      articleId,
      status: ReadingStatus.COMPLETED,
      progressPercent: 100,
      lastBlockKey: 'sentence-12',
      completedAt,
    });
  });

  it.each([
    ['missing published article', null],
    ['missing user profile', readerRecord({ userCefrLevel: null })],
  ])('rejects a %s', async (_case, record) => {
    repository.findReaderArticle.mockResolvedValue(record);

    await expect(
      service.getReaderArticle('user-id', 'article'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps owner-only history and standard pagination metadata', async () => {
    repository.listUserHistory.mockResolvedValue({
      items: [
        {
          articleId,
          status: ReadingStatus.READING,
          progressPercent: new Prisma.Decimal('35.5'),
          lastBlockKey: 'paragraph-2',
          completedAt: null,
          firstOpenedAt: new Date('2026-07-20T01:00:00Z'),
          lastReadAt: new Date('2026-07-23T01:00:00Z'),
          article: {
            ...readerRecord().article,
            status: ArticleStatus.ARCHIVED,
          },
        },
      ],
      total: 21,
    });

    const result = await service.getHistory('owner-id', {
      page: 2,
      limit: 20,
      status: ReadingStatus.READING,
      sort: 'newest',
    });

    expect(repository.listUserHistory).toHaveBeenCalledWith('owner-id', {
      page: 2,
      limit: 20,
      status: ReadingStatus.READING,
      sort: 'newest',
    });
    expect(result).toMatchObject({
      items: [
        {
          articleId,
          progressPercent: 35.5,
          article: { status: ArticleStatus.ARCHIVED },
        },
      ],
      meta: { page: 2, limit: 20, total: 21, totalPages: 2 },
    });
  });

  it('gets a default progress without inserting a row', async () => {
    repository.findUserArticleProgress.mockResolvedValue({
      articleId,
      progress: null,
    });

    await expect(service.getProgress('owner-id', articleId)).resolves.toEqual({
      progress: {
        articleId,
        status: ReadingStatus.READING,
        progressPercent: 0,
        lastBlockKey: null,
        completedAt: null,
      },
    });
    expect(repository.upsertUserArticleProgress).not.toHaveBeenCalled();
  });

  it('rejects an empty progress update according to project convention', async () => {
    await expect(
      service.updateProgress('owner-id', articleId, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.upsertUserArticleProgress).not.toHaveBeenCalled();
  });

  it('preserves omitted fields in a partial progress upsert', async () => {
    repository.upsertUserArticleProgress.mockResolvedValue({
      articleId,
      progress: {
        articleId,
        status: ReadingStatus.READING,
        progressPercent: new Prisma.Decimal('45'),
        lastBlockKey: 'paragraph-3',
        completedAt: null,
      },
    });

    await service.updateProgress('owner-id', articleId, {
      lastBlockKey: 'paragraph-3',
    });

    expect(repository.upsertUserArticleProgress).toHaveBeenCalledWith(
      'owner-id',
      articleId,
      { lastBlockKey: 'paragraph-3' },
    );
  });

  it('maps explicit completion as COMPLETED/100 with a timestamp', async () => {
    const completedAt = new Date('2026-07-23T03:30:00Z');
    repository.completeUserArticleProgress.mockResolvedValue({
      articleId,
      progress: {
        articleId,
        status: ReadingStatus.COMPLETED,
        progressPercent: new Prisma.Decimal('100'),
        lastBlockKey: 'paragraph-3',
        completedAt,
      },
    });

    await expect(
      service.completeProgress('owner-id', articleId),
    ).resolves.toEqual({
      progress: {
        articleId,
        status: ReadingStatus.COMPLETED,
        progressPercent: 100,
        lastBlockKey: 'paragraph-3',
        completedAt,
      },
    });
  });

  it('deletes progress only through the authenticated owner scope', async () => {
    repository.deleteUserArticleProgress.mockResolvedValue(true);

    await service.deleteProgress('owner-id', articleId);

    expect(repository.deleteUserArticleProgress).toHaveBeenCalledWith(
      'owner-id',
      articleId,
    );
  });

  it('returns 404 when the owner has no progress to reset', async () => {
    repository.deleteUserArticleProgress.mockResolvedValue(false);

    await expect(
      service.deleteProgress('owner-id', articleId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
