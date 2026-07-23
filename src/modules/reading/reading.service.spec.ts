import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../../generated/prisma/client';
import {
  ArticleStatus,
  CefrLevel,
  LearningStatus,
  LexicalUnitType,
  ReadingStatus,
} from '../../../generated/prisma/enums';
import { ArticleContentService } from '../articles/services/article-content.service';
import {
  type ContextualTermLookupRecord,
  type ReaderArticleRecord,
  ReadingRepository,
} from './reading.repository';
import { ReadingService } from './reading.service';

const articleId = '550e8400-e29b-41d4-a716-446655440000';
const termId = '550e8400-e29b-41d4-a716-446655440002';

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
  termCandidates: [],
  progress: null,
  ...overrides,
});

const lookupRecord = (
  overrides: Partial<ContextualTermLookupRecord> = {},
): ContextualTermLookupRecord => ({
  term: {
    id: termId,
    value: 'harmful',
    wordDisplay: 'harmful',
    lemma: 'harmful',
    unitType: LexicalUnitType.WORD,
    partOfSpeech: 'adjective',
    ipa: null,
    cefrLevel: CefrLevel.B1,
    contextualMeaningVi: 'có hại',
    definitionEn: 'causing damage',
    contextualExplanation: null,
    synonyms: ['damaging'],
    antonyms: ['beneficial'],
    collocations: ['harmful effect'],
    relatedTerms: ['harm'],
    vocabularyTopic: 'environment',
    examples: [],
    skill: 'vocabulary',
  },
  parentSentence: {
    id: '550e8400-e29b-41d4-a716-446655440001',
    sentenceOrder: 1,
    sentenceText: 'Plastic waste is harmful.',
    translationVi: 'Rác thải nhựa có hại.',
    explanationVi: null,
    referenceExplanation: null,
    skill: 'reading',
  },
  isLookupEnabled: true,
  save: null,
  ...overrides,
});

describe('ReadingService', () => {
  let service: ReadingService;
  let repository: {
    findReaderArticle: jest.Mock;
    findContextualTerm: jest.Mock;
    findContextualTermForSave: jest.Mock;
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
      findContextualTerm: jest.fn(),
      findContextualTermForSave: jest.fn(),
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

  it('includes same-level and above-level terms and excludes below-level terms', async () => {
    repository.findReaderArticle.mockResolvedValue(
      readerRecord({
        userCefrLevel: CefrLevel.B1,
        termCandidates: [
          { id: 'below', cefrLevel: CefrLevel.A2 },
          { id: 'same', cefrLevel: CefrLevel.B1 },
          { id: 'above', cefrLevel: CefrLevel.C2 },
        ],
      }),
    );

    await expect(
      service.getReaderArticle('user-id', 'article'),
    ).resolves.toMatchObject({
      highlightedTermIds: ['same', 'above'],
    });
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

  it('maps saved contextual vocabulary for the authenticated owner', async () => {
    repository.findContextualTerm.mockResolvedValue(
      lookupRecord({
        save: {
          id: '550e8400-e29b-41d4-a716-446655440004',
          learningStatus: LearningStatus.LEARNING,
        },
      }),
    );

    await expect(
      service.getContextualTerm('user-id', articleId, termId),
    ).resolves.toMatchObject({
      saveState: {
        isSaved: true,
        userVocabularyId: '550e8400-e29b-41d4-a716-446655440004',
        learningStatus: LearningStatus.LEARNING,
      },
    });
  });

  it('maps an unsaved contextual term without fabricated ownership data', async () => {
    repository.findContextualTerm.mockResolvedValue(lookupRecord());

    await expect(
      service.getContextualTerm('user-id', articleId, termId),
    ).resolves.toMatchObject({
      saveState: {
        isSaved: false,
        userVocabularyId: null,
        learningStatus: null,
      },
    });
  });

  it('rejects disabled lookup with the documented forbidden response', async () => {
    repository.findContextualTerm.mockResolvedValue(
      lookupRecord({ isLookupEnabled: false }),
    );

    await expect(
      service.getContextualTerm('user-id', articleId, termId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('maps missing, inactive, or stale contextual terms to not found', async () => {
    repository.findContextualTerm.mockResolvedValue(null);

    await expect(
      service.getContextualTerm('user-id', articleId, termId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reuses current-version contextual eligibility for vocabulary saves', async () => {
    repository.findContextualTermForSave.mockResolvedValue({
      ...lookupRecord(),
      parentSentence: {
        ...lookupRecord().parentSentence,
        contentVersion: 3,
      },
      sourceArticle: { id: articleId, contentVersion: 3 },
    });

    await expect(
      service.getContextualTermForSave(termId),
    ).resolves.toMatchObject({
      term: { id: termId },
      parentSentence: { contentVersion: 3 },
    });
  });

  it('rejects stale and lookup-disabled contextual terms for vocabulary saves', async () => {
    repository.findContextualTermForSave.mockResolvedValueOnce({
      ...lookupRecord(),
      parentSentence: {
        ...lookupRecord().parentSentence,
        contentVersion: 2,
      },
      sourceArticle: { id: articleId, contentVersion: 3 },
    });
    await expect(
      service.getContextualTermForSave(termId),
    ).rejects.toBeInstanceOf(NotFoundException);

    repository.findContextualTermForSave.mockResolvedValueOnce({
      ...lookupRecord({ isLookupEnabled: false }),
      parentSentence: {
        ...lookupRecord().parentSentence,
        contentVersion: 3,
      },
      sourceArticle: { id: articleId, contentVersion: 3 },
    });
    await expect(
      service.getContextualTermForSave(termId),
    ).rejects.toBeInstanceOf(ForbiddenException);
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
