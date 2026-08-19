import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CefrLevel,
  LearningStatus,
  LexicalUnitType,
} from '../../../../generated/prisma/enums';
import { ReadingService } from '../../../../src/modules/reading/reading.service';
import { VocabularySort } from '../../../../src/modules/vocabularies/dto/vocabulary-request.dto';
import {
  InvalidVocabularyCollectionsError,
  VocabulariesRepository,
} from '../../../../src/modules/vocabularies/vocabularies.repository';
import { VocabulariesService } from '../../../../src/modules/vocabularies/vocabularies.service';

const TERM_ID = '11111111-1111-4111-8111-111111111111';
const VOCABULARY_ID = '22222222-2222-4222-8222-222222222222';
const COLLECTION_ID = '33333333-3333-4333-8333-333333333333';

const sourceRecord = () => ({
  term: {
    id: TERM_ID,
    value: 'harmful',
    wordDisplay: 'harmful',
    lemma: 'harmful',
    unitType: LexicalUnitType.WORD,
    partOfSpeech: 'adjective',
    ipa: '/ˈhɑːrmfəl/',
    cefrLevel: CefrLevel.B1,
    contextualMeaningVi: 'có hại',
    definitionEn: 'causing damage',
    contextualExplanation: 'A negative effect in this context.',
    explanationStatus: 'READY',
    explanationGeneratedAt: new Date('2026-07-23T00:00:00Z'),
    synonyms: ['damaging'],
    antonyms: ['beneficial'],
    collocations: ['harmful effect'],
    relatedTerms: ['harm'],
    vocabularyTopic: 'environment',
    examples: [
      {
        sentence: 'Plastic is harmful.',
        translationVi: 'Nhựa có hại.',
      },
    ],
    skill: null,
  },
  parentSentence: {
    id: '44444444-4444-4444-8444-444444444444',
    sentenceOrder: 1,
    sentenceText: 'Plastic waste is harmful.',
    translationVi: 'Rác thải nhựa có hại.',
    explanationVi: null,
    referenceExplanation: null,
    skill: null,
    contentVersion: 2,
  },
  sourceArticle: {
    id: '55555555-5555-4555-8555-555555555555',
    contentVersion: 2,
  },
  isLookupEnabled: true,
});

const savedRecord = () => ({
  id: VOCABULARY_ID,
  articleSentenceTermId: TERM_ID,
  learningStatus: LearningStatus.NEW,
  personalNote: 'Remember this',
  savedWordDisplay: 'harmful',
  savedLemma: 'harmful',
  savedPartOfSpeech: 'adjective',
  savedIpa: '/ˈhɑːrmfəl/',
  savedCefrLevel: CefrLevel.B1,
  savedContextSentence: 'Plastic waste is harmful.',
  savedContextTranslationVi: 'Rác thải nhựa có hại.',
  savedMeaningVi: 'có hại',
  savedExplanation: 'A negative effect in this context.',
  savedExamples: [],
  savedAt: new Date('2026-07-23T01:00:00Z'),
  lastReviewedAt: null,
  nextReviewAt: null,
  reviewIntervalDays: null,
  collectionItems: [
    {
      addedAt: new Date('2026-07-23T01:00:00Z'),
      collection: {
        id: COLLECTION_ID,
        name: 'Difficult Words',
        description: null,
      },
    },
  ],
  articleSentenceTerm: {
    sentence: {
      article: {
        id: '55555555-5555-4555-8555-555555555555',
        slug: 'plastic-waste',
        title: 'Plastic Waste',
        thumbnailUrl: null,
        sourceName: 'Vocab Mate News',
        sourceUrl: null,
      },
    },
  },
});

