import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CefrLevel,
  LearningStatus,
  LexicalUnitType,
} from '../../../../generated/prisma/enums';
import { AiService } from '../../../../src/modules/ai/ai.service';
import {
  type ContextualTermEnrichmentClaimRecord,
  ContextualTermEnrichmentStateConflictError,
  type ContextualTermLookupRecord,
  ContextualTermsRepository,
} from '../../../../src/modules/reading/contextual-terms.repository';
import { ContextualTermsService } from '../../../../src/modules/reading/contextual-terms.service';

const articleId = '550e8400-e29b-41d4-a716-446655440000';
const termId = '550e8400-e29b-41d4-a716-446655440002';

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
    contextualMeaningVi: 'cÃ³ háº¡i',
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
    translationVi: 'RÃ¡c tháº£i nhá»±a cÃ³ háº¡i.',
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
  contextualMeaningVi: 'cÃ³ háº¡i',
  definitionEn: 'causing damage',
  contextualExplanation: 'It describes a damaging effect.',
  ipa: '/ËˆhÉ‘ËrmfÉ™l/',
  synonyms: ['damaging'],
  antonyms: ['beneficial'],
  collocations: ['harmful effect'],
  relatedTerms: ['harm'],
  vocabularyTopic: 'environment',
  examples: [
    {
      sentence: 'Smoke is harmful to health.',
      translationVi: 'KhÃ³i cÃ³ háº¡i cho sá»©c khá»e.',
    },
  ],
  sentenceTranslationVi: 'RÃ¡c tháº£i nhá»±a cÃ³ háº¡i.',
};

describe('ContextualTermsService', () => {
  let service: ContextualTermsService;
  let repository: {
    findContextualTerm: jest.Mock;
    findContextualTermForSave: jest.Mock;
    claimContextualTermEnrichment: jest.Mock;
    completeContextualTermEnrichment: jest.Mock;
    failContextualTermEnrichment: jest.Mock;
  };
  let aiService: { enrichContextualTerm: jest.Mock };

  beforeEach(async () => {
    repository = {
      findContextualTerm: jest.fn(),
      findContextualTermForSave: jest.fn(),
      claimContextualTermEnrichment: jest.fn(),
      completeContextualTermEnrichment: jest.fn(),
      failContextualTermEnrichment: jest.fn(),
    };
    aiService = { enrichContextualTerm: jest.fn() };
    repository.failContextualTermEnrichment.mockResolvedValue(true);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextualTermsService,
        { provide: ContextualTermsRepository, useValue: repository },
        { provide: AiService, useValue: aiService },
      ],
    }).compile();

    service = module.get(ContextualTermsService);
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
});
