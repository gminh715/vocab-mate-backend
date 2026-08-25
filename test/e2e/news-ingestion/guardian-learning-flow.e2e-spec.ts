import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  AiGenerationStatus,
  ArticleStatus,
  CefrLevel,
  LearningStatus,
  LexicalUnitType,
  TermOrigin,
  TermReviewStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import { configureApp } from '../../../src/app.setup';
import { AuthenticatedUserThrottlerGuard } from '../../../src/common/guards/authenticated-user-throttler.guard';
import type { NewsConfig } from '../../../src/config/news.config';
import { ArticleContentService } from '../../../src/modules/articles/services/article-content.service';
import { AdminArticleTermsController } from '../../../src/modules/articles/controllers/admin-article-terms.controller';
import { AdminArticlesController } from '../../../src/modules/articles/controllers/admin-articles.controller';
import { TermMarkerHelper } from '../../../src/modules/articles/helpers/term-marker.helper';
import { ArticleAnalysisService } from '../../../src/modules/articles/services/article-analysis.service';
import { ArticlePublicationService } from '../../../src/modules/articles/services/article-publication.service';
import { ArticleSentencesService } from '../../../src/modules/articles/services/article-sentences.service';
import { ArticleTermsService } from '../../../src/modules/articles/services/article-terms.service';
import { ArticlesService } from '../../../src/modules/articles/services/articles.service';
import { JwtAuthGuard } from '../../../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../src/modules/auth/guards/roles.guard';
import { CategoriesService } from '../../../src/modules/categories/services/categories.service';
import { AdminNewsController } from '../../../src/modules/news-ingestion/controllers/admin-news.controller';
import { GuardianClient } from '../../../src/modules/news-ingestion/guardian.client';
import { NewsContentService } from '../../../src/modules/news-ingestion/services/news-content.service';
import type { NewsFetch } from '../../../src/modules/news-ingestion/news-http.tokens';
import { NewsIngestionService } from '../../../src/modules/news-ingestion/services/news-ingestion.service';
import { ReadingController } from '../../../src/modules/reading/controllers/reading.controller';
import { ContextualTermsService } from '../../../src/modules/reading/services/contextual-terms.service';
import { ReadingService } from '../../../src/modules/reading/services/reading.service';
import { VocabulariesController } from '../../../src/modules/vocabularies/controllers/vocabularies.controller';
import { VocabulariesService } from '../../../src/modules/vocabularies/services/vocabularies.service';

const articleId = '11111111-1111-4111-8111-111111111111';
const sentenceId = '22222222-2222-4222-8222-222222222222';
const approvedTermId = '33333333-3333-4333-8333-333333333333';
const rejectedTermId = '44444444-4444-4444-8444-444444444444';
const categoryId = '55555555-5555-4555-8555-555555555555';
const collectionId = '66666666-6666-4666-8666-666666666666';
const vocabularyId = '77777777-7777-4777-8777-777777777777';
const sourceUrl =
  'https://www.theguardian.com/environment/2026/jul/30/community-plan';
const sentenceText =
  'Communities adopted an ambitious plan, but harmful waste remained a concern.';

interface RequestWithTestUser {
  headers: { authorization?: string };
  user?: { id: string; role: UserRole };
}

@Injectable()
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const target = context.switchToHttp().getRequest<RequestWithTestUser>();
    const authorization = target.headers.authorization;
    if (!authorization) throw new UnauthorizedException('Unauthorized');
    target.user = {
      id: authorization.endsWith('admin') ? 'admin-id' : 'user-id',
      role: authorization.endsWith('admin') ? UserRole.ADMIN : UserRole.USER,
    };
    return true;
  }
}

interface FlowArticle {
  id: string;
  title: string;
  slug: string;
  summary: string;
  contentHtml: string;
  contentVersion: number;
  status: ArticleStatus;
  importSource: string;
  externalId: string;
  canonicalUrl: string;
  sourcePublishedAt: Date;
  publishedAt: Date | null;
}

