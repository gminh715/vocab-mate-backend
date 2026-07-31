import {
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AiGenerationStatus,
  ArticleStatus,
} from '../../../../generated/prisma/enums';
import type { AiConfig } from '../../../config/ai.config';
import type { AiService } from '../../ai/ai.service';
import type { CategoriesRepository } from '../../categories/categories.repository';
import {
  ArticleAnalysisStateConflictError,
  type ArticleAnalysisCompletionRecord,
  type ArticleAnalysisSnapshot,
  type ArticlesRepository,
  type CompleteArticleAnalysisInput,
} from '../repositories/articles.repository';
import { ArticleAnalysisService } from './article-analysis.service';

const aiConfig: AiConfig = {
  geminiApiKey: 'test',
  geminiModel: 'test',
  groqApiKey: 'test',
  groqModel: 'test',
  requestTimeoutMs: 5000,
  maxArticleCharacters: 50000,
  maxTermsPerArticle: 5,
};

const snapshot = (
  overrides: Partial<ArticleAnalysisSnapshot['article']> = {},
): ArticleAnalysisSnapshot => ({
  article: {
    id: 'article-id',
    title: 'City expands transport',
    contentHtml:
      '<p><span data-sentence-id="sentence-1">The ambitious plan helps commuters.</span></p>',
    contentVersion: 3,
    status: ArticleStatus.DRAFT,
    aiAnalysisStatus: AiGenerationStatus.PENDING,
    ...overrides,
  },
  sentences: [
    {
      id: 'sentence-1',
      sentenceOrder: 1,
      sentenceText: 'The ambitious plan helps commuters.',
      terms: [],
    },
  ],
});

const validResult = {
  summaryEn: 'The city has an ambitious transport plan.',
  cefrLevel: 'B1' as const,
  categorySlug: 'society',
  terms: [
    {
      sentenceId: 'sentence-1',
      value: 'ambitious',
      wordDisplay: 'ambitious',
      lemma: 'ambitious',
      normalizedLemma: 'ambitious',
      unitType: 'WORD' as const,
      partOfSpeech: 'Adjective',
      cefrLevel: 'B1' as const,
      selectionReason: 'Useful for describing challenging goals.',
    },
  ],
};

