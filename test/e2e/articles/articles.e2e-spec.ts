import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { configureApp, setupSwagger } from '../../../src/app.setup';
import { PrismaService } from '../../../src/database/prisma.service';
import type {
  PublicArticleCardRecord,
  PublicArticleDetailRecord,
} from '../../../src/modules/articles/repositories/articles.repository';
import { ArticlesRepository } from '../../../src/modules/articles/repositories/articles.repository';
import { InMemoryArticlesRepository } from '../../support/in-memory-articles.repository';

interface SuccessBody<T> {
  success: true;
  data: T;
}

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: string[] };
}

const responseBody = <T>(response: { text: string }): T =>
  JSON.parse(response.text) as T;

describe('Articles public APIs (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(ArticlesRepository)
      .useValue(new InMemoryArticlesRepository())
      .compile();

    app = moduleFixture.createNestApplication<App>();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('publishes both operations as public with complete parameters and responses', async () => {
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
            parameters: Array<{
              name: string;
              required: boolean;
              schema: { enum?: string[]; maximum?: number };
            }>;
            responses: Record<string, object>;
            security?: Array<Record<string, string[]>>;
          }
        >
      >;
      components: {
        schemas: Record<
          string,
          { properties?: Record<string, unknown>; required?: string[] }
        >;
      };
    }>(response);
    const list = swagger.paths['/api/v1/articles'].get;
    const detail = swagger.paths['/api/v1/articles/{slug}'].get;

    expect(list.operationId).toBe('getArticles');
    expect(list.parameters.map(({ name }) => name)).toEqual([
      'page',
      'limit',
      'q',
      'categorySlug',
      'cefrLevel',
      'sort',
    ]);
    expect(
      list.parameters
        .filter(({ required }) => required)
        .map(({ name }) => name),
    ).toEqual(['page', 'limit', 'sort']);
    expect(
      list.parameters.find(({ name }) => name === 'limit')?.schema.maximum,
    ).toBe(100);
    expect(
      list.parameters.find(({ name }) => name === 'sort')?.schema.enum,
    ).toEqual(['newest', 'oldest']);
    expect(Object.keys(list.responses)).toEqual(
      expect.arrayContaining(['200', '400', '500']),
    );
    expect(detail.operationId).toBe('getArticlesBySlug');
    expect(detail.parameters.map(({ name }) => name)).toContain('slug');
    expect(Object.keys(detail.responses)).toEqual(
      expect.arrayContaining(['200', '400', '404', '500']),
    );
    expect(list.security).toBeUndefined();
    expect(detail.security).toBeUndefined();
    expect(
      Object.keys(
        swagger.components.schemas['ArticleListDataDto'].properties ?? {},
      ),
    ).toEqual(['items', 'meta']);
    expect(
      Object.keys(
        swagger.components.schemas['ArticleDetailDataDto'].properties ?? {},
      ),
    ).toEqual(['article', 'category', 'quizCount']);
    expect(
      swagger.components.schemas['PublicArticleCardDto'].properties,
    ).not.toHaveProperty('contentHtml');
    expect(
      swagger.components.schemas['PublicArticleMetadataDto'].properties,
    ).not.toHaveProperty('contentHtml');
  });

  it('ART-001 is public, returns only PUBLISHED cards, and never returns contentHtml', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/articles?page=1&limit=20&sort=newest')
      .expect(200);
    const body = responseBody<
      SuccessBody<{
        items: PublicArticleCardRecord[];
        meta: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>
    >(response);

    expect(body.data.items.map(({ id }) => id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222',
    ]);
    expect(body.data.meta).toEqual({
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
    });
    expect(JSON.stringify(body)).not.toContain('Draft Article');
    expect(JSON.stringify(body)).not.toContain('Archived Article');
    expect(JSON.stringify(body)).not.toContain('contentHtml');
    expect(JSON.stringify(body)).not.toContain('Private reader payload');
  });

  it('applies combined search, category, and CEFR filters', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/articles?page=1&limit=20&sort=newest&q=%20collaboration%20&categorySlug=TECHNOLOGY&cefrLevel=B1',
      )
      .expect(200);
    const body = responseBody<
      SuccessBody<{
        items: PublicArticleCardRecord[];
        meta: { total: number };
      }>
    >(response);

    expect(body.data.items.map(({ slug }) => slug)).toEqual([
      'the-modern-classroom',
    ]);
    expect(body.data.meta.total).toBe(1);
  });

  it('paginates with stable oldest ordering', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/articles?page=2&limit=1&sort=oldest')
      .expect(200);
    const body = responseBody<
      SuccessBody<{
        items: PublicArticleCardRecord[];
        meta: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>
    >(response);

    expect(body.data.items.map(({ id }) => id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(body.data.meta).toEqual({
      page: 2,
      limit: 1,
      total: 3,
      totalPages: 3,
    });
  });

  it('ART-002 normalizes the slug and returns metadata, category, and published quiz count', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/articles/HOW-TECHNOLOGY-CHANGES-LEARNING')
      .expect(200);
    const body = responseBody<SuccessBody<PublicArticleDetailRecord>>(response);

    expect(body.data).toMatchObject({
      article: {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'how-technology-changes-learning',
        status: 'PUBLISHED',
      },
      category: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'Technology',
        slug: 'technology',
      },
      quizCount: 2,
    });
    expect(JSON.stringify(body)).not.toContain('contentHtml');
    expect(JSON.stringify(body)).not.toContain('Private reader payload');
  });

  it.each(['draft-article', 'archived-article', 'unknown-article'])(
    'returns the same 404 for %s',
    async (slug) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/articles/${slug}`)
        .expect(404);

      expect(responseBody<ErrorBody>(response)).toEqual({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Article not found' },
      });
    },
  );

  it.each([
    '/api/v1/articles',
    '/api/v1/articles?page=1&limit=101&sort=newest',
    '/api/v1/articles?page=1&limit=20&sort=title',
    '/api/v1/articles?page=1&limit=20&sort=newest&cefrLevel=B3',
    '/api/v1/articles?page=1&limit=20&sort=newest&q=%20%20',
    '/api/v1/articles/not_valid',
  ])(
    'returns the standard 400 envelope for invalid request %s',
    async (url) => {
      const response = await request(app.getHttpServer()).get(url).expect(400);

      expect(responseBody<ErrorBody>(response)).toMatchObject({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Validation failed' },
      });
    },
  );
});