describe('VocabulariesService', () => {
  let service: VocabulariesService;
  let repository: {
    list: jest.Mock;
    findOwnedById: jest.Mock;
    createWithCollections: jest.Mock;
    deleteOwned: jest.Mock;
  };
  let readingService: { getContextualTermForSave: jest.Mock };

  beforeEach(async () => {
    repository = {
      list: jest.fn(),
      findOwnedById: jest.fn(),
      createWithCollections: jest.fn(),
      deleteOwned: jest.fn(),
    };
    readingService = {
      getContextualTermForSave: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VocabulariesService,
        { provide: VocabulariesRepository, useValue: repository },
        { provide: ReadingService, useValue: readingService },
      ],
    }).compile();
    service = module.get(VocabulariesService);
  });

  it('passes normalized owner-scoped filters and maps snapshot-only list cards', async () => {
    const { articleSentenceTerm: _articleSentenceTerm, ...listRecord } =
      savedRecord();
    void _articleSentenceTerm;
    repository.list.mockResolvedValue({
      items: [listRecord],
      total: 21,
    });

    const result = await service.findAll('owner-id', {
      page: 2,
      limit: 10,
      q: 'harmful',
      learningStatus: LearningStatus.NEW,
      cefrLevel: CefrLevel.B1,
      collectionId: COLLECTION_ID,
      dueOnly: true,
      sort: VocabularySort.NEWEST,
    });

    expect(repository.list).toHaveBeenCalledWith(
      'owner-id',
      {
        page: 2,
        limit: 10,
        q: 'harmful',
        learningStatus: LearningStatus.NEW,
        cefrLevel: CefrLevel.B1,
        collectionId: COLLECTION_ID,
        dueOnly: true,
        sort: VocabularySort.NEWEST,
      },
      expect.any(Date),
    );
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 21,
      totalPages: 3,
    });
    expect(result.items[0]).toMatchObject({
      savedWordDisplay: 'harmful',
      collections: [{ id: COLLECTION_ID }],
    });
    expect(result.items[0]).not.toHaveProperty('articleSentenceTerm');
  });

  it('returns owned detail with a collections array and lightweight source article', async () => {
    repository.findOwnedById.mockResolvedValue(savedRecord());

    const result = await service.findOne('owner-id', VOCABULARY_ID);

    expect(repository.findOwnedById).toHaveBeenCalledWith(
      'owner-id',
      VOCABULARY_ID,
    );
    expect(result.collections).toEqual([
      expect.objectContaining({ id: COLLECTION_ID }),
    ]);
    expect(result.sourceArticle).toEqual(
      expect.objectContaining({
        id: '55555555-5555-4555-8555-555555555555',
        slug: 'plastic-waste',
      }),
    );
    expect(result.vocabulary).not.toHaveProperty('articleSentenceTerm');
  });

  it('returns generic not found for missing or non-owned vocabulary', async () => {
    repository.findOwnedById.mockResolvedValue(null);

    await expect(service.findOne('owner-id', VOCABULARY_ID)).rejects.toThrow(
      new NotFoundException('Saved vocabulary not found'),
    );
  });

  it('deletes owned vocabulary regardless of review history references', async () => {
    repository.deleteOwned.mockResolvedValue(true);

    await expect(
      service.remove('owner-id', VOCABULARY_ID),
    ).resolves.toBeUndefined();
    expect(repository.deleteOwned).toHaveBeenCalledWith(
      'owner-id',
      VOCABULARY_ID,
    );
  });

  it('returns generic not found when deleting missing or non-owned vocabulary', async () => {
    repository.deleteOwned.mockResolvedValue(false);

    await expect(service.remove('owner-id', VOCABULARY_ID)).rejects.toThrow(
      new NotFoundException('Saved vocabulary not found'),
    );
  });

  it('creates the immutable snapshot from a READY enriched source', async () => {
    readingService.getContextualTermForSave.mockResolvedValue(sourceRecord());
    repository.createWithCollections.mockResolvedValue(savedRecord());

    const result = await service.save('owner-id', {
      articleSentenceTermId: TERM_ID,
      personalNote: 'Remember this',
      collectionIds: [COLLECTION_ID],
    });

    expect(repository.createWithCollections).toHaveBeenCalledWith(
      'owner-id',
      expect.objectContaining({
        articleSentenceTermId: TERM_ID,
        learningStatus: LearningStatus.NEW,
        personalNote: 'Remember this',
        savedWordDisplay: 'harmful',
        savedLemma: 'harmful',
        savedPartOfSpeech: 'adjective',
        savedIpa: '/ˈhɑːrmfəl/',
        savedCefrLevel: CefrLevel.B1,
        savedContextSentence: 'Plastic waste is harmful.',
        savedContextTranslationVi: 'Rác thải nhựa có hại.',
        savedMeaningVi: 'có hại',
        savedExplanation: 'A negative effect in this context.',
        savedExamples: sourceRecord().term.examples,
        lastReviewedAt: null,
        nextReviewAt: null,
        reviewIntervalDays: null,
      }),
      [COLLECTION_ID],
    );
    expect(result).toMatchObject({
      vocabulary: { learningStatus: LearningStatus.NEW },
      collections: [{ id: COLLECTION_ID }],
    });
  });

  it('deduplicates collection IDs before the transaction', async () => {
    readingService.getContextualTermForSave.mockResolvedValue(sourceRecord());
    repository.createWithCollections.mockResolvedValue(savedRecord());

    await service.save('owner-id', {
      articleSentenceTermId: TERM_ID,
      collectionIds: [COLLECTION_ID, COLLECTION_ID],
    });

    expect(repository.createWithCollections).toHaveBeenCalledWith(
      'owner-id',
      expect.any(Object),
      [COLLECTION_ID],
    );
  });

  it('keeps an existing vocabulary snapshot unchanged after later source edits', async () => {
    const originalSource = sourceRecord();
    let storedSnapshot: ReturnType<typeof savedRecord> | null = null;
    readingService.getContextualTermForSave.mockResolvedValue(originalSource);
    repository.createWithCollections.mockImplementation(
      (_userId: string, input: Record<string, unknown>) => {
        storedSnapshot = {
          ...savedRecord(),
          savedMeaningVi: String(input.savedMeaningVi),
          savedContextTranslationVi: String(input.savedContextTranslationVi),
          savedExamples: input.savedExamples,
        };
        return Promise.resolve(storedSnapshot);
      },
    );

    await service.save('owner-id', {
      articleSentenceTermId: TERM_ID,
      collectionIds: [COLLECTION_ID],
    });
    originalSource.term.contextualMeaningVi = 'nghĩa nguồn đã sửa';
    originalSource.parentSentence.translationVi = 'Bản dịch nguồn đã sửa.';
    originalSource.term.examples = [
      {
        sentence: 'A later source example.',
        translationVi: 'Ví dụ nguồn mới.',
      },
    ];
    repository.findOwnedById.mockImplementation(() =>
      Promise.resolve(storedSnapshot),
    );

    await expect(
      service.findOne('owner-id', VOCABULARY_ID),
    ).resolves.toMatchObject({
      vocabulary: {
        savedMeaningVi: 'có hại',
        savedContextTranslationVi: 'Rác thải nhựa có hại.',
        savedExamples: [
          {
            sentence: 'Plastic is harmful.',
            translationVi: 'Nhựa có hại.',
          },
        ],
      },
    });
    expect(readingService.getContextualTermForSave).toHaveBeenCalledTimes(1);
  });

  it('normalizes collection UUID casing and trims notes at the service boundary', async () => {
    const mixedCaseId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
    readingService.getContextualTermForSave.mockResolvedValue(sourceRecord());
    repository.createWithCollections.mockResolvedValue(savedRecord());

    await service.save('owner-id', {
      articleSentenceTermId: TERM_ID,
      personalNote: '  Remember this  ',
      collectionIds: [mixedCaseId],
    });

    expect(repository.createWithCollections).toHaveBeenCalledWith(
      'owner-id',
      expect.objectContaining({ personalNote: 'Remember this' }),
      [mixedCaseId.toLowerCase()],
    );
  });

  it('rejects saving vocabulary without a collection before reading the source', async () => {
    await expect(
      service.save('owner-id', {
        articleSentenceTermId: TERM_ID,
        collectionIds: [],
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'At least one collection is required to save vocabulary',
      ),
    );
    expect(readingService.getContextualTermForSave).not.toHaveBeenCalled();
    expect(repository.createWithCollections).not.toHaveBeenCalled();
  });

  it('rejects a missing required translation with a structured readiness error', async () => {
    readingService.getContextualTermForSave.mockResolvedValue({
      ...sourceRecord(),
      parentSentence: {
        ...sourceRecord().parentSentence,
        translationVi: null,
      },
    });

    await expect(
      service.save('owner-id', {
        articleSentenceTermId: TERM_ID,
        collectionIds: [COLLECTION_ID],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repository.createWithCollections).not.toHaveBeenCalled();
  });

  it('rejects a nullable contextual meaning before creating a vocabulary snapshot', async () => {
    readingService.getContextualTermForSave.mockResolvedValue({
      ...sourceRecord(),
      term: {
        ...sourceRecord().term,
        contextualMeaningVi: null,
      },
    });

    await expect(
      service.save('owner-id', {
        articleSentenceTermId: TERM_ID,
        collectionIds: [COLLECTION_ID],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repository.createWithCollections).not.toHaveBeenCalled();
  });

  it.each([
    ['inactive term', new NotFoundException()],
    ['lookup-disabled term', new ForbiddenException()],
    ['inactive or stale sentence', new NotFoundException()],
    ['non-published article', new NotFoundException()],
  ])('preserves Reading eligibility rejection for %s', async (_case, error) => {
    readingService.getContextualTermForSave.mockRejectedValue(error);

    await expect(
      service.save('owner-id', {
        articleSentenceTermId: TERM_ID,
        collectionIds: [COLLECTION_ID],
      }),
    ).rejects.toBe(error);
    expect(repository.createWithCollections).not.toHaveBeenCalled();
  });

  it('maps concurrent duplicate insertion to conflict', async () => {
    readingService.getContextualTermForSave.mockResolvedValue(sourceRecord());
    repository.createWithCollections.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );

    await expect(
      service.save('owner-id', {
        articleSentenceTermId: TERM_ID,
        collectionIds: [COLLECTION_ID],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps missing or non-owned collections to generic unprocessable entity', async () => {
    readingService.getContextualTermForSave.mockResolvedValue(sourceRecord());
    repository.createWithCollections.mockRejectedValue(
      new InvalidVocabularyCollectionsError(),
    );

    await expect(
      service.save('owner-id', {
        articleSentenceTermId: TERM_ID,
        collectionIds: [COLLECTION_ID],
      }),
    ).rejects.toThrow(
      new UnprocessableEntityException(
        'One or more collections are unavailable',
      ),
    );
  });
});
