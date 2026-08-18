import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../../../generated/prisma/client';
import {
  ArticleStatus,
  CefrLevel,
  LearningStatus,
  LexicalUnitType,
  ReadingStatus,
} from '../../../../generated/prisma/enums';
import { ArticleContentService } from '../../../../src/modules/articles/services/article-content.service';
import { AiService } from '../../../../src/modules/ai/ai.service';
import {
  type ContextualTermEnrichmentClaimRecord,
  ContextualTermEnrichmentStateConflictError,
  type ContextualTermLookupRecord,
  type ReaderArticleRecord,
  ReadingRepository,
} from '../../../../src/modules/reading/reading.repository';
import { ReadingService } from '../../../../src/modules/reading/reading.service';

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
  userTargetCefrLevel: CefrLevel.C1,
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
    explanationStatus: 'READY',
    explanationGeneratedAt: null,
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

const enrichmentClaim = (): ContextualTermEnrichmentClaimRecord => ({
  article: {
    id: articleId,
    title: 'Plastic Waste',
    contentVersion: 3,
  },
  term: {
    id: termId,
    value: 'harmful',
    lemma: 'harmful',
    unitType: LexicalUnitType.WORD,
  },
  parentSentence: {
    id: '550e8400-e29b-41d4-a716-446655440001',
    sentenceOrder: 2,
    sentenceText: 'Plastic waste is harmful.',
  },
  neighboringSentences: [
    {
      id: 'neighbor-before',
      sentenceOrder: 1,
      sentenceText: 'Plastic remains in the environment.',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      sentenceOrder: 2,
      sentenceText: 'Plastic waste is harmful.',
    },
    {
      id: 'neighbor-after',
      sentenceOrder: 3,
      sentenceText: 'Communities are reducing waste.',
    },
  ],
});

const enrichmentResult = {
  wordDisplay: 'harmful',
  normalizedLemma: 'harmful',
  partOfSpeech: 'adjective',
  cefrLevel: CefrLevel.B1,
  contextualMeaningVi: 'có hại',
  definitionEn: 'causing damage',
  contextualExplanation: 'It describes a damaging effect.',
  ipa: '/ˈhɑːrmfəl/',
  synonyms: ['damaging'],
  antonyms: ['beneficial'],
  collocations: ['harmful effect'],
  relatedTerms: ['harm'],
  vocabularyTopic: 'environment',
  examples: [
    {
      sentence: 'Smoke is harmful to health.',
      translationVi: 'Khói có hại cho sức khỏe.',
    },
  ],
  sentenceTranslationVi: 'Rác thải nhựa có hại.',
};

