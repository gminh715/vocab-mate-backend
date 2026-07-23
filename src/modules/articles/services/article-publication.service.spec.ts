import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ArticleStatus, CefrLevel } from '../../../../generated/prisma/enums';
import {
  ArticleStatusTransitionConflictError,
  type ArticlePublicationSnapshot,
  ArticlesRepository,
} from '../repositories/articles.repository';
import { ArticlePublicationService } from './article-publication.service';

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
      translationVi: null,
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
  });

  it('publishes a valid draft with one guarded status transition', async () => {
    await expect(service.publish('admin-id', articleId)).resolves.toEqual({
      id: articleId,
      status: ArticleStatus.PUBLISHED,
      publishedAt: now,
    });
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

  it.each([ArticleStatus.PUBLISHED, ArticleStatus.ARCHIVED])(
    'rejects publish from %s',
    async (status) => {
      const snapshot = createSnapshot();
      snapshot.article.status = status;
      repository.findPublicationSnapshot.mockResolvedValue(snapshot);

      await expect(service.publish('admin-id', articleId)).rejects.toThrow(
        ConflictException,
      );
      expect(repository.transitionArticleStatus).not.toHaveBeenCalled();
    },
  );

  it('returns structured checklist issues for an unparsed draft', async () => {
    const snapshot = createSnapshot();
    snapshot.sentences = [];
    snapshot.article.contentHtml = '<p>Unparsed draft.</p>';
    repository.findPublicationSnapshot.mockResolvedValue(snapshot);

    const result = service.publish('admin-id', articleId);
    await expect(result).rejects.toBeInstanceOf(UnprocessableEntityException);
    try {
      await result;
    } catch (error: unknown) {
      const response = (
        error as UnprocessableEntityException
      ).getResponse() as {
        message: string;
        issues: Array<{ code: string }>;
      };
      expect(response.message).toBe('Article failed publication validation');
      expect(response.issues.map(({ code }) => code)).toEqual(
        expect.arrayContaining(['MISSING_PARSE', 'MINIMUM_TERMS_NOT_MET']),
      );
    }
  });

  it.each([
    {
      name: 'inactive category',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.article.category.isActive = false;
      },
      code: 'INACTIVE_CATEGORY',
    },
    {
      name: 'orphan sentence marker',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.article.contentHtml = snapshot.article.contentHtml.replace(
          sentenceId,
          '55555555-5555-4555-8555-555555555555',
        );
      },
      code: 'ORPHAN_SENTENCE_MARKER',
    },
    {
      name: 'orphan term marker',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.article.contentHtml = snapshot.article.contentHtml.replace(
          termId,
          '66666666-6666-4666-8666-666666666666',
        );
      },
      code: 'ORPHAN_TERM_MARKER',
    },
    {
      name: 'inactive sentence',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.sentences[0].isActive = false;
      },
      code: 'INACTIVE_SENTENCE_MARKER',
    },
    {
      name: 'incomplete term metadata',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.sentences[0].terms[0].contextualMeaningVi = ' ';
      },
      code: 'TERM_METADATA_INCOMPLETE',
    },
  ])('reports $name through the shared checklist', ({ mutate, code }) => {
    const snapshot = createSnapshot();
    mutate(snapshot);
    expect(service.validateForPublication(snapshot)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

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
      snapshot.sentences[0].terms[0].cefrLevel = term;
      repository.findPublicationSnapshot.mockResolvedValue(snapshot);

      const preview = await service.preview(articleId, selected);
      expect(preview.terms).toEqual([
        expect.objectContaining({ id: termId, isHighlighted: highlighted }),
      ]);
      expect(preview.validationWarnings).toEqual(
        service.validateForPublication(snapshot),
      );
      expect(preview.article).not.toHaveProperty('contentHtml');
    },
  );

  it('returns only active current lookup terms and rejects archived preview', async () => {
    const snapshot = createSnapshot();
    snapshot.sentences[0].terms.push({
      ...snapshot.sentences[0].terms[0],
      id: '77777777-7777-4777-8777-777777777777',
      isLookupEnabled: false,
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
