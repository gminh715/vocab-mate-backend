import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AiGenerationStatus,
  ArticleStatus,
  TermOrigin,
  TermReviewStatus,
} from '../../../../generated/prisma/enums';
import {
  ArticleTermReferencedError,
  ArticleTermStateConflictError,
  ArticlesRepository,
  type TermMarkerWriteInput,
} from '../repositories/articles.repository';
import { HtmlSanitizerHelper } from '../helpers/html-sanitizer.helper';
import { ArticleTermsService } from './article-terms.service';

const sentenceId = '11111111-1111-4111-8111-111111111111';
const termId = '22222222-2222-4222-8222-222222222222';
const baseHtml = `<p><span data-sentence-id="${sentenceId}">Digital tools improve learning. Digital tools connect people.</span></p>`;
const markedHtml = baseHtml.replace(
  /Digital tools/g,
  `<span data-term-id="${termId}">Digital tools</span>`,
);
const sentenceRecord = {
  id: sentenceId,
  articleId: 'article-id',
  contentVersion: 3,
  sentenceOrder: 1,
  sentenceText: 'Digital tools improve learning. Digital tools connect people.',
  translationVi: null,
  explanationVi: null,
  referenceExplanation: null,
  skill: null,
  isActive: true,
  createdAt: new Date('2026-07-23T00:00:00Z'),
  updatedAt: new Date('2026-07-23T00:00:00Z'),
};
const termRecord = {
  id: termId,
  sentenceId,
  value: 'Digital tools',
  wordDisplay: 'digital tools',
  lemma: 'digital tool',
  normalizedLemma: 'digital tool',
  unitType: 'PHRASE' as const,
  partOfSpeech: 'noun phrase',
  ipa: null,
  cefrLevel: 'B1' as const,
  contextualMeaningVi: 'công cụ số',
  definitionEn: null,
  contextualExplanation: null,
  synonyms: [],
  antonyms: [],
  collocations: [],
  relatedTerms: [],
  vocabularyTopic: null,
  examples: [],
  skill: null,
  origin: TermOrigin.MANUAL,
  reviewStatus: TermReviewStatus.APPROVED,
  selectionReason: null,
  explanationStatus: AiGenerationStatus.READY,
  explanationError: null,
  explanationGeneratedAt: null,
  isLookupEnabled: true,
  isActive: true,
  createdAt: new Date('2026-07-23T00:00:00Z'),
  updatedAt: new Date('2026-07-23T00:00:00Z'),
};
const pendingCandidate = {
  ...termRecord,
  origin: TermOrigin.AI,
  reviewStatus: TermReviewStatus.PENDING,
  selectionReason: 'Useful phrase in the article context.',
  explanationStatus: AiGenerationStatus.PENDING,
  contextualMeaningVi: null,
  isLookupEnabled: false,
  isActive: false,
};
const createDto = {
  value: 'Digital tools',
  wordDisplay: 'digital tools',
  lemma: 'digital tool',
  normalizedLemma: 'digital tool',
  unitType: 'PHRASE' as const,
  partOfSpeech: 'noun phrase',
  cefrLevel: 'B1' as const,
  contextualMeaningVi: 'công cụ số',
};

