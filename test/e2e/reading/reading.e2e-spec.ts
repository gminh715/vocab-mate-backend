import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../../generated/prisma/client';
import {
  ArticleStatus,
  CefrLevel,
  LearningStatus,
  LexicalUnitType,
  ReadingStatus,
} from '../../../generated/prisma/enums';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { configureApp, setupSwagger } from '../../../src/app.setup';
import { PrismaService } from '../../../src/database/prisma.service';
import type { RequestWithUser } from '../../../src/modules/auth/auth.types';
import { JwtAuthGuard } from '../../../src/modules/auth/guards/jwt-auth.guard';
import {
  type ContextualTermLookupRecord,
  ContextualTermsRepository,
} from '../../../src/modules/reading/repositories/contextual-terms.repository';
import {
  type ReadingHistoryRecord,
  type ReaderArticleRecord,
  type ReaderProgressRecord,
  type UpsertUserArticleProgressInput,
  type UserArticleProgressResult,
  ReadingRepository,
} from '../../../src/modules/reading/repositories/reading.repository';

const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';
const ARCHIVED_ARTICLE_ID = '12121212-1212-4121-8121-121212121212';
const SENTENCE_ID = '22222222-2222-4222-8222-222222222222';
const A2_TERM_ID = '33333333-3333-4333-8333-333333333333';
const B1_TERM_ID = '44444444-4444-4444-8444-444444444444';
const C1_TERM_ID = '55555555-5555-4555-8555-555555555555';
const C2_TERM_ID = '56565656-5656-4565-8565-565656565656';
const DISABLED_TERM_ID = '66666666-6666-4666-8666-666666666666';
const INACTIVE_TERM_ID = '77777777-7777-4777-8777-777777777777';
const STALE_TERM_ID = '88888888-8888-4888-8888-888888888888';
const VOCABULARY_ID = '99999999-9999-4999-8999-999999999999';

interface SuccessBody<T> {
  success: true;
  data: T;
}

const responseBody = <T>(response: { text: string }): T =>
  JSON.parse(response.text) as T;

class TestReadingAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/u, '');
    if (!token) throw new UnauthorizedException('Access token is invalid');

    const cefrUsers = new Set([
      'user-b1',
      'user-c1',
      'user-saved',
      'user-other',
      'user-history',
      'user-isolated',
    ]);
    if (!cefrUsers.has(token) && token !== 'admin') {
      throw new UnauthorizedException('Access token is invalid');
    }
    request.user = {
      id: token,
      email: `${token}@example.com`,
      role: token === 'admin' ? 'ADMIN' : 'USER',
      status: 'ACTIVE',
    };
    return true;
  }
}

interface StoredProgress extends ReaderProgressRecord {
  firstOpenedAt: Date;
  lastReadAt: Date;
}

class InMemoryReadingRepository {
  readonly progressRows = new Map<string, StoredProgress>([
    [
      this.progressKey('user-other', ARTICLE_ID),
      {
        articleId: ARTICLE_ID,
        status: ReadingStatus.COMPLETED,
        progressPercent: new Prisma.Decimal('100'),
        lastBlockKey: 'sentence-1',
        completedAt: new Date('2026-07-23T02:00:00Z'),
        firstOpenedAt: new Date('2026-07-22T01:00:00Z'),
        lastReadAt: new Date('2026-07-23T02:00:00Z'),
      },
    ],
    [
      this.progressKey('user-history', ARCHIVED_ARTICLE_ID),
      {
        articleId: ARCHIVED_ARTICLE_ID,
        status: ReadingStatus.READING,
        progressPercent: new Prisma.Decimal('25'),
        lastBlockKey: 'archived-paragraph',
        completedAt: null,
        firstOpenedAt: new Date('2026-07-18T01:00:00Z'),
        lastReadAt: new Date('2026-07-19T01:00:00Z'),
      },
    ],
  ]);
  readonly savedVocabularyCount = 1;
  readonly reviewHistoryCount = 1;