interface FlowTerm {
  id: string;
  value: string;
  wordDisplay: string;
  lemma: string;
  unitType: LexicalUnitType;
  partOfSpeech: string;
  ipa: string | null;
  cefrLevel: CefrLevel;
  contextualMeaningVi: string | null;
  definitionEn: string | null;
  contextualExplanation: string | null;
  explanationStatus: AiGenerationStatus;
  explanationGeneratedAt: Date | null;
  origin: TermOrigin;
  reviewStatus: TermReviewStatus;
  isActive: boolean;
  isLookupEnabled: boolean;
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  relatedTerms: string[];
  vocabularyTopic: string | null;
  examples: Array<{ sentence: string; translationVi: string }>;
  skill: string | null;
}

interface ImportedDraftInput {
  title: string;
  slug: string;
  summary: string;
  contentHtml: string;
  importSource: string;
  externalId: string;
  canonicalUrl: string;
  sourcePublishedAt: Date;
}

interface EnrichmentInput {
  articleId: string;
  articleTitle: string;
  term: { id: string; lemma: string; value: string };
  parentSentence: { id: string; sentenceText: string };
  neighboringSentences: Array<{ id: string; sentenceText: string }>;
}

interface EnrichmentResult {
  contextualMeaningVi: string;
  definitionEn: string;
  contextualExplanation: string;
  ipa: string;
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  relatedTerms: string[];
  vocabularyTopic: string;
  examples: Array<{ sentence: string; translationVi: string }>;
  sentenceTranslationVi: string;
}

const responseBody = <T>(response: { text: string }): T =>
  JSON.parse(response.text) as T;

