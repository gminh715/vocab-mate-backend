/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { configureApp, setupSwagger } from '../../../src/app.setup';
import { PrismaService } from '../../../src/database/prisma.service';
import { AdminAnalyticsService } from '../../../src/modules/analytics/services/admin-analytics.service';
import { LearnerAnalyticsService } from '../../../src/modules/analytics/services/learner-analytics.service';
import { ReviewAnalyticsService } from '../../../src/modules/analytics/services/review-analytics.service';
import {
  AdminContentAnalyticsQueryDto,
  AdminUserAnalyticsQueryDto,
  AnalyticsDateRangeQueryDto,
  QuizAnalyticsQueryDto,
  resolveAnalyticsDateRange,
} from '../../../src/modules/analytics/dto/analytics-query.dto';
import type { RequestWithUser } from '../../../src/modules/auth/auth.types';
import { JwtAuthGuard } from '../../../src/modules/auth/guards/jwt-auth.guard';

interface SwaggerParameter {
  name: string;
  schema: { enum?: string[] };
}

interface SwaggerOperation {
  security: Array<Record<string, string[]>>;
  responses: Record<string, unknown>;
  parameters: SwaggerParameter[];
}

interface AnalyticsSwaggerDocument {
  paths: Record<string, { get: SwaggerOperation }>;
  components: {
    schemas: Record<string, { properties: Record<string, unknown> }>;
  };
}

class AnalyticsAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/u, '');
    if (!token) throw new UnauthorizedException();
    request.user = {
      id: `${token}-id`,
      email: `${token}@example.com`,
      role: token === 'admin' ? 'ADMIN' : 'USER',
      status: 'ACTIVE',
    };
    return true;
  }
}

class InMemoryAnalyticsService {
  readonly calls: Array<{ operation: string; userId: string }> = [];

  getOverview(userId: string, query: AnalyticsDateRangeQueryDto) {
    resolveAnalyticsDateRange(query, new Date('2026-07-24T00:00:00Z'));
    this.calls.push({ operation: 'overview', userId });
    if (userId === 'empty-id') {
      return {
        savedVocabulary: 0,
        dueToday: 0,
        mastered: 0,
        articlesCompleted: 0,
        quizAccuracy: 0,
        sessions: 0,
      };
    }
    return {
      savedVocabulary: userId === 'user-a-id' ? 6 : 2,
      dueToday: 1,
      mastered: 2,
      articlesCompleted: 3,
      quizAccuracy: 0.75,
      sessions: 2,
    };
  }

  getVocabularyAnalytics(userId: string, query: AnalyticsDateRangeQueryDto) {
    resolveAnalyticsDateRange(query, new Date('2026-07-24T00:00:00Z'));
    this.calls.push({ operation: 'vocabulary', userId });
    return {
      totals: {
        total: userId === 'user-a-id' ? 6 : 2,
        due: 1,
        mastered: 2,
      },
      byStatus: [
        { status: 'NEW', count: 1 },
        { status: 'LEARNING', count: 1 },
        { status: 'REVIEWING', count: 1 },
        { status: 'MASTERED', count: 2 },
        { status: 'IGNORED', count: 1 },
      ],
      byCefr: [
        { cefrLevel: 'A1', count: 1 },
        { cefrLevel: 'A2', count: 1 },
        { cefrLevel: 'B1', count: 1 },
        { cefrLevel: 'B2', count: 1 },
        { cefrLevel: 'C1', count: 1 },
        { cefrLevel: 'C2', count: 1 },
      ],
      savedTrend: [{ bucket: '2026-07-23', count: 1 }],
    };
  }

  getReadingAnalytics(userId: string, query: AnalyticsDateRangeQueryDto) {
    resolveAnalyticsDateRange(query, new Date('2026-07-24T00:00:00Z'));
    this.calls.push({ operation: 'reading', userId });
    return {
      opened: userId === 'empty-id' ? 0 : 2,
      completed: userId === 'empty-id' ? 0 : 1,
      completionRate: userId === 'empty-id' ? 0 : 0.5,
      byCategory: [],
      trend: [{ bucket: '2026-07-23', opened: 0, completed: 0 }],
    };
  }

  getQuizAnalytics(userId: string, query: QuizAnalyticsQueryDto) {
    resolveAnalyticsDateRange(query, new Date('2026-07-24T00:00:00Z'));
    this.calls.push({ operation: 'quizzes', userId });
    return {
      sessions: userId === 'empty-id' ? 0 : 2,
      accuracy: userId === 'empty-id' ? 0 : 0.75,
      averageScore: userId === 'empty-id' ? 0 : 0.625,
      byQuestionType: [
        'SELECT_MEANING',
        'SELECT_WORD',
        'SELECT_CORRECT_CONTEXT',
        'FILL_BLANK',
      ].map((questionType) => ({
        questionType,
        answers: 0,
        correctAnswers: 0,
        accuracy: 0,
      })),
      trend: [],
    };
  }