describe('ReadingService', () => {
  let service: ReadingService;
  let repository: {
    findReaderArticle: jest.Mock;
    findContextualTerm: jest.Mock;
    findContextualTermForSave: jest.Mock;
    claimContextualTermEnrichment: jest.Mock;
    completeContextualTermEnrichment: jest.Mock;
    failContextualTermEnrichment: jest.Mock;
    listUserHistory: jest.Mock;
    findUserArticleProgress: jest.Mock;
    upsertUserArticleProgress: jest.Mock;
    completeUserArticleProgress: jest.Mock;
    deleteUserArticleProgress: jest.Mock;
  };
  let contentService: { sanitize: jest.Mock };
  let aiService: { enrichContextualTerm: jest.Mock };

  beforeEach(async () => {
    repository = {
      findReaderArticle: jest.fn(),
      findContextualTerm: jest.fn(),
      findContextualTermForSave: jest.fn(),
      claimContextualTermEnrichment: jest.fn(),
      completeContextualTermEnrichment: jest.fn(),
      failContextualTermEnrichment: jest.fn(),
      listUserHistory: jest.fn(),
      findUserArticleProgress: jest.fn(),
      upsertUserArticleProgress: jest.fn(),
      completeUserArticleProgress: jest.fn(),
      deleteUserArticleProgress: jest.fn(),
    };
    contentService = { sanitize: jest.fn((html: string) => html) };
    aiService = { enrichContextualTerm: jest.fn() };
    repository.failContextualTermEnrichment.mockResolvedValue(true);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadingService,
        { provide: ReadingRepository, useValue: repository },
        { provide: ArticleContentService, useValue: contentService },
        { provide: AiService, useValue: aiService },
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

  it('returns a READY cache hit without claiming or calling AI', async () => {
    repository.findContextualTerm.mockResolvedValue(lookupRecord());

    await expect(
      service.getContextualTerm('user-id', articleId, termId),
    ).resolves.toMatchObject({ term: { explanationStatus: 'READY' } });
    expect(repository.claimContextualTermEnrichment).not.toHaveBeenCalled();
    expect(aiService.enrichContextualTerm).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'FAILED'] as const)(
    'claims and enriches a %s term once',
    async (explanationStatus) => {
      repository.findContextualTerm
        .mockResolvedValueOnce(
          lookupRecord({
            term: {
              ...lookupRecord().term,
              explanationStatus,
            },
          }),
        )
        .mockResolvedValueOnce(lookupRecord());
      repository.claimContextualTermEnrichment.mockResolvedValue(
        enrichmentClaim(),
      );
      aiService.enrichContextualTerm.mockResolvedValue(enrichmentResult);

      await expect(
        service.getContextualTerm('user-id', articleId, termId),
      ).resolves.toMatchObject({ term: { explanationStatus: 'READY' } });

      expect(repository.claimContextualTermEnrichment).toHaveBeenCalledWith(
        articleId,
        termId,
      );
      expect(aiService.enrichContextualTerm).toHaveBeenCalledWith({
        articleId,
        articleTitle: 'Plastic Waste',
        termId,
        value: 'harmful',
        lemma: 'harmful',
        unitType: LexicalUnitType.WORD,
        parentSentenceText: 'Plastic waste is harmful.',
        surroundingSentenceContext:
          '[1] Plastic remains in the environment.\n[3] Communities are reducing waste.',
      });
      expect(repository.completeContextualTermEnrichment).toHaveBeenCalledWith(
        expect.objectContaining({
          articleId,
          contentVersion: 3,
          termId,
          parentSentenceId: '550e8400-e29b-41d4-a716-446655440001',
          enrichment: enrichmentResult,
        }),
      );
    },
  );

  it('returns a retryable 503 for PROCESSING without a duplicate provider call', async () => {
    repository.findContextualTerm.mockResolvedValue(
      lookupRecord({
        term: {
          ...lookupRecord().term,
          explanationStatus: 'PROCESSING',
        },
      }),
    );

    await expect(
      service.getContextualTerm('user-id', articleId, termId),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.claimContextualTermEnrichment).not.toHaveBeenCalled();
    expect(aiService.enrichContextualTerm).not.toHaveBeenCalled();
  });

  it('allows only one provider call across two concurrent pending lookups', async () => {
    let status: 'PENDING' | 'PROCESSING' | 'READY' = 'PENDING';
    let resolveEnrichment!: (value: typeof enrichmentResult) => void;
    const pendingEnrichment = new Promise<typeof enrichmentResult>(
      (resolve) => {
        resolveEnrichment = resolve;
      },
    );
    repository.findContextualTerm.mockImplementation(() =>
      Promise.resolve(
        lookupRecord({
          term: { ...lookupRecord().term, explanationStatus: status },
        }),
      ),
    );
    repository.claimContextualTermEnrichment.mockImplementation(() => {
      if (status !== 'PENDING') return Promise.resolve(null);
      status = 'PROCESSING';
      return Promise.resolve(enrichmentClaim());
    });
    aiService.enrichContextualTerm.mockReturnValue(pendingEnrichment);
    repository.completeContextualTermEnrichment.mockImplementation(() => {
      status = 'READY';
      return Promise.resolve();
    });

    const first = service.getContextualTerm('user-id', articleId, termId);
    await Promise.resolve();
    const second = service.getContextualTerm('user-id', articleId, termId);

    await expect(second).rejects.toBeInstanceOf(ServiceUnavailableException);
    resolveEnrichment(enrichmentResult);
    await expect(first).resolves.toMatchObject({
      term: { explanationStatus: 'READY' },
    });
    expect(aiService.enrichContextualTerm).toHaveBeenCalledTimes(1);
  });

  it('stores a safe FAILED state when provider enrichment fails', async () => {
    repository.findContextualTerm.mockResolvedValue(
      lookupRecord({
        term: { ...lookupRecord().term, explanationStatus: 'PENDING' },
      }),
    );
    repository.claimContextualTermEnrichment.mockResolvedValue(
      enrichmentClaim(),
    );
    aiService.enrichContextualTerm.mockRejectedValue(
      new Error('raw output and secret key'),
    );

    await expect(
      service.getContextualTerm('user-id', articleId, termId),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.failContextualTermEnrichment).toHaveBeenCalledWith(
      articleId,
      3,
      termId,
      'AI contextual-term enrichment failed safely',
    );
  });

  it('rejects stale persistence and never returns a partial success', async () => {
    repository.findContextualTerm.mockResolvedValue(
      lookupRecord({
        term: { ...lookupRecord().term, explanationStatus: 'PENDING' },
      }),
    );
    repository.claimContextualTermEnrichment.mockResolvedValue(
      enrichmentClaim(),
    );
    aiService.enrichContextualTerm.mockResolvedValue(enrichmentResult);
    repository.completeContextualTermEnrichment.mockRejectedValue(
      new ContextualTermEnrichmentStateConflictError(),
    );

    await expect(
      service.getContextualTerm('user-id', articleId, termId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.failContextualTermEnrichment).toHaveBeenCalledWith(
      articleId,
      3,
      termId,
      'Contextual term source changed during enrichment',
    );
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

  it('rejects vocabulary saves before READY or with a non-canonical example snapshot', async () => {
    repository.findContextualTermForSave.mockResolvedValueOnce({
      ...lookupRecord({
        term: { ...lookupRecord().term, explanationStatus: 'FAILED' },
      }),
      parentSentence: {
        ...lookupRecord().parentSentence,
        contentVersion: 3,
      },
      sourceArticle: { id: articleId, contentVersion: 3 },
    });
    await expect(
      service.getContextualTermForSave(termId),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    repository.findContextualTermForSave.mockResolvedValueOnce({
      ...lookupRecord({
        term: {
          ...lookupRecord().term,
          examples: [{ sentence: 'Missing translation' }],
        },
      }),
      parentSentence: {
        ...lookupRecord().parentSentence,
        contentVersion: 3,
      },
      sourceArticle: { id: articleId, contentVersion: 3 },
    });
    await expect(
      service.getContextualTermForSave(termId),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
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