  findReaderArticle(
    userId: string,
    slug: string,
  ): Promise<ReaderArticleRecord | null> {
    if (
      slug === 'draft-article' ||
      slug === 'archived-article' ||
      slug === 'missing-article'
    ) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      article: {
        id: ARTICLE_ID,
        title: 'How Technology Changes Learning',
        slug: 'how-technology-changes-learning',
        summary: 'Digital tools are changing modern classrooms.',
        sourceName: 'Vocab Mate News',
        sourceUrl: null,
        authorName: 'Jane Doe',
        thumbnailUrl: null,
        cefrLevel: CefrLevel.B1,
        status: ArticleStatus.PUBLISHED,
        publishedAt: new Date('2026-07-22T10:00:00Z'),
        category: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          name: 'Technology',
          slug: 'technology',
        },
      },
      contentHtml:
        '<p onclick="bad()">Technology <strong>changes</strong> learning.</p><script>bad()</script>',
      userCefrLevel: userId === 'user-c1' ? CefrLevel.C1 : CefrLevel.B1,
      userTargetCefrLevel: userId === 'user-c1' ? CefrLevel.C2 : CefrLevel.C1,
      termCandidates: [
        { id: A2_TERM_ID, cefrLevel: CefrLevel.A2 },
        { id: B1_TERM_ID, cefrLevel: CefrLevel.B1 },
        { id: C1_TERM_ID, cefrLevel: CefrLevel.C1 },
        { id: C2_TERM_ID, cefrLevel: CefrLevel.C2 },
      ],
      progress:
        this.progressRows.get(this.progressKey(userId, ARTICLE_ID)) ?? null,
    });
  }

  findContextualTerm(
    userId: string,
    articleId: string,
    termId: string,
  ): Promise<ContextualTermLookupRecord | null> {
    if (
      articleId !== ARTICLE_ID ||
      termId === INACTIVE_TERM_ID ||
      termId === STALE_TERM_ID
    ) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      term: {
        id: termId,
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
        explanationGeneratedAt: null,
        synonyms: ['damaging'],
        antonyms: ['beneficial'],
        collocations: ['harmful effect'],
        relatedTerms: ['harm'],
        vocabularyTopic: 'environment',
        examples: [
          {
            sentence: 'Plastic waste is harmful to marine life.',
            translationVi: 'Rác thải nhựa có hại cho sinh vật biển.',
          },
        ],
        skill: 'vocabulary',
      },
      parentSentence: {
        id: SENTENCE_ID,
        sentenceOrder: 1,
        sentenceText: 'Plastic waste is harmful to marine life.',
        translationVi: 'Rác thải nhựa có hại cho sinh vật biển.',
        explanationVi: null,
        referenceExplanation: null,
        skill: 'reading',
      },
      isLookupEnabled: termId !== DISABLED_TERM_ID,
      save:
        userId === 'user-saved'
          ? {
              id: VOCABULARY_ID,
              learningStatus: LearningStatus.LEARNING,
            }
          : null,
    });
  }

  listUserHistory(
    userId: string,
    query: {
      page: number;
      limit: number;
      status?: ReadingStatus;
      sort: 'newest' | 'oldest';
    },
  ): Promise<{ items: ReadingHistoryRecord[]; total: number }> {
    const direction = query.sort === 'oldest' ? 1 : -1;
    const items = [...this.progressRows.entries()]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, progress]) => ({
        ...progress,
        article:
          progress.articleId === ARCHIVED_ARTICLE_ID
            ? {
                id: ARCHIVED_ARTICLE_ID,
                title: 'Archived History Article',
                slug: 'archived-history-article',
                summary: 'A retained historical entry.',
                thumbnailUrl: null,
                cefrLevel: CefrLevel.B1,
                status: ArticleStatus.ARCHIVED,
                publishedAt: new Date('2026-07-01T01:00:00Z'),
                category: {
                  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                  name: 'Technology',
                  slug: 'technology',
                },
              }
            : {
                id: ARTICLE_ID,
                title: 'How Technology Changes Learning',
                slug: 'how-technology-changes-learning',
                summary: 'Digital tools are changing modern classrooms.',
                thumbnailUrl: null,
                cefrLevel: CefrLevel.B1,
                status: ArticleStatus.PUBLISHED,
                publishedAt: new Date('2026-07-22T10:00:00Z'),
                category: {
                  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                  name: 'Technology',
                  slug: 'technology',
                },
              },
      }))
      .filter(({ status }) => !query.status || status === query.status)
      .sort(
        (left, right) =>
          (left.lastReadAt.getTime() - right.lastReadAt.getTime()) * direction,
      );
    const start = (query.page - 1) * query.limit;
    return Promise.resolve({
      items: items.slice(start, start + query.limit),
      total: items.length,
    });
  }

  findUserArticleProgress(
    userId: string,
    articleId: string,
  ): Promise<UserArticleProgressResult | null> {
    if (articleId !== ARTICLE_ID) return Promise.resolve(null);
    return Promise.resolve({
      articleId,
      progress:
        this.progressRows.get(this.progressKey(userId, articleId)) ?? null,
    });
  }

  upsertUserArticleProgress(
    userId: string,
    articleId: string,
    input: UpsertUserArticleProgressInput,
  ): Promise<UserArticleProgressResult | null> {
    if (articleId !== ARTICLE_ID) return Promise.resolve(null);
    const key = this.progressKey(userId, articleId);
    const existing = this.progressRows.get(key);
    const now = new Date();
    const completed = existing?.status === ReadingStatus.COMPLETED;
    const progress: StoredProgress = {
      articleId,
      status: completed ? ReadingStatus.COMPLETED : ReadingStatus.READING,
      progressPercent: completed
        ? new Prisma.Decimal('100')
        : new Prisma.Decimal(
            input.progressPercent ?? existing?.progressPercent.toNumber() ?? 0,
          ),
      lastBlockKey:
        input.lastBlockKey === undefined
          ? (existing?.lastBlockKey ?? null)
          : input.lastBlockKey,
      completedAt: completed ? (existing.completedAt ?? now) : null,
      firstOpenedAt: existing?.firstOpenedAt ?? now,
      lastReadAt: now,
    };
    this.progressRows.set(key, progress);
    return Promise.resolve({ articleId, progress });
  }

  completeUserArticleProgress(
    userId: string,
    articleId: string,
  ): Promise<UserArticleProgressResult | null> {
    if (articleId !== ARTICLE_ID) return Promise.resolve(null);
    const key = this.progressKey(userId, articleId);
    const existing = this.progressRows.get(key);
    const now = new Date();
    const progress: StoredProgress = {
      articleId,
      status: ReadingStatus.COMPLETED,
      progressPercent: new Prisma.Decimal('100'),
      lastBlockKey: existing?.lastBlockKey ?? null,
      completedAt: existing?.completedAt ?? now,
      firstOpenedAt: existing?.firstOpenedAt ?? now,
      lastReadAt: now,
    };
    this.progressRows.set(key, progress);
    return Promise.resolve({ articleId, progress });
  }

  deleteUserArticleProgress(
    userId: string,
    articleId: string,
  ): Promise<boolean> {
    return Promise.resolve(
      this.progressRows.delete(this.progressKey(userId, articleId)),
    );
  }

  hasProgress(userId: string, articleId: string): boolean {
    return this.progressRows.has(this.progressKey(userId, articleId));
  }

  countProgressRows(userId: string, articleId: string): number {
    const key = this.progressKey(userId, articleId);
    return [...this.progressRows.keys()].filter(
      (progressKey) => progressKey === key,
    ).length;
  }

  private progressKey(userId: string, articleId: string): string {
    return `${userId}:${articleId}`;
  }
}