  getReviewAnalytics(userId: string, query: AnalyticsDateRangeQueryDto) {
    resolveAnalyticsDateRange(query, new Date('2026-07-24T00:00:00Z'));
    this.calls.push({ operation: 'reviews', userId });
    const hasData = userId !== 'empty-id';
    return {
      sessionsStarted: hasData ? 2 : 0,
      sessionsCompleted: hasData ? 1 : 0,
      sessionsAbandoned: hasData ? 1 : 0,
      completionRate: hasData ? 0.5 : 0,
      answers: hasData ? 4 : 0,
      correctAnswers: hasData ? 3 : 0,
      accuracy: hasData ? 0.75 : 0,
      averageResponseTimeMs: hasData ? 3200 : null,
      hintsUsed: hasData ? 1 : 0,
      sameSessionRetest: {
        attempts: hasData ? 1 : 0,
        correct: hasData ? 1 : 0,
        successRate: hasData ? 1 : 0,
      },
      bySkill: [
        {
          skillDimension: 'RECALL',
          attempts: hasData ? 4 : 0,
          correct: hasData ? 3 : 0,
          accuracy: hasData ? 0.75 : 0,
          averageResponseTimeMs: hasData ? 3200 : null,
          hintsUsed: hasData ? 1 : 0,
        },
      ],
      byDuration: [5, 10, 15].map((targetDurationMinutes) => ({
        targetDurationMinutes,
        started: targetDurationMinutes === 10 && hasData ? 2 : 0,
        completed: targetDurationMinutes === 10 && hasData ? 1 : 0,
        completionRate: targetDurationMinutes === 10 && hasData ? 0.5 : 0,
      })),
      byDecisionSource: ['AI', 'RULE'].map((source) => ({
        source,
        interventions: source === 'AI' && hasData ? 1 : 0,
        retestAttempts: source === 'AI' && hasData ? 1 : 0,
        successfulRetests: source === 'AI' && hasData ? 1 : 0,
        retestSuccessRate: source === 'AI' && hasData ? 1 : 0,
      })),
      retention: {
        nextDay: {
          followUps: hasData ? 1 : 0,
          correct: hasData ? 1 : 0,
          accuracy: hasData ? 1 : 0,
        },
        sevenDay: { followUps: 0, correct: 0, accuracy: 0 },
      },
      trend: hasData
        ? [
            {
              bucket: '2026-07-23',
              answers: 4,
              correctAnswers: 3,
              accuracy: 0.75,
              averageResponseTimeMs: 3200,
              hintsUsed: 1,
            },
          ]
        : [],
    };
  }

  getAdminOverview(query: AnalyticsDateRangeQueryDto) {
    resolveAnalyticsDateRange(query, new Date('2026-07-24T00:00:00Z'));
    return {
      users: 4,
      activeUsers: 2,
      articles: 3,
      publishedArticles: 1,
      savedVocabulary: 5,
      completedSessions: 2,
    };
  }

  getAdminContentAnalytics(query: AdminContentAnalyticsQueryDto) {
    resolveAnalyticsDateRange(query, new Date('2026-07-24T00:00:00Z'));
    if (query.categoryId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') {
      return {
        topArticles: [
          {
            articleId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            title: 'Archived history',
            slug: 'archived-history',
            status: 'ARCHIVED',
            category: 'History',
            openedCount: 2,
            completedCount: 1,
            savedVocabularyCount: 1,
            completedQuizSessions: 1,
          },
        ],
        completionRates: [],
        termSaveCounts: [],
        quizPerformance: [],
      };
    }
    return {
      topArticles: [],
      completionRates: [],
      termSaveCounts: [],
      quizPerformance: [],
    };
  }

  getAdminUserAnalytics(query: AdminUserAnalyticsQueryDto) {
    resolveAnalyticsDateRange(query, new Date('2026-07-24T00:00:00Z'));
    return {
      registrationsTrend: [],
      activeLearners: query.status === 'ACTIVE' ? 2 : 0,
      retentionProxy: {
        firstWindowActive: 0,
        secondWindowActive: 0,
        retainedUsers: 0,
        rate: 0,
      },
      learningDistribution: {
        inactive: 0,
        readingOnly: 0,
        vocabularyOnly: 0,
        quizOnly: 0,
        multiActivity: 0,
      },
    };
  }
}