describe('ArticleAnalysisService', () => {
  const repository = {
    findAnalysisSnapshot: jest.fn<
      Promise<ArticleAnalysisSnapshot | null>,
      [string]
    >(),
    claimArticleAnalysis: jest.fn<Promise<boolean>, [string, number]>(),
    failArticleAnalysis: jest.fn<
      Promise<boolean>,
      [string, number, string, string]
    >(),
    completeArticleAnalysis: jest.fn<
      Promise<ArticleAnalysisCompletionRecord>,
      [CompleteArticleAnalysisInput]
    >(),
  };
  const categoriesRepository = {
    findActive: jest.fn(),
  };
  const aiService = {
    analyzeArticle: jest.fn(),
  };
  const service = new ArticleAnalysisService(
    repository as unknown as ArticlesRepository,
    categoriesRepository as unknown as CategoriesRepository,
    aiService as unknown as AiService,
    aiConfig,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findAnalysisSnapshot.mockResolvedValue(snapshot());
    repository.claimArticleAnalysis.mockResolvedValue(true);
    repository.failArticleAnalysis.mockResolvedValue(true);
    repository.completeArticleAnalysis.mockImplementation(
      (input: CompleteArticleAnalysisInput) =>
        Promise.resolve({
          articleId: input.articleId,
          contentVersion: input.contentVersion,
          aiAnalysisStatus: AiGenerationStatus.READY,
          category: {
            id: input.categoryId,
            slug: 'society',
            name: 'Society',
          },
          cefrLevel: input.cefrLevel,
          candidateCount: input.terms.length,
        }),
    );
    categoriesRepository.findActive.mockResolvedValue([
      { id: 'category-id', slug: 'society', name: 'Society' },
    ]);
    aiService.analyzeArticle.mockResolvedValue(validResult);
  });

  it('claims, analyzes, validates, and persists pending candidates without markers', async () => {
    await expect(service.analyze('admin-id', 'article-id')).resolves.toEqual({
      articleId: 'article-id',
      contentVersion: 3,
      aiAnalysisStatus: AiGenerationStatus.READY,
      category: {
        id: 'category-id',
        slug: 'society',
        name: 'Society',
      },
      cefrLevel: 'B1',
      candidateCount: 1,
    });

    expect(repository.claimArticleAnalysis).toHaveBeenCalledWith(
      'article-id',
      3,
    );
    expect(aiService.analyzeArticle).toHaveBeenCalledWith({
      articleId: 'article-id',
      title: 'City expands transport',
      articleText: 'The ambitious plan helps commuters.',
      contentVersion: 3,
      sentences: [
        {
          sentenceId: 'sentence-1',
          sentenceText: 'The ambitious plan helps commuters.',
        },
      ],
      allowedCategories: [
        { id: 'category-id', slug: 'society', name: 'Society' },
      ],
      maxTermCount: 5,
    });
    const completion = repository.completeArticleAnalysis.mock.calls[0][0];
    expect(completion.terms).toHaveLength(1);
    expect(completion.terms[0]).toMatchObject({
      sentenceId: 'sentence-1',
      value: 'ambitious',
      normalizedLemma: 'ambitious',
      partOfSpeech: 'adjective',
      selectionReason: 'Useful for describing challenging goals.',
      createdByUserId: 'admin-id',
      updatedByUserId: 'admin-id',
    });
    expect(completion.terms[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(completion).not.toHaveProperty('contentHtml');
    expect(repository.failArticleAnalysis).not.toHaveBeenCalled();
    expect(
      repository.claimArticleAnalysis.mock.invocationCallOrder[0],
    ).toBeLessThan(aiService.analyzeArticle.mock.invocationCallOrder[0]);
    expect(aiService.analyzeArticle.mock.invocationCallOrder[0]).toBeLessThan(
      repository.completeArticleAnalysis.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ['non-DRAFT', snapshot({ status: ArticleStatus.PUBLISHED })],
    [
      'PROCESSING',
      snapshot({ aiAnalysisStatus: AiGenerationStatus.PROCESSING }),
    ],
    ['READY', snapshot({ aiAnalysisStatus: AiGenerationStatus.READY })],
  ])('rejects an article in %s state before claiming', async (_case, state) => {
    repository.findAnalysisSnapshot.mockResolvedValue(state);

    await expect(service.analyze('admin-id', 'article-id')).rejects.toThrow(
      ConflictException,
    );
    expect(repository.claimArticleAnalysis).not.toHaveBeenCalled();
    expect(aiService.analyzeArticle).not.toHaveBeenCalled();
  });

  it('rejects a current version without active parsed sentences', async () => {
    repository.findAnalysisSnapshot.mockResolvedValue({
      ...snapshot(),
      sentences: [],
    });

    await expect(service.analyze('admin-id', 'article-id')).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(repository.claimArticleAnalysis).not.toHaveBeenCalled();
  });

  it('rejects an invalid category and records a bounded provider-neutral failure', async () => {
    aiService.analyzeArticle.mockResolvedValue({
      ...validResult,
      categorySlug: 'unknown',
    });

    await expect(service.analyze('admin-id', 'article-id')).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(repository.failArticleAnalysis).toHaveBeenCalledWith(
      'article-id',
      3,
      'AI analysis output failed validation',
      'admin-id',
    );
    expect(repository.completeArticleAnalysis).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an invalid sentence ID',
      {
        ...validResult,
        terms: [{ ...validResult.terms[0], sentenceId: 'other-sentence' }],
      },
    ],
    [
      'a value absent from its sentence',
      {
        ...validResult,
        terms: [{ ...validResult.terms[0], value: 'missing' }],
      },
    ],
    [
      'a duplicate candidate in one sentence',
      {
        ...validResult,
        terms: [validResult.terms[0], { ...validResult.terms[0] }],
      },
    ],
    [
      'overlapping values in one sentence',
      {
        ...validResult,
        terms: [
          {
            ...validResult.terms[0],
            value: 'ambitious plan',
            wordDisplay: 'ambitious plan',
            lemma: 'ambitious plan',
            normalizedLemma: 'ambitious plan',
            unitType: 'PHRASE' as const,
          },
          {
            ...validResult.terms[0],
            value: 'plan',
            lemma: 'plan',
            normalizedLemma: 'plan',
          },
        ],
      },
    ],
  ])(
    'rejects %s without persisting metadata or terms',
    async (_case, result) => {
      aiService.analyzeArticle.mockResolvedValue(result);

      await expect(service.analyze('admin-id', 'article-id')).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(repository.completeArticleAnalysis).not.toHaveBeenCalled();
      expect(repository.failArticleAnalysis).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects a candidate conflicting with an existing current-version term', async () => {
    const state = snapshot();
    state.sentences[0].terms.push({
      id: 'existing-term',
      sentenceId: 'sentence-1',
      value: 'ambitious plan',
      unitType: 'PHRASE',
      updatedAt: new Date('2026-07-31T00:00:00Z'),
    });
    repository.findAnalysisSnapshot.mockResolvedValue(state);

    await expect(service.analyze('admin-id', 'article-id')).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(repository.completeArticleAnalysis).not.toHaveBeenCalled();
  });

  it('rejects a stale result after AI returns and does not return partial success', async () => {
    repository.completeArticleAnalysis.mockRejectedValue(
      new ArticleAnalysisStateConflictError(),
    );

    await expect(service.analyze('admin-id', 'article-id')).rejects.toThrow(
      ConflictException,
    );
    expect(repository.failArticleAnalysis).toHaveBeenCalledWith(
      'article-id',
      3,
      'Article changed during AI analysis; retry',
      'admin-id',
    );
  });

  it('sets FAILED with a sanitized message when the provider boundary fails', async () => {
    aiService.analyzeArticle.mockRejectedValue(
      new Error('raw provider output and secret key'),
    );

    await expect(service.analyze('admin-id', 'article-id')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(repository.failArticleAnalysis).toHaveBeenCalledWith(
      'article-id',
      3,
      'AI service is temporarily unavailable',
      'admin-id',
    );
    expect(repository.failArticleAnalysis.mock.calls[0][2]).not.toContain(
      'secret',
    );
  });

  it('successfully retries the same endpoint from FAILED', async () => {
    repository.findAnalysisSnapshot.mockResolvedValue(
      snapshot({ aiAnalysisStatus: AiGenerationStatus.FAILED }),
    );

    await expect(
      service.analyze('admin-id', 'article-id'),
    ).resolves.toMatchObject({
      aiAnalysisStatus: AiGenerationStatus.READY,
      candidateCount: 1,
    });
    expect(repository.claimArticleAnalysis).toHaveBeenCalledTimes(1);
    expect(aiService.analyzeArticle).toHaveBeenCalledTimes(1);
  });

  it('rejects a lost atomic claim without calling the provider', async () => {
    repository.claimArticleAnalysis.mockResolvedValue(false);

    await expect(service.analyze('admin-id', 'article-id')).rejects.toThrow(
      ConflictException,
    );
    expect(aiService.analyzeArticle).not.toHaveBeenCalled();
  });
});
