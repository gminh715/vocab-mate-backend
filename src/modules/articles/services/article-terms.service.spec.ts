import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ArticleStatus } from '../../../../generated/prisma/enums';
import {
  ArticleTermReferencedError,
  ArticlesRepository,
  type TermMarkerWriteInput,
} from '../repositories/articles.repository';
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
  isLookupEnabled: true,
  isActive: true,
  createdAt: new Date('2026-07-23T00:00:00Z'),
  updatedAt: new Date('2026-07-23T00:00:00Z'),
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

  it('maps referenced deletion to conflict without requesting soft deletion', async () => {
    repository.deleteTermWithMarker.mockRejectedValue(
      new ArticleTermReferencedError(),
    );

    await expect(
      service.delete('admin-id', 'article-id', termId),
    ).rejects.toThrow(ConflictException);
  });
});