describe('ArticleTermsService', () => {
  const repository = {
    findSentenceTermContext: jest.fn(),
    createTermWithMarker: jest.fn(),
    findTerms: jest.fn(),
    findTermDetail: jest.fn(),
    findTermMutationContext: jest.fn(),
    updateTermMetadata: jest.fn(),
    updateTermWithMarker: jest.fn(),
    approveAiTermWithMarker: jest.fn(),
    rejectAiTerm: jest.fn(),
    deleteTermWithMarker: jest.fn(),
  };
  const service = new ArticleTermsService(
    repository as unknown as ArticlesRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findSentenceTermContext.mockResolvedValue({
      article: {
        id: 'article-id',
        status: ArticleStatus.DRAFT,
        contentHtml: baseHtml,
        contentVersion: 3,
      },
      sentence: sentenceRecord,
    });
    repository.findTermMutationContext.mockResolvedValue({
      article: {
        id: 'article-id',
        status: ArticleStatus.DRAFT,
        contentHtml: markedHtml,
        contentVersion: 3,
      },
      sentence: sentenceRecord,
      term: termRecord,
    });
    repository.createTermWithMarker.mockResolvedValue(termRecord);
    repository.updateTermMetadata.mockResolvedValue(termRecord);
    repository.updateTermWithMarker.mockResolvedValue(termRecord);
    repository.approveAiTermWithMarker.mockResolvedValue({
      ...pendingCandidate,
      reviewStatus: TermReviewStatus.APPROVED,
      isLookupEnabled: true,
      isActive: true,
    });
    repository.rejectAiTerm.mockResolvedValue({
      ...pendingCandidate,
      reviewStatus: TermReviewStatus.REJECTED,
    });
    repository.deleteTermWithMarker.mockResolvedValue(undefined);
  });

  it('creates metadata and all-occurrence markers through one repository write', async () => {
    const result = await service.create(
      'admin-id',
      'article-id',
      sentenceId,
      createDto,
    );

    expect(result.updatedContentHtml.match(/data-term-id=/g)).toHaveLength(2);
    expect(result.updatedContentHtml).toBe(
      HtmlSanitizerHelper.sanitize(result.updatedContentHtml),
    );
    expect(repository.createTermWithMarker).toHaveBeenCalledTimes(1);
    expect(repository.createTermWithMarker).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: 'article-id',
        sentenceId,
        contentVersion: 3,
        sourceContentHtml: baseHtml,
        actingAdminId: 'admin-id',
      }),
      expect.objectContaining({
        sentenceId,
        value: 'Digital tools',
        normalizedLemma: 'digital tool',
        createdByUserId: 'admin-id',
        updatedByUserId: 'admin-id',
      }),
    );
  });

  it('rejects inactive, stale, or unmatched sentence contexts', async () => {
    repository.findSentenceTermContext.mockResolvedValueOnce({
      article: {
        id: 'article-id',
        status: ArticleStatus.DRAFT,
        contentHtml: baseHtml,
        contentVersion: 3,
      },
      sentence: { ...sentenceRecord, isActive: false },
    });
    await expect(
      service.create('admin-id', 'article-id', sentenceId, createDto),
    ).rejects.toThrow(ConflictException);

    repository.findSentenceTermContext.mockResolvedValueOnce(null);
    await expect(
      service.create('admin-id', 'article-id', sentenceId, createDto),
    ).rejects.toThrow(NotFoundException);

    await expect(
      service.create('admin-id', 'article-id', sentenceId, {
        ...createDto,
        value: 'missing',
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('updates metadata without rewriting article HTML', async () => {
    const result = await service.update('admin-id', 'article-id', termId, {
      definitionEn: 'Electronic resources.',
      isLookupEnabled: false,
    });

    expect(result.contentHtmlChanged).toBe(false);
    expect(repository.updateTermMetadata).toHaveBeenCalledWith(
      'article-id',
      3,
      termId,
      {
        definitionEn: 'Electronic resources.',
        isLookupEnabled: false,
        updatedByUserId: 'admin-id',
      },
    );
    expect(repository.updateTermWithMarker).not.toHaveBeenCalled();
  });

  it('forwards allowlisted moderation filters to the current-version list', async () => {
    repository.findTerms.mockResolvedValue({
      contentVersion: 3,
      items: [],
      total: 0,
    });

    await service.findAll('article-id', {
      page: 1,
      limit: 20,
      origin: TermOrigin.AI,
      reviewStatus: TermReviewStatus.PENDING,
      explanationStatus: AiGenerationStatus.FAILED,
    });

    expect(repository.findTerms).toHaveBeenCalledWith('article-id', {
      page: 1,
      limit: 20,
      origin: TermOrigin.AI,
      reviewStatus: TermReviewStatus.PENDING,
      explanationStatus: AiGenerationStatus.FAILED,
    });
  });

  it('atomically rebuilds the marker when value changes', async () => {
    const result = await service.update('admin-id', 'article-id', termId, {
      value: 'learning',
      unitType: 'WORD',
    });

    expect(result.contentHtmlChanged).toBe(true);
    const markerInput = (
      repository.updateTermWithMarker.mock.calls as unknown as Array<
        [TermMarkerWriteInput, unknown]
      >
    )[0][0];
    expect(markerInput).toMatchObject({
      termId,
      sourceContentHtml: markedHtml,
    });
    expect(markerInput.updatedContentHtml).toContain(
      `data-term-id="${termId}">learning</span>`,
    );
    expect(repository.updateTermWithMarker).toHaveBeenCalledWith(markerInput, {
      value: 'learning',
      unitType: 'WORD',
      updatedByUserId: 'admin-id',
    });
    expect(repository.updateTermMetadata).not.toHaveBeenCalled();
  });

  it('keeps one marker when editing an approved AI term value', async () => {
    const singleMarkedHtml = baseHtml.replace(
      'Digital tools',
      `<span data-term-id="${termId}">Digital tools</span>`,
    );
    repository.findTermMutationContext.mockResolvedValue({
      article: {
        id: 'article-id',
        status: ArticleStatus.DRAFT,
        contentHtml: singleMarkedHtml,
        contentVersion: 3,
      },
      sentence: sentenceRecord,
      term: {
        ...pendingCandidate,
        reviewStatus: TermReviewStatus.APPROVED,
        isActive: true,
        isLookupEnabled: true,
      },
    });

    await service.update('admin-id', 'article-id', termId, {
      value: 'tools',
      unitType: 'WORD',
    });

    const updateCalls = repository.updateTermWithMarker.mock
      .calls as unknown as Array<[TermMarkerWriteInput, unknown]>;
    const markerInput = updateCalls[0]?.[0];
    if (!markerInput) throw new Error('Expected AI term marker update');
    expect(markerInput.updatedContentHtml.match(/data-term-id=/g)).toHaveLength(
      1,
    );
  });

  it('approves a pending AI candidate with exactly one marker', async () => {
    repository.findTermMutationContext.mockResolvedValue({
      article: {
        id: 'article-id',
        status: ArticleStatus.DRAFT,
        contentHtml: baseHtml,
        contentVersion: 3,
      },
      sentence: sentenceRecord,
      term: pendingCandidate,
    });

    const result = await service.approveAiCandidate(
      'admin-id',
      'article-id',
      termId,
    );

    expect(result.contentHtmlChanged).toBe(true);
    const approvalCalls = repository.approveAiTermWithMarker.mock
      .calls as unknown as Array<[TermMarkerWriteInput]>;
    const markerInput = approvalCalls[0]?.[0];
    if (!markerInput) throw new Error('Expected AI candidate approval write');
    expect(markerInput.updatedContentHtml.match(/data-term-id=/g)).toHaveLength(
      1,
    );
    expect(markerInput).toMatchObject({
      articleId: 'article-id',
      sentenceId,
      termId,
      contentVersion: 3,
      sourceContentHtml: baseHtml,
      actingAdminId: 'admin-id',
    });
  });

  it('returns an already approved AI candidate without duplicating its marker', async () => {
    const singleMarkedHtml = baseHtml.replace(
      'Digital tools',
      `<span data-term-id="${termId}">Digital tools</span>`,
    );
    repository.findTermMutationContext.mockResolvedValue({
      article: {
        id: 'article-id',
        status: ArticleStatus.DRAFT,
        contentHtml: singleMarkedHtml,
        contentVersion: 3,
      },
      sentence: sentenceRecord,
      term: {
        ...pendingCandidate,
        reviewStatus: TermReviewStatus.APPROVED,
        isActive: true,
        isLookupEnabled: true,
      },
    });

    await expect(
      service.approveAiCandidate('admin-id', 'article-id', termId),
    ).resolves.toMatchObject({ contentHtmlChanged: false });
    expect(repository.approveAiTermWithMarker).not.toHaveBeenCalled();
  });

  it('rejects a pending AI candidate without changing article HTML', async () => {
    repository.findTermMutationContext.mockResolvedValue({
      article: {
        id: 'article-id',
        status: ArticleStatus.DRAFT,
        contentHtml: baseHtml,
        contentVersion: 3,
      },
      sentence: sentenceRecord,
      term: pendingCandidate,
    });

    await expect(
      service.rejectAiCandidate('admin-id', 'article-id', termId),
    ).resolves.toMatchObject({
      term: { reviewStatus: TermReviewStatus.REJECTED },
      contentHtmlChanged: false,
    });
    expect(repository.rejectAiTerm).toHaveBeenCalledWith(
      'article-id',
      3,
      termId,
      'admin-id',
    );
    expect(repository.approveAiTermWithMarker).not.toHaveBeenCalled();
  });

  it('returns an already rejected AI candidate idempotently', async () => {
    repository.findTermMutationContext.mockResolvedValue({
      article: {
        id: 'article-id',
        status: ArticleStatus.DRAFT,
        contentHtml: baseHtml,
        contentVersion: 3,
      },
      sentence: sentenceRecord,
      term: {
        ...pendingCandidate,
        reviewStatus: TermReviewStatus.REJECTED,
      },
    });

    await expect(
      service.rejectAiCandidate('admin-id', 'article-id', termId),
    ).resolves.toMatchObject({ contentHtmlChanged: false });
    expect(repository.rejectAiTerm).not.toHaveBeenCalled();
  });

  it('rejects moderation outside DRAFT and overlapping candidate approval', async () => {
    repository.findTermMutationContext.mockResolvedValueOnce({
      article: {
        id: 'article-id',
        status: ArticleStatus.PUBLISHED,
        contentHtml: baseHtml,
        contentVersion: 3,
      },
      sentence: sentenceRecord,
      term: pendingCandidate,
    });
    await expect(
      service.approveAiCandidate('admin-id', 'article-id', termId),
    ).rejects.toThrow(ConflictException);

    repository.findTermMutationContext.mockResolvedValueOnce({
      article: {
        id: 'article-id',
        status: ArticleStatus.PUBLISHED,
        contentHtml: baseHtml,
        contentVersion: 3,
      },
      sentence: sentenceRecord,
      term: pendingCandidate,
    });
    await expect(
      service.rejectAiCandidate('admin-id', 'article-id', termId),
    ).rejects.toThrow(ConflictException);

    repository.findTermMutationContext.mockResolvedValueOnce({
      article: {
        id: 'article-id',
        status: ArticleStatus.DRAFT,
        contentHtml: baseHtml.replace(
          'Digital tools',
          '<span data-term-id="existing-term">Digital tools</span>',
        ),
        contentVersion: 3,
      },
      sentence: sentenceRecord,
      term: pendingCandidate,
    });
    await expect(
      service.approveAiCandidate('admin-id', 'article-id', termId),
    ).rejects.toThrow(ConflictException);
    expect(repository.approveAiTermWithMarker).not.toHaveBeenCalled();
  });

  it('maps a stale approval write to a content conflict', async () => {
    repository.findTermMutationContext.mockResolvedValue({
      article: {
        id: 'article-id',
        status: ArticleStatus.DRAFT,
        contentHtml: baseHtml,
        contentVersion: 3,
      },
      sentence: sentenceRecord,
      term: pendingCandidate,
    });
    repository.approveAiTermWithMarker.mockRejectedValue(
      new ArticleTermStateConflictError(),
    );

    await expect(
      service.approveAiCandidate('admin-id', 'article-id', termId),
    ).rejects.toThrow(
      new ConflictException(
        'Article content or sentence state changed; retry the request',
      ),
    );
  });

  it('does not allow normal PATCH to activate a pending candidate', async () => {
    repository.findTermMutationContext.mockResolvedValue({
      article: {
        id: 'article-id',
        status: ArticleStatus.DRAFT,
        contentHtml: baseHtml,
        contentVersion: 3,
      },
      sentence: sentenceRecord,
      term: pendingCandidate,
    });

    await expect(
      service.update('admin-id', 'article-id', termId, { isActive: true }),
    ).rejects.toThrow(ConflictException);
    expect(repository.updateTermMetadata).not.toHaveBeenCalled();
  });

  it('maps referenced deletion to conflict without requesting soft deletion', async () => {
    repository.deleteTermWithMarker.mockRejectedValue(
      new ArticleTermReferencedError(),
    );

    await expect(
      service.delete('admin-id', 'article-id', termId),
    ).rejects.toThrow(ConflictException);
  });
});
