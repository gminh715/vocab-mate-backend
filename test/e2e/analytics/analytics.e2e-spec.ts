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
import {
  AdminContentAnalyticsQueryDto,
  AdminUserAnalyticsQueryDto,
  AnalyticsDateRangeQueryDto,
  resolveAnalyticsDateRange,
} from '../../../src/modules/analytics/dto/analytics-query.dto';
import { AdminAnalyticsService } from '../../../src/modules/analytics/services/admin-analytics.service';
import { LearnerAnalyticsService } from '../../../src/modules/analytics/services/learner-analytics.service';
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
    return {
      savedVocabulary: userId === 'empty-id' ? 0 : 6,
      articlesCompleted: userId === 'empty-id' ? 0 : 3,
    };
  }

  getVocabularyAnalytics(userId: string, query: AnalyticsDateRangeQueryDto) {
    resolveAnalyticsDateRange(query, new Date('2026-07-24T00:00:00Z'));
    this.calls.push({ operation: 'vocabulary', userId });
    return {
      totals: { total: userId === 'user-a-id' ? 6 : 2 },
      byCefr: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((cefrLevel) => ({
        cefrLevel,
        count: 1,
      })),
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

  getAdminOverview(query: AnalyticsDateRangeQueryDto) {
    resolveAnalyticsDateRange(query, new Date('2026-07-24T00:00:00Z'));
    return {
      users: 4,
      activeUsers: 2,
      articles: 3,
      publishedArticles: 1,
      savedVocabulary: 5,
    };
  }

  getAdminContentAnalytics(query: AdminContentAnalyticsQueryDto) {
    resolveAnalyticsDateRange(query, new Date('2026-07-24T00:00:00Z'));
    return {
      topArticles:
        query.categoryId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          ? [
              {
                articleId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                title: 'Archived history',
                slug: 'archived-history',
                status: 'ARCHIVED',
                category: 'History',
                openedCount: 2,
                completedCount: 1,
                savedVocabularyCount: 1,
              },
            ]
          : [],
      completionRates: [],
      termSaveCounts: [],
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

  it('documents the remaining learner and admin analytics endpoints', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swagger = JSON.parse(response.text) as AnalyticsSwaggerDocument;
    const overview = swagger.paths['/api/v1/analytics/me/overview'].get;
    const vocabulary = swagger.paths['/api/v1/analytics/me/vocabulary'].get;
    const adminOverview = swagger.paths['/api/v1/admin/analytics/overview'].get;

    expect(overview.security).toContainEqual({ BearerAuth: [] });
    expect(vocabulary.security).toContainEqual({ BearerAuth: [] });
    expect(adminOverview.security).toContainEqual({ BearerAuth: [] });
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
    ).toEqual(['savedVocabulary', 'articlesCompleted']);
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
    ]);
  });

  it('requires authentication for every analytics endpoint', async () => {
    for (const path of [
      '/api/v1/analytics/me/overview',
      '/api/v1/analytics/me/vocabulary',
      '/api/v1/analytics/me/reading',
      '/api/v1/admin/analytics/overview',
      '/api/v1/admin/analytics/content',
      '/api/v1/admin/analytics/users',
    ]) {
      await request(app.getHttpServer()).get(path).expect(401);
    }
  });

  it('returns complete zero-data learner responses', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/me/overview')
      .set('Authorization', 'Bearer empty')
      .expect(200)
      .expect({
        success: true,
        data: { savedVocabulary: 0, articlesCompleted: 0 },
      });
  });

  it('uses only the authenticated user identity', async () => {
    const userA = await request(app.getHttpServer())
      .get('/api/v1/analytics/me/vocabulary')
      .set('Authorization', 'Bearer user-a')
      .expect(200);
    const userB = await request(app.getHttpServer())
      .get('/api/v1/analytics/me/vocabulary')
      .set('Authorization', 'Bearer user-b')
      .expect(200);
    const reading = await request(app.getHttpServer())
      .get('/api/v1/analytics/me/reading')
      .set('Authorization', 'Bearer user-a')
      .expect(200);

    expect(userA.body.data.totals.total).toBe(6);
    expect(userB.body.data.totals.total).toBe(2);
    expect(reading.body.data.opened).toBe(2);
    expect(analytics.calls).toEqual(
      expect.arrayContaining([
        { operation: 'vocabulary', userId: 'user-a-id' },
        { operation: 'vocabulary', userId: 'user-b-id' },
        { operation: 'reading', userId: 'user-a-id' },
      ]),
    );
  });

  it('allows ADMIN aggregate analytics and forbids normal users', async () => {
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
    });
    expect(JSON.stringify(overview.body)).not.toMatch(
      /email|displayName|password/i,
    );
  });

  it('applies admin category and status filters', async () => {
    const content = await request(app.getHttpServer())
      .get(
        '/api/v1/admin/analytics/content?' +
          'categoryId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      )
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(content.body.data.topArticles).toEqual([
      expect.objectContaining({ status: 'ARCHIVED', category: 'History' }),
    ]);

    const users = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/users?status=ACTIVE')
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(users.body.data.activeLearners).toBe(2);
  });

  it('rejects invalid ranges and filters', async () => {
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
      .get('/api/v1/admin/analytics/content?categoryId=bad')
      .set('Authorization', 'Bearer admin')
      .expect(400);
  });
});
