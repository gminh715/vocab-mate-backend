import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AiGenerationStatus,
  ArticleStatus,
  CefrLevel,
  TermOrigin,
  TermReviewStatus,
} from '../../../../../generated/prisma/enums';
import {
  ArticleStatusTransitionConflictError,
  type ArticlePublicationSnapshot,
  ArticlesRepository,
} from '../../../../../src/modules/articles/repositories/articles.repository';
import { ArticlePublicationService } from '../../../../../src/modules/articles/services/article-publication.service';
import { ArticlePublicationValidator } from '../../../../../src/modules/articles/validators/article-publication.validator';

const articleId = '11111111-1111-4111-8111-111111111111';
const sentenceId = '22222222-2222-4222-8222-222222222222';
const termId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-07-23T00:00:00Z');

const createSnapshot = (): ArticlePublicationSnapshot => ({
  article: {
    id: articleId,
    categoryId: '44444444-4444-4444-8444-444444444444',
    title: 'Digital learning',
    slug: 'digital-learning',
    summary: 'A summary.',
    contentHtml: `<p><span data-sentence-id="${sentenceId}">Digital <span data-term-id="${termId}">tools</span> improve learning.</span></p>`,
    contentVersion: 3,
    sourceName: null,
    sourceUrl: null,
    authorName: null,
    thumbnailUrl: null,
    cefrLevel: CefrLevel.B1,
    status: ArticleStatus.DRAFT,
    publishedAt: null,
    archivedAt: null,
    category: {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Technology',
      slug: 'technology',
      isActive: true,
    },
  },
  sentences: [
    {
      id: sentenceId,
      articleId,
      contentVersion: 3,
      sentenceOrder: 1,
      sentenceText: 'Digital tools improve learning.',
      translationVi: 'Công cụ số cải thiện việc học.',
      explanationVi: null,
      referenceExplanation: null,
      skill: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      terms: [
        {
          id: termId,
          sentenceId,
          value: 'tools',
          wordDisplay: 'tools',
          lemma: 'tool',
          normalizedLemma: 'tool',
          unitType: 'WORD',
          partOfSpeech: 'noun',
          ipa: null,
          cefrLevel: CefrLevel.B1,
          contextualMeaningVi: 'công cụ',
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
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
  ],
});

describe('ArticlePublicationService', () => {
  const repository = {
    findPublicationSnapshot: jest.fn(),
    transitionArticleStatus: jest.fn(),
  };
  const validator = { validate: jest.fn() };
  let service: ArticlePublicationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlePublicationService,
        {
          provide: ArticlesRepository,
          useValue: repository,
        },
        {
          provide: ArticlePublicationValidator,
          useValue: validator,
        },
      ],
    }).compile();
    service = module.get(ArticlePublicationService);
    repository.findPublicationSnapshot.mockResolvedValue(createSnapshot());
    repository.transitionArticleStatus.mockResolvedValue({
      id: articleId,
      status: ArticleStatus.PUBLISHED,
      publishedAt: now,
      archivedAt: null,
    });
    validator.validate.mockReturnValue([]);
  });

  it('publishes a valid draft with one guarded status transition', async () => {
    const snapshot = createSnapshot();
    repository.findPublicationSnapshot.mockResolvedValue(snapshot);

    await expect(service.publish('admin-id', articleId)).resolves.toEqual({
      id: articleId,
      status: ArticleStatus.PUBLISHED,
      publishedAt: now,
    });
    expect(validator.validate).toHaveBeenCalledWith(snapshot);
    expect(repository.transitionArticleStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId,
        expectedStatus: ArticleStatus.DRAFT,
        expectedContentVersion: 3,
        requireActiveCategory: true,
        status: ArticleStatus.PUBLISHED,
        archivedAt: null,
        updatedByUserId: 'admin-id',
      }),
    );
  });

  it('maps validator issues to the publication application error without transitioning', async () => {
    validator.validate.mockReturnValue([
      {
        code: 'MISSING_PARSE',
        message: 'The current content version has not been parsed.',
        entityId: articleId,
      },
    ]);

    const result = service.publish('admin-id', articleId);
    await expect(result).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repository.transitionArticleStatus).not.toHaveBeenCalled();
  });

  it.each([ArticleStatus.PUBLISHED, ArticleStatus.ARCHIVED])(
    'rejects publish from %s',
    async (status) => {
      const snapshot = createSnapshot();
      snapshot.article.status = status;
      repository.findPublicationSnapshot.mockResolvedValue(snapshot);

      await expect(service.publish('admin-id', articleId)).rejects.toThrow(
        ConflictException,
      );
      expect(validator.validate).not.toHaveBeenCalled();
      expect(repository.transitionArticleStatus).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      source: ArticleStatus.DRAFT,
      target: ArticleStatus.ARCHIVED,
      operation: 'archive' as const,
    },
    {
      source: ArticleStatus.PUBLISHED,
      target: ArticleStatus.ARCHIVED,
      operation: 'archive' as const,
    },
    {
      source: ArticleStatus.ARCHIVED,
      target: ArticleStatus.DRAFT,
      operation: 'restoreDraft' as const,
    },
  ])(
    'allows $source -> $target through $operation',
    async ({ source, target, operation }) => {
      const snapshot = createSnapshot();
      snapshot.article.status = source;
      snapshot.article.publishedAt =
        source === ArticleStatus.DRAFT ? null : now;
      snapshot.article.archivedAt =
        source === ArticleStatus.ARCHIVED ? now : null;
      repository.findPublicationSnapshot.mockResolvedValue(snapshot);
      repository.transitionArticleStatus.mockResolvedValue({
        id: articleId,
        status: target,
        publishedAt:
          target === ArticleStatus.DRAFT ? null : snapshot.article.publishedAt,
        archivedAt: target === ArticleStatus.ARCHIVED ? now : null,
      });

      await expect(service[operation]('admin-id', articleId)).resolves.toEqual(
        expect.objectContaining({ id: articleId, status: target }),
      );
      expect(validator.validate).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid archive and restore transitions', async () => {
    const archived = createSnapshot();
    archived.article.status = ArticleStatus.ARCHIVED;
    repository.findPublicationSnapshot.mockResolvedValueOnce(archived);
    await expect(service.archive('admin-id', articleId)).rejects.toThrow(
      ConflictException,
    );

    repository.findPublicationSnapshot.mockResolvedValueOnce(createSnapshot());
    await expect(service.restoreDraft('admin-id', articleId)).rejects.toThrow(
      ConflictException,
    );
  });

  it('maps a concurrent conditional-update miss to conflict', async () => {
    repository.transitionArticleStatus.mockRejectedValue(
      new ArticleStatusTransitionConflictError(),
    );
    await expect(service.publish('admin-id', articleId)).rejects.toThrow(
      new ConflictException(
        'Article state or content changed; retry the request',
      ),
    );
  });

  it.each([
    { selected: CefrLevel.A2, term: CefrLevel.A1, highlighted: false },
    { selected: CefrLevel.B1, term: CefrLevel.B1, highlighted: true },
    { selected: CefrLevel.B2, term: CefrLevel.C1, highlighted: true },
  ])(
    'applies CEFR preview rank $term >= $selected as $highlighted',
    async ({ selected, term, highlighted }) => {
      const snapshot = createSnapshot();
      const warnings = [
        {
          code: 'TERM_SNAPSHOT_INCOMPLETE',
          message: 'Example warning.',
          entityId: termId,
        },
      ];
      snapshot.sentences[0].terms[0].cefrLevel = term;
      repository.findPublicationSnapshot.mockResolvedValue(snapshot);
      validator.validate.mockReturnValue(warnings);

      const preview = await service.preview(articleId, selected);
      expect(preview.terms).toEqual([
        expect.objectContaining({ id: termId, isHighlighted: highlighted }),
      ]);
      expect(preview.validationWarnings).toBe(warnings);
      expect(validator.validate).toHaveBeenCalledWith(snapshot);
      expect(preview.article).not.toHaveProperty('contentHtml');
    },
  );

  it('returns only approved active current lookup terms and rejects archived preview', async () => {
    const snapshot = createSnapshot();
    snapshot.sentences[0].terms.push({
      ...snapshot.sentences[0].terms[0],
      id: '77777777-7777-4777-8777-777777777777',
      isLookupEnabled: false,
    });
    snapshot.sentences[0].terms.push({
      ...snapshot.sentences[0].terms[0],
      id: '88888888-8888-4888-8888-888888888888',
      reviewStatus: TermReviewStatus.PENDING,
    });
    repository.findPublicationSnapshot.mockResolvedValueOnce(snapshot);
    await expect(service.preview(articleId)).resolves.toMatchObject({
      terms: [expect.objectContaining({ id: termId })],
    });

    snapshot.article.status = ArticleStatus.ARCHIVED;
    repository.findPublicationSnapshot.mockResolvedValueOnce(snapshot);
    await expect(service.preview(articleId)).rejects.toThrow(ConflictException);
  });
});