describe('Reading APIs (e2e)', () => {
  let app: INestApplication<App>;
  let repository: InMemoryReadingRepository;

  beforeAll(async () => {
    repository = new InMemoryReadingRepository();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(ReadingRepository)
      .useValue(repository)
      .overrideProvider(ContextualTermsRepository)
      .useValue(repository)
      .overrideGuard(JwtAuthGuard)
      .useClass(TestReadingAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<App>();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('documents protected REA-001 through REA-007 operations and response contracts', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swagger = responseBody<{
      paths: Record<
        string,
        Record<
          string,
          {
            operationId: string;
            parameters: Array<{ name: string; required: boolean }>;
            responses: Record<string, object>;
            security: Array<Record<string, string[]>>;
          }
        >
      >;
      components: {
        schemas: Record<
          string,
          {
            properties?: Record<
              string,
              { nullable?: boolean; enum?: string[] }
            >;
          }
        >;
      };
    }>(response);
    const reader = swagger.paths['/api/v1/reading/articles/{slug}'].get;
    const lookup =
      swagger.paths['/api/v1/reading/articles/{articleId}/terms/{termId}'].get;

    expect(reader.operationId).toBe('getReadingArticlesBySlug');
    expect(reader.parameters.map(({ name }) => name)).toEqual(['slug']);
    expect(reader.security).toContainEqual({ BearerAuth: [] });
    expect(Object.keys(reader.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '500']),
    );
    expect(lookup.operationId).toBe(
      'getReadingArticlesByArticleIdTermsByTermId',
    );
    expect(lookup.parameters.map(({ name }) => name)).toEqual([
      'articleId',
      'termId',
    ]);
    expect(lookup.security).toContainEqual({ BearerAuth: [] });
    const contextualTermProperties =
      swagger.components.schemas['ContextualTermDto'].properties ?? {};
    expect(contextualTermProperties.contextualMeaningVi?.nullable).toBe(true);
    expect(contextualTermProperties.explanationStatus?.enum).toEqual([
      'PENDING',
      'PROCESSING',
      'READY',
      'FAILED',
    ]);
    expect(contextualTermProperties.explanationGeneratedAt?.nullable).toBe(
      true,
    );
    const history = swagger.paths['/api/v1/reading/history'].get;
    const progress = swagger.paths['/api/v1/reading/progress/{articleId}'];
    const complete =
      swagger.paths['/api/v1/reading/progress/{articleId}/complete'].post;
    expect(history.operationId).toBe('getReadingHistory');
    expect(history.security).toContainEqual({ BearerAuth: [] });
    expect(progress.get.operationId).toBe('getReadingProgressByArticleId');
    expect(progress.put.operationId).toBe('putReadingProgressByArticleId');
    expect(progress.delete.operationId).toBe(
      'deleteReadingProgressByArticleId',
    );
    expect(Object.keys(progress.delete.responses)).toContain('204');
    expect(complete.operationId).toBe('postReadingProgressByArticleIdComplete');
    expect(JSON.stringify(complete.responses['200'])).toContain('COMPLETED');
    expect(JSON.stringify(complete.responses['200'])).not.toContain(
      'IN_PROGRESS',
    );
  });

  it('returns 401 without authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/reading/articles/how-technology-changes-learning')
      .expect(401);
  });

  it('returns a sanitized personalized reader payload for USER and ADMIN', async () => {
    for (const token of ['user-b1', 'admin']) {
      const response = await request(app.getHttpServer())
        .get('/api/v1/reading/articles/how-technology-changes-learning')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = responseBody<
        SuccessBody<{
          contentHtml: string;
          highlightedTermIds: string[];
          progress: { status: ReadingStatus; progressPercent: number };
        }>
      >(response);

      expect(body.data.highlightedTermIds).toEqual([B1_TERM_ID, C1_TERM_ID]);
      expect(body.data.contentHtml).toBe(
        '<p>Technology <strong>changes</strong> learning.</p>',
      );
      expect(body.data.progress).toMatchObject({
        status: ReadingStatus.READING,
        progressPercent: 0,
      });
    }
  });

  it('uses the current and target profile CEFR levels for deterministic highlights', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/reading/articles/how-technology-changes-learning')
      .set('Authorization', 'Bearer user-c1')
      .expect(200);
    const body =
      responseBody<SuccessBody<{ highlightedTermIds: string[] }>>(response);

    expect(body.data.highlightedTermIds).toEqual([C1_TERM_ID, C2_TERM_ID]);
  });

  it.each(['draft-article', 'archived-article'])(
    'hides %s with 404',
    async (slug) => {
      await request(app.getHttpServer())
        .get(`/api/v1/reading/articles/${slug}`)
        .set('Authorization', 'Bearer user-b1')
        .expect(404);
    },
  );

  it('does not persist default progress and returns existing progress', async () => {
    const initialRows = repository.progressRows.size;
    await request(app.getHttpServer())
      .get('/api/v1/reading/articles/how-technology-changes-learning')
      .set('Authorization', 'Bearer user-b1')
      .expect(200);
    expect(repository.progressRows.size).toBe(initialRows);
    expect(repository.hasProgress('user-b1', ARTICLE_ID)).toBe(false);

    const response = await request(app.getHttpServer())
      .get('/api/v1/reading/articles/how-technology-changes-learning')
      .set('Authorization', 'Bearer user-other')
      .expect(200);
    const body = responseBody<
      SuccessBody<{
        progress: {
          status: ReadingStatus;
          progressPercent: number;
          lastBlockKey: string | null;
        };
      }>
    >(response);
    expect(body.data.progress).toMatchObject({
      status: ReadingStatus.COMPLETED,
      progressPercent: 100,
      lastBlockKey: 'sentence-1',
    });
  });

  it('returns the contextual popup without an AI call', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/reading/articles/${ARTICLE_ID}/terms/${B1_TERM_ID}`)
      .set('Authorization', 'Bearer user-b1')
      .expect(200);
    const body = responseBody<
      SuccessBody<{
        term: { id: string; contextualMeaningVi: string };
        parentSentence: { id: string; sentenceText: string };
        saveState: { isSaved: boolean };
      }>
    >(response);

    expect(body.data).toMatchObject({
      term: { id: B1_TERM_ID, contextualMeaningVi: 'có hại' },
      parentSentence: {
        id: SENTENCE_ID,
        sentenceText: 'Plastic waste is harmful to marine life.',
      },
      saveState: { isSaved: false },
    });
  });

  it('rejects disabled lookup with 403 and inactive/stale terms with 404', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/reading/articles/${ARTICLE_ID}/terms/${DISABLED_TERM_ID}`)
      .set('Authorization', 'Bearer user-b1')
      .expect(403);
    for (const termId of [INACTIVE_TERM_ID, STALE_TERM_ID]) {
      await request(app.getHttpServer())
        .get(`/api/v1/reading/articles/${ARTICLE_ID}/terms/${termId}`)
        .set('Authorization', 'Bearer user-b1')
        .expect(404);
    }
  });

  it('isolates saveState by authenticated user and exact contextual term', async () => {
    const savedResponse = await request(app.getHttpServer())
      .get(`/api/v1/reading/articles/${ARTICLE_ID}/terms/${B1_TERM_ID}`)
      .set('Authorization', 'Bearer user-saved')
      .expect(200);
    const otherResponse = await request(app.getHttpServer())
      .get(`/api/v1/reading/articles/${ARTICLE_ID}/terms/${B1_TERM_ID}`)
      .set('Authorization', 'Bearer user-other')
      .expect(200);

    expect(
      responseBody<
        SuccessBody<{
          saveState: {
            isSaved: boolean;
            userVocabularyId: string | null;
            learningStatus: LearningStatus | null;
          };
        }>
      >(savedResponse).data.saveState,
    ).toEqual({
      isSaved: true,
      userVocabularyId: VOCABULARY_ID,
      learningStatus: LearningStatus.LEARNING,
    });
    expect(
      responseBody<
        SuccessBody<{
          saveState: {
            isSaved: boolean;
            userVocabularyId: string | null;
            learningStatus: LearningStatus | null;
          };
        }>
      >(otherResponse).data.saveState,
    ).toEqual({
      isSaved: false,
      userVocabularyId: null,
      learningStatus: null,
    });
  });

  it('returns only current-user history and retains archived article metadata', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/reading/history?page=1&limit=20&sort=newest')
      .set('Authorization', 'Bearer user-history')
      .expect(200);
    const body = responseBody<
      SuccessBody<{
        items: Array<{
          articleId: string;
          article: { status: ArticleStatus; contentHtml?: string };
        }>;
        meta: { total: number };
      }>
    >(response);

    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toMatchObject({
      articleId: ARCHIVED_ARTICLE_ID,
      article: { status: ArticleStatus.ARCHIVED },
    });
    expect(body.data.items[0].article).not.toHaveProperty('contentHtml');
    expect(body.data.meta.total).toBe(1);
  });

  it('filters and paginates history in the repository', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/reading/history?page=1&limit=1&status=READING&sort=oldest')
      .set('Authorization', 'Bearer user-history')
      .expect(200);
    const body = responseBody<
      SuccessBody<{
        items: Array<{ status: ReadingStatus }>;
        meta: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>
    >(response);

    expect(body.data.items).toEqual([
      expect.objectContaining({ status: ReadingStatus.READING }),
    ]);
    expect(body.data.meta).toEqual({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1,
    });
  });

  it('returns progress default without inserting, then creates and partially updates progress', async () => {
    const defaultResponse = await request(app.getHttpServer())
      .get(`/api/v1/reading/progress/${ARTICLE_ID}`)
      .set('Authorization', 'Bearer user-isolated')
      .expect(200);
    expect(repository.hasProgress('user-isolated', ARTICLE_ID)).toBe(false);
    expect(
      responseBody<
        SuccessBody<{
          progress: { status: ReadingStatus; progressPercent: number };
        }>
      >(defaultResponse).data.progress,
    ).toMatchObject({
      status: ReadingStatus.READING,
      progressPercent: 0,
    });

    await request(app.getHttpServer())
      .put(`/api/v1/reading/progress/${ARTICLE_ID}`)
      .set('Authorization', 'Bearer user-isolated')
      .send({ progressPercent: 60 })
      .expect(200);
    const updateResponse = await request(app.getHttpServer())
      .put(`/api/v1/reading/progress/${ARTICLE_ID}`)
      .set('Authorization', 'Bearer user-isolated')
      .send({ lastBlockKey: '  paragraph-3  ' })
      .expect(200);
    expect(
      responseBody<
        SuccessBody<{
          progress: { progressPercent: number; lastBlockKey: string };
        }>
      >(updateResponse).data.progress,
    ).toMatchObject({
      progressPercent: 60,
      lastBlockKey: 'paragraph-3',
    });
  });

  it('converges concurrent first progress writes on one user/article row', async () => {
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .put(`/api/v1/reading/progress/${ARTICLE_ID}`)
        .set('Authorization', 'Bearer user-c1')
        .send({ progressPercent: 20 }),
      request(app.getHttpServer())
        .put(`/api/v1/reading/progress/${ARTICLE_ID}`)
        .set('Authorization', 'Bearer user-c1')
        .send({ lastBlockKey: 'concurrent-block' }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(repository.countProgressRows('user-c1', ARTICLE_ID)).toBe(1);
  });

  it.each([-1, 101])(
    'rejects invalid progress percentage %s',
    async (value) => {
      await request(app.getHttpServer())
        .put(`/api/v1/reading/progress/${ARTICLE_ID}`)
        .set('Authorization', 'Bearer user-b1')
        .send({ progressPercent: value })
        .expect(400);
    },
  );

  it('rejects an empty progress update and inaccessible article progress', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/reading/progress/${ARTICLE_ID}`)
      .set('Authorization', 'Bearer user-b1')
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/v1/reading/progress/${ARCHIVED_ARTICLE_ID}`)
      .set('Authorization', 'Bearer user-b1')
      .expect(404);
  });

  it('stores 100 as READING until explicit completion, which is repeatable and preserves completedAt', async () => {
    const updateResponse = await request(app.getHttpServer())
      .put(`/api/v1/reading/progress/${ARTICLE_ID}`)
      .set('Authorization', 'Bearer user-b1')
      .send({ progressPercent: 100 })
      .expect(200);
    expect(
      responseBody<
        SuccessBody<{
          progress: {
            status: ReadingStatus;
            progressPercent: number;
            completedAt: string | null;
          };
        }>
      >(updateResponse).data.progress,
    ).toMatchObject({
      status: ReadingStatus.READING,
      progressPercent: 100,
      completedAt: null,
    });

    const first = await request(app.getHttpServer())
      .post(`/api/v1/reading/progress/${ARTICLE_ID}/complete`)
      .set('Authorization', 'Bearer user-b1')
      .expect(200);
    const second = await request(app.getHttpServer())
      .post(`/api/v1/reading/progress/${ARTICLE_ID}/complete`)
      .set('Authorization', 'Bearer user-b1')
      .expect(200);
    const firstProgress = responseBody<
      SuccessBody<{
        progress: {
          status: ReadingStatus;
          progressPercent: number;
          completedAt: string;
        };
      }>
    >(first).data.progress;
    const secondProgress = responseBody<
      SuccessBody<{
        progress: {
          status: ReadingStatus;
          progressPercent: number;
          completedAt: string;
        };
      }>
    >(second).data.progress;
    expect(firstProgress).toMatchObject({
      status: ReadingStatus.COMPLETED,
      progressPercent: 100,
    });
    expect(firstProgress.completedAt).toEqual(expect.any(String));
    expect(secondProgress.completedAt).toBe(firstProgress.completedAt);
  });

  it('isolates progress ownership across reads and mutations', async () => {
    const otherBefore = repository.progressRows.get(
      `user-other:${ARTICLE_ID}`,
    )?.lastBlockKey;
    await request(app.getHttpServer())
      .put(`/api/v1/reading/progress/${ARTICLE_ID}`)
      .set('Authorization', 'Bearer user-isolated')
      .send({ lastBlockKey: 'isolated-key' })
      .expect(200);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/reading/progress/${ARTICLE_ID}`)
      .set('Authorization', 'Bearer user-other')
      .expect(200);

    expect(
      responseBody<SuccessBody<{ progress: { lastBlockKey: string | null } }>>(
        response,
      ).data.progress.lastBlockKey,
    ).toBe(otherBefore);
  });

  it('deletes only progress with real 204 and preserves vocabulary/review state', async () => {
    const vocabularyCount = repository.savedVocabularyCount;
    const reviewCount = repository.reviewHistoryCount;
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/reading/progress/${ARTICLE_ID}`)
      .set('Authorization', 'Bearer user-isolated')
      .expect(204);

    expect(response.text).toBe('');
    expect(repository.hasProgress('user-isolated', ARTICLE_ID)).toBe(false);
    expect(repository.hasProgress('user-other', ARTICLE_ID)).toBe(true);
    expect(repository.savedVocabularyCount).toBe(vocabularyCount);
    expect(repository.reviewHistoryCount).toBe(reviewCount);

    await request(app.getHttpServer())
      .delete(`/api/v1/reading/progress/${ARTICLE_ID}`)
      .set('Authorization', 'Bearer user-isolated')
      .expect(404);
  });
});
