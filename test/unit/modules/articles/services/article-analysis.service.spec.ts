import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AiGenerationStatus,
  ArticleStatus,
} from '../../../../../generated/prisma/enums';
import {
  ArticleAnalysisStateConflictError,
  type ArticleAnalysisCompletionRecord,
  type ArticleAnalysisSnapshot,
  type CompleteArticleAnalysisInput,
  ArticleAnalysisRepository,
} from '../../../../../src/modules/articles/repositories/article-analysis.repository';
import { ArticleAnalysisService } from '../../../../../src/modules/articles/services/article-analysis.service';

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

describe('ArticleAnalysisService', () => {
  const repository = {
    findAnalysisSnapshot: jest.fn<
      Promise<ArticleAnalysisSnapshot | null>,
      [string]
    >(),
    claimArticleAnalysis: jest.fn<Promise<boolean>, [string, number]>(),
    failArticleAnalysis: jest.fn<Promise<boolean>, [string, number, string]>(),
    completeArticleAnalysis: jest.fn<
      Promise<ArticleAnalysisCompletionRecord>,
      [CompleteArticleAnalysisInput]
    >(),
  };
  const service = new ArticleAnalysisService(
    repository as unknown as ArticleAnalysisRepository,
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
            id: 'category-id',
            slug: 'society',
            name: 'Society',
          },
          cefrLevel: input.articleCefrLevel,
          candidateCount: input.terms.length,
        }),
    );
  });

  it('tokenizes locally, assigns CEFR where known, and prepares one marker per term', async () => {
    await expect(service.analyze('admin-id', 'article-id')).resolves.toEqual({
      articleId: 'article-id',
      contentVersion: 3,
      aiAnalysisStatus: AiGenerationStatus.READY,
      category: {
        id: 'category-id',
        slug: 'society',
        name: 'Society',
      },
      cefrLevel: 'A2',
      candidateCount: 5,
    });

    expect(repository.claimArticleAnalysis).toHaveBeenCalledWith(
      'article-id',
      3,
    );
    const completion = repository.completeArticleAnalysis.mock.calls[0][0];
    expect(
      completion.terms.map(({ value, lemma, cefrLevel }) => ({
        value,
        lemma,
        cefrLevel,
      })),
    ).toEqual([
      { value: 'The', lemma: 'the', cefrLevel: 'A1' },
      { value: 'ambitious', lemma: 'ambitious', cefrLevel: 'B1' },
      { value: 'plan', lemma: 'plan', cefrLevel: 'A1' },
      { value: 'helps', lemma: 'help', cefrLevel: 'A1' },
      { value: 'commuters', lemma: 'commuter', cefrLevel: null },
    ]);
    expect(completion.articleCefrLevel).toBe('A2');
    expect(completion.terms[0]).toMatchObject({
      sentenceId: 'sentence-1',
      value: 'The',
      lemma: 'the',
    });
    expect(completion.terms[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(
      completion.annotatedContentHtml.match(/data-term-id=/gu),
    ).toHaveLength(5);
    expect(completion.sourceContentHtml).not.toContain('data-term-id');
    expect(repository.failArticleAnalysis).not.toHaveBeenCalled();
  });

  it('filters non-English token types, contraction fragments, and duplicate sentence surfaces', async () => {
    const state = snapshot();
    state.article.contentHtml =
      '<p><span data-sentence-id="sentence-1">Plan plan PLAN costs $20 at test@example.com and can\'t wait.</span></p>';
    state.sentences[0].sentenceText =
      "Plan plan PLAN costs $20 at test@example.com and can't wait.";
    repository.findAnalysisSnapshot.mockResolvedValue(state);

    await service.analyze('admin-id', 'article-id');

    const values =
      repository.completeArticleAnalysis.mock.calls[0][0].terms.map(
        ({ value }) => value,
      );
    expect(values).toEqual(['Plan', 'costs', 'at', 'and', 'wait']);
  });

  it('keeps contextual duplicates across sentences but skips words covered by an existing sentence term', async () => {
    const state = snapshot();
    state.article.contentHtml = [
      '<p><span data-sentence-id="sentence-1"><span data-term-id="existing">Digital tools</span> improve access.</span></p>',
      '<p><span data-sentence-id="sentence-2">Digital tools help.</span></p>',
    ].join('');
    state.sentences = [
      {
        id: 'sentence-1',
        sentenceOrder: 1,
        sentenceText: 'Digital tools improve access.',
        terms: [
          {
            id: 'existing',
            sentenceId: 'sentence-1',
            value: 'Digital tools',
            unitType: 'PHRASE',
            updatedAt: new Date('2026-08-03T00:00:00.000Z'),
          },
        ],
      },
      {
        id: 'sentence-2',
        sentenceOrder: 2,
        sentenceText: 'Digital tools help.',
        terms: [],
      },
    ];
    repository.findAnalysisSnapshot.mockResolvedValue(state);

    await service.analyze('admin-id', 'article-id');

    expect(
      repository.completeArticleAnalysis.mock.calls[0][0].terms.map(
        ({ sentenceId, value }) => ({ sentenceId, value }),
      ),
    ).toEqual([
      { sentenceId: 'sentence-1', value: 'improve' },
      { sentenceId: 'sentence-1', value: 'access' },
      { sentenceId: 'sentence-2', value: 'Digital' },
      { sentenceId: 'sentence-2', value: 'tools' },
      { sentenceId: 'sentence-2', value: 'help' },
    ]);
  });

  it('returns not found before claiming an absent article', async () => {
    repository.findAnalysisSnapshot.mockResolvedValue(null);
    await expect(service.analyze('admin-id', 'missing')).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.claimArticleAnalysis).not.toHaveBeenCalled();
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
  });

  it('rejects a parsed draft with no active sentences', async () => {
    const state = snapshot();
    state.sentences = [];
    repository.findAnalysisSnapshot.mockResolvedValue(state);
    await expect(service.analyze('admin-id', 'article-id')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('fails the claimed analysis when CEFR cannot classify any vocabulary', async () => {
    const state = snapshot();
    state.article.contentHtml =
      '<p><span data-sentence-id="sentence-1">Qzxvplm trwknd.</span></p>';
    state.sentences[0].sentenceText = 'Qzxvplm trwknd.';
    repository.findAnalysisSnapshot.mockResolvedValue(state);

    await expect(service.analyze('admin-id', 'article-id')).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(repository.failArticleAnalysis).toHaveBeenCalledWith(
      'article-id',
      3,
      'Vocabulary analysis could not be completed',
    );
    expect(repository.completeArticleAnalysis).not.toHaveBeenCalled();
  });

  it('rejects a lost analysis claim', async () => {
    repository.claimArticleAnalysis.mockResolvedValue(false);
    await expect(service.analyze('admin-id', 'article-id')).rejects.toThrow(
      ConflictException,
    );
    expect(repository.completeArticleAnalysis).not.toHaveBeenCalled();
  });

  it('marks analysis failed when sentence markers do not match the snapshot', async () => {
    const state = snapshot();
    state.article.contentHtml = '<p>The ambitious plan helps commuters.</p>';
    repository.findAnalysisSnapshot.mockResolvedValue(state);

    await expect(service.analyze('admin-id', 'article-id')).rejects.toThrow();
    expect(repository.failArticleAnalysis).toHaveBeenCalledWith(
      'article-id',
      3,
      'Vocabulary analysis could not be completed',
    );
    expect(repository.completeArticleAnalysis).not.toHaveBeenCalled();
  });

  it('rejects stale persistence and records a bounded local-analysis failure', async () => {
    repository.completeArticleAnalysis.mockRejectedValue(
      new ArticleAnalysisStateConflictError(),
    );

    await expect(service.analyze('admin-id', 'article-id')).rejects.toThrow(
      ConflictException,
    );
    expect(repository.failArticleAnalysis).toHaveBeenCalledWith(
      'article-id',
      3,
      'Article changed during vocabulary analysis; retry',
    );
  });

  it('allows retry from FAILED without calling an external provider', async () => {
    repository.findAnalysisSnapshot.mockResolvedValue(
      snapshot({ aiAnalysisStatus: AiGenerationStatus.FAILED }),
    );
    await expect(
      service.analyze('admin-id', 'article-id'),
    ).resolves.toMatchObject({
      aiAnalysisStatus: AiGenerationStatus.READY,
      candidateCount: 5,
    });
  });
});