describe('Guardian to vocabulary learning flow (e2e)', () => {
  let app: INestApplication<App>;
  let article: FlowArticle | null;
  let sentenceTranslationVi: string | null;
  let terms: Map<string, FlowTerm>;
  let savedVocabulary: Record<string, unknown> | null;
  let enrichmentResult: EnrichmentResult;

  const guardianRequestUrls: string[] = [];
  const analyzeArticle =
    jest.fn<
      (input: Record<string, unknown>) => Promise<Record<string, unknown>>
    >();
  const enrichContextualTerm = jest.fn(
    (input: EnrichmentInput): Promise<EnrichmentResult> => {
      void input;
      return Promise.resolve(enrichmentResult);
    },
  );

  const guardianBody = `<article>
    <p>${sentenceText} Residents, researchers, and local organizations documented the proposal carefully so that every implementation step could be reviewed by the public. The detailed report described environmental safeguards, measurable targets, transparent oversight, and long-term community participation. It also explained how schools, businesses, and public agencies would reduce waste, restore habitats, and publish progress data. Independent experts would inspect the results, while residents could submit evidence and request corrective action. The article provided enough verified context for a safe draft import and classroom reading exercise.</p>
    <script>window.secret = "must-not-survive";</script>
  </article>`;

  const guardianFetch = jest.fn((input: URL | RequestInfo) => {
    const url = new URL(
      input instanceof URL
        ? input.toString()
        : typeof input === 'string'
          ? input
          : input.url,
    );
    guardianRequestUrls.push(url.toString());
    const fields = url.searchParams.get('show-fields') ?? '';
    const includeBody = fields.split(',').includes('body');
    return Promise.resolve(
      new Response(
        JSON.stringify({
          response: {
            status: 'ok',
            userTier: 'developer',
            total: 1,
            startIndex: 1,
            pageSize: 1,
            currentPage: 1,
            pages: 1,
            orderBy: 'newest',
            results: [
              {
                id: 'environment/2026/jul/30/community-plan',
                type: 'article',
                sectionId: 'environment',
                sectionName: 'Environment',
                webPublicationDate: '2026-07-30T08:30:00Z',
                webTitle: 'Communities adopt an ambitious environmental plan',
                webUrl: sourceUrl,
                fields: {
                  headline: 'Communities adopt an ambitious environmental plan',
                  trailText: 'A carefully documented local environmental plan.',
                  byline: 'Guardian Reporter',
                  ...(includeBody ? { body: guardianBody } : {}),
                },
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
  }) as jest.MockedFunction<NewsFetch>;

  beforeAll(async () => {
    const newsConfig: NewsConfig = {
      guardianApiKey: 'e2e-placeholder-key',
      guardianBaseUrl: 'https://content.guardianapis.com',
      requestTimeoutMs: 1_000,
      maxResponseBytes: 100_000,
      minArticleCharacters: 100,
      minRequestIntervalMs: 0,
      defaultPageSize: 1,
      maxPageSize: 10,
    };
    const articleContentService = new ArticleContentService();
    const guardianClient = new GuardianClient(newsConfig, guardianFetch);
    const newsContentService = new NewsContentService(
      newsConfig,
      articleContentService,
    );

    const articlesService = {
      findImportedDuplicate: jest.fn(
        (identity: {
          importSource?: string;
          externalId?: string;
          canonicalUrl?: string;
          contentHash?: string;
        }) =>
          Promise.resolve(
            Boolean(
              article &&
              ((identity.importSource === article.importSource &&
                identity.externalId === article.externalId) ||
                identity.canonicalUrl === article.canonicalUrl),
            ),
          ),
      ),
      createImportedDraft: jest.fn(
        (_adminId: string, input: ImportedDraftInput) => {
          article = {
            id: articleId,
            title: input.title,
            slug: input.slug,
            summary: input.summary,
            contentHtml: input.contentHtml,
            contentVersion: 1,
            status: ArticleStatus.DRAFT,
            importSource: input.importSource,
            externalId: input.externalId,
            canonicalUrl: input.canonicalUrl,
            sourcePublishedAt: input.sourcePublishedAt,
            publishedAt: null,
          };
          return Promise.resolve({ article: { id: articleId } });
        },
      ),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const categoriesService = {
      requireActiveCategory: jest.fn().mockResolvedValue(undefined),
      resolveOrCreateImportCategory: jest.fn().mockResolvedValue(categoryId),
    };

    const articleSentencesService = {
      parseContent: jest.fn().mockImplementation(() => {
        const current = requireArticle();
        current.contentHtml = `<p><span data-sentence-id="${sentenceId}">${sentenceText}</span></p>`;
        return Promise.resolve({
          articleId,
          contentVersion: current.contentVersion,
          sentenceCount: 1,
        });
      }),
    };

    const analysisService = {
      analyze: jest.fn().mockImplementation(async () => {
        const current = requireDraft();
        await analyzeArticle({
          articleId: current.id,
          title: current.title,
          sentences: [{ id: sentenceId, sentenceText }],
        });
        terms = new Map([
          [approvedTermId, pendingTerm(approvedTermId, 'ambitious')],
          [rejectedTermId, pendingTerm(rejectedTermId, 'harmful')],
        ]);
        return {
          articleId,
          contentVersion: current.contentVersion,
          aiAnalysisStatus: AiGenerationStatus.READY,
          category: {
            id: categoryId,
            slug: 'environment',
            name: 'Environment',
          },
          cefrLevel: CefrLevel.B1,
          candidateCount: 2,
        };
      }),
    };

    const termsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      approveAiCandidate: jest.fn().mockImplementation(() => {
        const current = requireDraft();
        const term = requireTerm(approvedTermId);
        term.reviewStatus = TermReviewStatus.APPROVED;
        term.isActive = true;
        term.isLookupEnabled = true;
        current.contentHtml = TermMarkerHelper.insertFirst(
          current.contentHtml,
          sentenceId,
          term.id,
          term.value,
          term.unitType,
        );
        return Promise.resolve({ term, contentHtmlChanged: true });
      }),
      rejectAiCandidate: jest.fn().mockImplementation(() => {
        requireDraft();
        const term = requireTerm(rejectedTermId);
        term.reviewStatus = TermReviewStatus.REJECTED;
        term.isActive = false;
        term.isLookupEnabled = false;
        return Promise.resolve({ term, contentHtmlChanged: false });
      }),
    };

    const publicationService = {
      publish: jest.fn().mockImplementation(() => {
        const current = requireDraft();
        current.status = ArticleStatus.PUBLISHED;
        current.publishedAt = new Date('2026-07-31T00:00:00Z');
        return Promise.resolve({
          article: current,
          validation: { isValid: true, errors: [], warnings: [] },
        });
      }),
    };

    const readingService = {
      getReaderArticle: jest.fn().mockImplementation(() => {
        const current = requirePublished();
        return Promise.resolve({
          article: {
            id: current.id,
            title: current.title,
            slug: current.slug,
            summary: current.summary,
            thumbnailUrl: null,
            cefrLevel: CefrLevel.B1,
            status: current.status,
            publishedAt: current.publishedAt,
            sourceName: 'The Guardian',
            sourceUrl,
            category: {
              id: categoryId,
              slug: 'environment',
              name: 'Environment',
            },
          },
          contentHtml: current.contentHtml,
          highlightedTermIds: [approvedTermId],
          progress: {
            articleId,
            status: 'READING',
            progressPercent: 0,
            lastBlockKey: null,
            completedAt: null,
          },
        });
      }),
      getContextualTerm: jest
        .fn()
        .mockImplementation(
          async (
            _userId: string,
            requestedArticleId: string,
            termId: string,
          ) => {
            requirePublished();
            if (requestedArticleId !== articleId) throw new NotFoundException();
            const term = requireTerm(termId);
            if (
              term.reviewStatus !== TermReviewStatus.APPROVED ||
              !term.isActive ||
              !term.isLookupEnabled
            ) {
              throw new NotFoundException('Contextual term not found');
            }
            if (term.explanationStatus !== AiGenerationStatus.READY) {
              term.explanationStatus = AiGenerationStatus.PROCESSING;
              const generated = await enrichContextualTerm({
                articleId,
                articleTitle: requireArticle().title,
                term: { id: term.id, lemma: term.lemma, value: term.value },
                parentSentence: { id: sentenceId, sentenceText },
                neighboringSentences: [],
              });
              term.contextualMeaningVi = generated.contextualMeaningVi;
              term.definitionEn = generated.definitionEn;
              term.contextualExplanation = generated.contextualExplanation;
              term.ipa = generated.ipa;
              term.synonyms = [...generated.synonyms];
              term.antonyms = [...generated.antonyms];
              term.collocations = [...generated.collocations];
              term.relatedTerms = [...generated.relatedTerms];
              term.vocabularyTopic = generated.vocabularyTopic;
              term.examples = generated.examples.map(
                (example: { sentence: string; translationVi: string }) => ({
                  ...example,
                }),
              );
              sentenceTranslationVi = generated.sentenceTranslationVi;
              term.explanationStatus = AiGenerationStatus.READY;
              term.explanationGeneratedAt = new Date('2026-07-31T00:01:00Z');
            }
            return {
              term,
              parentSentence: {
                id: sentenceId,
                sentenceOrder: 1,
                sentenceText,
                translationVi: sentenceTranslationVi,
                explanationVi: null,
                referenceExplanation: null,
                skill: null,
              },
              saveState: {
                isSaved: Boolean(savedVocabulary),
                userVocabularyId: savedVocabulary ? vocabularyId : null,
                learningStatus: savedVocabulary ? LearningStatus.NEW : null,
              },
            };
          },
        ),
    };

    const vocabulariesService = {
      save: jest.fn().mockImplementation(
        (
          _userId: string,
          dto: {
            articleSentenceTermId: string;
            personalNote?: string;
            collectionIds: string[];
          },
        ) => {
          const term = requireTerm(dto.articleSentenceTermId);
          if (
            term.explanationStatus !== AiGenerationStatus.READY ||
            !term.contextualMeaningVi ||
            !sentenceTranslationVi
          ) {
            throw new NotFoundException('Contextual term is not ready');
          }
          savedVocabulary = {
            id: vocabularyId,
            articleSentenceTermId: term.id,
            learningStatus: LearningStatus.NEW,
            personalNote: dto.personalNote ?? null,
            savedWordDisplay: term.wordDisplay,
            savedLemma: term.lemma,
            savedPartOfSpeech: term.partOfSpeech,
            savedIpa: term.ipa,
            savedCefrLevel: term.cefrLevel,
            savedMeaningVi: term.contextualMeaningVi,
            savedContextSentence: sentenceText,
            savedContextTranslationVi: sentenceTranslationVi,
            savedExplanation: term.contextualExplanation,
            savedExamples: term.examples.map((example) => ({ ...example })),
            savedAt: new Date('2026-07-31T00:02:00Z'),
            nextReviewAt: null,
            lastReviewedAt: null,
            reviewIntervalDays: null,
          };
          return Promise.resolve({
            vocabulary: savedVocabulary,
            collections: [
              {
                id: collectionId,
                name: 'Guardian learning',
                description: null,
                addedAt: new Date('2026-07-31T00:02:00Z'),
              },
            ],
          });
        },
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        AdminNewsController,
        AdminArticlesController,
        AdminArticleTermsController,
        ReadingController,
        VocabulariesController,
      ],
      providers: [
        { provide: GuardianClient, useValue: guardianClient },
        { provide: NewsContentService, useValue: newsContentService },
        { provide: ArticlesService, useValue: articlesService },
        { provide: ArticleSentencesService, useValue: articleSentencesService },
        { provide: CategoriesService, useValue: categoriesService },
        NewsIngestionService,
        { provide: ArticleAnalysisService, useValue: analysisService },
        { provide: ArticleTermsService, useValue: termsService },
        { provide: ArticlePublicationService, useValue: publicationService },
        { provide: ReadingService, useValue: readingService },
        { provide: ContextualTermsService, useValue: readingService },
        { provide: VocabulariesService, useValue: vocabulariesService },
        JwtAuthGuard,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderAuthGuard)
      .overrideGuard(AuthenticatedUserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(() => {
    article = null;
    sentenceTranslationVi = null;
    terms = new Map();
    savedVocabulary = null;
    guardianRequestUrls.length = 0;
    jest.clearAllMocks();
    analyzeArticle.mockResolvedValue({
      cefrLevel: CefrLevel.B1,
      candidates: [
        { sentenceId, value: 'ambitious' },
        { sentenceId, value: 'harmful' },
      ],
    });
    enrichmentResult = {
      contextualMeaningVi: 'đầy tham vọng',
      definitionEn: 'Requiring determination and substantial effort.',
      contextualExplanation:
        'The word describes the broad scope of the community plan.',
      ipa: '/æmˈbɪʃ.əs/',
      synonyms: ['aspiring'],
      antonyms: ['unambitious'],
      collocations: ['ambitious plan'],
      relatedTerms: ['ambition'],
      vocabularyTopic: 'Community',
      examples: [
        {
          sentence: 'The town approved an ambitious recovery plan.',
          translationVi:
            'Thị trấn đã thông qua một kế hoạch phục hồi đầy tham vọng.',
        },
      ],
      sentenceTranslationVi:
        'Các cộng đồng đã thông qua một kế hoạch đầy tham vọng, nhưng chất thải có hại vẫn là mối lo ngại.',
    };
  });

  afterAll(async () => app.close());

  function requireArticle(): FlowArticle {
    if (!article) throw new Error('Expected an imported article');
    return article;
  }

  function requireDraft(): FlowArticle {
    const current = requireArticle();
    if (current.status !== ArticleStatus.DRAFT) {
      throw new Error('Expected a draft article');
    }
    return current;
  }

  function requirePublished(): FlowArticle {
    const current = requireArticle();
    if (current.status !== ArticleStatus.PUBLISHED) {
      throw new NotFoundException('Published article not found');
    }
    return current;
  }

  function requireTerm(id: string): FlowTerm {
    const term = terms.get(id);
    if (!term) throw new NotFoundException('Contextual term not found');
    return term;
  }

  function pendingTerm(id: string, value: string): FlowTerm {
    return {
      id,
      value,
      wordDisplay: value,
      lemma: value,
      unitType: LexicalUnitType.WORD,
      partOfSpeech: 'adjective',
      ipa: null,
      cefrLevel: CefrLevel.B1,
      contextualMeaningVi: null,
      definitionEn: null,
      contextualExplanation: null,
      explanationStatus: AiGenerationStatus.PENDING,
      explanationGeneratedAt: null,
      origin: TermOrigin.AI,
      reviewStatus: TermReviewStatus.PENDING,
      isActive: false,
      isLookupEnabled: false,
      synonyms: [],
      antonyms: [],
      collocations: [],
      relatedTerms: [],
      vocabularyTopic: null,
      examples: [],
      skill: null,
    };
  }

  it('completes the fully mocked authenticated admin and user flow without live provider or publisher requests', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/news/search')
      .query({ q: 'community', pageSize: 1 })
      .expect(401);

    const search = await request(app.getHttpServer())
      .get('/api/v1/admin/news/search')
      .query({ q: 'community', pageSize: 1 })
      .set('Authorization', 'Bearer admin')
      .expect(200);

    const searchJson = responseBody<{
      success: true;
      data: { articles: unknown[] };
    }>(search);
    expect(searchJson.success).toBe(true);
    expect(searchJson.data.articles).toHaveLength(1);
    expect(JSON.stringify(searchJson)).not.toContain('providerContent');
    expect(JSON.stringify(searchJson)).not.toContain('fields');
    expect(
      new URL(guardianRequestUrls[0]).searchParams.get('show-fields'),
    ).not.toContain('body');

    const sync = await request(app.getHttpServer())
      .post('/api/v1/admin/news/sync')
      .set('Authorization', 'Bearer admin')
      .send({ q: 'community', pageSize: 1, defaultCategoryId: categoryId })
      .expect(201);

    const syncJson = responseBody<{
      data: {
        counts: Record<string, number>;
        items: Array<{ status: string; articleId?: string }>;
      };
    }>(sync);
    expect(syncJson.data.counts).toEqual({
      discovered: 1,
      imported: 1,
      skippedDuplicate: 0,
      failed: 0,
    });
    expect(syncJson.data.items[0]).toMatchObject({
      status: 'imported',
      articleId,
    });
    expect(requireArticle()).toMatchObject({
      status: ArticleStatus.DRAFT,
      importSource: 'guardian',
      canonicalUrl: sourceUrl,
      sourcePublishedAt: new Date('2026-07-30T08:30:00Z'),
      publishedAt: null,
    });
    expect(requireArticle().contentHtml).not.toContain('<script');
    expect(requireArticle().contentHtml).toContain(
      `data-sentence-id="${sentenceId}"`,
    );
    expect(
      new URL(guardianRequestUrls[1]).searchParams.get('show-fields'),
    ).toContain('body');
    expect(guardianRequestUrls).toHaveLength(2);
    expect(
      guardianRequestUrls.every((url) =>
        url.startsWith('https://content.guardianapis.com/search?'),
      ),
    ).toBe(true);

    const analysis = await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/analyze`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(
      responseBody<{
        data: {
          articleId: string;
          aiAnalysisStatus: AiGenerationStatus;
          candidateCount: number;
        };
      }>(analysis).data,
    ).toMatchObject({
      articleId,
      aiAnalysisStatus: AiGenerationStatus.READY,
      candidateCount: 2,
    });

    expect(analyzeArticle).toHaveBeenCalledTimes(1);
    expect([...terms.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          origin: TermOrigin.AI,
          reviewStatus: TermReviewStatus.PENDING,
          isActive: false,
        }),
      ]),
    );
    expect(requireArticle().contentHtml).not.toContain('data-term-id');

    await request(app.getHttpServer())
      .post(
        `/api/v1/admin/articles/${articleId}/terms/${approvedTermId}/approve`,
      )
      .set('Authorization', 'Bearer admin')
      .expect(200);
    await request(app.getHttpServer())
      .post(
        `/api/v1/admin/articles/${articleId}/terms/${rejectedTermId}/reject`,
      )
      .set('Authorization', 'Bearer admin')
      .expect(200);

    expect(
      requireArticle().contentHtml.match(
        new RegExp(`data-term-id="${approvedTermId}"`, 'gu'),
      ),
    ).toHaveLength(1);
    expect(requireArticle().contentHtml).not.toContain(rejectedTermId);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/publish`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(requireArticle().status).toBe(ArticleStatus.PUBLISHED);

    const reader = await request(app.getHttpServer())
      .get(`/api/v1/reading/articles/${requireArticle().slug}`)
      .set('Authorization', 'Bearer user')
      .expect(200);
    const readerJson = responseBody<{
      data: { highlightedTermIds: string[]; contentHtml: string };
    }>(reader);
    expect(readerJson.data.highlightedTermIds).toEqual([approvedTermId]);
    expect(readerJson.data.contentHtml).toContain(approvedTermId);
    expect(readerJson.data.contentHtml).not.toContain(rejectedTermId);

    const firstLookup = await request(app.getHttpServer())
      .get(`/api/v1/reading/articles/${articleId}/terms/${approvedTermId}`)
      .set('Authorization', 'Bearer user')
      .expect(200);
    expect(
      responseBody<{
        data: {
          term: Record<string, unknown>;
          parentSentence: Record<string, unknown>;
        };
      }>(firstLookup).data,
    ).toMatchObject({
      term: {
        id: approvedTermId,
        contextualMeaningVi: 'đầy tham vọng',
        explanationStatus: AiGenerationStatus.READY,
        examples: [
          {
            sentence: 'The town approved an ambitious recovery plan.',
            translationVi:
              'Thị trấn đã thông qua một kế hoạch phục hồi đầy tham vọng.',
          },
        ],
      },
      parentSentence: {
        id: sentenceId,
        translationVi:
          'Các cộng đồng đã thông qua một kế hoạch đầy tham vọng, nhưng chất thải có hại vẫn là mối lo ngại.',
      },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/reading/articles/${articleId}/terms/${approvedTermId}`)
      .set('Authorization', 'Bearer user')
      .expect(200);
    expect(enrichContextualTerm).toHaveBeenCalledTimes(1);

    const save = await request(app.getHttpServer())
      .post('/api/v1/vocabularies')
      .set('Authorization', 'Bearer user')
      .send({
        articleSentenceTermId: approvedTermId,
        collectionIds: [collectionId],
      })
      .expect(201);
    expect(
      responseBody<{ data: { vocabulary: Record<string, unknown> } }>(save).data
        .vocabulary,
    ).toMatchObject({
      id: vocabularyId,
      articleSentenceTermId: approvedTermId,
      savedMeaningVi: 'đầy tham vọng',
      savedExamples: [
        {
          sentence: 'The town approved an ambitious recovery plan.',
          translationVi:
            'Thị trấn đã thông qua một kế hoạch phục hồi đầy tham vọng.',
        },
      ],
    });

    const snapshotBeforeSourceEdit = structuredClone(savedVocabulary);
    requireTerm(approvedTermId).contextualMeaningVi = 'changed source value';
    requireTerm(approvedTermId).examples = [];
    expect(savedVocabulary).toEqual(snapshotBeforeSourceEdit);

    await request(app.getHttpServer())
      .get(`/api/v1/reading/articles/${articleId}/terms/${rejectedTermId}`)
      .set('Authorization', 'Bearer user')
      .expect(404);
    expect(enrichContextualTerm).toHaveBeenCalledTimes(1);
    expect(guardianFetch).toHaveBeenCalledTimes(2);
  });
});
