import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { UserRole } from '../generated/prisma/enums';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from '../src/common/interceptors/success-response.interceptor';
import { configureApp } from '../src/app.setup';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { AdminNewsController } from '../src/modules/news-ingestion/admin-news.controller';
import { NewsIngestionService } from '../src/modules/news-ingestion/news-ingestion.service';

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

describe('Admin news ingestion API (e2e)', () => {
  let app: INestApplication<App>;
  const service = {
    search: jest.fn(),
    sync: jest.fn(),
  };

  beforeAll(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [AdminNewsController],
      providers: [
        { provide: NewsIngestionService, useValue: service },
        JwtAuthGuard,
        RolesGuard,
        SuccessResponseInterceptor,
        ApiExceptionFilter,
      ],
    });
    const module: TestingModule = await moduleBuilder
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderAuthGuard)
      .compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());

  afterAll(async () => app.close());

  it('rejects unauthenticated and non-admin search and sync', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/news/search')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/news/search')
      .set('Authorization', 'Bearer user')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/admin/news/sync')
      .send({
        section: 'technology',
        defaultCategoryId: '550e8400-e29b-41d4-a716-446655440000',
      })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/admin/news/sync')
      .set('Authorization', 'Bearer user')
      .send({
        section: 'technology',
        defaultCategoryId: '550e8400-e29b-41d4-a716-446655440000',
      })
      .expect(403);
    expect(service.search).not.toHaveBeenCalled();
    expect(service.sync).not.toHaveBeenCalled();
  });

  it('validates and maps an admin search through the success envelope', async () => {
    service.search.mockResolvedValue({
      totalArticles: 0,
      articles: [],
    });

    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/admin/news/search?q=%20technology%20&section=Technology&fromDate=2026-07-01&toDate=2026-07-31&page=2&pageSize=5&orderBy=relevance',
      )
      .set('Authorization', 'Bearer admin')
      .expect(200);

    expect(service.search).toHaveBeenCalledWith({
      q: 'technology',
      section: 'technology',
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
      page: 2,
      pageSize: 5,
      orderBy: 'relevance',
    });
    expect(response.body).toEqual({
      success: true,
      data: { totalArticles: 0, articles: [] },
    });
  });

  it('rejects invalid query and missing sync discovery criteria', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/news/search?q=test&pageSize=11')
      .set('Authorization', 'Bearer admin')
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/admin/news/sync')
      .set('Authorization', 'Bearer admin')
      .send({
        defaultCategoryId: '550e8400-e29b-41d4-a716-446655440000',
      })
      .expect(400);
    expect(service.search).not.toHaveBeenCalled();
    expect(service.sync).not.toHaveBeenCalled();
  });

  it('authorizes, validates, and envelopes an admin Guardian sync', async () => {
    service.sync.mockResolvedValue({
      counts: {
        discovered: 1,
        imported: 1,
        skippedDuplicate: 0,
        failed: 0,
      },
      items: [
        {
          status: 'imported',
          externalId: 'technology/2026/jul/30/story',
          title: 'Story',
          canonicalUrl:
            'https://www.theguardian.com/technology/2026/jul/30/story',
          articleId: 'article-id',
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/news/sync')
      .set('Authorization', 'Bearer admin')
      .send({
        section: 'Technology',
        fromDate: '2026-07-01',
        toDate: '2026-07-31',
        defaultCategoryId: '550e8400-e29b-41d4-a716-446655440000',
        pageSize: 5,
        orderBy: 'oldest',
      })
      .expect(201);

    expect(service.sync).toHaveBeenCalledWith('admin-id', {
      section: 'technology',
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
      defaultCategoryId: '550e8400-e29b-41d4-a716-446655440000',
      pageSize: 5,
      orderBy: 'oldest',
    });
    const responseBody = response.body as unknown;
    expect(responseBody).toEqual({
      success: true,
      data: {
        counts: {
          discovered: 1,
          imported: 1,
          skippedDuplicate: 0,
          failed: 0,
        },
        items: [
          {
            status: 'imported',
            externalId: 'technology/2026/jul/30/story',
            title: 'Story',
            canonicalUrl:
              'https://www.theguardian.com/technology/2026/jul/30/story',
            articleId: 'article-id',
          },
        ],
      },
    });
  });

  it('rejects an invalid date range before the service boundary', async () => {
    await request(app.getHttpServer())
      .get(
        '/api/v1/admin/news/search?q=test&fromDate=2026-08-01&toDate=2026-07-01',
      )
      .set('Authorization', 'Bearer admin')
      .expect(400);
    expect(service.search).not.toHaveBeenCalled();
  });
});