describe('Analytics APIs (e2e)', () => {
  let app: INestApplication<App>;
  let analytics: InMemoryAnalyticsService;

  beforeAll(async () => {
    analytics = new InMemoryAnalyticsService();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(LearnerAnalyticsService)
      .useValue(analytics)
      .overrideProvider(ReviewAnalyticsService)
      .useValue(analytics)
      .overrideProvider(AdminAnalyticsService)
      .useValue(analytics)
      .overrideGuard(JwtAuthGuard)
      .useClass(AnalyticsAuthGuard)
      .compile();
    app = module.createNestApplication<App>();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('documents bearer auth, errors, filters, and aggregate-only schemas', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swagger = JSON.parse(response.text) as AnalyticsSwaggerDocument;
    const overview = swagger.paths['/api/v1/analytics/me/overview'].get;
    const vocabulary = swagger.paths['/api/v1/analytics/me/vocabulary'].get;
    const quizzes = swagger.paths['/api/v1/analytics/me/quizzes'].get;
    const reviews = swagger.paths['/api/v1/analytics/me/reviews'].get;
    const adminOverview = swagger.paths['/api/v1/admin/analytics/overview'].get;
    const adminContent = swagger.paths['/api/v1/admin/analytics/content'].get;

    expect(overview.security).toContainEqual({ BearerAuth: [] });
    expect(vocabulary.security).toContainEqual({ BearerAuth: [] });
    expect(reviews.security).toContainEqual({ BearerAuth: [] });
    expect(adminOverview.security).toContainEqual({ BearerAuth: [] });
    expect(Object.keys(adminOverview.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403']),
    );
    expect(Object.keys(overview.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401']),
    );
    expect(
      vocabulary.parameters.find(({ name }) => name === 'groupBy')?.schema,
    ).toMatchObject({ enum: ['DAY', 'WEEK', 'MONTH'] });
    expect(
      Object.keys(
        swagger.components.schemas.AnalyticsOverviewDataDto.properties,
      ),
    ).toEqual([
      'savedVocabulary',
      'dueToday',
      'mastered',
      'articlesCompleted',
      'quizAccuracy',
      'sessions',
    ]);
    expect(
      Object.keys(swagger.components.schemas.QuizAnalyticsDataDto.properties),
    ).toEqual([
      'sessions',
      'accuracy',
      'averageScore',
      'byQuestionType',
      'trend',
    ]);
    expect(
      Object.keys(swagger.components.schemas.ReviewAnalyticsDataDto.properties),
    ).toEqual([
      'sessionsStarted',
      'sessionsCompleted',
      'sessionsAbandoned',
      'completionRate',
      'answers',
      'correctAnswers',
      'accuracy',
      'averageResponseTimeMs',
      'hintsUsed',
      'sameSessionRetest',
      'bySkill',
      'byDuration',
      'byDecisionSource',
      'retention',
      'trend',
    ]);
    expect(
      Object.keys(
        swagger.components.schemas.AdminAnalyticsOverviewDataDto.properties,
      ),
    ).toEqual([
      'users',
      'activeUsers',
      'articles',
      'publishedArticles',
      'savedVocabulary',
      'completedSessions',
    ]);
    expect(
      Object.keys(
        swagger.components.schemas.AdminContentAnalyticsDataDto.properties,
      ),
    ).toEqual([
      'topArticles',
      'completionRates',
      'termSaveCounts',
      'quizPerformance',
    ]);
    expect(
      quizzes.parameters.find(({ name }) => name === 'articleId'),
    ).toBeDefined();
    expect(
      adminContent.parameters.find(({ name }) => name === 'categoryId'),
    ).toBeDefined();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/me/overview')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/analytics/me/vocabulary')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/analytics/me/reading')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/analytics/me/quizzes')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/analytics/me/reviews')
      .expect(401);
    for (const path of [
      '/api/v1/admin/analytics/overview',
      '/api/v1/admin/analytics/content',
      '/api/v1/admin/analytics/users',
    ]) {
      await request(app.getHttpServer()).get(path).expect(401);
    }
  });

  it('returns complete zero-data responses', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/me/overview')
      .set('Authorization', 'Bearer empty')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          data: {
            savedVocabulary: 0,
            dueToday: 0,
            mastered: 0,
            articlesCompleted: 0,
            quizAccuracy: 0,
            sessions: 0,
          },
        });
      });
  });

  it('uses only the authenticated user identity for USER and ADMIN callers', async () => {
    const userA = await request(app.getHttpServer())
      .get('/api/v1/analytics/me/vocabulary')
      .set('Authorization', 'Bearer user-a')
      .expect(200);
    const userB = await request(app.getHttpServer())
      .get('/api/v1/analytics/me/vocabulary')
      .set('Authorization', 'Bearer user-b')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/analytics/me/overview')
      .set('Authorization', 'Bearer admin')
      .expect(200);

    expect(userA.body.data.totals.total).toBe(6);
    expect(userB.body.data.totals.total).toBe(2);
    expect(analytics.calls).toEqual(
      expect.arrayContaining([
        { operation: 'vocabulary', userId: 'user-a-id' },
        { operation: 'vocabulary', userId: 'user-b-id' },
        { operation: 'overview', userId: 'admin-id' },
      ]),
    );
  });

  it('scopes reading, quiz, and review analytics to the authenticated learner', async () => {
    const reading = await request(app.getHttpServer())
      .get('/api/v1/analytics/me/reading')
      .set('Authorization', 'Bearer user-a')
      .expect(200);
    const emptyReading = await request(app.getHttpServer())
      .get('/api/v1/analytics/me/reading')
      .set('Authorization', 'Bearer empty')
      .expect(200);
    const quizzes = await request(app.getHttpServer())
      .get('/api/v1/analytics/me/quizzes')
      .set('Authorization', 'Bearer user-a')
      .expect(200);
    const emptyQuizzes = await request(app.getHttpServer())
      .get('/api/v1/analytics/me/quizzes')
      .set('Authorization', 'Bearer empty')
      .expect(200);
    const reviews = await request(app.getHttpServer())
      .get('/api/v1/analytics/me/reviews')
      .set('Authorization', 'Bearer user-a')
      .expect(200);
    const emptyReviews = await request(app.getHttpServer())
      .get('/api/v1/analytics/me/reviews')
      .set('Authorization', 'Bearer empty')
      .expect(200);

    expect(reading.body.data.opened).toBe(2);
    expect(emptyReading.body.data.opened).toBe(0);
    expect(quizzes.body.data.sessions).toBe(2);
    expect(emptyQuizzes.body.data.sessions).toBe(0);
    expect(reviews.body.data.sameSessionRetest.successRate).toBe(1);
    expect(emptyReviews.body.data.averageResponseTimeMs).toBeNull();
    expect(analytics.calls).toEqual(
      expect.arrayContaining([
        { operation: 'reading', userId: 'user-a-id' },
        { operation: 'reading', userId: 'empty-id' },
        { operation: 'quizzes', userId: 'user-a-id' },
        { operation: 'quizzes', userId: 'empty-id' },
        { operation: 'reviews', userId: 'user-a-id' },
        { operation: 'reviews', userId: 'empty-id' },
      ]),
    );
  });

  it('allows ADMIN aggregate analytics and forbids normal users without PII', async () => {
    for (const path of [
      '/api/v1/admin/analytics/overview',
      '/api/v1/admin/analytics/content',
      '/api/v1/admin/analytics/users',
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', 'Bearer user-a')
        .expect(403);
    }
    const overview = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/overview')
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(overview.body.data).toEqual({
      users: 4,
      activeUsers: 2,
      articles: 3,
      publishedArticles: 1,
      savedVocabulary: 5,
      completedSessions: 2,
    });
    expect(JSON.stringify(overview.body)).not.toMatch(
      /email|displayName|password|personalNote|userAnswer/i,
    );
  });

  it('applies admin category/status filters and retains archived history', async () => {
    const content = await request(app.getHttpServer())
      .get(
        '/api/v1/admin/analytics/content?' +
          'categoryId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      )
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(content.body.data.topArticles).toEqual([
      expect.objectContaining({
        status: 'ARCHIVED',
        category: 'History',
      }),
    ]);

    const users = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/users?status=ACTIVE')
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(users.body.data.activeLearners).toBe(2);
    expect(content.text + users.text).not.toMatch(
      /email|displayName|password|personalNote|userAnswer/i,
    );
  });

  it('rejects invalid and non-half-open ranges before returning analytics', async () => {
    await request(app.getHttpServer())
      .get(
        '/api/v1/analytics/me/overview?from=2026-07-02T00:00:00Z&to=2026-07-01T00:00:00Z',
      )
      .set('Authorization', 'Bearer user-a')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/analytics/me/vocabulary?groupBy=quarter')
      .set('Authorization', 'Bearer user-a')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/analytics/me/quizzes?articleId=bad')
      .set('Authorization', 'Bearer user-a')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/content?categoryId=bad')
      .set('Authorization', 'Bearer admin')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/users?status=DELETED')
      .set('Authorization', 'Bearer admin')
      .expect(400);
  });

  it('exposes read-only GET endpoints only', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/analytics/me/overview')
      .set('Authorization', 'Bearer user-a')
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/analytics/me/vocabulary')
      .set('Authorization', 'Bearer user-a')
      .expect(404);
    for (const path of [
      '/api/v1/admin/analytics/overview',
      '/api/v1/admin/analytics/content',
      '/api/v1/admin/analytics/users',
    ]) {
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', 'Bearer admin')
        .expect(404);
    }
  });
});
